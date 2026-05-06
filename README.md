# Save

App colombiana de presupuesto personal. Bolsillos, gastos, ingresos
distribuidos, OCR de facturas, asesor IA read-only.

**Stack:** React Native (Expo SDK 54) · Supabase (Postgres 15 + Edge
Functions Deno) · OpenAI gpt-4o-mini · Google Vision OCR.

---

## Para arrancar

```bash
npm install
npm start            # Expo dev server
# luego: i (iOS sim), a (Android emulator), o escanea con Expo Go
```

Necesitas variables de entorno en `.env` o `app.config.ts`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon>
```

Ver `src/constants.ts` para confirmar cómo se leen.

---

## Para deployar

### Cliente (Expo)

```bash
eas build --platform ios
eas build --platform android
# o web preview:
npx expo export -p web
```

### Backend (Supabase)

```bash
# Aplicar migraciones nuevas:
supabase db push

# Deployar Edge Functions:
supabase functions deploy chat-advisor
supabase functions deploy ocr-receipt
supabase functions deploy insight-generator
supabase functions deploy synthesize-memory
```

Detalles y vars de entorno por function en `supabase/README.md`.

---

## Verificar que todo está sano

```bash
# TypeScript del cliente debe pasar limpio:
./node_modules/.bin/tsc --noEmit

# Regresiones SQL contra prod:
# (ver tests/README.md — opciones MCP, CLI o local)
```

---

## Estructura

```
.
├── app/                       ← Expo Router (mínimo, casi todo en src/)
├── src/
│   ├── App.tsx                ← root + routing entre screens
│   ├── lib/                   ← supabase client, hooks, format, notify, events
│   ├── components/            ← BottomNav, TopBar (chat), BottomSheet, MonthNav
│   ├── screens/               ← Auth, Onboarding, Dashboard, Pockets, Expenses,
│   │                            Scanner, AddIncome, PocketTransfer, Profile
│   ├── theme/                 ← tokens (colors, typography, shadows, radius)
│   └── utils/                 ← merchant normalize, profile calc, patterns
├── supabase/
│   ├── functions/             ← Edge Functions (chat-advisor, ocr-receipt, etc.)
│   └── migrations/            ← 12 migraciones aplicadas a prod
├── docs/                      ← arquitectura, IA, design system, auditorías
├── tests/                     ← regresiones SQL + bitácora cronológica
└── README.md                  ← este archivo
```

---

## Documentación

Si vienes a tocar algo, lee en este orden:

1. **`docs/ARCHITECTURE_REVIEW.md`** — el mapa completo del sistema. DB,
   Edge Functions, cron, cliente, seguridad. Empieza acá.
2. **`docs/DESIGN_TOKENS.md`** — convenciones del cliente. Cuándo usar
   `formatMoney`, `notify`, `BottomSheet`, `MonthNav`, `theme.typography`.
   **Si vas a tocar UI, leelo antes**.
3. **`docs/AI_SYSTEM_DESIGN.md`** — el chat read-only, los 2 cron jobs
   (insights + memoria), el OCR. Cómo iterar prompts sin perder
   trazabilidad.
4. **`docs/DB_AUDIT_2026-04-28.md`** — auditoría detallada de la DB
   (tablas, RPCs, índices, RLS, advisors). Parcialmente outdated tras la
   7ª corrida — el plan ejecutado está en `tests/RESULTS.md`.
5. **`docs/THEME_DESIGN_SYSTEM.md`** — paleta y tokens visuales (colors,
   shadows, radius).
6. **`tests/TEST_REPORT.md`** — los 13 bugs originales + 7 descubiertos
   post-cierre. TL;DR del estado de calidad.
7. **`tests/RESULTS.md`** — bitácora cronológica de las 10 corridas
   (cada migración aplicada, cada deploy, cada bug arreglado, con
   verificación post-fix).
8. **`supabase/README.md`** — setup local de Supabase y deploys.

---

## Pendientes operacionales

Lo único que NO se puede hacer desde código y queda manual:

- **Activar HIBP** (Have I Been Pwned password protection):
  Dashboard → Auth → Sign In / Sign Up → Password security → toggle on.
- **Crear secret en Vault** (necesario para que los crons hagan auth):
  Dashboard SQL Editor →
  ```sql
  SELECT vault.create_secret('<service-role-key>', 'service_role_key');
  ```

Ambos están explicados en `tests/RESULTS.md` corrida 8 y en
`docs/AI_SYSTEM_DESIGN.md`.

---

## Convenciones (lo no negociable)

- **Toda plata**: `formatMoney()` de `lib/format.ts`. Cero excepciones.
- **Toda notificación**: `notify.*` de `lib/notify.ts`. Cero `alert()`.
- **Todo número del mes**: hook `useMonthlyState()` que consume el RPC
  `get_monthly_state`. Cero recálculos en cliente.
- **Sin emojis** en saludos, CTAs, microcopy. La marca es sobria.
- **`session: Session`** (de `@supabase/supabase-js`), no `session: any`.

Si alguno de estos se rompe, leé `docs/DESIGN_TOKENS.md` y arreglá.

---

## Estado actual (2026-04-29)

- 13/13 bugs originales del TEST_REPORT cerrados.
- 7 bugs adicionales descubiertos post-cierre, también cerrados.
- TypeScript estricto pasa con 0 errores.
- 4 Edge Functions deployadas (chat-advisor v8, ocr-receipt v5,
  insight-generator v1, synthesize-memory v1).
- 2 cron jobs activos en `pg_cron` (insights diario, memoria semanal).
- 8 tablas vivas en `public` (eran 11 — se borraron 3 zombi).
- Advisors de Supabase: 69 warnings → 6 (los 6 son intencionales o
  config de Dashboard).

---

## Licencia / contacto

Privado. santgodev.
