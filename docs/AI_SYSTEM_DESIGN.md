# Save — Diseño del Sistema de IA

_El asesor que solo informa. Y los dos crons que aprenden._
_Última revisión: 2026-04-29._

---

## Filosofía

Save tiene 3 piezas de IA, todas con propósito acotado:

1. **`chat-advisor`** — un asesor read-only. **Solo informa, NO actúa.**
   Convierte los números reales del usuario en respuestas claras. Cero
   capacidad de mover plata, crear bolsillos o registrar gastos. Si el
   usuario lo pide, redirige a la pantalla correspondiente.

2. **`insight-generator`** — cron diario que aplica reglas determinísticas
   (sin LLM) y produce `user_insights` proactivos.

3. **`synthesize-memory`** — cron semanal que destila hechos durables del
   usuario con LLM y los persiste en `user_memory` para que el chat los
   recuerde sesión a sesión.

**Ningún componente reinventa los números.** Todos consumen la misma
fuente de verdad (`get_monthly_state` en SQL).

---

## El paradigma read-only del chat (advisor.v6)

### Por qué

Hasta `advisor.v3` el chat tenía herramientas: `transfer_between_pockets`,
`register_expense`, `create_pocket`. El modelo decidía cuándo
ejecutarlas. Eso producía bugs sutiles (mover plata sin pedir
confirmación, crear bolsillos duplicados, registrar gastos en
categorías inexistentes).

`advisor.v6` invierte la decisión: el modelo **describe**, el usuario
**actúa**. Toda mutación tiene que pasar por una pantalla con
confirmación visual.

### Qué cambió en código

```ts
// supabase/functions/_shared/tools.ts
export const advisorTools: OpenAITool[] = [];
```

Cero tools expuestos al modelo. Si por alucinación intenta llamar a
una herramienta vieja, el wrapper devuelve `{ ok: false, error: "..." }`.

### Qué le pasamos al modelo

`buildAdvisorSystemPrompt()` arma el system prompt con:

- **Headline del mes**: ingreso, gasto, neto, disponible total — todo
  comparado con mes anterior con delta porcentual explícito.
- **Bolsillos del mes**: cada uno con plan/disponible/gastado. Pre-marcados
  con `ALERTA` (≥80%) o `EXCEDIDO` (≥100%) para que el modelo no tenga
  que razonar sobre el threshold.
- **Top 5 comercios del mes** (usa `canonical_merchant`).
- **Bloque de alertas** ya filtrado y formateado: el modelo no necesita
  iterar la lista de bolsillos para encontrar problemas.
