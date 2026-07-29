// Function-calling tool definitions exposed to the advisor LLM.
//
// >>> READ-ONLY DESDE advisor.v6 (2026-04-28) <<<
//
// El usuario decidió que el advisor solo INFORMA — no actúa. Eso sigue
// vigente: query_transactions (advisor.v8) es una consulta, no una
// mutación. La decisión que cambió es otra: en vez de pre-calcular en el
// prompt un bloque de texto por cada período que se nos ocurriera que
// alguien podría preguntar (hoy, el ciclo, ayer, la semana...) -- lo cual
// nunca cubre todas las formas de preguntar y obliga a tocar el prompt
// cada vez que aparece una nueva -- el modelo ahora puede pedir el rango
// de fechas que necesite y consultarlo él mismo, en el momento.
//
// Histórico (solo para referencia, NO se exponen al modelo -- estas SÍ
// eran mutaciones y siguen deshabilitadas a propósito):
//   - transfer_between_pockets
//   - register_expense
//   - create_pocket

import type { OpenAITool } from "./openai.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const advisorTools: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "query_transactions",
      description:
        "Consulta los movimientos REALES del usuario (gastos e ingresos) en un rango de fechas exacto. " +
        "Úsala SIEMPRE que te pregunten por algo que no esté ya resumido en el contexto del sistema " +
        "(que solo trae 'hoy' y 'el ciclo completo') -- por ejemplo 'esta semana', 'ayer', 'el fin de " +
        "semana pasado', 'cuánto gasté en [comercio]', 'cuánto llevo en [categoría] este mes'. " +
        "NUNCA calcules ni inventes un total de memoria o a partir de otros números del contexto -- " +
        "si no tienes el dato ya resumido, llama a esta función y usa exactamente lo que te devuelva.",
      parameters: {
        type: "object",
        properties: {
          start_date: {
            type: "string",
            description: "Fecha de inicio del rango, formato YYYY-MM-DD, inclusive.",
          },
          end_date: {
            type: "string",
            description: "Fecha de fin del rango, formato YYYY-MM-DD, inclusive. Puede ser igual a start_date para un solo día.",
          },
          category: {
            type: "string",
            description: "Opcional. Filtra solo esa categoría/bolsillo exacto (ej. 'Alimentación').",
          },
          merchant_contains: {
            type: "string",
            description: "Opcional. Filtra comercios cuyo nombre contenga este texto (sin importar mayúsculas).",
          },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
];

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  client: SupabaseClient,
  userId: string,
): Promise<ToolResult> {
  if (name !== "query_transactions") {
    // Defensive: si el modelo alucina una herramienta que no existe (o
    // una de las viejas de mutación, ya retiradas), respondemos con un
    // error explícito en vez de fallar en silencio.
    return { ok: false, error: `Herramienta "${name}" no existe o está deshabilitada.` };
  }

  const startDate = String(args.start_date ?? "");
  const endDate = String(args.end_date ?? "");
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return { ok: false, error: "start_date y end_date deben tener formato YYYY-MM-DD." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "end_date no puede ser anterior a start_date." };
  }

  let query = client
    .from("transactions")
    .select("merchant,amount,category,date_string,metadata")
    .eq("user_id", userId)
    .gte("date_string", startDate)
    .lte("date_string", endDate)
    .order("date_string", { ascending: false })
    .limit(300);

  if (typeof args.category === "string" && args.category.trim()) {
    query = query.eq("category", args.category.trim());
  }
  if (typeof args.merchant_contains === "string" && args.merchant_contains.trim()) {
    query = query.ilike("merchant", `%${args.merchant_contains.trim()}%`);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Array<
    { merchant: string; amount: number; category: string; date_string: string; metadata: Record<string, unknown> | null }
  >;

  // Misma exclusión que get_cycle_state (la fuente de verdad del resto de
  // la app): un ingreso o un traslado interno entre bolsillos no cuenta
  // como "gasto", aunque su amount sea negativo (la pata de salida del
  // traslado sí lo es).
  const isTransfer = (t: (typeof rows)[number]) =>
    t.metadata?.type === "internal_transfer_out" || t.metadata?.type === "internal_transfer_in";

  const expenses = rows.filter((t) => t.amount < 0 && t.category !== "Ingreso" && t.category !== "Traslado" && !isTransfer(t));
  const income = rows.filter((t) => t.amount > 0 && t.category === "Ingreso");

  const totalSpent = Math.round(expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0));
  const totalIncome = Math.round(income.reduce((sum, t) => sum + t.amount, 0));

  return {
    ok: true,
    data: {
      range: { start_date: startDate, end_date: endDate },
      total_spent: totalSpent,
      total_income: totalIncome,
      transaction_count: expenses.length,
      // Tope de 50 líneas devueltas al modelo -- el total ya viene sumado
      // arriba, esto es solo para que pueda listar/detallar si le piden.
      transactions: expenses.slice(0, 50).map((t) => ({
        date: t.date_string,
        merchant: t.merchant,
        amount: Math.round(Math.abs(t.amount)),
        category: t.category,
      })),
    },
  };
}
