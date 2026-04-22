// Versioned system prompts. Bump the version whenever we change behaviour
// so chat_messages.prompt_version remains meaningful for offline analysis.

export const ADVISOR_PROMPT_VERSION = "advisor.v3";

export function buildAdvisorSystemPrompt(input: {
  displayName: string;
  monthlyIncome: number | null;
  financialProfile: string | null;
  financialScore: number | null;
  pockets: Array<{
    id: string;
    name: string;
    category: string;
    // `budget` = saldo DISPONIBLE hoy (decrementa con cada gasto).
    // `allocated_budget` = PLAN asignado al ciclo (solo cambia si el
    // usuario reasigna explícitamente). Ambos vienen de public.pockets
    // tras la migración 20260422000002_separate_allocated_budget.
    budget: number | null;
    allocated_budget: number | null;
    target_percentage: number | null;
  }>;
  recentTransactions: Array<{
    amount: number;
    merchant: string;
    category: string;
    created_at: string;
  }>;
  memorySnapshot: Array<{ key: string; summary: string; confidence: number }>;
  todayISO: string;
}): string {
  const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

  const pocketsLines = input.pockets.length
    ? input.pockets.map(p => {
        const parts: string[] = [`${p.name} [${p.category}] id=${p.id}`];
        const alloc = p.allocated_budget ?? 0;
        const avail = p.budget ?? 0;
        if (alloc > 0) {
          const spent = Math.max(alloc - avail, 0);
          const pct = Math.round((spent / alloc) * 100);
          parts.push(`plan $${fmt(alloc)} · queda $${fmt(avail)} (gastado ${pct}%)`);
        } else if (avail !== 0) {
          parts.push(`queda $${fmt(avail)}`);
        }
        if (p.target_percentage !== null && p.target_percentage > 0)
          parts.push(`objetivo ${p.target_percentage}%`);
        return `- ${parts.join(" · ")}`;
      }).join("\n")
    : "- (sin bolsillos creados todavía)";

  const txLines = input.recentTransactions.length
    ? input.recentTransactions.slice(0, 25).map(t =>
        `- ${t.created_at.slice(0, 10)} ${t.amount >= 0 ? "+" : ""}${fmt(t.amount)} ${t.merchant}${t.category ? ` · ${t.category}` : ""}`
      ).join("\n")
    : "- (sin movimientos recientes)";

  const memoryLines = input.memorySnapshot.length
    ? input.memorySnapshot.slice(0, 20).map(m =>
        `- [${m.confidence.toFixed(2)}] ${m.key}: ${m.summary}`
      ).join("\n")
    : "- (todavía no aprendí hábitos del usuario)";

  const incomeLine = input.monthlyIncome !== null && input.monthlyIncome > 0
    ? `Ingreso mensual declarado: $${fmt(input.monthlyIncome)}.`
    : "Ingreso mensual: no declarado.";

  const profileLine = input.financialProfile
    ? `Perfil financiero: ${input.financialProfile}.`
    : "Perfil financiero: sin clasificar.";

  const scoreLine = input.financialScore !== null
    ? `Health score: ${input.financialScore}/100.`
    : "";

  return `Eres el asesor financiero de Save (organic-ledger), una app colombiana de presupuestos por bolsillos.
Hoy es ${input.todayISO}. Hablas con ${input.displayName}.

ESTILO
- Español colombiano, cálido, directo, sin jerga financiera.
- EXTREMADAMENTE BREVE: responde en un solo párrafo corto, máximo 3 oraciones.
- NUNCA listes todos los bolsillos a menos que el usuario lo exija literalmente.
- Si te piden un resumen, agrupa los datos: menciona solo el total gastado, tu salud financiera general (Score/Flujo) y el bolsillo que más atención requiere.
- Cero bullets largos, listas extensas o reportes densos. Sé conversacional.

USA EL CONTEXTO QUE TIENES
- Siempre empieza usando los datos que YA te doy abajo (transacciones,
  bolsillos, score). Nunca respondas "no sé nada de ti" — tienes bastante.
- Los bolsillos ahora te muestran "plan $X · queda $Y (gastado Z%)":
  "plan" es lo que el usuario se asignó al ciclo, "queda" es lo disponible
  hoy. Si gastado >= 80%, menciónalo como alerta amable. Si gastado es
  bajo pero el ritmo diario reciente lo va a reventar antes de fin de
  mes, proyéctalo y advierte.
- Si te preguntan si alcanzarán a fin de mes, analiza el ritmo de gasto
  de las últimas transacciones y proyéctalo. Si tienes ingreso, compáralos;
  si no tienes ingreso, di cuánto llevan gastado y cuánto más gastarían
  al ritmo actual, y cierra preguntando el ingreso para cerrar la cuenta.
- Si te preguntan por un bolsillo específico, usa plan y queda de ese
  bolsillo en el contexto antes de responder.
- Sólo pide datos que de verdad te falten, al final de la respuesta, nunca
  como única respuesta.

USA HERRAMIENTAS CUANDO CORRESPONDA
- Mover dinero entre bolsillos ⇒ transfer_between_pockets.
- Crear un bolsillo nuevo ⇒ create_pocket.
- Registrar un gasto manual ⇒ register_expense.
- Si el usuario solo conversa o pide consejo, NO llames herramientas.

CONTEXTO DEL USUARIO
${incomeLine}
${profileLine}
${scoreLine}

BOLSILLOS
${pocketsLines}

MOVIMIENTOS RECIENTES (máx 25)
${txLines}

MEMORIA APRENDIDA (curada por el sistema)
${memoryLines}

No inventes cifras ni IDs. Pero si tienes un dato en el contexto, úsalo
con confianza — no finjas ignorancia.`;
}
