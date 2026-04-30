// =====================================================================
// synthesize-memory Edge Function
// =====================================================================
// POST /functions/v1/synthesize-memory
//
// 2 modos (igual que insight-generator):
//   1. JWT de usuario       → procesa a ese usuario.
//   2. SERVICE_ROLE_KEY     → modo cron, procesa TODOS los profiles activos.
//
// Lee actividad reciente del usuario (events + chat + transactions),
// le pide al LLM que extraiga 3-5 "hechos durables" y hace UPSERT en
// `user_memory` por (user_id, key).
//
// Programado por pg_cron 1× semana, lunes 06:00 (ver migración cron_setup).
// =====================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { chatCompletion } from "../_shared/openai.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export const MEMORY_PROMPT_VERSION = "memory.v1";

// Mínimo razonable: si el usuario tiene menos actividad que esto, no
// vale la pena llamar al LLM (gastamos tokens analizando aire).
const MIN_ACTIVITY_THRESHOLD = 5; // suma de events + messages + transactions

type Fact = {
  key: string;
  kind?: "habit" | "goal" | "preference" | "risk";
  summary: string;
  confidence?: number;
};

const SYSTEM_PROMPT = [
  "Eres un sintetizador de memoria financiera del usuario.",
  "A partir de su actividad reciente (eventos, chats, transacciones), extrae HECHOS DURABLES.",
  "",
  "Un hecho durable es algo que describe su comportamiento, metas o preferencias y que",
  "seguirá siendo cierto en próximos días/semanas. NO incluyas eventos puntuales.",
  "",
  "REGLAS:",
  "- Extrae de 3 a 5 hechos. Si la actividad es muy poca, devuelve menos (incluso 0).",
  "- Formato JSON estricto: { \"facts\": [ { \"key\": string, \"kind\": string, \"summary\": string, \"confidence\": number } ] }",
  "- 'kind' debe ser uno de: 'habit', 'goal', 'preference', 'risk'.",
  "- 'key' jerárquica con dot-notation: 'habit.almuerzos_corrientazo', 'goal.ahorro_moto', etc.",
  "- 'summary' debe ser una frase corta en español, sin emojis.",
  "- 'confidence' entre 0.0 y 1.0 según qué tan claro está el patrón.",
  "- SOLO responde con el JSON. No incluyas explicaciones ni markdown.",
].join("\n");

async function processOneUser(client: SupabaseClient, userId: string): Promise<{ user_id: string; facts_inserted: number; skipped?: string; error?: string }> {
  // 1. Cargar actividad
  const [{ data: events }, { data: messages }, { data: transactions }] = await Promise.all([
    client.from("user_events").select("event_type, event_data, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    client.from("chat_messages").select("role, content").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    client.from("transactions").select("merchant, amount, category, date_string").eq("user_id", userId).order("date_string", { ascending: false }).limit(50),
  ]);

  const activityCount = (events?.length ?? 0) + (messages?.length ?? 0) + (transactions?.length ?? 0);
  if (activityCount < MIN_ACTIVITY_THRESHOLD) {
    return { user_id: userId, facts_inserted: 0, skipped: `low_activity (${activityCount} items)` };
  }

  // 2. Armar contexto
  const contextStr = JSON.stringify({
    events: (events ?? []).map(e => `${e.event_type} (${new Date(e.created_at as string).toLocaleDateString("es-CO")})`),
    messages: (messages ?? []).slice().reverse().map(m => `${m.role}: ${(m.content as string).slice(0, 200)}`),
    transactions: (transactions ?? []).map(t => `${t.merchant} (${t.amount} ${t.category}) en ${t.date_string}`),
  });

  // 3. LLM
  const completion = await chatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Contexto reciente del usuario:\n${contextStr}` },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
    max_tokens: 600,
  });

  const responseText = completion.choices[0]?.message?.content ?? "{}";

  // 4. Parse defensivo
  let parsed: { facts?: Fact[] };
  try {
    parsed = JSON.parse(responseText);
  } catch (e) {
    return { user_id: userId, facts_inserted: 0, error: `json_parse: ${e instanceof Error ? e.message : String(e)}` };
  }
  const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
  const validFacts = facts.filter(f =>
    typeof f?.key === "string" && f.key.length > 0 &&
    typeof f?.summary === "string" && f.summary.length > 0
  );
  if (validFacts.length === 0) {
    return { user_id: userId, facts_inserted: 0, skipped: "no_valid_facts" };
  }

  // 5. UPSERT en user_memory
  const memories = validFacts.map(f => ({
    user_id: userId,
    kind: f.kind ?? "habit",
    key: f.key,
    summary: f.summary,
    confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.5,
    last_seen_at: new Date().toISOString(),
  }));

  const { error: memErr } = await client.from("user_memory").upsert(memories, { onConflict: "user_id,key" });
  if (memErr) return { user_id: userId, facts_inserted: 0, error: memErr.message };

  return { user_id: userId, facts_inserted: memories.length };
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const isCronCall = authHeader === `Bearer ${SERVICE_ROLE_KEY}`;

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (isCronCall) {
      const { data: profiles, error: pErr } = await serviceClient.from("profiles").select("id");
      if (pErr) return errorResponse(`profiles: ${pErr.message}`, 500);

      const results = [];
      for (const p of profiles ?? []) {
        try {
          results.push(await processOneUser(serviceClient, p.id as string));
        } catch (e) {
          results.push({ user_id: p.id as string, facts_inserted: 0, error: e instanceof Error ? e.message : String(e) });
        }
      }
      const totalFacts = results.reduce((acc, r) => acc + r.facts_inserted, 0);
      const totalErrors = results.filter(r => r.error).length;
      const totalSkipped = results.filter(r => r.skipped).length;
      return jsonResponse({
        mode: "cron",
        version: MEMORY_PROMPT_VERSION,
        users_processed: results.length,
        facts_inserted: totalFacts,
        skipped: totalSkipped,
        errors: totalErrors,
        results,
      });
    }

    if (!authHeader) return errorResponse("Authorization header is required", 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error: authErr } = await userClient.auth.getUser();
    if (authErr || !u?.user) return errorResponse("Invalid auth token", 401);

    const result = await processOneUser(serviceClient, u.user.id);
    return jsonResponse({
      mode: "user",
      version: MEMORY_PROMPT_VERSION,
      ...result,
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
