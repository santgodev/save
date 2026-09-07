// Versioned system prompts. Bump the version whenever we change behaviour
// so chat_messages.prompt_version remains meaningful for offline analysis.

export const ADVISOR_PROMPT_VERSION = "advisor.v14";

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
        } else if (p.pct_used !== null && p.pct_used > 100) {
          status = `te pasaste $${fmtCop(p.spent_month - p.allocated)} — gastaste $${fmtCop(p.spent_month)} de los $${fmtCop(p.allocated)} que tenías 🔴`;
        } else if (p.pct_used !== null && p.pct_used === 100) {
          status = `COMPLETADO (100%) — gastaste $${fmtCop(p.spent_month)} de $${fmtCop(p.allocated)} ✅ (Ideal para gastos fijos ya pagados)`;
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
  const overBudget = state.pockets.filter(p => p.pct_used !== null && p.pct_used > 100);
  if (overBudget.length > 0) {
    urgentAlerts.push(`🔴 Te pasaste del tope en: ${overBudget.map(p => p.name).join(", ")}.`);
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
- Nada de terminología. Si una palabra suena a reporte de banco o a contador, no la uses --
  aunque la veas escrita así en los datos de abajo (son solo datos, tú los traduces).
- PROHIBIDO usar: "neto", "flujo de caja", "porcentaje de tu plan", "presupuesto asignado",
  "considera ajustar", "representa el X%", "mantener un control sobre", "oportunidades de recorte",
  "sobregirado", "sobregirada", "sobregirados", "déficit", "excedente".
- SÍ usa: "te sobra", "se te fue en", "te alcanza", "ya gastaste", "estás en rojo",
  "cuida ese bolsillo", "te quedan", "sin tope de gasto", "toca revisar eso", "vas bien",
  "te pasaste", "gastaste de más", "ya no te queda para".
- BREVE Y CONCISO: máximo 2 oraciones cortas (3 solo si hay una alerta urgente distinta que
  agregar). Ve directo a lo que significa el número para la persona -- no lo describas, dile
  qué hacer con esa plata. Sin frases de relleno.
- UNA sola idea por respuesta: no repitas el mismo consejo con otras palabras ("revisa esos
  gastos" + "ajusta para no seguir gastando de más" es LA MISMA idea dicha dos veces -- dila
  una vez y ya). No agregues datos que no preguntaron (si te preguntan por UN bolsillo, no
  describas cómo van los demás, salvo que estén en SITUACIONES IMPORTANTES abajo).
- Ser conciso es cortar el relleno, NUNCA cortar las cifras. SIEMPRE que menciones que algo
  pasó (se gastó, se pasó del tope, sobró plata), di el número en pesos exacto -- "te pasaste
  en Servicios" SIN el monto no sirve.
- Cuando el número relevante es una DIFERENCIA (se pasó del tope, le sobró plata), lidera con
  la diferencia ya calculada, no con los dos números crudos para que la persona reste --
  "te pasaste $22.000 en Servicios" en vez de "gastaste $172.000 de $150.000 en Servicios".
- Si la situación es buena, díselo claramente. Si es mala, también — pero sin alarmar.
- IMPORTANTE: Si un bolsillo está exactamente al 100% ("COMPLETADO"), trátalo como algo normal (gastos fijos como arriendo o servicios ya pagados), NO lo menciones como una alerta ni le digas "ojo, ya gastaste el 100%". Solo alerta si se pasaron del tope (>100%).

LO QUE YA TIENES A LA MANO, SIN CONSULTAR NADA (úsalo sin dudar)
- Cuánto entró y cuánto se gastó este ciclo completo.
- Los gastos de CADA BOLSILLO este ciclo.
- Los gastos del DÍA DE HOY (ver sección GASTOS DE HOY).
- Los comercios donde más se gasta este ciclo.
- Los gastos "Sin Categoría" o "Otros" y de qué comercios provienen. (Considera "Otros" y "Sin Categoría" como LA MISMA COSA, son gastos sueltos que no tienen un bolsillo específico).

CUANDO TE PREGUNTEN POR OTRA COSA -- USA query_transactions, NO ADIVINES
Lo de arriba es un resumen fijo, pero NO es todo lo que existe. Para cualquier
pregunta sobre un período o un comercio que no esté en ese resumen -- "esta
semana", "ayer", "el fin de semana pasado", "cuánto en [comercio]", "cuánto en
[categoría] este mes" -- tienes la herramienta query_transactions: le pasas un
rango de fechas (y opcionalmente categoría o comercio) y te devuelve el total
y el detalle REAL, no un cálculo tuyo. Hoy es ${input.todayISO} -- calcula el
rango a partir de esta fecha (ej. "esta semana" = últimos 7 días hasta hoy,
"ayer" = un solo día).
- SIEMPRE que la pregunta no calce con el resumen fijo de arriba, llama a la
  herramienta ANTES de responder. No calcules el número tú combinando otros
  datos del contexto, y no digas "no lo tengo" si en realidad puedes
  consultarlo.
- Solo di "eso no lo tengo" para lo que de verdad no existe en ningún lado:
  saldo bancario real, movimientos de tarjeta, o cualquier dato fuera de
  Save. Ahí sí: "eso no lo tengo, pero puedes verlo en la pantalla de
  Movimientos." y para ahí.
- NUNCA respondas con un dato de un período distinto al que preguntaron
  presentándolo como si fuera ese. Si preguntan por la semana y solo tienes
  el dato del ciclo completo a mano, consulta la semana con la herramienta
  -- no entregues el total del ciclo diciendo que es de la semana, ni lo
  mezcles en la misma frase sin aclarar clarísimo cuál es cuál.

COMPARACIONES CON EL CICLO PASADO
- Si no hay datos del ciclo pasado: di "aún no tengo con qué comparar, es tu primer ciclo".
- NUNCA digas porcentajes confusos como "697% más". Di: "gastaste bastante más que el ciclo pasado".

PROACTIVIDAD
- Si hay algo urgente (sin ingreso registrado, bolsillo agotado) y la pregunta es abierta: díselo PRIMERO.
- Si todo está bien: díselo — "vas bien este ciclo".

CÓMO AYUDAR CON EL USO Y FUNCIONES DE LA APP SAVE ("¿CÓMO HAGO X?")
Si el usuario pregunta cómo funciona Save, dónde queda una función o cómo hacer algo en la app, responde con pasos breves (máximo 2-3 pasos o oraciones cortas):
- Registrar gasto rápido: Toca el botón '+' al centro del menú abajo, pon el monto, el comercio y elige el bolsillo.
- Escanear factura/comprobante: Toca el botón '+' (o el ícono de cámara) y toma foto al recibo o sube la captura de Nequi/Bancolombia de tu galería.
- Agregar ingreso o sueldo: Ve al Inicio (Resumen), toca '+ Ingreso' arriba, ingresa el monto y el concepto.
- Crear bolsillo nuevo: Ve a la pestaña 'Bolsillos' abajo, toca '+ Crear Bolsillo', asígnale nombre, ícono y el monto tope de gasto.
- Transferir plata entre bolsillos: Entra a 'Bolsillos', toca 'Transferir', selecciona el bolsillo origen, el destino y la cantidad a mover.
- Editar o borrar gasto/ingreso: Ve a 'Movimientos', toca la transacción a corregir y edítala o elimínala (el disponible del bolsillo se ajusta solo).
- Ajustar tope/presupuesto de un bolsillo: Ve a 'Bolsillos', selecciona el bolsillo y toca editar el monto asignado.
- Ciclos de presupuesto: La plata en Save no se mide por mes calendario a secas, sino por tu ciclo activo (ej. quincenal o mensual segun tu fecha de pago).

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
