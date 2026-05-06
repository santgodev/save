# Save — Arquitectura (estado actual)

Última revisión: 2026-04-29.

Save es una app colombiana de presupuesto personal: el usuario crea
**bolsillos** (categorías de gasto), registra gastos manualmente o
escaneando facturas, distribuye sus ingresos entre bolsillos y consulta
a un asesor IA (read-only) sobre sus números.

Este documento es el mapa actual del sistema. Si vienes a tocar algo
empieza aquí.

---

## Stack en una línea

**React Native (Expo SDK 54) + Supabase (PostgreSQL 15 + Edge Functions Deno)
+ OpenAI gpt-4o-mini + Google Vision OCR.**

---

## El principio rector: Source of Truth única

Todo número financiero que el usuario ve viene del mismo RPC SQL:

```
public.get_monthly_state(p_user_id uuid, p_year int, p_month int) RETURNS jsonb
```

Devuelve un JSON con TODO lo necesario para representar un mes:
ingreso_mensual, gasto_mensual, neto, bolsillos (plan/disponible/gastado/%),
top_merchants, comparación con mes anterior, currency.

**Ningún cliente recalcula nada por su cuenta.** Si una pantalla muestra
otro número, está mal — debe pedirlo al RPC.

Consumidores actuales:
- `useMonthlyState()` hook (cliente) → Dashboard, Pockets.
- `chat-advisor` Edge Function → cada turno del chat.
- `insight-generator` Edge Function → cron diario.

---

## DB — public schema actual

Después del cleanup de la 7ª corrida (`drop_dead_structure` +
`security_perf_hardening`), las tablas vivas son **8**:

| Tabla | Filas (prod) | Rol |
|---|---|---|
| `profiles` | 1 | id, full_name, avatar_url, preferred_currency, theme_preference, updated_at. **Mínima.** |
| `transactions` | 30+ | merchant, amount (negativo = gasto, positivo = ingreso), category, date_string (`YYYY-MM-DD`), canonical_merchant (auto-poblado por trigger), metadata jsonb. |
| `pockets` | 13 | name, category, allocated_budget (plan), budget (saldo disponible), icon. **`budget` es cache decrementado por `register_expense`/`transfer`.** |
| `user_events` | 138+ | Append-only behavioural log. event_type + jsonb. Alimenta análisis offline. |
| `chat_messages` | n | role + content + tool_calls + session_id. NOT NULL session_id (default `gen_random_uuid()`). |
| `user_memory` | 0 hoy | Hechos durables del usuario sintetizados por LLM. UNIQUE (user_id, key). Productor: `synthesize-memory`. |
| `user_insights` | 0 hoy | Alertas proactivas. severity + dedupe_key + status + expires_at. Productor: `insight-generator`. |
| `user_spending_rules` | 1 | Patrón de comercio + tipo (confidence/monitor/reduce). Editado desde Profile y Expenses. |

**Tablas borradas en la 7ª corrida** (referencia histórica):
`recommendations`, `monthly_snapshots`, `user_behavior_metrics`,
`user_monthly_income`. Si necesitas snapshots o métricas de comportamiento,
recréalas con propósito y un productor real.

### Columnas removidas de `profiles`

`savings_goal`, `notification_preferences`, `last_insight`, `spending_trend`,
`financial_profile`, `financial_score`, `monthly_income`. Ninguna se usaba.
Si reaparece la necesidad, se recrean.

### Triggers vivos

| Trigger | Tabla | Función | Para qué |
|---|---|---|---|
| `trg_transactions_set_canonical` | transactions | `transactions_set_canonical_merchant` | Pobla `canonical_merchant` automáticamente al INSERT/UPDATE. |
| `transactions_emit_event` | transactions | `tg_transactions_emit_event` | Emite a `user_events` para analytics. |
| `pockets_emit_event` | pockets | `tg_pockets_emit_event` | Idem para pockets. |
| `user_memory_set_updated_at` | user_memory | `set_updated_at` | Mantiene `updated_at` fresco. |

### Funciones / RPCs activos

**Lectura (read-only):**
- `get_monthly_state(uuid, int, int)` — source of truth (descrito arriba).
- `canonicalize_merchant(text)` — IMMUTABLE, usada por el trigger.

