-- 0176 — Microsoft Teams as a third channel for a person's survey link (D-203).
--
-- The dispatcher sends an invitation or a reminder by e-mail (0032) or SMS (0033). Since this
-- migration it can also send it as a Teams message from the Orgpuls bot: one Adaptive Card with
-- the short, already translated lead the SMS carries and one «Svar nå» button that opens the
-- person's own link (supabase/functions/_shared/teams.ts). Teams addresses a person by the
-- Entra object id and the tenant id, never by an address, so this builds on the tenant an
-- organisation bound (app.entra_tenants, 0155) and the object id the Entra import keeps on the
-- register (app.employees.entra_object_id, the Entra import).
--
-- What is stored, and where:
--   * organizations.teams_enabled / teams_when: on or off, and when Teams carries the link, with
--     sms_when's semantics (mangler: those without e-mail; paaminn: the reminders; alle: everyone
--     who can be reached in Teams). Off by default.
--   * rounds.teams_when: one round's rule; null follows the organisation's, as rounds.sms_when.
--     Fixed once the round has opened, as every other round setting (0076).
--   * app.teams_conversations: the 1:1 conversation the bot has with one employee — its id, the
--     service URL that conversation lives on, and the tenant it belongs to. The register's side
--     of the product, like address_problems: RLS on, no client policy, no grant. Nothing on
--     invitations, responses or any answer table names a Teams identity, so nothing about Teams
--     can be joined to an answer. A changed object id or a changed tenant clears it.
--   * app.address_problems gains the channel 'teams': 'blocked' when Teams answered 403
--     MessageWritesBlocked (the person blocked or removed the app), 'invalid' when the person
--     cannot be reached by the bot at all (the app is not installed for them, or Teams does not
--     know them). A problem takes the person off Teams until the app is installed again, which
--     the bot hears about (installationUpdate) and which clears it. The daglig leder's list of
--     addresses that do not work (public.address_problems) leaves Teams out: e-mail carried the
--     link instead, and whom the bot could not reach is shown as counts only (teams_status).
--
-- The channel rule (dispatch_claim), for an invitation or a reminder:
--   Teams  when the organisation has Teams on, has bound a tenant, the person has an object id
--          and no Teams problem, and the rule says so (alle; paaminn for a reminder; mangler
--          when the person has no usable e-mail);
--   else   the e-mail/SMS rule of 0033/0076, unchanged.
-- A link somebody asked for («lenke») goes by the channel they typed into, never Teams; a notice
-- to a role stays e-mail. Quiet hours, the answered/expired and stale checks and the new token
-- per send are the claim's own and apply to Teams as they did. The recipient row keeps the
-- e-mail (and the number where SMS may carry it), so the dispatcher can fall back in the same
-- run when Teams refuses.
--
-- dispatch_done records the channel that carried the message: 'email', 'sms' or 'teams'. It
-- used to turn every other value into 'email', which wrote a false channel into the register.
-- Now null still means e-mail (every caller before 0033 sent e-mail and passed nothing), and an
-- unknown value is refused with an error: the dispatcher passes a typed value, so an unknown one
-- is a bug, and a bug must not be recorded as fact.
--
-- Anonymity: the claim hands the dispatcher the identity it needs to address one message and
-- nothing else; nothing is kept per message (no activity id: the card is never edited or
-- deleted, and nothing reacts to responded_at); no read receipt, no click is recorded.

do $$
begin
  if to_regclass('app.entra_tenants') is null then
    raise exception '0176 needs app.entra_tenants (0155, Entra sign-in and tenant binding)';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'app' and table_name = 'employees' and column_name = 'entra_object_id') then
    raise exception '0176 needs app.employees.entra_object_id (the Entra import); apply that migration first';
  end if;
end $$;

-- ---------------------------------------------------------------- settings
alter table app.organizations
  add column teams_enabled boolean not null default false,
  add column teams_when text not null default 'alle' check (teams_when in ('mangler', 'paaminn', 'alle'));

