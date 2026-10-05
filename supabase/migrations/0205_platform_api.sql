-- 0205_platform_api.sql — the API a separate platform (admin, CRM, support) uses to steer Orgpuls
-- (X-104, docs/platform/PLAN.md § 5).
--
-- Tor, 2026-10-05: admin and CRM leave Orgpuls for a platform of their own, several products, its own
-- repository, database and domain, integrated through an API. "Gjør det som er mest naturlig — du kan
-- slette admin og bygge APIet." This migration is the API; 0206 removes admin.
--
-- Two directions, and nothing that names a respondent in either:
--
-- 1. Events, Orgpuls → platform. app.platform_emit is the only writer of app.platform_events, and it
--    refuses a field its kind does not list (app.platform_event_kinds). No kind lists an answer, a
--    comment, a conversation, a group's figure or anything about an employee but a count, so an event
--    cannot carry one; platform_api_invariants.sql proves the registry. Triggers on organisations,
--    memberships and billing, and a daily usage tick, emit. The dispatcher delivers them to the
--    installation's webhook, signed with HMAC-SHA256 under a secret kept in Vault.
--
-- 2. Commands, platform → Orgpuls. public.platform_command(token, command, args) is callable with the
--    project's public key: the token is the credential. It is an HS256 JWT signed with a second Vault
--    secret, at most five minutes long, for audience «orgpuls», carrying the admin (sub), the scopes and
--    a unique id; the database verifies it itself, so no service-role key leaves Orgpuls or enters the
--    app. A command is a row in app.platform_command_map naming one function and the scope it needs.
--    Every call that passes the signature is written to app.platform_commands (who, what, which
--    argument names, the outcome), and an id seen before is refused.
--
-- The existing operations (trial, cancellation, translations, modules, legal, site settings) run
-- unchanged: app.admin_role(), app.is_platform_admin() and app.admin_log() honour the platform actor a
-- command sets for its transaction. Until 0206 they also keep answering for the admin screens.

-- ---------------------------------------------------------------------------
-- secrets: made here, never printed; the platform's operator reads them from Vault once to configure it
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'orgpuls_platform_token_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'orgpuls_platform_token_secret',
                                'Verifies the platform''s command tokens (HS256, 0205). Shared with the platform only.');
  end if;
  if not exists (select 1 from vault.secrets where name = 'orgpuls_platform_webhook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'orgpuls_platform_webhook_secret',
                                'Signs events to the platform (HMAC-SHA256, 0205). Shared with the platform only.');
  end if;
end $$;

create function app.platform_secret(p_name text) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select s.decrypted_secret from vault.decrypted_secrets s
  where s.name = case p_name when 'token' then 'orgpuls_platform_token_secret'
                             when 'webhook' then 'orgpuls_platform_webhook_secret' end
$fn$;
revoke all on function app.platform_secret(text) from public, anon, authenticated;

-- the platform's address; one installation, off until it is set
create table app.platform_installation (
  id          boolean primary key default true check (id),
  webhook_url text check (webhook_url is null or (webhook_url ~ '^https://[^\s/]+(/[^\s]*)?$' and length(webhook_url) <= 500)),
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);
insert into app.platform_installation (id) values (true);
alter table app.platform_installation enable row level security;
revoke all on app.platform_installation from public, anon, authenticated, service_role;
comment on table app.platform_installation is
  'Where events go (0205): the platform''s webhook URL and whether delivery is on. Set by SQL when the platform exists.';

-- ---------------------------------------------------------------------------
-- 1 · events
create table app.platform_event_kinds (
  kind   text primary key check (kind ~ '^[a-z]+\.[a-z_]+$'),
  fields text[] not null,
  note   text not null
);
alter table app.platform_event_kinds enable row level security;
revoke all on app.platform_event_kinds from public, anon, authenticated, service_role;
comment on table app.platform_event_kinds is
  'The events Orgpuls sends the platform and the only fields each may carry (0205). Adding a field is a migration.';

