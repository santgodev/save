// =====================================================================
// chat-advisor Edge Function — read-only analyst (advisor.v8)
// =====================================================================
// POST /functions/v1/chat-advisor
// Body: { message: string, session_id?: string }
// Auth: Bearer <user JWT>
//
// Cambios vs v6/v7:
//   - Ya no se intenta anticipar cada período posible con un bloque fijo
//     en el prompt (hoy, el ciclo, ayer, la semana...) -- eso nunca cubre
//     todas las formas de preguntar. En su lugar, el modelo tiene UNA
//     herramienta de solo lectura (query_transactions, ver tools.ts) para
//     consultar cualquier rango de fechas / categoría / comercio que
//     necesite, en el momento. Sigue siendo read-only: la herramienta
//     hace un SELECT, nunca escribe nada.
//   - Contexto base: get_cycle_state() — la fuente de verdad — se pasa al
//     prompt builder igual que antes. El número que ve el chat sigue
//     siendo el MISMO que ve Dashboard y Pockets.
// =====================================================================

import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";
import { chatCompletion, OpenAIMessage } from "../_shared/openai.ts";
import { advisorTools, executeTool } from "../_shared/tools.ts";
import {
  ADVISOR_PROMPT_VERSION,
  buildAdvisorSystemPrompt,
  CycleState,
} from "../_shared/prompts.ts";

const HISTORY_WINDOW = 20;
// Tope de vueltas modelo -> herramienta -> modelo. Una sola pregunta rara
// vez necesita más de 1-2 consultas; este tope es solo para que un modelo
// que se quede pidiendo herramientas en bucle no cuelgue la función.
const MAX_TOOL_ROUNDS = 3;

