// =====================================================================
// ocr-receipt Edge Function
// =====================================================================
// POST /functions/v1/ocr-receipt
// Body: { image_base64: string, category?: string, auto_register?: boolean }
// Auth: Bearer <user JWT>
//
// Replaces the previous client-side pipeline in src/screens/Scanner.tsx
// which shipped the Google Vision + OpenAI keys to the app.
//
// Flow:
//   1. Auth user.
//   2. Google Vision text detection.
//   3. OpenAI structures the raw text into
//      { amount, merchant, date, items, confidence, needs_review }.
//   4. Sanitize: si OpenAI metió "Desconocido"/"Factura Escaneada"/"Recibo"
//      como merchant → forzamos null y bajamos confidence a "low".
//   5. Emit `scanner.scanned` event con confidence + needs_review.
//   6. Si auto_register pero el ticket viene débil (merchant null o
//      confidence low), DEVOLVEMOS sin registrar y `needs_review:true`
//      para que el cliente le pida al usuario que confirme/escriba a mano.
// =====================================================================

import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { chatCompletion } from "../_shared/openai.ts";

// Trazabilidad: si tocás el prompt, subí esta versión.
export const OCR_PROMPT_VERSION = "ocr.v2";

type Confidence = "high" | "medium" | "low";

type StructuredReceipt = {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  items?: Array<{ name: string; amount: number }>;
  confidence?: Confidence;
};

// Patrones genéricos que NO deben pasar como merchant. Si OpenAI o
// el parser inventa cualquiera de éstos, los reemplazamos por null
// y obligamos al cliente a pedirle al usuario que escriba el comercio.
const FORBIDDEN_MERCHANT_PATTERNS: RegExp[] = [
  /^desconocido$/i,
  /^factura\s+escaneada$/i,
  /^recibo$/i,
  /^sin\s+nombre$/i,
  /^n\/?a$/i,
  /^null$/i,
  /^undefined$/i,
  /^merchant$/i,
];

function isForbiddenMerchant(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length < 2) return true;
  return FORBIDDEN_MERCHANT_PATTERNS.some((rx) => rx.test(trimmed));
}

