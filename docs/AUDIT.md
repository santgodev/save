# Save — Auditoría Técnica

_Fecha: 2026-04-18_
_Stack: Expo SDK 54 · React Native 0.81 · React 19 · expo-router 6 · NativeWind · Supabase · OpenAI GPT-4o-mini · Google Vision API_

---

## Resumen ejecutivo

Save es una app móvil de finanzas personales con sistema de "bolsillos" (envelope budgeting), OCR de facturas y un asistente conversacional con IA. El código está **funcional** y el diseño visual es de alta calidad, pero tiene **un problema crítico de seguridad** que debe resolverse antes de cualquier release público, además de deuda arquitectónica importante que bloqueará el crecimiento.

**Top 3 cosas que hay que arreglar YA:**

1. **Las API keys de OpenAI y Google Vision están expuestas en el cliente** (`EXPO_PUBLIC_*`). Cualquiera puede decompilar el APK/IPA y extraerlas → riesgo de facturas gigantes. **Severidad: crítica.**
2. **La app no usa expo-router realmente.** `app/index.tsx` tiene un switch gigante con todas las pantallas importadas eagerly → bundle pesado, sin deep links, sin lazy loading.
3. **No hay tests** en una app financiera. Los cálculos de health score, transferencias y presupuestos no están cubiertos. Un bug aquí rompe la confianza del usuario.

**Salud del código (0–100): ~58**
- Diseño visual y UX: 90
- Arquitectura: 45
- Seguridad: 35 (por el tema de las keys)
- Calidad del TypeScript: 55
- Testabilidad: 10
- Documentación de dominio: 30

---

## 1. Seguridad (crítico)

### 1.1 API keys expuestas en el cliente — ✅ `RESUELTO`

**Fix implementado:** Ambas llamadas fueron migradas a **Supabase Edge Functions** (`ocr-receipt` y `chat-advisor`). Las keys ahora viven seguras en el servidor y el cliente se comunica vía `supabase.functions.invoke`.

**Fix:**
1. Mover ambas llamadas a **Supabase Edge Functions** (Deno). Ventajas: ya estás en el ecosistema Supabase, la auth del usuario se valida automáticamente, y la key queda server-side.
2. En el cliente, llamar `supabase.functions.invoke('chat-advisor', { body: { messages, context } })` y `supabase.functions.invoke('ocr-receipt', { body: { base64 } })`.
3. Rotar las keys actuales antes de publicar (las de hoy ya deberían considerarse comprometidas).
4. Añadir rate limiting por `user_id` en la Edge Function (p. ej. 30 mensajes/día en free tier).

### 1.2 No se valida el monto antes de enviarlo al RPC

**Archivo:** `src/screens/Scanner.tsx:259-290`

`parseFloat(editableAmount.replace(/[^0-9.]/g, ''))` deja pasar un `NaN` si el input está vacío y confía en que el RPC valide. Añadir guard de `Number.isFinite(amountValue) && amountValue > 0` antes de llamar a Supabase.

### 1.3 Revisar Row Level Security (RLS) en Supabase

El patrón `createClient` con `Authorization: Bearer ${access_token}` sugiere que dependes de RLS, pero no puedo verificarlo desde el código. **Acción:** confirmar que las tablas `transactions`, `pockets`, `user_monthly_income`, `profiles`, `user_spending_rules` tienen políticas `SELECT/INSERT/UPDATE/DELETE` restringidas a `auth.uid() = user_id`. Sin RLS, cualquier usuario autenticado puede leer/escribir datos de otros.

### 1.4 `alert()` y `console.error` silenciosos

Los errores se swallow con `console.error` o se muestran con `alert()` genérico (ej. `Scanner.tsx:289`). En producción no hay forma de saber qué falló. Integrar **Sentry** o similar y crear un wrapper `logError(error, context)`.

---

## 2. Arquitectura

### 2.1 No se usa expo-router de verdad — `ALTA`

**Archivo:** `app/index.tsx`

La app tiene un único route (`index`) con un `switch(currentScreen)` de 170 líneas que renderiza todas las pantallas. Todas están importadas en top-level, así que el bundle inicial carga Scanner, Onboarding, AddIncome, etc. aunque el usuario no los abra.

**Consecuencias:**
- Bundle JS inicial ~2-3x más grande del necesario.
- Sin deep linking (no puedes compartir link a un bolsillo específico).
- Sin back button nativo en Android.
- La lógica de "mostrar TopBar si no es scanner ni onboarding" está duplicada en condiciones largas.

