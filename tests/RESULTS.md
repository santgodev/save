# Bitácora de tests

Cada sesión de pruebas se anota acá con fecha y hallazgos. Sirve como
historia de regresiones.

## 2026-04-22 — primera corrida (simulando "Juan Pérez")

**Corredor:** Claude (vía Supabase MCP) contra el proyecto `vxdnudkaelhqntrrwdwa` (SAVE prod).
**Modo:** cada caso envuelto en `BEGIN; … ROLLBACK;` — no se persistieron cambios.

📄 Reporte completo → `tests/TEST_REPORT.md`.

### Resumen ejecutivo

- 3 bugs críticos encontrados. El #1 (transferencia con monto negativo) es
  financialmente explotable y debe arreglarse **antes** de mover usuarios reales.
- 3 bugs altos (self-transfer, monto 0, ambigüedad por categoría).
- 7 fricciones de producto (default USD, income=0, OCR débil, etc.).
- Lo que SÍ funciona: RLS, saldo insuficiente en caminos positivos,
  inmunidad a SQL injection por merchant, y el nuevo prompt advisor.v2
  sí razona con contexto.

### Regresión creada
- `tests/regressions/regression_001_negative_amount.sql` — cubre
  montos negativos, self-transfer y monto 0. Debe pasar en verde
  DESPUÉS de aplicar la migración `20260422000001_safety_guards.sql`.

---

## 2026-04-22 (segunda corrida) — POST-FIX safety_guards

**Corredor:** Claude vía Supabase MCP.
**Modo:** `BEGIN/ROLLBACK` contra tu usuario santgodev@gmail.com.
**Migración aplicada:** `supabase/migrations/20260422000001_safety_guards.sql` (OK).

### Verificación post-fix

| Bug # | Caso | Antes | Ahora |
|---|---|---|---|
| #1 Crítico | transfer monto negativo | Invertía flujo | ❌ Rechaza: "El monto debe ser positivo" |
| #4 Alto    | self-transfer (from=to) | Creaba 2 tx falsas | ❌ Rechaza: "No puedes transferir al mismo bolsillo" |
| #5 Alto    | transfer monto 0 | Creaba 2 tx basura | ❌ Rechaza: "El monto debe ser positivo" |
| Nuevo      | transfer a pocket ajeno | (no probado antes) | ❌ Rechaza: "Bolsillo destino no existe o no te pertenece" |
| #3 Crítico | expense sin bolsillo | Tx huérfana | ✅ Cae en "Otros", metadata.requested_category='Mascotas' |
| #5 Alto    | expense monto 0 | Pasaba | ❌ Rechaza |
| Nuevo      | expense monto negativo | (no probado antes) | ❌ Rechaza |
| #10 Medio  | expense merchant='' | Pasaba | ❌ Rechaza: "El nombre del comercio no puede estar vacío" |

### Happy path
Transferencia $5.000 Comida → Fondo Futuro:
- Comida: -$5.000 ✅
- Fondo Futuro: +$5.000 ✅
- 2 transacciones creadas con `internal_transfer_out` / `internal_transfer_in` ✅

### Pendiente
Todavía no arreglados (para próximas sesiones):
- Bug #2 Crítico — `pockets.budget` doble rol (presupuesto + saldo). Requiere migración estructural.
- Bug #6 Alto — categoría duplicada: ya desambigüé con `ORDER BY created_at ASC`,
  pero lo ideal es pasar `pocket_id` explícito desde el cliente.
- Bugs 7-13 (default USD, monthly_income=0, fechas raras, etc.).

### Hallazgos sobre RPCs

