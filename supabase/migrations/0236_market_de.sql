-- 0236 — Germany is a market (DE-B, X-115).
--
-- docs/markets/PLAN.md phase 3. An organisation in Germany will sign up on the German site (DE-F),
-- get the German market's anonymity floor, language and time zone, and identify itself with its
-- Umsatzsteuer-Identifikationsnummer. Nothing changes for Norway, Sweden or the United Kingdom.
--
-- 1 · The number rule `de_ustid` (app.org_number_valid, 0218): Germany has no single public company
--    number — the Handelsregister number needs its court to be unique and not every business is
--    registered — so the market takes the USt-IdNr., which a reverse-charge invoice to a German
--    customer has to carry anyway: DE and nine digits, the ninth a check digit over the first eight
--    (ISO 7064 MOD 11,10 as the Bundeszentralamt für Steuern computes it, app.de_ustid_check).
--    Stored with the prefix in capitals. The number is optional at sign-up (0232, X-114) and, typed,
--    held to this rule by the trigger of 0218. docs/markets/de-legal.md, assumption 4.
--
-- 2 · The German market: floor 5 (docs/markets/PLAN.md, raised never lowered — 0214), German, Berlin
--    time. No organisation can join it before the German site exists: the host decides the market
--    at sign-up (lib/hosts.ts SITES), and no host names Germany until DE-F opens it.
--
-- The unique index on organizations.org_number (0024) stays global: a number with the DE prefix
-- cannot be the same as any other market's digits.

-- ---------------------------------------------------------------- 1 · the rule
create function app.de_ustid_check(p_digits text) returns int
  language plpgsql immutable set search_path = ''
as $fn$
declare
  v_product int := 10;
  v_sum int;
  v_check int;
  v_i int;
begin
  if p_digits !~ '^[0-9]{8}$' then
    return -1;
  end if;
  for v_i in 1..8 loop
    v_sum := (substr(p_digits, v_i, 1)::int + v_product) % 10;
    if v_sum = 0 then
      v_sum := 10;
    end if;
    v_product := (2 * v_sum) % 11;
  end loop;
  v_check := 11 - v_product;
  if v_check = 10 then
    v_check := 0;
  end if;
  return v_check;
end $fn$;
comment on function app.de_ustid_check(text) is
  'The check digit of a German USt-IdNr. over its first eight digits (0236): ISO 7064 MOD 11,10; -1 for anything but eight digits.';
revoke all on function app.de_ustid_check(text) from public, anon, authenticated;

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
    -- Germany's USt-IdNr.: DE and nine digits, the ninth the check digit of the first eight (0236)
    when 'de_ustid' then coalesce(p_number ~ '^DE[0-9]{9}$', false)
      and app.de_ustid_check(substr(p_number, 3, 8)) = substr(p_number, 11, 1)::int
    else false
  end
$fn$;
comment on function app.org_number_valid(text, text) is
  'Whether a number is an organisation number under a market''s rule (0218, 0222, 0236): nine_digits (Norway), se_legal_ten (Sweden: ten digits, Luhn, legal persons only), gb_company (United Kingdom: a Companies House number of a company or LLP), de_ustid (Germany: DE and nine digits with the check digit).';

alter table app.markets drop constraint markets_org_number_rule;
alter table app.markets add constraint markets_org_number_rule check (org_number_rule in ('nine_digits', 'se_legal_ten', 'gb_company', 'de_ustid'));

-- ---------------------------------------------------------------- 2 · Germany
insert into app.markets (code, k_floor, default_lang, timezone, org_number_rule)
values ('de', 5, 'de', 'Europe/Berlin', 'de_ustid');
