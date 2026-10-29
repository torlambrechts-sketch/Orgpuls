-- 0235 — German is a platform language (DE-A, X-115).
--
-- Phase 3 of docs/markets/PLAN.md starts as phase 2 did (0215): lib/i18n/locales.ts makes `de` a
-- platform language with English as its fallback, so a text not yet translated is shown in English.
-- The database keeps four lists of the platform languages, and each takes `de`:
--
--   * organizations.default_lang — the language a new member of an organisation starts in
--   * profiles.lang — a person's own choice (the language switch saves it, lib/i18n/server)
--   * demo_requests.lang — the language a demo was asked for in (lib/demo/actions)
--   * markets.default_lang — the language a new organisation in a market starts in (0214)
--
-- tests/unit/locales.test.ts holds each list to the registry. German is not a survey language yet
-- (DE-A2 widens the survey lists with the registry's German texts); nothing changes for an
-- organisation in Norway or Sweden: no row is touched.

alter table app.organizations drop constraint organizations_default_lang_check;
alter table app.organizations add constraint organizations_default_lang_check check (default_lang in ('no', 'en', 'sv', 'de'));

alter table app.profiles drop constraint profiles_lang_check;
alter table app.profiles add constraint profiles_lang_check check (lang in ('no', 'en', 'sv', 'de'));

alter table app.demo_requests drop constraint demo_requests_lang_check;
alter table app.demo_requests add constraint demo_requests_lang_check check (lang in ('no', 'en', 'sv', 'de'));

alter table app.markets drop constraint markets_default_lang;
alter table app.markets add constraint markets_default_lang check (default_lang in ('no', 'en', 'sv', 'de'));