insert into app.platform_event_kinds (kind, fields, note) values
  ('org.created', array['name', 'org_number', 'employee_count', 'industry', 'created_at'],
   'an organisation signed up'),
  ('org.deleted', array[]::text[],
   'an organisation and everything in it is gone'),
  ('org.attribution', array['source', 'medium', 'campaign', 'term', 'content', 'referrer_host', 'landing_path', 'heard'],
   'where the sign-up came from, as the person''s browser and answer said'),
  ('member.joined', array['user_id', 'role', 'email', 'name'],
   'a customer user (daglig leder, avdelingsleder, verneombud) joined: a customer contact, never a respondent'),
  ('member.left', array['user_id', 'role'],
   'a customer user was removed or deactivated'),
  ('billing.changed', array['plan', 'billing_interval', 'trial_started_at', 'trial_ends_at', 'confirmed_at',
                            'free_from', 'cancelled_at', 'cancel_effective_at', 'deletion_due_at'],
   'the subscription moved'),
  ('usage.daily', array['employees', 'members', 'rounds_planned', 'rounds_open', 'rounds_closed',
                        'last_round_closed_at', 'last_sign_in_at'],
   'counts per organisation, once a day; nothing about any answer or any group'),
  ('support.requested', array['category', 'subject', 'body', 'page', 'user_id', 'email', 'name'],
   'a customer user asked for help from Hjelp: their own words, not a respondent''s'),
  ('contact.submitted', array['topic', 'name', 'email', 'organisation', 'message'],
   'the public site''s contact form'),
  ('demo.requested', array['email', 'name', 'company', 'role'],
   'somebody asked for the demo');

create table app.platform_events (
  id           bigint generated always as identity primary key,
  kind         text not null references app.platform_event_kinds (kind),
  -- no foreign key: an org.deleted event outlives its organisation
  org_id       uuid,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  delivered_at timestamptz,
  attempts     int not null default 0,
  last_error   text check (length(last_error) <= 200)
);
create index platform_events_pending on app.platform_events (id) where delivered_at is null;
alter table app.platform_events enable row level security;
revoke all on app.platform_events from public, anon, authenticated, service_role;
comment on table app.platform_events is
  'Events waiting for, or delivered to, the platform (0205). Written only by app.platform_emit; delivered by the dispatcher; kept 30 days.';

/*
 * The one writer of platform_events. A field the kind does not list is refused, so what may leave
 * is decided by the registry above and nowhere else. Empty values are dropped.
 */
create function app.platform_emit(p_kind text, p_org uuid, p_payload jsonb) returns void
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_fields text[];
  v_bad    text;
  v_clean  jsonb;
begin
  select k.fields into v_fields from app.platform_event_kinds k where k.kind = p_kind;
  if v_fields is null then
    raise exception 'platform event % is not registered', p_kind using errcode = 'invalid_parameter_value';
  end if;
  select string_agg(key, ', ') into v_bad from jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) key where key <> all (v_fields);
  if v_bad is not null then
    raise exception 'platform event % may not carry %', p_kind, v_bad using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_clean
  from jsonb_each(coalesce(p_payload, '{}'::jsonb)) e where e.value <> 'null'::jsonb and e.value <> '""'::jsonb;
  -- a demo organisation is nobody's customer
  if p_org is not null and app.is_demo(p_org) then
    return;
  end if;
  insert into app.platform_events (kind, org_id, payload) values (p_kind, p_org, v_clean);
end $fn$;
revoke all on function app.platform_emit(text, uuid, jsonb) from public, anon, authenticated;