**Mutación (con guard `auth.uid() = p_user_id` interno):**
- `register_expense(uuid, text, numeric, text, text, text, jsonb)` — valida monto positivo, fecha legible (YYYY-MM-DD, rango 2000-01-01..today+1), merchant no vacío, fallback a "Otros" si la categoría no existe.
- `register_income(uuid, numeric, jsonb, text, text)` — distribuye entre bolsillos del usuario, valida monto positivo y tipo de jsonb.
- `transfer_between_pockets(uuid, uuid, uuid, numeric)` — valida monto positivo, no self-transfer, ambos bolsillos del usuario, saldo suficiente.
- `delete_transaction_with_reversal(uuid, uuid)` — borra y reversa el saldo del bolsillo.

**Operacionales (cron):**
- `cron_expire_user_insights()` — marca insights expirados (status='expired').
- `cron_prune_user_events()` — purga events viejos.

Todas las RPCs sensibles tienen `REVOKE EXECUTE FROM PUBLIC` aplicado.
Solo las 5 que el cliente necesita tienen `GRANT EXECUTE TO authenticated`
explícito.

### RLS

Todas las tablas tienen RLS habilitado. Patrón:
```sql
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id)
```
El `(select auth.uid())` (envuelto en subquery) evita la re-evaluación
por fila — corregido en la corrida 7.

### Índices clave

- `transactions(user_id, date_string DESC)` — el RPC filtra por user+mes.
- `pockets(user_id)` — selects RLS-bound.
- `user_events(user_id, event_type, created_at DESC)` — para analytics.
- `user_memory(user_id, key)` UNIQUE — para UPSERT.
- `user_spending_rules(user_id, canonical_pattern)` UNIQUE — para UPSERT.

---

## Edge Functions (`supabase/functions/`)

### `chat-advisor` — versión deployada: v8 (prompt: `advisor.v6`)

POST `/functions/v1/chat-advisor` — body: `{ message, session_id? }`.

Flujo:
1. Auth (`Authorization: Bearer <user JWT>`).
2. Carga en paralelo: `get_monthly_state` + `profiles.full_name` + `user_memory` + `user_spending_rules` + últimos 20 `chat_messages`.
3. Arma `system_prompt` con `buildAdvisorSystemPrompt()` desde `_shared/prompts.ts`.
4. Una sola llamada a OpenAI (gpt-4o-mini, temperature 0.3, max_tokens 400).
5. Persiste user turn + assistant turn en `chat_messages` con `prompt_version` etiquetado.

**Read-only** desde la migración v6: `tools.ts` exporta `[]`. El modelo
no tiene capacidad de mutar nada. Si pide hacer algo redirige al usuario
a la pantalla correspondiente.

Estilo: español neutro, sin emojis, sin botones obligatorios, 2-4
oraciones, formatea cifras con `$1.250.000`, indica explícitamente
"vs mes pasado" en comparaciones.

### `ocr-receipt` — versión deployada: v5 (prompt: `ocr.v2`)

POST `/functions/v1/ocr-receipt` — body: `{ image_base64, category?, auto_register? }`.

Flujo:
1. Auth.
2. Google Vision text detection sobre la imagen.
3. OpenAI estructura el texto raw en `{ amount, merchant, date, items, confidence }`.
4. Sanitización defensiva: si `merchant` matchea blacklist (`Desconocido`, `Factura Escaneada`, `Recibo`, `Sin nombre`, `N/A`, `null`) → fuerza a `null`. Si `amount <= 0` → fuerza a `null`.
5. Devuelve `{ parsed, needs_review, registered, register_skipped_reason, prompt_version }`.
6. Si `auto_register=true` PERO `needs_review=true` → NO se llama a `register_expense`. Cliente debe abrir un modal de confirmación.

### `insight-generator` — versión deployada: v1

POST `/functions/v1/insight-generator` — body: `{}` (cron) o body con auth de usuario.

2 modos:
- Con `Authorization: Bearer <user JWT>` → procesa solo a ese usuario.
- Con `Authorization: Bearer <SERVICE_ROLE_KEY>` → modo cron, itera todos los profiles.

Reglas determinísticas (sin LLM):
- `pocket_burn` (≥80% warning, ≥100% critical) — `dedupe_key` por bucket de 10%.
- `recurring_spike` (gasto del mes >30% vs mes pasado).
- `negative_flow` (gastos > ingresos del mes).

UPSERT a `user_insights` por `(user_id, dedupe_key)`. Programado por `pg_cron` cada día 13:00 UTC (08:00 Bogotá).

### `synthesize-memory` — versión deployada: v1 (prompt: `memory.v1`)

POST `/functions/v1/synthesize-memory` — mismos 2 modos.

