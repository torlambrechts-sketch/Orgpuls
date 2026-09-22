#!/bin/bash
# SessionStart hook. Does nothing on your own machine; in a cloud session it installs
# project dependencies so the dev server can start straight away.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if [ ! -d node_modules ]; then
  if [ -f pnpm-lock.yaml ]; then
    pnpm install --frozen-lockfile || pnpm install
  elif [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund || npm install --no-audit --no-fund
  elif [ -f package.json ]; then
    npm install --no-audit --no-fund
  fi
fi

exit 0
