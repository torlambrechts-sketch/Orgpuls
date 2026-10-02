-- 0177 — The data processing agreement names the sub-processor a Teams message passes through (D-203).
--
-- With Teams as a channel (0176) an invitation or a reminder can go as a Teams message from the
-- Orgpuls bot, relayed by Microsoft's Azure Bot Service. Vedlegg 3 now lists Microsoft Ireland
-- Operations Ltd (Azure Bot Service, run in the EU, West Europe), used only when the organisation
-- has switched Teams on; vedlegg 1 lists what is kept for it: which conversation the bot has with
-- an employee, and whether Teams turned a message away. A changed text is a new version (0047,
-- lib/legal/dpa.ts). The text is 2026-10-02.3 (0166, the Entra import, D-202) with these two
-- additions, so this is 2026-10-02.4, the newest by sign_dpa's order (published_on, then version).

insert into app.dpa_versions (version, text_sha256, published_on)
values ('2026-10-02.4', '602002caefb594d783c2db99e395a2ae97590b938d0c21d1d84e46bb2afbde7e', date '2026-10-02');
