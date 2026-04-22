-- tests/02_rpc_transfer.sql
-- 6 casos sobre transfer_between_pockets(p_user_id, p_from_id, p_to_id, p_amount)
-- Pre: ejecutar 00_helpers.sql justo antes.

\echo '=== 02_rpc_transfer ==='

-- ----------------------------------------------------------------
-- Caso 1: transferencia feliz $100k de Comida a Ahorros
-- ----------------------------------------------------------------
\echo '-- Caso 1: happy path'
BEGIN;
  select public.transfer_between_pockets(
    '00000000-0000-0000-0000-0000000000aa',
    '00000000-0000-0000-0000-0000000000b1',  -- Comida (500k)
    '00000000-0000-0000-0000-0000000000b3',  -- Ahorros (200k)
    100000
  );

  -- Assertions
  do $$
  declare v_com numeric; v_aho numeric;
  begin
    select budget into v_com from pockets where id='00000000-0000-0000-0000-0000000000b1';
    select budget into v_aho from pockets where id='00000000-0000-0000-0000-0000000000b3';
    perform assert_eq(v_com, 400000, 'Comida debió quedar en 400k');
    perform assert_eq(v_aho, 300000, 'Ahorros debió quedar en 300k');
  end $$;

  -- Se crearon 2 transacciones (out + in)
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from transactions
      where user_id='00000000-0000-0000-0000-0000000000aa'
        and metadata->>'type' like 'internal_transfer%';
    perform assert_eq(v_count, 2, 'Debieron quedar 2 transacciones internas');
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 2: saldo insuficiente → debe lanzar excepción
-- ----------------------------------------------------------------
\echo '-- Caso 2: saldo insuficiente'
BEGIN;
  do $$
  begin
    begin
      perform public.transfer_between_pockets(
        '00000000-0000-0000-0000-0000000000aa',
        '00000000-0000-0000-0000-0000000000b3',  -- Ahorros (200k)
        '00000000-0000-0000-0000-0000000000b1',
        9999999
      );
      raise exception '[FAIL] no se detectó saldo insuficiente';
    exception when others then
      raise notice '  [ok] saldo insuficiente rechazado: %', sqlerrm;
    end;
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 3: self-transfer (from_id == to_id) — ¿está validado?
-- ----------------------------------------------------------------
\echo '-- Caso 3: self-transfer'
BEGIN;
  select public.transfer_between_pockets(
    '00000000-0000-0000-0000-0000000000aa',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b1',
    50000
  );
  -- OBSERVACIÓN: hoy NO se valida. Budget queda igual, pero se crean
  -- 2 transacciones falsas que contaminan el historial.
  do $$
  declare v_com numeric; v_tx int;
  begin
    select budget into v_com from pockets where id='00000000-0000-0000-0000-0000000000b1';
    select count(*) into v_tx from transactions
      where user_id='00000000-0000-0000-0000-0000000000aa';
    raise notice '  [info] Budget Comida: % — transacciones creadas: %', v_com, v_tx;
    raise notice '  [REGRESSION] self-transfer NO está bloqueado (bug conocido)';
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 4: monto cero — ¿genera transacciones fantasma?
-- ----------------------------------------------------------------
\echo '-- Caso 4: monto cero'
BEGIN;
  select public.transfer_between_pockets(
    '00000000-0000-0000-0000-0000000000aa',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b3',
    0
  );
  do $$
  declare v_tx int;
  begin
    select count(*) into v_tx from transactions
      where user_id='00000000-0000-0000-0000-0000000000aa';
    raise notice '  [info] transacciones creadas con monto 0: %', v_tx;
    raise notice '  [REGRESSION] monto=0 crea 2 transacciones vacías (bug)';
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 5: monto negativo — ¿drena el destino?
-- ----------------------------------------------------------------
\echo '-- Caso 5: monto negativo'
BEGIN;
  do $$
  begin
    begin
      perform public.transfer_between_pockets(
        '00000000-0000-0000-0000-0000000000aa',
        '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000b3',
        -50000
      );
      raise notice '  [REGRESSION] monto negativo aceptado — drena el destino';
    exception when others then
      raise notice '  [ok] monto negativo rechazado: %', sqlerrm;
    end;
  end $$;
ROLLBACK;

-- ----------------------------------------------------------------
-- Caso 6: bolsillo ajeno (RLS + SECURITY DEFINER)
-- ----------------------------------------------------------------
\echo '-- Caso 6: bolsillo ajeno'
BEGIN;
  -- Inyectamos un bolsillo de OTRO usuario
  insert into public.pockets (id, user_id, name, category, budget)
  values ('00000000-0000-0000-0000-0000000000c9',
          '00000000-0000-0000-0000-0000000000ff',
          'Bolsillo Ajeno', 'Otros', 999999);

  do $$
  begin
    begin
      perform public.transfer_between_pockets(
        '00000000-0000-0000-0000-0000000000aa',
        '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000c9',  -- destino de otro user
        10000
      );
      raise notice '  [CRITICAL] transfiere a bolsillo ajeno — fallo de seguridad';
    exception when others then
      raise notice '  [ok] bolsillo ajeno rechazado: %', sqlerrm;
    end;
  end $$;
ROLLBACK;

\echo '=== 02_rpc_transfer DONE ==='
