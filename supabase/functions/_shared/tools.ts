// Function-calling tool definitions exposed to the advisor LLM.
//
// >>> READ-ONLY DESDE advisor.v6 (2026-04-28) <<<
//
// El usuario decidió que el advisor solo INFORMA — no actúa.
// Por eso esta lista está vacía a propósito. Si en el futuro queremos
// volver a habilitar acciones, agregar acá los tool defs y manejarlos
// en executeTool().
//
// Histórico (solo para referencia, NO se exponen al modelo):
//   - transfer_between_pockets
//   - register_expense
//   - create_pocket

import type { OpenAITool } from "./openai.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const advisorTools: OpenAITool[] = [];

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function executeTool(
  name: string,
  _args: Record<string, unknown>,
  _client: SupabaseClient,
  _userId: string,
): Promise<ToolResult> {
  // Defensive: si el modelo intenta llamar a una herramienta vieja
  // (alucinación), respondemos con un error explícito en lugar de mutar.
  return {
    ok: false,
    error: `El advisor es solo de lectura. Herramienta "${name}" deshabilitada.`,
  };
}
