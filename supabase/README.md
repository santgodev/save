# Supabase backend — organic-ledger / Save

Todo lo relacionado con la base de datos, Row Level Security, eventos,
memoria del asistente y las dos Edge Functions (`chat-advisor` y
`ocr-receipt`) vive aquí.

Proyecto en Supabase: **`vxdnudkaelhqntrrwdwa`**
(definido en [`config.toml`](./config.toml)).

---

## 1. Estructura

```
supabase/
├── config.toml                       # project_id + verify_jwt de funciones
├── migrations/                       # SQL versionado; se aplica en orden
│   ├── 20260418000001_create_chat_messages.sql
│   ├── 20260418000002_create_user_events.sql         (ALTER — ya existía)
│   ├── 20260418000003_create_user_memory.sql
│   ├── 20260418000004_create_user_insights.sql
│   ├── 20260418000005_event_triggers.sql
│   └── 20260418000006_retention_and_cron.sql
└── functions/
    ├── _shared/
    │   ├── cors.ts                   # helpers CORS + respuestas JSON
    │   ├── auth.ts                   # authenticate(req) → user + clients
    │   ├── openai.ts                 # wrapper de chat.completions
    │   ├── prompts.ts                # ADVISOR_PROMPT_VERSION + builder
    │   └── tools.ts                  # definiciones + ejecutor de tools
    ├── chat-advisor/index.ts         # POST /functions/v1/chat-advisor
    └── ocr-receipt/index.ts          # POST /functions/v1/ocr-receipt
```

### Qué crea cada migración

| Archivo | Crea / toca |
|---|---|
| `…_create_chat_messages.sql` | Tabla `chat_messages` (user/assistant/tool turns + tokens + prompt_version) + RLS `select_own` / `insert_own`. |
| `…_create_user_events.sql` | ALTER sobre `user_events` existente: añade `session_id`, `app_version`, `platform`, `source`. Índices por tiempo, tipo y `event_data` GIN. |
| `…_create_user_memory.sql` | Tabla `user_memory` (facts curados del usuario). Sólo el service role escribe; el cliente solo lee lo suyo. |
| `…_create_user_insights.sql` | Tabla `user_insights` (tarjetas accionables generadas por IA) con estados `active / dismissed / acted_on / expired`. |
| `…_event_triggers.sql` | Función helper `emit_user_event(uuid, text, jsonb)` + triggers automáticos en `transactions`, `pockets` y `user_monthly_income`. |
| `…_retention_and_cron.sql` | Extensiones `pg_cron` / `pg_net`, jobs para podar eventos > 180 días y expirar insights. |

---

## 2. Secrets obligatorios

> ⚠️ **Las funciones no arrancan si estos secrets no están definidos.**
> MCP no puede setearlos por restricciones de seguridad — hazlo tú desde
> el dashboard o con la CLI.

| Nombre | De dónde sacarlo | Usado por |
|---|---|---|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | `chat-advisor`, `ocr-receipt` |
| `GOOGLE_VISION_API_KEY` | Google Cloud Console → Credenciales → habilitar "Cloud Vision API" | `ocr-receipt` |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Project Settings → API → `service_role` | `chat-advisor`, `ocr-receipt` (persistencia server-side bypass RLS) |

`SUPABASE_URL` y `SUPABASE_ANON_KEY` ya están disponibles dentro de las
Edge Functions sin configuración extra.

### Opción A — Dashboard

Project Settings → **Edge Functions** → **Secrets** → *Add new secret*
para cada uno de los tres.

### Opción B — CLI

```bash
supabase secrets set \
  OPENAI_API_KEY=sk-... \
  GOOGLE_VISION_API_KEY=AIza... \
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

Verificación:

```bash
supabase secrets list
```

---

## 3. Aplicar migraciones

Todas las migraciones de este repo **ya fueron aplicadas** al proyecto
`vxdnudkaelhqntrrwdwa` vía MCP. Este bloque es para replays locales o
para nuevos entornos (staging, preview branches, etc).

### Con la CLI

```bash
# 1. Autenticarse (una sola vez)
supabase login

# 2. Linkear el repo al proyecto
supabase link --project-ref vxdnudkaelhqntrrwdwa

# 3. Aplicar migraciones pendientes
supabase db push
```

### Con MCP (Claude)

Pídele al agente:

> "Aplica las migraciones pendientes de `supabase/migrations` al proyecto
> `vxdnudkaelhqntrrwdwa`."

El agente usará `mcp__supabase__apply_migration` archivo por archivo y
confirmará con `list_migrations`.

### Verificar el estado

```sql
-- ¿Tablas nuevas presentes?
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('chat_messages', 'user_memory', 'user_insights');

