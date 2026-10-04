#!/usr/bin/env bash
# The local QA stack in a cloud session: starts Docker when the VM has none running, then scripts/qa/up.sh,
# retried, because the first start after a VM boot can time out while images load. Local only: up.sh never
# touches a hosted project. Arguments pass through (--reset rebuilds the database from the migrations).
#
#   bash scripts/qa/cloud-up.sh            the stack, seeded
#   bash scripts/qa/cloud-up.sh --reset    the same from an empty database
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! docker info >/dev/null 2>&1; then
  (dockerd > /tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
docker info >/dev/null 2>&1 || { echo "cloud-up: docker did not start (/tmp/dockerd.log)" >&2; exit 1; }
for attempt in 1 2 3; do
  if bash scripts/qa/up.sh "$@"; then echo "cloud-up: stack up (attempt $attempt)"; exit 0; fi
  echo "cloud-up: attempt $attempt failed, retrying" >&2
  sleep 5
done
echo "cloud-up: the stack did not come up" >&2
exit 1
