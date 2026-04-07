import { normalizeMerchant } from './merchant';

export interface ProfileData {
  score: number;
  scoreMessage: string;
  trend: 'up' | 'down' | 'neutral';
  topHabits: string[];
  totalAvg: number;
}

export const calculateFinancialProfile = (transactions: any[], rules: any[], budgets: any[]): ProfileData => {
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
  const currentMonth = today.getMonth();
  const currentYear = new Date().getFullYear();

  // 1. Gasto Hormiga: Definimos como < 15,000 COP
  const HORMIGA_THRESHOLD = 15000;
  const expenses = transactions.filter(t => t.amount < 0);
  const totalSpent = expenses.reduce((acc, t) => acc + Math.abs(t.amount), 0);
  const hormigaCount = expenses.filter(t => Math.abs(t.amount) < HORMIGA_THRESHOLD).length;
  const hormigaPct = (hormigaCount / (expenses.length || 1)) * 100;

  // 2. Budget Overflow
  const totalBudget = budgets.reduce((acc, b) => acc + (b.budget || 0), 0);
  const budgetOverflow = totalSpent > totalBudget ? (totalSpent - totalBudget) / (totalBudget || 1) : 0;

  // 3. Consistencia (registros en los últimos 7 días)
  const last7Days = new Date();
  last7Days.setDate(today.getDate() - 7);
  const activeDays = new Set(expenses
    .filter(t => new Date(t.date_string || t.created_at) >= last7Days)
    .map(t => new Date(t.date_string || t.created_at).toDateString())
  ).size;
  const consistency = (activeDays / 7) * 100;

  // SCORE FINAL: 100 - Penalizaciones + Bonos
  let score = 100 
    - (hormigaPct * 0.4) 
    - (budgetOverflow * 50) 
    + (consistency * 0.2);
  
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Trend (comparar gasto diario promedio vs global)
  const dailyAvg = totalSpent / (today.getDate() || 1);
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
  if (score > 85) scoreMessage = "¡Excelente control! Sigue así.";
  else if (score < 40) scoreMessage = "Hagamos un ajuste, el gasto hormiga es tu mayor reto.";
  else if (budgetOverflow > 0) scoreMessage = "Ojo, te pasaste un poco del presupuesto planeado.";

  return {
    score,
    scoreMessage,
    trend,
    topHabits,
    totalAvg: totalSpent / (currentMonth + 1) // simplificado
  };
};
