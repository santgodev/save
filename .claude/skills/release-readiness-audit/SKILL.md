---
name: release-readiness-audit
description: Audita si la app Save (Expo/React Native + Supabase) está lista para subirse a producción (App Store / Play Store / release pública). Hace un análisis completo y de solo lectura — seguridad, bugs/código muerto, coherencia front/back de datos, coherencia de producto (onboarding/tours), y salud general del repo — y entrega un veredicto priorizado por severidad con bloqueantes vs. mejoras opcionales. NUNCA edita ni arregla código, solo diagnostica. Úsala siempre que el usuario pregunte si la app está lista para publicarse, pida un "audit" o "auditoría" pre-lanzamiento, pregunte "¿hay problemas de seguridad?", "¿hay errores?", "revisa toda la app", quiera un chequeo antes de subir a las stores, o pida una segunda opinión general de salud del código antes de un release — incluso si no menciona la palabra "skill" o "readiness" explícitamente.
---

# Release Readiness Audit — Save

Auditoría de solo lectura que responde una pregunta: **¿esta app está lista
para que la use gente real?** No es una revisión de una PR ni un review de
estilo — es el último filtro antes de que el código le llegue a un usuario
pagando una suscripción con su plata real.

## Regla de oro: solo análisis

Esta skill **nunca edita, arregla, ni ejecuta migraciones**. Ni un
`Edit`, ni un `git commit`, ni un `supabase db push`. Si en el camino ves
algo que se podría arreglar en una línea, no lo hagas — repórtalo. El
usuario decide qué, cuándo y en qué orden arreglar. Mezclar "reporto" con
"arreglo" en la misma pasada es la manera más rápida de que un audit se
vuelva confuso y de que el usuario pierda la visibilidad de qué cambió y
por qué.

Sí puedes correr comandos de solo lectura/verificación: `npx tsc --noEmit`,
`npm run lint`, `git status`, `git log`, `npm audit` (si hay red), grep,
lectura de archivos. Nada que escriba en el repo, la base de datos, o un
servicio externo.

## Antes de arrancar: no confíes en los docs, verifica contra el código

Este repo tiene documentación de arquitectura en `docs/` (`ARCHITECTURE_REVIEW.md`,
`AUDIT.md`, `DB_AUDIT_2026-04-28.md`, `AI_SYSTEM_DESIGN.md`) y bitácoras en
`tests/` (`TEST_REPORT.md`, `RESULTS.md`). Léelos primero — son el mapa más
rápido del sistema y ya documentan qué se arregló en corridas anteriores —
pero **trátalos como hipótesis, no como verdad**. `DB_AUDIT_2026-04-28.md`
literalmente se auto-declara desactualizado en su encabezado. Si un doc dice
"esto ya se arregló", confírmalo leyendo el código real antes de darlo por
bueno; los docs de este repo se han quedado atrás de la app más de una vez.

`docs/ARCHITECTURE_REVIEW.md` es el más confiable hoy (fecha de última
revisión en su encabezado) — úsalo como punto de partida para entender el
flujo de ciclos de presupuesto, las RPCs activas y las convenciones del
cliente, pero re-verifica cada convención contra el código real de todas
formas.

`references/known-schema.md` tiene una foto congelada del schema de
Postgres capturada el 2026-07-26. Úsala como referencia rápida de nombres
de columnas, pero **el schema real manda** — si tienes acceso a Supabase
MCP en esta sesión, pide el schema fresco y úsalo en vez del snapshot; si
no, grep el código para confirmar que las columnas que asumes siguen
existiendo antes de reportar un mismatch.

## Las 6 pasadas

Corre las seis. Ninguna reemplaza a otra — la seguridad no captura los
bugs de coherencia de datos, y la coherencia de datos no captura el código
muerto. Usa Grep/Glob agresivamente antes de leer archivos completos; en un
repo de este tamaño, grepear primero y leer después es mucho más rápido que
leer pantalla por pantalla.

### 1. Seguridad

