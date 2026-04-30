-- 20260428000004_drop_dead_structure.sql
--
-- Cleanup post-auditoría (docs/DB_AUDIT_2026-04-28.md, P1).
--
-- Decisiones del usuario (sesión 2026-04-28):
--   "lo más simple, va a ser usada por usuarios de a pie"
--   - Borrar 3 tablas zombi sin uso real.
--   - Borrar columnas zombi de profiles que reemplaza user_insights.
--   - Borrar columnas FK rotas y placeholders en transactions/pockets.
--   - Borrar 7 RPCs huérfanos + 1 función trigger huérfana.
--   - Borrar índices duplicados/muertos.
--
-- Lo que se MANTIENE (a propósito, para encender en próxima tanda):
--   - user_memory  (chat-advisor v6 ya la lee; falta job de síntesis).
--   - user_insights (Dashboard ya la lee; falta cron generador).
--   - user_spending_rules (Profile.tsx ya la usa).
--   - emit_user_event (la usan los 3 tg_*_emit_event vivos).
--   - cron_expire_user_insights y cron_prune_user_events
--     (asumimos que hay pg_cron activo; si no, se borran después).

-- =====================================================================
-- 1) Tablas muertas
-- =====================================================================
-- recommendations: predecesora de user_insights, 100% solapada.
-- monthly_snapshots: cache pre-calculado que get_monthly_state hace al vuelo.
-- user_behavior_metrics: derivable de transactions cuando haga falta.
DROP TABLE IF EXISTS public.recommendations CASCADE;
DROP TABLE IF EXISTS public.monthly_snapshots CASCADE;
DROP TABLE IF EXISTS public.user_behavior_metrics CASCADE;


-- =====================================================================
-- 2) Columnas zombi en profiles
-- =====================================================================
-- profiles queda con: id, full_name, avatar_url, preferred_currency,
-- theme_preference, updated_at. Suficiente para una app de a pie.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS savings_goal,
  DROP COLUMN IF EXISTS notification_preferences,
  DROP COLUMN IF EXISTS last_insight,
  DROP COLUMN IF EXISTS spending_trend,
  DROP COLUMN IF EXISTS financial_profile,
  DROP COLUMN IF EXISTS financial_score;


-- =====================================================================
-- 3) Columnas zombi en transactions
-- =====================================================================
-- category_id: FK rota (uuid sin tabla destino).
-- receipt_date: redundante con date_string para el caso real.
ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS category_id,
  DROP COLUMN IF EXISTS receipt_date;


-- =====================================================================
-- 4) Columnas zombi en pockets
-- =====================================================================
-- category_id: tenía default gen_random_uuid() apuntando a nada.
-- target_percentage: el chat-advisor v6 ya no la usa; AddIncome no la
-- necesita.
ALTER TABLE public.pockets
  DROP COLUMN IF EXISTS category_id,
  DROP COLUMN IF EXISTS target_percentage;


-- =====================================================================
-- 5) RPCs huérfanos
-- =====================================================================
-- Cero llamadas desde cliente, Edge Functions o triggers.
-- Si en el futuro hace falta alguno, se recrea limpio.
DROP FUNCTION IF EXISTS public.update_save_streaks();
DROP FUNCTION IF EXISTS public.get_financial_health(uuid);
DROP FUNCTION IF EXISTS public.get_monthly_trends(uuid, integer);
DROP FUNCTION IF EXISTS public.get_pocket_real_balance(uuid);
DROP FUNCTION IF EXISTS public.get_ai_ready_context();
DROP FUNCTION IF EXISTS public.get_user_behavior_summary(uuid);
DROP FUNCTION IF EXISTS public.rls_auto_enable();

-- Función trigger huérfana (definida pero no enganchada a ningún trigger).
DROP FUNCTION IF EXISTS public.tg_income_emit_event();


-- =====================================================================
-- 6) Índices muertos / redundantes
-- =====================================================================
-- chat_messages_session_idx: WHERE session_id IS NOT NULL ya no aplica
-- (la columna es NOT NULL desde data_quality_guards).
DROP INDEX IF EXISTS public.chat_messages_session_idx;

-- user_events_user_time_idx: cubierto por user_events_user_type_time_idx.
DROP INDEX IF EXISTS public.user_events_user_time_idx;

-- idx_user_spending_rules_pattern: redundante con
-- user_spending_rules_user_id_pattern_unq (UNIQUE compuesto).
DROP INDEX IF EXISTS public.idx_user_spending_rules_pattern;

-- idx_spendingrules_canonical: solo útil para búsqueda cross-user
-- (caso que no existe hoy).
DROP INDEX IF EXISTS public.idx_spendingrules_canonical;