Lee 50 últimos events + 20 últimos chat_messages + 50 últimas transactions.
Si actividad < 5 items → skip (no gastar tokens).
Llama a gpt-4o-mini con prompt que extrae 3-5 hechos durables
(`{key, kind: 'habit'|'goal'|'preference'|'risk', summary, confidence}`).
UPSERT por `(user_id, key)`.

Programado por `pg_cron` los lunes 11:00 UTC (06:00 Bogotá).

### `_shared/`

- `cors.ts` — `corsHeaders`, `handlePreflight`, `jsonResponse`, `errorResponse`.
- `auth.ts` — `authenticate(req)` valida JWT, devuelve `{ user, userClient, serviceClient }`.
- `openai.ts` — `chatCompletion()` wrapper. **API key nunca al cliente.**
- `prompts.ts` — `buildAdvisorSystemPrompt()` + tipo `MonthlyState`. Versionado con `ADVISOR_PROMPT_VERSION = "advisor.v6"`.
- `tools.ts` — `advisorTools = []` desde v6. Read-only enforced.

---

## Cron jobs (`pg_cron` + `pg_net`)

Definidos en `supabase/migrations/20260429000001_schedule_cron_jobs.sql`:

| Job | Cron | Edge Function | Frecuencia real |
|---|---|---|---|
| `insights-daily` | `0 13 * * *` (UTC) | insight-generator | Cada día 08:00 Bogotá |
| `memory-weekly` | `0 11 * * 1` (UTC) | synthesize-memory | Lunes 06:00 Bogotá |

Ambos hacen `net.http_post` con `Authorization: Bearer <secret>` donde
el secret viene de `vault.decrypted_secrets WHERE name = 'service_role_key'`.

**Paso manual una vez:** crear el secret en Vault desde Dashboard SQL Editor:
```sql
SELECT vault.create_secret('<el-service-role-key>', 'service_role_key');
```

Sin esto el cron corre pero las llamadas HTTP fallan con 401.

---

## Cliente (`src/`)

```
src/
├── App.tsx                  ← root, routing entre screens
├── constants.ts             ← env URLs + categorías
├── types.ts                 ← Transaction, Screen, etc.
│
├── lib/
│   ├── supabase.ts          ← client config con AsyncStorage
│   ├── useMonthlyState.ts   ← hook que envuelve get_monthly_state
│   ├── format.ts            ← formatMoney (única source de verdad)
│   ├── notify.ts            ← notify.error/success/info/confirm
│   └── events.ts            ← logEvent helper para user_events
│
├── components/
│   ├── BottomNav.tsx        ← tab bar
│   ├── TopBar.tsx           ← header + chat con advisor
│   ├── BottomSheet.tsx      ← modal compartido (NUEVO)
│   ├── MonthNav.tsx         ← selector de mes compartido (NUEVO)
│   ├── CategoryIcon.tsx
│   └── AnimatedProgressBar.tsx
│
├── screens/
│   ├── Auth.tsx             ← login + signup + OAuth
│   ├── Onboarding.tsx       ← setup inicial de bolsillos
│   ├── Dashboard.tsx        ← home: balance del mes + bolsillos top + tx recientes
│   ├── Expenses.tsx         ← lista de tx con filtros + tap = marcar comercio + long-press = eliminar
│   ├── Pockets.tsx          ← grid de bolsillos + ajustar plan + transferir
│   ├── PocketTransfer.tsx   ← UI de mover entre bolsillos
│   ├── AddIncome.tsx        ← registrar ingreso + distribuir
│   ├── Scanner.tsx          ← cámara/galería + OCR + edición manual
│   └── Profile.tsx          ← perfil + score + reglas + cerrar sesión
│
├── theme/
│   ├── theme.ts             ← colors + typography (display/h1/h2/h3/...) + shadows + radius
│   └── ThemeContext.tsx     ← persistencia de modo en profiles.theme_preference
│
└── utils/
    ├── merchant.ts          ← normalizeMerchant() (cliente — espejo del SQL)
    ├── patterns.ts          ← detectores de patrones de gasto
    └── profileUtils.ts      ← calculateFinancialProfile (filtra al mes en curso)
```

### Convenciones críticas

- **Money formatting**: import `formatMoney` de `lib/format.ts`. NO redefinir.
- **Notificaciones**: import `notify` de `lib/notify.ts`. NO usar `alert()` ni `Alert.alert` directo.
- **Estado mensual**: import `useMonthlyState` de `lib/useMonthlyState.ts`. NO recalcular ingreso/gasto/disponible.
- **Modales centrados**: import `BottomSheet` de `components/BottomSheet.tsx`. Migración progresiva en curso.
- **Selector de mes**: import `MonthNav` de `components/MonthNav.tsx` con array `MONTHS` exportado.
- **Tipografía**: usar `theme.typography.display/h1/h2/h3/...` en lugar de `fontSize` literales.
- **Sesión Supabase**: `session: Session` (de `@supabase/supabase-js`), NO `session: any`.

