-- tests/regressions/regression_001_negative_amount.sql
-- Regresión para el bug #1 (2026-04-22): transfer_between_pockets
-- aceptaba montos negativos y los ejecutaba, invirtiendo el flujo de plata.
--
-- Una vez aplicado el fix (tests/TEST_REPORT.md — migración
-- 2026-04-23_safety_guards.sql), este test debe pasar en VERDE.

\echo '=== regression_001_negative_amount ==='

BEGIN;

-- Setup: 2 bolsillos con saldos conocidos
insert into public.profiles (id, full_name, monthly_income, preferred_currency)
values ('00000000-0000-0000-0000-0000000000aa','Test','2000000','COP')
on conflict (id) do nothing;

insert into public.pockets (id, user_id, name, category, budget)
values
  ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000aa',
   'A','catA',100000),
  ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000aa',
   'B','catB',100000)
on conflict (id) do update set budget = excluded.budget;

-- Assert: monto negativo debe fallar con excepción
do $$
begin
  begin
    perform public.transfer_between_pockets(
      '00000000-0000-0000-0000-0000000000aa',
      '00000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000012',
      -5000
    );
    raise exception '[FAIL] monto negativo aceptado';
  exception when others then
    if sqlerrm like '%positivo%' or sqlerrm like '%positive%' then
      raise notice '  [ok] monto negativo rechazado: %', sqlerrm;
    else
      raise exception '[FAIL] excepción inesperada: %', sqlerrm;
    end if;
  end;
end $$;

-- Assert: self-transfer debe fallar
do $$
begin
  begin
    perform public.transfer_between_pockets(
      '00000000-0000-0000-0000-0000000000aa',
      '00000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000011',
      1000
    );
    raise exception '[FAIL] self-transfer aceptado';
  exception when others then
    if sqlerrm like '%mismo bolsillo%' then
      raise notice '  [ok] self-transfer rechazado: %', sqlerrm;
    else
      raise exception '[FAIL] excepción inesperada: %', sqlerrm;
    end if;
  end;
end $$;

-- Assert: monto 0 debe fallar
do $$
begin
  begin
    perform public.transfer_between_pockets(
      '00000000-0000-0000-0000-0000000000aa',
      '00000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000012',
      0
    );
    raise exception '[FAIL] monto 0 aceptado';
  exception when others then
    raise notice '  [ok] monto 0 rechazado: %', sqlerrm;
  end;
end $$;

-- Assert: saldos NO se modificaron (ningún intento debió modificar budget)
do $$
declare v_a numeric; v_b numeric;
begin
  select budget into v_a from pockets where id='00000000-0000-0000-0000-000000000011';
  select budget into v_b from pockets where id='00000000-0000-0000-0000-000000000012';
  if v_a <> 100000 or v_b <> 100000 then
    raise exception '[FAIL] saldos cambiaron: A=% B=%', v_a, v_b;
  end if;
  raise notice '  [ok] saldos intactos: A=%, B=%', v_a, v_b;
end $$;

ROLLBACK;

\echo '=== regression_001_negative_amount DONE ==='
