# Setting up a Claude Code session for Orgpuls

Four things, in this order. The first is the one that matters most, because it cannot be
fixed once a session has started.

---

## 1. `.claude/settings.json` — commit it BEFORE starting a session

Claude Code reads this file **once, at session start**. Editing it while a session is
running changes nothing for that session: it stays pinned to whatever the file said when
it launched. A `deny` rule committed here in September blocked `git push` for an entire
working day, and correcting the file mid-session did not help.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "defaultMode": "bypassPermissions",
    "allow": ["*"],
    "deny": [],
    "ask": []
  }
}
```

`deny` and `ask` are empty on purpose. Nothing is blocked; nothing prompts. The judgement
about what is destructive lives in CLAUDE.md under **Operating authority**, where an
agent can read the reasoning, rather than in a pattern list that fires with no
explanation and cannot be reasoned with.

The trade is real and accepted: `git push --force` and `supabase projects delete` will
now run unchallenged.

---

## 2. Environment variables and credentials

claude.ai/code → cloud icon → environment settings.

### Environment variables — `.env` format, `KEY=value`, one per line

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase → Project Settings → API>
ORGPULS_DEV_EMAIL=<the dev account's sign-in>
```

A list of names is rejected with "Couldn't parse … Use KEY=value format".

Both `NEXT_PUBLIC_` values are public by design — they ship in the browser bundle, and
RLS is what protects the data, not the anon key. They are safe here.

### There is no Supabase token to configure

`.mcp.json` used to send `Authorization: Bearer ${SB_MCP_PAT}`, which required a Supabase
personal access token in the environment. It does not any more, and the reason is worth
keeping: setting that header **disables the server's OAuth fallback**. The failure read
`AUTH_HEADER_REJECTED — OAuth fallback is disabled when headers.Authorization is set`,
which is the endpoint saying it would have authenticated us interactively if we had not
insisted on a token.

With the header gone the server authorises over OAuth, so there is no long-lived
account-scoped credential to store, leak or rotate. Do not add it back.

### The Supabase MCP is the claude.ai connector, not `.mcp.json`

`.mcp.json` then declared the server with no header, to authorise over OAuth. That never
worked in a cloud session: the OAuth token is kept in the container, every session starts
a fresh container with none, and a cloud session cannot run the interactive sign-in. So
each session opened with "supabase needs authentication" — while the claude.ai **Supabase**
connector, which reaches the same project, was connected and working. Reconnecting that
connector could not clear the notice, because the notice was about the other server.

The entry is removed (2026-09-26). Database tools come from the connector
(`mcp__Supabase__*`), connected once under claude.ai → Settings → Connectors. If claude.ai
itself asks for it to be reconnected, that is the connector's own sign-in expiring.

### API credentials

For `ORGPULS_DEV_PASSWORD` only — the fixture account the screenshot script signs in as.

That section configures credentials **per service**, injected as HTTP headers on calls to
that service. It does not create environment variables, so it cannot feed a `${VAR}`
substitution in `.mcp.json`. It is also not the place for an Anthropic API key unless you
actually want sessions calling the Anthropic API.

Never add a Supabase service-role key anywhere. Nothing here needs one; every read goes
through an RPC that applies k-anonymity, and a service-role key is the single change that
would let a session read raw answers.

---

## 3. Setup script

Same settings page → **Setup script**. Paste the contents of
`scripts/cloud-env-setup.sh` verbatim.

It installs the Playwright MCP server and Chromium, and — importantly — skips the
browser download when the image already ships one. Re-downloading is slow and the
cloud proxy often refuses it. Never run `playwright install` inside a session.

---

## 4. Start the session

New session on `torlambrechts-sketch/Orgpuls`, branch `main`.

A good opening prompt:

> Read CLAUDE.md, docs/IMPLEMENTATION_PLAN.md and docs/DEVIATIONS.md. Then build the
> Resultat screen, following the same approach as Målinger: read the bundle lines first,
> build against the primitives, every figure from the database, and verify with the
> pixel gate before committing.

---

## Checking it worked

In the first minute of the session, ask it to run:

```bash
npm ci
npx tsc --noEmit && npm run lint && npm run verify:i18n
```

All three should pass. Then:

```bash
npx next build && npx next start -p 3000 &
node scripts/verify/shoot.mjs /innsikt /malinger
```

That proves the environment variables, the database connection, the dev account and the
browser all work together. The screenshots land in `artifacts/` and should show
Arbeidsmiljøindeks **61** with **−3 siden i fjor**, and Målinger showing **28 av 34
svarte · 82 %**.

If those numbers are wrong, the fixture or a migration has drifted — that is the signal,
and it is worth stopping for.

---

## Known issue: GitHub Actions

CI jobs currently fail within seconds without producing logs, on every commit including
ones containing no application code. That is not a workflow error — the jobs are created
with the correct names, so the YAML parses — it is Actions being unable to run: exhausted
minutes or a spending limit, at <https://github.com/settings/billing>. Private repos draw
on the free monthly quota; public ones are unlimited.

It does not block development. Every gate CI runs can be run locally, and the workflow is
correct and waiting.
