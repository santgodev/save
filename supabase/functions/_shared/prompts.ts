// Versioned system prompts. Bump the version whenever we change behaviour
// so chat_messages.prompt_version remains meaningful for offline analysis.

export const ADVISOR_PROMPT_VERSION = "advisor.v7";

export type CycleState = {
  cycle_id: string;
  cycle_name: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  income_month: number;
  spent_month: number;
  net_month: number;
  allocated_total: number;
  available_total: number;
  pockets: Array<{
    id: string;
    name: string;
    category: string;
    icon: string | null;
    is_default_free: boolean;
    allocated: number;
    available: number;
    spent_month: number;
    pct_used: number | null;
  }>;
  top_merchants: Array<{
    merchant: string;
    display: string;
    total: number;
    count: number;
  }>;
  previous_month: {
    name: string;
    income: number;
    spent: number;
    net: number;
  } | null;
};

function fmtCop(n: number): string {
  return Math.round(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function deltaLabel(curr: number, prev: number): string {
  if (prev === 0) return "no hay datos del mes pasado para comparar";
  const diff = curr - prev;
  const pctDiff = Math.round((diff / Math.abs(prev)) * 100);
  if (Math.abs(pctDiff) < 5) return "parecido al mes pasado";
  if (pctDiff > 0) return `$${fmtCop(Math.abs(diff))} más que el mes pasado`;
  return `$${fmtCop(Math.abs(diff))} menos que el mes pasado`;
}

export function buildAdvisorSystemPrompt(input: {
  displayName: string;
  state: CycleState;
  memorySnapshot: Array<{ key: string; summary: string; confidence: number }>;
  spendingRules: Array<{ merchant: string; type: string }>;
  todayISO: string;
  todayTransactions: Array<{ merchant: string; amount: number; category: string }>;
  otherTransactions: Array<{ merchant: string; amount: number; category: string }>;
}): string {
  const { state } = input;
  const cycleLabel = state.cycle_name;
  const isFirstCycle = !state.previous_month;

  // Resumen del ciclo en lenguaje cotidiano
  const incomeLine = state.income_month === 0
    ? `No has registrado plata que entró este ciclo.`
    : isFirstCycle
      ? `Este ciclo entraron $${fmtCop(state.income_month)} (primer ciclo, aún no hay con qué comparar).`
      : `Este ciclo entraron $${fmtCop(state.income_month)} — ${deltaLabel(state.income_month, state.previous_month!.income)}.`;

  const spentLine = isFirstCycle
    ? `Has gastado $${fmtCop(state.spent_month)} (primer ciclo, aún no hay con qué comparar).`
    : `Has gastado $${fmtCop(state.spent_month)} — ${deltaLabel(state.spent_month, state.previous_month!.spent)}.`;

  const netLine = state.income_month === 0 && state.spent_month > 0
    ? `Llevas $${fmtCop(state.spent_month)} gastados sin haber registrado ningún ingreso este ciclo.`
    : state.net_month >= 0
      ? `Te sobran $${fmtCop(state.net_month)} de lo que entró este ciclo.`
      : `Estás $${fmtCop(Math.abs(state.net_month))} en rojo — gastaste más de lo que entró.`;

  const availableLine = `En tus bolsillos tienes disponibles $${fmtCop(state.available_total)} de los $${fmtCop(state.allocated_total)} que planeaste gastar este ciclo.`;

  const headline = [incomeLine, spentLine, netLine, availableLine].join(" ");

  // Gastos de HOY
  const DIRTY_MERCHANTS = ["Factura Escaneada", "Gasto Rápido", "gasto rapido", "factura escaneada"];
  const todayTotal = input.todayTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const todayClean = input.todayTransactions.filter(t =>
    !DIRTY_MERCHANTS.some(d => t.merchant.toLowerCase().includes(d.toLowerCase()))
  );
  const todayBlock = todayTotal === 0
    ? "HOY: No hay gastos registrados hoy todavía."
    : [
        `HOY (${input.todayISO}): Gastaste $${fmtCop(todayTotal)} en total.`,
        todayClean.length > 0
          ? todayClean.map(t => `- ${t.merchant}: $${fmtCop(Math.abs(t.amount))} (${t.category})`).join("\n")
          : `- Gastos sin nombre de comercio identificado.`
      ].join("\n");

  // Bolsillos en lenguaje simple
  const pocketLines = state.pockets.length
    ? state.pockets.map(p => {
        let status = "";
        if (p.allocated === 0 && p.spent_month > 0) {
          status = `gastaste $${fmtCop(p.spent_month)} — sin tope definido`;
        } else if (p.pct_used !== null && p.pct_used >= 100) {
          status = `SE TE ACABÓ — gastaste $${fmtCop(p.spent_month)} de $${fmtCop(p.allocated)} 🔴`;
        } else if (p.pct_used !== null && p.pct_used >= 80) {
          status = `casi agotado — gastaste $${fmtCop(p.spent_month)} de $${fmtCop(p.allocated)}, te quedan $${fmtCop(p.available)} ⚠`;
        } else {
          status = `gastaste $${fmtCop(p.spent_month)} de $${fmtCop(p.allocated)}, te quedan $${fmtCop(p.available)}`;
        }
        return `- ${p.name}: ${status}`;
      }).join("\n")
    : "- (sin bolsillos creados todavía)";

  // Top comercios — filtrados
  const cleanMerchants = state.top_merchants.filter(m =>
    !DIRTY_MERCHANTS.some(d => m.display.toLowerCase().includes(d.toLowerCase()))
  );
  const merchantLines = cleanMerchants.length
    ? cleanMerchants.map(m =>
        `- ${m.display}: $${fmtCop(m.total)} (${m.count} ${m.count === 1 ? "vez" : "veces"})`
      ).join("\n")
    : "- (no hay comercios con nombre identificado este ciclo)";

  // Gastos en "Otros"
  const otherTotal = input.otherTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const otherBlock = otherTotal === 0
    ? "- No hay gastos en 'Otros' este ciclo."
    : `En la categoría 'Otros' has gastado $${fmtCop(otherTotal)} en total este ciclo.\n` +
      `Ese total se compone de:\n` +
      input.otherTransactions.reduce((acc, t) => {
        let m = t.merchant;
        if (DIRTY_MERCHANTS.some(d => m.toLowerCase().includes(d.toLowerCase()))) {
          m = "Gastos sin nombre de comercio";
        }
        const existing = acc.find(x => x.merchant === m);
        if (existing) {
          existing.amount += Math.abs(t.amount);
        } else {
          acc.push({ merchant: m, amount: Math.abs(t.amount) });
        }
        return acc;
      }, [] as { merchant: string, amount: number }[])
      .sort((a, b) => b.amount - a.amount)
      .map(t => `  - ${t.merchant}: $${fmtCop(t.amount)}`)
      .join("\n");

  const memoryLines = input.memorySnapshot.length
    ? input.memorySnapshot.slice(0, 8).map(m => `- ${m.summary}`).join("\n")
    : "- (aún no he aprendido nada de este usuario)";

  // Situaciones urgentes
  const urgentAlerts: string[] = [];
  if (state.income_month === 0 && state.spent_month > 0) {
    urgentAlerts.push(`🚨 URGENTE: El usuario lleva $${fmtCop(state.spent_month)} gastados pero NO ha registrado ningún ingreso este ciclo. Si la pregunta es general, empieza por esto.`);
  }
  const pocketsNoBudget = state.pockets.filter(p => p.allocated === 0 && p.spent_month > 0);
  if (pocketsNoBudget.length > 0) {
    urgentAlerts.push(`⚠ Sin tope en: ${pocketsNoBudget.map(p => `${p.name} ($${fmtCop(p.spent_month)} gastados)`).join(", ")}. Está gastando sin control ahí.`);
  }
  const overBudget = state.pockets.filter(p => p.pct_used !== null && p.pct_used >= 100);
  if (overBudget.length > 0) {
    urgentAlerts.push(`🔴 Bolsillos agotados este ciclo: ${overBudget.map(p => p.name).join(", ")}.`);
  }
  const urgentBlock = urgentAlerts.length
    ? `SITUACIONES IMPORTANTES (priorizar si la pregunta es abierta):\n${urgentAlerts.join("\n")}`
    : "";

  return `Eres SAGE, el asesor de finanzas personales de ${input.displayName} en la app Save.
Hoy es ${input.todayISO}.

QUIÉN ES TU USUARIO
Una persona normal — empleado, freelancer, alguien que quiere saber si le alcanza la plata.
NO es contador ni economista. Usa palabras que usa él en su día a día, no las tuyas.

CÓMO HABLAS (muy importante, no negociable)
- Como un amigo que entiende de plata — cercano, claro, sin enredar.
- PROHIBIDO usar: "neto", "flujo de caja", "porcentaje de tu plan", "presupuesto asignado",
  "considera ajustar", "representa el X%", "mantener un control sobre", "oportunidades de recorte".
- SÍ usa: "te sobra", "se te fue en", "te alcanza", "ya gastaste", "estás en rojo",
  "cuida ese bolsillo", "te quedan", "sin tope de gasto", "toca revisar eso", "vas bien".
- BREVE: máximo 3-4 oraciones. Directo al punto. Sin frases de relleno.
- Si la situación es buena, díselo claramente. Si es mala, también — pero sin alarmar.

LO QUE SÍ SABES (úsalo sin dudar)
- Cuánto entró y cuánto se gastó este ciclo.
- Los gastos de CADA BOLSILLO este ciclo.
- Los gastos del DÍA DE HOY (ver sección GASTOS DE HOY).
- Los comercios donde más se gasta este ciclo.
- Los gastos "Sin Categoría" o "Otros" y de qué comercios provienen. (Considera "Otros" y "Sin Categoría" como LA MISMA COSA, son gastos sueltos que no tienen un bolsillo específico).

LO QUE NO SABES (admítelo y redirige)
- Gastos de ayer, de una semana específica, o de hace una hora.
- Saldo bancario real o movimientos de tarjeta.
- Si preguntan algo que no tienes: di "eso no lo tengo, pero puedes verlo en la pantalla de Movimientos."
- NUNCA respondas con un dato diferente al que te preguntaron.

COMPARACIONES CON EL CICLO PASADO
- Si no hay datos del ciclo pasado: di "aún no tengo con qué comparar, es tu primer ciclo".
- NUNCA digas porcentajes confusos como "697% más". Di: "gastaste bastante más que el ciclo pasado".

PROACTIVIDAD
- Si hay algo urgente (sin ingreso registrado, bolsillo agotado) y la pregunta es abierta: díselo PRIMERO.
- Si todo está bien: díselo — "vas bien este ciclo".

DATOS DEL CICLO — ${cycleLabel}
${headline}

GASTOS DE HOY
${todayBlock}

CADA BOLSILLO
${pocketLines}

GASTOS EN "OTROS" O SIN CATEGORÍA
${otherBlock}

DÓNDE SE VA LA PLATA ESTE CICLO
${merchantLines}

${urgentBlock}

LO QUE SÉ DE ESTE USUARIO (sus hábitos y patrones)
${memoryLines}

Recuerda: habla como amigo, no como robot. Corto y claro siempre.
`;
}