-- what emits: organisations, memberships and billing (beside the growth triggers 0206 removes)
create function app.platform_on_org() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    perform app.platform_emit('org.created', new.id, jsonb_build_object(
      'name', new.name, 'org_number', new.org_number, 'employee_count', new.employee_count,
      'industry', new.industry_key, 'created_at', new.created_at));
    return new;
  end if;
  -- what was queued about it goes with it (a member's address among it); the platform is told once
  delete from app.platform_events where org_id = old.id;
  perform app.platform_emit('org.deleted', old.id, '{}'::jsonb);
  return old;
end $fn$;
-- the delivery queue is a log like deletion_log: the count of an organisation's rows leaves it out, and
-- a demo copies none of it
do $$
declare v_def text := pg_get_functiondef('app.org_row_counts(uuid)'::regprocedure);
begin
  if position($a$c.relname not in ('deletion_log', 'admin_audit', 'crm_companies')$a$ in v_def) = 0 then
    raise exception '0205: org_row_counts does not hold its exclusion list; write this by hand';
  end if;
  execute replace(v_def, $a$c.relname not in ('deletion_log', 'admin_audit', 'crm_companies')$a$,
                         $a$c.relname not in ('deletion_log', 'admin_audit', 'crm_companies', 'platform_events')$a$);
end $$;
insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('platform_events', null, 'skip', null, 'events to the platform; a demo is nobody''s customer (0205)')
on conflict (table_name) do nothing;

create trigger platform_org_created after insert on app.organizations for each row execute function app.platform_on_org();
create trigger platform_org_deleted after delete on app.organizations for each row execute function app.platform_on_org();

create function app.platform_on_membership() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare v_email text; v_name text;
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.active and not new.active) then
    -- the organisation going takes its memberships with it; org.deleted says that once
    if exists (select 1 from app.organizations o where o.id = coalesce(new.org_id, old.org_id)) then
      perform app.platform_emit('member.left', old.org_id, jsonb_build_object('user_id', old.user_id, 'role', old.role));
    end if;
    return coalesce(new, old);
  end if;
  if new.active and (tg_op = 'INSERT' or not old.active) then
    select u.email::text into v_email from auth.users u where u.id = new.user_id;
    select p.full_name into v_name from app.profiles p where p.id = new.user_id;
    perform app.platform_emit('member.joined', new.org_id, jsonb_build_object(
      'user_id', new.user_id, 'role', new.role, 'email', v_email, 'name', v_name));
  end if;
  return new;
end $fn$;
create trigger platform_membership after insert or update of active or delete on app.memberships
  for each row execute function app.platform_on_membership();

create function app.platform_on_billing() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and (new.plan, new.billing_interval, new.trial_started_at, new.trial_ends_at, new.confirmed_at,
                           new.free_from, new.cancelled_at, new.cancel_effective_at, new.deletion_due_at)
                          is not distinct from
                          (old.plan, old.billing_interval, old.trial_started_at, old.trial_ends_at, old.confirmed_at,
                           old.free_from, old.cancelled_at, old.cancel_effective_at, old.deletion_due_at) then
    return new;
  end if;
  perform app.platform_emit('billing.changed', new.org_id, jsonb_build_object(
    'plan', new.plan, 'billing_interval', new.billing_interval, 'trial_started_at', new.trial_started_at,
    'trial_ends_at', new.trial_ends_at, 'confirmed_at', new.confirmed_at, 'free_from', new.free_from,
    'cancelled_at', new.cancelled_at, 'cancel_effective_at', new.cancel_effective_at, 'deletion_due_at', new.deletion_due_at));
  return new;
end $fn$;
create trigger platform_billing after insert or update on app.billing for each row execute function app.platform_on_billing();

/* Once a day, per organisation: counts, and when somebody last signed in. */
create function app.platform_usage_tick() returns int
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare r record; n int := 0;
begin
  for r in
    select o.id,
      (select count(*) from app.employees e where e.org_id = o.id and e.active) as employees,
      (select count(*) from app.memberships m where m.org_id = o.id and m.active) as members,
      (select count(*) from app.rounds x where x.org_id = o.id and x.status = 'planlagt') as rounds_planned,
      (select count(*) from app.rounds x where x.org_id = o.id and x.status = 'apen') as rounds_open,
      (select count(*) from app.rounds x where x.org_id = o.id and x.status = 'lukket') as rounds_closed,
      (select max(x.closes_at) from app.rounds x where x.org_id = o.id and x.status = 'lukket') as last_round_closed_at,
      (select max(u.last_sign_in_at) from app.memberships m join auth.users u on u.id = m.user_id
        where m.org_id = o.id and m.active) as last_sign_in_at
    from app.organizations o
    where not app.is_demo(o.id)
  loop
    perform app.platform_emit('usage.daily', r.id, jsonb_build_object(
      'employees', r.employees, 'members', r.members, 'rounds_planned', r.rounds_planned, 'rounds_open', r.rounds_open,
      'rounds_closed', r.rounds_closed, 'last_round_closed_at', r.last_round_closed_at, 'last_sign_in_at', r.last_sign_in_at));
    n := n + 1;
  end loop;
  return n;