- **Secrets en el cliente**: grep en `src/`, `app/`, `app.json`/`app.config.*`
  y `constants.ts` por API keys que no sean `EXPO_PUBLIC_SUPABASE_URL` /
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` (esas dos son públicas por diseño). Una
  key de OpenAI, Google Vision, o cualquier `SERVICE_ROLE_KEY` en código de
  cliente es crítico — esto ya fue un hallazgo real en `docs/AUDIT.md`
  (resuelto moviendo esas llamadas a Edge Functions); vuelve a verificar que
  la solución no se haya revertido.
- **Edge Functions**: cada función en `supabase/functions/*/index.ts` debe
  autenticar la request (vía `_shared/auth.ts` → `authenticate()`, o el
  patrón dual-mode JWT-de-usuario / `SERVICE_ROLE_KEY` que usan
  `insight-generator` y `synthesize-memory`). Si encuentras una función
  nueva sin ese patrón, es un hallazgo.
- **RPCs de mutación**: `register_expense`, `register_income`,
  `transfer_between_pockets`, `delete_transaction_with_reversal`,
  `update_income_with_reversal`, `execute_cycle_closure`,
  `close_and_start_new_cycle` deberían validar `auth.uid() = p_user_id`
  internamente. **No puedes ver el cuerpo SQL de estas funciones desde el
  repo local** (no hay carpeta `supabase/migrations/` versionada — la DB se
  administra directo contra el proyecto Supabase). Si tienes Supabase MCP
  disponible en la sesión, pide las definiciones reales. Si no, dilo
  explícitamente en el reporte como limitación ("no verificable desde
  código cliente") en vez de asumir que están bien o mal.
- **RPCs que el cliente llama pero que no aparecen ni en
  `references/known-schema.md` ni en `docs/ARCHITECTURE_REVIEW.md`**
  (grep de `.rpc('` en `src/` es la forma más rápida de listarlas todas y
  comparar contra lo documentado): no las trates como bien o mal — son un
  vacío de documentación, repórtalas en "Limitaciones" con el nombre de la
  RPC y dónde se llama, para que quien lea el reporte sepa que esa
  superficie nunca se auditó, en vez de asumir en silencio que están
  cubiertas por los puntos anteriores.
- **Enforcement de suscripción/paywall**: si la app cobra (revisa
  `SubscriptionContext`/`Paywall`/RevenueCat o equivalente), confirma si el
  estado de "está pagando" se valida en algún Edge Function o RPC antes de
  gastar en APIs de pago (OpenAI, Google Vision, etc.), o si vive solo en
  el cliente. Un paywall 100% client-side es trivial de saltarse llamando
  el Edge Function directo con un JWT válido — es un hallazgo de seguridad
  con impacto de negocio (costo no acotado), no solo de UX.
- **RLS**: mismo problema de visibilidad — no hay forma de leer las
  políticas desde el repo local sin acceso a la DB. Repórtalo como
  limitación si no tienes forma de consultarlo, no lo saltes en silencio.
- **Inputs sin validar**: busca conversiones `parseFloat`/`parseInt` sobre
  input de usuario que se mandan directo a un RPC sin `Number.isFinite` ni
  chequeo de rango — un monto `NaN` o negativo llegando a `register_expense`
  es el tipo de bug que ya se documentó antes en `Scanner.tsx`.
- **Permisos nativos**: revisa `app.json`/`app.config.*` — los textos de
  `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, etc. deben
  existir y ser honestos (Apple rechaza la build si faltan o son genéricos,
  dado que Scanner usa cámara y galería).

### 2. Bugs y código muerto

- **Flags fantasma**: para cada `AsyncStorage.getItem('@algo')` o
  `AsyncStorage.setItem('@algo', ...)`, confirma que la contraparte existe
  en algún otro archivo. Un flag que se lee pero nunca se escribe (o
  viceversa) es una rama muerta — exactamente el patrón que se encontró y
  arregló en el tour de `Pockets.tsx` (`@save_magic_tour_pockets_pending`).
- **Mismatches de nombre de campo front/back**: para cada `.from('tabla')`
  o campo leído de una fila de Supabase, confirma que el nombre existe en
  el schema real (`references/known-schema.md` o el schema fresco). El
  bug de referencia acá es `AddIncome.tsx` leyendo `p.allocated` cuando la
  columna real es `p.allocated_budget` — ese campo solo existe en la salida
  del RPC `get_cycle_state`, no en las filas crudas de `pockets`. Cualquier
  screen que lea filas crudas de una tabla (no el resultado de un RPC) y
  use un nombre de campo que no está en el schema es un hallazgo de este
  tipo.
- **Features a medias**: para cada tabla que la UI lee (`Dashboard.tsx`,
  `Pockets.tsx`, etc.), confirma que *algo* en el repo (cliente o Edge
  Function) efectivamente escribe filas ahí. Una tabla con lector pero sin
  productor es una feature fantasma — el patrón que se encontró en
  `pending_income_events` antes de que se decidiera quitar esa UI. Al
  revés también cuenta: una tabla a la que algo escribe pero que nada lee
  es dato huérfano, menos grave pero vale la pena anotarlo.
- **Manejo de errores**: busca `catch` vacíos, o que solo hacen
  `console.error` sin `notify.error(...)` — el usuario se queda sin saber
  que algo falló. Busca también `alert()` / `Alert.alert` nativo en vez de
  `notify` (`src/lib/notify.ts`) — ya se identificó como inconsistencia de
  estilo en `docs/AUDIT.md`.
- **Condiciones de carrera evidentes**: `setTimeout` anidados que asumen
  que un estado ya se actualizó, dos `useEffect` que escriben el mismo
  `AsyncStorage` key sin coordinarse, fetches en paralelo sin manejo de cuál
  llega primero cuando sí importa el orden.

### 3. Coherencia de producto (onboarding / tours / UX)

- Recorre `src/screens/Onboarding.tsx`, `src/components/tour/*` y cada
  `startTour(...)` en `Dashboard.tsx`, `Pockets.tsx`, `Scanner.tsx`,
  `app/index.tsx`. Verifica que la numeración de pasos (`{ step, total }`)
  sea consistente de punta a punta del flujo — un contador que se repite o
  salta un número es un defecto de pulido real, no cosmético puro: le dice
  al usuario que algo está roto aunque no lo esté.
- Textos: busca placeholders (`Lorem ipsum`, `TODO`, `foo`, `test123`),
  strings en inglés sueltos en una app que es 100% español, o copy que no
  coincide con lo que el botón realmente hace.
- Compara el flujo real contra lo que los docs dicen que debería pasar —
  si `docs/ARCHITECTURE_REVIEW.md` describe un flujo distinto al que ves en
  el código, repórtalo (puede ser el código desactualizado o el doc).

### 4. Modo dev vs. modo producción — sé explícito sobre la diferencia

El usuario de esta skill ya pidió antes que se ignoren cosas "en modo dev".
Esta skill debe **distinguir activamente**, no asumir. El método, en
general (no solo para los dos casos históricos de abajo, que ya están
arreglados y probablemente no van a reproducir — úsalos para entender el
patrón, no como la lista completa a buscar):

1. Grep `__DEV__` en `src/` y `app/` para ver qué está genuinamente
   gateado. Eso es dev-only real — **ignóralo**, nunca llega a producción
   (`__DEV__` es `false` en cualquier build, incluyendo TestFlight/App
   Store). Ejemplo ya existente y correcto: `devPaywallBypass` en
   `app/index.tsx`.
2. Por separado, grep palabras como `test`, `demo`, `debug`, `TODO`, `FIXME`
   en comentarios y nombres de `AsyncStorage` keys/variables. Por cada
   resultado, confirma si esa línea está *dentro* de un bloque `__DEV__` o
   no. Si NO lo está, se ejecuta igual en la build que se sube a la store
   — repórtalo, sin importar que "suene" a algo de desarrollador. El
   ejemplo histórico fue `AsyncStorage.removeItem('tour_dashboard_done')`
   en `Scanner.tsx`, comentado como "Reset dashboard tour for demo test"
   sin ningún gate — ya se corrigió, pero el patrón a buscar es ese: texto
   que suena a "esto es solo para probar" sin el gate real que lo respalde.
3. Cuidado con el falso positivo inverso: el "modo demo" de Save
   (`initialMode === 'demo'` en Scanner, el tutorial guiado con factura
   falsa) es una **feature real de producción** para todos los usuarios
   nuevos, no un modo de desarrollador — no la marques como dev-only solo
   porque tiene la palabra "demo" en el nombre.

Cuando reportes algo de esta categoría, di explícitamente en el hallazgo
si está gateado por `__DEV__` o no — es la diferencia entre "ignorar" y
"bloqueante".

### 5. Salud del repo

- `npx tsc --noEmit -p tsconfig.json` — cero errores es la barra mínima.
  Si hay errores, son hallazgo automático de severidad alta (código que ni
  siquiera tipa bien no debería subir).
- `npm run lint` (existe como `expo lint` en `package.json`) — correr y
  reportar warnings/errores relevantes.
- ¿Hay tests? (`docs/AUDIT.md` ya documentó que no había ninguno la última
  vez — confirma si eso cambió, y si no, es un hallazgo de riesgo conocido
  a mantener visible, no repetir como si fuera nuevo).
- Dependencias: si hay red disponible, `npm audit` y reportar
  vulnerabilidades de severidad alta/crítica. Si no hay red, dilo y sigue.
- `app.json`/`eas.json`: versión y `buildNumber`/`versionCode`
  incrementados respecto al último release conocido, bundle identifier
  correcto, `ios.infoPlist` con los permisos de cámara/galería descritos
  arriba.
- Archivos que no deberían estar commiteados: `.env` con valores reales,
  cualquier `*_diff.txt`/`tmp_*` (ya se limpiaron una vez según
  `docs/AUDIT.md` — confirma que no volvieron).

### 6. Verifica lo que ya se dio por resuelto antes

`docs/AUDIT.md` tiene una lista de items marcados `✅ RESUELTO`. Antes de
dar la app por lista, re-chequea rápido los más críticos (API keys fuera
del cliente, RLS, tool use del chat-advisor) en vez de asumir que un
`✅` de hace meses sigue siendo cierto hoy — el software regresiona.

---

## Formato del reporte

Usa exactamente esta estructura. No propongas ni escribas el fix — como
mucho, una frase de sugerencia dentro del hallazgo mismo, nunca un plan de
implementación.

```markdown
# Release Readiness Audit — Save
Fecha: <fecha>
Commit/branch auditado: <git rev-parse --short HEAD, branch>

## Veredicto
**¿Lista para producción? SÍ / NO / CON RESERVAS**

### Bloqueantes (deben resolverse antes de publicar)
- [severidad] <resumen de una línea> — archivo:línea

### Mejoras recomendadas (no bloquean, pero deberían entrar pronto)
- <resumen de una línea> — archivo:línea

### Limitaciones de esta auditoría
- <qué no se pudo verificar y por qué — ej. "no hay acceso a las políticas
  RLS reales ni al cuerpo SQL de las RPCs desde este repo local">

---

## Hallazgos detallados

### 🔴 Crítico
#### <título>
- **Dónde:** archivo:línea
- **Qué pasa:** <descripción concreta, no genérica>
- **Por qué importa:** <impacto real en un usuario o en el negocio>
- **Evidencia:** <cita corta del código o comando corrido>
- **Sugerencia (opcional, una frase):** <sin implementar nada>

### 🟠 Alto
(mismo formato)

### 🟡 Medio
(mismo formato)

### 🟢 Bajo
(mismo formato)

### ⚪ Cosmético
(mismo formato)
```

Criterio de severidad — juzga tanto el impacto en el usuario final como en
el negocio (costos operativos sin tope, exposición legal/de datos, riesgo
de rechazo en la store). No fuerces un hallazgo real a "Medio" solo porque
no rompe algo visible en pantalla:
- **Crítico**: puede filtrar datos de otro usuario, exponer una secret, o
  perder/corromper plata registrada. Bloquea el release sin excepción.
- **Alto**: rompe una función que el usuario espera que funcione (paga por
  ella); es un hueco de seguridad real pero de menor alcance; o permite que
  alguien le genere costos operativos sin límite al negocio (ej. un
  paywall o rate-limit que se puede saltar llamando el backend directo).
- **Medio**: inconsistencia de datos o UX que confunde pero no rompe nada
  irreversible; código muerto que activamente engaña a quien lea el repo.
- **Bajo**: limpieza de código, deuda técnica visible pero sin impacto de
  usuario inmediato.
- **Cosmético**: texto, numeración, detalles visuales.

Si un hallazgo ya aparece en `docs/AUDIT.md` o `docs/DB_AUDIT_2026-04-28.md`
como pendiente, dilo (`"ya documentado en docs/AUDIT.md §X, sigue sin
resolverse"`) en vez de presentarlo como descubrimiento nuevo — ayuda al
usuario a distinguir deuda conocida de regresiones nuevas.
