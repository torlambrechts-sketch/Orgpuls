# Security checklist — WP-0.7 the admin's test harness (D-224)

The harness adds no table, no function and no screen; it signs in to the admin and reads it.

| # | Item | Result |
| --- | --- | --- |
| 1 | Entry points check session, role, permission | None added. The harness goes through the real sign-in: the password, then a TOTP factor enrolled on `/admin/mfa` (aal2), as a person does; a page that refused it would fail the run (`checkAdminPage` fails on «Your role cannot see this») |
| 2 | No secret in the client | None added |
| 3 | Inputs validated | Not applicable |
| 4–7 | Rich text, uploads, exports, outbound | None. The journeys write through the screens only, under names no other run uses, and remove what they wrote through the screens (the restore list's «Delete permanently»), so the local stack is left as it was |
| 8 | Credentials | The admin is the Sentral fixture's (`scripts/seed/sentral-fixture.mjs`): a known password, which is why the fixture refuses any database that is not this machine's QA stack (two independent guards, unchanged) and writes the admin inactive with no factor. `admin.setup.ts` activates it in the local database for one run and `admin.teardown.ts` retires it again however the run ends, so between runs the password opens nothing. The TOTP key is read from the enrolment page into memory and never printed or written; the session file (`qa/.auth/admin.json`) is git-ignored. In CI the fixture writes the admin into the job's throwaway database, after the step that marks it as the QA stack |
| 9 | Public surfaces | None |
| 10 | AI | Not applicable |
| 11 | Audit and append-only | Every page the harness opens writes its audit row, as for any admin; the audit log grows with each run on the local stack, which the baseline comparison shows and attributes |
| 12 | Caller's permissions | Super-admin, the fixture's role: the harness proves that the admin's pages work for the role that sees everything. The narrower roles and permission sets are proved by the SQL suites (`crm_access_invariants.sql`) |
| 13 | No message bodies, tokens or personal data in logs | The harness logs page ids, rule ids and element selectors; axe's report names elements, not their text. The journeys' rows carry made-up names and `@orgpuls.test` addresses |
| 14 | Dependency audit | No dependency added (`@playwright/test`, `@axe-core/playwright`, `pixelmatch` and `pngjs` were already there) |
| 15 | db lint, advisors | No database change |
| 16 | Firewall | Not touched; the admin pages the harness opens read no answer table (the SQL suites prove it) |
| 17 | Machine-wide exclusivity | The harness and the admin's pixel gate (`sentral-run.mjs`) share one local admin; `scripts/verify/admin-session.mjs` holds the lock both take, so neither signs the other out mid-run |
