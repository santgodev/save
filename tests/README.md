# Tests de Save (organic-ledger)

Esta carpeta contiene una suite de tests manuales y semi-automáticos enfocados en
**plata**: todo lo que toca `transactions`, `pockets` y los RPCs que mueven dinero.

## Filosofía

- **La capa 1 del gasto** (RPCs de Postgres) es la que protegemos. Si `transfer_between_pockets`
  pierde un peso, es un bug de producto — no un bug de front.
- Los tests son **ejecutables vía MCP o CLI**. No necesitan cuenta real para las
  pruebas aisladas (usan un usuario de prueba); para reproducir flujos completos
  usan tu usuario real (ver `03_user_journey.sql`).
- **Cada bug que encuentres → Un test de regresión.** Si algo se rompió una vez,
  se va a volver a romper.

## Estructura

```
tests/
  README.md                ← este archivo
  00_helpers.sql           ← setup/teardown: usuario sintético, seed de pockets
  01_smoke.sql             ← ¿arranca el esquema? ¿existen los RPCs?
  02_rpc_transfer.sql      ← 6 casos de transfer_between_pockets
  03_rpc_expense.sql       ← 5 casos de register_expense
  04_edge_cases.sql        ← ataques y tonterías (self-transfer, monto 0, bolsillo ajeno)
  05_user_journey.sql      ← Juan Pérez: recorrido de un usuario real, SIN rollback
  run_all.sh               ← corre 00→04 contra una DB local de Supabase
  RESULTS.md               ← bitácora: fecha, qué pasó, qué se arregló
```

## Cómo correr

### Opción A — Contra un **branch de Supabase** (recomendado, aislado)

Requiere la CLI de Supabase y el MCP server configurado.

```bash
# 1. Crear branch temporal
supabase branches create test-$(date +%s)

# 2. Aplicar migraciones (el branch parte en blanco)
supabase db push --branch test-xxxxxx

# 3. Correr la suite
psql "$(supabase branches get-connection-string test-xxxxxx)" \
  -f tests/00_helpers.sql \
  -f tests/01_smoke.sql \
  -f tests/02_rpc_transfer.sql \
  -f tests/03_rpc_expense.sql \
  -f tests/04_edge_cases.sql

# 4. Borrar branch
supabase branches delete test-xxxxxx
```

### Opción B — Desde Claude vía MCP (ad-hoc)

Pídele:

> Corre tests/01_smoke.sql contra el proyecto SAVE

Y Claude va a ejecutar cada sentencia con `execute_sql` y reportar.

### Opción C — Local con `supabase start`

```bash
supabase start
psql "$(supabase status -o json | jq -r .DB_URL)" \
  -f tests/00_helpers.sql \
  -f tests/01_smoke.sql
```

## Convención para los scripts

Cada archivo de test sigue este patrón:

```sql
\echo '=== Test: <nombre del caso> ==='

BEGIN;

-- setup
-- acción
-- assert (con RAISE NOTICE o SELECT explícito)

ROLLBACK;  -- ¡importantísimo! nunca commit salvo 05_user_journey.sql
```

El `RAISE NOTICE` vs `RAISE EXCEPTION` controla si el test "falla":
- `RAISE NOTICE` → mensaje, continúa.
- `RAISE EXCEPTION` → test rojo, corta ejecución del archivo.

## Qué no cubrimos todavía

- [ ] Tests de Edge Functions (Deno test runner).
- [ ] Tests de componentes React Native (Jest + RNTL).
- [ ] E2E con Maestro.

Esos van en ramas posteriores (ver `ARCHITECTURE_REVIEW.md` fase A/B).
