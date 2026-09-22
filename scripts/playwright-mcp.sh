#!/bin/bash
# Launcher for the playwright MCP server declared in .mcp.json.
#
# It exists because the cloud container and a laptop disagree about the browser:
# the container pre-installs Chromium under $PLAYWRIGHT_BROWSERS_PATH at a build
# number that need not match the one @playwright/mcp pins, and re-downloading is
# blocked there. So: point the server at a browser that is already on disk when
# there is one, and otherwise let Playwright resolve its own.
set -uo pipefail

ARGS=(--headless --isolated --no-sandbox --browser chromium
      --viewport-size 1440x900 --output-dir .playwright-mcp)

for candidate in \
  "${PLAYWRIGHT_BROWSERS_PATH:-}/chromium" \
  "${PLAYWRIGHT_BROWSERS_PATH:-}/chromium/chrome-linux/chrome" \
  /opt/pw-browsers/chromium \
  /opt/ms-playwright/chromium/chrome-linux/chrome
do
  case "$candidate" in /chromium*) continue ;; esac
  if [ -x "$candidate" ]; then
    ARGS+=(--executable-path "$candidate")
    break
  fi
done

if command -v playwright-mcp >/dev/null 2>&1; then
  exec playwright-mcp "${ARGS[@]}" "$@"
fi
exec npx -y "@playwright/mcp@${PW_MCP_VERSION:-0.0.82}" "${ARGS[@]}" "$@"
