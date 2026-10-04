# Security checklist — WP-0.6 event dispatcher and job runs (0199, D-213)

Evidence in `supabase/tests/crm_events_invariants.sql` (CEI) unless named.

| # | Item | Result |
| --- | --- | --- |
| 1 | Entry points check session, role, permission | Two calls: `admin_crm_jobs` (the job monitor) and `admin_crm_event_retry` (a subscriber's deliveries tried again) need super-admin or support at aal2 (`app.is_platform_admin`), the roles that already read Operations; marketing and the rest get `not_allowed` (CEI 7). Both are executable by `authenticated` only. The dispatcher, the runner, the handlers and the subscriber check are executable by no client role; pg_cron runs the runner as the database owner (CEI 1) |
| 2 | No secret in the client | None added |
| 3 | Inputs validated | The retry takes a subscriber key: Zod in `lib/admin/crmJobActions.ts` (the key pattern), then the database refuses a key no subscriber has (`not_found`). The runner refuses a job it does not know (22023, CEI 5). Subscribers are rows written by migrations only: the handler is one of a fixed set (a check constraint) and the events a subscriber names must be in the catalogue (a trigger, CEI 6) |
| 4–5 | Rich text, uploads | Not applicable |
| 6 | Exports | None |
| 7 | Outbound | None: the one handler (the rollup) writes a count inside the database. Webhooks and notifications, which will send, arrive with INT-04 and SF-07 and bring their own checks |
| 8 | Credentials | None |
| 9 | Public surfaces | None: the monitor and the retry are admin-only; no respondent or customer surface reads the new tables |
| 10 | AI | Not applicable |
| 11 | Audit and append-only | Reading the monitor is audited (`crm.jobs`, the call is VOLATILE); a retry is audited with the number of deliveries it queued (`crm.events_retry`). Every run of a CRM job is counted in its hour (`app.crm_job_runs`) and on the job (`app.crm_jobs`), failures included (CEI 5) |
| 12 | Caller's permissions | The monitor shows jobs and counts, no record; the rollup counts events per kind and day, not per record, so it shows nothing a CRM visibility rule would hide. Handlers run as the database owner and attribute what they write to automation (`app.change_source`), so a handler's write is itself an event and its record keeps its visibility |
| 13 | No message bodies, tokens or personal data in logs | A failed run and a failed delivery keep the SQLSTATE only (`last_error` is checked against `^[a-z0-9_]{1,40}$`), never the message, which can carry what a record holds (CLAUDE.md invariant 7; CEI 3 raises a message with words in it and finds only `p0001`). The retry's audit row holds a count |
| 14 | Dependency audit | No dependency added |
| 15 | db lint, advisors | `supabase db lint --local --level warning`: no warning at all in the functions 0199 adds or changes (the remaining warnings are older functions'). On hosted after 0199 (D-213): the security advisors add exactly the two calls (`authenticated`, gated inside) and the five tables (RLS without policy) to their deliberate classes; the performance advisors find no unindexed foreign key on the new tables |
| 16 | Firewall | No function a CRM call or job reaches reads an answer table (`crm_access_invariants` seq 11 covers the two calls); `growth_firewall_invariants` and `respondent_invariants` pass |
| 17 | No dynamic SQL from admin input | Handlers are called by name through a CASE; the runner's jobs likewise. Nothing an admin types reaches SQL: the retry's key is a bound parameter |
| 18 | Runaway protection | The loop window (`limit_event_loop`, 10,000 events of one record per subscriber in a rolling ten minutes, the source value) sets the rest aside and alerts (CEI 4, 7); two runs of one job never overlap (an advisory lock per job); a job's failure is caught and recorded, never raised into pg_cron; each run handles at most 500 new events and 500 retries per subscriber |
| 19 | Defaults change nothing | The rule defaults to the source value, which no real CRM reaches; the jobs keep their times; the dashboard item appears only when something failed (CEI 7) |