end $fn$;
revoke all on function app.platform_usage_tick() from public, anon, authenticated;
select cron.schedule('orgpuls-platform-usage', '35 3 * * *', $c$ select app.platform_usage_tick() $c$);

/*
 * The dispatcher's side. Claim returns the due events, the installation's URL and the webhook secret
 * (to sign with), or nothing while no installation is enabled. Done records the outcome. Events older
 * than 30 days are dropped, delivered or not: the platform re-syncs from usage.daily.
 */
create function public.platform_events_claim(p_batch int default 50) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_url text; v_rows jsonb;
begin
  delete from app.platform_events where created_at < now() - interval '30 days';
  select i.webhook_url into v_url from app.platform_installation i where i.enabled and i.webhook_url is not null;
  if v_url is null then
    return jsonb_build_object('url', null, 'events', '[]'::jsonb);
  end if;
  with picked as (
    select e.id from app.platform_events e
    where e.delivered_at is null and (e.claimed_at is null or e.claimed_at < now() - interval '10 minutes')
      and e.attempts < 20
    order by e.id
    limit greatest(1, least(coalesce(p_batch, 50), 200))
    for update skip locked)
  , claimed as (
    update app.platform_events e set claimed_at = now(), attempts = e.attempts + 1
    from picked where e.id = picked.id
    returning e.id, e.kind, e.org_id, e.payload, e.created_at)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'org_id', c.org_id,
                                               'payload', c.payload, 'created_at', c.created_at) order by c.id), '[]'::jsonb)
  into v_rows from claimed c;
  return jsonb_build_object('url', v_url, 'secret', app.platform_secret('webhook'), 'events', v_rows);
end $fn$;

create function public.platform_events_done(p_ids bigint[], p_ok boolean, p_error text default null) returns void
  language sql volatile security definer set search_path = ''
as $fn$
  update app.platform_events e set
    delivered_at = case when p_ok then now() end,
    claimed_at   = case when p_ok then e.claimed_at end,
    last_error   = case when p_ok then null else left(p_error, 200) end
  where e.id = any (p_ids) and e.delivered_at is null;
