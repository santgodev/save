# Architecture Review — Save (organic-ledger)

**Fecha:** 2026-04-20
**Alcance:** Evaluación integral de la arquitectura vista desde el enfoque del producto.
**Relación con otros docs:**
- `AUDIT.md` — auditoría técnica previa (problemas ya conocidos). Este doc **no** repite hallazgos; los referencia.
- `AI_SYSTEM_DESIGN.md` — diseño de la capa de IA. Este doc evalúa cómo encaja con el todo.
- `supabase/README.md` — operación de la capa Supabase.

---

## 1. El producto que estamos construyendo

Save es una app **colombiana** de **finanzas personales** con un modelo mental diferenciador: **bolsillos**. El usuario no ve categorías abstractas sino *sobres* concretos (Mercado, Transporte, Ahorros, etc.), cada uno con presupuesto y saldo. Sobre ese modelo se montan tres diferenciadores:

1. **Scanner de recibos con OCR** — reducir la fricción de registrar gastos en un mercado donde la tarjeta no siempre llega y los recibos son físicos.
2. **Asesor IA conversacional** — lenguaje natural en español colombiano, con capacidad de *ejecutar acciones* (tool use), no sólo recomendar.
3. **Memoria y aprendizaje** — la app aprende hábitos y da insights proactivos, no solo almacena transacciones.

Esto impone unas restricciones que no son obvias si miras sólo el stack técnico:

- **Mercado emergente**: latencia de red variable, usuarios con planes de datos limitados. Offline-first importa más que en apps gringas.
- **Categoría "finanzas"**: una cuenta corrupta o perdida no es un bug, es pérdida de confianza irreversible. Integridad > velocidad de iteración.
- **Producto de hábito**: el valor crece con el uso (más data → mejor asesor). El churn del primer mes es el riesgo existencial, no el costo por usuario.
- **Individual, no empresarial**: no hay multi-tenant complejo, pero hay privacidad de datos muy sensible (todas las compras de una persona).
- **IA como feature diferenciador**, no como commodity: el asesor *es* el producto, no un chatbot adosado.

Con este lente, ahora la arquitectura.

---

## 2. Arquitectura actual en una imagen

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CLIENTE — Expo / React Native                      │
│                                                                       │
│   app/index.tsx  ← switch de 270 líneas; "router" casero             │
│     │                                                                 │
│     ├─ screens/    Dashboard, Scanner, Pockets (33KB), Onboarding…   │
│     ├─ components/ TopBar (con chat dentro), BottomNav, CategoryIcon │
│     ├─ theme/      ThemeContext + StyleSheet (NativeWind casi unused)│
│     ├─ lib/        supabase.ts, events.ts                            │
│     └─ utils/      profileUtils, patterns, merchant                  │
│                                                                       │
│   Sin estado global real. Prop drilling 4-5 niveles.                  │
│   Sin react-query, sin cache, sin optimistic updates, sin offline.    │
│   API keys ahora limpias (tras el refactor reciente).                 │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                         Supabase JS + JWT
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│                        SUPABASE  (vxdnudkaelhqntrrwdwa)               │
│                                                                       │
│   ┌───────────────────┐   ┌─────────────────────┐                    │
│   │ Postgres + RLS    │   │ Edge Functions      │                    │
│   │                   │   │                     │                    │
│   │ profiles          │   │ chat-advisor  v4    │                    │
│   │ transactions      │   │   · gpt-4o-mini     │                    │
│   │ pockets           │   │   · tool calling    │                    │
│   │ user_monthly_…    │   │ ocr-receipt   v3    │                    │
│   │ chat_messages   ★ │   │   · Google Vision   │                    │
│   │ user_events     ★ │   │   · gpt-4o-mini     │                    │
│   │ user_memory     ★ │   │                     │                    │
│   │ user_insights   ★ │   │ verify_jwt=false    │                    │
│   │                   │   │ (ES256 workaround)  │                    │
│   │ RPCs:             │   └─────────────────────┘                    │
│   │ · register_expense                                                │
│   │ · transfer_between_pockets                                        │
│   │                                                                   │
│   │ Triggers ★: transactions, pockets, income → user_events          │
│   │ pg_cron ★: podar eventos 180d, expirar insights                  │
│   └───────────────────┘                                               │
│                                                                       │
│   ★ = agregado en la fase reciente (AI_SYSTEM_DESIGN)                 │
└───────────────────────────────────────────────────────────────────────┘
                                   │
                  OpenAI (chat) + Google Vision (OCR)
