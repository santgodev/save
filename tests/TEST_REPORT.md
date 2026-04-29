# Reporte de pruebas — 2026-04-22

Tester: Claude simulando a "Juan Pérez", un usuario colombiano promedio de 28 años
que acaba de instalar Save porque un amigo le dijo "esa app te ayuda con la plata".

Ambiente: proyecto Supabase `vxdnudkaelhqntrrwdwa` (SAVE, prod).
Método: cada caso envuelto en `BEGIN; … ROLLBACK;` vía MCP. No se persistió nada.
Cuenta usada como víctima: santgodev@gmail.com (tu cuenta real, sin modificarla).

---

## TL;DR

| Severidad | # | Resumen | Estado |
|---|---|---|---|
| 🔴 Crítico  | 1  | Transferencia con monto **negativo** invierte el flujo | ✅ FIX `safety_guards` (2026-04-22) |
| 🔴 Crítico  | 2  | `pockets.budget` se usa como saldo corriente — se pierde el presupuesto original | ✅ FIX `separate_allocated_budget` (2026-04-22) |
| 🔴 Crítico  | 3  | `register_expense` con categoría sin bolsillo → transacción huérfana | ✅ FIX `safety_guards` (fallback a Otros) |
| 🟠 Alto     | 4  | Self-transfer (from=to) crea 2 transacciones falsas | ✅ FIX `safety_guards` |
| 🟠 Alto     | 5  | Transfer/expense con monto 0 crea basura | ✅ FIX `safety_guards` |
| 🟠 Alto     | 6  | Categoría duplicada → `LIMIT 1` sin `ORDER BY`, descuento no-determinista | ✅ FIX `safety_guards` (`ORDER BY created_at ASC`) |
| 🟡 Medio    | 7  | `preferred_currency` default `'USD'` en app colombiana | ✅ FIX `data_quality_guards` (2026-04-28) |
| 🟡 Alto     | 8  | `profiles.monthly_income = 0` bloquea razonamiento del asesor | ✅ FIX `data_quality_guards` (default NULL, CHECK > 0) |
| 🟡 Medio    | 9  | `date_string` no validado — acepta fechas imposibles | ✅ FIX `data_quality_guards` (CHECK formato + rango en RPC) |
| 🟠 Medio    | 10 | `merchant=''` aceptado — la UI va a mostrar espacios vacíos | ✅ FIX `safety_guards` |
| 🟢 Bajo     | 11 | `canonical_merchant` no se puebla (trigger faltante) | ✅ FIX `canonical_merchant_trigger` (2026-04-28) |
| 🟡 Medio    | 12 | `chat_messages.session_id = null` — imposible agrupar conversación | ✅ FIX `data_quality_guards` (default uuid + NOT NULL) |
| 🟢 Bajo     | 13 | OCR deja muchos merchants como "Factura Escaneada" o "Desconocido" | ✅ FIX `ocr-receipt v5` (prompt `ocr.v2` + sanitización + `needs_review`) |

**Status:** **13 de 13 cerrados.** Listo para producción a nivel de
schema/RPCs/Edge Functions. Lo que falta es UX (cliente debe leer
`needs_review` del OCR; barra plan/queda; reasignar presupuesto) y
observabilidad (Sentry).

---

## Detalle por bug

### 🔴 #1 — Transferencia con monto negativo invierte el flujo

**Cómo se reprodujo**
```sql
-- Estado inicial: Comida y Súper $442.500 / Fondo Futuro $189.424
select transfer_between_pockets(
  '<user>',
  '<comida_id>',
  '<fondo_id>',
  -50000
);
```

**Resultado real (BUG):**
- Comida y Súper pasó a **$492.500** (ganó $50k)
- Fondo Futuro pasó a **$139.424** (perdió $50k)

**Por qué es grave:** un usuario puede mover plata de cualquier bolsillo a
cualquier otro simplemente poniendo "-" delante, sin que la validación de
saldo suficiente aplique al bolsillo que realmente pierde plata.

