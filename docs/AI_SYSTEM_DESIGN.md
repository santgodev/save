# Save — Diseño del Sistema de IA

_Motor de consejos personalizados que aprende del comportamiento del usuario_
_Fecha: 2026-04-18_

---

## Resumen ejecutivo

Save ya tiene integración con GPT-4o-mini y un asistente conversacional en el TopBar. El siguiente paso es convertir eso en un **sistema** que aprende y no solo un **chat**. Este doc describe:

1. Qué hay hoy y qué limita el sistema actual.
2. La arquitectura objetivo en 4 capas: Event Store, Memoria, Advisor, Loop de aprendizaje.
3. Schema de base de datos y contratos de API.
4. Decisiones de trade-off y un plan de implementación en fases.

El principio rector: **captura el comportamiento, resúmelo en memoria, inyéctalo como contexto, aprende de la reacción del usuario, itera.**

---

## 1. Lo que hay hoy

```
[App React Native]
       |
       |  (1) Usuario abre chat en TopBar
       |  (2) Cliente arma system prompt con tx del mes actual
       |  (3) Fetch directo a api.openai.com con key expuesta
       |
       v
[OpenAI GPT-4o-mini]
       |
       v
[Respuesta plana en texto]
       |
       |  (4) Cliente detecta [ACTION:TRANSFER] con string.includes()
       |  (5) Muestra botón "Mover dinero ahora"
```

### Limitaciones que bloquean el objetivo

| Limitación | Impacto en el objetivo "la IA aprende del usuario" |
|---|---|
| No hay persistencia del chat | No recuerda lo que se habló ayer |
| No hay log de eventos (solo transacciones) | No sabe si el usuario aceptó, ignoró o rechazó un consejo |
| Contexto limitado al mes actual | No puede comparar mes contra mes |
| Prompt ephemeral, sin versionado | No puedes evaluar si un cambio mejora o empeora las respuestas |
| API key en cliente | Fraude de costos, imposible agregar controles |
| Acciones por string matching | Frágil, no estructurado |
| 1 solo modelo (gpt-4o-mini) para todo | Caro para insights profundos, sobrado para saludos |

---

## 2. Arquitectura objetivo

```
                     ┌─────────────────────────────┐
                     │        CLIENTE (Expo)        │
                     │                             │
                     │  Dashboard · Chat · Scanner │
                     └──────────────┬──────────────┘
                                    │
                                    │ JWT del usuario
                                    v
                ┌──────────────────────────────────────┐
                │      SUPABASE (backend-as-a-service)  │
                │                                      │
                │  ┌─────────────┐  ┌───────────────┐ │
                │  │ Postgres    │  │ Edge Functions │ │
                │  │ (data core) │  │   (Deno)       │ │
                │  └─────────────┘  └───────────────┘ │
                │         ▲                 │          │
                │         │                 │          │
                │  ┌──────┴─────────┐       │          │
                │  │ pg_cron /      │       │          │
                │  │ scheduled jobs │       │          │
                │  └────────────────┘       │          │
                └───────────────────────────┼──────────┘
                                            │
                                            │ (solo el servidor tiene keys)
                                            v
                                ┌────────────────────────┐
                                │   OpenAI / Anthropic   │
                                │   Google Vision OCR    │
                                └────────────────────────┘
```

### Cuatro capas lógicas

