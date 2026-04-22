#!/usr/bin/env bash
# tests/run_all.sh — corre la suite contra una URL de Postgres.
#
# Uso:
#   DB_URL="postgres://..." ./tests/run_all.sh
#
# Si no seteas DB_URL, usa la DB local de `supabase start`.

set -euo pipefail

DB_URL="${DB_URL:-$(supabase status -o json 2>/dev/null | jq -r .DB_URL 2>/dev/null || echo '')}"
if [[ -z "$DB_URL" ]]; then
  echo "❌ No hay DB_URL. Levanta 'supabase start' o pasa DB_URL."
  exit 1
fi

echo "→ Corriendo suite contra $DB_URL"
echo

for f in tests/00_helpers.sql \
         tests/01_smoke.sql \
         tests/02_rpc_transfer.sql \
         tests/03_rpc_expense.sql \
         tests/04_edge_cases.sql; do
  echo "────────────── $f ──────────────"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
  echo
done

echo "✅ Suite completa sin errores críticos"
echo "ℹ  05_user_journey.sql NO se corre aquí (persiste datos). Ejecútalo a mano si quieres."