-- ¿Triggers activos?
select trigger_name, event_object_table
from information_schema.triggers
where trigger_name like 'trg_emit_%';

-- ¿Cron jobs?
select jobid, schedule, jobname
from cron.job
where jobname in ('prune_user_events_daily', 'expire_user_insights_hourly');
```

---

## 4. Desplegar Edge Functions

### Primera vez

```bash
supabase functions deploy chat-advisor
supabase functions deploy ocr-receipt
```

Ambas se despliegan con `verify_jwt = true` (ver `config.toml`): sólo
usuarios autenticados pueden invocarlas, y el JWT identifica al usuario
detrás de cada request.

### Redeploy después de cambios

```bash
# Sólo la que cambió
supabase functions deploy chat-advisor --no-verify-jwt=false
```

O vía MCP:

> "Haz deploy de `chat-advisor` al proyecto `vxdnudkaelhqntrrwdwa`."

### Logs

```bash
supabase functions logs chat-advisor --tail
supabase functions logs ocr-receipt --tail
```

Los errores del modelo (`OpenAI 4xx`, `Vision 4xx`) se ven aquí. Los
errores del cliente (JWT inválido, body vacío) salen como 4xx en la
respuesta sin quedar en logs.

---

## 5. Cómo se llaman desde el cliente

El cliente nunca habla con OpenAI ni Google Vision directamente — sólo
con Supabase. El JWT viaja automático vía `supabase-js`.

### Chat

```ts
// src/components/TopBar.tsx
const { data, error } = await supabase.functions.invoke('chat-advisor', {
  body: { message: userInput, session_id: optionalSessionId },
});
// data = { reply: string, session_id, usage }
```

### Scanner OCR

```ts
// src/screens/Scanner.tsx
const { data, error } = await supabase.functions.invoke('ocr-receipt', {
  body: {
    image_base64: base64,          // sin prefijo data:image/...
    category: 'Comida',            // opcional
    auto_register: false,          // si true, crea la transacción vía RPC
  },
});
// data = { parsed: { amount, merchant, date, items }, registered }
```

### Eventos (fire-and-forget desde el cliente)

```ts
import { logEvent, EVENTS } from '../lib/events';
logEvent(EVENTS.SCANNER_OPENED);
logEvent('custom.anything', { extra: 42 });
```

Los eventos de dominio (`transaction.created`, `pocket.updated`,
`income.set`, etc.) **se emiten solos** desde triggers de Postgres — no
hay que llamar `logEvent` para ellos.

---

## 6. Smoke test end-to-end

1. Abre la app, inicia sesión con un usuario real.
2. `/chat-advisor`: envía "¿Cuánto llevo gastado este mes?" desde el
   chat. Debe responder en español colombiano, < 3 oraciones.
3. Mira `chat_messages` en el dashboard → deben aparecer las filas
   `role = user` y `role = assistant` con `prompt_version = advisor.v1`.
4. Mira `user_events` → debe estar `chat.message.sent`.
5. `/ocr-receipt`: escanea un recibo. En `user_events` debe aparecer
   `scanner.scanned` (o `scanner.failed` si Google Vision rebota).
6. Crea un gasto manual → `user_events.transaction.created` aparece
   automáticamente por trigger.

Si algo falla con **500 + "OpenAI / Vision not set"**, vuelve a la
sección 2 y revisa los secrets.

---

## 7. Rollback rápido

- **Deshacer una función rota**: `supabase functions deploy chat-advisor`
  apuntando al commit anterior (las versiones quedan en el dashboard con
  su id, y puedes revertir desde ahí también).
- **Deshacer una migración**: escribe una nueva migración que haga el
  `drop` / `alter … drop column` correspondiente. **No** edites una
  migración ya aplicada.
- **Apagar un cron**: `select cron.unschedule('prune_user_events_daily');`

---

## 8. Secretos que **no** deben vivir en el cliente

`src/constants.ts` sólo expone `SUPABASE_URL` y `SUPABASE_ANON_KEY`
(ambas son públicas por diseño). Si ves alguien commiteando
`OPENAI_API_KEY` o `GOOGLE_VISION_API_KEY` en la app, rechaza el PR: esas
llaves siempre van como secret de la función, nunca en el bundle.
