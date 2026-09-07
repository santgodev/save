import { formatMoney, formatPercent } from '../lib/format';
import type { CycleState } from '../lib/useCycleState';

export type WidgetPreferences = { pocketId: string | null; hideAmounts: boolean };
export const DEFAULT_WIDGET_PREFERENCES: WidgetPreferences = { pocketId: null, hideAmounts: false };
export type WidgetPalette = { background: string; text: string; secondary: string; accent: string; tint: string; track: string; error: string };
export type PocketSnapshot = {
  status: 'ready' | 'signedOut' | 'empty' | 'missing';
  title: string; amount: string; detail: string; remaining: number; overdrawn: boolean;
  cycleName: string; updatedAt: number; updatedLabel: string; hideAmounts: boolean;
  pocketId: string; scheme: string; demo: boolean;
  light: WidgetPalette; dark: WidgetPalette;
};

export function selectWidgetPocket(state: CycleState | null, preferences: WidgetPreferences) {
  if (!state) return undefined;
  if (preferences.pocketId) return state.pockets.find(p => p.id === preferences.pocketId);
  return state.pockets.find(p => !p.is_default_free) ?? state.pockets[0];
}

export function buildPocketSnapshot(
  state: CycleState | null,
  preferences: WidgetPreferences,
  options: { signedIn: boolean; scheme: string; demo: boolean; light: WidgetPalette; dark: WidgetPalette; now?: number },
): PocketSnapshot {
  const pocket = options.signedIn ? selectWidgetPocket(state, preferences) : undefined;
  const available = Number(pocket?.available ?? 0);
  const allocated = Number(pocket?.allocated ?? 0);
  const overdrawn = available < 0;
  const remaining = allocated > 0 ? Math.max(0, Math.min(1, available / allocated)) : 0;
  const now = options.now ?? Date.now();
  const status = !options.signedIn ? 'signedOut' : pocket ? 'ready' : preferences.pocketId && state ? 'missing' : 'empty';
  return {
    status,
    title: pocket?.name ?? (status === 'signedOut' ? 'Tu próximo paso' : 'Mi bolsillo'),
    amount: preferences.hideAmounts ? '••••' : pocket ? formatMoney(Math.abs(available)) : '—',
    detail: preferences.hideAmounts ? 'Montos ocultos' : overdrawn ? 'Por encima de lo asignado' : allocated > 0 ? `${formatPercent(remaining)} disponible` : 'Sin asignación en este ciclo',
    remaining: preferences.hideAmounts ? 0 : remaining,
    overdrawn: preferences.hideAmounts ? false : overdrawn,
    cycleName: state?.cycle_name ?? '', updatedAt: now,
    updatedLabel: new Date(now).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
    hideAmounts: preferences.hideAmounts, pocketId: pocket?.id ?? '', scheme: options.scheme,
    demo: options.demo, light: options.light, dark: options.dark,
  };
}

export function parseWidgetDestination(url: string, allowedScheme: string): { screen: 'scanner' | 'quick_expense' | 'pockets' | 'widgets'; pocketId?: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${allowedScheme}:`) return null;
    const target = parsed.searchParams.get('widget');
    if (!['scanner', 'quick_expense', 'pockets', 'widgets'].includes(target ?? '')) return null;
    const pocketId = parsed.searchParams.get('pocketId');
    return { screen: target as 'scanner' | 'quick_expense' | 'pockets' | 'widgets', ...(pocketId ? { pocketId } : {}) };
  } catch { return null; }
}
