# Release Readiness Audit — Save
Fecha: 2026-08-02
Commit/branch auditado: 3d8c33a (main) — con 6 archivos modificados sin commitear: `app/index.tsx`, `src/components/tour/TourContext.tsx`, `src/components/tour/TourOverlay.tsx`, `src/screens/Dashboard.tsx`, `src/screens/Pockets.tsx`, `src/screens/Scanner.tsx`. El hallazgo crítico está en ese código sin commitear.

## Veredicto
**¿Lista para producción? CON RESERVAS**

_Actualizado 2026-08-02:_ el bloqueante crítico (pérdida de plata registrada por la limpieza de demos huérfanas) **ya se arregló** — ver detalle en Hallazgos. Las reservas restantes son de menor severidad (Alto/Medio/Bajo), ninguna bloquea el release por sí sola. El resto de la base sigue sólida: `tsc --noEmit` pasa sin errores, las RPCs de mutación están centralizadas en el servidor, RLS está habilitado en todas las tablas (según docs, no verificable localmente), las Edge Functions autentican consistentemente, y el sistema de ciclos de presupuesto está bien documentado y con bugs históricos ya resueltos y confirmados en producción.

### Bloqueantes (deben resolverse antes de publicar)
- Ninguno pendiente. El único bloqueante encontrado (limpieza de transacciones demo huérfanas sin reversar el bolsillo) se corrigió el 2026-08-02 — ver "🔴 Crítico" en Hallazgos detallados, marcado como `[FIXED]`.

