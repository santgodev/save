import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

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

const globalCycleStateCache: Record<string, CycleState> = {};

export function useCycleState(cycleId?: string, autoLoad: boolean = true) {
  const cacheKey = cycleId || 'none';

  const [state, setState] = useState<CycleState | null>(globalCycleStateCache[cacheKey] || null);
  const [loading, setLoading] = useState<boolean>(!globalCycleStateCache[cacheKey] && autoLoad);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    
    if (!globalCycleStateCache[cacheKey]) {
      setLoading(true);
    }
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_cycle_state', {
        p_cycle_id: cycleId,
      });
      
      if (rpcError) throw rpcError;
      
      globalCycleStateCache[cacheKey] = data as CycleState;
      setState(data as CycleState);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error cargando estado del ciclo.';
      setError(msg);
      if (!globalCycleStateCache[cacheKey]) {
        setState(null);
      }
    } finally {
      setLoading(false);
    }
  }, [cycleId, cacheKey]);

  useEffect(() => {
    if (autoLoad && cycleId) refresh();
  }, [autoLoad, refresh, cycleId]);

  return { state, loading, error, refresh };
}

let globalCyclesCache: any[] | null = null;

export function useUserCycles() {
  const [cycles, setCycles] = useState<any[]>(globalCyclesCache || []);
  const [activeCycle, setActiveCycle] = useState<any | null>(
    globalCyclesCache ? globalCyclesCache.find(c => c.is_active) : null
  );
  const [loading, setLoading] = useState(!globalCyclesCache);

  const fetchCycles = async () => {
    if (!globalCyclesCache) setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;
    
    const { data, error } = await supabase
      .from('user_budget_cycles')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('start_date', { ascending: false });

    if (!error && data) {
      globalCyclesCache = data;
      setCycles(data);
      setActiveCycle(data.find(c => c.is_active) || data[0] || null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCycles();
  }, []);

  return { cycles, activeCycle, loading, refetchCycles: fetchCycles };
}