```
┌─────────────────────────────────────────────────────────┐
│ 1. EVENT STORE                                          │
│    Todo lo que hace el usuario → tabla user_events      │
├─────────────────────────────────────────────────────────┤
│ 2. MEMORIA (a corto y largo plazo)                      │
│    - chat_messages          (conversación cruda)         │
│    - user_memory            (hechos destilados)          │
│    - user_insights          (consejos generados)         │
├─────────────────────────────────────────────────────────┤
│ 3. ADVISOR (inferencia)                                 │
│    - chat-advisor       Edge Function (conversación)    │
│    - proactive-advisor  Edge Function (push tips)       │
│    - weekly-synth       Edge Function (cron semanal)    │
├─────────────────────────────────────────────────────────┤
│ 4. LOOP DE APRENDIZAJE                                  │
│    Respuesta IA → evento de reacción → memoria →        │
│    prompt más rico la próxima vez                       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Capa 1 — Event Store

El usuario dijo "almaceno eventos de todo tipo en Supabase". Hoy las únicas "event tables" son `transactions` e `user_monthly_income`. Eso es deuda bloqueante para el objetivo de aprendizaje — **para que una IA aprenda del comportamiento, tiene que haber datos de comportamiento, no solo datos financieros.**

### Nueva tabla: `user_events`

```sql
create table user_events (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  event_type   text not null,              -- ver taxonomía abajo
  occurred_at  timestamptz not null default now(),
  session_id   text,                       -- agrupa eventos de una sesión
  payload      jsonb not null default '{}',-- datos específicos del evento
  app_version  text,
  platform     text                        -- 'ios' | 'android' | 'web'
);

create index on user_events (user_id, occurred_at desc);
create index on user_events (user_id, event_type, occurred_at desc);
create index on user_events using gin (payload);
```

### Taxonomía de eventos (versionada)

Dividida en 5 familias. **Regla:** un evento = un verbo en pasado.

| Familia | event_type | payload ejemplo |
|---|---|---|
| **Financial** | `expense_registered` | `{ amount, category, merchant, method: 'scan'/'manual' }` |
|  | `income_registered` | `{ amount, source }` |
|  | `transfer_made` | `{ from_pocket, to_pocket, amount }` |
|  | `transaction_deleted` | `{ tx_id, amount, reason? }` |
| **Budgeting** | `pocket_created` | `{ pocket_id, category, budget }` |
|  | `pocket_budget_changed` | `{ pocket_id, old, new }` |
|  | `pocket_exceeded` | `{ pocket_id, spent, budget }` |
|  | `income_updated` | `{ month, year, old, new }` |
| **App usage** | `screen_viewed` | `{ screen, duration_ms }` |
|  | `scanner_opened` | `{ from: 'fab'/'dashboard' }` |
|  | `scanner_success` | `{ confidence, edits_made }` |
|  | `scanner_abandoned` | `{ step: 'camera'/'confirm' }` |
| **IA / coaching** | `chat_opened` | `{ from_screen }` |
|  | `chat_message_sent` | `{ length, had_quick_question: bool }` |
|  | `advice_shown` | `{ advice_id, type, source: 'chat'/'proactive' }` |
|  | `advice_dismissed` | `{ advice_id, reason? }` |
|  | `advice_acted_on` | `{ advice_id, action_taken }` |
| **Milestones** | `hormiga_alert_triggered` | `{ total, days }` |
|  | `savings_goal_hit` | `{ pocket_id, target }` |

### Cómo se emiten

Crear un pequeño helper client-side:

```ts
// src/lib/events.ts
export async function logEvent(
  type: EventType,
  payload: Record<string, unknown> = {}
) {
  // Fire-and-forget; nunca bloquea UX
  supabase.from('user_events').insert({
    user_id: supabase.auth.getSession(...).user.id,
    event_type: type,
    payload,
    session_id: getSessionId(),
    app_version: Constants.expoConfig?.version,
    platform: Platform.OS,
  }).then(() => {}, () => {}); // swallow errors
}
```

Llamarlo en hooks:
- `useEffect` de cada screen → `screen_viewed`
- Al cerrar scanner sin guardar → `scanner_abandoned`
- Después de cada `sendMessage` del chat → `chat_message_sent`
- Cuando el usuario toca el botón que generó un `[ACTION:TRANSFER]` → `advice_acted_on`

Complemento: **los eventos financieros los emite el RPC en Postgres** con un trigger. Así no dependes del cliente para que lleguen (el cliente podría no tener red y perderse).

```sql
-- Trigger que loggea el evento cuando se inserta una transacción
create or replace function log_transaction_event() returns trigger as $$
begin
  insert into user_events (user_id, event_type, payload)
  values (new.user_id,
          case when new.amount > 0 then 'income_registered' else 'expense_registered' end,
          jsonb_build_object(
            'tx_id', new.id, 'amount', new.amount,
            'category', new.category, 'merchant', new.merchant));
  return new;
