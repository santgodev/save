-- tests/04_edge_cases.sql
-- Cosas que un usuario torpe o malicioso puede disparar.
\echo '=== 04_edge_cases ==='

-- ----------------------------------------------------------------
-- Caso 1: RLS — otro usuario intenta leer mis pockets
-- ----------------------------------------------------------------
\echo '-- Caso 1: RLS — leer pockets ajenos vía policy'
BEGIN;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}';
  do $$
  declare v int;
  begin
    select count(*) into v from public.pockets
      where user_id='00000000-0000-0000-0000-0000000000aa';
    if v > 0 then
      raise notice '  [CRITICAL] RLS permitió leer % pockets ajenos', v;
    else
      raise notice '  [ok] RLS bloqueó lectura de pockets ajenos';
    end if;
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 2: SQL injection en merchant
-- ----------------------------------------------------------------
\echo '-- Caso 2: merchant con comilla simple y ;'
BEGIN;
  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    E'Ro''bert; DROP TABLE transactions; --',
    1000,
    'Comida', null, null, '{}'::jsonb
  );
  do $$
  declare v_tx int;
  begin
    select count(*) into v_tx from transactions;
    perform assert_eq(v_tx > 0, true, 'tabla transactions sobrevive');
    raise notice '  [ok] SQL injection por merchant: no rompe (plpgsql parametriza)';
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 3: fechas del futuro y del pasado lejano
-- ----------------------------------------------------------------
\echo '-- Caso 3: date_string 2099 y 1999'
BEGIN;
  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    'Viajero del tiempo',
    1000,
    'Comida',
    null,
    '2099-12-31',
    '{}'::jsonb
  );
  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    'Abuelo',
    1000,
    'Comida',
    null,
    '1999-01-01',
    '{}'::jsonb
  );
  raise notice '  [REGRESSION] date_string no se valida — se aceptan fechas imposibles';
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 4: monto con decimales absurdos (centavos)
-- ----------------------------------------------------------------
\echo '-- Caso 4: $12.345,6789'
BEGIN;
  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    'Decimal raro',
    12345.6789,
    'Comida', null, null, '{}'::jsonb
  );
  do $$
  declare v numeric;
  begin
    select amount into v from transactions where merchant='Decimal raro';
    raise notice '  [info] COP con decimales: % — decidir si redondeamos al peso', v;
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 5: merchant vacío
-- ----------------------------------------------------------------
\echo '-- Caso 5: merchant string vacío'
BEGIN;
  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    '',
    1000,
    'Comida', null, null, '{}'::jsonb
  );
  raise notice '  [REGRESSION] merchant vacío aceptado — UI va a mostrar " "';
ROLLBACK;

\echo '=== 04_edge_cases DONE ==='
