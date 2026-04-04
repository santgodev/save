import { Transaction } from '../types';

export type DetectedPattern = {
  merchant: string;
  count: number;
  avgAmount: number;
  variancePercent: number;
};

/**
 * Algoritmo de detección de patrones avanzada.
 * Analiza transacciones recientes para identificar hábitos constantes.
 */
export const detectPatterns = (transactions: Transaction[]): DetectedPattern[] => {
  const grouped: Record<string, Transaction[]> = {};
  const now = new Date();

  // 1. Filtrar solo gastos negativos de los últimos 14 días
  transactions.forEach(tx => {
    if (!tx.amount || tx.amount >= 0) return;
    
    // Asumimos que canonical_merchant existe en el objeto o lo calculamos si no viene
    const key = (tx as any).canonical_merchant || tx.merchant.toLowerCase().trim();
    
    // Filtro temporal: Solo considerar hábitos recientes (14 días)
    const txDate = tx.created_at ? new Date(tx.created_at) : now;
    const daysDiff = (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 14) return;

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tx);
  });

  const patterns: DetectedPattern[] = [];

  for (const merchantKey in grouped) {
    const txs = grouped[merchantKey];

    // Criterio: Al menos 3 veces en 14 días para ser considerado un hábito "en caliente"
    if (txs.length < 3) continue;

    const amounts = txs.map(t => Math.abs(t.amount || 0));
    const total = amounts.reduce((a, b) => a + b, 0);
    const avg = total / amounts.length;

    // Calcular varianza para saber si es un gasto "estable" (como un café diario vs compras random)
    const variance = amounts.reduce((a, b) => a + Math.abs(b - avg), 0) / amounts.length;
    const variancePercent = (variance / avg) * 100;

    // Solo alertar si la varianza es razonable (< 50% del valor promedio)
    if (variancePercent < 50) {
      patterns.push({
        merchant: txs[0].merchant, // Nombre display del primer registro
        count: txs.length,
        avgAmount: avg,
        variancePercent
      });
    }
  }

  return patterns;
};