Todo esto está documentado en detalle en `docs/DESIGN_TOKENS.md`.

---

## Flujos completos

### Registrar un gasto manual (Scanner sin imagen)

```
Usuario abre Scanner → modo manual
  → escribe monto + merchant + selecciona categoría
  → tap "Guardar gasto"
  → Scanner.tsx llama supabase.rpc('register_expense', { p_user_id, p_merchant, p_amount, p_category, ... })
  → register_expense (DB):
      1. Valida auth.uid() = p_user_id
      2. Valida monto > 0, merchant no vacío, fecha YYYY-MM-DD válida
      3. Busca bolsillo por categoría (fallback a "Otros")
      4. INSERT transactions con amount = -ABS(p_amount)
         → trigger trg_transactions_set_canonical pobla canonical_merchant
         → trigger transactions_emit_event escribe a user_events
      5. UPDATE pockets SET budget = budget - ABS(p_amount)
  → onSaveSuccess callback en cliente refresca Dashboard/Pockets
```

### Pregunta al chat

```
Usuario abre chat (TopBar) → escribe "¿cómo voy este mes?"
  → TopBar.sendMessage llama supabase.functions.invoke('chat-advisor', { message, session_id })
  → chat-advisor Edge Function:
      1. Auth → user_id
      2. En paralelo: get_monthly_state + profile + user_memory + user_spending_rules + history (20)
      3. buildAdvisorSystemPrompt() arma el prompt con todo
      4. OpenAI gpt-4o-mini responde
      5. Persiste user turn + assistant turn en chat_messages
      6. Devuelve { reply, session_id, prompt_version }
  → TopBar agrega el mensaje al chat
```

### Cron de insights (diario)

```
13:00 UTC → pg_cron dispara
  → net.http_post a /functions/v1/insight-generator con Bearer service_role_key
  → insight-generator (modo cron):
      1. SELECT id FROM profiles → loop
      2. Por cada user: get_monthly_state → buildInsightsFor → reglas
      3. UPSERT user_insights con dedupe_key
  → Dashboard del usuario lee user_insights al abrir
```

---

## Seguridad — el modelo

**El usuario solo puede operar sobre sus propios datos.**

Triple defensa:
1. **RLS**: cada tabla con `policy USING ((select auth.uid()) = user_id)`.
2. **RPC guard**: las 4 RPCs de mutación validan `IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '42501'`.
3. **REVOKE PUBLIC**: las RPCs sensibles solo son llamables por `authenticated`. `anon` no las ve.

`SECURITY DEFINER` con `SET search_path = public, pg_temp` para evitar
schema hijack.

**Pendiente operacional:**
- HIBP password protection (Dashboard → Auth → Sign In → Password security).
- `service_role_key` en Vault (ver `tests/RESULTS.md` → 8ª corrida).

---

## Observabilidad

- `user_events` (138+ filas) es el log append-only de comportamiento.
  Tiene índice GIN sobre `event_data` para queries semánticas.
- `chat_messages` registra cada turno con `prompt_tokens`, `completion_tokens`,
  `model`, `prompt_version`, `tool_input/output`. Permite cost analysis y
  comparación de prompts entre versiones.
- `user_events.event_type = 'chat.message.sent'` incluye un `state_snapshot`
  con `income_month`, `spent_month`, `net_month`, `available_total` —
  permite correlacionar conversaciones con el estado real del usuario al
  momento del mensaje.

**Pendiente:** Sentry / monitoreo de errores en Edge Functions. Hoy si una
function tira error, lo único que queda es el log de Supabase Dashboard.

---

## Qué leer después

- `docs/AI_SYSTEM_DESIGN.md` — diseño del advisor + jobs de IA.
- `docs/DESIGN_TOKENS.md` — guía de uso del sistema de design (helpers + componentes).
- `docs/DB_AUDIT_2026-04-28.md` — auditoría detallada de la DB (parcialmente outdated tras la 7ª corrida — ver `tests/RESULTS.md` para el plan ejecutado).
- `tests/TEST_REPORT.md` — los 13 bugs originales + 7 descubiertos post-cierre.
- `tests/RESULTS.md` — bitácora cronológica de las 10 corridas.
- `supabase/README.md` — setup y deploy de Supabase.
