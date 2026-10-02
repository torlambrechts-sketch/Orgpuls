-- 0151 — The data processing agreement says what the threshold now is (D-198).
--
-- Section 9 of the agreement read «Resultater for en avdeling vises ikke før minst fem har svart»
-- and «… funksjoner som holder tilbake avdelinger med færre enn fem svar». Since 0150 an
-- organisation may choose a threshold down to three for small teams, so both sentences now say
-- so: five by default, never under three. A changed text is a new version (0047, lib/legal/dpa.ts).
--
-- 2026-10-02 was already published today (0149), and a version is its date, so the format takes
-- a same-day suffix: `.2`, `.3` … The newest is the one in force: sign_dpa orders by published_on
-- and then version, and '2026-10-02.2' sorts after '2026-10-02'. Hosted holds no signature, so no
-- organisation is asked to sign again.

alter table app.dpa_versions drop constraint dpa_versions_version_check;
alter table app.dpa_versions add constraint dpa_versions_version_check check (version ~ '^\d{4}-\d{2}-\d{2}(\.\d+)?$');

insert into app.dpa_versions (version, text_sha256, published_on)
values ('2026-10-02.2', '534a40a60b5bd909e6c011c2875048bc0495c95300727cbfcac98705e37faa23', date '2026-10-02');
