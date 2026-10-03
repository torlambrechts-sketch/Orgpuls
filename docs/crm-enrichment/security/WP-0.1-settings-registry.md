# Security checklist — WP-0.1 CRM rule settings (0192, D-208)

A7, item by item. Evidence in `supabase/tests/crm_rules_invariants.sql` (CRR) unless named.

| # | Item | Result |
| --- | --- | --- |
| 1 | Every entry point checks session, role and permission, deny by default | `admin_crm_rules`: `crm_can_read()` or super-admin; `admin_crm_rule_set`: super-admin at aal2 only (CRR 12: marketing and aal1 refused). Both through `app.admin_role()` (aal2). The pages only mirror it |
| 2 | No secret or service-role key in the client | No new secret. The client receives rule values only |
| 3 | Inputs validated at the boundary | Zod in `setCrmRule`; the database checks the key, the kind and the value against the rule's options (CRR 12) |
| 4 | Rich text sanitized | No rich text |
| 5 | File uploads | None |
| 6 | Spreadsheet formulas in exports | No export |
| 7 | Outbound calls | None |
| 8 | Provider credentials encrypted | None stored |
| 9 | Public surfaces | None; anon may not call either function (CRR 16) |
| 10 | External content in AI | No AI |
| 11 | Audit append-only; writes and reads audited | `crm.rules` on every read, `crm.rule_set` with from/to and reason on every change (CRR 13); `crm_setting_log` append-only by trigger (CRR 14) |
| 12 | API runs with the caller's permissions | Both functions run as the caller's admin role |
| 13 | No message bodies, tokens or personal data in logs | Logged: rule key, old and new value, the admin, the typed reason |
| 14 | Dependency audit | No dependency added |
| 15 | `supabase db lint`, advisors | db lint run with the CI command (exit recorded in the phase report); advisors checked after applying on hosted |
| 16 | Anonymity firewall re-proved | `growth_firewall_invariants`, `respondent_invariants`, `definer_grants_invariants` pass on the rebuilt database. No new reference to a response table |

Loosening, approved: DEC-04 and DEC-07 turn the consent-source and typed-reason checks off by default. The
consent model of campaigns is unchanged: a contact without a source has basis `none` and is never mailable
(CRR 2), so no consent is implied.
