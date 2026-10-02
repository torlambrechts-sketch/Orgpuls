-- 0177 — The data processing agreement names the sub-processor a Teams message passes through (D-203).
--
-- With Teams as a channel (0176) an invitation or a reminder can go as a Teams message from the
-- Orgpuls bot, relayed by Microsoft's Azure Bot Service. Vedlegg 3 now lists Microsoft Ireland
-- Operations Ltd (Azure Bot Service, run in the EU, West Europe), used only when the organisation
-- has switched Teams on; vedlegg 1 lists what is kept for it: which conversation the bot has with
-- an employee, and whether Teams turned a message away. A changed text is a new version (0047,
-- lib/legal/dpa.ts). The text is 2026-10-02.3 (0166, the Entra import, D-202) with these two
-- additions, and section 6 says the 30-day notice does not apply to a sub-processor used only when
-- the organisation itself switches an integration on (the owner's decision, D-203), so this is 2026-10-02.4, the newest by sign_dpa's order (published_on, then version).

insert into app.dpa_versions (version, text_sha256, published_on)
values ('2026-10-02.4', '0800a2cc3c86931e7d5aa3f1d3e82964822fa7f6f9bc42c8aadc0aa3923bbff4', date '2026-10-02');