$fn$;
revoke all on function public.platform_events_claim(int) from public, anon, authenticated;
revoke all on function public.platform_events_done(bigint[], boolean, text) from public, anon, authenticated;
grant execute on function public.platform_events_claim(int) to service_role;
grant execute on function public.platform_events_done(bigint[], boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2 · commands
create table app.platform_command_map (
  command text primary key check (command ~ '^[a-z]+\.[a-z_]+$'),
  scope   text not null check (scope ~ '^[a-z]+:(read|write)$'),
  fn      text not null,
  note    text not null
);
alter table app.platform_command_map enable row level security;
revoke all on app.platform_command_map from public, anon, authenticated, service_role;
comment on table app.platform_command_map is
  'What the platform may ask Orgpuls to do (0205): a command, the scope it needs and the one function it calls.';

create table app.platform_commands (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  jti       text not null unique check (length(jti) between 8 and 128),
  actor     text not null check (length(actor) between 1 and 254),
  command   text not null,
  scope     text not null,
  arg_names text[] not null,
  ok        boolean,
  error     text check (length(error) <= 240)
);
alter table app.platform_commands enable row level security;
revoke all on app.platform_commands from public, anon, authenticated, service_role;
comment on table app.platform_commands is
  'Every command the platform sent with a valid token (0205): who, what, which argument names, the outcome. Append-only; the outcome is set once.';

-- nobody may change what a row says; the outcome is written once, after the command ran
create function app.platform_commands_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'platform commands are kept' using errcode = 'restrict_violation';
  end if;
  if (new.id, new.at, new.jti, new.actor, new.command, new.scope, new.arg_names)
     is distinct from (old.id, old.at, old.jti, old.actor, old.command, old.scope, old.arg_names)
     or old.ok is not null then
    raise exception 'a platform command''s record is fixed' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;
create trigger platform_commands_fixed before update or delete on app.platform_commands
  for each row execute function app.platform_commands_fixed();

/* An HS256 JWT checked against the Vault secret; its claims, or null. */
create function app.platform_jwt_claims(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_parts  text[] := string_to_array(coalesce(p_token, ''), '.');
  v_secret text := app.platform_secret('token');
  v_sig    text;
  v_head   jsonb;
  v_claims jsonb;
  b64      text;
begin
  if v_secret is null or array_length(v_parts, 1) <> 3 or length(p_token) > 4096 then
    return null;
  end if;
  v_sig := rtrim(translate(encode(extensions.hmac(v_parts[1] || '.' || v_parts[2], v_secret, 'sha256'), 'base64'), E'+/\n', '-_'), '=');
  if v_sig <> v_parts[3] then
    return null;
  end if;
  b64 := translate(v_parts[1], '-_', '+/');
  v_head := convert_from(decode(b64 || repeat('=', (4 - length(b64) % 4) % 4), 'base64'), 'UTF8')::jsonb;
  b64 := translate(v_parts[2], '-_', '+/');
  v_claims := convert_from(decode(b64 || repeat('=', (4 - length(b64) % 4) % 4), 'base64'), 'UTF8')::jsonb;
  if v_head ->> 'alg' <> 'HS256'
     or v_claims ->> 'aud' <> 'orgpuls'
     or coalesce(v_claims ->> 'sub', '') = '' or length(v_claims ->> 'sub') > 254
     or coalesce(length(v_claims ->> 'jti'), 0) not between 8 and 128
     or (v_claims ->> 'exp')::bigint <= extract(epoch from now())
     or (v_claims ->> 'iat')::bigint > extract(epoch from now()) + 30
     or (v_claims ->> 'exp')::bigint - (v_claims ->> 'iat')::bigint > 300 then
    return null;
  end if;
  return v_claims;
exception when others then
  return null;
end $fn$;
revoke all on function app.platform_jwt_claims(text) from public, anon, authenticated;

/*
 * The platform's one way in. The token is checked before anything else; a command it does not
 * name, a scope it does not carry, or an id seen before is refused. The function runs with the
 * command's arguments by name — `args` is a JSON object whose keys are the function's parameters.
 */
create function public.platform_command(p_token text, p_command text, p_args jsonb default '{}'::jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_claims jsonb := app.platform_jwt_claims(p_token);
  v_map    app.platform_command_map%rowtype;
  v_fn     regprocedure;
  v_proc   record;
  v_call   text;
  v_id     bigint;
  v_result jsonb;
  v_args   jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if v_claims is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  select * into v_map from app.platform_command_map m where m.command = p_command;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_command');
  end if;
  if not (v_map.scope = any (string_to_array(coalesce(v_claims ->> 'scope', ''), ' '))) then
    return jsonb_build_object('ok', false, 'error', 'scope');
  end if;
  if jsonb_typeof(v_args) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_args');
  end if;

  begin
    insert into app.platform_commands (jti, actor, command, scope, arg_names)
    values (v_claims ->> 'jti', v_claims ->> 'sub', p_command, v_map.scope,
            array(select jsonb_object_keys(v_args) order by 1))
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'replay');
  end;

  perform set_config('app.platform_actor', v_claims ->> 'sub', true);

  -- the call, by parameter name; a parameter not given takes its default
  select p.oid::regprocedure as sig, p.proretset, p.proargnames, p.proargtypes::oid[] as types into v_proc
  from pg_proc p where p.oid = to_regprocedure(v_map.fn);
  if v_proc.sig is null then
    update app.platform_commands set ok = false, error = 'function missing' where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  select string_agg(format('%I => %s', a.name,
           case when a.typ = 'jsonb'::regtype then format('$1 -> %L', a.name)
                when a.typ = 'text[]'::regtype then format('array(select jsonb_array_elements_text($1 -> %L))', a.name)
                when a.typ = 'uuid[]'::regtype then format('array(select jsonb_array_elements_text($1 -> %L))::uuid[]', a.name)
                else format('($1 ->> %L)::%s', a.name, a.typ::regtype) end), ', ')
    into v_call
  from unnest(v_proc.proargnames[1:coalesce(array_length(v_proc.types, 1), 0)], v_proc.types) as a(name, typ)
  where v_args ? a.name;
  v_call := format('%s(%s)', regexp_replace(v_map.fn, '\(.*$', ''), coalesce(v_call, ''));

  begin
    if v_proc.proretset then
      execute format('select coalesce(jsonb_agg(x), ''[]''::jsonb) from %s x', v_call) into v_result using v_args;
    else
      execute format('select to_jsonb(%s)', v_call) into v_result using v_args;
    end if;
  exception when others then
    update app.platform_commands set ok = false, error = left(sqlstate || ' ' || sqlerrm, 240) where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'failed', 'sqlstate', sqlstate);
  end;
  update app.platform_commands set ok = true where id = v_id;
  return jsonb_build_object('ok', true, 'result', v_result);
end $fn$;
revoke all on function public.platform_command(text, text, jsonb) from public;
grant execute on function public.platform_command(text, text, jsonb) to anon, authenticated, service_role;

-- the operations honour the platform actor (and, until 0206, the admin screens)
create or replace function app.admin_role() returns app.platform_role
  language sql stable security definer set search_path = ''
as $fn$
  select case when coalesce(current_setting('app.platform_actor', true), '') <> '' then 'super_admin'::app.platform_role
         else (select a.role from app.platform_admins a
               where a.user_id = auth.uid() and a.active
                 and (not a.mfa_enforced or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')) end
$fn$;

create or replace function app.admin_log(p_action text, p_org uuid default null, p_target_type text default null,
                                         p_target_id text default null, p_reason text default null, p_detail jsonb default null)
  returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  -- a platform command is recorded in app.platform_commands
  if coalesce(current_setting('app.platform_actor', true), '') <> '' then
    return;
  end if;
  insert into app.admin_audit (admin_id, admin_email, admin_role, action, org_id, org_name, target_type, target_id, reason, detail)
  select auth.uid(), (select u.email::text from auth.users u where u.id = auth.uid()), app.admin_role(),
         p_action, p_org, (select o.name from app.organizations o where o.id = p_org), p_target_type, p_target_id,
         nullif(btrim(coalesce(p_reason, '')), ''), p_detail;
end $fn$;

-- two reads written for the platform: an organisation list and one organisation, counts and billing only
create function app.op_orgs_list(p_search text default null, p_limit int default 200) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select o.id, o.name, o.org_number, o.employee_count, o.industry_key as industry, o.created_at,
           app.org_access(o.id) as access, b.plan, b.billing_interval, b.trial_ends_at, b.confirmed_at, b.free_from,
           b.cancel_effective_at,
           (select count(*) from app.memberships m where m.org_id = o.id and m.active) as members,
           (select count(*) from app.employees e where e.org_id = o.id and e.active) as employees
    from app.organizations o left join app.billing b on b.org_id = o.id
    where not app.is_demo(o.id)
      and (coalesce(p_search, '') = '' or o.name ilike '%' || p_search || '%' or o.org_number = p_search)
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 1000))) x
$fn$;