**Fix:**
```sql
-- Al inicio de transfer_between_pockets
IF p_amount <= 0 THEN
  RAISE EXCEPTION 'El monto debe ser positivo (% recibido)', p_amount;
END IF;
```

### 🔴 #2 — `pockets.budget` es presupuesto + saldo a la vez

**Evidencia:** en `register_expense` hay:
```sql
UPDATE pockets SET budget = v_pocket_budget - ABS(p_amount) WHERE id = v_pocket_id;
```
y en `transfer_between_pockets`:
```sql
UPDATE pockets SET budget = budget - p_amount WHERE id = p_from_id;
UPDATE pockets SET budget = budget + p_amount WHERE id = p_to_id;
```

**Problema:** cuando el usuario ve `Comida y Súper: $442.500`, no sabe si ese
número es lo que **le queda** este mes o lo que se **asignó** este mes. Si miro
este pocket dentro de un mes, no puedo responder "¿cuánto gasté en Comida vs.
cuánto asigné?" sin reconstruirlo de `transactions`.

**Fix propuesto (migración):**
```sql
ALTER TABLE pockets ADD COLUMN allocated_budget numeric DEFAULT 0;
ALTER TABLE pockets ADD COLUMN available_balance numeric DEFAULT 0;
-- backfill: allocated = budget, available = budget - sum(expenses of this month)
```
Y actualizar los RPCs para tocar `available_balance`, no `budget`.

### 🔴 #3 — Transacción huérfana (gasto invisible)

**Cómo se reprodujo:**
```sql
select register_expense('<user>','Veterinario',85000,'Mascotas',…);
```
El usuario no tiene un bolsillo con categoría "Mascotas".

**Resultado:** la transacción se crea con `amount=-85000`, pero no afecta
ningún `pockets.budget`. Es un gasto que:
- No aparece reflejado en tu presupuesto.
- Sí apareció en el extracto.
- Nunca te va a disparar un alerta de "te pasaste del bolsillo".

**Fix — una de estas 3 opciones:**
1. **Fallar explícito:** `RAISE EXCEPTION 'No existe bolsillo para la categoría %'`. UX: el cliente muestra "Crea primero el bolsillo".
2. **Crear "Otros" automático:** si no hay match, asociar al bolsillo de categoría "Otros" (creándolo si no existe).
3. **Bolsillo implícito "Sin categoría":** útil para OCR con categoría débil.

Mi voto: **opción 2**, con `"Otros"` como default explícito en el onboarding.

### 🟠 #4 — Self-transfer no está bloqueado

Transferir $10k de Comida-a-Comida deja el `budget` igual pero inserta 2 filas en
`transactions` con `metadata.type in ('internal_transfer_out','internal_transfer_in')`
donde `from_id == to_id`. Contamina historial.

**Fix:**
```sql
IF p_from_id = p_to_id THEN
  RAISE EXCEPTION 'No se puede transferir al mismo bolsillo';
END IF;
```

### 🟠 #5 — Monto 0 crea basura

Tanto `transfer_between_pockets(…, 0)` como `register_expense(…, 0, …)`
se ejecutan sin error y dejan transacciones con `amount = 0`. Regla de
dedo: cualquier monto `<= 0` debe fallar con mensaje claro.

### 🟠 #6 — Categoría duplicada → descuento aleatorio

Si existen 2 pockets con la misma `category` (ej. hoy tienes "Comida y Súper"
categoría "Comida" y "Comida" categoría "Otros"; no hay duplicado exacto
pero el patrón es posible), `register_expense` hace:

```sql
SELECT id, budget INTO v_pocket_id, v_pocket_budget
FROM pockets WHERE user_id = p_user_id AND category = p_category
LIMIT 1;   -- ⚠ sin ORDER BY
```

