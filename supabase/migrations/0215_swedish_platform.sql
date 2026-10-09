-- 0215 — Swedish is a platform language (D-252).
--
-- Phase 2 of docs/markets/PLAN.md starts with the app in Swedish: lib/i18n/locales.ts makes `sv` a
-- platform language with English as its fallback, so a text not yet translated is shown in English.
-- The database keeps four lists of the platform languages, and each takes `sv`:
--
--   * organizations.default_lang — the language a new member of an organisation starts in
--   * profiles.lang — a person's own choice (the language switch saves it, lib/i18n/server)
--   * demo_requests.lang — the language a demo was asked for in (lib/demo/actions)
--   * markets.default_lang — the language a new organisation in a market starts in (0214)
--
-- tests/unit/locales.test.ts holds each list to the registry. Nothing changes for an organisation in
-- Norway: no row is touched, and Norway's site still offers bokmål and English (lib/hosts.ts).
-- message_overrides stays bokmål and English: admin › Translations overrides those two catalogues.

alter table app.organizations drop constraint organizations_default_lang_check;
alter table app.organizations add constraint organizations_default_lang_check check (default_lang in ('no', 'en', 'sv'));

alter table app.profiles drop constraint profiles_lang_check;
alter table app.profiles add constraint profiles_lang_check check (lang in ('no', 'en', 'sv'));

alter table app.demo_requests drop constraint demo_requests_lang_check;
alter table app.demo_requests add constraint demo_requests_lang_check check (lang in ('no', 'en', 'sv'));

alter table app.markets drop constraint markets_default_lang;
alter table app.markets add constraint markets_default_lang check (default_lang in ('no', 'en', 'sv'));
