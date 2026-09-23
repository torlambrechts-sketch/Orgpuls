# Code and database review — 2026-09-23

Reviewed at commit `5f42db4`, against the live project `jmhhszsnjfqgclxzhciq` (eu-central-1).
Scope: ~15 600 lines of TypeScript/TSX across 102 files, 3 560 lines of SQL across 24
migrations, 9 invariant suites, the CI workflow and the fixture generator.

Every finding below is backed by something that was **run**, not read. Where a number is
measured it says where it was measured; where something is an estimate it says so. The
commands are in [Appendix A](#appendix-a--how-to-reproduce-every-measurement).

---

## 0. Status — what happened to each finding

Updated after the fixes, the same day. Every "done" was verified against the live project
or a production build, and is held in place by a test or an invariant that CI runs.

| # | Outcome | Where | Held in place by |
|---|---|---|---|
| **S1** | **Fixed.** All 18 mutations return their rows; `writeFailed()` reads them. Four child writes that discarded their result entirely now check it too. | `8b7fa25`, `lib/supabase/write.ts` | `write_invariants.sql` 1–15; unit tests (reverting the guard fails two) |
| **P1** | **Done.** `answers_factor_idx`, `responses_org_round_idx`. No gain at fixture size, by design — the planner rightly prefers a scan at 1 716 rows. | migration 0025 | — |
| **P2** | **Done.** `cache()` on twelve shared reads. | `c72c672` | — |
| **S2** | **Done.** HSTS, CSP with `frame-ancestors 'none'`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, `nosniff`, `Permissions-Policy`. Verified on www.orgpuls.com. | `next.config.ts` | — |
| **S3** | **Done.** Every policy on organisation data is `TO authenticated`. | migration 0026 | `write_invariants.sql` 17 |
| **S4** | **Partly.** `Referrer-Policy: no-referrer` closes the third-party leak permanently. The token-to-cookie exchange is **not** done: it changes the respondent URL and needs its own decision. | S2 | — |
| **S5** | **Done, differently.** The throttle table was rejected — with no service-role key its counter would be callable by `anon`, letting anyone lock out another address. Instead: the mod-11 check digit (refuses ~10 of 11 enumerated numbers with no request) and an in-process per-/24 limit. | `lib/brreg/` | unit tests (9) |
| **P3** | **Eight of 25**, the ones on paths walked every request. The other seventeen wait for a query that needs them. | migration 0025 | — |
| **P4** | **Done.** `viewer_role()` reads `auth.uid()` from the JWT PostgREST verified; one auth round trip per page, not two. `getSession()` was rejected — its user object is unverified cookie content. | migration 0027 | — |
| **P5** | **Done.** 21 `FOR ALL` policies split into insert/update/delete. All 21 expressions checked identical to the originals against a snapshot; no read rule changed. The advisor's 73 warnings are gone. | migration 0026 | `write_invariants.sql` 16 |
| **P6** | **Done for `profiles`** (advisor's 2 warnings gone). Hoisting `is_org_member` out of fifteen read rules is **deliberately not done**: its replacement is a subquery on `memberships`, which has RLS of its own — the recursion `is_org_member` exists to break. | migration 0026 | `write_invariants.sql` 20 |
| **P7** | **Done.** The report's year lookup is one `in` query. | `c72c672` | — |
| **Q1** | **Not done.** Distinguishing "failed" from "empty" in the report needs a decision on what the failure treatment looks like. Failures are now logged (D-40) and caught in CI (Q5). | — | smoke job |
| **Q3** | **Done.** `getCurrentOrgId()` answers only when there is exactly one organisation; also removed a forbidden cast. | `lib/org/current.ts` | unit tests |
| **Q5** | **Done.** `npm test` (22 tests) and a CI smoke job that signs in, visits all eleven screens, and fails on any `[read]`/`[write]`/`[org]`/`[middleware]` log line — the gate D-40 needed. | `tests/`, `ci.yml` | itself |
| **S6** | **Waiting on the owner.** Leaked-password protection is a Supabase dashboard toggle. | — | — |
| **S7** | **Deferred.** The fix is a breaking Next 16 upgrade for a build-time-only exposure; it belongs behind the pixel gate. | — | — |
| **P8** | **Kept, as recommended.** The advisor now lists 22 "unused" indexes, but that is the project restore after an accidental pause resetting Postgres's statistics — `responses_round_idx` had served 12 617 scans that morning. | — | — |
| Q2, Q4 | No change: low, and no defect attaches. | — | — |
| **New** | **`app.job_runs` was readable across tenants.** `USING (true)` plus a table grant: since sign-up, any organisation could read platform-wide scheduler counts. Narrowed to the one column the screen uses, `ran_at`. | migration 0026 | `write_invariants.sql` 18–19 |

---

## 1. Verdict

This is a well-built codebase. Strict TypeScript with **zero** `any`, zero non-null
assertions and zero `@ts-ignore` across 15 600 lines. Zod parses every server boundary
rather than casting. The database carries 173 assertions across nine suites and they all
pass against a schema rebuilt from migrations. The anonymity architecture is real — k is a
function, the answer tables have RLS with no policy and no grant, and the write path
returns no row id. That is a stronger foundation than most products at this stage have.

The findings concentrate in three places, and they share a shape: **the product is careful
about the database and trusting about everything between the database and the person.**

- Writes that RLS refuses are reported to the user as saved (S1).
- Reads that fail were rendered as empty screens until yesterday (D-40), and still render
  as empty screens — they are now merely logged.
- The HTTP layer has no security headers at all (S2).
- 15 600 lines of TypeScript have no automated test of any kind (Q5).

None of these is a breach of an anonymity invariant. Two are user-visible correctness
bugs today; the rest are the difference between a system that works and one that can be
shown to work.

### Findings by severity

| # | Severity | Area | Finding |
|---|---|---|---|
| **S1** | **High** | Security / correctness | Unauthorised and no-op writes report success (18 sites) |
| **P1** | **High** | Performance | `app.answers` is sequentially scanned in full by every aggregation |
| **P2** | **High** | Performance | `results_summary` recomputed 3–5× per `/rapport` render |
| **S2** | Medium | Security | No security headers: no CSP, HSTS, `X-Frame-Options` or `Referrer-Policy` |
| **S3** | Medium | Security | RLS policies are `TO public`, so `anon` is in the role list of 13 tables |
| **S4** | Medium | Security | The respondent capability token travels in the URL path |
| **S5** | Medium | Security | No rate limit on the three unauthenticated write paths |
| **P3** | Medium | Performance | 25 foreign keys without a covering index |
| **P4** | Medium | Performance | Two auth-server round trips per page view |
| **P5** | Medium | Performance | 73 duplicate permissive policies — every `FOR ALL` policy re-runs on `SELECT` |
| **P6** | Medium | Performance | `auth.uid()` and `app.is_org_member()` re-evaluated per row |
| **P7** | Medium | Performance | `getMeasureEffects` fans out 2N round trips |
| **Q1** | Medium | Quality | A failed read still renders as a legitimate empty state |
| **Q3** | Medium | Quality | `.limit(1).maybeSingle()` org lookups now that multi-org is possible |
| **Q5** | Medium | Quality | No automated test covers any TypeScript |
| **S6** | Low | Security | Leaked-password protection disabled in Supabase Auth |
| **S7** | Low | Security | `npm audit`: 2 advisories (build-time only) |
| **P8** | Low | Performance | 4 indexes never used |
| **Q2** | Low | Quality | 23 near-identical row schemas and read wrappers |
| **Q4** | Low | Quality | Three components over 450 lines |

---

## 2. Security

### S1 — Unauthorised and no-op writes report success — **High**

**What happens.** Every server action writes through PostgREST and decides success from
`error` alone:

```ts
// app/(app)/arshjulet/actions.ts:63
if (error) return { ok: false, problem: 'denied' }
revalidatePath('/arshjulet')
return { ok: true }
```

An `UPDATE` or `DELETE` that RLS filters down to **zero rows is not an error**. PostgREST
answers `204 No Content` with an empty body, `supabase-js` sets `error: null`, the guard
passes, and the action returns `{ ok: true }`.

**Evidence.** Measured against the live project as the signed-in dev account:

```
PATCH /rest/v1/year_wheels?id=eq.<no such row>   → http=204   body: []
DELETE /rest/v1/locations?id=eq.<no such row>    → http=204   body: []
```

**Consequence.** A `verneombud` opens Årshjulet, changes the cadence, presses Lagre, and
is told it saved. `wheel_write` admits `daglig_leder` only, so nothing was written. The
screen then re-renders from the database and shows the old value with a success message
over it.

**Scope: 18 mutations across four action files** — `maleoppsett` (7), `oppsett` (6),
`tiltak` (4), `arshjulet` (1). None checks an affected-row count.

This is the write-side twin of D-40. D-40 rendered a failed read as a true absence; this
renders a refused write as a completed one. Of the two this is worse, because the person
acted and believes the act took effect.

**The codebase already solves this correctly in one place.** `app/(app)/samtaler/actions.ts`
does not write tables at all — it calls `reply_to_thread` and `set_thread`, which return
`{ok, error}`, and it parses and checks that payload:

```ts
const result = z.object({ ok: z.boolean(), error: z.string().optional() }).safeParse(data)
if (!result.success || !result.data.ok) {
  return { ok: false, problem: result.success ? (result.data.error ?? 'denied') : 'denied' }
}
```

That is why Samtaler is the one screen not affected, and it is the precedent the fix should
follow rather than a new invention.

**Fix.** Ask PostgREST to return what it wrote and count it. `.select()` on a mutation sets
`Prefer: return=representation`, so the response body carries the affected rows:

```ts
const { data, error } = await supabase
  .schema('app')
  .from('year_wheels')
  .update({ /* … */ })
  .eq('id', id.data.id)
  .select('id')            // ← makes the write observable

if (error) return { ok: false, problem: 'denied' }
if (!data || data.length === 0) return { ok: false, problem: 'denied' }
```

Because this is the same three lines in eighteen places, put it in `lib/supabase/write.ts`
beside the read helper added for D-40:

```ts
import type { PostgrestError } from '@supabase/supabase-js'

/**
 * A write that changed nothing is a write that was refused.
 *
 * RLS does not raise on an UPDATE or DELETE it filters to zero rows — PostgREST answers
 * 204 and supabase-js reports no error. Deciding success from `error` alone therefore
 * tells a caller without the policy that their change was saved. Every mutation must ask
 * for what it wrote (`.select(...)`) and come through here.
 */
export function writeFailed(
  where: string,
  error: PostgrestError | null,
  rows: unknown[] | null,
): boolean {
  if (error) {
    console.error(`[write] ${where}: ${error.code ?? 'no code'} ${error.message}`)
    return true
  }
  if (!rows || rows.length === 0) {
    console.error(`[write] ${where}: no row was affected — the policy refused it`)
    return true
  }
  return false
}
```

**Do not** log the payload: `oppsett` and `tiltak` writes carry employee names, and the
conversation actions carry respondent free text (invariant 7).

**Verification.** Add to `supabase/tests/` a suite that, inside one transaction, demotes
the dev membership to `verneombud`, attempts each write as that role, and asserts the RPC
or the returned representation is empty — the technique `settings_invariants.sql` already
uses for department scoping (assertions 14–19).

---

### S2 — No security headers — **Medium**

**Evidence.** `next.config.ts` has no `headers()`. `middleware.ts` sets none. A request to
any route returns no `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Frame-Options`, `Referrer-Policy` or `Permissions-Policy`.

**Why it matters here more than usual.** `/s/[token]` is the respondent surface. It is
public by design, carries a capability in its URL, and collects the most sensitive text in
the product. With no `X-Frame-Options` or `frame-ancestors`, that page can be framed — an
employer could host a page that frames the real survey under a transparent overlay, or
simply frame it to observe interaction timing. With no `Referrer-Policy`, the token is
sent in `Referer` to any third-party origin the page ever loads.

Today no page loads any external resource (verified by grep across `app/` and
`components/`; fonts are self-hosted from `public/fonts` per D-07), so there is no live
referrer leak. That is a property of the current code, not a control — the first external
script or image reintroduces it silently.

**Fix.** Add to `next.config.ts`. A strict CSP is possible precisely *because* nothing is
loaded from a CDN:

```ts
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // next-intl and Next's runtime need inline styles; scripts do not
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  // … existing config …
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
```

`'unsafe-inline'` in `script-src` is a compromise Next's inlined bootstrap requires;
removing it needs a nonce threaded through the middleware, which is worth doing but is its
own piece of work. **Ship the header set first** — `frame-ancestors`, HSTS and
`Referrer-Policy` are the ones that matter for this product, and none of them depends on
the nonce.

**Verification.** `curl -sI https://<deployment>/s/test | grep -i 'content-security\|frame\|referrer'`,
and re-run the pixel gate afterwards: a CSP that blocks a style breaks rendering, and the
gate is the thing that would notice.

---

### S3 — RLS policies are `TO public`, so `anon` is in the role list — **Medium (latent)**

**Evidence.** The Supabase performance advisor reports `multiple_permissive_policies` for
role **`anon`** on 13 tables: `locations`, `measures`, `measure_groups`, `org_questions`,
`risk_assessments`, `risk_factor_assessments`, `round_consultations`, `round_groups`,
`round_information`, `round_org_questions`, `trainings`, `wheel_notifications`,
`year_wheels`. `anon` appears because the policies were created without a `TO` clause,
which defaults to `TO public` — every role, including `anon`.

**Is it exploitable today? No, and I checked.** A policy only admits a role that also holds
a table `GRANT`. The full grant list for `anon` in the `app` schema is:

```
extra_options  | SELECT
extra_questions| SELECT
factors        | SELECT
statements     | SELECT
```

Those four are the instrument — the question text itself, which the respondent form needs
without a session. No organisation data is reachable by `anon`.

**Why fix it anyway.** The grant is the only thing standing between an anonymous caller and
thirteen tables of organisational data, and the grant is invisible at the point where the
policy is written. A future migration that adds `grant select on app.<table> to anon` for
one legitimate reason silently opens the other twelve, because the policies already say
yes. Defence in depth means the policy and the grant should both have to be wrong.

**Fix.** In a new migration, recreate each policy with an explicit role:

```sql
-- 0025_scope_policies_to_authenticated.sql (excerpt — repeat per policy)
drop policy if exists location_read on app.locations;
create policy location_read on app.locations
  for select to authenticated
  using (app.is_org_member(org_id));
```

**Add an invariant** so this cannot regress — this is the durable half of the fix:

```sql
insert into public._st
select N, 'no policy on an org table admits anon', '0', count(*)::text, count(*) = 0
from pg_policies
where schemaname = 'app'
  and tablename not in ('factors','statements','extra_questions','extra_options')
  and ('anon' = any(roles) or roles = '{public}');
```

---

### S4 — The capability token travels in the URL path — **Medium**

`/s/[token]` puts a 64-character secret in the request path. Invariant 3 goes to
considerable lengths to keep that plaintext out of the database — it is stored as SHA-256
and `mint_invitation_link` returns it exactly once — and then the delivery mechanism writes
it into:

- the Vercel access log for every request to that URL,
- any CDN or WAF log in front of it,
- the respondent's browser history and any synced profile,
- `Referer` on any future external subresource (S2).

**This is a design trade-off, not an oversight** — a link in an email has to carry the
credential somehow, and the current design already limits the damage: the token expires
with the round, is single-use (`already_responded`), and identifies an *invitation*, never
a person's answers.

**Recommended hardening, in order of value:**

1. `Referrer-Policy: no-referrer` (part of S2) — removes the third-party leak permanently.
2. **Exchange the token for a cookie on first load.** The page reads
   `/s/[token]`, sets an httpOnly session cookie scoped to `/s`, and redirects to a
   token-free `/s/svar`. The token then appears in exactly one log line instead of every
   one, and disappears from browser history on the redirect.
3. Confirm with the deployment's log retention what that one line's lifetime is, and record
   it in `docs/DEVIATIONS.md` — a documented residual risk is a decision; an undocumented
   one is an accident.

Do **not** shorten the token. 256 bits is what makes brute force irrelevant (S5).

---

### S5 — No rate limit on the unauthenticated write paths — **Medium**

Three endpoints are reachable without a session and do real work:

| Endpoint | Reachable by | Risk |
|---|---|---|
| `rpc.submit_response` | `anon` | Token guessing — **not a real risk**, 256-bit tokens |
| `rpc.create_organisation` | `authenticated` | One org per account, so bounded by account creation |
| `lookupOrgNumber` (server action) | anyone on `/registrer` | We become an open proxy to Brønnøysund |

The first two are adequately bounded by design. The third is not: a server action on a
public page that makes an outbound HTTP request is an amplifier. `lib/brreg/lookup.ts`
already sets `next: { revalidate: 3600 }`, which caps repeat lookups of the *same* number,
but a caller iterating distinct nine-digit numbers passes straight through to
`data.brreg.no` from our IP. The realistic outcome is Brønnøysund rate-limiting or blocking
the deployment, which breaks sign-up for everyone.

**Fix.** Rate-limit by IP in the action before the fetch. Without adding infrastructure,
the simplest correct thing is a fixed-window counter in Postgres:

```sql
create table app.lookup_throttle (
  ip          inet    not null,
  window_start timestamptz not null,
  hits        int     not null default 1,
  primary key (ip, window_start)
);
```

with a `SECURITY DEFINER` function that increments and returns whether the caller is over
(say 20 per IP per hour), called from `lookupCompany` before `lookupOrgNumber`. Store the
IP truncated (`/24` for IPv4, `/48` for IPv6) so the table is a throttle rather than a
visitor log — this product should not keep full addresses, and it does not need them to
throttle.

---

### S6 — Leaked-password protection disabled — **Low, one toggle**

The Supabase security advisor reports `auth_leaked_password_protection` off. Supabase can
check new passwords against HaveIBeenPwned. For a product whose users are
`daglig_leder`-level accounts holding a whole undertaking's psychosocial data, this is
worth having.

**Fix.** Supabase dashboard → Authentication → Policies → enable leaked password
protection. Consider raising the minimum length as well; the sign-up form enforces 8
characters client-side and the design's meter calls 8 "for kort" below and "godt" at 12+.

*This is a dashboard setting, not a migration — it will not survive a project rebuild and is
not covered by any suite. Record it in `docs/DEVIATIONS.md` as configuration state.*

---

### S7 — `npm audit`: 2 advisories — **Low**

```
2 vulnerabilities (1 moderate, 1 high)
postcss (via next)  — sourceMappingURL path traversal / arbitrary .map disclosure, XSS via
                      unescaped </style> in stringify output
fix available via `npm audit fix --force` → next@16.3.6 (breaking)
```

**Assessed exposure: low.** All four advisories require attacker-controlled CSS to be
*processed by postcss*. Postcss runs at build time over this repository's own Tailwind
sources; no user input reaches it, and no CSS is compiled at runtime. The realistic risk is
a supply-chain one in the build, not a runtime one in the product.

**Recommendation.** Do **not** take `--force` and a major Next upgrade for this. Schedule
the Next 16 upgrade as its own piece of work, behind the pixel gate — the gate is exactly
the instrument for proving a framework upgrade did not move a pixel. Re-check with
`npm audit --omit=dev` at that point.

---

### Security controls verified as working

Worth stating explicitly, because a review that lists only problems misrepresents the
system:

- **The six `rls_enabled_no_policy` findings are intended and correct.** `answers`,
  `responses`, `extra_answers`, `response_comments`, `comment_threads` and
  `thread_messages` have RLS on with no policy and no grant, so every client role is denied
  by default. This is D-04 and invariant 1, and the advisor flagging it is the advisor not
  knowing the design.
- **The 18 `SECURITY DEFINER` advisories are the architecture.** Result reads *must* be
  definer functions that apply k per cell; the respondent path *must* be callable by
  `anon`. Each one was checked for `search_path=""` and all 11 inspected carry it, so none
  is hijackable through a mutable search path.
- **k is a function, not a column** — `app.k_min()` is `IMMUTABLE` and returns 5; no row can
  lower it.
- **Department scoping works.** `app.visible_groups` sits on top of k, not instead of it,
  and `settings_invariants.sql` proves an `avdelingsleder` sees one group by demoting a real
  membership inside a transaction.
- **173 assertions across nine suites pass** against a database rebuilt from migrations, as
  of the green CI run on `main` at `23ad244`.

---

## 3. Performance

Two kinds of number appear below. **In-database timings** come from `clock_timestamp()`
inside Postgres and from `EXPLAIN (ANALYZE, BUFFERS)` — they are real and independent of
where I measured from. **Round-trip counts** come from reading the code. I deliberately do
*not* quote wall-clock HTTP latency: I measured it from this container through an agent
proxy, where it is dominated by proxy overhead and tells you nothing about Vercel →
Supabase in the same region.

### P1 — `app.answers` is sequentially scanned in full by every aggregation — **High**

**Evidence**, from `pg_stat_user_tables` on the live project:

| table | seq scans | rows read | avg rows per seq scan | live rows |
|---|---|---|---|---|
| **`answers`** | **80** | **134 178** | **1 677** | **1 716** |
| `responses` | 2 164 | 15 305 | 7 | 52 |
| `invitations` | 225 | 8 087 | 35 | 99 |

Every sequential scan of `answers` reads essentially the entire table. `app.answers` has
exactly one index — its primary key `(response_id, factor_key, ordinal)`. That serves the
join from `responses`, but any predicate leading with `factor_key` cannot use it.

`EXPLAIN (ANALYZE, BUFFERS)` on `public.results_summary` for the 2026 baseline:

```
Execution Time: 37.836 ms
Buffers: shared hit=1559
```

**Why this matters.** 1 716 answer rows is the design fixture: one organisation, 34
employees, three rounds. A 500-employee undertaking answering 37 questions over three
years is roughly **55 000 answer rows — 32× the fixture** — and a full scan is linear. The
37 ms becomes something over a second, per call, and `/rapport` makes several.

**Fix.** Two indexes, chosen to match what the aggregations actually filter on:

```sql
-- 0026_result_indexes.sql
-- Aggregations group by factor across a round; the primary key leads with response_id
-- and cannot serve that.
create index answers_factor_idx on app.answers (factor_key, ordinal) include (value);

-- The k gate counts responses per (round, group); responses_round_idx covers that, but
-- the org-scoped FK has no index and the planner needs it for the org filter.
create index responses_org_round_idx on app.responses (org_id, round_id);
```

**Verify the gain, do not assume it.** Re-run the `EXPLAIN (ANALYZE, BUFFERS)` in Appendix
A before and after, and keep both numbers. An index that does not change the plan is an
index that costs writes for nothing — see P8.

---

### P2 — `results_summary` is recomputed 3–5× per `/rapport` render — **High**

**In-database cost of each k-gated RPC**, measured on the fixture:

| RPC | ms |
|---|---|
| `results_by_group` | 31.4 |
| `conversations(null)` | 25.2 |
| `results_summary` | 12.8 |
| `screening_counts` | 11.6 |
| `participation` | 7.3 |

`app/(app)/rapport/page.tsx` calls **15 distinct read functions**, and `getResultsSummary`
twice explicitly. `getMeasureEffects` then calls `results_summary` again for *each distinct
round id* it finds (P7). On the fixture that is three more. So the single most expensive
aggregation in the product runs **at least five times for the same rounds in one render**,
returning identical results each time.

**Fix.** React's `cache()` gives request-scoped memoisation — one render pass, one call per
distinct argument, no cross-request staleness:

```ts
// lib/results/read.ts
import { cache } from 'react'

export const getResultsSummary = cache(async (roundId: string): Promise<Summary | null> => {
  // … unchanged body …
})
```

Apply to `getResultsSummary`, `getResultsByGroup`, `getParticipation`,
`getOrganization`, `getFactors` and `getRounds` — every read that is argument-addressable
and called from more than one place. This is a one-line change per function with no
behavioural risk: `cache()` is per-request and clears between requests.

Expected saving on `/rapport` on the fixture: roughly **50–75 ms of database time**, more
as data grows, and it removes the fan-out entirely rather than making it faster.

---

### P3 — 25 foreign keys without a covering index — **Medium**

The Supabase performance advisor lists 25. The ones that matter most, because they sit on
paths the product actually walks:

| Table | Foreign key | Used by |
|---|---|---|
| `app.responses` | `responses_org_id_round_id_fkey` | every result aggregation |
| `app.responses` | `responses_group_id_fkey` | `results_by_group`, department scoping |
| `app.measures` | `measures_effect_round_id_fkey` | report §6 |
| `app.measures` | `measures_owner_employee_id_fkey` | Tiltak owner chips |
| `app.employees` | `employees_group_id_fkey` | Oppsett roster, invitation building |
| `app.memberships` | `memberships_group_id_fkey` | `app.visible_groups` — **on every scoped read** |
| `app.invitations` | `invitations_employee_id_fkey` | wheel invitation build |
| `app.outbox` | `outbox_org_id_fkey`, `outbox_invitation_id_fkey` | dispatcher |

An unindexed FK costs twice: the join is a scan, and **every delete of a parent row scans
the child table** to enforce the constraint. `memberships_group_id_fkey` is the one to fix
first — `app.visible_groups` is on the path of every scoped read in the product.

**Fix.** One migration; index the eight above first and measure before adding the other 17.

---

### P4 — Two auth-server round trips per page view — **Medium**

`supabase.auth.getUser()` is called in `lib/supabase/middleware.ts:131` for every
non-public request, and again in `getViewerRole()` at `lib/org/read.ts:117`, which the
signed-in shell calls on every page. `getUser()` is an HTTP call to
Supabase's auth service that revalidates the token — that is exactly why it was chosen over
`getSession()`, and the reasoning in the middleware header is correct and should stand.

The problem is that it happens **twice** for the same request and the same token.

**Fix, in preference order:**

1. Wrap the application-side call in `cache()` so repeated calls within one render collapse
   to one. This alone does not remove the middleware's call.
2. Have the middleware, having already validated, pass the user id to the request via a
   header (`x-orgpuls-user`), and have `lib/org/read.ts` read that instead of calling out
   again. The middleware is the trust boundary and has already done the work.

Option 2 removes one full outbound round trip from every page view. Be careful to *strip*
any inbound `x-orgpuls-user` header before setting it, or a client can forge it — set it on
the `NextResponse.next({ request })` headers, never trust it from `request.headers` without
overwriting.

---

### P5 — 73 duplicate permissive policies — **Medium**

Across 13 tables, both a `*_read` policy (`FOR SELECT`) and a `*_write` policy (`FOR ALL`)
exist. `FOR ALL` includes `SELECT`, so **both** policies are evaluated on every read, and
Postgres `OR`s them together. That is double the policy work on every row of every read, and
it makes the effective read rule harder to state than it looks — the read rule for
`app.measures` is not `measure_read`, it is `measure_read OR measure_write`.

**Fix.** Scope the write policies to the commands they mean:

```sql
drop policy if exists measure_write on app.measures;
create policy measure_write on app.measures
  for insert to authenticated
  with check (app.has_role(org_id, array['daglig_leder','avdelingsleder']::app.org_role[]));
create policy measure_update on app.measures
  for update to authenticated
  using (app.has_role(org_id, array['daglig_leder','avdelingsleder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder','avdelingsleder']::app.org_role[]));
create policy measure_delete on app.measures
  for delete to authenticated
  using (app.has_role(org_id, array['daglig_leder','avdelingsleder']::app.org_role[]));
```

This is a **behaviour-preserving** change only if done carefully, and it touches
authorisation, so it needs the full suite green before and after — plus, ideally, the S1
verification suite, which tests the same policies from the outside.

Combine with S3 (`TO authenticated`) in one migration; they touch the same policy
definitions and there is no reason to rewrite them twice.

---

### P6 — `auth.uid()` and `app.is_org_member()` re-evaluated per row — **Medium**

The advisor flags `app.profiles` policies `profile_self_read` and `profile_self_write` for
calling `auth.uid()` per row. The same cost applies, invisibly to the linter, to every
policy calling `app.is_org_member(org_id)` — it is `STABLE`, so Postgres may evaluate it
once per row rather than once per query.

**Fix.** Wrap in a scalar subquery, which the planner hoists to an InitPlan evaluated once:

```sql
-- before
using (id = auth.uid())
-- after
using (id = (select auth.uid()))
```

For `is_org_member(org_id)` the argument varies per row, so it cannot be hoisted the same
way. The durable fix there is to replace the function call with a set-membership test
against a hoisted subquery:

```sql
using (org_id in (select m.org_id from app.memberships m
                  where m.user_id = (select auth.uid()) and m.active))
```

`memberships_user_idx` already covers `(user_id) WHERE active`, so that subquery is an index
lookup evaluated once per query instead of a function call per row.

**This changes authorisation logic.** It must not be done casually: make it one migration,
keep `app.is_org_member` in place for the RPCs that call it directly, and require all nine
suites green.

---

### P7 — `getMeasureEffects` fans out 2N round trips — **Medium**

`lib/report/tail.ts:71` loops over distinct round ids and issues, per id, one `results_summary`
RPC plus one `rounds → measurements(year)` read. They are parallelised with `Promise.all`,
so latency is bounded by the slowest, but it is still 2N requests and N expensive
aggregations.

**Fix.** P2's `cache()` removes the duplicate `results_summary` calls for free. The year
lookup should be a single query rather than N:

```ts
const { data: rows } = await supabase
  .schema('app')
  .from('rounds')
  .select('id, measurements(year)')
  .in('id', roundIds)          // one round trip instead of N
```

---

### P8 — Four indexes never used — **Low**

`employees_org_idx`, `measures_factor_idx`, `outbox_due_idx`,
`risk_factor_assessments_factor_idx` show zero scans.

**Do not drop them yet.** Usage statistics reflect a fixture-sized database exercised mostly
by test suites; `outbox_due_idx` in particular exists for a dispatcher that does not exist
yet (D-29), and `employees_org_idx` will be used the moment there is more than one
organisation — which sign-up now makes possible. Re-examine after the product has carried
real traffic for a month. Recorded here so the next reviewer knows it was considered rather
than missed.

---

## 4. Code quality

### What is genuinely good

- **Zero `any`, zero non-null assertions, zero `@ts-ignore`** in 15 600 lines, with
  `strict` and `noUncheckedIndexedAccess`. That is rare and worth protecting.
- **Zod parses, never casts**, at every server boundary — correct, since `supabase gen
  types` does not emit the `app` schema and a cast would assert a shape nothing checks.
- **The comments explain causes, not mechanics.** `lib/supabase/middleware.ts` documents
  four distinct failure modes and why each rule exists; `docs/DEVIATIONS.md` has 42 entries
  each naming the constraint that forced it. Someone joining this codebase can find out
  *why*, which is the expensive kind of knowledge.
- **Data-not-code holds.** Factors, statements, options and audiences are rows; the
  respondent flow numbers statements from database ordinals.
- **The invariant suites are real tests**, not assertions of the obvious. Several assert the
  *absence* of a thing by searching every policy and routine body — `duty_role` consulted by
  nothing, no group name anywhere in `screening_counts` output.

### Q1 — A failed read still renders as a legitimate empty state — **Medium**

D-40 added logging at 28 call sites, which is why the next PostgREST regression will
announce itself. But the **rendering** is unchanged: `readFailed()` returns `true` and the
caller still returns `[]`, so the screen still shows its empty state.

For most screens that is the right trade — a page that cannot reach the database should
render *something*. For the statutory report it is not: `/rapport` is the document an
inspector reads, and a section that prints "det er ikke registrert…" because a query failed
is a false statement in a legal document.

**Fix.** Distinguish the two at the type level for the report path only:

```ts
export type Read<T> = { ok: true; value: T } | { ok: false }
```

and have `RapportScreen` render an explicit "denne seksjonen kunne ikke hentes" treatment
for `ok: false`, distinct from the empty-state treatment for `ok: true, value: []`. Leave
the dashboard screens as they are.

### Q3 — `.limit(1).maybeSingle()` org lookups — **Medium**

Five actions resolve the caller's organisation with:

```ts
const { data: org } = await supabase.schema('app').from('organizations')
  .select('id').limit(1).maybeSingle()
```

This returns "whatever row RLS lets through first". It is correct **only** because
`organizations` RLS scopes to the caller's membership and a caller has at most one. Both of
those are true today — `create_organisation` enforces one org per account — so this is not
a live bug. But it is a correctness argument that lives in three places at once, and
migration 0024 made multi-org a thing the product can produce.

**Fix.** One `lib/org/current.ts` exporting a `cache()`d `getCurrentOrgId()` that selects
explicitly by membership and **fails loudly** on zero or more than one, rather than silently
picking. One place to be right, and it also serves P2.

### Q5 — No automated test covers any TypeScript — **Medium**

`vitest` is in `devDependencies`. There is no `test` script and **zero test files**. The
database has 173 assertions; the 15 600 lines between the database and the person have
none.

This is not theoretical. D-40 — Tiltak showing zero measures over a database holding seven —
lived in exactly this gap: the SQL suites passed because the database was correct, `tsc`,
lint, i18n and `build` passed because none of them runs a query, and it was found by
looking at a screenshot.

**Fix, in value order:**

1. **Parser tests** — the fastest return. Every `*Row` Zod schema against a captured real
   PostgREST payload. This catches schema drift, which is what D-40 was, and needs no
   database.
2. **A smoke test per route** that asserts the page renders and the primary read returned a
   non-empty result against the seeded fixture. Wire into CI after `Wind the wheel once`.
3. `npm run test` in `package.json` and a CI step in the `static` job.

The pixel gate now runs (X-009 closed), which covers rendering. What it does not cover is
whether the data behind the pixels is the right data — and that is where the last two
regressions were.

### Q2 — 23 near-identical row schemas and read wrappers — **Low**

Each `lib/*/read.ts` declares its own `*Row` Zod schema and repeats
`createClient()` → `.schema('app')` → `readFailed` → `parseFailed` → map. The repetition is
legible and the comments differ meaningfully, so this is **not** worth a refactor for its own
sake. Worth revisiting only if a shared helper falls out of the Q3 and P2 work naturally.

### Q4 — Three components over 450 lines — **Low**

`RapportScreen.tsx` (961), `SetupForm.tsx` (833), `ResultatScreen.tsx` (489). The report is a
single statutory document rendered in order and splitting it would scatter something that is
genuinely one thing. `SetupForm` is the better candidate — it is a form with several
independent sections. Low priority; no defect attaches to either today.

---

## 5. Recommended order of work

Sequenced by risk removed per hour spent, not by severity alone.

### Immediately — user-visible defects

| Task | Finding | Est. | Why first |
|---|---|---|---|
| `writeFailed()` helper + `.select()` on all 18 mutations | **S1** | 3–4 h | People are being told their changes saved when they were refused |
| Suite proving a refused write is reported as refused | **S1** | 2 h | Without it, S1 comes back |

### This week — cheap, high value

| Task | Finding | Est. | Why |
|---|---|---|---|
| Security headers in `next.config.ts` | **S2** | 1 h | One file; `frame-ancestors` protects the respondent surface |
| `cache()` on the six shared reads | **P2**, P7 | 1 h | One line each, removes 3–5 redundant aggregations per report |
| Two result indexes + the eight FK indexes | **P1**, P3 | 2 h | One migration; measure before and after |
| Enable leaked-password protection | **S6** | 5 min | Dashboard toggle |
| `npm run test` + Zod parser tests | **Q5** | 4 h | Closes the gap D-40 lived in |

### This month — needs care, touches authorisation

| Task | Finding | Est. | Why it needs care |
|---|---|---|---|
| Policies → `TO authenticated`, split `FOR ALL` | **S3**, **P5** | 4–6 h | Changes authorisation; all nine suites green before and after |
| `(select auth.uid())` and hoisted membership test | **P6** | 3 h | Same |
| `getCurrentOrgId()` that fails loudly | **Q3** | 2 h | Prerequisite for multi-org |
| Drop the second `getUser()` per request | **P4** | 3 h | Header must be overwritten, never trusted inbound |
| Throttle `lookupOrgNumber` by truncated IP | **S5** | 3 h | Store `/24`, not the address |

### Scheduled separately

| Task | Finding | Why separate |
|---|---|---|
| Token → cookie exchange on `/s` | **S4** | Changes the respondent URL; needs its own deviation entry |
| Next 16 upgrade | **S7** | Breaking; run it behind the pixel gate |
| Report-path `Read<T>` distinction | **Q1** | Needs a design decision on the failure treatment |
| Re-examine the four unused indexes | **P8** | Needs a month of real traffic first |

---

## Appendix A — how to reproduce every measurement

```bash
# Advisors (both were run at 2026-09-23T04:51Z)
#   Supabase MCP: get_advisors type=security | type=performance

# S1 — a zero-row write returns 204 and no error
TOK=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ORGPULS_DEV_EMAIL\",\"password\":\"$ORGPULS_DEV_PASSWORD\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -o /dev/null -w 'http=%{http_code}\n' \
  -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/year_wheels?id=eq.00000000-0000-4000-8000-0000000000aa" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOK" \
  -H 'Content-Profile: app' -H 'Content-Type: application/json' -d '{"notify_lead_days":9}'

# S3 — what anon can actually select
#   select table_name, string_agg(distinct privilege_type,',') from information_schema.role_table_grants
#   where table_schema='app' and grantee='anon' group by table_name;

# S7 — dependency advisories
npm audit --omit=dev

# P1 — scan behaviour and the aggregation plan
#   select relname, seq_scan, seq_tup_read, idx_scan, n_live_tup from pg_stat_user_tables
#   where schemaname='app' order by seq_tup_read desc;
#   explain (analyze, buffers) select public.results_summary('00000000-0000-4000-8000-000000000002');

# P2 — per-RPC in-database timing (set request.jwt.claims to a member first)
#   t0 := clock_timestamp(); j := public.results_summary(r);
#   … extract(epoch from clock_timestamp()-t0)*1000

# Q5 — confirm the absence of tests
find . -path ./node_modules -prune -o \( -name '*.test.*' -o -name '*.spec.*' \) -print
```

**A note on the numbers.** In-database timings and `pg_stat_user_tables` counters are
measured inside Postgres and are trustworthy. HTTP round-trip latency was *not* included in
this review: it was measured from a cloud container behind an agent proxy, where it is
dominated by proxy overhead and says nothing about Vercel → Supabase in eu-central-1. Where
this document talks about round trips it counts them rather than timing them.

Statement counters are cumulative since the last `pg_stat_reset()` and include suite runs,
so the `answers` seq-scan ratio (1 677 of 1 716 rows) is the reliable figure there, not the
absolute scan count.
