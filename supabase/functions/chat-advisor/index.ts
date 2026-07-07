// =====================================================================
// chat-advisor Edge Function — read-only analyst (advisor.v6)
// =====================================================================
// POST /functions/v1/chat-advisor
// Body: { message: string, session_id?: string }
// Auth: Bearer <user JWT>
//
// Cambios vs v5/v6:
//   - Read-only: tools.ts ahora exporta [] (cero mutaciones).
//   - Contexto único: ya NO arma el contexto a mano desde profiles +
//     pockets + transactions. Llama a get_cycle_state() — la fuente
//     de verdad — y se la pasa al prompt builder.
//   - El número que ve el chat es el MISMO que ve Dashboard y Pockets.
// =====================================================================

import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { chatCompletion, OpenAIMessage } from "../_shared/openai.ts";
import {
  ADVISOR_PROMPT_VERSION,
  buildAdvisorSystemPrompt,
  CycleState,
} from "../_shared/prompts.ts";

const HISTORY_WINDOW = 20;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { message?: string; session_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const userMessage = (body.message ?? "").trim();
  if (!userMessage) return errorResponse("`message` is required");
  const sessionId = body.session_id ?? null;

  let auth;
  try {
    auth = await authenticate(req);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unauthorized", 401);
  }

  const { user, userClient, serviceClient } = auth;

  // ------------------------------------------------------------------
  // 1. Cargar contexto: estado del ciclo unificado + memoria + historial.
  // ------------------------------------------------------------------
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: activeCycle, error: cycleErr } = await userClient
    .from("user_budget_cycles")
    .select("id, start_date")
    .eq("user_id", user.id)
    .is("end_date", null)
    .maybeSingle();

  if (cycleErr || !activeCycle) {
    // Si no hay ciclo activo (ej. usuario no ha terminado el onboarding),
    // devolvemos un mensaje amigable en vez de fallar con 500.
    const fallbackReply = "¡Hola! Veo que todavía no tienes un ciclo de presupuesto activo. Registra tu primer ingreso en el inicio para que podamos empezar a organizar tus números.";
    
    await serviceClient.from("chat_messages").insert([
      {
        user_id: user.id,
        session_id: sessionId,
        role: "user",
        content: userMessage,
        prompt_version: ADVISOR_PROMPT_VERSION,
      },
      {
        user_id: user.id,
        session_id: sessionId,
        role: "assistant",
        content: fallbackReply,
        model: "gpt-4o-mini-fallback",
        prompt_version: ADVISOR_PROMPT_VERSION,
      }
    ]);

    return jsonResponse({
      reply: fallbackReply,
      session_id: sessionId,
      usage: null,
      prompt_version: ADVISOR_PROMPT_VERSION,
    });
  }

  const cycleStart = activeCycle.start_date;

  const [
    { data: stateData, error: stateErr },
    { data: profile },
    { data: memory },
    { data: rules },
    { data: history },
    { data: todayTxs },
    { data: otherTxs },
  ] = await Promise.all([
    userClient.rpc("get_cycle_state", { p_cycle_id: activeCycle.id }),
    userClient
      .from("profiles")
      .select("id,full_name")
      .eq("id", user.id)
      .maybeSingle(),
    userClient
      .from("user_memory")
      .select("key,summary,confidence")
      .eq("user_id", user.id)
      .order("confidence", { ascending: false })
      .limit(20),
    userClient
      .from("user_spending_rules")
      .select("pattern,display_name,type")
      .eq("user_id", user.id),
    userClient
      .from("chat_messages")
      .select("role,content")
      .eq("user_id", user.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(HISTORY_WINDOW),
    userClient
      .from("transactions")
      .select("merchant,amount,category")
      .eq("user_id", user.id)
      .eq("date_string", todayISO)
      .lt("amount", 0)
      .order("created_at", { ascending: false }),
    userClient
      .from("transactions")
      .select("merchant,amount,category")
      .eq("user_id", user.id)
      .in("category", ["Otros", "Sin Categoría", "Uncategorized"])
      .gte("date_string", cycleStart)
      .lt("amount", 0)
  ]);

  if (stateErr || !stateData) {
    return errorResponse(
      `No se pudo cargar el estado del ciclo: ${stateErr?.message ?? "sin datos"}`,
      500,
    );
  }

  const state = stateData as CycleState;

  // ------------------------------------------------------------------
  // 2. Armar el system prompt y los mensajes.
  // ------------------------------------------------------------------
  const systemPrompt = buildAdvisorSystemPrompt({
    displayName: profile?.full_name ?? "amigo",
    state,
    memorySnapshot: (memory ?? []).map((m: Record<string, unknown>) => ({
      key: m.key as string,
      summary: m.summary as string,
      confidence: Number(m.confidence ?? 0.5),
    })),
    spendingRules: (rules ?? []).map((r: Record<string, unknown>) => ({
      merchant: (r.display_name as string) || (r.pattern as string),
      type: r.type as string,
    })),
    todayISO,
    todayTransactions: (todayTxs ?? []).map((t: Record<string, unknown>) => ({
      merchant: t.merchant as string,
      amount: Number(t.amount),
      category: t.category as string,
    })),
    otherTransactions: (otherTxs ?? []).map((t: Record<string, unknown>) => ({
      merchant: t.merchant as string,
      amount: Number(t.amount),
      category: t.category as string,
    })),
  });

  const historyMessages: OpenAIMessage[] = (history ?? [])
    .slice()
    .reverse()
    .map((h: Record<string, unknown>) => ({
      role: h.role as "user" | "assistant",
      content: h.content as string,
    }));

  const messages: OpenAIMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: userMessage },
  ];

  // ------------------------------------------------------------------
  // 3. Persistir el turno del usuario + evento de telemetría.
  // ------------------------------------------------------------------
  await serviceClient.from("chat_messages").insert({
    user_id: user.id,
    session_id: sessionId,
    role: "user",
    content: userMessage,
    prompt_version: ADVISOR_PROMPT_VERSION,
  });

  await serviceClient.from("user_events").insert({
    user_id: user.id,
    event_type: "chat.message.sent",
    event_data: {
      session_id: sessionId,
      length: userMessage.length,
      prompt_version: ADVISOR_PROMPT_VERSION,
      // Mini-snapshot del mes para correlacionar conversación con estado.
      state_snapshot: {
        income_month: state.income_month,
        spent_month: state.spent_month,
        net_month: state.net_month,
        available_total: state.available_total,
        pockets_count: state.pockets.length,
      },
    },
    source: "edge_fn",
  });

  // ------------------------------------------------------------------
  // 4. Llamar al LLM. Sin tools, sin loops — una sola llamada.
  // ------------------------------------------------------------------
  const completion = await chatCompletion({
    messages,
    temperature: 0.3,
    max_tokens: 400,
  });

  const finalText = (completion.choices[0]?.message?.content ?? "").trim() ||
    "No pude generar una respuesta. ¿Puedes reformular?";
  const usage = completion.usage;

  await serviceClient.from("chat_messages").insert({
    user_id: user.id,
    session_id: sessionId,
    role: "assistant",
    content: finalText,
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    model: "gpt-4o-mini",
    prompt_version: ADVISOR_PROMPT_VERSION,
  });

  return jsonResponse({
    reply: finalText,
    session_id: sessionId,
    usage: usage ?? null,
    prompt_version: ADVISOR_PROMPT_VERSION,
  });
});
