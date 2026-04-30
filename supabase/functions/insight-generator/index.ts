// =====================================================================
// insight-generator Edge Function
// =====================================================================
// POST /functions/v1/insight-generator
//
// 2 modos:
//   1. Llamada con JWT de usuario     → procesa solo a ese usuario.
//   2. Llamada con SERVICE_ROLE_KEY   → modo cron, procesa TODOS los
//                                        profiles activos.
//
// Reglas determinísticas (no usa LLM, predecible y barato):
//   A. pocket_burn      — bolsillo en >=80% del plan (warning) o >=100% (critical)
//   B. recurring_spike  — gasto del mes >30% por encima del mes pasado
//   C. negative_flow    — gastos > ingresos del mes
//
// Cada insight tiene `dedupe_key` para no spamear: si la regla ya disparó
// con la misma key este mes, hace UPSERT (no se duplica).
//
// Programado por pg_cron 1× día a las 08:00 (ver migración cron_setup).
// =====================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export const INSIGHT_GENERATOR_VERSION = "insight-gen.v1";

type MonthlyState = {
  year: number;
  month: number;
  month_end: string;
  spent_month: number;
  net_month: number;
  pockets: Array<{ id: string; name: string; allocated: number; available: number; spent_month: number; pct_used: number | null }>;
  previous_month: { spent: number };
};

type Insight = {
  user_id: string;
  insight_type: string;
  severity: "info" | "notice" | "warning" | "critical";
  title: string;
  body: string;
  dedupe_key: string;
  expires_at: string;
};

function fmtCop(n: number): string {
  return Math.round(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

// -- Reglas determinísticas: aceptan un MonthlyState y devuelven 0..N insights --
function buildInsightsFor(userId: string, state: MonthlyState): Insight[] {
  const insights: Insight[] = [];
  const expires = new Date(state.month_end).toISOString();

  // A. pocket_burn
  for (const p of state.pockets || []) {
    if (p.pct_used === null || p.pct_used < 80) continue;
    const isCritical = p.pct_used >= 100;
    insights.push({
      user_id: userId,
      insight_type: "pocket_burn",
      severity: isCritical ? "critical" : "warning",
      title: isCritical ? `Presupuesto agotado en ${p.name}` : `Alerta de presupuesto: ${p.name}`,
      body: isCritical
        ? `Has superado tu plan de ${p.name} por $${fmtCop(p.spent_month - p.allocated)}.`
        : `Llevas el ${Math.round(p.pct_used)}% de ${p.name} consumido. Te quedan $${fmtCop(p.available)}.`,
      // Buckets de 10% para no re-emitir cada vez que sube un peso.
      dedupe_key: `pocket_alert_${p.id}_${state.year}_${state.month}_${Math.floor(p.pct_used / 10)}`,
      expires_at: expires,
    });
  }

  // B. recurring_spike
  const prevSpent = state.previous_month?.spent ?? 0;
  if (prevSpent > 0 && state.spent_month > prevSpent * 1.3) {
    const pctInc = Math.round(((state.spent_month - prevSpent) / prevSpent) * 100);
    insights.push({
      user_id: userId,
      insight_type: "recurring_spike",
      severity: "notice",
      title: "Tu gasto está subiendo",
      body: `Este mes llevas un gasto ${pctInc}% superior al mes pasado.`,
      dedupe_key: `spending_spike_${state.year}_${state.month}`,
      expires_at: expires,
    });
  }

  // C. negative_flow
  if (state.net_month < 0 && state.spent_month > 0) {
    insights.push({
      user_id: userId,
      insight_type: "negative_flow",
      severity: "warning",
      title: "Flujo de caja negativo",
      body: `Tus gastos superan tus ingresos por $${fmtCop(Math.abs(state.net_month))} este mes.`,
      dedupe_key: `negative_flow_${state.year}_${state.month}`,
      expires_at: expires,
    });
  }

  return insights;
}

async function processOneUser(client: SupabaseClient, userId: string): Promise<{ user_id: string; count: number; error?: string }> {
  const { data: state, error: stateErr } = await client.rpc("get_monthly_state", { p_user_id: userId });
  if (stateErr || !state) {
    return { user_id: userId, count: 0, error: stateErr?.message ?? "no state" };
  }
  const insights = buildInsightsFor(userId, state as MonthlyState);
  if (insights.length === 0) return { user_id: userId, count: 0 };

  const { error: insErr } = await client.from("user_insights").upsert(insights, { onConflict: "user_id,dedupe_key" });
  if (insErr) return { user_id: userId, count: 0, error: insErr.message };
  return { user_id: userId, count: insights.length };
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const isCronCall = authHeader === `Bearer ${SERVICE_ROLE_KEY}`;

  // Service-role client (bypassa RLS — necesario tanto en cron como en
  // single-user porque get_monthly_state es SECURITY DEFINER y los
  // upserts a user_insights necesitan saltar la policy).
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (isCronCall) {
      // Modo cron: itera todos los profiles.
      const { data: profiles, error: pErr } = await serviceClient
        .from("profiles")
        .select("id");
      if (pErr) return errorResponse(`profiles: ${pErr.message}`, 500);

      const results = [];
      for (const p of profiles ?? []) {
        results.push(await processOneUser(serviceClient, p.id as string));
      }
      const totalInsights = results.reduce((acc, r) => acc + r.count, 0);
      const totalErrors = results.filter(r => r.error).length;
      return jsonResponse({
        mode: "cron",
        version: INSIGHT_GENERATOR_VERSION,
        users_processed: results.length,
        insights_created: totalInsights,
        errors: totalErrors,
        results,
      });
    }

    // Modo usuario: validar JWT y procesar solo a ese usuario.
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
      version: INSIGHT_GENERATOR_VERSION,
      ...result,
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
