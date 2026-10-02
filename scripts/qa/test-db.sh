#!/usr/bin/env bash
# Every SQL suite, as CI runs them, against the local QA stack (never a hosted project).
set -euo pipefail
cd "$(dirname "$0")/../.."
# DATABASE_URL picks another local stack (an isolated rebuild); without it, the default local stack
db=${DATABASE_URL:-$(supabase status -o json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).DB_URL))')}
case "$db" in postgresql://*@127.0.0.1:*|postgresql://*@localhost:*) ;; *) echo "test:db: not a local stack" >&2; exit 2 ;; esac
# every suite runs, and the run fails at the end: stopping at the first failure left the rest
# unrun and unreported (audit 2026-09-28, AUD-15)
failed=0
for suite in supabase/tests/*_invariants.sql supabase/tests/design_figures.sql; do
  if psql "$db" -q -v ON_ERROR_STOP=1 -f "$suite" >/dev/null; then
    echo "ok   $suite"
  else
    echo "FAIL $suite" >&2
    failed=$((failed + 1))
  fi
done
if [ "$failed" -gt 0 ]; then echo "test:db: $failed suite(s) failed" >&2; exit 1; fi
