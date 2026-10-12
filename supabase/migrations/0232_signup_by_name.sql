-- 0232 — Signing up with a company's name; the organisation number is optional (X-114, D-279).
--
-- Tor, 2026-10-11: the sign-up asked for the organisation number first, and a person who does not
-- own the company, or does not have the number to hand, stopped there. The form now asks for an
-- e-mail address and the company's name; the number is optional. Before an organisation is made,
-- the database looks for the company among those already here, and where it finds it, makes no
-- second one: the person is not let in, and once they say it is their company, their request goes to
-- the company's daglig leder, who lets them in or not (Oppsett › Roller og tilgang).
--
-- **How the company is recognised**, within the market of the host the sign-up came from, never a
-- demo organisation:
--   1. where a number is typed, by the number and by nothing else: the same undertaking whatever its
--      name, and a typed number is never outvoted by a name somebody else registered first;
--   2. with no number, by the company's name as `app.org_name_key` reads it: case, spacing,
--      punctuation and a trailing legal form (AS, ASA, Ltd, AB …) do not count;
--   3. with no number and no name, by a colleague's work address: a confirmed address at the domain
--      the organisation's daglig leder signs in with, theirs confirmed too. A free mail provider never
--      counts (`app.free_mail`), and a consultant's or accountant's address in some other company's
--      organisation does not route their own colleagues there.
-- A name or a domain counts only where exactly one organisation answers to it. A typed Norwegian
-- number must carry a valid check digit (`app.no_org_number_ok`): a typo is refused, not routed.
--
-- **Nothing is sent until the person says it is theirs.** A match files a request as `unconfirmed`:
-- the person sees «{company} already uses the product — is this your company?», and the daglig leder
-- sees nothing. Saying yes (`confirm_join_request`) makes it `pending` and tells the daglig leder;
-- saying it is another company (`signup_separately`) makes their own organisation from what they typed,
-- except where the number matched, which is the same undertaking by definition.
--
-- **What a request is, and is not.** `app.join_requests` holds who asks (the name they gave, the
-- address they signed up with, what they typed) and how they were matched; it lets nobody in. Only the
-- daglig leder of that organisation reads a confirmed one (RLS) and decides it (`decide_join_request`,
-- an invitation's rules: the member lock, a role, a department for an avdelingsleder, one organisation
-- per account). An account has one open request at a time. Let in anywhere, every request of theirs is
-- withdrawn (a trigger on memberships). Declined, it is kept for thirty days so the same person cannot
-- ask again at once; every request is forgotten after thirty days (a daily job). Telling the daglig
-- leder is a notice in the outbox (`tilgang`, 0231), members only; past five in a day for one
-- organisation the next wait their turn, five a day, rather than being dropped.
--
-- **What the answer reveals.** A person whose sign-up finds the company is told that it already uses
-- the product and its name: only after they have an account, and the same as a colleague telling them.
--
-- `create_organisation` (0024, 0218) stays for the deploy before this one and the suite that proves
-- it; nothing in the app calls it after this release.

-- ---------------------------------------------------------------- recognising a company
create or replace function app.org_name_key(p_name text) returns text
  language sql immutable parallel safe set search_path = ''
as $fn$
  with a as (
    -- the marks inside a legal form join its letters: «A/S», «A.S.», «Ltd.»
    select regexp_replace(lower(coalesce(p_name, '')), '[./''’]', '', 'g') as s
  ), b as (
    select btrim(regexp_replace(s, '[^[:alnum:]]+', ' ', 'g')) as s from a
  ), c as (
    -- a legal form at the end says what kind of company it is, not which
    select regexp_replace(s, '\s+(as|asa|ans|da|sa|ba|ks|nuf|iks|sf|ltd|limited|plc|llp|lp|llc|inc|cic|ab|hb|kb|ek|aps|oy|gmbh)$', '') as s
    from b
  )
  select nullif(btrim(s), '') from c
$fn$;

-- an index expression is evaluated as whoever writes the row: every role that may write an
-- organisation (Oppsett as the daglig leder, the platform as service_role) must be able to run it
revoke all on function app.org_name_key(text) from public, anon;
grant execute on function app.org_name_key(text) to authenticated, service_role;

create index if not exists organizations_name_key_idx on app.organizations (market, app.org_name_key(name));

-- a Norwegian organisation number's check digit (modulus 11, weights 3 2 7 6 5 4 3 2), as
-- lib/brreg/orgnr.ts holds it: a remainder of 0 gives 0, a result of 10 cannot exist
create or replace function app.no_org_number_ok(p_number text) returns boolean
  language sql immutable parallel safe set search_path = ''