### Mejoras recomendadas (no bloquean, pero deberían entrar pronto)
- [🟠 Alto] El paywall no bloquea nada en el backend, solo registra el evento — costo de OpenAI/Google Vision sin tope hasta que se active — [supabase/functions/_shared/entitlement.ts:9-26](supabase/functions/_shared/entitlement.ts#L9-L26)
- [🟡 Medio] `@save_tour_pockets_seen` se escribe y se limpia pero nunca se lee — flag muerta — [src/screens/Pockets.tsx:150](src/screens/Pockets.tsx#L150)
- [🟡 Medio] `saveToSupabase` sigue sin `Number.isFinite` antes de mandar el monto al RPC (ya documentado en `docs/AUDIT.md` §1.2, mitigado parcialmente por el `disabled` del botón, no por la función misma) — [src/screens/Scanner.tsx:490](src/screens/Scanner.tsx#L490)
- [🟢 Bajo] 9 errores de lint reales (no solo warnings): comillas sin escapar en JSX — [src/screens/Paywall.tsx:125](src/screens/Paywall.tsx#L125), [src/screens/AddIncome.tsx:141](src/screens/AddIncome.tsx#L141)
- [🟢 Bajo] `npm audit` reporta 21 vulnerabilidades (18 moderate, 3 high) — todas en el toolchain de build de Expo (`brace-expansion`, `postcss`, `tar`, `uuid`, `fast-uri`), no en código que corra en el binario del usuario
- [🟢 Bajo] Cero tests — ya documentado en `docs/AUDIT.md` §5, sigue sin resolverse
- [⚪ Cosmético] Edge Function `delete-account` no está listada en `docs/ARCHITECTURE_REVIEW.md` (el código en sí está bien — usa `authenticate()` y borra en el orden correcto)
- [⚪ Cosmético] `@react-native-google-signin/google-signin` sigue en `package.json` sin uso real tras el revert del login nativo de Google (`src/screens/Auth.tsx:274-283` explica por qué se abandonó)

### Limitaciones de esta auditoría
- No hay acceso a Supabase MCP en esta sesión: no se pudo leer el cuerpo SQL real de las RPCs de mutación ni las políticas RLS vigentes. Se confió en `docs/ARCHITECTURE_REVIEW.md` y `references/known-schema.md` (snapshot del 2026-07-26).
- `get_total_savings` ([src/screens/HistoryScreen.tsx:186](src/screens/HistoryScreen.tsx#L186)) y `delete_pocket_safe` ([src/screens/Pockets.tsx:199](src/screens/Pockets.tsx#L199)) son RPCs que el cliente llama pero que no aparecen ni en `known-schema.md` ni en `ARCHITECTURE_REVIEW.md` — nunca se auditó si validan `auth.uid() = p_user_id` internamente. No se puede verificar desde el repo local.
- No se verificó nada contra App Store Connect (metadata, capturas, cumplimiento de guidelines de reseña de Apple) — fuera del alcance de este repo.

---

## Hallazgos detallados

### 🔴 Crítico

#### `[FIXED 2026-08-02]` Limpieza de transacciones demo huérfanas corrompía el presupuesto del bolsillo
- **Dónde:** [app/index.tsx:400-424](app/index.tsx#L400-L424)
- **Qué pasaba:** Cuando `loadUserData` corría y `@save_demo_in_progress` no era `'true'`, el código buscaba transacciones con `metadata.is_demo` y las borraba con `supabase.from('transactions').delete().in('id', demoTxIds)` — un DELETE crudo desde el cliente. El flujo demo del Scanner registra ese gasto con la RPC real `register_expense` ([src/screens/Scanner.tsx:494-502](src/screens/Scanner.tsx#L494-L502)), la cual sí decrementa `pockets.budget` de verdad. El DELETE crudo no pasaba por `delete_transaction_with_reversal`, la única RPC que revierte ese descuento.
- **Por qué importaba:** un usuario que abandonara el tutorial demo después de que Save "registrara" el gasto falso (hasta $850.000 COP) pero antes de tocar "Eliminar", se quedaba con el bolsillo permanentemente corto en esa plata, sin ninguna transacción que lo explicara.
- **Fix aplicado:** se reemplazó el DELETE crudo por una llamada a `delete_transaction_with_reversal` (vía `strictClient.rpc(...)`, con `p_tx_id`/`p_user_id`) por cada transacción demo huérfana, en paralelo con `Promise.all`. Solo se filtran del estado local las transacciones cuya reversión efectivamente confirmó el servidor — si la RPC falla para alguna, se queda visible para reintentarlo en el próximo `loadUserData` en vez de desaparecer sin revertir el saldo.
- **Verificación:** `npx tsc --noEmit` limpio tras el cambio. No se ejecutó el flujo end-to-end en dispositivo/simulador — recomendado antes de publicar: completar el tutorial demo, abandonarlo a medio camino, y confirmar que el bolsillo recupera el presupuesto en el siguiente arranque de la app.

---

### 🟠 Alto

#### Paywall sin enforcement en el backend — costo operativo sin tope
- **Dónde:** [supabase/functions/_shared/entitlement.ts:9-26](supabase/functions/_shared/entitlement.ts#L9-L26), usado en `chat-advisor` y `ocr-receipt`.
- **Qué pasa:** `checkEntitlement()` consulta RevenueCat pero el resultado solo se usa para loguear un evento (`entitlement.unpaid_api_call`), nunca para rechazar la request. Cualquier usuario con JWT válido (cuenta gratis, sin pasar por el Paywall) puede llamar `ocr-receipt` o `chat-advisor` directo y generar costo real de OpenAI/Google Vision indefinidamente.
- **Por qué importa:** Es un hallazgo de negocio, no solo de seguridad — el costo por llamada no tiene techo mientras el bloqueo esté apagado.
- **Evidencia:** el propio código lo documenta como decisión deliberada y temporal ("los callers deben usar `active` solo para loguear, no para rechazar la request -- hasta que se revise el dato real y se decida activar el bloqueo a propósito").
- **Sugerencia (opcional):** ninguna — ya está diagnosticado en el propio código; solo falta decidir cuándo activar el bloqueo real.

---

### 🟡 Medio

#### Flag de tour `@save_tour_pockets_seen` nunca se lee
- **Dónde:** se escribe en [src/screens/Pockets.tsx:150](src/screens/Pockets.tsx#L150), se limpia en [src/screens/Dashboard.tsx:364](src/screens/Dashboard.tsx#L364) y [src/screens/Onboarding.tsx:121](src/screens/Onboarding.tsx#L121) — pero ningún `AsyncStorage.getItem('@save_tour_pockets_seen')` existe en todo el repo.
- **Qué pasa:** es exactamente el patrón de flag fantasma documentado antes en este mismo tour (ver `docs/AUDIT.md`) — no rompe nada visible hoy porque el guard real (`@save_demo_tour_triggered_id_v3`) sí funciona, pero es código que activamente engaña a quien lea el archivo pensando que controla algo.
- **Por qué importa:** deuda de código que confunde a futuro mantenimiento del flujo de tours, que ya es frágil (varias capas de AsyncStorage coordinándose).
- **Evidencia:** grep de `save_tour_pockets_seen` en todo `src/` y `app/` — 3 resultados, ninguno es lectura.

#### Validación de monto en Scanner sigue sin guard explícito
- **Dónde:** [src/screens/Scanner.tsx:490](src/screens/Scanner.tsx#L490)
- **Qué pasa:** `parseInt(editableAmount.replace(/[^0-9]/g, ''), 10)` puede dar `NaN` si `editableAmount` queda vacío tras la limpieza. El botón que dispara esto sí está `disabled` cuando el monto limpio es `<= 0` ([Scanner.tsx:683-684](src/screens/Scanner.tsx#L683-L684)), así que hoy no es alcanzable desde la UI normal — pero la función en sí sigue sin el `Number.isFinite` que `docs/AUDIT.md` §1.2 pidió agregar.
- **Por qué importa:** ya documentado como hallazgo, sigue sin resolverse en la función misma (solo mitigado indirectamente por el estado del botón).
- **Evidencia:** `docs/AUDIT.md` línea 42-44.

---

### 🟢 Bajo

#### Errores de lint reales (no solo warnings)
- **Dónde:** [src/screens/Paywall.tsx:125](src/screens/Paywall.tsx#L125) (2 comillas sin escapar), [src/screens/AddIncome.tsx:141](src/screens/AddIncome.tsx#L141) (4 comillas sin escapar) — regla `react/no-unescaped-entities`.
- **Qué pasa:** `npm run lint` reporta 9 errores + 191 warnings. De los 9 errores, 6 son estos de comillas, 1 es `import/no-unresolved` para `expo-quick-actions` (el paquete sí está instalado en `node_modules` — parece un falso positivo del resolver de ESLint, no del bundler real), y 2 son del bug conocido de npm con bindings nativos (`Cannot find native binding`), no del código.
- **Por qué importa:** cosmético, pero vale la pena limpiarlo antes de un release para no acostumbrarse a ignorar errores reales de lint.

#### `npm audit`: 21 vulnerabilidades en el toolchain de build
- **Dónde:** dependencias transitivas de `expo` (`brace-expansion`, `postcss`, `tar`, `uuid`, `fast-uri`) — 18 moderate, 3 high.
- **Qué pasa:** todas viven en `@expo/cli`, `@expo/config`, `@expo/metro-config` y similares — código que corre en la máquina de build/dev, no en el bundle JS que termina en el teléfono del usuario.
- **Por qué importa:** bajo impacto real para el usuario final, pero vale correr `npm audit fix` (sin `--force`, que rompería con un upgrade mayor de Expo) antes del release.

#### Cero tests
- **Dónde:** todo el repo, `package.json` sin script `test`.
- **Qué pasa:** ya documentado en `docs/AUDIT.md` §5 como deuda de alto riesgo para una app financiera, sigue igual.

---

### ⚪ Cosmético

#### `delete-account` no está en el mapa de arquitectura
- **Dónde:** `supabase/functions/delete-account/index.ts` existe y está bien implementado (usa `authenticate()`, borra en orden hijo→padre, aborta antes de tocar `auth.users` si algo falla) pero `docs/ARCHITECTURE_REVIEW.md` solo documenta `chat-advisor`, `ocr-receipt`, `insight-generator` y `synthesize-memory`.

#### Dependencia de Google Sign-In nativo sin uso
- **Dónde:** `package.json` — `@react-native-google-signin/google-signin`. El login de Google se revirtió al flujo web ([src/screens/Auth.tsx:274-294](src/screens/Auth.tsx#L274-L294), bien explicado por qué), pero la dependencia nativa se quedó instalada sin llamarse desde ningún lado.