create function app.op_org_get(p_org uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'id', o.id, 'name', o.name, 'org_number', o.org_number, 'employee_count', o.employee_count,
    'industry', o.industry_key, 'created_at', o.created_at, 'mail_enabled', o.mail_enabled, 'sms_enabled', o.sms_enabled,
    'access', app.org_access(o.id),
    'billing', (select to_jsonb(b) - 'invoice_ref' from app.billing b where b.org_id = o.id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'active', m.active,
                       'email', u.email, 'name', p.full_name, 'last_sign_in_at', u.last_sign_in_at) order by m.created_at), '[]'::jsonb)
                from app.memberships m join auth.users u on u.id = m.user_id left join app.profiles p on p.id = m.user_id
                where m.org_id = o.id),
    'employees', (select count(*) from app.employees e where e.org_id = o.id and e.active),
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'opens_at', r.opens_at,
                       'closes_at', r.closes_at) order by r.opens_at nulls last), '[]'::jsonb)
               from app.rounds r where r.org_id = o.id))
  from app.organizations o where o.id = p_org
$fn$;
revoke all on function app.op_orgs_list(text, int) from public, anon, authenticated;
revoke all on function app.op_org_get(uuid) from public, anon, authenticated;

insert into app.platform_command_map (command, scope, fn, note) values
  ('orgs.list',                  'orgs:read',          'app.op_orgs_list(text,integer)', 'organisations: name, billing, access, counts'),
  ('orgs.get',                   'orgs:read',          'app.op_org_get(uuid)', 'one organisation: billing, users, rounds, counts'),
  ('orgs.deletions',             'orgs:read',          'public.admin_deletions()', 'organisations due for deletion'),
  ('orgs.delete_now',            'orgs:write',         'public.admin_delete_now(uuid,text,text)', 'delete an organisation now'),
  ('billing.extend_trial',       'billing:write',      'public.admin_extend_trial(uuid,integer,text)', 'extend a trial'),
  ('billing.cancellation',       'billing:read',       'public.admin_org_cancellation(uuid)', 'a cancellation''s state'),
  ('billing.cancel',             'billing:write',      'public.admin_cancel_org(uuid,date,text)', 'cancel an organisation''s subscription'),
  ('billing.cancel_withdraw',    'billing:write',      'public.admin_cancel_withdraw(uuid,text)', 'withdraw a cancellation'),
  ('translations.list',          'translations:read',  'public.admin_translations(text)', 'a language''s translations'),
  ('translations.sources',       'translations:read',  'public.admin_translation_sources()', 'the module sources of the catalogue'),
  ('translations.history',       'translations:read',  'public.admin_translation_history(text,text)', 'one text''s history'),
  ('translations.import',        'translations:write', 'public.admin_translations_import(text,jsonb)', 'import checked rows'),
  ('translations.update',        'translations:write', 'public.admin_translation_update(text,text,text,text,jsonb)', 'move one text through the workflow'),
  ('translations.approve',       'translations:write', 'public.admin_translations_approve(text,text,text)', 'approve a language''s drafts'),
  ('translations.auto_approve',  'translations:read',  'public.admin_auto_approve()', 'whether drafts are approved as written'),
  ('translations.set_auto_approve', 'translations:write', 'public.admin_auto_approve_set(boolean)', 'turn auto-approve on or off'),
  ('overrides.list',             'translations:read',  'public.admin_message_overrides(text)', 'bokmål and English text overrides'),
  ('overrides.import',           'translations:write', 'public.admin_message_overrides_import(text,jsonb)', 'import overrides'),
  ('overrides.approve',          'translations:write', 'public.admin_message_overrides_approve(text,jsonb)', 'approve overrides'),
  ('modules.list',               'modules:read',       'public.admin_modules()', 'modules and versions'),
  ('modules.set_status',         'modules:write',      'public.admin_module_set_status(text,text,text,text)', 'publish or withdraw a version'),
  ('modules.set_validation',     'modules:write',      'public.admin_module_set_validation(text,text,text,text,text)', 'a version''s validation status'),
  ('modules.sync',               'modules:write',      'public.admin_module_sync(jsonb,text)', 'load a module file'),
  ('modules.pilot',              'modules:write',      'public.admin_module_pilot(text,text,uuid,boolean,text)', 'pilot a version in one organisation'),
  ('locales.pilots',             'modules:read',       'public.admin_locale_pilots()', 'language pilots'),
  ('locales.pilot',              'modules:write',      'public.admin_locale_pilot(text,uuid,boolean,text)', 'pilot a language in one organisation'),
  ('legal.reviews',              'legal:read',         'public.admin_legal_reviews()', 'legal reviews'),
  ('legal.review',               'legal:write',        'public.admin_legal_review(text,text,text)', 'record a review'),
  ('legal.set',                  'legal:write',        'public.admin_legal_set(text,text,boolean)', 'approve or withdraw a text'),
  ('legal.approvals',            'legal:read',         'public.admin_legal_approvals()', 'approved texts'),
  ('legal.auto_record',          'legal:write',        'public.admin_auto_record(jsonb,jsonb)', 'record automatic approvals'),
  ('settings.notice',            'settings:read',      'public.admin_site_notice()', 'the site notice'),
  ('settings.set_notice',        'settings:write',     'public.admin_site_notice_set(boolean,text,text)', 'set the site notice'),
  ('settings.set_indexing',      'settings:write',     'public.admin_site_indexing_set(boolean)', 'let search engines index the site');
