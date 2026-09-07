#!/usr/bin/env bash
# Apply every migration (and optionally the seed) to a throwaway Postgres to
# check the SQL before it reaches a Supabase project.
#
#   ./scripts/validate-migrations.sh            # schema only
#   ./scripts/validate-migrations.sh --seed     # schema + seed.sql
#
# Needs a Postgres you can create databases on; set PGHOST/PGUSER as usual.
set -euo pipefail

cd "$(dirname "$0")/.."

DB="${VALIDATE_DB:-track_a_lack_validate}"
PSQL=(psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

echo "→ recreating $DB"
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null
"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null

echo "→ auth stub"
"${PSQL[@]}" -d "$DB" -f scripts/_auth_stub.sql >/dev/null

for f in supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null
done

if [[ "${1:-}" == "--seed" ]]; then
  echo "→ seed.sql"
  "${PSQL[@]}" -d "$DB" -f supabase/seed.sql >/dev/null
fi

echo "→ smoke checks"
"${PSQL[@]}" -d "$DB" -f scripts/smoke.sql

echo "✓ migrations apply cleanly"
