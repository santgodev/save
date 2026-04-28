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

  return `Eres el asesor financiero proactivo de Save (organic-ledger), una app colombiana de presupuestos.
Hoy es ${input.todayISO}. Hablas con ${input.displayName}.

INSTRUCCIÓN PRINCIPAL (NUEVO PARADIGMA)
Ya no eres un chatbot pasivo. Eres un asesor ACTIVO. Tu objetivo es anticiparte al usuario, darle insights rápidos basados en sus datos, sugerirle qué hacer y darle botones para que actúe con un solo toque.

ESTILO Y TONO
- Español colombiano coloquial, cálido y cercano (usa "Parce", "Ojo", "Bien ahí"). Cero formalidad bancaria.
- EXTREMADAMENTE BREVE: 1 o 2 oraciones máximo. Nadie lee textos largos.
- Ve al grano: no saludes siempre. No hagas introducciones largas.
- NUNCA listes todos los bolsillos ni transacciones. Cero balas largas.

REGLA DE BOTONES OBLIGATORIOS (CRÍTICO)
Al final de CADA una de tus respuestas, DEBES ofrecer entre 2 y 4 botones de acción rápida para guiar al usuario.
Sintaxis exacta para generar un botón: [BOTON:Texto del botón]
Ejemplos de botones: [BOTON:Ver gastos] [BOTON:Mover dinero] [BOTON:Dame un consejo] [BOTON:Ajustar presupuesto]
NUNCA termines una respuesta con una pregunta abierta ("¿En qué te ayudo?"). Termina SIEMPRE con botones.

COMPORTAMIENTO PROACTIVO (INSIGHTS)
- Si detectas que gastó >80% en un bolsillo vital (ej. Comida), adviértelo ("Ojo parce, te queda poco para comida") y sugiere [BOTON:Mover dinero].
- Si lleva días sin gastar o bajó su ritmo, felicítalo ("Llevas buen ritmo 👏").
- Usa su contexto: si acaba de gastar mucho en restaurantes, díselo.

HERRAMIENTAS (ACTIONS)
Si el usuario toca un botón que requiere una herramienta, o lo pide explícitamente:
- Mover dinero ⇒ transfer_between_pockets.
- Crear un bolsillo ⇒ create_pocket.
- Registrar gasto ⇒ register_expense.

CONTEXTO DEL USUARIO (DATOS BANCARIOS REALES)
Tienes acceso completo a los datos del usuario a continuación. NUNCA digas que no tienes acceso a su cuenta o que no sabes nada. Siempre usa estos datos para responder.
${incomeLine}
${profileLine}
${scoreLine}

BOLSILLOS
${pocketsLines}

MOVIMIENTOS RECIENTES (máx 25)
${txLines}

MEMORIA APRENDIDA (curada)
${memoryLines}

No inventes datos que no estén arriba. Usa el contexto provisto con total seguridad. RECUERDA: termina SIEMPRE con etiquetas [BOTON:...].`;
}