end; $$ language plpgsql;

create trigger trg_log_tx after insert on transactions
  for each row execute function log_transaction_event();
```

---

## 4. Capa 2 — Memoria

### 4.1 `chat_messages` (corto plazo, conversación cruda)

```sql
create table chat_messages (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  thread_id   uuid not null,                  -- una "conversación"
  role        text not null check (role in ('user','assistant','system','tool')),
  content     text not null,
  tool_calls  jsonb,                          -- para tool use
  created_at  timestamptz default now(),
  tokens_in   int,
  tokens_out  int,
  model       text,
  cost_usd    numeric(10,6)                   -- trackear costo por mensaje
);

create index on chat_messages (user_id, thread_id, created_at);
```

El cliente carga **los últimos N mensajes del thread activo** al abrir el chat. El thread se mantiene vivo N días o hasta que el usuario haga "limpiar conversación".

### 4.2 `user_memory` (largo plazo, hechos destilados)

Esta tabla es la pieza clave del aprendizaje. La llena un **job semanal** que resume la actividad en hechos pequeños y específicos.

```sql
create table user_memory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,               -- ej: 'coffee_spend_avg', 'savings_goal_trip'
  value      jsonb not null,              -- ej: { amount: 180000, period: 'month' }
  category   text,                        -- 'habit', 'goal', 'preference', 'dislike'
  confidence real default 0.5,            -- 0..1 qué tan seguro estamos
  source     text,                        -- 'weekly_synth' | 'user_stated' | 'inferred'
  expires_at timestamptz,                 -- la memoria decae
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, key)
);
```

Ejemplos de memorias que podría tener un usuario:

```json
{ "key": "coffee_weekly_spend", "value": { "avg": 45000, "trend": "up" }, "category": "habit", "confidence": 0.8 }
{ "key": "ignores_transport_alerts", "value": { "count": 4 }, "category": "preference", "confidence": 0.6 }
{ "key": "savings_goal", "value": { "name": "viaje Europa", "target": 5000000, "deadline": "2026-09" }, "category": "goal", "source": "user_stated" }
{ "key": "prefers_short_answers", "value": true, "category": "preference", "confidence": 0.9 }
```

### 4.3 `user_insights` (consejos generados y su estado)

```sql
create table user_insights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,               -- 'weekly', 'proactive', 'on_demand'
  title       text not null,
  body        text not null,
  suggested_action jsonb,                   -- ej { type: 'transfer', from: ..., to: ..., amount: ... }
  shown_at    timestamptz,
  status      text default 'pending',       -- pending | shown | dismissed | acted
  feedback    text,                          -- opcional: motivo del dismiss
  created_at  timestamptz default now()
);
```

Cuando la IA propone un consejo estructurado (no solo un mensaje de chat), se persiste aquí. Esto permite:
- El loop de aprendizaje tiene un `advice_id` estable.
- El usuario puede revisar "consejos anteriores" en una pantalla.
- Se puede medir **tasa de adopción** por tipo de consejo.

---

## 5. Capa 3 — Advisor (Edge Functions)

Tres Edge Functions en Supabase, escritas en Deno + TypeScript.

### 5.1 `chat-advisor` — conversación reactiva

Flujo:

```
cliente.invoke('chat-advisor', { thread_id, message })
         │
         ▼
  [Edge Function]
     1. Autentica JWT del usuario
     2. Rate limit (p.ej. 30 msg/día gratis)
     3. Lee últimos N mensajes del thread
     4. Lee user_memory del usuario
     5. Lee resumen de tx de los últimos 90 días (view materializada)
     6. Construye prompt con plantilla versionada
     7. Llama OpenAI con tool-use enabled
     8. Si hay tool_call → ejecuta o devuelve al cliente para confirmación
     9. Guarda mensajes (usuario + asistente) en chat_messages
    10. Emite evento 'chat_message_sent' / 'advice_shown'
    11. Retorna al cliente
