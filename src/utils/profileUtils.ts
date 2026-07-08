import { normalizeMerchant } from './merchant';

export interface ProfileData {
  score: number;
  scoreMessage: string;
  trend: 'up' | 'down' | 'neutral';
  topHabits: string[];
  totalAvg: number;
}

export interface CycleDates {
  start: string; // ISO date string
  end: string | null; // null = still open (use now as end)
}

export const calculateFinancialProfile = (
  transactions: any[],
  rules: any[],
  budgets: any[],
  monthlyIncome?: number,
  cycleDates?: CycleDates
): ProfileData => {
  if (transactions.length === 0) {
    return {
      score: 60,
      scoreMessage: "¡Bienvenido a Save! Registra tus primeros gastos para calcular tu score.",
      trend: 'neutral',
      topHabits: [],
      totalAvg: 0
    };
  }

  const today = new Date();

  // Filter transactions to the active cycle window when provided,
  // otherwise fall back to current calendar month (legacy behavior).
  let monthTx: any[];
  let cycleStart: Date;
  let cycleEnd: Date;

  if (cycleDates) {
    cycleStart = new Date(cycleDates.start);
    cycleEnd = cycleDates.end ? new Date(cycleDates.end) : today;
    monthTx = transactions.filter(t => {
      const d = new Date(t.date_string || t.created_at);
      return d >= cycleStart && d <= cycleEnd && t.category !== 'Traslado';
    });
  } else {
    // Fallback: calendar month (kept for backward compatibility)
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    cycleStart = new Date(currentYear, currentMonth, 1);
    cycleEnd = today;
    monthTx = transactions.filter(t => {
      const d = new Date(t.date_string || t.created_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
        && t.category !== 'Traslado';
    });
  }

  // 1. Gasto Hormiga: < 15,000 COP
  const HORMIGA_THRESHOLD = 15000;
  // Excluimos explícitamente movimientos entre bolsillos o cualquier traslado interno
  const expenses = monthTx.filter(t => 
    t.amount < 0 && 
    t.category !== 'Traslado' && 
    t.category !== 'Transferencia' &&
    !t.merchant?.toLowerCase().includes('bolsillo')
  );
  const totalSpent = expenses.reduce((acc, t) => acc + Math.abs(t.amount), 0);
  const hormigaCount = expenses.filter(t => Math.abs(t.amount) < HORMIGA_THRESHOLD).length;
  const hormigaPct = (hormigaCount / (expenses.length || 1)) * 100;

  // 2. Budget Overflow
  // Usamos allocated_budget (el plan) para comparar contra el gasto total.
  const totalBudget = budgets.reduce((acc, b) => acc + (b.allocated_budget ?? b.budget ?? 0), 0);
  const budgetOverflow = totalSpent > totalBudget ? (totalSpent - totalBudget) / (totalBudget || 1) : 0;

  // 3. Consistencia (registros en los últimos 7 días dentro del ciclo)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last7Days = new Date(Math.max(cycleStart.getTime(), sevenDaysAgo.getTime()));
  const activeDays = new Set(expenses
    .filter(t => new Date(t.date_string || t.created_at) >= last7Days)
    .map(t => new Date(t.date_string || t.created_at).toDateString())
  ).size;
  const consistency = (activeDays / 7) * 100;

  // 4. Cash Flow Penalty (Gasto vs Ingreso del ciclo)
  const incomes = monthTx.filter(t => t.amount > 0 && t.category === 'Ingreso');
  const totalActualIncome = incomes.reduce((acc, t) => acc + t.amount, 0);
  const effectiveIncome = monthlyIncome || totalActualIncome || 0;
  
  let cashFlowPenalty = 0;
  let isInDeficit = false;
  if (effectiveIncome > 0 && totalSpent > effectiveIncome) {
    isInDeficit = true;
    const deficitRatio = (totalSpent - effectiveIncome) / effectiveIncome;
    cashFlowPenalty = Math.min(50, deficitRatio * 50); 
  }

  // SCORE FINAL
  let score = 100 
    - (hormigaPct * 0.4) 
    - (budgetOverflow * 40) 
    - cashFlowPenalty
    + (consistency * 0.2);
  
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Trend: gasto diario promedio dentro del ciclo
  const effectiveCycleEnd = Math.min(today.getTime(), cycleEnd.getTime());
  const cycleElapsedDays = Math.max(1, Math.ceil((effectiveCycleEnd - cycleStart.getTime()) / (1000 * 60 * 60 * 24)));
  const dailyAvg = totalSpent / cycleElapsedDays;
  const trend: 'up' | 'down' | 'neutral' = dailyAvg > 50000 ? 'up' : dailyAvg < 20000 ? 'down' : 'neutral';

  // Top Habits (Frecuencia de compra)
  const frequencies: Record<string, number> = {};
  expenses.forEach(t => {
    const m = t.canonical_merchant || normalizeMerchant(t.merchant);
    frequencies[m] = (frequencies[m] || 0) + 1;
  });

  const topHabits = Object.entries(frequencies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => m);

  // Microcopy dinámico
  let scoreMessage = "Vas bien, tienes buen control.";
  if (isInDeficit) scoreMessage = "Alerta: Estás gastando más de lo que ingresas.";
  else if (score > 85) scoreMessage = "¡Excelente control! Sigue así.";
  else if (score < 40) scoreMessage = "Hagamos un ajuste, el gasto hormiga es tu mayor reto.";
  else if (budgetOverflow > 0) scoreMessage = "Ojo, te pasaste un poco del presupuesto planeado.";

  return {
    score,
    scoreMessage,
    trend,
    topHabits,
    totalAvg: cycleElapsedDays > 0 ? totalSpent / cycleElapsedDays : 0,
  };
};
