---
name: audit
description: Verify the whole product against what it promises — code quality, database read/write wiring, security, user journeys end to end across roles, and visual. Use for a scheduled audit, before a release, after a large segment, or whenever someone asks whether something really works. Modes: quick, full (default), deep. Produces docs/audits/<date>-<mode>.md with evidence for every finding.
---

# /audit — prove it works, or find where it does not

`/audit [quick|full|deep] [scope]` — scope is optional (a route, a feature, a D-number, or
`since:<commit>`). Default: `full`, whole product, since the last report in `docs/audits/`.

## Why this exists

The Soundings gap analysis (2026-09-28) found shipped features that did nothing: own questions
stored and never asked (P0-1), a promise to screen comments that nobody kept (P0-2), an open
field written and never read (P0-3), settings saved with no effect (P0-4). Every gate was green.
The first run of this audit then found another one the same day (`year_wheels.notify_lead_days`).
The causes, and the rule here that answers each:

| Cause | Rule |
|---|---|
| Gates checked the build against itself — pixels against baselines, SQL against the invariants of what exists — never against what the product *tells* people | §6 Promise audit: start from the text a user reads |
| A write was tested; its reader was never required to exist | §2 Wiring: every write has a reader, every setting an effect |
| Features were verified screen by screen, in the role that built them | §4 Journeys: across roles, to where the effect shows (another role's screen, a mail, a public page) |
| The same session wrote the code, the tests and the verdict | §7 Independent review, adversarial by default |
| "336 passed" was read; the line saying a file failed to load was not | Rule 2: exit codes, not summaries |
| A baseline or allowlist was updated to make a gate pass | Rule 7: a gate is changed only with the diff seen and the reason written |

## Rules (non-negotiable)

1. **Evidence or it did not happen.** Every check records the command, its exit code, and an
   excerpt, a query result or a screenshot path. "Looks fine" is not a result.
2. **Exit codes, not summaries.** Run gates with `set -o pipefail`; read `echo $?`. For vitest,
   both `Test Files` and `Tests` lines must say no failed.
3. **Verify the promise, not the implementation.** The unit under test is what a user is told
   will happen, followed to where it visibly happens.
4. **Every write has a reader; every setting has an effect; every read has a writer.** A screen
   that shows a setting back to the person who set it is not an effect.
5. **Negative paths are first-class**: wrong role, below k, expired or spent token, empty state,
   network or database failure, a flag off, a language not offered.
6. **Same order as CI**: a database rebuilt from `supabase/migrations/` with the CI seeds. The
   hosted project is read-only for an audit: advisors, migration list, SELECTs — no writes.
7. **A gate is never loosened to pass.** No baseline re-recorded, claim deleted, allowlist entry
   added or test skipped without looking at the diff and writing why in the commit and report.
8. **The auditor is not the author.** Run in a fresh session (or a subagent) that did not write
   the code under audit; its job is to show that something does not work.
9. **Security invariants in CLAUDE.md are pass/fail.** A breach is a P0 and stops the audit's
   "ship" verdict regardless of anything else.

## Modes and schedule

| Mode | When | Phases | Time |
|---|---|---|---|
| `quick` | every push (CI covers most) or on request | 1, 2a, the journeys the change touches | ~15 min |
| `full` | weekly, scheduled | 0–6 and 8, all journeys at 390 and 1280 px, bokmål and English | 1–3 h |
| `deep` | before a release, after a large segment, monthly | everything, plus 7, hosted read-only checks, exploratory session | half a day |

Scheduling (a Routine that starts a fresh session each time):
- weekly full — `CRON_TZ=Europe/Oslo 47 5 * * 1`, prompt: *"Run /audit full on main. Write
  docs/audits/<date>-full.md, commit it on a branch audit/<date>, open a PR, and list every P0/P1
  in the PR body. Do not fix anything in this run."*
- monthly deep — `CRON_TZ=Europe/Oslo 47 5 1 * *`, same prompt with `deep`.

Fixing is a separate task: an audit that also fixes marks its own homework.

## Phase 0 — Prepare (record in the report header)

```bash
set -o pipefail
git rev-parse HEAD; git log -1 --format=%cd
pgrep dockerd >/dev/null || (dockerd >/tmp/dockerd.log 2>&1 &); until docker info >/dev/null 2>&1; do sleep 2; done
npm ci
npm run qa:up -- --reset          # local stack: migrations, modules, fixture, demo, tick, local account, QA tenant
DB=$(supabase status -o json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).DB_URL))')
```
Report header: commit, date, mode, scope, database = rebuilt from migrations (yes/no), previous
report and which of its findings are still open.

## Phase 1 — Code quality

Run each; record exit code.
```bash
npx tsc --noEmit
npm run lint
npx vitest run                      # Test Files: 0 failed AND Tests: 0 failed
npm run verify:i18n
npm run -s modules:validate
npx next build
supabase db lint --level warning    # 0 errors
npm audit --omit=dev --audit-level=high
node scripts/functions/deploy.mjs --check   # edge functions type-check (no deploy)
```
Then read the diff since the last audit (`git diff <last-audit-commit>..HEAD --stat`, then the
files) for:
- **Zod at every server boundary**: every `'use server'` export and route handler parses its
  input; every RPC result is `safeParse`d, never cast (`as` on `data` is a finding).
- **No hard-coded user text**; **no respondent free text in `console.*`**, errors or analytics.
- **Dead code and leftovers**: exports with no importer, components never rendered, feature
  flags with no reader, `TODO`/`FIXME` added since the last audit.
- **Docs agree with code**: every D-/X-number added since the last audit — does the code do
  what the entry says? A deviation described but not built is a finding.

## Phase 2 — Database: read, write, wiring

**2a Catalog and wiring (machine):**
```bash
node scripts/audit/wiring.mjs --db "$DB" --matrix > /tmp/wiring.md; echo "exit $?"
```
- `S*` (security posture): any finding is P0/P1. `S4`/`S5` entries not in
  `.claude/skills/audit/allowlist.json` are new public entry points or direct client writes:
  review each (who may call, what it returns, rate limit, RLS policy) before allowlisting.
- `W1` stored for no one; `W2` a setting with no database consumer; `R1` an RPC nothing calls.
  Each is resolved one of three ways: fixed, removed, or allowlisted **with the reason**.

**2b Settings matrix (manual, from `--matrix`)**: for every setting row, name the consumer that
produces an observable effect and the test that proves it. Columns: setting · where set (screen)
· consumer (function/job/page) · observable effect · proving test. A row without a proving test
is a finding (P1 if a user can set it).

**2c Every write path has a read path**: list tables written since the last audit
(`git diff … -- supabase/migrations | grep -iE 'create table|insert into|update '`). For each:
who reads it, on which screen, for which role. Write-only data that a user typed is P0.

**2d SQL suites**: `npm run test:db` (all `*_invariants.sql` + `design_figures.sql`) and
`npm run test:invariants`. All must pass on the rebuilt database.

**2e k-anonymity probes** (in addition to the suites): for each result reader added or changed,
a round with one group at k−1 and one at k — the k−1 group shows no figure anywhere: not in
results, not in participation, not by difference with the whole (complementary suppression), not
in exports, not on the employees' page, not in a mail.

**2f Migrations**: rebuild from zero succeeds; no applied migration edited
(`git log --diff-filter=M -- supabase/migrations`); hosted migration list equals the repo
(Supabase MCP `list_migrations`); `get_advisors` security and performance — new warnings are
findings.

## Phase 3 — Security (application layer)

1. **Role matrix.** For every route and every RPC changed since the last audit, call it as each
   of: anon · respondent token · avdelingsleder · verneombud · daglig leder · another org's
   daglig leder · platform support (aal2) · super-admin aal1 · super-admin aal2. Expected
   allow/deny per cell; any unexpected allow is P0. SQL side: `set local role authenticated` with
   `request.jwt.claims`, as the suites do. Browser side: separate Playwright contexts.
2. **Public surface**: `PUBLIC_PATHS` in `lib/supabase/middleware.ts` — each entry justified; each
   token page `noindex`, no session data, unknown token and spent token give the same answer.
3. **Tokens and links**: stored hashed; entropy ≥ 96 bits; single use where promised; expiry
   enforced server-side; no token in logs or analytics paths.
4. **Input and output**: file uploads (size, type, parsing); mail templates escape (`escapeHtml`);
   no `dangerouslySetInnerHTML` without a sanitiser; imported translation packages validated.
5. **Secrets**: none in the repo (`git grep -nE 'service_role|eyJhbGci|sk_live|BREVO_API_KEY='`),
   none in the client bundle (`grep -rE 'service_role|SUPABASE_SERVICE' .next/static` → empty).
6. **Headers**: `curl -sI` a product page and a public page — CSP, `frame-ancestors`/X-Frame-Options,
   HSTS, `Referrer-Policy`, no `x-powered-by`.
7. **Abuse**: every anon RPC that writes has a rate limit or a honeypot; try it 20 times fast.
8. **Admin**: MFA enforced; auto-approve state; every admin write audited (`app.admin_audit`).

## Phase 4 — User journeys, end to end

`journeys.md` in this folder lists the journeys, each with steps and the assertions at every
step: on screen, in the database, in the mail. For each journey in the mode's set:
1. Run it against the QA stack (`npm run qa:serve`, port 3100) with Playwright — the `@journey`
   specs in `qa/e2e/` where they exist, otherwise by script or the Playwright MCP, saving a
   screenshot per step to `qa/reports/audit-<date>/<journey>/`.
2. Assert the **effect where it lands**, not where it was set: the respondent sees the leader's
   own question; the leader sees the employee's answer only at k; the mail the dispatcher would
   send (`public.dispatch_claim` + `renderNotice`) contains the link and the words promised.
3. Run the journey's negative variants.
4. A journey not yet automated is a finding (P2) with the manual evidence attached; automate the
   P0 journeys first.

## Phase 5 — Visual

```bash
npx next build && npx next start -p 3000 &      # hosted env, for the design gate
node scripts/verify/v3-run.mjs --out /tmp/v3-run   # every designed state, 0.1% tolerance
npm run qa:visual -- --all --compare               # QA-stack screens against their baselines
npm run e2e -- --grep '@flow|@pseudo'              # respondent flow 390/360/320, nb/en, pseudo-locale
```
Then look — every screen touched since the last audit, at 390 and 1280 px, bokmål and English,
in each role that can see it, in each state (empty, loading, error, below k, long text):
- raw keys (`namespace.key`), `undefined`, `NaN`, `[object Object]`, `Invalid Date`;
- English on a Norwegian page or the reverse; a placeholder that looks like data (rule: never
  fabricate) — a 0 or % over an unknown denominator, an invented count;
- clipped or overflowing text, horizontal scroll at 390 px, overlapping controls;
- focus visible on every control by keyboard; axe serious/critical = 0.
A pixel failure is investigated with `scripts/verify/probe.mjs` before anything is re-recorded.

## Phase 6 — Promise audit (text → behaviour)

1. Extract the sentences that promise behaviour from the product's own text:
   ```bash
   node -e 'const m=require("./messages/no.json");const out=[];const w=(o,p="")=>{for(const[k,v]of Object.entries(o)){const q=p?p+"."+k:k;if(typeof v==="string"){if(/\b(vil|blir|får|varsle|varsles|sendes|anonym|aldri|alltid|automatisk|sjekkes|slettes|lagres|kun|bare|ingen)\b/i.test(v))out.push(q+" :: "+v)}else w(v,q)}};w(m);console.log(out.filter(l=>!/^(site|seo|admin|industry)\./.test(l)).join("\n"))'
   ```
   (the site, SEO and admin namespaces get their own pass in `deep`).
2. For each promise: the code that makes it true, and the test that proves it. Unbacked = **P0**
   when it is about anonymity, law or data; **P1** otherwise.
3. Also: every control on every settings screen (toggles, selects, number inputs) — the same
   three questions: stored where, read by what, visible effect where.

## Phase 7 — Independent review (`deep`, and `full` when the diff is large)

In a fresh subagent with no authoring context:
- `/code-review high` on the diff since the last audit;
- `/security-review` on the same diff;
- an exploratory pass: "Here is the product and CLAUDE.md. Spend the time trying to make
  anonymity leak, a setting lie, or a user get stuck. Report only what you can reproduce."

## Phase 8 — Report and triage

Write `docs/audits/<YYYY-MM-DD>-<mode>.md`:
- header (Phase 0); a table of phases with pass/fail and the evidence path;
- findings, most severe first — `ID · severity · title · evidence (command/output, file:line,
  query, screenshot) · reproduction · suggested fix · proving test to add`;
- still-open findings from the previous report, with age;
- the verdict: **ship / ship with named risks / do not ship**.

Severity: **P0** anonymity/k, security, data loss, a false promise about law or data, a
payment error — blocks shipping. **P1** a feature or setting that does not do what it says, a
broken journey, a wrong figure. **P2** a missing test, an unautomated journey, a doc/code
mismatch, a visual defect. **P3** polish.

Every fixed finding gets a regression test that would have caught it, in the same commit. When
the fix is to allowlist, the allowlist line carries the reason.

## Done when

- every phase in the mode has evidence in the report;
- every P0/P1 has an owner and a next step (or is fixed with its test);
- `node scripts/audit/wiring.mjs` findings are 0 or each is listed in the report as open;
- the report is committed and linked from the PR.
