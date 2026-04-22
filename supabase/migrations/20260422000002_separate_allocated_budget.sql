-- 20260422000002_separate_allocated_budget.sql
--
-- Bug #2 del TEST_REPORT (2026-04-22, CRÍTICO):
--   pockets.budget se estaba usando con dos significados a la vez:
--     (a) "presupuesto mensual asignado" (intención del usuario)
--     (b) "saldo corriente disponible" (lo que decrementa el RPC
--         register_expense cada vez que el usuario gasta)
--
--   Consecuencia: a los pocos días nadie sabía cuánto se había asignado
--   originalmente a un bolsillo, y el advisor tampoco podía responder
--   "¿cuánto me he gastado de Comida este mes?" porque no tenía referencia.
--
-- Solución: separamos los dos conceptos en dos columnas.
--
--   pockets.allocated_budget → el plan mensual (lo que el usuario se asignó)
--   pockets.budget           → se mantiene, PERO su semántica pasa a ser
--                              "saldo disponible" (lo que le queda ahora).
--
-- Backfill: allocated_budget = budget al momento de migrar. Esto asume que
-- los usuarios están empezando un ciclo nuevo con el saldo que tienen hoy.
-- Podríamos reconstruir allocated_budget a partir de transactions de este
-- mes, pero eso introduce ruido (transferencias, devoluciones, etc.). La
-- lectura limpia es: hoy es un nuevo punto de partida.
--
-- IMPORTANTE: NO se tocan los RPCs. transfer_between_pockets y
-- register_expense siguen operando sobre `budget` (ahora = saldo
-- disponible). El único consumidor nuevo de allocated_budget es el prompt
-- del advisor y (futuro) barras de progreso en el cliente.
--
-- Para "reasignar presupuesto" explícitamente el cliente puede hacer:
--   update pockets set allocated_budget = X, budget = X where id = ...
-- (Esto es un nuevo flujo de UI — no lo cubre esta migración.)

-- 1. Agregar columna (nullable primero para no romper inserts en-vuelo)
ALTER TABLE public.pockets
  ADD COLUMN IF NOT EXISTS allocated_budget numeric DEFAULT 0;

-- 2. Backfill: cada bolsillo existente "se asignó" lo que tiene hoy
UPDATE public.pockets
SET allocated_budget = COALESCE(budget, 0)
WHERE allocated_budget IS NULL OR allocated_budget = 0;

-- 3. Endurecer: NOT NULL + default explícito + check no-negativo
ALTER TABLE public.pockets
  ALTER COLUMN allocated_budget SET DEFAULT 0,
  ALTER COLUMN allocated_budget SET NOT NULL;

-- Un presupuesto asignado no puede ser negativo (saldo disponible sí puede,
-- temporalmente, si alguien sobregira — pero el plan no).
ALTER TABLE public.pockets
  DROP CONSTRAINT IF EXISTS pockets_allocated_budget_non_negative;

ALTER TABLE public.pockets
  ADD CONSTRAINT pockets_allocated_budget_non_negative
  CHECK (allocated_budget >= 0);

-- 4. Comentarios para evitar que el próximo dev se confunda
COMMENT ON COLUMN public.pockets.allocated_budget IS
  'Presupuesto asignado al bolsillo para el ciclo actual. Sólo cambia cuando el usuario reasigna explícitamente. No lo tocan los RPCs de gasto ni transferencia.';

COMMENT ON COLUMN public.pockets.budget IS
  'Saldo corriente disponible en el bolsillo. Decrementa con register_expense, varía con transfer_between_pockets. Para conocer el plan original, ver allocated_budget.';