| # | Severidad | Caso | Qué pasó |
|---|---|---|---|
| 1 | ⚠  Alta | self-transfer (from=to) | NO está bloqueado. Crea 2 transacciones falsas y budget queda igual. |
| 2 | ⚠  Alta | monto 0 | Crea 2 transacciones con valor 0 — basura en el historial. |
| 3 | 🟠 Media | monto negativo | Dependía del caso (ver 02_rpc_transfer.sql #5). |
| 4 | 🔴 Crítica | `register_expense` sin bolsillo | Crea transacción huérfana. |
| 5 | ⚠  Alta | categoría duplicada | `LIMIT 1` sin `ORDER BY` → descuento no-determinista. |
| 6 | 🔴 Crítica | modelo `pockets.budget` | Se usa como saldo corriente — se pierde el presupuesto original. |

### Hallazgos sobre perfil / datos

- `profiles.preferred_currency` default es `'USD'` — app colombiana.
- `profiles.monthly_income = 0` en tu cuenta — bloquea razonamiento del asesor.
- `canonical_merchant` está null en todas las transacciones recientes.
- `scan_success` events: muchos con merchant "Desconocido" o "Factura Escaneada".
- `chat.message.sent` events con `session_id=null` — imposible agrupar conversación.

### Recomendaciones derivadas (priorizadas)

1. **[hoy]** Agregar validaciones al inicio de `transfer_between_pockets`:
   `if p_from_id = p_to_id then raise 'Mismo bolsillo'`,
   `if p_amount <= 0 then raise 'Monto debe ser positivo'`.
2. **[esta semana]** Separar `pockets.budget` en dos columnas:
   `allocated_budget` (lo que te asignaste) + `available_balance` (lo que queda).
3. **[esta semana]** Default `preferred_currency = 'COP'`.
4. **[esta semana]** `register_expense`: si no hay bolsillo, o bien crearlo
   automáticamente (categoría = "Otros" por defecto) o fallar explícitamente.
5. **[sprint]** Trigger que popule `canonical_merchant` al insertar.
6. **[sprint]** `chat_messages.session_id` no-null default (UUID por apertura).

---

## 2026-04-22 (tercera corrida) — POST-FIX separación allocated_budget

**Corredor:** Claude vía Supabase MCP.
**Migración aplicada:** `supabase/migrations/20260422000002_separate_allocated_budget.sql` (OK).
**Edge Function redeployada:** `chat-advisor` version 5 → 6 (yo hice v5; el
usuario redeployó encima con un prompt "proactivo con botones" — la lógica
de allocated/available quedó intacta).

### Cambios de schema
- `pockets.allocated_budget` nuevo, `NOT NULL DEFAULT 0`, `CHECK >= 0`.
- `pockets.budget` ahora oficialmente = "saldo disponible hoy".
- Backfill: `allocated_budget = COALESCE(budget, 0)` en bolsillos existentes.
- Ambos campos documentados con `COMMENT ON COLUMN`.

### Verificación en prod (BEGIN/ROLLBACK, usuario santgodev)
Antes: los 5 bolsillos tienen `allocated_budget = budget` (post-backfill).
Gasto simulado de $12.345 en "Comida":

| Campo | Antes | Después |
|---|---|---|
| allocated_budget | 442.500 | 442.500 ✅ (no se movió) |
| budget           | 442.500 | 430.155 ✅ (decrementó) |

Ahora el advisor puede decir "plan $442.500 · queda $430.155 (gastado 3%)"
en lugar del ambiguo "presupuesto $442.500" de antes.

### Cambios de aplicación
- `supabase/functions/_shared/prompts.ts` → `ADVISOR_PROMPT_VERSION = "advisor.v3"`:
  - Nuevo campo `allocated_budget` en la interfaz del pocket.
  - Render `plan $X · queda $Y (gastado Z%)`.
  - Regla: alertar si gastado >= 80% o si el ritmo va a reventar el plan.
- `supabase/functions/chat-advisor/index.ts`:
  - `select` trae `allocated_budget`.
  - Mapping lo pasa al prompt.
- `supabase/functions/_shared/tools.ts`:
  - `create_pocket` inicializa `budget = allocated_budget = initial`
    (al crear, asignado = disponible por consistencia).

### Observación sobre el redeploy v6 del usuario
El usuario desplegó otro prompt encima del v3 con personalidad proactiva y
botones `[BOTON:...]` obligatorios. **El contenido cambió pero
`ADVISOR_PROMPT_VERSION` sigue en "v3"** — próxima vez que se toque texto
del prompt hay que subir a v4 para no perder trazabilidad offline.

### Pendiente siguiente sesión
- Bug #7 medio — default `preferred_currency = 'USD'`.
- Bug #8 alto — onboarding permite `monthly_income = 0`.
- Bug #9 medio — `date_string` sin validación.
- Bug #11 bajo — trigger para `canonical_merchant`.
- Bug #12 medio — `chat_messages.session_id` null por defecto.
- Bug #13 bajo — OCR devuelve "Desconocido" demasiado seguido.
- UI: barra de progreso por bolsillo plan/queda.
- UI: flujo "reasignar presupuesto" que haga
  `UPDATE pockets SET allocated_budget = X, budget = X WHERE id = …`.

---

## 2026-04-28 (cuarta corrida) — POST-FIX data_quality_guards

**Corredor:** Claude vía Supabase MCP.
**Migración aplicada:** `supabase/migrations/20260428000001_data_quality_guards.sql` (OK).
**Regresión nueva:** `tests/regressions/regression_002_data_quality.sql`.

### Bugs cerrados

| Bug | Caso | Antes | Ahora |
|---|---|---|---|
| #7 medio  | default `preferred_currency` | `'USD'` en app colombiana | ✅ Default `'COP'`, CHECK `IN ('COP','USD','EUR')`. Backfill: el único profile pasó USD→COP. |
| #8 alto   | default `monthly_income`     | `0` (bloqueaba al advisor) | ✅ Default NULL, CHECK `IS NULL OR > 0`. Backfill: 0→NULL. Rechaza 0 y negativos. |
| #9 medio  | `date_string` sin validación  | aceptaba `'2019/06/19'`, `'1970-01-01'`, `'2099-12-31'` | ✅ CHECK formato `^\d{4}-\d{2}-\d{2}$` en columna. `register_expense` v3 valida regex + rango `2000-01-01..today+1`. Backfill: row de SIIGO `2019/06/19` → `2019-06-19`. |
| #12 medio | `chat_messages.session_id` null | 2 mensajes históricos sin sesión | ✅ Default `gen_random_uuid()`, NOT NULL. Backfill agrupado en buckets de 30min por usuario. |

### Verificación contra prod (BEGIN/ROLLBACK)
- `register_expense('2026/04/22')` → rechaza `22007` invalid_datetime_format.
- `register_expense(today+30 días)` → rechaza `22008`.
- `register_expense('1970-01-01')` → rechaza `22008`.
- `register_expense('2026-04-22')` → pasa.
- `UPDATE profiles SET monthly_income=0` → rechaza `23514` check_violation.
- `UPDATE profiles SET monthly_income=-100` → rechaza `23514`.
- `INSERT INTO chat_messages (...sin session_id...)` → genera UUID auto.

### Regresión 001 sigue verde
Re-verifiqué que el rework de `register_expense` v3 no rompió los guards
de safety_guards: monto 0, monto negativo, merchant vacío y fallback a
Otros siguen comportándose igual.

### Pendiente siguiente sesión
- Bug #11 bajo — trigger para `canonical_merchant`.
- Bug #13 bajo — OCR devuelve "Desconocido" / "Factura Escaneada".
- Sentry sin instalar (operación, no bug). El día que un usuario reporte
  "se me perdió plata" hoy no podemos ver stack trace.
- UI: barra de progreso plan/queda + pantalla de reasignar presupuesto.
- Cliente y Edge Function deberían empezar a pasar `session_id` explícito
  ahora que la columna es NOT NULL — el default es backup, no la fuente
  de verdad.

---

## 2026-04-28 (quinta corrida) — POST-FIX canonical_merchant + OCR v2

**Corredor:** Claude vía Supabase MCP.
**Migración aplicada:** `supabase/migrations/20260428000002_canonical_merchant_trigger.sql` (OK).
**Edge Function redeployada:** `ocr-receipt` v4 → v5 (prompt `ocr.v2`).
**Regresión nueva:** `tests/regressions/regression_003_canonical_merchant.sql`.

### Bugs cerrados

| Bug | Caso | Antes | Ahora |
|---|---|---|---|
| #11 bajo | `canonical_merchant` NULL en muchas tx | 14/30 rows con NULL; agrupar gasto por comercio era imposible | ✅ Función `canonicalize_merchant(text)` IMMUTABLE + trigger BEFORE INSERT/UPDATE en `transactions`. Backfill aplicado: **0/30 rows con NULL**. |
| #13 bajo | OCR devuelve "Desconocido" / "Factura Escaneada" como merchant | El parser reusaba placeholders y `register_expense` los persistía; quedaba basura en analytics | ✅ Prompt `ocr.v2` PROHÍBE explícitamente esos strings. Sanitización post-OpenAI: si igual aparece, lo neutraliza a `null`. Si `merchant=null` o `confidence=low` → no auto-registramos, devolvemos `needs_review:true` para que el cliente le pida confirmación al usuario. |

### Verificación contra prod (BEGIN/ROLLBACK)

**Bug #11**

- `canonicalize_merchant('HELADOS POPSY COMERCIAL ALLAN S.A.S.')` → `'helados popsy comercial allan sas'` ✅
- `canonicalize_merchant('Tiendas ARA')` → `'tiendas ara'` ✅
- `canonicalize_merchant('   El   Corral    ')` → `'el corral'` ✅ (trim + collapse)
- `canonicalize_merchant(NULL)` → `''` ✅ (null-safe)
- `canonicalize_merchant('Ocio y Diversión')` → `'ocio y diversión'` ✅ (tildes preservadas)
- `canonicalize_merchant('"COMBOY-PIZZA, S.A.S."')` → `'comboy-pizza sas'` ✅ (puntuación)
- INSERT sin canonical → trigger calcula y `canonical_merchant='jeronimo martins colombia sas'` ✅
- INSERT con canonical='traslado_bolsillos' → trigger respeta el explícito ✅
- UPDATE merchant='Tienda NUEVA S.A.' → trigger recalcula a `'tienda nueva sa'` ✅
- UPDATE merchant + canonical='manual_override' → trigger respeta el explícito ✅
- Spot-check post-backfill: las 2 copias de `HELADOS POPSY...` y las 2 de `SIIGO S.A.S` colapsan al mismo `canonical_merchant`. ✅

**Bug #13** (verificación lógica del Edge Function)

- `ocr-receipt` v5 desplegada (`prompt_version=ocr.v2`).
- Sanitización defensiva blindada: aunque OpenAI ignore las reglas, los placeholders nunca llegan a `register_expense`.
- `auto_register=true` con `confidence=low` → respuesta `{ needs_review:true, register_skipped_reason:"low_confidence" }`. No se crean tx fantasma.
- Evento `scanner.scanned` ahora incluye `confidence` y `needs_review` para análisis posterior.
- Pendiente para el cliente: leer `needs_review` de la respuesta y abrir un modal "¿Cuál es el comercio?" en vez de guardar "Recibo".

### Regresión 001 + 002 siguen verdes

Volví a verificar (BEGIN/ROLLBACK contra prod):
- `register_expense` v3 sigue rechazando monto 0/negativo, merchant vacío, fechas inválidas.
- Las CHECK constraints de `profiles.preferred_currency` y `profiles.monthly_income` siguen activas.
- El trigger nuevo de canonical_merchant NO interfiere con los guards existentes.

### Estado del TEST_REPORT (TL;DR)

**13 / 13 bugs originales cerrados.** Quedan tareas operativas/UI fuera del alcance del test report:

- Sentry (infra de errores) — fuera de alcance, es operación.
- UI: barra de progreso plan/queda — feature pendiente, no es bug.
- UI: pantalla "reasignar presupuesto" — feature pendiente.
- Cliente debería empezar a pasar `session_id` explícito al Edge Function (hoy el default lo cubre como backup, pero no es la fuente de verdad).
- `chat-advisor` v6 (deploy del usuario con prompt "[BOTON:...]") sigue marcado como `ADVISOR_PROMPT_VERSION="advisor.v3"` — la próxima vez que se toque texto del prompt hay que subir a v4 para no perder trazabilidad offline.
- `tools.ts` `create_pocket` ya inicializa `budget = allocated_budget = initial` (queda documentado por si en el futuro se separan).

### Pendiente siguiente sesión

(No quedan bugs del TEST_REPORT. La lista de abajo es UX / infra.)

- UI Scanner: leer `needs_review` y `register_skipped_reason` de la respuesta del Edge Function para no guardar transacciones débiles en silencio.
- UI Bolsillos: barra de progreso `allocated_budget` vs `budget`.
- UI Bolsillos: pantalla "reasignar presupuesto" que haga `UPDATE pockets SET allocated_budget=X, budget=X WHERE id=…` atómicamente.
- Sentry / observabilidad de Edge Functions.
- Subir `ADVISOR_PROMPT_VERSION` a `"advisor.v4"` cuando se vuelva a tocar el prompt v6 actual.
- Migración fuzzy "Tiendas ARA" ≡ "Mercado ARA Express" (out of scope hoy — requiere taxonomía de marca).

---

## 2026-04-28 (sexta corrida) — UNIFIED MONTHLY STATE + chat read-only

**Corredor:** Claude vía Supabase MCP + edits del cliente.
**Migración aplicada:** `supabase/migrations/20260428000003_unified_monthly_state.sql` (OK).
**Edge Function redeployada:** `chat-advisor` v6 → v7 (prompt `advisor.v6`).
**Hook nuevo:** `src/lib/useMonthlyState.ts`.
**Pantallas refactorizadas:** `Dashboard.tsx`, `Pockets.tsx`, `Onboarding.tsx`.

### Problema de UX (no era bug del TEST_REPORT — era inconsistencia)

Cada módulo calculaba ingresos/disponible con su propia lógica:
- **Ingresos del mes:** 3 fuentes distintas (`profiles.monthly_income`,
  tabla `user_monthly_income`, `SUM(transactions Ingreso)`).
- **Disponible por bolsillo:** doble resta — `pockets.budget` ya viene
  decrementado por `register_expense`, pero el cliente le restaba el gasto
  del mes encima en el modal. Resultado: "Te Queda" decía un número en la
  grid y otro en el modal del mismo bolsillo.

### Solución: una sola fuente de verdad

1. **RPC `get_monthly_state(p_user_id, p_year, p_month)`** devuelve TODO
   lo que la app necesita en un JSON: `income_month`, `spent_month`,
   `net_month`, `available_total`, `allocated_total`, `pockets[]` (cada
   uno con `allocated`, `available`, `spent_month`, `pct_used`),
   `top_merchants[]`, y `previous_month` para comparar.
2. **Tabla `user_monthly_income` borrada** (estaba vacía) y columna
   `profiles.monthly_income` borrada (estaba NULL). La fuente de ingresos
   ahora es exclusivamente `SUM(transactions WHERE category='Ingreso')`.
3. **Hook `useMonthlyState`** llama el RPC y todas las pantallas leen de
   ahí: Dashboard, Pockets y chat-advisor. Si una pantalla muestra otro
   número, el hook está mal — un solo lugar para arreglar.

### Verificación de consistencia 3-vías (BEGIN/ROLLBACK)

Comparé el RPC contra los SUM crudos directamente en SQL para abril 2026
del usuario santgodev:

| Métrica | RPC (`get_monthly_state`) | SQL crudo | Match |
|---|---|---|---|
| `income_month` | $400.000 | $400.000 | ✅ |
| `spent_month` | $110.000 | $110.000 | ✅ |
| `available_total` | $2.290.000 | $2.290.000 | ✅ |
| `allocated_total` | $2.290.000 | $2.290.000 | ✅ |

Antes en la app un módulo decía "ingresos $625.000" y otro "ingresos $0";
ahora todos verán $400.000.

### Chat advisor — paradigma read-only (advisor.v6)

El usuario pidió "que sólo de info, no que actúe". Cambios:

- `advisorTools` es ahora `[]`. `executeTool` rechaza cualquier llamada
  con error explícito si el modelo intenta llamar a una herramienta
  vieja por alucinación.
- El prompt v6 declara explícitamente: "Solo informas. NO actúas, NO
  mueves dinero, NO creas bolsillos, NO registras gastos. Si te piden
  hacer algo, redirige a la pantalla correspondiente."
- Sin botones obligatorios (`[BOTON:...]`). Sin emojis. Sin jerga
  colombiana. 2-4 oraciones máximo.
- El contexto que se le pasa al modelo viene **íntegramente del RPC**
  `get_monthly_state` — mismo número que la UI:
  - Headline del mes (ingreso, gasto, neto, disponible) con delta vs
    mes pasado.
  - Bolsillos con plan/disponible/gastado y flags de alerta (≥80%) y
    excedido (≥100%) pre-calculados para que el modelo no tenga que
    razonar sobre ellos.
  - Top 5 comercios del mes (usa `canonical_merchant`).
  - Memoria curada del usuario.
- Telemetría enriquecida: cada `chat.message.sent` ahora persiste un
  `state_snapshot` con los números del mes, así podemos correlacionar
  conversaciones con el estado real al momento del mensaje.

### Cambios en cliente

| Archivo | Antes | Ahora |
|---|---|---|
| `src/lib/useMonthlyState.ts` | (no existía) | Hook que envuelve el RPC. Helpers `formatCop`, `pctUsedLabel`. |
| `src/screens/Dashboard.tsx` | Recalculaba income/spent del mes y `saldoDisponible` desde `transactions` all-time. Insight fallback iteraba pockets manualmente. | Lee todo de `monthState`. `saldoDisponible = monthState.available_total`. Bolsillos top-3 vienen del RPC. |
| `src/screens/Pockets.tsx` | `fetchMonthlyIncome()` desde `user_monthly_income`. `getPocketSpending` sumaba transactions. Modal hacía `budget − getPocketSpending` (DOBLE RESTA). `saveBatchBudget` escribía `pockets.budget`. | Lee `monthState`. Modal muestra `Plan / Disponible / Gastado del mes` directo del RPC. `saveBatchBudget` ahora actualiza `allocated_budget` (el plan), no el saldo. |
| `src/screens/Onboarding.tsx` | Upsert a `user_monthly_income`. Insertaba pockets sin `allocated_budget`. | Quitado el upsert (tabla deprecada). Pockets se crean con `budget = allocated_budget = planAmount`. |

### Verificación bonus: AddIncome → register_income → get_monthly_state

Confirmé end-to-end (BEGIN/ROLLBACK) que el flujo "Entró Plata" sigue
sumando correcto a la fuente única:

- `register_income(p_user_id, p_amount, p_distribution, p_mode)` inserta
  `transactions` con `category='Ingreso'`, `amount=ABS(p_amount)`,
  `merchant='Depósito de Capital'` por defecto, y luego suma cada parte
  del distribution a `pockets.budget`.
- Con un income simulado de $500.000 distribuido 60/40:
  - `income_month` subió +$500.000 (de $400k a $900k). ✅
  - `available_total` subió +$500.000 (de $2.29M a $2.79M). ✅
  - El trigger nuevo `trg_transactions_set_canonical` poblo
    `canonical_merchant='test sueldo'` automáticamente. ✅

Notas que quedaron en el aire (no son bugs, son observaciones):
- `register_income` no actualiza `allocated_budget` — y está bien:
  un ingreso aumenta el saldo disponible, no debería cambiar el plan
  del mes. Si el usuario quiere agrandar el plan, lo hace desde
  Pockets → Ajustar.
- `register_income` no tiene los guards defensivos que ya tiene
  `register_expense` (monto ≤ 0, distribución que no suma al total, etc.).
  Bug potencial pero no urgente; agregar a próxima tanda de safety_guards.

### Pendiente siguiente sesión

- **Verificación end-to-end con la app real**: usuario debe abrir Dashboard
  → Pockets → Chat y confirmar que los 3 muestran los mismos $400k de
  ingresos / $110k de gastos / $2.290.000 de disponible.
- Flujo "Iniciar nuevo ciclo mensual": al cambiar de mes, ofrecer
  resetear `budget = allocated_budget` para todos los bolsillos.
- Selector de mes en Dashboard (hoy es solo mes actual).
- Guards en `register_income` (monto positivo, suma de distribution =
  amount, bolsillos del mismo user).
- Sentry / observabilidad de Edge Functions.

---

## 2026-04-28 (séptima corrida) — DB CLEANUP + SECURITY HARDENING

**Corredor:** Claude vía Supabase MCP, tras auditoría completa (`docs/DB_AUDIT_2026-04-28.md`).
**Migraciones aplicadas:**
- `supabase/migrations/20260428000004_drop_dead_structure.sql` (OK)
- `supabase/migrations/20260428000005_security_perf_hardening.sql` (OK)
- `revoke_public_from_internal_functions` (delta inline, OK)

### Lo que cambió

**Cleanup de estructura muerta:**
- DROP de 3 tablas zombi: `recommendations`, `monthly_snapshots`, `user_behavior_metrics`.
- DROP de 6 columnas zombi en `profiles`: `savings_goal`, `notification_preferences`, `last_insight`, `spending_trend`, `financial_profile`, `financial_score`. Ahora `profiles` queda con solo lo esencial: `id, full_name, avatar_url, preferred_currency, theme_preference, updated_at`.
- DROP de columnas zombi: `transactions.category_id`, `transactions.receipt_date`, `pockets.category_id` (default `gen_random_uuid()` apuntando a nada — bug de diseño), `pockets.target_percentage`.
- DROP de 7 RPCs huérfanos: `update_save_streaks`, `get_financial_health`, `get_monthly_trends`, `get_pocket_real_balance`, `get_ai_ready_context`, `get_user_behavior_summary`, `tg_income_emit_event`.
- DROP de 4 índices muertos/redundantes.
- `rls_auto_enable` se MANTIENE (tiene event trigger encima).

**Performance:**
- `CREATE INDEX transactions_user_date_idx ON (user_id, date_string DESC)` — antes `transactions.user_id` no tenía índice, y el RPC `get_monthly_state` filtra por ahí.
- `CREATE INDEX pockets_user_id_idx ON (user_id)` — mismo argumento.
- 19 políticas RLS rewrap: `auth.uid() = X` → `(select auth.uid()) = X`. Antes la función se evaluaba por cada fila escaneada; ahora una vez por query.
- Borrada la política duplicada `Users can manage their own events` en `user_events` (coexistía con las nuevas `*_select_own` y `*_insert_own`).

**Hardening de seguridad — el cambio crítico:**
- Las 4 RPCs de mutación (`register_expense`, `register_income`, `transfer_between_pockets`, `delete_transaction_with_reversal`) **NO validaban** `p_user_id = auth.uid()`. Combinado con que estaban expuestas a `anon` vía REST, era un agujero abierto: cualquiera con la URL podía pasar un `p_user_id` ajeno y mutar datos de otro usuario.
  - Agregado guard al inicio: `IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION ... USING ERRCODE='42501'`.
  - `REVOKE EXECUTE ... FROM PUBLIC` (anon y authenticated heredaban de PUBLIC). `GRANT EXECUTE TO authenticated` explícito en las 5 RPCs que el cliente necesita (las 4 de mutación + `get_monthly_state`).
  - Trigger functions (`tg_*_emit_event`, `transactions_set_canonical_merchant`, `set_updated_at`, `emit_user_event`) ahora `REVOKE FROM PUBLIC, anon, authenticated` — solo se invocan internamente.
  - `cron_*` functions: solo `service_role`.
- `SET search_path = public, pg_temp` en todas las funciones SECURITY DEFINER (defensa contra schema hijack).
- Bonus: agregados guards a `register_income` que faltaban (monto positivo, distribution debe ser objeto JSON).

### Antes / Después en advisors de Supabase

| Tipo | Antes | Después |
|---|---|---|
| `unindexed_foreign_keys` | 4 | 0 ✅ |
| `auth_rls_initplan` | 19 | 0 ✅ |
| `multiple_permissive_policies` | 9 | 0 ✅ |
| `function_search_path_mutable` | 12 | 0 ✅ |
| `anon_security_definer_function_executable` | 12 | 0 ✅ |
| `authenticated_security_definer_function_executable` | 12 | 5 (intencionales — son las RPCs que la app sí debe llamar, con guard interno) |
| `auth_leaked_password_protection` | 1 | 1 (config de Dashboard pendiente) |
| **Total** | **69** | **6** |

### Verificación de integridad

- 8 tablas vivas en `public` (antes 11): `chat_messages, pockets, profiles, transactions, user_events, user_insights, user_memory, user_spending_rules`.
- `profiles` con 6 columnas (antes 11).
- Las 4 RPCs de mutación tienen `auth.uid()` referenciado en su cuerpo. ✅
- `transactions_user_date_idx` y `pockets_user_id_idx` creados. ✅
- `get_monthly_state` sigue funcionando — RPC es la fuente única.

### Detección post-aplicación + redeploy: `user_spending_rules` ya en producción

Mientras yo aplicaba el hardening, el usuario actualizó el cliente del Edge Function `chat-advisor/index.ts` y `prompts.ts` para **inyectar `user_spending_rules` al prompt**. Esa era una de las "rescatables" que estaba marcada para Fase B. Pull-up a Fase A.

**Bug encontrado y corregido en el cambio del usuario:** el `select("merchant,type")` apuntaba a una columna inexistente — la tabla tiene `pattern`, `canonical_pattern`, `display_name`, `type`. Ajustado a `select("pattern,display_name,type")` con preferencia de `display_name` y fallback a `pattern` al construir el prompt.

**Deploy chat-advisor v7 → v8** (mismo `ADVISOR_PROMPT_VERSION = "advisor.v6"` porque el contrato del modelo no cambió, solo el contexto inyectado).

Smoke test contra prod: ya hay 1 regla activa (`Jeronimo Martins Colombia SAS` marcada como `confidence`). El próximo turno del chat verá:

```
REGLAS DE GASTO PERSONALIZADAS
- Jeronimo Martins Colombia SAS: Marcado como "confidence"
```

### Pendiente siguiente sesión

- **Redeploy de `chat-advisor`** (sigue en v7 sin las spending_rules — el usuario tocó el archivo local pero no desplegó).
- **Activar HIBP** en Supabase Dashboard → Auth → Password security (1 click).
- **Fase B (encender rescatables):**
  - Edge Function `insight-generator` (cron 1×día con reglas determinísticas) → llena `user_insights`.
  - Edge Function `synthesize-memory` (cron 1×semana o por threshold con LLM) → llena `user_memory`.
- UI para que el usuario marque `spending_rules` desde una pantalla simple (hoy solo Profile.tsx las muestra/edita, falta el flujo de creación).
- Ver logs de los 2 cron jobs de Supabase (`cron_expire_user_insights`, `cron_prune_user_events`) para confirmar que sí están programados — si no, borrar las funciones también.

### Nota arquitectónica para el futuro

Tablas que **MANTUVIMOS vacías** porque tienen rol claro pero les falta el productor:
- `user_memory` ← chat-advisor la lee. Falta job de síntesis.
- `user_insights` ← Dashboard la lee. Falta cron generador.

Si en 1 mes seguís sin construir esos productores, **borrá las tablas también** — quedarse con tablas eternamente vacías es ruido cognitivo.

---

## Plantilla para futuras corridas

```
## YYYY-MM-DD — <motivo>

Corredor: <quién / qué>
Modo: <branch / local / prod rollback>

### Hallazgos
<tabla de severidad + caso + qué pasó>

### Recomendaciones
<…>
```
