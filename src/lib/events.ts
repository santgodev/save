// =====================================================================
// src/lib/events.ts
// Thin client helper to emit behavioural events into `user_events`.
//
// Design notes:
// - Most domain events (transaction.*, pocket.*, income.*) are emitted
//   automatically by Postgres triggers. You don't need to call `logEvent`
//   for those.
// - Use this helper for CLIENT-ONLY signals the server can't observe:
//     * UI interactions: 'ui.tab.opened', 'ui.theme.changed'
//     * Feature usage:   'scanner.opened', 'advice.dismissed'
//     * Funnel steps:    'onboarding.step.completed'
// - Never include PII in the payload. Prefer ids and enums.
// - This is fire-and-forget. Failures are logged but never block the UI.
// =====================================================================

import { Platform } from 'react-native';
import { supabase } from './supabase';
import Constants from 'expo-constants';

// Per-session id. Regenerated on cold start; survives screen changes.
// Useful for correlating events inside a single app usage.
const sessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const appVersion =
  (Constants.expoConfig?.version as string | undefined) ??
  (Constants.manifest?.version as string | undefined) ??
  'unknown';

export type EventPayload = Record<string, unknown>;

export async function logEvent(eventType: string, payload: EventPayload = {}): Promise<void> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return; // no user, no event

    // NOTE: column is `event_data`, not `payload`.
    const { error } = await supabase.from('user_events').insert({
      user_id: userId,
      event_type: eventType,
      event_data: payload,
      session_id: sessionId,
      app_version: appVersion,
      platform: Platform.OS,
      source: 'client',
    });

    if (error) {
      // Don't throw: instrumentation must never break the app.
      console.warn('[events] insert failed', eventType, error.message);
    }
  } catch (e) {
    console.warn('[events] unexpected', eventType, e);
  }
}

// Common event name constants to avoid typos across the app.
export const EVENTS = {
  UI_TAB_OPENED: 'ui.tab.opened',
  UI_THEME_CHANGED: 'ui.theme.changed',
  SCANNER_OPENED: 'scanner.opened',
  SCANNER_CANCELLED: 'scanner.cancelled',
  CHAT_OPENED: 'chat.opened',
  CHAT_CLOSED: 'chat.closed',
  ADVICE_ACCEPTED: 'advice.accepted',
  ADVICE_DISMISSED: 'advice.dismissed',
  ONBOARDING_STEP: 'onboarding.step.completed',
} as const;

export type KnownEvent = typeof EVENTS[keyof typeof EVENTS];