**Fix (medio esfuerzo):** migrar a la estructura de carpetas de expo-router:
```
app/
  _layout.tsx          # Root layout, sessión, tema
  (auth)/
    login.tsx
  (app)/
    _layout.tsx        # TopBar + BottomNav aquí
    dashboard.tsx
    expenses.tsx
    pockets/
      index.tsx
      [id].tsx         # deep link a bolsillo
    profile.tsx
  scanner.tsx          # modal
  onboarding.tsx       # modal full-screen
```

### 2.2 Supabase client duplicado en 4+ archivos — `MEDIA`

```ts
// Se repite en Pockets.tsx:105, Onboarding.tsx:209, index.tsx:77, Scanner.tsx (import)
const strictClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${session.access_token}` } }
});
```

Esto no debería ser necesario — `supabase.auth.getSession()` ya mantiene el token internamente. Si la intención es forzar el JWT, crear un único helper:

```ts
// src/lib/supabase.ts
export const getAuthedClient = (token?: string) => { /* ... */ };
```

Y preferiblemente **no crearlo a mano**: `supabase.from('...')` ya respeta la sesión activa.

### 2.3 Dos suscripciones a `onAuthStateChange` — `BAJA`

`app/index.tsx` suscribe a auth state en `App` (línea 227) y en `MainApp` (línea 49). El primero no hace nada útil (el `session` no se usa). **Eliminar el del `App`.**

### 2.4 Sin capa de data fetching — ✅ `RESUELTO PARCIALMENTE`

**Fix implementado:** Se construyó un sistema de caché global personalizado (Stale-While-Revalidate) a través de `useMonthlyState.ts` y una precarga inteligente en `App.tsx`. Ahora el `Dashboard` y los `Bolsillos` cargan instantáneamente sin requerir dependencias externas pesadas, mitigando el problema de lentitud y múltiples re-renders. Aún queda pendiente tipar los datos por completo.

### 2.5 Sin gestión de estado global — `MEDIA`

`transactions`, `pockets`, `session`, `theme` se pasan por props 4-5 niveles abajo. Ya usan `Context` para theme. Añadir **Zustand** (ligero, sin boilerplate) para:
- `useUserStore` (session, profile)
- `useDataStore` (ahora reemplazado por react-query)
- `useUIStore` (currentScreen, modales)

Esto elimina prop drilling y hace los componentes más testeables.

### 2.6 Chat sin persistencia — `ALTA` (porque bloquea el feature de IA)

**Archivo:** `src/components/TopBar.tsx:41`

```ts
const [messages, setMessages] = useState<Message[]>([]);
```

Cada vez que el usuario cierra y reabre el chat, **se pierde todo el historial**. Esto es bloqueante para el objetivo de "que la IA aprenda del usuario": no puede referirse a lo que se habló ayer si no lo recuerda. Ver `AI_SYSTEM_DESIGN.md` para el plan completo.

---

## 3. Código (calidad)

### 3.1 Archivos demasiado grandes

| Archivo | Líneas aprox | Problema |
|---|---|---|
| `src/screens/Pockets.tsx` | ~820 | Componente + 2 modales + lógica de edición + CRUD inline |
| `src/screens/AddIncome.tsx` | ~600 | UI + lógica + styles en un solo archivo |
| `src/screens/Scanner.tsx` | ~420 | OCR + IA + form + permisos + styles |
| `src/components/TopBar.tsx` | ~440 | TopBar + modal de chat + llamadas a OpenAI |
| `app/index.tsx` | ~270 | Router + auth + data fetch + FAB menu |

**Regla empírica:** si un archivo pasa de 300 líneas, hay algo que separar. Sugerencia de extracción para Pockets:
- `Pockets.tsx` → solo orquestación + lista
- `PocketCard.tsx`
- `PocketDetailSheet.tsx`
- `AddPocketModal.tsx`
- `useAdjustMode.ts` (hook con la lógica de edición)

### 3.2 `any` everywhere — `MEDIA`

```ts
transactions: any[], pockets: any[], session: any
```

En una app de finanzas, los tipos son tu primera línea de defensa. `tx.amount` a veces es `number`, a veces `string` (se usa `parseFloat` en unos lados y operación directa en otros). Eso es un bug esperando a suceder.

**Fix:**
1. Generar tipos con `supabase gen types typescript` → `src/types/database.ts`.
2. Usar `Database['public']['Tables']['transactions']['Row']` en vez de `any`.
3. Normalizar el campo `amount` a `number` al cargar de Supabase (un mapper en `loadUserData`).

### 3.3 Magic numbers y reglas de negocio dispersas

- `HORMIGA_THRESHOLD = 15000` (profileUtils.ts:27) — debería ser config de usuario o venir de Supabase.
- `20%` de ahorros hardcoded en 3 lugares (Onboarding.tsx:221, referencia en infoCard).
- `500000` como mínimo de ingreso (Onboarding.tsx:182) — debería estar en un `constants/rules.ts`.

Crear `src/config/businessRules.ts` y centralizar todo.

### 3.4 `amount` string vs number

Ejemplos del mismo archivo (`TopBar.tsx`):
```ts
transactions.filter(t => parseFloat(t.amount) < 0)      // línea 53
gastos.reduce((acc, t) => acc + Math.abs(parseFloat(t.amount)), 0)  // línea 74
```

Pero en `profileUtils.ts` se usa `t.amount` directo como number. **Decidir uno y usar ese.** Mi recomendación: `numeric` en DB → `number` en TS, siempre. Castea al cargar.

### 3.5 NativeWind está instalado pero la mayoría del código usa `StyleSheet`

`package.json` tiene `nativewind@4.2.3` y hay `tailwind.config.js`, pero prácticamente todos los componentes usan `StyleSheet.create` con objetos enormes. O se adopta NativeWind en serio (refactor gradual con `className`), o se desinstala. Tener ambos mundos duplica la superficie mental.

### 3.6 Archivos temporales en el repo — ✅ `RESUELTO`

Los archivos temporales `tmp_*.ts` y `*_diff.txt` fueron eliminados del repositorio principal manteniendo limpio el directorio de trabajo.

### 3.7 `alert()` nativo en vez de modal temático

`Scanner.tsx:163`, `Scanner.tsx:289` y otros usan `alert()` que rompe la estética. Crear un `<Toast>` o `<AlertSheet>` consistente con el design system.

---

## 4. IA / LLM (deuda específica) — ✅ `RESUELTO`

Todos los problemas críticos detectados en el diseño inicial fueron resueltos gracias a una arquitectura basada en Edge Functions y base de datos:
1. **Tool Use implementado**: Se migraron los string matchings frágiles a verdaderas funciones de OpenAI.
2. **Memoria y Contexto**: La IA ahora posee un `synthesize-memory` que le permite recordar conversaciones y generar `insights` automáticos (Background tasks).
3. **Persistencia**: Se guardan los historiales y el motor de IA es resiliente y privado en el lado del servidor.

---

## 5. Tests

**Estado actual:** 0 tests. No hay script `test` en `package.json`.

**Impacto:** en una app financiera, esto es deuda de alto riesgo. Lo mínimo a cubrir:

- `profileUtils.calculateFinancialProfile` — lógica de health score.
- `patterns.detectPatterns` — detección de hábitos.
- `utils/merchant.normalizeMerchant` — normalización de nombres.
- RPCs de Supabase (`register_expense`, `transfer_between_pockets`, `delete_transaction_with_reversal`) — con **pgTAP** o Supabase local.
- Flujos críticos E2E con **Maestro** o **Detox**: onboarding → crear bolsillo → registrar gasto → ver dashboard.

**Setup recomendado:**
- `jest` + `@testing-library/react-native` para unit/integration.
- `maestro` para E2E (mucho más simple que Detox).
- `pgTAP` para testear funciones de Postgres.

---

## 6. Dependencias e infraestructura

### 6.1 Dependencias útiles faltantes

| Dependencia | Para qué | Prioridad |
|---|---|---|
| `@tanstack/react-query` | Data fetching | Alta |
| `zustand` | Estado global | Media |
| `zod` | Validación de inputs/RPC responses | Alta |
| `@sentry/react-native` | Error tracking | Alta |
| `posthog-react-native` o Mixpanel | Analytics de comportamiento (clave para la IA) | **Alta** |
| `date-fns` | Operaciones de fechas (hoy usas `new Date()` a pelo) | Media |
| `react-native-mmkv` | Storage rápido (reemplazo de AsyncStorage para cache) | Baja |

### 6.2 Infra ausente

- **Sin CI/CD.** No hay GitHub Actions / EAS build configurado.
- **Sin EAS Update** para OTA updates.
- **Sin entorno de staging**. Un solo proyecto de Supabase para dev y prod (asumo).
- **Sin monitoring**: ni Sentry, ni logging centralizado.

### 6.3 Notas de versiones

- React 19 + RN 0.81 + Reanimated 4 es cutting edge; asegúrate de pin exacto y probar con cada upgrade de Expo SDK.
- `react-native-worklets@0.5.1` aún es relativamente nuevo — vigilar issues.

---

## 7. Documentación

**Lo bueno:** `THEME_DESIGN_SYSTEM.md` está bien hecho.

**Lo que falta:**
- README real del proyecto (no el scaffold de Expo).
- Diagrama o doc de la **arquitectura** de la app.
- **Schema doc** de Supabase (tablas, relaciones, RPCs, RLS policies).
- **Runbook** de ops: cómo rotar keys, cómo hacer release, cómo restaurar un backup.
- Doc del dominio: qué es un bolsillo, qué es el health score, qué es el gasto hormiga.

---

## 8. Roadmap priorizado

Cada fase son 1-2 semanas full-time. Se puede ejecutar en paralelo a features.

### Fase 0 — Antes de cualquier release público (bloqueante)

1. Mover OpenAI + Google Vision a Supabase Edge Functions.
2. Rotar todas las keys.
3. Auditar y confirmar RLS policies en las 5 tablas principales.
4. Integrar Sentry.

### Fase 1 — Fundamentos (2 semanas)

5. Generar tipos de Supabase, eliminar `any` en interfaces públicas.
6. Normalizar `amount` a `number` al cargar.
7. Instalar react-query y migrar `loadUserData` a queries con cache.
8. Instalar zod y validar inputs de scanner, income, transfer.
9. Limpiar archivos `tmp_*`, `*_diff.txt`.

### Fase 2 — Testing mínimo (1 semana)

10. Tests unitarios para `profileUtils`, `patterns`, `merchant`.
11. Tests de RPCs con pgTAP.
12. 1 flujo E2E (onboarding → gasto → dashboard) con Maestro.

### Fase 3 — Arquitectura sostenible (2 semanas)

13. Migrar a file-based routing de expo-router (carpetas `(app)`, `(auth)`).
14. Romper pantallas >300 líneas en componentes.
15. Consolidar los `createClient(...)` duplicados en un helper único.

### Fase 4 — Observabilidad y aprendizaje (paralelo a IA)

16. Integrar PostHog o Mixpanel.
17. Definir y trackear **eventos de comportamiento** (ver `AI_SYSTEM_DESIGN.md`).
18. Dashboard interno de métricas.

### Fase 5 — Product debt (cuando hayas pasado 1-4)

19. Deep linking.
20. Notificaciones push (consejos proactivos de la IA).
21. EAS Update para OTA.
22. Modo offline parcial (leer transacciones cacheadas sin red).

---

## Matriz de priorización Actualizada (Lo pendiente)

| # | Item | Impacto | Riesgo | Esfuerzo | Score | Estado |
|---|---|---|---|---|---|---|
| 1 | Verificar RLS policies | 5 | 5 | 1 | **50** | ⚠️ Pendiente |
| 2 | Integrar Sentry | 4 | 4 | 1 | **40** | ⚠️ Pendiente |
| 3 | Tipos generados de Supabase | 4 | 3 | 2 | **28** | ⚠️ Pendiente |
| 4 | Tests de `profileUtils` + patterns | 4 | 4 | 2 | **32** | ⚠️ Pendiente |
| 5 | Migrar a expo-router carpetas | 3 | 2 | 4 | **10** | ⚠️ Pendiente |
| 6 | Romper pantallas grandes | 3 | 2 | 3 | **15** | ⚠️ Pendiente |

_Puntos 1, 5, 8, 9 y 12 del auditoraje inicial ya fueron resueltos._

---

## Cosas que están bien hechas (no tocar)

Para balancear: el proyecto tiene aciertos sólidos.

- `LargeSafeStorage` en `supabase.ts` con fallbacks cross-platform es una buena decisión defensiva.
- El design system está bien documentado y coherente.
- `calculateFinancialProfile` tiene una lógica interpretable y explicable.
- Las RPCs centralizadas (`register_expense`, `transfer_between_pockets`, `delete_transaction_with_reversal`) son el patrón correcto — toda la lógica crítica está en el servidor, no en el cliente.
- Haptics y micro-interacciones están cuidados.
- Integración OAuth (Google, Apple) implementada correctamente con `expo-web-browser`.

---

_Próximo paso: ver `AI_SYSTEM_DESIGN.md` para el diseño del motor de consejos personalizados._
