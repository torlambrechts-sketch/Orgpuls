-- 0214 — Markets: the country an organisation is in, Norway the first and only one (D-251).
--
-- The expansion plan (docs/markets/PLAN.md) runs Sweden, Germany and the English-speaking markets
-- on this product rather than beside it. Each brings its own law, report, prices and anonymity
-- policy, and none of them may change anything for an organisation in Norway. This migration adds
-- the concept and nothing else: one market, 'no', that every organisation is in, whose values are
-- the ones the product has today. Nothing a Norwegian customer sees changes.
--
-- 1. app.markets: a market's code, the language and time zone a new organisation in it starts
--    with, and its anonymity floor. Reference data written by migrations: a signed-in client may
--    read it and write nothing.
-- 2. A market may raise the anonymity floor, never lower it (CLAUDE.md, invariant 1). k_floor is
--    checked between app.k_floor() (3) and 10, so no row goes under the platform's floor, and a
--    trigger refuses an update that lowers it: a migration that wants to must drop the trigger in
--    the open. Raising it lifts every organisation in the market that sits under the new floor,
--    through the ordinary update, so the change is logged (survey_defaults_log, 0150) and reaches
--    the planned rounds; a round that has opened keeps its k (0150).
-- 3. app.organizations.market: not null, default 'no', a foreign key to markets. A threshold under
--    the market's floor is refused (a trigger: a check cannot read another table), and
--    app.k_threshold(org) floors at it as well, so no reader sees less than the market requires.
-- 4. Only the platform moves an organisation between markets. The daglig leder has UPDATE on the
--    row (0001, for its name and settings); a market change from a client role is refused, since a
--    move from a stricter market to a looser one would lower the floor its employees were promised.
--    The rule compares market alone (CLAUDE.md, «Immutability triggers must permit referential
--    maintenance»).
-- 5. public.create_organisation takes p_market, last and defaulting to 'no', so a four-argument
--    call is the call it was; the old function is set aside in app, not dropped (as 0201 does).
--    A new organisation starts at app.k_min() (5), or its market's floor when that is higher, in
--    the market's language and time zone. An unknown market is refused
--    with 'invalid_market'. The organisation number stays nine digits — the Norwegian registry's
--    rule (organizations_org_number_check, 0001) — and the next market brings its own with it.

-- ---------------------------------------------------------------- 1 · the markets
create table app.markets (
  code         text primary key,
  k_floor      int  not null,
  default_lang text not null,
  timezone     text not null,
  created_at   timestamptz not null default now(),
  constraint markets_code check (code ~ '^[a-z]{2}$'),
  constraint markets_k_floor check (k_floor between app.k_floor() and 10),
  -- the languages an organisation may default to (organizations_default_lang_check)
  constraint markets_default_lang check (default_lang in ('no', 'en')),
  constraint markets_timezone check (length(timezone) between 3 and 64)
);

comment on table app.markets is
  'A country the product is sold in (D-251): the anonymity floor its law or its customers require, and the language and time zone a new organisation there starts with. Written by migrations only.';
comment on column app.markets.k_floor is
  'The lowest threshold an organisation in this market may choose: app.k_floor() or higher, raised and never lowered (0214). app.k_threshold floors at it.';

alter table app.markets enable row level security;
create policy markets_read on app.markets for select to authenticated using (true);
grant select on app.markets to authenticated;

insert into app.markets (code, k_floor, default_lang, timezone) values ('no', 3, 'no', 'Europe/Oslo');

-- ---------------------------------------------------------------- 2 · raised, never lowered
create function app.market_floor_raised() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.k_floor < old.k_floor then
    raise exception 'a market''s anonymity floor may be raised, never lowered' using errcode = 'restrict_violation';
  end if;
  -- the organisations under the new floor come up to it, through the update the daglig leder's own
  -- change takes, so it is logged and carried to the planned rounds (0150)
  update app.organizations o set threshold = new.k_floor
  where o.market = new.code and o.threshold < new.k_floor;
  return null;
end $fn$;
revoke all on function app.market_floor_raised() from public, anon, authenticated;

create trigger markets_floor_raised after update of k_floor on app.markets
  for each row when (old.k_floor is distinct from new.k_floor)
  execute function app.market_floor_raised();

-- ---------------------------------------------------------------- 3, 4 · the organisation's market
alter table app.organizations add column market text not null default 'no' references app.markets (code);
create index organizations_market_idx on app.organizations (market);

comment on column app.organizations.market is
  'The market the organisation is in (D-251): its anonymity floor applies (app.k_threshold), and only the platform changes it (0214).';

-- SECURITY INVOKER on purpose: current_user is the caller's role, so a client's update is told
-- apart from the platform's (a definer function, a migration). markets is readable by authenticated.
create function app.organization_market_rules() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare
  v_floor int;
begin
  if tg_op = 'UPDATE' and new.market is distinct from old.market and current_user in ('authenticated', 'anon') then
    raise exception 'an organisation''s market is changed by the platform only' using errcode = 'insufficient_privilege';
  end if;
  select m.k_floor into v_floor from app.markets m where m.code = new.market;
  if new.threshold < coalesce(v_floor, app.k_floor()) then
    raise exception 'the threshold may not be under the market''s floor of %', v_floor using errcode = 'check_violation';
  end if;
  return new;
end $fn$;
revoke all on function app.organization_market_rules() from public, anon, authenticated;

create trigger organizations_market_rules before insert or update of market, threshold on app.organizations
  for each row execute function app.organization_market_rules();

create or replace function app.k_threshold(p_org uuid) returns int
  language sql stable security definer
  set search_path = ''
as $$
  select greatest(
    coalesce((select o.threshold from app.organizations o where o.id = p_org), app.k_min()),
    coalesce((select m.k_floor from app.organizations o join app.markets m on m.code = o.market where o.id = p_org), app.k_floor()),
    app.k_floor()
  )
$$;

comment on function app.k_threshold(uuid) is
  'The organisation''s current threshold, floored at its market''s floor (0214) and at app.k_floor(); 5 (app.k_min()) when unknown. What a round takes at insert and follows until it opens. A result reader uses app.k_round(round).';

-- ---------------------------------------------------------------- 5 · sign-up names the market
-- The four-argument function is set aside rather than dropped, as 0201 sets aside the functions it
-- wraps: moved out of the API schema, renamed and closed to every client. PostgREST then sees one
-- create_organisation, and a four-argument call resolves to the new one through p_market's default.
-- Nothing calls the old one; it carries 0024's body unchanged, for the record.
alter function public.create_organisation(text, text, int, text) set schema app;
alter function app.create_organisation(text, text, int, text) rename to create_organisation_0024;
revoke all on function app.create_organisation_0024(text, text, int, text) from public, anon, authenticated;
comment on function app.create_organisation_0024(text, text, int, text) is
  'Retired by 0214: sign-up as it was before markets. No client may call it; public.create_organisation replaces it.';

create function public.create_organisation(
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

  if p_org_number is null or p_org_number !~ '^[0-9]{9}$' then
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
