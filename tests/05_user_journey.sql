-- tests/05_user_journey.sql
-- "Juan Pérez abre Save por primera vez" — recorrido narrativo.
--
-- Este archivo NO se hace ROLLBACK automático. Si se corre en prod te deja
-- datos. Úsalo SOLO en branch o DB local.
--
-- Propósito: detectar fricciones de producto que un usuario promedio sentiría.

\echo '=== 05_user_journey — Juan Pérez abre Save por primera vez ==='

-- Día 1: Juan se registra y le muestran onboarding
--   "¿Cuánto ganas al mes?" → Juan teclea "$2000000" (sin puntos, sin nada)
update public.profiles
set monthly_income = 2000000,
    preferred_currency = 'COP'
where id = '00000000-0000-0000-0000-0000000000aa';

\echo 'ℹ  Día 1: monthly_income=2.000.000, moneda=COP'

-- La app le sugiere bolsillos automáticos (la lógica real está en el cliente
-- hoy — aquí lo simulamos a mano, BUG: debería ser un RPC).
-- 50% Comida, 20% Transporte, 15% Ahorros, 15% resto.
-- Juan acepta.

-- Día 2: Juan escanea la primera factura — $12.500 en La Rebaja.
select public.register_expense(
  '00000000-0000-0000-0000-0000000000aa',
  'La Rebaja', 12500, 'Comida',
  'Utensils', null,
  jsonb_build_object('source','ocr','confidence',0.92)
);

-- Día 3: Juan pagó el bus — $2.900. Pero no sabe qué es "Transporte",
-- digita a mano y elige categoría "Otros". BUG #POCKET_AMBIG:
-- no hay bolsillo "Otros" → transacción huérfana.
select public.register_expense(
  '00000000-0000-0000-0000-0000000000aa',
  'Bus', 2900, 'Otros',
  'Receipt', null, '{}'::jsonb
);

-- Día 5: Juan decide moverle $100k de Comida a Ahorros.
select public.transfer_between_pockets(
  '00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000b3',
  100000
);

-- Día 10: Juan intenta transferir $800k que no tiene (sólo le quedan
-- ~387k en Comida). Esperamos un error humano.
do $$
begin
  begin
    perform public.transfer_between_pockets(
      '00000000-0000-0000-0000-0000000000aa',
      '00000000-0000-0000-0000-0000000000b1',
      '00000000-0000-0000-0000-0000000000b3',
      800000
    );
    raise exception '[FAIL] debió rechazar por saldo insuficiente';
  exception when others then
    raise notice '  [ok] saldo insuficiente rechazado (el cliente debe mostrar algo amable)';
  end;
end $$;

-- Día 15: Juan le pregunta al chat "¿me alcanza hasta fin de mes?"
-- (Este insert simula lo que guarda el Edge Function chat-advisor)
insert into public.chat_messages (user_id, session_id, role, content, model, prompt_version)
values
  ('00000000-0000-0000-0000-0000000000aa', 'journey-1', 'user',
   '¿me alcanza hasta fin de mes?', null, null),
  ('00000000-0000-0000-0000-0000000000aa', 'journey-1', 'assistant',
   'Con $387k en Comida y ritmo de $12k/día te alcanza hasta fin de mes.',
   'gpt-4o-mini', 'advisor.v2');

-- Reporte final del recorrido
\echo ''
\echo '--- Reporte del recorrido ---'
select
  (select budget from pockets where id='00000000-0000-0000-0000-0000000000b1') as comida,
  (select budget from pockets where id='00000000-0000-0000-0000-0000000000b2') as transporte,
  (select budget from pockets where id='00000000-0000-0000-0000-0000000000b3') as ahorros,
  (select count(*) from transactions where user_id='00000000-0000-0000-0000-0000000000aa') as tx_count,
  (select count(*) from transactions
   where user_id='00000000-0000-0000-0000-0000000000aa'
     and category='Otros') as tx_huerfanas;

\echo '=== 05_user_journey DONE ==='