El descuento puede caer en cualquiera de los dos según el orden físico del
heap. **Fix:** pasar `p_pocket_id` explícito desde el cliente, o usar
`ORDER BY created_at ASC` si queremos "siempre el más viejo" como heurística.

### 🟡 #7 — Default USD en app colombiana

```sql
preferred_currency text DEFAULT 'USD'
```
El cliente puede que formatee con separador de miles equivocado, muestre "$" en
vez de "COP $", o tenga problemas de locale. **Fix de una línea:**
`ALTER TABLE profiles ALTER COLUMN preferred_currency SET DEFAULT 'COP';`

### 🟡 #8 — monthly_income=0 rompe el asesor

Visto en vivo en tus `chat_messages`:

| Fecha | versión | Pregunta | Respuesta |
|---|---|---|---|
| 16:11 | advisor.v1 | ¿Voy a alcanzar a llegar a fin de mes? | ❌ "¿cuánto ingresas mensualmente?" |
| 16:24 | advisor.v2 | Voy a alcanzar a fin de mes? | ✅ "Has gastado $404k, proyectado $1.016k…" |

La nueva versión del prompt ya mitiga el problema; el fix de raíz es capturar el
ingreso en onboarding (pantalla bloqueante) o inferirlo de una transacción
marcada `category='Ingreso'` los últimos 30 días.

### 🟡 #9 — Fecha sin validación

`register_expense('...', 1000, 'Comida', null, '2099-12-31', …)` se acepta.
Nada valida que `date_string` esté dentro de una ventana razonable (+/- 2 años).

### 🟡 #10 — `merchant` vacío

`register_expense('', 1000, …)` inserta fila con `merchant=''`. La UI va a
dejar un espacio en blanco donde debería ir el nombre del comercio.

### 🟢 #11 — `canonical_merchant` no se puebla

Todas las transacciones recientes tienen `canonical_merchant` null. Debería
haber un trigger `BEFORE INSERT` que lo calcule (lowercase + strip).

**Fix (2026-04-28, migración `canonical_merchant_trigger`):**
- Función `canonicalize_merchant(text)` IMMUTABLE: lower + strip puntuación
  común + collapse de espacios + trim. Tildes y guiones se preservan.
- Trigger `trg_transactions_set_canonical` BEFORE INSERT/UPDATE en
  `transactions`: rellena automáticamente si no se pasó explícito; recalcula
  si cambia `merchant`. Respeta canonicales explícitos (RPCs internos
  pueden setear `traslado_bolsillos`, `ingreso_nuevo`, etc.).
- Backfill aplicado: 0/30 rows quedan con `canonical_merchant = NULL`.
- Cobertura: `tests/regressions/regression_003_canonical_merchant.sql`.

### 🟢 #12 — `chat.message.sent` con `session_id = null`

Sin sesión agrupada, no se puede responder preguntas como "¿cuántos turnos
toma el usuario antes de que el advisor le responda bien?".

### 🟢 #13 — OCR entrega "Desconocido" / "Factura Escaneada"

De los últimos `scan_success` events: uno tenía merchant "Desconocido",
otros tenían "Factura Escaneada" como nombre por defecto. Sugiere bajar el
umbral o mejorar el prompt del OCR para que siempre intente un merchant
plausible.

**Fix (2026-04-28, `ocr-receipt` v5 con prompt `ocr.v2`):**
- Prompt nuevo PROHÍBE explícitamente devolver `Desconocido`,
  `Factura Escaneada`, `Recibo`, `Sin nombre`, `N/A`, `null`. Si el modelo
  no ve un merchant claro debe devolver `null`.
- Pide un campo `confidence: "high"|"medium"|"low"`.
- Sanitización defensiva en el Edge Function: aunque OpenAI ignore la
  regla, una regex blacklist en TypeScript fuerza `merchant=null` y
  `confidence=low` antes de continuar.
