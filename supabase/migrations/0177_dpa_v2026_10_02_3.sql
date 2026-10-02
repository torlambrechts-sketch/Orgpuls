-- 0177 — The data processing agreement names the sub-processor a Teams message passes through (D-203).
--
-- With Teams as a channel (0176) an invitation or a reminder can go as a Teams message from the
-- Orgpuls bot, relayed by Microsoft's Azure Bot Service. Vedlegg 3 now lists Microsoft Ireland
-- Operations Ltd (Azure Bot Service, run in the EU, West Europe), used only when the organisation
-- has switched Teams on; vedlegg 1 lists what is kept for it: which conversation the bot has with
-- an employee, and whether Teams turned a message away. A changed text is a new version (0047,
-- lib/legal/dpa.ts); 2026-10-02 and 2026-10-02.2 were published earlier the same day (0149, 0151),
-- so this is 2026-10-02.3, the newest by sign_dpa's order (published_on, then version).

insert into app.dpa_versions (version, text_sha256, published_on)
values ('2026-10-02.3', 'a9dbe4c601cbee8e269575d99aff2b7755f739114d1d2d71a44492c9618ecfb9', date '2026-10-02');