async function runVisionOCR(imageBase64: string): Promise<string> {
  const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!visionKey) throw new Error("GOOGLE_VISION_API_KEY not set");

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
        }],
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vision ${res.status}: ${text}`);
  }

  const json = await res.json();
  const raw = json?.responses?.[0]?.fullTextAnnotation?.text;
  if (!raw) throw new Error("No text detected on receipt");
  return String(raw);
}

// Prompt v2 — endurece el comportamiento sobre merchants:
// - PROHÍBE explícitamente devolver "Desconocido", "Factura Escaneada",
//   "Recibo", "Sin nombre". Si no se ve un comercio claro → null.
// - Pide un campo `confidence` ("high"|"medium"|"low") basado en qué
//   tan seguro está el modelo del merchant Y el monto.
// - Da ejemplos concretos colombianos para anclar el tono.
const SYSTEM_PROMPT_V2 = [
  "Eres un parser de recibos colombianos. Devuelves ÚNICAMENTE JSON válido.",
  "",
  "Forma exacta:",
  "{",
  "  \"amount\": number|null,",
  "  \"merchant\": string|null,",
  "  \"date\": string|null,           // ISO YYYY-MM-DD",
  "  \"items\": [{\"name\": string, \"amount\": number}],",
  "  \"confidence\": \"high\"|\"medium\"|\"low\"",
  "}",
  "",
  "REGLAS DE merchant (críticas):",
  "1. merchant = nombre real del comercio impreso en el ticket.",
  "   Ej: \"Tiendas ARA\", \"Jeronimo Martins Colombia SAS\", \"D1 Supermercado\",",
  "   \"OXXO\", \"Almacenes Éxito\", \"Carulla\", \"Rappi\", \"Domicilios.com\".",
  "2. PROHIBIDO devolver: \"Desconocido\", \"Factura Escaneada\", \"Recibo\",",
  "   \"Sin nombre\", \"N/A\", \"null\", o cualquier placeholder genérico.",
  "3. Si NO ves un nombre de comercio claro → merchant: null (no inventes).",
  "4. NO incluyas NIT, dirección, teléfono ni RUT en el merchant.",
  "",
  "REGLAS DE amount:",
  "5. amount = total final pagado, en pesos colombianos, sin separadores.",
  "   Ej: si el ticket dice \"$ 25.300\", devolvés 25300.",
  "6. Si NO ves un total claro → amount: null.",
  "",
  "REGLAS DE date:",
  "7. date = ISO YYYY-MM-DD. Si el ticket dice \"22/04/2026\" → \"2026-04-22\".",
  "8. Si no ves fecha → null.",
  "",
  "REGLAS DE confidence:",
  "9. \"high\"   = merchant Y amount son inequívocos.",
  "10. \"medium\" = uno de los dos requiere interpretación.",
  "11. \"low\"    = merchant null O amount null O ambos dudosos.",
  "",
  "No expliques. No agregues texto fuera del JSON. No uses markdown.",
].join("\n");

async function structureReceipt(rawText: string): Promise<StructuredReceipt> {
  const completion = await chatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT_V2 },
      { role: "user", content: rawText.slice(0, 4000) },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 500,
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: StructuredReceipt;
  try {
    parsed = JSON.parse(content) as StructuredReceipt;
  } catch {
    throw new Error("OpenAI returned non-JSON receipt data");
  }

  // Sanitización defensiva — el modelo todavía puede equivocarse y
  // meternos un placeholder. Si lo hace, lo neutralizamos acá ANTES
  // de devolver al cliente o de llamar register_expense.
  if (isForbiddenMerchant(parsed.merchant)) {
    parsed.merchant = null;
  }
  if (typeof parsed.amount !== "number" || parsed.amount <= 0) {
    parsed.amount = null;
  }

  // Reglas duras de confidence post-sanitizado:
  if (parsed.merchant == null || parsed.amount == null) {
    parsed.confidence = "low";
  } else if (!parsed.confidence) {
    parsed.confidence = "medium";
  }

  return parsed;
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { image_base64?: string; category?: string; auto_register?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { image_base64, category, auto_register } = body;
  if (!image_base64) return errorResponse("`image_base64` is required");

  let auth;
  try {
    auth = await authenticate(req);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unauthorized", 401);
  }

  const { user, userClient, serviceClient } = auth;

  let parsed: StructuredReceipt;
  try {
    const rawText = await runVisionOCR(image_base64);
    parsed = await structureReceipt(rawText);
  } catch (e) {
    await serviceClient.from("user_events").insert({
      user_id: user.id,
      event_type: "scanner.failed",
      event_data: {
        error: e instanceof Error ? e.message : String(e),
        prompt_version: OCR_PROMPT_VERSION,
      },
      source: "edge_fn",
    });
    return errorResponse(e instanceof Error ? e.message : "OCR failed", 500);
  }

  // needs_review = el cliente debería pedirle al usuario que confirme.
  const needsReview =
    parsed.merchant == null ||
    parsed.amount == null ||
    parsed.confidence === "low";

  await serviceClient.from("user_events").insert({
    user_id: user.id,
    event_type: "scanner.scanned",
    event_data: {
      merchant: parsed.merchant,
      amount: parsed.amount,
      date: parsed.date,
      confidence: parsed.confidence,
      needs_review: needsReview,
      auto_register: !!auto_register,
      prompt_version: OCR_PROMPT_VERSION,
    },
    source: "edge_fn",
  });

  // Si el ticket vino débil, NO auto_registramos — devolvemos al
  // cliente con needs_review:true y dejamos que el usuario decida.
  // Esto rompe el viejo bug donde se creaban tx con merchant
  // "Desconocido"/"Factura Escaneada" que después no se podían agrupar.
  let registered: unknown = null;
  let registerSkippedReason: string | null = null;

  if (auto_register && category && !needsReview) {
    const { data, error } = await userClient.rpc("register_expense", {
      p_user_id:  user.id,
      p_merchant: parsed.merchant!,    // garantizado no-null acá
      p_amount:   parsed.amount!,
      p_category: category,
      p_icon:     "receipt-text",
      p_metadata: {
        source: "ocr",
        date: parsed.date,
        confidence: parsed.confidence,
        prompt_version: OCR_PROMPT_VERSION,
      },
    });
    if (error) {
      return errorResponse(`Register failed: ${error.message}`, 500, { parsed });
    }
    registered = data;
  } else if (auto_register && needsReview) {
    registerSkippedReason = "low_confidence";
  } else if (auto_register && !category) {
    registerSkippedReason = "missing_category";
  }

  return jsonResponse({
    parsed,
    needs_review: needsReview,
    registered,
    register_skipped_reason: registerSkippedReason,
    prompt_version: OCR_PROMPT_VERSION,
  });
});