- Si `auto_register=true` pero el ticket viene débil (`merchant=null` o
  `confidence=low`) → NO se llama a `register_expense`. Se devuelve
  `{ needs_review: true, register_skipped_reason: "low_confidence" }` para
  que el cliente abra un modal "¿Cuál es el comercio?" en vez de guardar
  basura.
- Eventos `scanner.scanned` ahora incluyen `confidence`, `needs_review` y
  `prompt_version` para análisis offline.
- Pendiente del lado del cliente: `Scanner.tsx` debe leer `needs_review`
  y mostrar un input al usuario antes de persistir. Eso ya no es bug del
  backend; es feature de UI.

---

## Lo que no rompió (celebremos un segundo)

- **RLS sobrevive**: el test de leer pockets ajenos con `request.jwt.claims`
  impostado no devolvió filas. La seguridad de fila por usuario está firme.
- **SQL injection en merchant**: `E'Ro\\'bert; DROP TABLE transactions; --'`
  se insertó como literal, no ejecutó. plpgsql parametriza bien.
- **Saldo insuficiente se respeta** (cuando el monto es positivo).
- **Transferencia feliz funciona**: happy path debita y acredita bien, y
  genera las 2 filas en `transactions` con `internal_transfer_*`.
- **chat-advisor v2** ya razona con el contexto cuando tiene datos — la
  respuesta de las 16:24 es objetivamente mejor que la de las 16:11.

---

## Top 3 fixes a meter esta semana

```sql
-- Migración: 2026-04-23_safety_guards.sql
CREATE OR REPLACE FUNCTION public.transfer_between_pockets(
  p_user_id uuid, p_from_id uuid, p_to_id uuid, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from_name text; v_to_name text; v_from_budget numeric;
  v_from_cat text; v_to_cat text;
BEGIN
  -- [nuevo] validaciones de entrada
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo (recibido: %)', p_amount;
  END IF;
  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'No puedes transferir al mismo bolsillo';
  END IF;

  SELECT name, budget, category INTO v_from_name, v_from_budget, v_from_cat
    FROM pockets WHERE id = p_from_id AND user_id = p_user_id FOR UPDATE;
  IF v_from_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo origen no existe o no te pertenece';
  END IF;

  SELECT name, category INTO v_to_name, v_to_cat
    FROM pockets WHERE id = p_to_id AND user_id = p_user_id FOR UPDATE;
  IF v_to_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo destino no existe o no te pertenece';
  END IF;

  IF v_from_budget < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponible: %, Requerido: %', v_from_budget, p_amount;
  END IF;

  UPDATE pockets SET budget = budget - p_amount WHERE id = p_from_id;
  UPDATE pockets SET budget = budget + p_amount WHERE id = p_to_id;

  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
  VALUES
    (p_user_id, 'Hacia: '  || v_to_name,   -p_amount, v_from_cat, 'repeat',
     to_char(NOW(),'YYYY-MM-DD'),
     jsonb_build_object('type','internal_transfer_out','from_id',p_from_id,'to_id',p_to_id)),
    (p_user_id, 'Desde: '  || v_from_name,  p_amount, v_to_cat,   'repeat',
     to_char(NOW(),'YYYY-MM-DD'),
     jsonb_build_object('type','internal_transfer_in','from_id',p_from_id,'to_id',p_to_id));

  RETURN jsonb_build_object('success', true, 'transferred', p_amount);
END; $$;
```

Y para `register_expense` análogo: `IF p_amount <= 0 THEN RAISE;`, validar merchant
no vacío, y resolver la política de "no hay bolsillo" según la opción elegida.

## Cómo correr esto otra vez

1. Desde Claude: "corre los tests SQL del proyecto SAVE usando Supabase MCP y mi
   user santgodev@gmail.com". Yo uso este archivo como guión.
2. Desde tu terminal con la CLI de Supabase: ver `tests/README.md` opción A.
3. Local: `supabase start` y luego `./tests/run_all.sh`.

Cada corrida nueva → agregar entrada con fecha en `RESULTS.md`.
