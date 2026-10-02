-- 0166 — The data processing agreement names what the Entra import stores (D-202).
--
-- 0165 lets an organisation bring its employees in from Microsoft Entra ID. Section 3 and annex 1 of
-- the agreement now say so: the person's object id in the directory, which of the chosen groups the
-- person is in and whether the account is active, kept only to hold the register up to date; the
-- preferred language (which the CSV import already stored, and the agreement did not name); and the
-- mobile number read from the directory only when the organisation opts in. Nothing is written back.
-- A changed text is a new version (0047, lib/legal/dpa.ts), the third published today (0151's format).

insert into app.dpa_versions (version, text_sha256, published_on)
values ('2026-10-02.3', '8fa0b0a58a40af3530cfbca33bcf265fe66c9f9d53f788b9991cd5cb595b2131', date '2026-10-02');
