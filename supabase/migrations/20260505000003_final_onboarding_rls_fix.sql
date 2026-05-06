-- 20260505000003_final_onboarding_rls_fix.sql
-- Hardening total de RLS para el flujo de Onboarding

-- 1. PROFILES (Fix error 42501 en upsert)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles 
FOR INSERT WITH CHECK ((select auth.uid()) = id);

-- 2. POCKETS (Asegurar creación inicial)
ALTER TABLE public.pockets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pockets_insert_own ON public.pockets;
CREATE POLICY pockets_insert_own ON public.pockets 
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- 3. INCOME_SOURCES (Asegurar registro de fuente)
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS income_sources_all_own ON public.income_sources;
CREATE POLICY income_sources_all_own ON public.income_sources 
FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- 4. INCOME_EVENT_LOGS (Para auditoría)
ALTER TABLE public.income_event_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS income_event_logs_all_own ON public.income_event_logs;
CREATE POLICY income_event_logs_all_own ON public.income_event_logs 
FOR ALL USING (EXISTS (
    SELECT 1 FROM pending_income_events e 
    WHERE e.id = event_id AND e.user_id = (select auth.uid())
));