```

**Contrato de API:**

```ts
// Request
POST /functions/v1/chat-advisor
Authorization: Bearer <jwt>
{
  "thread_id": "uuid | null",     // null → crea nuevo thread
  "message": "¿por qué se me va la plata?",
  "client_context": {              // opcional, para latencia
    "current_screen": "dashboard"
  }
}

// Response
{
  "thread_id": "uuid",
  "reply": {
    "content": "...",
    "tool_calls": [                // si aplica
      {
        "type": "suggest_transfer",
        "args": { "from_pocket_id": "...", "to_pocket_id": "...", "amount": 50000 },
        "advice_id": "uuid"
      }
    ]
  },
  "usage": { "tokens_in": 820, "tokens_out": 120, "cost_usd": 0.0004 }
}
```

### 5.2 Plantilla de prompt (versionada)

Guardar prompts como archivos versionados en el repo (`supabase/functions/_prompts/`) y referenciar por versión.

```ts
// supabase/functions/_prompts/chat-advisor-v3.ts
export const SYSTEM_PROMPT_V3 = `
Eres el asistente de Save, coach financiero colombiano.
[... instrucciones ...]

MEMORIAS DEL USUARIO:
{{memory_block}}

RESUMEN FINANCIERO (últimos 90 días):
{{financial_summary}}

HERRAMIENTAS DISPONIBLES:
- suggest_transfer(from_pocket_id, to_pocket_id, amount, reason)
- create_pocket(name, category, budget, reason)
- mark_hormiga_pattern(pattern_id)
`;
```

Cada mensaje guarda qué versión usó, así puedes comparar v2 vs v3 a posteriori.

### 5.3 Tool use en vez de string matching

En vez de que el modelo escriba `[ACTION:TRANSFER]`, definir tools estructuradas:

```ts
const tools = [
  {
    type: "function",
    function: {
      name: "suggest_transfer",
      description: "Sugiere al usuario mover dinero entre bolsillos.",
      parameters: {
        type: "object",
        properties: {
          from_pocket_id: { type: "string" },
          to_pocket_id: { type: "string" },
          amount: { type: "number" },
          reason: { type: "string" }
        },
        required: ["from_pocket_id","to_pocket_id","amount","reason"]
      }
    }
  },
  // ... create_pocket, mark_hormiga_pattern
];
```

Ventajas sobre el string matching actual:
- El modelo nunca inventa un `pocket_id` que no existe (puedes validar antes de ejecutar).
- El amount es numérico, no parseado de texto.
- Zod valida la respuesta.
- Si el modelo no sabe qué hacer, simplemente no llama tools.

### 5.4 `proactive-advisor` — consejos no solicitados

Edge Function invocada por:
- Un trigger después de `expense_registered` (si es hormiga repetida, si pasa el presupuesto).
- Un cron semanal (resumen dominical).

No bloquea UX. El resultado se inserta en `user_insights` con `status='pending'` y al abrir la app el cliente los muestra (máximo 1 por sesión).

### 5.5 `weekly-synth` — el que aprende

Cron dominical (pg_cron o Supabase scheduler):

```
Para cada user activo:
  1. Lee user_events de la última semana + 90 días
  2. Lee resumen de user_memory existente
  3. Llama a GPT-4o (no mini) con prompt "eres un resumidor de hábitos financieros"
  4. Recibe JSON de memories nuevas/actualizadas
  5. Valida con zod + merge con user_memory existente (update si existe, insert si no)
  6. Si hay algo notable → genera 1 user_insight 'weekly' con título y body
