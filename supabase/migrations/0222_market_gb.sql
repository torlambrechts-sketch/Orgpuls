-- 0222 — The United Kingdom is a market (UK-B, X-111, D-264).
--
-- docs/markets/PLAN.md phase 4. An organisation in the United Kingdom signs up on the English site
-- under the Empvibe brand, gets the UK market's anonymity floor, English and London time, and
-- identifies itself with its Companies House company number. Nothing changes for Norway or Sweden.
--
-- 1 · The number rule gb_company (docs/markets/uk-legal.md § 7): a Companies House company number,
--     eight characters, either eight digits (a company incorporated in England and Wales) or one of
--     the prefixes of a limited company or LLP followed by six digits:
--
--       SC  company, Scotland              OC  LLP, England and Wales
--       NI  company, Northern Ireland      SO  LLP, Scotland
--       R0  company, Northern Ireland,     NC  LLP, Northern Ireland
--           before partition
--
--     These are the companies and LLPs the Technical Interface Specification lets file electronically
--     (its Appendix A). Other registrations (limited partnerships, overseas companies, charters,
--     industrial and provident societies) are refused for now: X-111's market is limited companies
--     and LLPs, and another prefix is one more value here when a customer needs it. The prefix is
--     stored in upper case and a number of digits only is stored zero-padded to eight
--     (lib/org-number.ts normalises what a person types); the rule takes the stored form only.
--
--     app.org_number_valid gains the case, and markets_org_number_rule the value.
--
-- 2 · The UK market: floor 5 (X-111: «5»), English, London time. No organisation can join it before
--     the UK site exists: the host decides the market at sign-up (lib/hosts.ts SITES), and no host
--     names the United Kingdom yet (X-111: build first, move when ready).
--
-- The unique index on organizations.org_number (0024) stays global: eight characters cannot be the
-- same number as Norway's nine digits or Sweden's ten.

-- ---------------------------------------------------------------- 1 · the rule
create or replace function app.org_number_valid(p_rule text, p_number text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select case p_rule
    when 'nine_digits' then coalesce(p_number ~ '^[0-9]{9}$', false)
    when 'se_legal_ten' then coalesce(p_number ~ '^[0-9]{2}[2-9][0-9]{7}$', false) and (
      -- Luhn over all ten digits: every second digit from the right doubled, its digits summed
      select sum(case when (10 - x.i) % 2 = 1 then (x.d * 2) / 10 + (x.d * 2) % 10 else x.d end) % 10 = 0
      from (select i, substr(p_number, i, 1)::int as d from generate_series(1, 10) i) x)
    -- Companies House, a limited company or LLP: eight digits, or its prefix and six digits (0222)
    when 'gb_company' then coalesce(p_number ~ '^([0-9]{8}|(SC|NI|R0|OC|SO|NC)[0-9]{6})$', false)
    else false
  end
$fn$;
comment on function app.org_number_valid(text, text) is
  'Whether a number is an organisation number under a market''s rule (0218, 0222): nine_digits (Norway), se_legal_ten (Sweden: ten digits, Luhn, legal persons only), gb_company (United Kingdom: a Companies House number of a limited company or LLP, eight characters).';

alter table app.markets drop constraint markets_org_number_rule;
alter table app.markets add constraint markets_org_number_rule check (org_number_rule in ('nine_digits', 'se_legal_ten', 'gb_company'));

-- ---------------------------------------------------------------- 2 · the United Kingdom
insert into app.markets (code, k_floor, default_lang, timezone, org_number_rule)
values ('gb', 5, 'en', 'Europe/London', 'gb_company');