comment on column app.organizations.teams_enabled is
  'Whether survey links may go as a Teams message from the Orgpuls bot (0176). Needs a bound tenant.';
comment on column app.organizations.teams_when is
  'mangler: only people without an e-mail address; paaminn: reminders; alle: everyone reachable in Teams.';

alter table app.rounds
  add column teams_when text check (teams_when in ('mangler', 'paaminn', 'alle'));

comment on column app.rounds.teams_when is
  'This round''s Teams rule; null follows the organisation''s (organizations.teams_when).';

grant update (teams_when) on app.rounds to authenticated;

-- fixed once open, as the round's other settings (0076 round_settings_fixed)
create function app.round_teams_when_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if current_user in ('authenticated', 'anon') and old.status <> 'planlagt'
     and new.teams_when is distinct from old.teams_when then
    raise exception 'a round''s settings are fixed once it has opened' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

create trigger round_teams_when_fixed before update of teams_when on app.rounds
  for each row execute function app.round_teams_when_fixed();

-- ---------------------------------------------------------------- the channel, everywhere it is named
alter table app.outbox drop constraint outbox_channel_check;
alter table app.outbox add constraint outbox_channel_check check (channel in ('email', 'sms', 'teams'));

alter table app.address_problems drop constraint address_problems_channel_check;
alter table app.address_problems add constraint address_problems_channel_check check (channel in ('email', 'sms', 'teams'));
-- Teams knows two facts about a person: blocked (403 MessageWritesBlocked) and unreachable
alter table app.address_problems add constraint address_problems_teams_problem
  check (channel <> 'teams' or problem in ('blocked', 'invalid'));

