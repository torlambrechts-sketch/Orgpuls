#!/bin/bash
# Cloud environment SETUP SCRIPT.
# Paste the contents into: claude.ai/code -> cloud icon -> environment settings -> Setup script.
# Runs once as root before Claude Code launches; the result is snapshotted and reused (~7 days).
# Kept in the repo only so the pasted version is under version control.
set -uo pipefail

PW_MCP_VERSION="0.0.82"   # keep in step with scripts/playwright-mcp.sh

# The image may already ship Chromium and point PLAYWRIGHT_BROWSERS_PATH at it.
# Respect that: a second copy is a slow download that the image's proxy may refuse.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/ms-playwright}"

# 1. Playwright MCP server, installed globally so .mcp.json can start it with no network call.
npm install -g "@playwright/mcp@${PW_MCP_VERSION}" || true

# 2. Chromium + OS libraries, but only when the image has not already provided a browser.
#    scripts/playwright-mcp.sh passes --executable-path for whichever build is on disk, so the
#    MCP server's pinned revision and the image's revision are allowed to differ.
if ! ls "${PLAYWRIGHT_BROWSERS_PATH}"/chromium* >/dev/null 2>&1; then
  "$(npm root -g)/@playwright/mcp/node_modules/.bin/playwright" install --with-deps chromium || true
fi

# 3. Make both reachable whatever user and PATH the session runs with.
ln -sf "$(npm prefix -g)/bin/playwright-mcp" /usr/local/bin/playwright-mcp || true
chmod -R a+rX "${PLAYWRIGHT_BROWSERS_PATH}" || true

exit 0
