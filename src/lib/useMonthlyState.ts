// useMonthlyState — el hook que TODAS las pantallas deben usar para
// mostrar números financieros del mes (ingresos, gastos, neto, bolsillos
// con plan/disponible/gastado, top comercios, comparación mes anterior).
//
// Llama al RPC public.get_monthly_state, que es la fuente ÚNICA de verdad.
// Si una pantalla quiere mostrar otro número, está mal. Antes recalculaba
// cada pantalla por su cuenta y daba números distintos.
//
// Uso:
//   const { state, loading, error, refresh } = useMonthlyState();
//   const { state } = useMonthlyState({ year: 2026, month: 3 }); // mes específico
//
//   state?.income_month        // total ingresos del mes
//   state?.spent_month         // total gastos del mes
//   state?.available_total     // SUM(pockets.budget) — disponible hoy
//   state?.allocated_total     // SUM(pockets.allocated_budget) — plan
//   state?.pockets[i].available  // disponible de cada bolsillo
//   state?.pockets[i].allocated  // plan de cada bolsillo
//   state?.pockets[i].spent_month // gastado del mes
//   state?.pockets[i].pct_used    // porcentaje plan vs gastado
//   state?.top_merchants       // top 5 comercios del mes
//   state?.previous_month      // {income, spent, net} del mes anterior

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type MonthlyState = {
  year: number;
  month: number;
  month_start: string;
  month_end: string;
  currency: string;
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
    year: number;
    month: number;
    income: number;
    spent: number;
    net: number;
  };
};

type Options = {
  /** Año explícito (1-indexed). Si se omite, usa el año actual del cliente. */
  year?: number;
  /** Mes 1..12. Si se omite, usa el mes actual del cliente. */
  month?: number;
  /** Si false, no carga automáticamente (útil para tests o lazy). */
  autoLoad?: boolean;
};

export function useMonthlyState(options: Options = {}) {
  const { year, month, autoLoad = true } = options;

  const [state, setState] = useState<MonthlyState | null>(null);
  const [loading, setLoading] = useState<boolean>(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        throw new Error('Sin sesión: no se puede cargar el estado mensual.');
      }
      const { data, error: rpcError } = await supabase.rpc('get_monthly_state', {
        p_user_id: userData.user.id,
        p_year: year ?? null,
        p_month: month ?? null,
      });
      if (rpcError) throw rpcError;
      setState(data as MonthlyState);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error cargando estado mensual.';
      setError(msg);
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    if (autoLoad) refresh();
  }, [autoLoad, refresh]);

  return { state, loading, error, refresh };
}

// Helpers de formato — los expongo acá así todas las pantallas usan
// la misma forma de mostrar dinero (igual al prompt del advisor).
export function formatCop(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '$0';
  return `$${Math.round(Number(n)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

export function pctUsedLabel(pocket: { allocated: number; spent_month: number }): string {
  if (!pocket.allocated || pocket.allocated <= 0) return '—';
  const p = Math.round((pocket.spent_month / pocket.allocated) * 100);
  return `${p}%`;
}