```

Este es el corazón del aprendizaje. El prompt es algo como:

> Dado este historial, extrae hasta 10 memorias en JSON, cada una con {key, value, category, confidence}. Prefiere hechos accionables sobre descriptivos. No repitas memorias ya existentes.

---

## 6. Capa 4 — Loop de aprendizaje

El ciclo completo:

```
   (1) Usuario realiza acción
        │
        ▼
   [user_events]
        │
        │ (2) weekly-synth o trigger
        ▼
   [user_memory]  ←──────────┐
        │                    │
        │ (3) inyectado      │ (6) nuevas memorias
        ▼                    │
   [prompt]                  │
        │                    │
        ▼                    │
   [chat-advisor]            │
        │                    │
        │ (4) respuesta       │
        ▼                    │
   [usuario reacciona]       │
        │                    │
        │ (5) advice_acted_on│
        │     advice_dismissed│
        ▼                    │
   [user_events] ────────────┘
```

**Métricas de salud del loop:**

- **Tasa de adopción de consejos** = `advice_acted_on / advice_shown`.
- **Tasa de abandono de chat** = chats sin respuesta final del usuario.
- **Costo por usuario activo** = sum(cost_usd) / DAU.
- **Quality score manual** = muestreo semanal de 20 conversaciones evaluadas por ti.

---

## 7. Privacidad y costos

### 7.1 Privacidad

- **Data mínima al modelo:** al construir el contexto, enviar agregados y top-5 merchants, no cada tx individual con fecha exacta.
- **Control del usuario:** pantalla en Profile → "Mi memoria con la IA" lista las `user_memory` rows y permite borrar.
- **Opt-out:** poder apagar tracking de eventos (excepto los financieros críticos).
- **No PII innecesaria al LLM:** no enviar email, nombre completo (solo primer nombre), ni geolocalización.
- **Residencia de datos:** Supabase EU / US según la región que elijas.

### 7.2 Costos

Con gpt-4o-mini (~$0.00015/1k in, $0.0006/1k out):

- Mensaje promedio: 800 tokens in, 150 out → ~$0.0002/msg.
- Usuario activo promedio: 10 msg/día = $0.002/día = **$0.06/mes**.
- Semanal synth con gpt-4o (~$2.50/1M in): ~8k tokens → ~$0.02/user/semana = **$0.08/mes**.
- **Total por usuario activo: ~$0.15/mes en IA.**

Con 10k DAU → ~$1500/mes. Rentable en cualquier tier freemium decente.

### 7.3 Rate limiting

Edge Function chequea antes de llamar OpenAI:

```sql
-- Cuántos mensajes lleva el usuario hoy
select count(*) from chat_messages
where user_id = $1 and role = 'user'
  and created_at > now() - interval '24 hours';
