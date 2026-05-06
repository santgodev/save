-- 20260505000005_fix_profiles_rls_all.sql
-- Fix definitivo para error 42501 en upsert de profiles.
-- Se unifican las políticas en una sola de tipo ALL para evitar conflictos en operaciones atómicas.

-- Limpiar políticas viejas
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Habilitar RLS (por si acaso)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Crear política unificada
CREATE POLICY profiles_all_own ON public.profiles
FOR ALL 
USING ((select auth.uid()) = id)
WITH CHECK ((select auth.uid()) = id);

COMMENT ON POLICY profiles_all_own ON public.profiles IS 'Permite gestión total del perfil propio (necesario para upsert en onboarding).';