// Red de seguridad: gpt-4o-mini a veces esquiva query_transactions y
// responde con un rechazo en vez de consultar datos reales, pese a que el
// prompt se lo prohíbe explícitamente (tool_choice queda en "auto", así que
// es decisión del modelo). Si detectamos ese patrón exacto -- rechazo y
// CERO herramientas llamadas en todo el turno -- forzamos una vuelta más
// con tool_choice apuntando a query_transactions, para que no tenga forma
// de responder en texto sin antes consultar.
const REFUSAL_RE = /no teng[oa]s? acceso|no cuento con (esa|esta) informaci[oó]n|no puedo calcular|no dispongo de|no tengo (esa|ese) (informaci[oó]n|dato)/i;

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

  // Chequeo de suscripción: por ahora solo OBSERVA, no bloquea (ver
  // _shared/entitlement.ts para el porqué -- hay una ventana legítima
  // justo después del onboarding donde un usuario nuevo aún sin pagar
  // puede llegar hasta acá). Se espera el chequeo (tiene su propio
  // timeout corto y falla abierto) para que el log quede confiable en
  // vez de un fire-and-forget que el runtime podría cortar; el INSERT
  // del evento sí es fire-and-forget porque es telemetría, no crítico.
  const entitlementCheck = await checkEntitlement(user.id);
  if (!entitlementCheck.active) {
    await serviceClient.from("user_events").insert({
      user_id: user.id,
      event_type: "entitlement.unpaid_api_call",
      event_data: { function: "chat-advisor", reason: entitlementCheck.reason },
      source: "edge_fn",
    }).catch(() => {});
  }

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
  // 4. Llamar al LLM con la herramienta de consulta disponible. Si el
  //    modelo la pide, la ejecutamos, le devolvemos el resultado REAL de
  //    la base de datos, y le pedimos que responda con eso -- hasta
  //    MAX_TOOL_ROUNDS vueltas por si necesita más de una consulta.
  // ------------------------------------------------------------------
  let completion = await chatCompletion({
    messages,
    tools: advisorTools,
    temperature: 0.3,
    max_tokens: 400,
  });

  let totalPromptTokens = completion.usage?.prompt_tokens ?? 0;
  let totalCompletionTokens = completion.usage?.completion_tokens ?? 0;
  // Se guarda solo la ÚLTIMA consulta hecha en este turno, para observabilidad
  // en chat_messages.tool_*. Si hubo varias, esta es la que más pesó en la
  // respuesta final.
  let lastToolCall: { name: string; input: unknown; output: unknown } | null = null;

  // Ejecuta las tool_calls pedidas por el modelo, empujando el resultado
  // REAL de cada una al historial de mensajes. Se usa tanto en el loop
  // normal como en la red de seguridad (ver REFUSAL_RE) -- misma mecánica
  // en ambos casos, solo cambia quién dispara la llamada.
  async function runToolCalls(
    assistantMsg: OpenAIMessage,
    toolCalls: NonNullable<OpenAIMessage["tool_calls"]>,
  ): Promise<{ name: string; input: unknown; output: unknown }> {
    // El mensaje que PIDE la herramienta también va en el historial que
    // le mandamos de vuelta -- si no, OpenAI rechaza los mensajes "tool"
    // siguientes por no tener a qué responder.
    messages.push({ role: "assistant", content: assistantMsg.content ?? null, tool_calls: toolCalls });

    let last: { name: string; input: unknown; output: unknown } | null = null;
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // Argumentos mal formados del modelo -- executeTool valida el
        // formato de fecha y devuelve un error explícito, no explota acá.
      }

      const result = await executeTool(call.function.name, args, userClient, user.id);
      last = { name: call.function.name, input: args, output: result };

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
    return last!;
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const assistantMsg = completion.choices[0]?.message;
    const toolCalls = assistantMsg?.tool_calls;
    if (!assistantMsg || !toolCalls || toolCalls.length === 0) break;

    lastToolCall = await runToolCalls(assistantMsg, toolCalls);

    completion = await chatCompletion({
      messages,
      tools: advisorTools,
      temperature: 0.3,
      max_tokens: 400,
    });

    totalPromptTokens += completion.usage?.prompt_tokens ?? 0;
    totalCompletionTokens += completion.usage?.completion_tokens ?? 0;
  }

  // Red de seguridad: el modelo terminó SIN llamar ninguna herramienta y su
  // respuesta suena a rechazo ("no tengo acceso a..."). En vez de dejarlo
  // esquivar la consulta, se le fuerza UNA vez a llamar query_transactions
  // -- ya no puede responder en texto sin antes traer el dato real.
  if (!lastToolCall && REFUSAL_RE.test(completion.choices[0]?.message?.content ?? "")) {
    const forced = await chatCompletion({
      messages,
      tools: advisorTools,
      tool_choice: { type: "function", function: { name: "query_transactions" } },
      temperature: 0.3,
      max_tokens: 400,
    });
    totalPromptTokens += forced.usage?.prompt_tokens ?? 0;
    totalCompletionTokens += forced.usage?.completion_tokens ?? 0;

    const forcedMsg = forced.choices[0]?.message;
    const forcedCalls = forcedMsg?.tool_calls;
    if (forcedMsg && forcedCalls && forcedCalls.length > 0) {
      lastToolCall = await runToolCalls(forcedMsg, forcedCalls);

      completion = await chatCompletion({
        messages,
        tools: advisorTools,
        temperature: 0.3,
        max_tokens: 400,
      });
      totalPromptTokens += completion.usage?.prompt_tokens ?? 0;
      totalCompletionTokens += completion.usage?.completion_tokens ?? 0;
    }
  }

  const finalText = (completion.choices[0]?.message?.content ?? "").trim() ||
    "No pude generar una respuesta. ¿Puedes reformular?";

  await serviceClient.from("chat_messages").insert({
    user_id: user.id,
    session_id: sessionId,
    role: "assistant",
    content: finalText,
    tool_name: lastToolCall?.name ?? null,
    tool_input: (lastToolCall?.input as Record<string, unknown> | undefined) ?? null,
    tool_output: (lastToolCall?.output as Record<string, unknown> | undefined) ?? null,
    prompt_tokens: totalPromptTokens || null,
    completion_tokens: totalCompletionTokens || null,
    model: "gpt-4o-mini",
    prompt_version: ADVISOR_PROMPT_VERSION,
  });

  return jsonResponse({
    reply: finalText,
    session_id: sessionId,
    usage: {
      prompt_tokens: totalPromptTokens,
      completion_tokens: totalCompletionTokens,
      total_tokens: totalPromptTokens + totalCompletionTokens,
    },
    prompt_version: ADVISOR_PROMPT_VERSION,
  });
});