-- ---------------------------------------------------------------- the conversation per person
create table app.teams_conversations (
  employee_id     uuid primary key references app.employees (id) on delete cascade,
  org_id          uuid not null references app.organizations (id) on delete cascade,
  tenant_id       text not null
                  check (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  -- printable ASCII, no space, at most 512 (a regular expression may not count past 255)
  conversation_id text not null check (conversation_id ~ '^[!-~]+$' and char_length(conversation_id) <= 512),
  -- the Bot Connector this conversation lives on; only Microsoft's public-cloud host, so a forged
  -- value could never make the dispatcher hand its bot token to anyone else
  service_url     text not null check (service_url ~ '^https://smba\.trafficmanager\.net/[A-Za-z0-9._~/-]{0,200}$'),
  updated_at      timestamptz not null default now()
);
create index teams_conversations_org on app.teams_conversations (org_id);
alter table app.teams_conversations enable row level security;
revoke all on app.teams_conversations from public, anon, authenticated;

comment on table app.teams_conversations is
  'The Orgpuls bot''s 1:1 conversation with one employee in their organisation''s tenant (0176). Register side; no client access.';

insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('teams_conversations', null, 'skip', null, 'nothing is sent from a sandbox');

-- a new object id is a new person to Teams: the old conversation and its problem do not apply
create function app.employee_teams_identity_changed() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.entra_object_id is distinct from old.entra_object_id then
    delete from app.teams_conversations where employee_id = new.id;
    delete from app.address_problems where employee_id = new.id and channel = 'teams';
  end if;
  return new;
end $fn$;

create trigger employees_teams_identity_changed after update of entra_object_id on app.employees
  for each row execute function app.employee_teams_identity_changed();

-- a tenant unbound or replaced: what the bot knew in the old tenant is for nobody, and with no
-- tenant at all Teams is off, so no screen says it is on while nothing can be sent
create function app.entra_tenant_teams_reset() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' or new.tenant_id is distinct from old.tenant_id then
    delete from app.teams_conversations where org_id = old.org_id;
    delete from app.address_problems where org_id = old.org_id and channel = 'teams';
  end if;
  if tg_op = 'DELETE' then
    update app.organizations set teams_enabled = false where id = old.org_id and teams_enabled;
  end if;
  return null;
end $fn$;

create trigger entra_tenants_teams_reset after update of tenant_id or delete on app.entra_tenants
  for each row execute function app.entra_tenant_teams_reset();

-- ---------------------------------------------------------------- the bot's write paths (service role)
-- The bot endpoint (orgpuls-teams-bot) heard that the app was installed for a person, or a
-- conversation with them began: keep it. The person is found by tenant → the organisation that
-- bound it → its active employee with that object id. An unknown tenant or person is ignored and
-- answered without saying which (matched false). Never returns an id.
create function public.teams_conversation_set(p_tenant text, p_object text, p_conversation text, p_service_url text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_tenant text := lower(btrim(coalesce(p_tenant, '')));
  v_object text := lower(btrim(coalesce(p_object, '')));
  v_org    uuid;
  v_emp    uuid;
begin
  if v_tenant !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_object !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_conversation, '') !~ '^[!-~]+$' or char_length(p_conversation) > 512
     or coalesce(p_service_url, '') !~ '^https://smba\.trafficmanager\.net/[A-Za-z0-9._~/-]{0,200}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select et.org_id into v_org from app.entra_tenants et where et.tenant_id = v_tenant;
  if v_org is null then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;
  select e.id into v_emp from app.employees e
  where e.org_id = v_org and e.active and lower(e.entra_object_id) = v_object
  limit 1;
  if v_emp is null then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;
  insert into app.teams_conversations (employee_id, org_id, tenant_id, conversation_id, service_url, updated_at)
  values (v_emp, v_org, v_tenant, p_conversation, p_service_url, now())
  on conflict (employee_id) do update
    set org_id = excluded.org_id, tenant_id = excluded.tenant_id, conversation_id = excluded.conversation_id,
        service_url = excluded.service_url, updated_at = now();
  -- installed again: Teams may carry the link again
  delete from app.address_problems where employee_id = v_emp and channel = 'teams';
  return jsonb_build_object('ok', true, 'matched', true);
end $fn$;

-- The app was removed for a person (installationUpdate remove, or the bot left the 1:1 chat):
-- forget the conversation, and record that Teams does not reach them until it is installed again.
create function public.teams_conversation_clear(p_tenant text, p_object text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_tenant text := lower(btrim(coalesce(p_tenant, '')));
  v_object text := lower(btrim(coalesce(p_object, '')));
  v_org    uuid;
  v_emp    uuid;
begin
  if v_tenant !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_object !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select et.org_id into v_org from app.entra_tenants et where et.tenant_id = v_tenant;
  select e.id into v_emp from app.employees e
  where v_org is not null and e.org_id = v_org and lower(e.entra_object_id) = v_object
  limit 1;
  if v_emp is null then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;
  delete from app.teams_conversations where employee_id = v_emp;
  insert into app.address_problems (employee_id, channel, org_id, problem, at)
  values (v_emp, 'teams', v_org, 'blocked', now())
  on conflict (employee_id, channel) do update set problem = excluded.problem, at = excluded.at;
  return jsonb_build_object('ok', true, 'matched', true);
end $fn$;

-- The dispatcher's report on one Teams message: the conversation it created (kept for the next
-- message), or what Teams said about the person ('blocked' | 'invalid'), which also forgets the
-- conversation. Only a claimed personal row of an organisation with a bound tenant is accepted.
create function public.teams_dispatch_result(p_outbox uuid, p_conversation text default null,
                                             p_service_url text default null, p_problem text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_x      app.outbox;
  v_tenant text;
begin
  select * into v_x from app.outbox where id = p_outbox;
  if v_x.id is null or v_x.employee_id is null
     or v_x.kind not in ('invitasjon', 'paminnelse', 'siste_paminnelse') then
    return jsonb_build_object('ok', false, 'error', 'not_personal');
  end if;
  select et.tenant_id into v_tenant from app.entra_tenants et where et.org_id = v_x.org_id;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;
  if p_problem is not null then
    if p_problem not in ('blocked', 'invalid') then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    delete from app.teams_conversations where employee_id = v_x.employee_id;
    insert into app.address_problems (employee_id, channel, org_id, problem, at)
    values (v_x.employee_id, 'teams', v_x.org_id, p_problem::app.mail_delivery, now())
    on conflict (employee_id, channel) do update set problem = excluded.problem, at = excluded.at;
    return jsonb_build_object('ok', true);
  end if;
  if coalesce(p_conversation, '') !~ '^[!-~]+$' or char_length(p_conversation) > 512
     or coalesce(p_service_url, '') !~ '^https://smba\.trafficmanager\.net/[A-Za-z0-9._~/-]{0,200}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into app.teams_conversations (employee_id, org_id, tenant_id, conversation_id, service_url, updated_at)
  values (v_x.employee_id, v_x.org_id, v_tenant, p_conversation, p_service_url, now())
  on conflict (employee_id) do update
    set tenant_id = excluded.tenant_id, conversation_id = excluded.conversation_id,
        service_url = excluded.service_url, updated_at = now();
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.teams_conversation_set(text, text, text, text) from public, anon, authenticated;
revoke all on function public.teams_conversation_clear(text, text) from public, anon, authenticated;
revoke all on function public.teams_dispatch_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.teams_conversation_set(text, text, text, text) to service_role;
grant execute on function public.teams_conversation_clear(text, text) to service_role;
grant execute on function public.teams_dispatch_result(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------- what the leader sees: counts
-- Oppsett › Integrasjoner › Teams. The daglig leder only (who turns it on); anyone else null.
-- Counts, never names: how many active employees carry an object id, how many the bot has a
-- conversation with, and how many Teams could not reach, by reason, with the day of the latest.
create function public.teams_status(p_org uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select case when app.has_role(p_org, array['daglig_leder']::app.org_role[]) then jsonb_build_object(
    'tenant_bound', exists (select 1 from app.entra_tenants et where et.org_id = p_org),
    'active', (select count(*) from app.employees e where e.org_id = p_org and e.active),
    'with_object_id', (select count(*) from app.employees e
                       where e.org_id = p_org and e.active and e.entra_object_id is not null),
    'with_conversation', (select count(*) from app.teams_conversations tc
                          join app.employees e on e.id = tc.employee_id and e.active
                          join app.entra_tenants et on et.org_id = tc.org_id and et.tenant_id = tc.tenant_id
                          where tc.org_id = p_org),
    'blocked', (select count(*) from app.address_problems a join app.employees e on e.id = a.employee_id and e.active
                where a.org_id = p_org and a.channel = 'teams' and a.problem = 'blocked'),
    'unreachable', (select count(*) from app.address_problems a join app.employees e on e.id = a.employee_id and e.active
                    where a.org_id = p_org and a.channel = 'teams' and a.problem = 'invalid'),
    'last_problem_day', (select (max(a.at) at time zone 'Europe/Oslo')::date from app.address_problems a
                         where a.org_id = p_org and a.channel = 'teams'),
    'sent_30d', (select count(*) from app.outbox o
                 where o.org_id = p_org and o.channel = 'teams' and o.sent_at > now() - interval '30 days'))
  end
$fn$;
revoke all on function public.teams_status(uuid) from public, anon;
grant execute on function public.teams_status(uuid) to authenticated;

-- ---------------------------------------------------------------- recipients carry the Teams address
-- The return type changes, so the function is replaced (as 0033 did). 0108's body, with the
-- person's object id, the bound tenant and the bot's conversation with them where it has one. Only
-- a personal row carries them; a member or a role notice never does. A person with no address and
-- no number but an object id is a recipient now, so Teams can reach them.
drop function app.dispatch_recipients(uuid);

create function app.dispatch_recipients(p_outbox uuid)
  returns table (email text, phone text, name text, lang text, member boolean,
                 entra_object_id text, tenant_id text, conversation_id text, service_url text)
  language sql stable security definer set search_path = ''
as $fn$
  with x as (
    select * from app.outbox where id = p_outbox
  ),
  members as (
    select lower(u.email::text) as email, p.full_name as name, p.lang, m.role::text as role
    from x
    join app.memberships m on m.org_id = x.org_id and m.active
    join app.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
  ),
  scope as (
    select e.* from x
    join app.rounds r on r.id = x.round_id
    join app.employees e on e.org_id = r.org_id and e.active
    where not exists (select 1 from app.round_groups rg where rg.round_id = r.id)
       or e.group_id in (select rg.group_id from app.round_groups rg where rg.round_id = r.id)
  ),
  picked as (
    select nullif(lower(btrim(e.email)), '') as email, e.phone, e.full_name as name, e.language as lang, false as member,
           lower(e.entra_object_id) as entra_object_id, et.tenant_id,
           tc.conversation_id, tc.service_url
    from x
    join app.employees e on e.id = x.employee_id
    left join app.entra_tenants et on et.org_id = x.org_id
    left join app.teams_conversations tc on tc.employee_id = e.id and tc.tenant_id = et.tenant_id
    union all
    select mb.email, null, mb.name, mb.lang, true, null, null, null, null from members mb, x
    where (x.audience = 'daglig_leder' and mb.role = 'daglig_leder')
       or (x.audience = 'avdelingsledere' and mb.role = 'avdelingsleder')
       or (x.audience = 'verneombud' and mb.role = 'verneombud')
    union all
    -- 0108 (AUD-29): the people the register records in the duty, login or not
    select nullif(lower(btrim(e.email)), ''), null, e.full_name, e.language, false, null, null, null, null
    from x join app.employees e on e.org_id = x.org_id and e.active
    where (x.audience = 'daglig_leder' and e.duty_role = 'daglig_leder')
       or (x.audience = 'avdelingsledere' and e.duty_role = 'avdelingsleder')
       or (x.audience = 'verneombud' and e.duty_role = 'verneombud')
       or (x.audience = 'tillitsvalgte' and e.duty_role = 'tillitsvalgt')
    union all
    select nullif(lower(btrim(s.email)), ''), null, s.full_name, null, false, null, null, null, null from scope s, x
    where x.audience = 'alle_ansatte'
  )
  select distinct on (coalesce(email, phone, entra_object_id))
         email, phone, name, lang, member, entra_object_id, tenant_id, conversation_id, service_url
  from picked
  where email is not null or phone is not null or entra_object_id is not null
  order by coalesce(email, phone, entra_object_id), member desc
$fn$;

revoke all on function app.dispatch_recipients(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- done records 'teams'
create or replace function public.dispatch_done(
  p_id uuid, p_ok boolean, p_error text default null,
  p_permanent boolean default false, p_provider_id text default null,
  p_channel text default null)
  returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_ok then
    if p_channel is not null and p_channel not in ('email', 'sms', 'teams') then
      raise exception 'dispatch_done: unknown channel' using errcode = 'invalid_parameter_value';
    end if;
    update app.outbox
    set sent_at = now(), claimed_at = null, last_error = null,
        provider_id = left(p_provider_id, 200),
        -- 0176: recorded as given; null is e-mail, the only channel before 0033
        channel = coalesce(p_channel, 'email')
    where id = p_id and sent_at is null;

    update app.invitations i
    set sent_at = coalesce(i.sent_at, now())
    from app.outbox o
    where o.id = p_id and i.id = o.invitation_id;
  else
    update app.outbox
    set claimed_at = null,
        last_error = left(coalesce(p_error, 'failed'), 200),
        failed_at = case when p_permanent or attempts >= 5 then now() end
    where id = p_id and sent_at is null;
  end if;
end $fn$;

-- ---------------------------------------------------------------- the claim, the reset, the lists
-- Each a change to the definition as it stands, in place (as 0150 did), so this composes with
-- whatever else has rewritten them; a definition that no longer holds the text stops the migration.
do $$
declare
  r     record;
  v_def text;
begin
  for r in select * from (values
    (1, 'public.dispatch_claim(integer)',
        $a$  v_items   jsonb;$a$,
        $a$  v_items   jsonb;
  -- 0176: Teams
  v_object  text;
  v_teams   boolean;
  v_trule   text;$a$),
    (2, 'public.dispatch_claim(integer)',
        $a$org.sms_enabled, org.sms_when, org.sms_text, org.invite_greeting,$a$,
        $a$org.sms_enabled, org.sms_when, org.sms_text, org.invite_greeting,
           org.teams_enabled, org.teams_when, (select et.tenant_id from app.entra_tenants et where et.org_id = org.id) as tenant_id,$a$),
    (3, 'public.dispatch_claim(integer)',
        $a$ro.sms_when as round_sms_when,$a$,
        $a$ro.sms_when as round_sms_when, ro.teams_when as round_teams_when,$a$),
    (4, 'public.dispatch_claim(integer)',
        $a$      select case when d.email is null or app.reserved_address(d.email) then null else d.email end, d.phone
      into v_email, v_phone$a$,
        $a$      select case when d.email is null or app.reserved_address(d.email) then null else d.email end, d.phone, d.entra_object_id
      into v_email, v_phone, v_object$a$),
    (5, 'public.dispatch_claim(integer)',
        $a$      v_rule := coalesce(r.round_sms_when, v_org.sms_when);$a$,
        $a$      v_rule := coalesce(r.round_sms_when, v_org.sms_when);
      -- 0176: Teams when the organisation has it on and a tenant bound, the person an object id
      -- and nothing Teams said against them; the rule as SMS's
      v_teams := v_org.teams_enabled and v_org.tenant_id is not null and v_object is not null
                 and not exists (select 1 from app.address_problems ap
                                 where ap.employee_id = x.employee_id and ap.channel = 'teams');
      v_trule := coalesce(r.round_teams_when, v_org.teams_when);$a$),
    (6, 'public.dispatch_claim(integer)',
        $a$        v_channel := case
          when v_sms and (v_rule = 'alle'$a$,
        $a$        v_channel := case
          when v_teams and (v_trule = 'alle'
                            or (v_trule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))
                            or (v_trule = 'mangler' and v_email is null)) then 'teams'
          when v_sms and (v_rule = 'alle'$a$),
    (7, 'public.dispatch_claim(integer)',
        $a$                 'phone', case when v_sms then v_phone end,$a$,
        $a$                 'phone', case when v_sms then v_phone end,
                 -- 0176: whom the bot addresses, only when Teams carries the link
                 'teams', case when v_channel = 'teams' then jsonb_build_object(
                   'object_id', d.entra_object_id, 'tenant_id', d.tenant_id,
                   'conversation_id', d.conversation_id, 'service_url', d.service_url) end,$a$),
    -- the reset of a round's «utsending» section puts Teams back on the standard too
    (8, 'public.reset_round_settings(uuid,text)',
        $a$update app.rounds set sms_when = null where id = p_round;$a$,
        $a$update app.rounds set sms_when = null, teams_when = null where id = p_round;$a$),
    -- the daglig leder's list is of addresses and numbers to correct; Teams is counted elsewhere
    (9, 'public.address_problems(uuid)',
        $a$where a.org_id = p_org and e.active)$a$,
        $a$where a.org_id = p_org and e.active and a.channel <> 'teams')$a$),
    -- a demo's sending switches stay as they were made
    (10, 'app.demo_org_locked()',
        $a$(new.name, new.org_number, new.mail_enabled, new.sms_enabled)
         is distinct from (old.name, old.org_number, old.mail_enabled, old.sms_enabled)$a$,
        $a$(new.name, new.org_number, new.mail_enabled, new.sms_enabled, new.teams_enabled)
         is distinct from (old.name, old.org_number, old.mail_enabled, old.sms_enabled, old.teams_enabled)$a$)
  ) as t(seq, fn, old_text, new_text) order by seq loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in v_def) = 0 then
      raise exception '0176 (%): % does not hold «%»; read its definition and write this by hand', r.seq, r.fn, r.old_text;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end $$;

-- the claim's grants are the function's own and survive a replace; restated for the record
revoke all on function public.dispatch_claim(int) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;
revoke all on function public.dispatch_done(uuid, boolean, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.dispatch_done(uuid, boolean, text, boolean, text, text) to service_role;
