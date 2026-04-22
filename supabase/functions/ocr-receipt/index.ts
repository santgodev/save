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
//   3. OpenAI structures the raw text into { amount, merchant, date, items }.
//   4. Emit a `scanner.scanned` user_events row.
//   5. If auto_register, call the existing register_expense RPC.
// =====================================================================

import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { chatCompletion } from "../_shared/openai.ts";

type StructuredReceipt = {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  items?: Array<{ name: string; amount: number }>;
};

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

async function structureReceipt(rawText: string): Promise<StructuredReceipt> {
  const completion = await chatCompletion({
    messages: [
      {
        role: "system",
        content:
          "Eres un parser de recibos colombianos. Devuelve SOLO JSON con la forma " +
          "{\"amount\": number, \"merchant\": string, \"date\": string ISO, \"items\": [{\"name\": string, \"amount\": number}]}. " +
          "Si un campo no aparece, usa null. Usa punto decimal. No expliques nada, solo el JSON.",
      },
      { role: "user", content: rawText.slice(0, 4000) },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 400,
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content) as StructuredReceipt;
  } catch {
    throw new Error("OpenAI returned non-JSON receipt data");
  }
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
      event_data: { error: e instanceof Error ? e.message : String(e) },
      source: "edge_fn",
    });
    return errorResponse(e instanceof Error ? e.message : "OCR failed", 500);
  }

  await serviceClient.from("user_events").insert({
    user_id: user.id,
    event_type: "scanner.scanned",
    event_data: {
      merchant: parsed.merchant,
      amount: parsed.amount,
      date: parsed.date,
      auto_register: !!auto_register,
    },
    source: "edge_fn",
  });

  let registered: unknown = null;
  if (auto_register && category && parsed.amount && parsed.amount > 0) {
    const { data, error } = await userClient.rpc("register_expense", {
      p_user_id:  user.id,
      p_merchant: parsed.merchant ?? "Recibo",
      p_amount:   parsed.amount,
      p_category: category,
      p_icon:     "receipt-text",
      p_metadata: { source: "ocr", date: parsed.date },
    });
    if (error) {
      return errorResponse(`Register failed: ${error.message}`, 500, { parsed });
    }
    registered = data;
  }

  return jsonResponse({ parsed, registered });
});
