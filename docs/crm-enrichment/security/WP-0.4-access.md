# Security checklist — WP-0.4 permission sets, visibility groups, teams and audit completeness (0196, D-211)

Evidence in `supabase/tests/crm_access_invariants.sql` (CAI) unless named.

| # | Item | Result |
| --- | --- | --- |
| 1 | Entry points check session, role, permission | Every CRM write: the role at aal2 (`crm_can_write()`), then the action in the caller's set (`app.crm_can`); no function but `crm_can` still calls `crm_can_write()` (CAI 10). Reports: `crm_can_read()` and the report action (CAI 5). Managing access (`admin_crm_access`, `_set_save/_delete`, `_staff_access`, `_group_save/_delete`, `_team_save/_delete`): the super-admin at aal2 (CAI 9). The helpers (`crm_set_of`, `crm_can`, `crm_may`, `crm_group_of`, `crm_visible*`, `crm_default_visibility`) are executable by no client role; the eight calls by no anon (CAI 1). Without the second factor no set counts (CAI 6) |
| 2 | No secret in the client | None added |
| 3 | Inputs validated | Zod in `lib/admin/crmAccessActions.ts` (uuids, names ≤ 80, actions by pattern, ≤ 500 team members) and again in the database: actions must be in the catalogue (`crm_permission_sets_check`), team members must be staff, a group cannot become its own ancestor (CAI 9); visibility is one of four values (check constraint, `z.enum`) |
| 4–5 | Rich text, uploads | Not applicable |
| 6 | Exports | The consent export needs `contacts.export` and names no company the reader cannot see (CAI 8); the audit and web CSV exports now go through audited readers (`audit.view`, `web.report`) |
| 7–10 | Outbound, credentials, public surfaces, AI | Not applicable |
| 11 | Audit and append-only | Every access change is audited (`admins.crm_*`) with a reason when typed reasons are on; 21 admin readers gained an audit row and every admin reader audits or is reviewed with its reason; audited calls are VOLATILE (CAI 10) |
| 12 | Caller's permissions | Each call runs with the caller's role and set; the Admin set does not lift the role gate — an analyst with it still cannot write (CAI 6) |
| 13 | No message bodies, tokens or personal data in logs | Audit details carry a set's name and actions, a group's name and parent, a team's name, manager id and member count, and a staff member's set and group ids — staff ids only, no customer or contact data, no free text but the admin's own reason |
| 14 | Dependency audit | No dependency added |
| 15 | db lint, advisors | `supabase db lint --local` exit 0 (warnings only, in functions 0196 does not change); advisors checked after applying on hosted |
| 16 | Firewall | No function a CRM call reaches, followed through every helper, reads an answer table (CAI 11, 139 functions); `growth_firewall_invariants` and `respondent_invariants` pass |
| 17 | Visibility (SEC-08) | Owner, group, group and sub-groups, everyone — on the page, the list, the figures, tasks, the history, the consent ledger and every write (CAI 7, 8); every function reading companies or activities applies `app.crm_visible` or is reviewed, a helper that trusts its caller is reached only through calls that filter, and no reviewed helper is a client's (CAI 13) |
| 18 | Roles (Q2, DEC-12) | Every platform role can be granted (CAI 2); marketing reads neither an organisation's page nor the audit trail, support reads one organisation's trail, finance keeps the organisation's page (CAI 3) |
| 19 | Defaults change nothing | With the built-in sets every role does what it did before 0196: marketing writes as before, the analyst reads the reports, support has no CRM action (CAI 4); every new company is visible to everyone until the rule says otherwise (CAI 8) |