```

Límites sugeridos:
- Free: 30 msg/día, 1 synth semanal.
- Pro: 200 msg/día, 3 synth/semana.
- Pico emergencia (abuso): apagar la Edge Function desde el dashboard.

---

## 8. Tabla resumen: todo lo que hay que crear

| Componente | Tipo | Dónde |
|---|---|---|
| `user_events` | Tabla + triggers | Supabase |
| `chat_messages` | Tabla | Supabase |
| `user_memory` | Tabla | Supabase |
| `user_insights` | Tabla | Supabase |
| `logEvent` helper | Código cliente | `src/lib/events.ts` |
| `chat-advisor` | Edge Function | `supabase/functions/chat-advisor/` |
| `proactive-advisor` | Edge Function | `supabase/functions/proactive-advisor/` |
| `weekly-synth` | Edge Function + cron | `supabase/functions/weekly-synth/` |
| `ocr-receipt` | Edge Function (saca Google Vision del cliente) | `supabase/functions/ocr-receipt/` |
| Prompts versionados | Archivos .ts | `supabase/functions/_prompts/` |
| Memory viewer | Pantalla nueva | `src/screens/MemorySettings.tsx` |
| Rate limiting | SQL + Deno check | Edge Function |

---

## 9. Decisiones y trade-offs explícitos

### 9.1 ¿Por qué GPT-4o-mini y no un modelo on-device?

- **On-device (MLC/llama.cpp):** costo cero por request, privacidad máxima, pero modelos chicos tienen respuestas pobres para razonamiento financiero y el bundle crece 100-500 MB.
- **API cloud (OpenAI):** respuestas de calidad, costo bajo (~$0.06/user/mes), privacidad buena si cuidas el prompt.
- **Decisión:** cloud, mini para chat, 4o para synth semanal. Revisar en 12 meses si Apple Intelligence / Gemini Nano están lo suficientemente buenos para mover chat a on-device.

### 9.2 ¿Por qué Edge Functions en vez de un backend propio?

- **Pro:** cero infra, se escala solo, ya tienes Supabase, auth gratis.
- **Contra:** Deno no tiene todas las librerías de Node. Cold start ~200-400 ms.
- **Decisión:** Edge Functions. Si el cold start molesta, usar Supabase's "always warm" plan.

### 9.3 ¿Por qué `user_memory` como KV en vez de tabla estructurada?

- **Pro:** flexible, puedes añadir nuevos tipos de memoria sin migrar schema.
- **Contra:** queries más complicadas, sin FK entre memories.
- **Decisión:** KV con `key` único por usuario. Si en 6 meses tienes 20+ tipos estables, migrar a tablas específicas.

### 9.4 ¿Tool use o JSON mode?

- **JSON mode (lo que haces hoy con string matching):** el modelo devuelve JSON, tú lo parseas.
- **Tool use:** declaras tools explícitas con schema; el modelo llama la que aplica; tú ejecutas o confirmas con el usuario.
- **Decisión:** **Tool use** para acciones (más confiable, menor alucinación). JSON mode sigue bien para el Scanner (un solo schema, un solo output).

### 9.5 ¿Qué pasa si falla OpenAI?

- Edge Function tiene fallback:
  1. Intenta OpenAI.
  2. Si 5xx, reintenta 1 vez con backoff.
  3. Si sigue fallando, responde con un mensaje canned ("Ahora mismo tengo problemas conectando. Tu score es X, aquí un consejo simple: ...") basado en reglas deterministas.
- Considerar Anthropic como fallback de proveedor si OpenAI tiene outage largo.

---

## 10. Plan de implementación (fases)

Cada fase es 1-2 semanas full-time. Puedes hacer Fase 1 antes que nada porque desbloquea todo.

### Fase 1 — Fundación segura (2 semanas) — bloqueante

1. Edge Function `chat-advisor` básica (sin memoria) que saca la key del cliente.
2. Edge Function `ocr-receipt` (mueve Google Vision).
3. Refactor del TopBar para usar `supabase.functions.invoke`.
4. Tabla `chat_messages` + persistencia de la conversación.
5. Borrar las variables `EXPO_PUBLIC_*_API_KEY` del cliente.

**Al final de Fase 1:** la app es segura y el chat recuerda.

### Fase 2 — Event Store (1 semana)

6. Tabla `user_events` + índices.
7. Triggers Postgres para eventos financieros.
8. Helper `logEvent` en cliente + instrumentación en:
   - Todas las pantallas (`screen_viewed`).
   - Chat (`chat_opened`, `chat_message_sent`).
   - Scanner (`scanner_*`).
   - Acciones de consejos (`advice_acted_on`, `advice_dismissed`).

**Al final de Fase 2:** tienes datos de comportamiento.

### Fase 3 — Memoria y aprendizaje (2 semanas)

9. Tabla `user_memory` + `user_insights`.
10. Edge Function `weekly-synth` con cron semanal.
11. Inyección de memoria en el prompt de `chat-advisor`.
12. Pantalla "Mi memoria con la IA" en Profile.

**Al final de Fase 3:** la IA recuerda y aprende patrones del usuario.

### Fase 4 — Proactividad (1-2 semanas)

13. Edge Function `proactive-advisor` + trigger al registrar gasto.
14. Notificaciones push con `expo-notifications` para insights importantes.
15. Tool use completo (migrar `[ACTION:X]` a function calling).
16. Versioning de prompts + table de A/B test.

**Al final de Fase 4:** consejos llegan antes de que el usuario pregunte.

### Fase 5 — Optimización (continuo)

17. Evaluación manual + automática de calidad.
18. Dashboard interno de métricas del loop.
19. Segmentación de usuarios por comportamiento.
20. Posible mover chat básico a modelo on-device cuando sea viable.

---

## 11. Señales tempranas de que el sistema funciona

En los primeros 30 días después de Fase 3, deberías ver:

- **>40% adoption rate** en consejos de tipo "mover dinero" (el más accionable).
- **<$0.25** costo por MAU en IA.
- **Retención semanal** de usuarios que abrieron el chat vs los que no: la cohorte con chat debería retener 10-20% más.
- Al leer muestras al azar de `user_memory`, las memorias deben ser **específicas y accionables** (ej: "gasta $45k/semana en café" ✅), no genéricas ("le gusta ahorrar" ❌).

Si no ves esto → iterar el prompt de `weekly-synth`, no el de chat.

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Alucinaciones financieras (la IA inventa cifras) | Tool use + validación server-side antes de ejecutar |
| Consejos dañinos o fuera de lugar | Evaluación manual + prompt con "nunca des consejos de inversión específicos" |
| Costos se disparan | Rate limit por usuario + alertas en Supabase + límite duro en OpenAI dashboard |
| Fuga de data personal a OpenAI | No enviar PII + opción "no entrenar" en OpenAI (zero retention) |
| Sesgo cultural (la IA asume dólares cuando es COP) | Prompt fuerte + ejemplos few-shot colombianos |
| Usuario se cansa de notificaciones | Cooldown: max 1 insight proactivo por día, ignorar si usuario dismissó el anterior |
| Hot-path latency del chat | Edge Function en misma región que DB + streaming de la respuesta al cliente |

---

## 13. Mejoras específicas sobre el código actual

Tomando el código de hoy y aplicando este diseño, estos son los cambios concretos:

1. `src/components/TopBar.tsx:122` — reemplazar `fetch(api.openai.com)` por `supabase.functions.invoke('chat-advisor')`.
2. `src/components/TopBar.tsx:41` — `messages` debe cargar desde `chat_messages` al abrir el modal.
3. `src/components/TopBar.tsx:360-378` — reemplazar detección `[ACTION:X]` por renderizado de `tool_calls` estructurados en la respuesta.
4. `src/screens/Scanner.tsx:217-232` — reemplazar la llamada directa a OpenAI por `supabase.functions.invoke('ocr-receipt')`.
5. `src/constants.ts:19-20` — eliminar `GOOGLE_VISION_API_KEY` y `OPENAI_API_KEY` del cliente (ya no son necesarias).
6. `src/lib/supabase.ts` — añadir `getAuthedClient()` helper que consolida el patrón `createClient(...with auth header...)`.
7. `src/screens/Dashboard.tsx:142-148` — el bloque "Sage proactivo" hoy usa reglas estáticas (`totalSpentAll > totalBudget * 0.8`). Reemplazar por lectura de `user_insights where status='pending'` y tomar el más reciente.
8. `src/utils/profileUtils.ts:27` — `HORMIGA_THRESHOLD` pasa de constante a lectura de `user_memory` si el usuario la ha personalizado ("pa mí hormiga son $20k, no $15k").

---

## 14. Pregunta abierta para el equipo

Antes de empezar Fase 3 (la memoria), vale la pena alinearse en:

- **¿Qué tan personal queremos que se sienta la IA?** Si el usuario le dice "estoy ahorrando para casarme", ¿el sistema guarda "evento de vida: matrimonio en 2027" como memoria? ¿Por cuánto tiempo? ¿Se borra automáticamente?
- **¿Quién entrena el prompt?** Recomendado: un humano (tú) revisa 20 conversaciones/semana en las primeras 8 semanas y marca cuáles fueron buenas/malas. Sin esto, no sabes si estás mejorando.

---

_Referencias internas: ver `AUDIT.md` para deuda técnica general y priorización de fixes fuera del dominio de IA._
