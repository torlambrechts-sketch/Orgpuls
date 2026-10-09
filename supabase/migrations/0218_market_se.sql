-- 0218 — Sweden is a market (SE-B, D-254).
--
-- docs/markets/PLAN.md phase 2. An organisation in Sweden signs up on the Swedish site, gets the
-- Swedish market's anonymity floor, language and time zone, and identifies itself with a Swedish
-- organisation number. Nothing changes for Norway.
--
-- 1 · Each market names its organisation number rule (app.markets.org_number_rule), as data:
--
--       nine_digits     Norway's, as it has been since 0001: nine digits
--       se_legal_ten    Sweden's organisationsnummer: ten digits, the Luhn check digit, and the third
--                       digit 2 or higher, which only a legal person's number has. A sole trader's
--                       number in Sweden is their personnummer; the product does not take a person's
--                       identity number, so a sole trader cannot sign up with one.
--
--    app.org_number_valid(rule, number) is the rule, and a trigger holds every organisation's number
--    to its market's rule. It replaces the column check of 0001, which knew nine digits only. The
--    number in an error is never echoed: a refused Swedish number may be a personnummer.
--
-- 2 · The Swedish market: floor 5, Swedish, Stockholm time. The owner's open decision is whether
--    Sweden's anonymity floor is 5 or 6 (PLAN, «Decisions only the owner can make»); both are at least
--    5, and a market's floor can be raised later and never lowered (0214), so 5 decides nothing.
--    No organisation can join it before the Swedish site exists: the host decides the market at
--    sign-up (lib/hosts.ts SITES), and no host names Sweden until SE_HOST is set.
--
-- 3 · create_organisation checks the number against the market's rule instead of nine digits.
--
-- The unique index on organizations.org_number (0024) stays global: nine and ten digits cannot be
-- the same number. A market whose numbers could collide with another's brings a per-market index.

-- ---------------------------------------------------------------- 1 · the rule, per market
create function app.org_number_valid(p_rule text, p_number text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select case p_rule
    when 'nine_digits' then coalesce(p_number ~ '^[0-9]{9}$', false)
    when 'se_legal_ten' then coalesce(p_number ~ '^[0-9]{2}[2-9][0-9]{7}$', false) and (
      -- Luhn over all ten digits: every second digit from the right doubled, its digits summed
      select sum(case when (10 - x.i) % 2 = 1 then (x.d * 2) / 10 + (x.d * 2) % 10 else x.d end) % 10 = 0
      from (select i, substr(p_number, i, 1)::int as d from generate_series(1, 10) i) x)
    else false
  end
$fn$;
comment on function app.org_number_valid(text, text) is
  'Whether a number is an organisation number under a market''s rule (0218): nine_digits (Norway), se_legal_ten (Sweden: ten digits, Luhn, legal persons only).';

alter table app.markets add column org_number_rule text not null default 'nine_digits';
alter table app.markets add constraint markets_org_number_rule check (org_number_rule in ('nine_digits', 'se_legal_ten'));
comment on column app.markets.org_number_rule is
  'The organisation number rule of the market (0218, app.org_number_valid). nine_digits is Norway''s.';

create function app.organization_number_rule() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare
  v_rule text;
begin
  if new.org_number is null then
    return new;
  end if;
  select m.org_number_rule into v_rule from app.markets m where m.code = new.market;
  if not app.org_number_valid(v_rule, new.org_number) then
    raise exception using errcode = 'check_violation', constraint = 'organizations_org_number_rule',
      message = format('organisation number not valid in market %s', new.market);
  end if;
  return new;
end $fn$;
revoke all on function app.organization_number_rule() from public, anon, authenticated;

create trigger organizations_org_number_rule
  before insert or update of org_number, market on app.organizations
  for each row execute function app.organization_number_rule();

-- the trigger holds the rule now; 0001's check knew Norway's only
alter table app.organizations drop constraint organizations_org_number_check;

-- ---------------------------------------------------------------- 2 · Sweden
insert into app.markets (code, k_floor, default_lang, timezone, org_number_rule)
values ('se', 5, 'sv', 'Europe/Stockholm', 'se_legal_ten');

-- ---------------------------------------------------------------- 3 · sign-up by the market's rule
create or replace function public.create_organisation(
  p_name           text,
  p_org_number     text,
  p_employee_count int,
  p_full_name      text default null,
  p_market         text default 'no'
) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_org    uuid;
  v_market app.markets%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if exists (select 1 from app.memberships m where m.user_id = v_user and m.active) then
    return jsonb_build_object('ok', false, 'error', 'already_a_member');
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  select * into v_market from app.markets m where m.code = coalesce(p_market, 'no');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_market');
  end if;

  -- the market's rule (0218): nine digits in Norway, a legal person's organisationsnummer in Sweden
  if p_org_number is null or not app.org_number_valid(v_market.org_number_rule, p_org_number) then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;

  if exists (select 1 from app.organizations o where o.org_number = p_org_number) then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end if;

  -- the profile is the row memberships hang off; a sign-up is the first time it is needed
  insert into app.profiles (id, full_name)
  values (v_user, nullif(btrim(coalesce(p_full_name, '')), ''))
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, app.profiles.full_name);

  -- the threshold is not a parameter (0024): the default, or the market's floor when it is higher
  insert into app.organizations (name, org_number, employee_count, threshold, market, default_lang, timezone)
  values (btrim(p_name), p_org_number, greatest(coalesce(p_employee_count, 0), 0),
          greatest(app.k_min(), v_market.k_floor), v_market.code, v_market.default_lang, v_market.timezone)
  returning id into v_org;

  insert into app.memberships (org_id, user_id, role, active)
  values (v_org, v_user, 'daglig_leder', true);

  -- created switched off (0024): nothing is planned for an organisation that has told nobody anything
  insert into app.year_wheels (org_id) values (v_org);

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.create_organisation(text, text, int, text, text) from public, anon;
grant execute on function public.create_organisation(text, text, int, text, text) to authenticated;
