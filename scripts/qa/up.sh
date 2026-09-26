#!/usr/bin/env bash
# The QA stack from nothing: local Supabase, every migration, the modules, the Lumio tenant.
# Never touches a hosted project: `supabase start` is the CLI's local stack.
set -euo pipefail
cd "$(dirname "$0")/../.."
services=realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,mailpit
supabase status >/dev/null 2>&1 || supabase start -x "$services"
if [ "${1:-}" = "--reset" ]; then supabase db reset; fi
db=$(supabase status -o json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).DB_URL))')
# the same order as CI, so the SQL suites hold here as they do there; then the QA tenant
npm run -s modules:seed | psql "$db" -q -v ON_ERROR_STOP=1 >/dev/null
node scripts/seed/design-fixture.mjs | psql "$db" -q -v ON_ERROR_STOP=1 >/dev/null
node scripts/seed/demo-org.mjs | psql "$db" -q -v ON_ERROR_STOP=1 >/dev/null
psql "$db" -q -v ON_ERROR_STOP=1 -c "select opened, closed, queued, planned from app.wheel_tick()" >/dev/null
psql "$db" -q -v ON_ERROR_STOP=1 -f supabase/tests/local_account.sql >/dev/null
url=$(supabase status -o json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).API_URL))')
QA_DATABASE_URL="$db" SUPABASE_URL="$url" NEXT_PUBLIC_SUPABASE_URL="$url" node scripts/qa/seed.mjs --apply
