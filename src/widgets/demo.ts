import type { CycleState } from '../lib/useCycleState';

export const DEMO_CYCLE: CycleState = {
  cycle_id: 'demo-cycle', cycle_name: 'Mi ciclo', start_date: '2026-09-01', end_date: null, is_active: true,
  income_month: 1800000, spent_month: 654000, net_month: 1146000, allocated_total: 1800000, available_total: 1146000,
  pockets: [
    { id: 'demo-comida', name: 'Comida', category: 'Comida', icon: 'Utensils', is_default_free: false, allocated: 600000, available: 186000, spent_month: 414000, pct_used: 69 },
    { id: 'demo-transporte', name: 'Transporte', category: 'Transporte', icon: 'Car', is_default_free: false, allocated: 300000, available: 60000, spent_month: 240000, pct_used: 80 },
    { id: 'demo-ahorro', name: 'Mi próximo viaje', category: 'Ahorros', icon: 'Plane', is_default_free: false, allocated: 660000, available: 660000, spent_month: 0, pct_used: 0 },
    { id: 'demo-libre', name: 'Libre', category: 'Libre', icon: 'Wallet', is_default_free: true, allocated: 240000, available: 240000, spent_month: 0, pct_used: 0 },
  ], top_merchants: [], previous_month: null,
};
