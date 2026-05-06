-- 20260505000001_fix_profiles_rls.sql
-- Fix: allow users to insert their own profile record during onboarding.
-- Previously only SELECT and UPDATE were allowed, causing upsert to fail
-- for new users (Error 42501).

DO $$
BEGIN
    -- profiles
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'profiles_insert_own'
    ) THEN
        CREATE POLICY profiles_insert_own ON public.profiles 
        FOR INSERT WITH CHECK ((select auth.uid()) = id);
    END IF;

    -- Ensure pockets can be inserted
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'pockets' AND policyname = 'pockets_insert_own'
    ) THEN
        CREATE POLICY pockets_insert_own ON public.pockets 
        FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
    END IF;

END $$;
