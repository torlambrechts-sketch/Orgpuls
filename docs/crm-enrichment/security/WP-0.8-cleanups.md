# Security checklist — WP-0.8 Phase A clean-ups (0200, D-215)

Evidence in `supabase/tests/crm_campaign_access_invariants.sql` (CCI) unless named.

| # | Item | Result |
| --- | --- | --- |
| 1 | Entry points check session, role, permission | No new call. Six readers gain keys in place and keep their gate (`crm_can_read()`) and their audit row; the writes behind the controls are unchanged and keep refusing in the database what a set lacks (CCI 3, 4). The screens now read `may` instead of the role, so they offer only what the database would accept (DEC-31); the lead-scoring page also checks the CRM section before it reads, as the menu does |
| 2 | No secret in the client | None added |
| 3 | Inputs validated | No new input |
| 4–7 | Rich text, uploads, exports, outbound | None |
| 8 | Credentials | None |
| 9 | Public surfaces | None |
| 10 | AI | Not applicable |
| 11 | Audit and append-only | Unchanged: each reader still writes its audit row |
| 12 | Caller's permissions | `may` is `app.crm_may('campaigns')`, the caller's own set (Read only: reports only; a custom set: what it holds, CCI 2–4); `may_settings` is `app.crm_can('global.settings')` |
| 13 | No message bodies, tokens or personal data in logs | The lifecycle block is counts per step over 30 days and the switch: no organisation, person or address |
| 14 | Dependency audit | No dependency added |
| 15 | db lint, advisors | `supabase db lint --local --level warning`: no warning in the six readers. On hosted after 0200 (D-215): the security advisors hold the same 488 findings before and after, as no function, table or grant is added; the six readers keep SECURITY DEFINER, the empty search path and their grants (`anon` cannot execute them) |
| 16 | Firewall | The lifecycle counts read `app.lifecycle_settings` and `app.lifecycle_mail`, neither an answer table; `growth_firewall_invariants`, `respondent_invariants` and `crm_access_invariants` seq 11 pass |
| 17 | Never fabricate | The partners' «Revenue share» is the range of the shares their agreements hold, or a dash with «No partner has a share in per cent yet»; the lifecycle rows say «On · n sent in 30 d» or «Switched off» from the data, never «Built in» |
| 18 | Accessibility | Nine scroll regions a keyboard could not reach at 390 px are focusable and named (`tabIndex`, `role="region"`, a label), as the admin's tables are; the harness passes axe on every admin page at 1440 and 390 with no admin known issue left |
