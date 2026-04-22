-- tests/03_rpc_expense.sql
-- 5 casos sobre register_expense
\echo '=== 03_rpc_expense ==='

-- ----------------------------------------------------------------
-- Caso 1: gasto normal en categoría que existe
-- ----------------------------------------------------------------
\echo '-- Caso 1: happy path'
BEGIN;
  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    'Tienda del Barrio',
    25000,
    'Comida',
    null, null, '{}'::jsonb
  );
  do $$
  declare v_com numeric; v_tx_amount numeric;
  begin
    select budget into v_com from pockets where id='00000000-0000-0000-0000-0000000000b1';
    perform assert_eq(v_com, 475000, 'Comida 500k - 25k = 475k');

    select amount into v_tx_amount from transactions
      where user_id='00000000-0000-0000-0000-0000000000aa'
        and merchant='Tienda del Barrio';
    perform assert_eq(v_tx_amount, -25000, 'Transacción grabada en negativo');
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 2: monto negativo entrante → ¿se normaliza?
-- ----------------------------------------------------------------
\echo '-- Caso 2: monto negativo recibido'
BEGIN;
  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    'Test Negativo',
    -40000,          -- negativo
    'Comida',
    null, null, '{}'::jsonb
  );
  do $$
  declare v_tx numeric;
  begin
    select amount into v_tx from transactions
      where merchant='Test Negativo'
        and user_id='00000000-0000-0000-0000-0000000000aa';
    perform assert_eq(v_tx, -40000, 'ABS() normaliza el signo');
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 3: categoría inexistente → transacción huérfana
-- ----------------------------------------------------------------
\echo '-- Caso 3: categoría sin bolsillo'
BEGIN;
  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    'Mascota',
    30000,
    'Mascotas',  -- no hay bolsillo así
    null, null, '{}'::jsonb
  );
  do $$
  declare v_tx int;
  begin
    select count(*) into v_tx from transactions
      where category='Mascotas' and user_id='00000000-0000-0000-0000-0000000000aa';
    perform assert_eq(v_tx, 1, 'Transacción se crea aunque no haya pocket');
    raise notice '  [REGRESSION] transacción huérfana: no vive en ningún bolsillo';
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 4: monto cero
-- ----------------------------------------------------------------
\echo '-- Caso 4: monto cero'
BEGIN;
  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    'Cero',
    0,
    'Comida',
    null, null, '{}'::jsonb
  );
  do $$
  declare v_tx int;
  begin
    select count(*) into v_tx from transactions where merchant='Cero';
    raise notice '  [info] gasto $0 permitido (transacción creada: %)', v_tx;
    raise notice '  [REGRESSION] no se bloquean gastos de monto 0';
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 5: categoría con 2 bolsillos (ambiguous match)
-- ----------------------------------------------------------------
\echo '-- Caso 5: ambigüedad por categoría duplicada'
BEGIN;
  insert into public.pockets (id, user_id, name, category, budget)
  values ('00000000-0000-0000-0000-0000000000b9',
          '00000000-0000-0000-0000-0000000000aa',
          'Comida #2', 'Comida', 50000);

  select public.register_expense(
    '00000000-0000-0000-0000-0000000000aa',
    'Test ambig',
    10000, 'Comida', null, null, '{}'::jsonb
  );
  -- El RPC hace LIMIT 1 sin ORDER BY → depende del orden físico.
  do $$
  declare v_com1 numeric; v_com2 numeric;
  begin
    select budget into v_com1 from pockets where id='00000000-0000-0000-0000-0000000000b1';
    select budget into v_com2 from pockets where id='00000000-0000-0000-0000-0000000000b9';
    raise notice '  [REGRESSION] ambigüedad: com1=%, com2=% (cuál se descontó es no-determinista)',
                 v_com1, v_com2;
  end $$;
ROLLBACK;

\echo '=== 03_rpc_expense DONE ==='
