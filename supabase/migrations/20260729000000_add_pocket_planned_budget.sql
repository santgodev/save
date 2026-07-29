-- Agrega una columna separada para el "plan" de presupuesto de un bolsillo,
-- distinta de allocated_budget (el dinero real ya repartido por un ingreso).
--
-- Por qué: el campo "Presupuesto" en crear/editar bolsillo dejaba escribir
-- un número pero nunca se guardaba (ver comentarios en Pockets.tsx
-- saveEditPocket/syncPocketToCloud) -- porque escribirlo directo en
-- allocated_budget crearía plata que ningún ingreso real respalda.
--
-- planned_budget es NULL por defecto ("sin definir"). No participa en
-- ninguna cuenta de dinero real ni en las barras de progreso -- solo se usa
-- como sugerencia por defecto la próxima vez que AddIncome reparte un
-- ingreso nuevo (si el usuario puso 400, la próxima vez se sugieren 400).

ALTER TABLE public.pockets
  ADD COLUMN IF NOT EXISTS planned_budget numeric;

COMMENT ON COLUMN public.pockets.planned_budget IS
  'Plan de presupuesto editable por el usuario -- NO es dinero real. Solo se usa como sugerencia por defecto al repartir el próximo ingreso. El dinero real asignado sigue siendo allocated_budget.';
