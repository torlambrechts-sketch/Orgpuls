#!/usr/bin/env bash
# Every SQL suite, as CI runs them, against the local QA stack (never a hosted project).
set -euo pipefail
cd "$(dirname "$0")/../.."
db=$(supabase status -o json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).DB_URL))')
case "$db" in postgresql://*@127.0.0.1:*|postgresql://*@localhost:*) ;; *) echo "test:db: not a local stack" >&2; exit 2 ;; esac
for suite in supabase/tests/*_invariants.sql supabase/tests/design_figures.sql; do
  psql "$db" -q -v ON_ERROR_STOP=1 -f "$suite" >/dev/null || { echo "FAIL $suite" >&2; exit 1; }
  echo "ok   $suite"
done
