# Security checklist — WP-0.3 soft delete, restore and purge (0195, D-210)

Evidence in `supabase/tests/crm_restore_invariants.sql` (CRI) unless named.

| # | Item | Result |
| --- | --- | --- |
| 1 | Entry points check session, role, permission | Delete, preview, restore and decide: `crm_can_write()` (aal2); the restore list: `crm_can_read()`; delete permanently: super-admin at aal2 (CRI 9). The engine (`crm_soft_delete`, `crm_undelete`, `crm_purge`, `crm_purge_due`, `crm_record_label`) is executable by no client role; the six calls by no anon (CRI 1) |
| 2 | No secret in the client | None added |
| 3 | Inputs validated | Entity whitelisted, ids uuids (Zod and the database), reason ≤ 500; request ids uuids |
| 4–10 | Rich text, uploads, exports, outbound, credentials, public surfaces, AI | Not applicable. The public token flows are unchanged, and confirming an opt-in may bring a deleted contact back (CRI 10) |
| 11 | Audit and append-only | Every call writes its audit row, the preview and the list included (they read names); `crm_delete_requests` keeps who asked and who decided; a request cannot be decided by its requester (CRI 8) |
| 12 | Caller's permissions | Each call runs with the caller's admin role; an approved request deletes as its requester, decided by the approver |
| 13 | No message bodies, tokens or personal data in logs | Audit details carry entity and counts only; a single record's id as target. Events carry no values |
| 14 | Dependency audit | No dependency added |
| 15 | db lint, advisors | `supabase db lint` exit 0; advisors checked after applying on hosted |
| 16 | Firewall | No reference to a response table; the firewall counts deleted rows too (`app.growth_firewall` reviewed); `growth_firewall_invariants` and `respondent_invariants` pass |
| 17 | Sending | A deleted contact is never mailed: `app.crm_mailable` and `app.crm_on_list` are false for it, so every audience and the claim-time recheck skip it (CRI 4) |
| 18 | Readers | Every function reading the three tables filters `deleted_at` or is reviewed with its reason (CRI 2) |
