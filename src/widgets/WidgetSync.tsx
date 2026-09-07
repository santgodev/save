import { useEffect } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { supabase } from '../lib/supabase';
import type { CycleState } from '../lib/useCycleState';
import { buildPocketSnapshot, DEFAULT_WIDGET_PREFERENCES, selectWidgetPocket } from './model';
import { widgetPalette } from './appearance';
import { APP_SCHEME, nativeWidgetsAvailable, publishWidgetSnapshot, readWidgetPreferences, WIDGET_PREFERENCES_CHANGED, WIDGET_REFRESH_REQUESTED } from './storage';

export function WidgetSync({ userId }: { userId?: string }) {
  useEffect(() => {
    if (!nativeWidgetsAvailable()) return;
    // Wipe the previous account before any asynchronous request can finish.
    publishWidgetSnapshot(buildPocketSnapshot(null, DEFAULT_WIDGET_PREFERENCES, {
      signedIn: false, demo: false, scheme: APP_SCHEME,
      light: widgetPalette(false), dark: widgetPalette(true),
    }));
    let disposed = false;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      try {
        const preferences = userId ? await readWidgetPreferences(userId) : DEFAULT_WIDGET_PREFERENCES;
        let state: CycleState | null = null;
        if (userId) {
          const { data: cycles, error } = await supabase.from('user_budget_cycles')
            .select('id').eq('user_id', userId).is('end_date', null).order('start_date', { ascending: false }).limit(1);
          if (error) throw error;
          if (cycles?.[0]) {
            const { data, error: stateError } = await supabase.rpc('get_cycle_state', { p_cycle_id: cycles[0].id });
            if (stateError) throw stateError;
            state = data as CycleState;
          }
        }
        if (disposed || current !== request) return;
        const pocket = selectWidgetPocket(state, preferences);
        publishWidgetSnapshot(buildPocketSnapshot(state, preferences, {
          signedIn: !!userId, demo: false, scheme: APP_SCHEME,
          light: widgetPalette(false, pocket?.id), dark: widgetPalette(true, pocket?.id),
        }));
      } catch (error) {
        // Keep the last dated snapshot on network failure; never replace it with $0.
        if (!disposed) console.warn('[widgets] Could not refresh snapshot', error instanceof Error ? error.message : 'Network unavailable');
      }
    };
    void refresh();
    const foreground = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    const preferences = DeviceEventEmitter.addListener(WIDGET_PREFERENCES_CHANGED, owner => { if (owner === userId) void refresh(); });
    const manual = DeviceEventEmitter.addListener(WIDGET_REFRESH_REQUESTED, () => void refresh());
    return () => { disposed = true; request++; foreground.remove(); preferences.remove(); manual.remove(); };
  }, [userId]);
  return null;
}
