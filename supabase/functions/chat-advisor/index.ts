// =====================================================================
// chat-advisor Edge Function
// =====================================================================
// POST /functions/v1/chat-advisor
// Body: { message: string, session_id?: string }
// Auth: Bearer <user JWT>
//
// Flow:
//   1. Auth user (getUser()).
//   2. Load live context: profile (for monthly_income), pockets, recent
//      transactions, user_memory, last 20 chat turns.
//   3. Persist the user's message.
//   4. Call OpenAI with tool-calling enabled.
//   5. Execute any requested tools against the RPCs that already exist
//      (transfer_between_pockets, register_expense) and feed results back.
//   6. Persist the assistant turn and return its reply.
// =====================================================================

import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { chatCompletion, OpenAIMessage } from "../_shared/openai.ts";
import { ADVISOR_PROMPT_VERSION, buildAdvisorSystemPrompt } from "../_shared/prompts.ts";
import { advisorTools, executeTool } from "../_shared/tools.ts";

const MAX_TOOL_ITERATIONS = 3;
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
  // 1. Context gathering. All reads go through userClient so RLS applies.
  // ------------------------------------------------------------------
  const [
    { data: profile },
    { data: pockets },
    { data: txs },
    { data: memory },
    { data: history },
  ] = await Promise.all([
    userClient
      .from("profiles")
      .select("id,full_name,monthly_income,financial_profile,financial_score")
      .eq("id", user.id)
      .maybeSingle(),
    userClient
      .from("pockets")
      .select("id,name,category,budget,allocated_budget,target_percentage")
      .eq("user_id", user.id),
    userClient
      .from("transactions")
      .select("amount,merchant,category,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),
    userClient
      .from("user_memory")
      .select("key,summary,confidence")
      .eq("user_id", user.id)
      .order("confidence", { ascending: false })
      .limit(40),
    userClient
      .from("chat_messages")
      .select("role,content")
      .eq("user_id", user.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(HISTORY_WINDOW),
  ]);

  // ------------------------------------------------------------------
  // 2. Build the system prompt + messages array.
  // ------------------------------------------------------------------
  const systemPrompt = buildAdvisorSystemPrompt({
    displayName: profile?.full_name ?? "amigo",
    monthlyIncome:
      profile?.monthly_income !== null && profile?.monthly_income !== undefined
        ? Number(profile.monthly_income)
        : null,
    financialProfile: profile?.financial_profile ?? null,
    financialScore: profile?.financial_score ?? null,
    pockets: (pockets ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      category: (p.category as string) ?? "",
      budget: p.budget !== null && p.budget !== undefined ? Number(p.budget) : null,
      allocated_budget:
        p.allocated_budget !== null && p.allocated_budget !== undefined
          ? Number(p.allocated_budget)
          : null,
      target_percentage:
        p.target_percentage !== null && p.target_percentage !== undefined
          ? Number(p.target_percentage)
          : null,
    })),
    recentTransactions: (txs ?? []).map((t: Record<string, unknown>) => ({
      amount: Number(t.amount ?? 0),
      merchant: (t.merchant as string) ?? "",
      category: (t.category as string) ?? "",
      created_at: (t.created_at as string) ?? new Date().toISOString(),
    })),
    memorySnapshot: (memory ?? []).map((m: Record<string, unknown>) => ({
      key: m.key as string,
      summary: m.summary as string,
      confidence: Number(m.confidence ?? 0.5),
    })),
    todayISO: new Date().toISOString().slice(0, 10),
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
  // 3. Persist the user's turn up front + emit a behavioural event.
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
    event_data: { session_id: sessionId, length: userMessage.length },
    source: "edge_fn",
  });

  // ------------------------------------------------------------------
  // 4. LLM loop with tool calls.
  // ------------------------------------------------------------------
  let finalText = "";
  let usage: { prompt_tokens: number; completion_tokens: number } | undefined;
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const completion = await chatCompletion({
      messages,
      tools: advisorTools,
      temperature: 0.4,
      max_tokens: 500,
    });

    const choice = completion.choices[0];
    const msg = choice.message;
    usage = completion.usage;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });

      for (const call of msg.tool_calls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          // fall through — model gave malformed JSON, report to itself.
        }

        const result = await executeTool(call.function.name, parsedArgs, userClient, user.id);

        await serviceClient.from("chat_messages").insert({
          user_id: user.id,
          session_id: sessionId,
          role: "tool",
          content: result.ok ? "tool executed" : `tool failed: ${result.error}`,
          tool_name: call.function.name,
          tool_input: parsedArgs,
          tool_output: result as unknown as Record<string, unknown>,
          prompt_version: ADVISOR_PROMPT_VERSION,
        });

        await serviceClient.from("user_events").insert({
          user_id: user.id,
          event_type: "advisor.tool.called",
          event_data: {
            tool: call.function.name,
            ok: result.ok,
            input: parsedArgs,
          },
          source: "edge_fn",
        });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }

      continue;
    }

    finalText = msg.content ?? "";
    break;
  }

  if (!finalText) {
    finalText = "Lo siento, no pude generar una respuesta. ¿Puedes reformular?";
  }

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
  });
});
