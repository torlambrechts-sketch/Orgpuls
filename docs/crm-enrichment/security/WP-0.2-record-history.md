# Security checklist — WP-0.2 record history (0194, D-209)

Evidence in `supabase/tests/crm_history_invariants.sql` (CHI) unless named.

| # | Item | Result |
| --- | --- | --- |
| 1 | Entry points check session, role, permission | `admin_crm_history`: `crm_can_read()` (aal2); support refused, anon has no execute (CHI 10). The save functions keep their write checks and add the version guard (CHI 5) |
| 2 | No secret in the client | None added |
| 3 | Inputs validated | Entity whitelisted, record a uuid, cursor a bigint; version digits only, compared in the database |
| 4–10 | Rich text, uploads, exports, outbound, credentials, public surfaces, AI | Not applicable |
| 11 | Audit and append-only | Every history read writes `crm.history`; `crm_changes` refuses updates and deletes while its record exists (CHI 7); `crm_events` refuses updates |
| 12 | Caller's permissions | The reader runs with the caller's admin role |
| 13 | No message bodies, tokens or personal data in logs | `optin_hash` is never tracked; events carry field names only (CHI 8). The changelog holds old values (names, e-mails) because PIP-04 asks for them; it is read only through the audited reader and is erased with its record (CHI 8) |
| 14 | Dependency audit | No dependency added |
| 15 | db lint, advisors | `supabase db lint` exit 0; advisors checked after applying on hosted |
| 16 | Firewall | No reference to a response table; `growth_firewall_invariants` and `respondent_invariants` pass |