as $fn$
  select coalesce(p_number, '') ~ '^\d{9}$' and (
    with s as (
      select (3 * substr(p_number, 1, 1)::int + 2 * substr(p_number, 2, 1)::int + 7 * substr(p_number, 3, 1)::int
            + 6 * substr(p_number, 4, 1)::int + 5 * substr(p_number, 5, 1)::int + 4 * substr(p_number, 6, 1)::int
            + 3 * substr(p_number, 7, 1)::int + 2 * substr(p_number, 8, 1)::int) % 11 as r
    )
    select case when r = 0 then 0 else 11 - r end = substr(p_number, 9, 1)::int from s
  )
$fn$;

revoke all on function app.no_org_number_ok(text) from public, anon, authenticated;

-- the providers anybody can have an address at: Norway's and the demo's (0146), and the common ones
-- of the United Kingdom, Sweden, Denmark, Germany, Poland and the rest of the world
create or replace function app.free_mail(p_domain text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select app.demo_free_mail(lower(coalesce(p_domain, ''))) or app.demo_throwaway(lower(coalesce(p_domain, '')))
      or lower(coalesce(p_domain, '')) = any (array[
        'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com',
        'mac.com', 'yahoo.com', 'ymail.com', 'rocketmail.com', 'aol.com', 'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at',
        'mail.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'zoho.com', 'fastmail.com', 'proton.me', 'protonmail.com',
        'pm.me', 'protonmail.ch', 'hey.com', 'tutanota.com', 'qq.com', '163.com', 'naver.com',
        'yahoo.co.uk', 'hotmail.co.uk', 'live.co.uk', 'outlook.co.uk', 'aol.co.uk', 'btinternet.com', 'sky.com',
        'virginmedia.com', 'talktalk.net', 'ntlworld.com', 'blueyonder.co.uk', 'tiscali.co.uk',
        'hotmail.se', 'live.se', 'outlook.se', 'yahoo.se', 'telia.com', 'spray.se', 'bredband.net', 'comhem.se', 'tele2.se',
        'hotmail.dk', 'live.dk', 'outlook.dk', 'yahoo.dk',
        'web.de', 't-online.de', 'freenet.de', 'arcor.de', 'orange.fr', 'free.fr', 'laposte.net', 'libero.it',
        'wp.pl', 'o2.pl', 'onet.pl', 'interia.pl', 'seznam.cz', 'inbox.lv', 'inbox.lt',
        'hotmail.no', 'live.no', 'outlook.no', 'online.no', 'getmail.no', 'frisurf.no', 'broadpark.no', 'lyse.net',
        'altibox.no', 'c2i.net', 'start.no', 'gmail.no'])
$fn$;

revoke all on function app.free_mail(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the requests
create table if not exists app.join_requests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references app.organizations(id) on delete cascade,
  user_id     uuid not null references app.profiles(id) on delete cascade,
  email       text not null check (char_length(email) between 3 and 320),
  full_name   text check (full_name is null or char_length(btrim(full_name)) between 1 and 120),
  matched_by  text not null check (matched_by in ('org_number', 'name', 'domain')),
  -- what the person typed: shown to the daglig leder beside who asks, and what `signup_separately`
  -- makes their own organisation from
  company_name   text not null check (char_length(btrim(company_name)) between 1 and 200),
  employee_count integer not null default 0 check (employee_count between 0 and 100000),
  market         text not null references app.markets(code),
  org_number     text,
  -- unconfirmed: found, not yet said to be theirs, told to nobody; pending: the daglig leder's to decide
  status      text not null default 'unconfirmed' check (status in ('unconfirmed', 'pending', 'dismissed')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists join_requests_user_idx on app.join_requests (user_id);
-- one open request per account: a person asks one company at a time
create unique index if not exists join_requests_one_open on app.join_requests (user_id) where status in ('unconfirmed', 'pending');

alter table app.join_requests enable row level security;
revoke all on app.join_requests from public, anon, authenticated;
-- what the daglig leder needs to judge a request, and nothing to address the account by
grant select (id, org_id, email, full_name, matched_by, company_name, status, created_at) on app.join_requests to authenticated;

-- a request the person has not confirmed is nobody's to read: their name and address go nowhere
-- until they say the company is theirs
create policy join_requests_daglig_leder on app.join_requests
  for select to authenticated
  using (status <> 'unconfirmed' and app.has_role(org_id, array['daglig_leder']::app.org_role[]));

-- a demo copies no one's request to join (0094's plan names every table that holds an organisation's data)
insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('join_requests', null, 'skip', null, 'a person asking to join; a demo is found by nobody (0232)')
on conflict (table_name) do nothing;

-- let in anywhere, by a request, an invitation or a daglig leder's own hand, a person asks nothing
-- more: every request of theirs is withdrawn, and its notice with it
create or replace function app.join_requests_withdraw() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.active then
    delete from app.join_requests jr where jr.user_id = new.user_id;
  end if;
  return new;
end $fn$;

revoke all on function app.join_requests_withdraw() from public, anon, authenticated;

create or replace trigger memberships_withdraw_join_requests
  after insert or update of active on app.memberships
  for each row execute function app.join_requests_withdraw();

-- held thirty days at most, whether or not anybody signs up meanwhile: a daily job forgets the rest,
-- through a function as every other job here does (0202), so the schedule names no statement of its own
create or replace function app.join_requests_purge() returns integer
  language sql set search_path = ''
as $fn$
  with gone as (
    delete from app.join_requests where created_at < now() - interval '30 days' returning 1
  )
  select count(*)::int from gone
$fn$;

revoke all on function app.join_requests_purge() from public, anon, authenticated;

select cron.schedule('orgpuls-join-requests-purge', '23 3 * * *', $cron$select app.join_requests_purge()$cron$);

-- the notice that tells the daglig leder (0231)
alter table app.outbox add column if not exists join_request_id uuid references app.join_requests(id) on delete cascade;
create index if not exists outbox_join_request_idx on app.outbox (join_request_id) where join_request_id is not null;

alter table app.outbox drop constraint outbox_round_or_measure;
alter table app.outbox add constraint outbox_round_or_measure
  check (round_id is not null or kind in ('tiltak_forfalt', 'evaluering', 'tilgang'));
alter table app.outbox add constraint outbox_tilgang_request
  check (kind <> 'tilgang' or (join_request_id is not null and audience = 'daglig_leder'));

-- ---------------------------------------------------------------- signing up
-- the organisation a sign-up makes, as create_organisation makes it, with or without a number
create or replace function app.signup_make_org(
  p_user uuid, p_name text, p_employee_count integer, p_market text, p_org_number text
) returns uuid
  language plpgsql set search_path = ''
as $fn$
declare
  v_market app.markets%rowtype;
  v_org    uuid;
begin
  select * into strict v_market from app.markets m where m.code = p_market;

  insert into app.organizations (name, org_number, employee_count, threshold, market, default_lang, timezone)
  values (btrim(p_name), p_org_number, greatest(coalesce(p_employee_count, 0), 0),
          greatest(app.k_min(), v_market.k_floor), v_market.code, v_market.default_lang, v_market.timezone)
  returning id into v_org;

  -- the membership withdraws whatever this account had asked (memberships_withdraw_join_requests)
  insert into app.memberships (org_id, user_id, role, active)
  values (v_org, p_user, 'daglig_leder', true);

  -- created switched off (0024): nothing is planned for an organisation that has told nobody anything
  insert into app.year_wheels (org_id) values (v_org);
  return v_org;
end $fn$;

revoke all on function app.signup_make_org(uuid, text, integer, text, text) from public, anon, authenticated;

create or replace function public.signup_organisation(
  p_name           text,
  p_employee_count integer,
  p_full_name      text default null,
  p_market         text default 'no',
  p_org_number     text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user      uuid := auth.uid();
  v_market    app.markets%rowtype;
  v_number    text := nullif(btrim(coalesce(p_org_number, '')), '');
  v_key       text := app.org_name_key(p_name);
  v_name      text := left(nullif(btrim(coalesce(p_full_name, '')), ''), 120);
  v_email     text;
  v_confirmed boolean := false;
  v_domain    text;
  v_org       uuid;
  v_org_name  text;
  v_by        text;
  v_open      text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- one account at a time: two tabs submitting at once make one organisation, not two
  perform pg_advisory_xact_lock(hashtext('signup:' || v_user::text));

  -- one organisation per account (0024): a member asks nothing and makes nothing
  if exists (select 1 from app.memberships m where m.user_id = v_user and m.active) then
    return jsonb_build_object('ok', false, 'error', 'already_a_member');
  end if;

  if p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 200 or v_key is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  select * into v_market from app.markets m where m.code = coalesce(p_market, 'no');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_market');
  end if;

  -- optional now; where typed, it is the market's (0218, 0222), and a Norwegian one carries its check digit
  if v_number is not null and (not app.org_number_valid(v_market.org_number_rule, v_number)
      or (v_market.org_number_rule = 'nine_digits' and not app.no_org_number_ok(v_number))) then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;

  -- an account asks one company at a time: one already waiting on a daglig leder is the answer
  select o.name into v_open
  from app.join_requests jr join app.organizations o on o.id = jr.org_id
  where jr.user_id = v_user and jr.status = 'pending';
  if v_open is not null then
    return jsonb_build_object('ok', true, 'outcome', 'requested', 'company', v_open);
  end if;
  -- a request found and never confirmed is replaced by what this sign-up finds
  delete from app.join_requests jr where jr.user_id = v_user and jr.status = 'unconfirmed';

  select lower(u.email::text), u.email_confirmed_at is not null into v_email, v_confirmed
  from auth.users u where u.id = v_user;
  v_domain := nullif(split_part(coalesce(v_email, ''), '@', 2), '');

  if v_number is not null then
    -- 1. the number, and only the number: the same undertaking whatever it is called; a typed number
    -- is never matched to a name somebody else registered
    select o.id, o.name into v_org, v_org_name
    from app.organizations o
    where o.org_number = v_number and not app.is_demo(o.id);
    if v_org is not null then v_by := 'org_number'; end if;
  else
    -- 2. the name, in the same market; only where one organisation answers to it
    select min(o.id::text)::uuid, min(o.name) into v_org, v_org_name
    from app.organizations o
    where o.market = v_market.code and app.org_name_key(o.name) = v_key and not app.is_demo(o.id)
    having count(*) = 1;
    if v_org is not null then v_by := 'name'; end if;

    -- 3. a colleague's work address: confirmed, not a free provider, the domain the daglig leder of one
    -- organisation, and only one, signs in with, their address confirmed too
    if v_org is null and v_confirmed and v_domain is not null and not app.free_mail(v_domain) then
      select min(o.id::text)::uuid, min(o.name) into v_org, v_org_name
      from app.organizations o
      where o.market = v_market.code and not app.is_demo(o.id)
        and exists (select 1 from app.memberships m join auth.users u on u.id = m.user_id
                    where m.org_id = o.id and m.active and m.role = 'daglig_leder'
                      and u.email_confirmed_at is not null
                      and lower(split_part(u.email::text, '@', 2)) = v_domain)
      having count(*) = 1;
      if v_org is not null then v_by := 'domain'; end if;
    end if;
  end if;

  -- the profile is the row a membership and a request hang off
  insert into app.profiles (id, full_name)
  values (v_user, v_name)
  on conflict (id) do update set full_name = coalesce(excluded.full_name, app.profiles.full_name);

  if v_org is not null then
    if v_email is null then
      return jsonb_build_object('ok', false, 'error', 'org_failed');
    end if;
    -- found: kept as unconfirmed, told to nobody, until the person says the company is theirs. One
    -- declined here before stays declined.
    insert into app.join_requests (org_id, user_id, email, full_name, matched_by,
                                   company_name, employee_count, market, org_number)
    values (v_org, v_user, v_email, v_name, v_by,
            btrim(p_name), least(greatest(coalesce(p_employee_count, 0), 0), 100000), v_market.code, v_number)
    on conflict (org_id, user_id) do nothing;
    return jsonb_build_object('ok', true, 'outcome', 'requested', 'company', v_org_name);
  end if;

  -- nothing found: the organisation is made, with or without a number
  perform app.signup_make_org(v_user, p_name, p_employee_count, v_market.code, v_number);
  return jsonb_build_object('ok', true, 'outcome', 'created');
exception when unique_violation then
  -- the same number signed up twice at the same moment: refused, not merged into
  return jsonb_build_object('ok', false, 'error', 'already_registered');
end $fn$;

revoke all on function public.signup_organisation(text, integer, text, text, text) from public, anon;
grant execute on function public.signup_organisation(text, integer, text, text, text) to authenticated;

-- «Yes, this is my company»: the request goes to the daglig leder, and they are told. Past five
-- notices in a day for one organisation, the next wait their turn, five a day: a name typed over and
-- over cannot flood an inbox, nor push a colleague's notice out.
create or replace function public.confirm_join_request() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  r      app.join_requests%rowtype;
  v_name text;
  v_sent int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  perform pg_advisory_xact_lock(hashtext('signup:' || v_user::text));
  if exists (select 1 from app.memberships m where m.user_id = v_user and m.active) then
    return jsonb_build_object('ok', false, 'error', 'already_a_member');
  end if;

  select * into r from app.join_requests jr
  where jr.user_id = v_user and jr.status = 'unconfirmed' and jr.created_at >= now() - interval '30 days'
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'nothing_pending');
  end if;

  update app.join_requests set status = 'pending' where id = r.id;

  select count(*) into v_sent from app.outbox x
  where x.org_id = r.org_id and x.kind = 'tilgang' and x.created_at > now() - interval '1 day';
  insert into app.outbox (org_id, kind, audience, join_request_id, due_at)
  values (r.org_id, 'tilgang', 'daglig_leder', r.id, now() + (v_sent / 5) * interval '1 day');

  select o.name into v_name from app.organizations o where o.id = r.org_id;
  return jsonb_build_object('ok', true, 'company', v_name);
end $fn$;

revoke all on function public.confirm_join_request() from public, anon;
grant execute on function public.confirm_join_request() to authenticated;

-- the person who asked: the company they asked to join, whether it waits on their word, on the
-- daglig leder's, or was declined, what they typed, and whether they may say it is not theirs (not
-- where the number matched). Their own request only, and only while they belong nowhere.
create or replace function public.my_join_request() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('company', o.name, 'status', jr.status, 'since', jr.created_at,
                            'typed', jr.company_name, 'separable', jr.matched_by <> 'org_number')
  from app.join_requests jr
  join app.organizations o on o.id = jr.org_id
  where jr.user_id = auth.uid() and jr.created_at >= now() - interval '30 days'
    and not exists (select 1 from app.memberships m where m.user_id = jr.user_id and m.active)
  order by (jr.status = 'dismissed'), jr.created_at desc
  limit 1
$fn$;

revoke all on function public.my_join_request() from public, anon;
grant execute on function public.my_join_request() to authenticated;

-- «We are another company»: the person's own organisation, made from what they typed. Not where the
-- number matched; never into the organisation found; the request, unconfirmed, waiting or declined, is
-- withdrawn with the membership.
create or replace function public.signup_separately() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  r      app.join_requests%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  perform pg_advisory_xact_lock(hashtext('signup:' || v_user::text));
  if exists (select 1 from app.memberships m where m.user_id = v_user and m.active) then
    return jsonb_build_object('ok', false, 'error', 'already_a_member');
  end if;

  select * into r from app.join_requests jr
  where jr.user_id = v_user and jr.created_at >= now() - interval '30 days'
  order by (jr.status = 'dismissed'), jr.created_at desc
  limit 1
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'nothing_pending');
  end if;
  if r.matched_by = 'org_number' then
    return jsonb_build_object('ok', false, 'error', 'same_number');
  end if;

  perform app.signup_make_org(v_user, r.company_name, r.employee_count, r.market, r.org_number);
  return jsonb_build_object('ok', true, 'outcome', 'created');
exception when unique_violation then
  -- the number typed was registered by somebody else since
  return jsonb_build_object('ok', false, 'error', 'already_registered');
end $fn$;

revoke all on function public.signup_separately() from public, anon;
grant execute on function public.signup_separately() to authenticated;

-- ---------------------------------------------------------------- the daglig leder decides
create or replace function public.decide_join_request(
  p_request uuid,
  p_accept  boolean,
  p_role    text default null,
  p_group   uuid default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user  uuid := auth.uid();
  r       app.join_requests%rowtype;
  v_role  app.org_role;
  v_group uuid := p_group;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select * into r from app.join_requests jr where jr.id = p_request for update;
  -- the same answer for a request that does not exist, one the person has not confirmed, and one that
  -- is not this caller's to decide
  if not found or r.status = 'unconfirmed' or not app.has_role(r.org_id, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform pg_advisory_xact_lock(hashtext('signup:' || r.user_id::text));
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;

  -- already in this organisation (an invitation came first): nothing to decide, and no role changes
  if exists (select 1 from app.memberships m where m.user_id = r.user_id and m.org_id = r.org_id and m.active) then
    delete from app.join_requests where id = r.id;
    return jsonb_build_object('ok', true);
  end if;

  if not coalesce(p_accept, false) then
    update app.join_requests set status = 'dismissed' where id = r.id;
    return jsonb_build_object('ok', true);
  end if;

  -- an invitation's rules (0028, 0029)
  if exists (select 1 from app.member_locks l where l.org_id = r.org_id) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if p_role is null or p_role not in ('daglig_leder', 'avdelingsleder', 'verneombud') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  v_role := p_role::app.org_role;
  if v_role = 'avdelingsleder' then
    if v_group is null or not exists (select 1 from app.groups g where g.id = v_group and g.org_id = r.org_id) then
      return jsonb_build_object('ok', false, 'error', 'invalid_group');
    end if;
  else
    v_group := null;
  end if;
  -- one organisation per account, as accept_invite holds it
  if exists (select 1 from app.memberships m where m.user_id = r.user_id and m.active and m.org_id <> r.org_id) then
    return jsonb_build_object('ok', false, 'error', 'other_organisation');
  end if;

  -- a former member of this organisation comes back with the role chosen now; the membership
  -- withdraws the request (memberships_withdraw_join_requests): the membership is the record
  insert into app.memberships (org_id, user_id, role, active, group_id)
  values (r.org_id, r.user_id, v_role, true, v_group)
  on conflict (org_id, user_id) do update set role = excluded.role, group_id = excluded.group_id, active = true;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.decide_join_request(uuid, boolean, text, uuid) from public, anon;
grant execute on function public.decide_join_request(uuid, boolean, text, uuid) to authenticated;

-- ---------------------------------------------------------------- the dispatcher
-- dispatch_claim as 0219 left it, with a request's notice (0231): resolved once the request is not
-- pending, for members only, and carrying who asks
create or replace function public.dispatch_claim(p_batch integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare
  v_out     jsonb := '[]'::jsonb;
  x         record;
  r         record;
  v_why     text;
  v_rcpt    jsonb;
  v_key     text;
  v_pulse   int;
  v_channel text;
  v_email   text;
  v_phone   text;
  v_sms     boolean;
  v_rule    text;
  v_personal boolean;
  -- 0185: Slack
  v_slack   boolean;
  v_srule   text;
  v_suser   text;
  v_org     record;
  v_items   jsonb;
  -- 0176: Teams
  v_object  text;
  v_teams   boolean;
  v_trule   text;
begin
  for x in
    select o.*
    from app.outbox o
    join app.organizations org on org.id = o.org_id
    left join app.survey_defaults sd on sd.org_id = o.org_id
    where o.sent_at is null
      and o.failed_at is null
      and o.due_at <= now()
      and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
      and org.mail_enabled
      -- quiet hours: no invitation or reminder between 21 and 07 where the organisation is.
      -- A link somebody asked for is not held.
      and (o.kind not in ('invitasjon', 'paminnelse', 'siste_paminnelse')
           or not coalesce(sd.quiet_hours, true)
           or extract(hour from now() at time zone org.timezone) between 7 and 20)
    -- 0106 (AUD-04): a pre-notice goes before the invitations due at the same moment
    order by o.due_at, (o.kind <> 'forvarsel'), (o.audience = 'alle_ansatte'), o.id
    limit least(greatest(coalesce(p_batch, 20), 1), 100)
    for update of o skip locked
  loop
    -- 0099: the organisation on its own, since a measure's notice belongs to no round
    select org.name as org_name, org.default_lang, org.market, case when x.round_id is null then app.k_threshold(org.id) else app.k_round(x.round_id) end as k,
           org.sms_enabled, org.sms_when, org.sms_text, org.invite_greeting, org.slack_enabled, org.slack_when,
           exists (select 1 from app.slack_installs si where si.org_id = org.id and si.status = 'active') as slack_ready,
           org.teams_enabled, org.teams_when, (select et.tenant_id from app.entra_tenants et where et.org_id = org.id) as tenant_id,
           (select p.full_name from app.profiles p where p.id = org.invite_greeting_by) as greeting_by
    into v_org
    from app.organizations org where org.id = x.org_id;

    r := null;
    select ro.status, ro.opens_at, ro.closes_at, ro.sms_when as round_sms_when, ro.slack_when as round_slack_when, ro.teams_when as round_teams_when, ms.kind, ms.year, ro.results_publish_on,
           -- 0105: the round's own introduction, and who wrote it
           ro.intro_message, (select p.full_name from app.profiles p where p.id = ro.intro_by) as intro_by_name
    into r
    from app.rounds ro
    join app.measurements ms on ms.id = ro.measurement_id
    where ro.id = x.round_id;

    -- 0099: a measure's notice lists what is overdue now, for its owner or for the verneombud
    v_items := null;
    if x.kind = 'tiltak_forfalt' then
      select coalesce(jsonb_agg(jsonb_build_object('title', me.title, 'due', me.due_date) order by me.due_date nulls last, me.title), '[]'::jsonb)
      into v_items
      from app.overdue_measures(x.org_id) me
      where x.employee_id is null or me.owner_employee_id = x.employee_id;
    end if;

    v_personal := x.kind in ('invitasjon', 'paminnelse', 'siste_paminnelse', 'lenke');

    v_why := case
      when v_personal and r.status <> 'apen' then 'round_not_open'
      when v_personal and exists (
        select 1 from app.invitations i
        where i.id = x.invitation_id and (i.responded_at is not null or i.expires_at <= now())
      ) then 'answered_or_expired'
      -- 0106 (AUD-04): stale only when it was due before the round opened; a lead of 0 is due at
      -- the opening itself and is queued in the same tick that opens it, and must still go out
      when x.kind = 'forvarsel' and r.status <> 'planlagt' and x.due_at < r.opens_at then 'round_already_open'
      when x.kind = 'resultat' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days') then 'stale'
      -- 0212: «dette gjør vi» only while the page it points to is shown
      when x.kind = 'tiltak_status' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days'
        or not exists (select 1 from app.rounds ro where ro.id = x.round_id and ro.results_page and app.results_published(ro.id))) then 'stale'
      -- 0099: nothing overdue any more, or a round no longer open
      when x.kind = 'tiltak_forfalt' and jsonb_array_length(v_items) = 0 then 'resolved'
      when x.kind = 'svarprosent' and (r.status is distinct from 'apen' or x.due_at < now() - interval '3 days') then 'stale'
      -- 0104: an evaluation recorded since, or no longer due (A-02)
      when x.kind = 'evaluering' and not exists (
        select 1 from app.evaluation_due(x.org_id) d
        where d.due_on is not null and d.due_on <= (now() at time zone 'Europe/Oslo')::date) then 'resolved'
      -- 0232 (D-279): a request let in, declined or forgotten since
      when x.kind = 'tilgang' and not exists (
        select 1 from app.join_requests jr where jr.id = x.join_request_id and jr.status = 'pending') then 'resolved'
    end;

    v_channel := 'email';
    if v_why is null and v_personal then
      -- one person: choose the channel that carries their link
      select case when d.email is null or app.reserved_address(d.email) then null else d.email end, d.phone, d.entra_object_id
      into v_email, v_phone, v_object
      from app.dispatch_recipients(x.id) d
      limit 1;
      v_sms := v_org.sms_enabled and v_phone is not null;
      v_rule := coalesce(r.round_sms_when, v_org.sms_when);
      -- 0185: Slack when the organisation has it on and a working installation, and the person a
      -- match in the workspace; the rule is the organisation's, or the round's own
      v_suser := (select sm.slack_user_id from app.slack_members sm
                  join app.employees e on e.id = sm.employee_id and e.active
                  where sm.employee_id = x.employee_id and sm.org_id = x.org_id);
      v_slack := v_org.slack_enabled and v_org.slack_ready and v_suser is not null;
      v_srule := coalesce(r.round_slack_when, v_org.slack_when);
      -- 0176: Teams when the organisation has it on and a tenant bound, the person an object id
      -- and nothing Teams said against them; the rule as SMS's
      v_teams := v_org.teams_enabled and v_org.tenant_id is not null and v_object is not null
                 and not exists (select 1 from app.address_problems ap
                                 where ap.employee_id = x.employee_id and ap.channel = 'teams');
      v_trule := coalesce(r.round_teams_when, v_org.teams_when);
      if x.kind = 'lenke' then
        -- the channel they typed their address or number into
        v_channel := case
          when x.channel = 'sms' and v_sms then 'sms'
          when x.channel = 'email' and v_email is not null then 'email'
        end;
      else
        v_channel := case
          when v_teams and (v_trule = 'alle'
                            or (v_trule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))
                            or (v_trule = 'mangler' and v_email is null)) then 'teams'
          when v_slack and (v_srule = 'alle'
                            or (v_srule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))) then 'slack'
          when v_sms and (v_rule = 'alle'
                          or (v_rule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))
                          or (v_rule = 'mangler' and v_email is null)) then 'sms'
          when v_email is not null then 'email'
          when v_sms then 'sms'
        end;
      end if;
      if v_channel is null then
        v_why := 'no_address';
      else
        select coalesce(jsonb_agg(jsonb_build_object(
                 'email', v_email,
                 'phone', case when v_sms then v_phone end,
                 -- 0185: whom the bot writes to, only when Slack carries the link
                 'slack', case when v_channel = 'slack' then jsonb_build_object('user_id', v_suser, 'org', x.org_id) end,
                 -- 0176: whom the bot addresses, only when Teams carries the link
                 'teams', case when v_channel = 'teams' then jsonb_build_object(
                   'object_id', d.entra_object_id, 'tenant_id', d.tenant_id,
                   'conversation_id', d.conversation_id, 'service_url', d.service_url) end,
                 'name', d.name, 'lang', d.lang, 'member', d.member)), '[]'::jsonb)
        into v_rcpt
        from app.dispatch_recipients(x.id) d;
      end if;
    elsif v_why is null then
      -- a role notice: e-mail only, never to a reserved address
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', d.email, 'phone', null, 'name', d.name, 'lang', d.lang, 'member', d.member)), '[]'::jsonb)
      into v_rcpt
      from app.dispatch_recipients(x.id) d
      where d.email is not null and not app.reserved_address(d.email)
        -- 0232 (D-279): a request is for a daglig leder who can sign in and act on it, not for the
        -- register's record of the duty
        and (x.kind <> 'tilgang' or d.member);
      if jsonb_array_length(v_rcpt) = 0 then v_why := 'no_address'; end if;
    end if;

    if v_why is not null then
      update app.outbox set failed_at = now(), last_error = v_why, claimed_at = null where id = x.id;
      continue;
    end if;

    v_key := null;
    if x.invitation_id is not null then
      v_key := app.new_respondent_token();
      update app.invitations set token_hash = extensions.digest(v_key, 'sha256') where id = x.invitation_id;
    end if;

    v_pulse := null;
    if x.round_id is not null and r.kind = 'puls' and r.opens_at is not null then
      select count(*) into v_pulse
      from app.rounds r2 join app.measurements m2 on m2.id = r2.measurement_id
      where r2.org_id = x.org_id and m2.kind = 'puls' and m2.year = r.year
        and r2.opens_at is not null
        and (r2.opens_at < r.opens_at or (r2.opens_at = r.opens_at and r2.id <= x.round_id));
    end if;

    update app.outbox set claimed_at = now(), attempts = attempts + 1 where id = x.id;

    v_out := v_out || jsonb_build_object(
      'id', x.id,
      'kind', x.kind,
      'audience', x.audience,
      'channel', v_channel,
      'sms_text', v_org.sms_text,
      'lang', coalesce(v_org.default_lang, 'no'),
      -- 0219 (D-257): whose law the notice states, the organisation's market's
      'market', coalesce(v_org.market, 'no'),
      'org', v_org.org_name,
      'k', v_org.k,
      'round', case when x.round_id is not null then jsonb_build_object(
        'kind', r.kind, 'year', r.year, 'pulse', nullif(v_pulse, 0),
        'opens_at', r.opens_at, 'closes_at', r.closes_at) end,
      -- 0099 (P1-1): what an invitation says about itself — its length, whether everyone is told
      -- the results, and the daglig leder's own greeting
      'minutes', case when x.kind = 'invitasjon' then app.round_minutes(x.round_id) end,
      'results_shared', case when x.kind = 'invitasjon' then exists (
        select 1 from app.year_wheels yw join app.wheel_notifications wn on wn.wheel_id = yw.id
        where yw.org_id = x.org_id and wn.audience = 'alle_ansatte') end,
      -- 0106 (AUD-06): the day everyone is told, so the invitation names it instead of the deadline
      'publish_on', case when x.kind = 'invitasjon' then r.results_publish_on end,
      -- 0105: the round's introduction where one was written for it, else the organisation's greeting
      'greeting', case when x.kind = 'invitasjon' and coalesce(r.intro_message, v_org.invite_greeting) is not null then
        jsonb_build_object('text', coalesce(r.intro_message, v_org.invite_greeting),
                           'by', case when r.intro_message is not null then r.intro_by_name else v_org.greeting_by end) end,
      -- 0105 (engagement phase 2): «Siden sist», for the invitation's e-mail
      'since', case when x.kind = 'invitasjon' then app.since_last(x.round_id) end,
      'measures', v_items,
      -- 0104 (A-02): when the ordning was last evaluated, by which cadence, and when it fell due
      'evaluation', case when x.kind = 'evaluering' then (
        select jsonb_build_object('cadence', d.cadence, 'last_on', d.last_on, 'due_on', d.due_on)
        from app.evaluation_due(x.org_id) d) end,
      -- 0232 (D-279): who asks to join, for the daglig leder to judge: the name they gave and the
      -- address they signed up with
      'request', case when x.kind = 'tilgang' then (
        select jsonb_build_object('name', jr.full_name, 'email', jr.email)
        from app.join_requests jr where jr.id = x.join_request_id) end,
      -- 0104: the organisation's logo, by its address, for the head of every notice
      'logo', app.logo_key(x.org_id),
      -- 0100 (P1-3): the page «Dette sa dere, dette gjør vi» — the round's own in its results
      -- notice, the last one shared in the next invitation
      'results_page', case
        when x.kind in ('resultat', 'tiltak_status') then (
          select ro.share_slug from app.rounds ro
          where ro.id = x.round_id and ro.status = 'lukket' and ro.results_page)
        when x.kind = 'invitasjon' then (
          select ro.share_slug from app.rounds ro
          where ro.org_id = x.org_id and ro.id <> x.round_id and ro.status = 'lukket' and ro.results_page
            and app.results_published(ro.id)
          order by ro.closes_at desc nulls last limit 1)
      end,
      'recipients', v_rcpt,
      -- the languages the survey is ready in, for the personal kinds (0079): the dispatcher
      -- adds the flag and the page strings' hash, as the respondent page does
      'locales', case when v_personal then app.round_locale_state(x.round_id) end,
      'token', v_key);
  end loop;

  return v_out;
end $function$;

revoke all on function public.dispatch_claim(int) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;