- **`user_spending_rules`**: comercios marcados como
  Confianza/Vigilar/Reducir. El advisor modula el tono según estas reglas
  (ej. "aunque tu mayor gasto fue Jerónimo Martins, lo marcaste como
  confianza, así que no es alerta").
- **`user_memory`**: hechos durables sintetizados por el cron semanal.
  Ej. `habit.almuerzos_corrientazo`, `goal.ahorro_moto`. Si está vacío,
  el prompt instruye al modelo a sugerir "Sincroniza tu IA en tu Perfil".

### Reglas de estilo que el modelo respeta

- Español neutro, sin jerga colombiana.
- 2-4 oraciones máximo.
- Sin emojis, sin botones, sin listas largas.
- Cifras formateadas con separador de miles (`$1.250.000`).
- Comparaciones explícitas con "vs mes pasado".
- Si no tiene el dato, lo dice ("Aún no he identificado ese patrón").

### Telemetría

Cada turno se persiste en `chat_messages` con:
- `prompt_version` (`advisor.v6` actualmente).
- `prompt_tokens` + `completion_tokens` para cost analysis.
- `tool_calls` siempre nulo en v6 (read-only).

Y se emite `user_events` con `event_type='chat.message.sent'` que incluye
`state_snapshot`: `income_month`, `spent_month`, `net_month`,
`available_total`, `pockets_count`. Eso permite correlacionar
conversaciones con el estado real al momento del mensaje en análisis
offline.

### `session_id` real

El cliente (`TopBar.tsx`) genera un `sessionIdRef` estable al abrir el
chat y lo pasa en cada turno. Al "Reiniciar chat" se regenera. Antes
del fix el cliente no enviaba `session_id` y el server caía al default
`gen_random_uuid()` por insert → cada turno aparecía como sesión nueva
en DB. Ahora una conversación = un session_id.

---

## Insight Generator — el productor de alertas

`supabase/functions/insight-generator/index.ts`. Versión 1.

### Modos

- **Modo usuario**: llamada con `Authorization: Bearer <user JWT>` →
  procesa solo a ese usuario. Útil para botón "Sincronizar IA" en Profile.
- **Modo cron**: llamada con `Authorization: Bearer <SERVICE_ROLE_KEY>`
  → loop sobre todos los profiles. Disparado por `pg_cron` cada día
  13:00 UTC (08:00 Bogotá).

### Reglas

Determinísticas, sin LLM (más baratas y predecibles):

| Regla | Trigger | Severity | Body |
|---|---|---|---|
| `pocket_burn` | `pct_used ≥ 80` | warning | "Llevas el N% de X consumido. Te quedan $Y." |
| `pocket_burn` | `pct_used ≥ 100` | critical | "Has superado tu plan de X por $Z." |
| `recurring_spike` | `spent_month > prev_month_spent * 1.3` | notice | "Este mes llevas un gasto N% superior al mes pasado." |
| `negative_flow` | `net_month < 0 && spent_month > 0` | warning | "Tus gastos superan tus ingresos por $X este mes." |

### Dedupe

Cada insight tiene un `dedupe_key` único. UPSERT por
`(user_id, dedupe_key)`. Strategy:
- `pocket_burn`: bucket por decena de pct_used → no spammea cuando un
  bolsillo pasa de 81% a 82%, pero sí emite uno nuevo cuando cruza al
  90% o al 100%.
- `recurring_spike` / `negative_flow`: una sola alerta por mes.

### Expiración

Cada insight tiene `expires_at = month_end`. El cron
`cron_expire_user_insights` los marca `status='expired'` cuando pasa la
fecha. Dashboard solo muestra `status='active'`.

---

## Synthesize Memory — el productor de la memoria del chat

`supabase/functions/synthesize-memory/index.ts`. Versión 1. Prompt
versión `memory.v1`.

### Modos

Idénticos al `insight-generator`: usuario o cron. El cron corre los
**lunes 11:00 UTC (06:00 Bogotá)**.

### Skip de baja actividad

Antes de llamar al LLM:
```ts
const activityCount = (events?.length ?? 0)
  + (messages?.length ?? 0)
  + (transactions?.length ?? 0);
if (activityCount < 5) return { skipped: 'low_activity' };
```

No tiene sentido sintetizar memoria de un usuario que abrió la app dos
veces. Threshold = 5 items totales.

### Prompt

System prompt instruye al modelo a:
- Extraer 3-5 hechos.
- Formato JSON estricto: `{ facts: [{ key, kind, summary, confidence }] }`.
- `kind` en `'habit' | 'goal' | 'preference' | 'risk'`.
- `key` jerárquica con dot-notation (`habit.almuerzos_corrientazo`,
  `goal.ahorro_moto`).
- `summary` corto, sin emojis.
- `confidence` entre 0.0 y 1.0.

### Robustez

- `JSON.parse` envuelto en try/catch. Si el modelo devuelve no-JSON,
  retorna `{ error: 'json_parse: ...' }`.
- Filtra hechos con `key` o `summary` vacíos antes de UPSERT.
- Clamp del `confidence` a `[0, 1]`.
- UPSERT por `(user_id, key)` — si el hecho ya existe, refresca
  `last_seen_at` y `summary`.

### Trazabilidad

Cada llamada queda con `prompt_version='memory.v1'`. Si en el futuro
iteramos el prompt, bumpear a `memory.v2` para poder filtrar memorias
generadas con cada versión y comparar calidad.

---

## OCR Receipt — la lectura de facturas

`supabase/functions/ocr-receipt/index.ts`. Versión 5. Prompt versión
`ocr.v2`.

No es "IA conversacional" pero usa LLM para estructurar el texto raw
del Google Vision OCR. Se documenta acá porque sigue el mismo
versionado y blacklist de prompts.

### Pipeline

```
imagen → Google Vision text_detection → texto raw
       → OpenAI gpt-4o-mini con prompt "ocr.v2" → { amount, merchant, date, items, confidence }
       → sanitización defensiva en cliente del Edge Function
       → respuesta al cliente con `needs_review` derivado
```

### Blacklist de merchants

El prompt instruye al modelo a **NO devolver** `Desconocido`,
`Factura Escaneada`, `Recibo`, `Sin nombre`, `N/A`, `null`. Si no ve un
merchant claro, devuelve `null`.

Pero el modelo a veces se rebela. Por eso hay sanitización defensiva en
TypeScript:
```ts
const FORBIDDEN_MERCHANT_PATTERNS = [
  /^desconocido$/i, /^factura\s+escaneada$/i, /^recibo$/i,
  /^sin\s+nombre$/i, /^n\/?a$/i, /^null$/i, /^undefined$/i,
];
if (FORBIDDEN_MERCHANT_PATTERNS.some(rx => rx.test(merchant))) {
  parsed.merchant = null;
}
```

Si `merchant` o `amount` quedan en `null`, `confidence='low'` y
`needs_review=true`. El cliente abre modo manual y NO auto-registra.

### Por qué importa

Antes de v5 el cliente recibía `merchant: 'Desconocido'` como string
y lo persistía. La tabla `transactions` se llenaba de basura
inagrupable. Bug #13 del TEST_REPORT.

---

## Cómo iterar el sistema

### Para cambiar el comportamiento del chat

1. Editar `supabase/functions/_shared/prompts.ts`.
2. Bumpear `ADVISOR_PROMPT_VERSION` (ej. `advisor.v6` → `advisor.v7`).
3. Redeploy `chat-advisor` (`supabase functions deploy chat-advisor`).
4. Comparar offline:
   ```sql
   SELECT prompt_version, COUNT(*), AVG(completion_tokens)
   FROM chat_messages WHERE role='assistant'
   GROUP BY prompt_version;
   ```

### Para agregar una regla nueva al insight-generator

1. Agregar la lógica determinística en `buildInsightsFor()` con un
   `dedupe_key` único.
2. Decidir `severity` y `expires_at`.
3. Redeploy.
4. Forzar una corrida manual:
   ```sql
   SELECT net.http_post(
     url := 'https://<project>.supabase.co/functions/v1/insight-generator',
     headers := jsonb_build_object(
       'Authorization', 'Bearer ' || (
         SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key'
       )
     ),
     body := '{}'::jsonb
   );
   ```

### Para que el chat aprenda algo nuevo del usuario

No se le enseña. Se le pasa el dato en el prompt:

- ¿Hechos durables? → editar el prompt de `synthesize-memory` para que
  capture esa categoría.
- ¿Reglas explícitas del usuario? → ya entran via `user_spending_rules`
  que el chat lee automáticamente.
- ¿Datos del mes? → ya entran via `get_monthly_state`.

No hay fine-tuning, no hay embeddings, no hay vector DB. Todo es
prompting estructurado contra los datos reales.

---

## Pendientes

- **Activar HIBP** en Dashboard (Auth → Sign In → Password security).
- **Crear secret en Vault**:
  ```sql
  SELECT vault.create_secret('<service-role-key>', 'service_role_key');
  ```
  Sin esto los crons disparan pero las llamadas HTTP fallan con 401.
- **Sentry** en Edge Functions para no perder stack traces cuando falle.
- **Re-evaluar `user_memory` y `user_insights`** en 1-2 meses: si los
  productores no están dejando data útil, considerar borrarlas (mejor
  vacío reconocido que vacío fingido).

---

## Lecturas cruzadas

- `docs/ARCHITECTURE_REVIEW.md` — el mapa general.
- `docs/DESIGN_TOKENS.md` — cómo se conecta el chat con la UI.
- `tests/RESULTS.md` corridas 5, 6, 8 — el camino que llevó a este diseño.
