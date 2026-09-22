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

## 2. Environment variables

claude.ai/code → cloud icon → environment settings → **Environment variables**.

| Variable | What it is |
| :-- | :-- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Safe to expose; it is in the client bundle. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. Also public by design — RLS is what protects the data, not this key. |
| `SB_MCP_PAT` | Supabase personal access token, for the MCP server in `.mcp.json`. **Not** public. |
| `ORGPULS_DEV_EMAIL` | Sign-in for the dev account, used by `scripts/verify/shoot.mjs` to capture screens. |
| `ORGPULS_DEV_PASSWORD` | Its password. |

`shoot.mjs` reads the environment first and `.env.local` second, so a cloud session needs
no `.env.local` and a laptop needs no environment changes.

Never put a service-role key here. Nothing in this project needs one; every read goes
through an RPC that applies k-anonymity, and adding a service-role key to a session is
the one change that would let an agent read raw answers.

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
