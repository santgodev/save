// Function-calling tool definitions exposed to the advisor LLM.
// These bind to the RPCs that already exist in the organic-ledger schema:
//   - transfer_between_pockets(p_user_id, p_from_id, p_to_id, p_amount)
//   - register_expense(p_user_id, p_merchant, p_amount, p_category, p_icon, p_date_string, p_metadata)
// Plus a plain insert for creating pockets.

import type { OpenAITool } from "./openai.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const advisorTools: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "transfer_between_pockets",
      description:
        "Transfiere dinero entre dos bolsillos del usuario. Usa los UUIDs exactos tal como vienen en el contexto.",
      parameters: {
        type: "object",
        properties: {
          from_pocket_id: { type: "string", description: "UUID del bolsillo origen" },
          to_pocket_id:   { type: "string", description: "UUID del bolsillo destino" },
          amount:         { type: "number", description: "Monto positivo a transferir" },
        },
        required: ["from_pocket_id", "to_pocket_id", "amount"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_pocket",
      description: "Crea un nuevo bolsillo (categoría de presupuesto) para el usuario.",
      parameters: {
        type: "object",
        properties: {
          name:     { type: "string" },
          category: { type: "string", description: "Etiqueta legible de categoría" },
          budget:   { type: "number", description: "Presupuesto mensual (opcional)" },
          icon:     { type: "string", description: "Nombre de icono (lucide). Opcional." },
        },
        required: ["name", "category"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "register_expense",
      description:
        "Registra un gasto del usuario en la categoría indicada. Siempre usa montos positivos; el backend lo registra como egreso.",
      parameters: {
        type: "object",
        properties: {
          merchant: { type: "string" },
          amount:   { type: "number", description: "Monto positivo del gasto" },
          category: { type: "string", description: "Categoría que exista para este usuario" },
          icon:     { type: "string", description: "Nombre de icono (lucide). Opcional." },
        },
        required: ["merchant", "amount", "category"],
        additionalProperties: false,
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
  try {
    switch (name) {
      case "transfer_between_pockets": {
        const { from_pocket_id, to_pocket_id, amount } = args as {
          from_pocket_id: string; to_pocket_id: string; amount: number;
        };
        const { data, error } = await client.rpc("transfer_between_pockets", {
          p_user_id: userId,
          p_from_id: from_pocket_id,
          p_to_id:   to_pocket_id,
          p_amount:  amount,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }
      case "create_pocket": {
        const { name: pocketName, category, budget, icon } = args as {
          name: string; category: string; budget?: number; icon?: string;
        };
        // Al crear, budget (saldo disponible) = allocated_budget (plan asignado).
        // Son iguales al principio — el usuario aún no ha gastado nada del ciclo.
        const initial = budget ?? 0;
        const { data, error } = await client
          .from("pockets")
          .insert({
            user_id: userId,
            name: pocketName,
            category,
            budget: initial,
            allocated_budget: initial,
            icon: icon ?? null,
          })
          .select()
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }
      case "register_expense": {
        const { merchant, amount, category, icon } = args as {
          merchant: string; amount: number; category: string; icon?: string;
        };
        const { data, error } = await client.rpc("register_expense", {
          p_user_id:  userId,
          p_merchant: merchant,
          p_amount:   Math.abs(amount),
          p_category: category,
          p_icon:     icon ?? "receipt-text",
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