```

---

## 3. Evaluación por capa, enfrentada al producto

Para cada capa: **¿está bien pensada para Save específicamente?**

### 3.1 Capa de datos (Postgres + RLS)

**Decisiones buenas:**

- **Postgres + RLS por usuario** es la mejor decisión posible para este producto. La alternativa (un backend propio con queries manuales) costaría 3× más tiempo y sería más inseguro. RLS te da aislamiento criptográfico por `auth.uid()`: un bug en el cliente *no puede* leer datos de otro usuario.
- **Modelo relacional en vez de documento** (Firebase): correcto. Las operaciones financieras son inherentemente transaccionales (mover plata entre bolsillos es 2 updates atómicos). Postgres te da ACID real.
- **RPCs con parámetros nombrados** (`register_expense`, `transfer_between_pockets`): buena elección arquitectónica. Encapsula la lógica de negocio lejos del cliente, evita que se implementen reglas de "cómo se mueve plata" en tres pantallas distintas.
- **Event store (`user_events`) con triggers automáticos**: la pieza más sofisticada del sistema. Hace que *cualquier* cambio en el modelo quede registrado sin que el cliente tenga que colaborar. Es la materia prima para analytics, debugging, y el sistema de memoria.

**Mismatches con el producto:**

- 🟡 **Falta un modelo temporal explícito para presupuestos**. Actualmente `pockets.budget` es un número plano. Pero los presupuestos son inherentemente **mensuales** y cambian. Si mañana quieres mostrar "tu bolsillo Mercado el mes pasado gastaba 40% más", no lo puedes reconstruir. Recomendación: `pocket_period` (pocket_id, year, month, budget_cents, spent_cents, carried_over_cents).
- 🟡 **`user_monthly_income` tiene RLS enabled pero sin policies** (visto en Supabase advisors). En este proyecto eso significa que *nadie* puede leer la tabla — ni siquiera su dueño. Probablemente por eso el advisor no ve tu ingreso. Fix crítico de 2 líneas de SQL.
- 🟡 **No hay tabla de categorías canónicas**. Cada pocket tiene un campo `category` como string libre. Para un advisor que razone sobre "gasto en transporte", eso es frágil: si un bolsillo dice "Transporte" y el otro dice "transporte", para el modelo son diferentes. Recomendación: tabla `categories` con id estable y el pocket.category_id FK.
- 🟢 **Falta integridad en transacciones**. Una transferencia entre bolsillos debería ser *una* operación lógica, no dos rows independientes de `transactions`. Hoy si falla la segunda mitad, queda inconsistente. La RPC `transfer_between_pockets` probablemente ya usa una transacción Postgres, pero no hay registro explícito del "par" de movimientos. Recomendación: columna `transfer_group_id` en transactions.

**Veredicto capa de datos:** 7.5/10. Fundamento sólido, ajustes necesarios pero no re-arquitectura.

### 3.2 Capa de backend (Edge Functions)

**Decisiones buenas:**

- **Edge Functions en vez de backend propio**: excelente para una app en esta etapa. Cero ops, escala a cero, cobra por invocación. Para un app financiero de usuario individual, no necesitas un Node server 24/7 quemando plata.
- **Deno + TypeScript**: correcto. El ecosistema está en Supabase nativamente, evitas tooling de Node (webpack, babel, etc.).
- **Separación `_shared/`**: auth, cors, openai, prompts, tools están aislados. Permite que si mañana agregas una tercera función (ej. `weekly-synth`), reusas todo. Esto es el patrón que recomendaba AI_SYSTEM_DESIGN.md y está implementado.
- **Tool calling en vez de regex matching** en respuestas del modelo: decisión correcta (estaba como riesgo en AUDIT). Hoy el asesor puede *ejecutar* acciones (transferir plata, crear bolsillos) con confirmación estructurada en vez de imprimir `[ACTION:TRANSFER]` y esperar que el cliente lo parseé.

**Mismatches con el producto:**

- 🔴 **`verify_jwt = false` por workaround ES256**: funciona, pero es deuda. Cuando Supabase arregle la incompatibilidad del gateway con llaves ES256, hay que revertir a `verify_jwt = true` para tener defensa en profundidad (actualmente solo nuestra `authenticate()` chequea el JWT — si hay un bug ahí, la función queda abierta). Poner un `TODO` con fecha de revisión.
- 🟡 **`user_client` vs `service_client` mezclados sin claridad**. Usamos `serviceClient` (bypass RLS) para persistir turnos de asistente y eventos; `userClient` para leer contexto y ejecutar tools. El patrón es correcto pero frágil: un error de tipeo (usar `serviceClient` donde debería ir `userClient`) rompe RLS. Recomendación: ponerlos en scopes separados, o hacer un wrapper que prohíba usar serviceClient para ciertas tablas.
- 🟡 **No hay idempotencia en `chat-advisor`**. Si el usuario manda el mismo mensaje dos veces por un retry del cliente, se ejecutan dos turnos completos de OpenAI + dos tool calls potencialmente destructivos. Para una app financiera donde las "tools" pueden mover plata, esto es un riesgo real. Recomendación: pasar un `request_id` desde el cliente y hashear contra chat_messages antes de ejecutar.
- 🟢 **Sin rate limiting**. No hay protección contra usuarios (o atacantes con cuentas válidas) que quemen tu presupuesto de OpenAI con requests en loop. Para una app de usuario individual es bajo riesgo, pero documentable.

**Veredicto capa de backend:** 8/10. Diseño limpio, hace lo correcto. Los huecos son operacionales, no de diseño.

### 3.3 Capa del cliente (Expo / React Native)

Aquí es donde la arquitectura está más desalineada con el producto. Lo desarrollo con más detalle.

**Problemas estructurales (todos heredados de AUDIT, sin resolver):**

- 🔴 **"Router" casero con switch de 270 líneas en `app/index.tsx`**. Expo-router 6 está instalado pero no se usa. Cada pantalla se importa *eagerly* al boot. En una app con 9 pantallas ya empieza a pesar; cuando sean 15 (Insights, Goals, Reports, Notifications…), va a doler. **Además**: sin file-based routing no tienes deep links nativos, lo cual impide mostrar notificaciones que abran directo una pantalla (crítico para la estrategia de "consejos proactivos" de AI_SYSTEM_DESIGN).
- 🔴 **Sin estado global real**. `transactions`, `pockets`, `session` se pasan como props desde `index.tsx` hacia abajo 4-5 niveles. Cuando el asesor crea un bolsillo vía tool call, el cliente **no tiene forma de enterarse** sin hacer un refetch manual completo. Esto es una limitación *arquitectónica*, no de feature: el modelo mental del producto pide que la app reaccione a cambios hechos en el servidor (por la IA, por triggers, por otros dispositivos del mismo usuario), y el cliente actual no puede.
- 🔴 **Sin caché ni offline**. Cada arranque hace `select('*') from transactions where user_id = ...`. Para un usuario con 2 años de historia serían miles de filas. En un mercado donde la conexión es variable (el usuario abre la app en TransMilenio sin LTE), **la app actualmente no funciona**. El enfoque producto-mercado hace esto más grave que en una SaaS de escritorio.
- 🟡 **`src/components/TopBar.tsx` tiene el chat completo adentro** (~450 líneas después del refactor). No es un problema funcional pero es un *smell*: el chat es una superficie grande que merece su propio feature module (componentes, hooks, estado, estilos).
- 🟡 **Archivos gigantes** (Pockets.tsx ~33KB, AddIncome.tsx ~22KB). Mezclan lógica de negocio, efectos de Supabase, animaciones, y estilo en un solo archivo. Esto hace imposible agregar tests y difícil onboardear a un segundo dev.
- 🟡 **Tipos Supabase no generados**. El cliente usa `any[]` en muchas firmas y `Record<string, unknown>` en otros. Un cambio de schema (agregar columna) no rompe TypeScript, rompe runtime. Con `supabase gen types typescript` este riesgo desaparece.

**Decisiones correctas que no hay que tocar:**

- Expo SDK 54 + RN 0.81 + React 19: moderno, soporte largo, managed workflow. Para esta etapa de producto, correcto no salirse de Expo.
- `LargeSafeStorage` con fallbacks cross-platform en `supabase.ts`: defensivo pero necesario — crashes raros de auth son un killer en apps móviles.
- Haptics + animaciones con Reanimated: buena UX, no sobreingeniería.

**Veredicto capa del cliente:** 5/10. Funciona hoy, pero es el cuello de botella para todo lo que viene (IA proactiva, offline, multi-device, tests).

### 3.4 Cross-cutting

| Tema | Estado | Impacto en el producto |
|---|---|---|
| **i18n** | ❌ | Bajo hoy (solo Colombia), crítico si expanden a MX/PE/CL. |
| **Accesibilidad** | ⚠️ | Medio. App financiera para todos los adultos significa que deberías pensar en lectores de pantalla y tamaños de texto grandes. Hoy los botones usan iconos sin labels accesibles. |
| **Testing** | ❌ | **Alto**. Cero tests en app financiera es una decisión con consecuencias cuando agregues el primer bug de "la transferencia perdió plata". |
| **CI/CD** | ❌ | **Alto**. No hay staging environment. Si haces un `apply_migration` malo vía MCP o CLI, estás tocando prod. |
| **Error tracking** | ❌ | **Medio-alto**. Cuando un usuario reporte "la app crashea", no tienes forma de saber qué pasó. Sentry es 1 día de trabajo. |
| **Analytics del negocio** | 🟢 Parcial | El event store está, pero no hay dashboard que lo consuma. Así no sabes funnel, retención, features usadas. |

---

## 4. Riesgos arquitectónicos priorizados por lente del producto

### 🔴 Riesgo 1 — La IA va a sentirse desconectada de la app

**Síntoma:** El asesor creó un bolsillo vía tool call (funciona en server) pero la pantalla del usuario no se actualiza hasta que refetchea manualmente. **Hoy ya está pasando.**

**Causa:** sin estado global reactivo (react-query o Zustand), la mutación server-side no se propaga al cliente.

**Impacto producto:** el asesor se siente "hablante" en vez de "ejecutor". El diferenciador competitivo del chat se diluye.

**Arreglo:** instalar `@tanstack/react-query`, envolver las lecturas de Supabase en `useQuery`, invalidar los queries correctos después de `functions.invoke('chat-advisor')`. 3-5 días de trabajo. **Habilita además:** optimistic updates, pull-to-refresh gratis, stale-while-revalidate.

### 🔴 Riesgo 2 — La app no funciona sin red

**Síntoma:** abre la app en un lugar con conexión intermitente → pantalla blanca o "No hay datos" porque `loadUserData` falló.

**Causa:** cero persistencia local de datos de dominio.

**Impacto producto:** en Colombia, los momentos de uso más frecuentes (mercado, transporte, restaurante) son exactamente donde la conexión es peor. Un usuario que abre la app y no ve nada, no vuelve.

**Arreglo:** `@tanstack/react-query` + `@tanstack/query-async-storage-persister` te da cache persistente gratis. Para escritura offline más robusta, `supabase-cache-helpers` o solución custom con cola de mutaciones.

### 🟠 Riesgo 3 — No puedes iterar sin romper cosas

**Síntoma:** un cambio en `Pockets.tsx` ya tiene riesgo de romper otra cosa porque el archivo es 33KB y no hay tests.

**Causa:** archivos monolito + cero tests + cero CI.

**Impacto producto:** velocidad de iteración cae exponencialmente con el número de features. Para una app que depende del feedback del asesor (y por tanto, de iteración rápida en el prompt y en las tools), esto es tóxico.

**Arreglo:** Fase de refactor de 2 semanas. Partir Pockets.tsx en `<PocketsList>`, `<PocketCard>`, `<usePockets>` hook. Instalar Jest + @testing-library/react-native. Pipeline de GitHub Actions que corra lint + tsc + tests en cada PR.

### 🟠 Riesgo 4 — No hay staging. Un `apply_migration` malo es producción muerta

**Síntoma:** trabajando ya directamente contra el proyecto `vxdnudkaelhqntrrwdwa`.

**Causa:** no hay un segundo proyecto Supabase ni ramas de DB.

**Impacto producto:** cualquier cambio de schema es un acto de fe. Para un app financiera, eso es inaceptable en el mediano plazo.

**Arreglo:** usar **Supabase Branches** (feature pagada, ~$10/mes) o crear un proyecto `organic-ledger-staging` y apuntar la build de dev ahí. 1 día de setup.

### 🟡 Riesgo 5 — El modelo de presupuesto es puntual, no temporal

Ya descrito en 3.1. No es urgente, pero el día que quieras mostrar un gráfico de "tu gasto por mes en Mercado a lo largo del año", vas a tener que migrar data y eso se pone feo si hay 10k usuarios. Mejor hacerlo con 100 usuarios.

### 🟡 Riesgo 6 — Observabilidad ciega

Sin Sentry y sin dashboard sobre `user_events`, los primeros 6 meses de producto son decisiones a ciegas. Para un advisor IA donde la calidad de respuesta es existencial, no poder contestar "¿qué % de respuestas del asesor fueron útiles?" es un problema.

---

## 5. Recomendaciones priorizadas

Ordenadas por **impacto producto / costo de implementación**.

### Fase A — 2 semanas (desbloquear el núcleo)

1. **Instalar react-query** y migrar 5 queries clave: pockets, transactions, profile, chat history, insights. Invalidar correctamente después de `functions.invoke`. *Desbloquea: IA reactiva + offline light + menos código duplicado.*
2. **Generar tipos Supabase** con `supabase gen types typescript`. Eliminar `any[]` en las firmas de los hooks nuevos. *Desbloquea: refactor seguro hacia adelante.*
3. **Arreglar RLS de `user_monthly_income`** (2 líneas de SQL). *Desbloquea: el asesor finalmente ve tu ingreso.*
4. **Instalar Sentry para RN**. 1 día. *Desbloquea: visibilidad de crashes reales.*

### Fase B — 1 mes (modernizar el cliente)

5. **Migrar a file-based routing de expo-router**. Eliminar el switch de 270 líneas. *Desbloquea: deep links → notificaciones proactivas del asesor.*
6. **Partir Pockets.tsx, AddIncome.tsx, Scanner.tsx en componentes <10KB**. *Desbloquea: tests y contribución de segunda persona.*
7. **Sacar el chat de TopBar.tsx a `src/features/chat/`** (componentes + hooks + estilos). *Desbloquea: el chat deja de bloquear cambios cosméticos del header.*
8. **CI/CD básico**: GitHub Actions + proyecto Supabase de staging. *Desbloquea: cambios de schema sin pánico.*

### Fase C — 2 meses (escalabilidad del dominio)

9. **Tabla `categories` canónica** con FK desde pockets y transactions. Migrar data existente. *Desbloquea: asesor razonando en categorías estables + analytics coherentes.*
10. **Tabla `pocket_period`** para presupuesto mensual histórico. *Desbloquea: reportes históricos, proyecciones, y el mensaje "el mes pasado gastabas 40% menos en esto".*
11. **Idempotencia en chat-advisor** (request_id hashing). *Desbloquea: confianza para ejecutar tools destructivas.*
12. **Primeros tests**: un smoke test E2E por feature principal (scan receipt → save, chat → receive reply, transfer between pockets). *Desbloquea: refactoring sin miedo.*

### Fase D — 3+ meses (madurez)

13. **Offline-first completo** con cola de mutaciones locales que sincroniza cuando hay red.
14. **Sistema de insights** (tabla `user_insights` ya existe) conectado al asesor: cada noche un job genera 1-3 insights y los expone en el dashboard.
15. **i18n** cuando aparezca el primer usuario no-colombiano.
16. **Rate limiting** en Edge Functions (por user_id + día).

---

## 6. ¿La arquitectura está bien pensada para Save?

**Respuesta corta:** La arquitectura del **backend** está sustancialmente bien pensada para el producto. La del **cliente** no.

**Expandido:**

El backend (Supabase + RLS + Edge Functions + event store + triggers) es **la decisión arquitectónica correcta** para una app de finanzas personales individuales con IA. Te da aislamiento por usuario gratis, escala a cero, tiene integridad transaccional real, y deja la infra administrada a un tercero competente. El diseño de la capa de IA específicamente (AI_SYSTEM_DESIGN) muestra pensamiento maduro: event store, memoria destilada, insights estructurados, tool calling, versiones de prompt. Eso es el 70% del trabajo duro.

El cliente, en cambio, **está optimizado para una app más simple** de la que quieren construir. El "router" casero, el prop drilling, el cero-cache, los archivos monolito — todo eso funciona para una app con 3 pantallas y 50 usuarios. No funciona para una app donde:

1. La IA modifica el estado desde afuera (necesita reactividad).
2. Los usuarios están en mercados con conexión variable (necesita offline).
3. El feature set va a crecer 3x en 6 meses (necesita modularidad).
4. Es finanzas (necesita tests y observabilidad).

**La buena noticia:** ninguno de los problemas del cliente es estructural-profundo. Son deuda acumulada por moverse rápido, y el arreglo (Fases A+B) son 6 semanas de trabajo concentrado que te posicionan para escalar.

**La mala noticia:** cada semana que no se haga este refactor, agregar features se vuelve más caro, y cuando llegue el primer bug financiero serio, la falta de tests + observabilidad lo va a convertir en incidente de confianza.

**Decisión clave para el founder:** en los próximos 30 días, ¿priorizar features nuevas (más pantallas, más insights) o consolidar la capa cliente?

Mi recomendación con alta confianza: **consolidar**. El diferenciador del producto (IA que ejecuta + memoria que aprende) no se nota hasta que la app sea reactiva y esté siempre disponible. Hoy no lo está. Arreglarlo es prerrequisito, no opción.

---

## 7. Resumen ejecutivo (1 página)

| Capa | Nota | Encaja con el producto | Acción |
|---|---|---|---|
| Datos (Postgres+RLS) | 7.5/10 | Sí | Ajustes: RLS de income, tabla categorías, tabla pocket_period |
| Backend (Edge Functions) | 8/10 | Sí | Ajustes: idempotencia, rate limit, revertir verify_jwt |
| Cliente (RN/Expo) | 5/10 | **No** para la app que quieren construir | Refactor de 6 semanas: react-query, expo-router real, tipos Supabase, split de monolitos |
| Cross-cutting | 3/10 | No | Sentry + CI + staging + primeros tests |

**Top 3 que haría esta semana:**

1. Instalar react-query y migrar las 5 queries principales.
2. `supabase gen types typescript` + eliminar los `any[]`.
3. Arreglar el RLS de `user_monthly_income` (2 líneas SQL).

**Top 1 riesgo no discutido antes:** el día que un usuario reporte "mi transferencia se perdió plata" no tenemos forma de reproducir ni auditar porque (a) no hay tests, (b) no hay Sentry, (c) el event store no está consultado todavía. Arreglar ese trípode es seguro financiero, no solo técnico.
