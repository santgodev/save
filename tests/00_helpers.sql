-- tests/00_helpers.sql
-- Helpers compartidos: usuario de prueba, seed de pockets, funciones de assert.
-- Idempotente: correrlo varias veces no duplica datos.

-- ---------------------------------------------------------------
-- 1. USUARIO DE PRUEBA
-- ---------------------------------------------------------------
-- Usamos un UUID fijo para poder encontrarlo desde cualquier test.
-- NO creamos fila en auth.users (eso requiere admin API). Los RPCs
-- solo usan public.*, que no tienen FK hacia auth.users obligatorio
-- en dev… si el FK existe en tu entorno, crea el usuario con:
--   select auth.sign_up('test@save.local', 'password');

do $$
declare
  v_test_user uuid := '00000000-0000-0000-0000-0000000000aa';
begin
  -- Limpieza previa
  delete from public.transactions where user_id = v_test_user;
  delete from public.pockets       where user_id = v_test_user;
  delete from public.profiles      where id       = v_test_user;

  -- Profile mínimo (si la tabla tiene FK a auth.users, esto puede
  -- fallar; en ese caso ejecutar los tests contra DB local/branch
  -- donde el FK se pueda diferir).
  insert into public.profiles (id, full_name, monthly_income, preferred_currency)
  values (v_test_user, 'Juan Pérez (TEST)', 2000000, 'COP')
  on conflict (id) do update set
    full_name = excluded.full_name,
    monthly_income = excluded.monthly_income;

  raise notice '[helpers] usuario de prueba listo: %', v_test_user;
end $$;

-- ---------------------------------------------------------------
-- 2. SEED DE POCKETS
-- ---------------------------------------------------------------
-- 3 bolsillos clásicos de un colombiano promedio.

insert into public.pockets (id, user_id, name, category, budget, icon)
values
  ('00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000aa',
   'Comida', 'Comida', 500000, 'Utensils'),
  ('00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000aa',
   'Transporte', 'Transporte', 300000, 'Car'),
  ('00000000-0000-0000-0000-0000000000b3',
   '00000000-0000-0000-0000-0000000000aa',
   'Ahorros', 'Ahorros', 200000, 'PiggyBank')
on conflict (id) do update set
  budget = excluded.budget;

-- ---------------------------------------------------------------
-- 3. ASSERT HELPER
-- ---------------------------------------------------------------
-- Uso: perform assert_eq(budget, 400000, 'Comida post-gasto $100k');
create or replace function assert_eq(got numeric, expected numeric, label text)
returns void language plpgsql as $$
begin
  if got is null and expected is null then
    raise notice '  [ok] %: null == null', label;
    return;
  end if;
  if got = expected then
    raise notice '  [ok] %: got=%', label, got;
  else
    raise exception '  [FAIL] %: esperaba %, obtuve %', label, expected, got;
  end if;
end $$;

create or replace function assert_raises(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
    raise exception '  [FAIL] %: no se lanzó excepción como se esperaba', label;
  exception when others then
    raise notice '  [ok] %: lanzó % (%)', label, sqlstate, sqlerrm;
  end;
end $$;
