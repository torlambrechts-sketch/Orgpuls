-- 0165 — Employees and groups from Microsoft Entra ID, kept in sync (D-202).
--
-- Step 2 of the integration plan. Step 1 (0155) bound one Microsoft tenant to an organisation by
-- admin consent (app.entra_tenants). This imports the people in the groups the daglig leder picks
-- and keeps them in sync, through the Edge Function orgpuls-entra-sync, which reads Microsoft Graph
-- with application permissions (User.Read.All, GroupMember.Read.All — read only) and writes here
-- through the service-role RPCs below, one transaction per run.
--
-- What is imported, and nothing else: the display name, an address (mail, or a UPN that is a
-- mailbox), whether the account is enabled, membership of the selected groups, the preferred
-- language mapped onto the survey languages, and the mobile number only when the organisation
-- opted in (include_phone). Guests are left out. Manager, job title, employee id, office and photo
-- are never asked for.
--
-- The rules the database keeps, whatever a caller sends (proved in supabase/tests/entra_import_invariants.sql):
--   1. Nothing here deletes an employee or a group. Someone disabled, removed from the directory or
--      in none of the selected groups is set inactive. A deselected group is unmapped; its
--      app.groups row and history stay.
--   2. An answer's group is the employee's group at the moment it is submitted (submit_response
--      reads employees.group_id). While any round of the organisation is open (status 'apen'), a
--      run never changes an existing employee's group: the move is recorded in app.entra_deferred
--      and applied by the first run (or «Synkroniser nå») after no round is open, and at the start
--      of every run. The rounds are read FOR SHARE while a run applies, so a round cannot open
--      between the check and the move. New people may be added mid-round: invitations are made when
--      a round opens (wheel_tick, start_next_pulse) and request_link only resends existing ones, so
--      a newcomer gets no link to a round already open — unchanged here.
--   3. Deactivation is at once and does only `active = false`, as a manual deactivation does: an
--      unused invitation of the person stays valid (submit_response never checked active), so the
--      write path is untouched and nobody's answer can be refused for having left.
--   4. A person in more than one selected group gets the group the daglig leder ranked first
--      (entra_group_map.priority); the screen lists who that applies to.
--   5. A directory person is matched to the register by object id, and the first time by e-mail
--      (case-insensitive) among people not yet linked — the CSV-imported person becomes the synced
--      one. An address that belongs to someone else in the register is never imported or written
--      a second time: no duplicate person, and nobody invited twice.
--   6. A renamed Entra group renames its Orgpuls group through app.groups' own trigger, so
--      former_names keep masking comments (0130). A name already taken in the organisation is left.
--   7. Nothing here reads or writes responses, answers, extra_answers, response_comments,
--      invitations or token hashes. Small groups are shown under the round's threshold like any
--      other: the sync never merges or reshapes a group to make a figure appear.
--
-- In Ansatte, a synced person's name, address and active state come from the directory and a client
-- cannot change them (app.employees_entra_guard); the group may be set by hand, which pins it: the
-- sync leaves a pinned group alone until the daglig leder chooses «Følg Entra» (entra_follow_directory).
--
-- Delta links are held here and never shown to a client: every new table has RLS on and no client
-- policy or grant. The daglig leder reads a run's status (codes and counts, and the names of their
-- own employees where a move waits or a conflict was settled) through entra_sync_status.

-- ============================================================ 1. the register's new columns
alter table app.employees
  add column entra_object_id text
    check (entra_object_id is null or entra_object_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  add column source text not null default 'manual' check (source in ('manual', 'entra')),
  add column entra_group_pinned boolean not null default false;
alter table app.employees
  add constraint employees_entra_source check ((source = 'entra') = (entra_object_id is not null)),
  add constraint employees_entra_pinned check (not entra_group_pinned or source = 'entra');
create unique index employees_entra_object on app.employees (org_id, entra_object_id) where entra_object_id is not null;

comment on column app.employees.entra_object_id is
  'The person''s object id in the organisation''s Microsoft Entra tenant (0165): written by entra_sync_apply only, cleared when the sync is disconnected.';
comment on column app.employees.source is
  'manual (Ansatte, the CSV import) or entra (0165). An entra person''s name, e-mail and active state are the directory''s.';
comment on column app.employees.entra_group_pinned is
  'A synced person whose group the daglig leder set by hand (0165): the sync leaves the group alone until entra_follow_directory.';

-- A client (PostgREST as `authenticated`) writes employees under 0026's policies. What those cannot
-- say is said here: the Entra columns are the sync's alone, and a synced person's name, address and
-- active state are the directory's. A group set by hand pins it. The definer RPCs below run as the
-- owner and are not held by this.
create function app.employees_entra_guard() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.entra_object_id := null;
    new.source := 'manual';
    new.entra_group_pinned := false;
    return new;
  end if;
  new.entra_object_id := old.entra_object_id;
  new.source := old.source;
  if old.source = 'entra' then
    if new.full_name is distinct from old.full_name or new.email is distinct from old.email
       or new.active is distinct from old.active then
      raise exception 'entra_locked' using errcode = '42501',
        hint = 'a synced person''s name, e-mail and active state come from Microsoft Entra ID';
    end if;
    new.entra_group_pinned := old.entra_group_pinned or new.group_id is distinct from old.group_id;
  else
    new.entra_group_pinned := false;
  end if;
  return new;
end $fn$;
revoke all on function app.employees_entra_guard() from public, anon, authenticated;
create trigger employees_entra_guard before insert or update on app.employees
  for each row execute function app.employees_entra_guard();

-- ============================================================ 2. the sync's own tables
-- One row per organisation that set the import up; it can exist only while a tenant is bound, and
-- unbinding it (entra_unbind, 0155) takes the sync state with it.
create table app.entra_sync (
  org_id            uuid primary key references app.entra_tenants (org_id) on delete cascade,
  mode              text not null default 'nightly' check (mode in ('nightly', 'manual')),
  include_phone     boolean not null default false,
  users_delta_link  text check (users_delta_link is null or users_delta_link like 'https://graph.microsoft.com/v1.0/%'),
  group_delta_links text[] not null default '{}',
  links_at          timestamptz,
  full_needed       boolean not null default true,
  requested_at      timestamptz,
  requested_by      uuid references auth.users (id) on delete set null,
  run_id            uuid,
  run_status        text check (run_status in ('running', 'done', 'failed')),
  run_started_at    timestamptz,
  run_finished_at   timestamptz,
  run_error         text check (run_error is null or run_error ~ '^[a-z0-9_]{1,60}$'),
  run_counts        jsonb not null default '{}',
  created_at        timestamptz not null default now()
);
comment on table app.entra_sync is
  'The Entra import of one organisation (0165): its settings, Graph delta links (never shown to a client) and last run.';

-- An Entra group maps to exactly one Orgpuls group, and an Orgpuls group to at most one Entra group.
create table app.entra_group_map (
  org_id         uuid not null references app.entra_sync (org_id) on delete cascade,
  entra_group_id text not null check (entra_group_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  group_id       uuid not null unique references app.groups (id) on delete cascade,
  entra_name     text check (entra_name is null or char_length(entra_name) between 1 and 256),
  priority       int not null check (priority between 0 and 999),
  nested         boolean not null default false,
  primary key (org_id, entra_group_id)
);
comment on table app.entra_group_map is
  'Selected Entra groups (0165): the Orgpuls group each fills, its name in the directory at the last run, its rank when a person is in two, whether it nests groups.';

-- The selected groups' membership as Graph last reported it: object ids only, no names.
create table app.entra_members (
  org_id         uuid not null,
  entra_group_id text not null,
  object_id      text not null check (object_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  primary key (org_id, entra_group_id, object_id),
  foreign key (org_id, entra_group_id) references app.entra_group_map (org_id, entra_group_id) on delete cascade
);
create index entra_members_object on app.entra_members (org_id, object_id);

-- People in a selected group who are not imported, and why: a code per object id, no name.
create table app.entra_skips (
  org_id    uuid not null references app.entra_sync (org_id) on delete cascade,
  object_id text not null check (object_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  reason    text not null check (reason in ('guest', 'disabled', 'no_mailbox', 'no_name', 'email_taken', 'email_ambiguous', 'no_data')),
  primary key (org_id, object_id)
);

-- A group change held back while a round is open (rule 2).
create table app.entra_deferred (
  employee_id uuid primary key references app.employees (id) on delete cascade,
  org_id      uuid not null references app.entra_sync (org_id) on delete cascade,
  group_id    uuid not null references app.groups (id) on delete cascade,
  since       timestamptz not null default now()
);
create index entra_deferred_org on app.entra_deferred (org_id);

-- closed to every client: no policy and no grant; the RPCs below are the only way in or out
alter table app.entra_sync      enable row level security;
alter table app.entra_group_map enable row level security;
alter table app.entra_members   enable row level security;
alter table app.entra_skips     enable row level security;
alter table app.entra_deferred  enable row level security;
revoke all on app.entra_sync, app.entra_group_map, app.entra_members, app.entra_skips, app.entra_deferred
  from public, anon, authenticated;

-- a demo copy carries none of it: the import belongs to the real organisation's directory
insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('entra_sync', null, 'skip', null, 'the Entra import and its delta links belong to the real organisation (0165)'),
  ('entra_group_map', null, 'skip', null, 'which Entra groups are imported belongs to the real organisation (0165)'),
  ('entra_members', null, 'skip', null, 'the directory''s membership mirror belongs to the real organisation (0165)'),
  ('entra_skips', null, 'skip', null, 'who in the directory was not imported belongs to the real organisation (0165)'),
  ('entra_deferred', null, 'skip', null, 'group moves waiting for a round to close belong to the real organisation (0165)');

-- Disconnecting (or unbinding the tenant, which cascades here) releases the synced people: they stay
-- in the register as ordinary people, without their directory id, and can be edited in Ansatte again.
-- When the organisation itself is being deleted its employees go with it and there is nothing to release.
create function app.entra_sync_released() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.organizations o where o.id = old.org_id) then
    return old;
  end if;
  update app.employees
  set source = 'manual', entra_object_id = null, entra_group_pinned = false
  where org_id = old.org_id and source = 'entra';
  return old;
end $fn$;
revoke all on function app.entra_sync_released() from public, anon, authenticated;
create trigger entra_sync_released after delete on app.entra_sync
  for each row execute function app.entra_sync_released();

-- ============================================================ 3. the rules, once
create function app.entra_round_open(p_org uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from app.rounds r where r.org_id = p_org and r.status = 'apen')
$fn$;

-- The group a person belongs in: of the selected groups they are in, the one ranked first.
create function app.entra_desired_group(p_org uuid, p_object text) returns uuid
  language sql stable security definer set search_path = ''
as $fn$
  select m.group_id
  from app.entra_members em
  join app.entra_group_map m on m.org_id = em.org_id and m.entra_group_id = em.entra_group_id
  where em.org_id = p_org and em.object_id = p_object
  order by m.priority, m.entra_group_id
  limit 1
$fn$;

-- Puts a synced person in their group: at once when no round is open, otherwise held in
-- app.entra_deferred. A pinned group is left alone. Returns what happened.
create function app.entra_place(p_org uuid, p_object text) returns text
  language plpgsql security definer set search_path = ''
as $fn$
declare
  e app.employees;
  v_to uuid;
begin
  select * into e from app.employees x where x.org_id = p_org and x.entra_object_id = p_object for update;
  if not found then
    return 'none';
  end if;
  v_to := app.entra_desired_group(p_org, p_object);
  if v_to is null then
    return 'none';
  end if;
  if e.entra_group_pinned then
    delete from app.entra_deferred d where d.employee_id = e.id;
    return 'pinned';
  end if;
  if e.group_id is not distinct from v_to then
    delete from app.entra_deferred d where d.employee_id = e.id;
    return 'same';
  end if;
  if app.entra_round_open(p_org) then
    insert into app.entra_deferred as d (employee_id, org_id, group_id) values (e.id, p_org, v_to)
    on conflict (employee_id) do update
      set group_id = excluded.group_id,
          since = case when d.group_id = excluded.group_id then d.since else now() end;
    return 'deferred';
  end if;
  update app.employees set group_id = v_to where id = e.id;
  delete from app.entra_deferred d where d.employee_id = e.id;
  return 'moved';
end $fn$;

-- The moves an open round held back, once none is open. Each is placed again from the mirror as it
-- is now, so a move the directory took back since is not made.
create function app.entra_apply_deferred(p_org uuid) returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r record;
  v_n int := 0;
begin
  if app.entra_round_open(p_org) then
    return 0;
  end if;
  for r in select d.employee_id, e.entra_object_id from app.entra_deferred d
           left join app.employees e on e.id = d.employee_id
           where d.org_id = p_org loop
    if r.entra_object_id is null or app.entra_place(p_org, r.entra_object_id) <> 'moved' then
      delete from app.entra_deferred d where d.employee_id = r.employee_id;
    else
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $fn$;

revoke all on function app.entra_round_open(uuid), app.entra_desired_group(uuid, text), app.entra_place(uuid, text),
  app.entra_apply_deferred(uuid) from public, anon, authenticated;

-- ============================================================ 4. asking the function to run
-- Like the Brønnøysund poll (0143): the function's URL is the dispatcher's with the function's name,
-- with the dispatcher's secret, both from the vault. Without them nothing is asked.
create function app.entra_request(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_url text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'orgpuls_dispatch_url');
  v_secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'orgpuls_dispatch_secret');
begin
  if v_url is null or v_secret is null then
    return jsonb_build_object('ok', false, 'error', 'not_configured');
  end if;
  perform net.http_post(
    url := replace(v_url, 'orgpuls-dispatch', 'orgpuls-entra-sync'),
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body := case when p_org is null then '{}'::jsonb else jsonb_build_object('org_id', p_org) end,
    timeout_milliseconds := 150000);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function app.entra_request(uuid) from public, anon, authenticated;

-- which organisations a call should run: those asked for, and the nightly ones not run for 20 hours
create function app.entra_due(p_org uuid) returns uuid[]
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(array_agg(s.org_id order by s.requested_at nulls last, s.run_started_at nulls first), '{}')
  from app.entra_sync s
  where (p_org is null or s.org_id = p_org)
    and exists (select 1 from app.entra_group_map m where m.org_id = s.org_id)
    and not (s.run_status = 'running' and s.run_started_at > now() - interval '1 hour')
    and (s.requested_at is not null
         or (s.mode = 'nightly' and coalesce(s.run_started_at, '-infinity'::timestamptz) < now() - interval '20 hours'))
$fn$;
revoke all on function app.entra_due(uuid) from public, anon, authenticated;

create function app.entra_sync_cron() returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if cardinality(app.entra_due(null)) > 0 then
    perform app.entra_request(null);
  end if;
end $fn$;
revoke all on function app.entra_sync_cron() from public, anon, authenticated;

-- Nightly at 03:40 Oslo in summer (01:40 UTC). Inert until the vault holds the function's URL and
-- secret, as every scheduled call is (0032): a local stack or CI never calls out.
select cron.schedule('orgpuls-entra-sync', '40 1 * * *', $job$ select app.entra_sync_cron() $job$);

-- ============================================================ 5. the Edge Function's entry points (service role only)
create function public.entra_sync_due(p_org uuid default null) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('ok', true, 'orgs', to_jsonb(app.entra_due(p_org)))
$fn$;

-- A run begins: the moves an open round held back are made if none is open now, and the state the
-- planner needs comes back — the mapping, the membership mirror, the register (for e-mail matching)
-- and the delta links. This is the one place a delta link leaves the database, and only to the
-- service role.
create function public.entra_sync_begin(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  s app.entra_sync;
  v_tenant text;
  v_run uuid := gen_random_uuid();
  v_applied int;
begin
  select * into s from app.entra_sync x where x.org_id = p_org for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_set_up');
  end if;
  select t.tenant_id into v_tenant from app.entra_tenants t where t.org_id = p_org;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;
  if s.run_status = 'running' and s.run_started_at > now() - interval '1 hour' then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  if not exists (select 1 from app.entra_group_map m where m.org_id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'no_groups');
  end if;
  perform 1 from app.rounds r where r.org_id = p_org for share;
  v_applied := app.entra_apply_deferred(p_org);
  update app.entra_sync
  set run_id = v_run, run_status = 'running', run_started_at = now(), run_finished_at = null, run_error = null,
      run_counts = jsonb_build_object('applied_deferred', v_applied), requested_at = null
  where org_id = p_org;
  return jsonb_build_object(
    'ok', true,
    'org_id', p_org,
    'run_id', v_run,
    'tenant_id', v_tenant,
    'include_phone', s.include_phone,
    'round_open', app.entra_round_open(p_org),
    'full', s.full_needed or s.users_delta_link is null or s.links_at is null or s.links_at < now() - interval '6 days',
    'users_link', s.users_delta_link,
    'group_links', to_jsonb(s.group_delta_links),
    'mappings', coalesce((select jsonb_agg(jsonb_build_object('entra_group_id', m.entra_group_id, 'group_id', m.group_id,
                            'priority', m.priority, 'nested', m.nested, 'entra_name', m.entra_name) order by m.priority)
                          from app.entra_group_map m where m.org_id = p_org), '[]'),
    'members', coalesce((select jsonb_agg(jsonb_build_array(em.entra_group_id, em.object_id))
                         from app.entra_members em where em.org_id = p_org), '[]'),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'object_id', e.entra_object_id, 'email', e.email,
                             'full_name', e.full_name, 'group_id', e.group_id, 'active', e.active, 'pinned', e.entra_group_pinned,
                             'language', e.language, 'phone', e.phone))
                           from app.employees e where e.org_id = p_org), '[]'),
    'deferred', coalesce((select jsonb_agg(jsonb_build_object('employee_id', d.employee_id, 'group_id', d.group_id))
                          from app.entra_deferred d where d.org_id = p_org), '[]'));
end $fn$;

-- A run's whole plan, in one transaction. The plan is the planner's (supabase/functions/_shared/entra.ts);
-- every rule in this file's header is checked here again, so a wrong plan can do no more than skip.
create function public.entra_sync_apply(p_org uuid, p_run uuid, p_plan jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  s app.entra_sync;
  x jsonb;
  k text;
  v_guid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_oid text;
  v_name text;
  v_email text;
  v_lang text;
  v_phone text;
  v_emp app.employees;
  v_n int;
  v_place text;
  v_gid uuid;
  c_added int := 0; c_linked int := 0; c_updated int := 0; c_deactivated int := 0;
  c_moved int := 0; c_deferred int := 0; c_renamed int := 0; c_rename_conflicts int := 0;
  v_skipped jsonb := '{}';
  v_counts jsonb;
  v_new jsonb := '[]';
  v_touch text[] := '{}';
begin
  select * into s from app.entra_sync x0 where x0.org_id = p_org for update;
  if not found or s.run_id is distinct from p_run or s.run_status is distinct from 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_running');
  end if;
  if jsonb_typeof(p_plan) <> 'object'
     or jsonb_array_length(coalesce(p_plan->'people', '[]')) > 20000
     or jsonb_array_length(coalesce(p_plan->'members'->'add', '[]')) > 50000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- no round of this organisation can open while the plan is applied (rule 2)
  perform 1 from app.rounds r where r.org_id = p_org for share;

  -- ---- the groups: renames (through app.groups' own trigger, rule 6), nesting
  for x in select value from jsonb_array_elements(coalesce(p_plan->'groups', '[]')) loop
    continue when coalesce(x->>'id', '') !~ v_guid;
    if jsonb_typeof(x->'nested') = 'boolean' then
      update app.entra_group_map set nested = (x->>'nested')::boolean where org_id = p_org and entra_group_id = x->>'id';
    end if;
    v_name := left(btrim(regexp_replace(coalesce(x->>'name', ''), '\s+', ' ', 'g')), 60);
    v_name := btrim(v_name);
    if v_name <> '' then
      select m.group_id into v_gid from app.entra_group_map m where m.org_id = p_org and m.entra_group_id = x->>'id';
      if v_gid is not null then
        update app.entra_group_map set entra_name = left(btrim(x->>'name'), 256) where org_id = p_org and entra_group_id = x->>'id';
        if exists (select 1 from app.groups g where g.org_id = p_org and lower(g.name) = lower(v_name) and g.id <> v_gid) then
          c_rename_conflicts := c_rename_conflicts + 1;
        else
          update app.groups set name = v_name where id = v_gid and name is distinct from v_name;
          if found then c_renamed := c_renamed + 1; end if;
        end if;
      end if;
    end if;
  end loop;

  -- ---- the membership mirror: whole groups replaced, delta changes, removed users
  for k in select jsonb_object_keys(coalesce(p_plan->'members'->'replace', '{}')) loop
    continue when not exists (select 1 from app.entra_group_map m where m.org_id = p_org and m.entra_group_id = k);
    delete from app.entra_members em where em.org_id = p_org and em.entra_group_id = k;
    insert into app.entra_members (org_id, entra_group_id, object_id)
    select distinct p_org, k, o from jsonb_array_elements_text(p_plan->'members'->'replace'->k) o where o ~ v_guid
    on conflict do nothing;
  end loop;
  delete from app.entra_members em
  using jsonb_array_elements(coalesce(p_plan->'members'->'remove', '[]')) r
  where em.org_id = p_org and em.entra_group_id = r->>0 and em.object_id = r->>1;
  insert into app.entra_members (org_id, entra_group_id, object_id)
  select distinct p_org, a->>0, a->>1 from jsonb_array_elements(coalesce(p_plan->'members'->'add', '[]')) a
  where a->>1 ~ v_guid and exists (select 1 from app.entra_group_map m where m.org_id = p_org and m.entra_group_id = a->>0)
  on conflict do nothing;
  delete from app.entra_members em
  where em.org_id = p_org and em.object_id in (select jsonb_array_elements_text(coalesce(p_plan->'removedUsers', '[]')));

  -- ---- people: added, linked (the first time, by e-mail), updated
  for x in select value from jsonb_array_elements(coalesce(p_plan->'people', '[]')) loop
    v_oid := x->>'objectId';
    continue when coalesce(v_oid, '') !~ v_guid or x->>'op' not in ('add', 'link', 'update');
    -- in none of the selected groups: nobody is added or brought back for that
    continue when not exists (select 1 from app.entra_members em where em.org_id = p_org and em.object_id = v_oid);
    v_name := nullif(left(btrim(regexp_replace(coalesce(x->>'fullName', ''), '\s+', ' ', 'g')), 120), '');
    v_email := nullif(btrim(coalesce(x->>'email', '')), '');
    if v_email is not null and (v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254) then
      v_email := null;
    end if;
    v_lang := case when x->>'language' in ('no', 'en', 'pl', 'uk', 'lt', 'sv', 'da') then x->>'language' end;
    v_phone := case when s.include_phone and x->>'phone' ~ '^\+[1-9][0-9]{7,14}$' then x->>'phone' end;

    select * into v_emp from app.employees e where e.org_id = p_org and e.entra_object_id = v_oid for update;
    if not found and x->>'op' = 'link' then
      select * into v_emp from app.employees e
      where e.org_id = p_org and e.id::text = x->>'employeeId' and e.entra_object_id is null
        and v_email is not null and lower(e.email) = lower(v_email)
      for update;
      if found then
        -- linked, never duplicated; and only if no other person in the register has the address (rule 5)
        if exists (select 1 from app.employees e where e.org_id = p_org and e.id <> v_emp.id and lower(e.email) = lower(v_email)) then
          v_skipped := jsonb_set(v_skipped, '{email_ambiguous}', to_jsonb(coalesce((v_skipped->>'email_ambiguous')::int, 0) + 1));
          insert into app.entra_skips (org_id, object_id, reason) values (p_org, v_oid, 'email_ambiguous')
          on conflict (org_id, object_id) do update set reason = excluded.reason;
          continue;
        end if;
        update app.employees
        set entra_object_id = v_oid, source = 'entra', entra_group_pinned = false,
            full_name = coalesce(v_name, full_name), email = v_email,
            language = coalesce(v_lang, language), phone = coalesce(v_phone, phone),
            active = active or coalesce((x->>'activate')::boolean, false)
        where id = v_emp.id;
        c_linked := c_linked + 1;
        v_touch := v_touch || v_oid;
      else
        v_skipped := jsonb_set(v_skipped, '{email_taken}', to_jsonb(coalesce((v_skipped->>'email_taken')::int, 0) + 1));
        insert into app.entra_skips (org_id, object_id, reason) values (p_org, v_oid, 'email_taken')
        on conflict (org_id, object_id) do update set reason = excluded.reason;
      end if;
      continue;
    end if;

    if not found then
      -- a new person: needs a name and an address nobody in the register has (rule 5)
      continue when x->>'op' <> 'add' or v_name is null or v_email is null;
      select count(*) into v_n from app.employees e where e.org_id = p_org and lower(e.email) = lower(v_email);
      if v_n > 0 or exists (select 1 from jsonb_array_elements(v_new) y where lower(y->>'email') = lower(v_email) or y->>'oid' = v_oid) then
        v_skipped := jsonb_set(v_skipped, '{email_taken}', to_jsonb(coalesce((v_skipped->>'email_taken')::int, 0) + 1));
        insert into app.entra_skips (org_id, object_id, reason) values (p_org, v_oid, 'email_taken')
        on conflict (org_id, object_id) do update set reason = excluded.reason;
        continue;
      end if;
      v_new := v_new || jsonb_build_object('oid', v_oid, 'name', v_name, 'email', v_email, 'lang', v_lang, 'phone', v_phone);
      continue;
    end if;

    -- an update of a linked person: what the directory says now
    if v_email is not null and lower(v_email) is distinct from lower(v_emp.email)
       and (exists (select 1 from app.employees e where e.org_id = p_org and e.id <> v_emp.id and lower(e.email) = lower(v_email))
            or exists (select 1 from jsonb_array_elements(v_new) y where lower(y->>'email') = lower(v_email))) then
      v_skipped := jsonb_set(v_skipped, '{email_taken}', to_jsonb(coalesce((v_skipped->>'email_taken')::int, 0) + 1));
      v_email := null;
    end if;
    update app.employees
    set full_name = coalesce(v_name, full_name), email = coalesce(v_email, email),
        language = coalesce(v_lang, language), phone = coalesce(v_phone, phone),
        active = active or coalesce((x->>'activate')::boolean, false)
    where id = v_emp.id
      and (full_name is distinct from coalesce(v_name, full_name) or email is distinct from coalesce(v_email, email)
           or language is distinct from coalesce(v_lang, language) or phone is distinct from coalesce(v_phone, phone)
           or (not active and coalesce((x->>'activate')::boolean, false)));
    if found then c_updated := c_updated + 1; end if;
  end loop;
  -- the new people in one statement: one «employees.imported» event per run, as one CSV paste makes
  insert into app.employees (org_id, full_name, email, language, phone, group_id, source, entra_object_id, active)
  select p_org, r.name, r.email, r.lang, r.phone, app.entra_desired_group(p_org, r.oid), 'entra', r.oid, true
  from jsonb_to_recordset(v_new) as r(oid text, name text, email text, lang text, phone text);
  get diagnostics c_added = row_count;

  -- ---- deactivations at once (rule 3): only active = false, nothing else about the person
  for x in select value from jsonb_array_elements(coalesce(p_plan->'deactivate', '[]')) loop
    continue when coalesce(x->>'objectId', '') !~ v_guid;
    update app.employees set active = false where org_id = p_org and entra_object_id = x->>'objectId' and active;
    if found then c_deactivated := c_deactivated + 1; end if;
  end loop;
  -- and whoever is in none of the selected groups any more, whatever the plan said (rule 1)
  with gone as (
    update app.employees e set active = false
    where e.org_id = p_org and e.source = 'entra' and e.active
      and not exists (select 1 from app.entra_members em where em.org_id = p_org and em.object_id = e.entra_object_id)
    returning 1)
  select c_deactivated + count(*) into c_deactivated from gone;

  -- ---- groups: re-derived from the mirror; held back while a round is open (rule 2)
  for v_oid in select distinct o from (select jsonb_array_elements_text(coalesce(p_plan->'place', '[]')) o
                                      union select unnest(v_touch)) z loop
    continue when v_oid !~ v_guid;
    v_place := app.entra_place(p_org, v_oid);
    if v_place = 'moved' then c_moved := c_moved + 1; elsif v_place = 'deferred' then c_deferred := c_deferred + 1; end if;
  end loop;
  c_moved := c_moved + app.entra_apply_deferred(p_org);

  -- ---- who is not imported, and why: kept for people still in a selected group
  delete from app.entra_skips sk
  where sk.org_id = p_org and sk.object_id in (select jsonb_array_elements_text(coalesce(p_plan->'skips'->'clear', '[]')));
  insert into app.entra_skips as sk (org_id, object_id, reason)
  select p_org, r->>'objectId', r->>'reason' from jsonb_array_elements(coalesce(p_plan->'skips'->'set', '[]')) r
  where r->>'objectId' ~ v_guid
    and r->>'reason' in ('guest', 'disabled', 'no_mailbox', 'no_name', 'email_taken', 'email_ambiguous', 'no_data')
  on conflict (org_id, object_id) do update set reason = excluded.reason;
  delete from app.entra_skips sk
  where sk.org_id = p_org
    and (not exists (select 1 from app.entra_members em where em.org_id = p_org and em.object_id = sk.object_id)
         or exists (select 1 from app.employees e where e.org_id = p_org and e.entra_object_id = sk.object_id));

  -- ---- the run's end: links saved only now, with everything they describe
  for k, x in select key, value from jsonb_each(coalesce(p_plan->'predicted'->'skipped', '{}')) loop
    if k in ('guest', 'disabled', 'no_mailbox', 'no_name', 'email_taken', 'email_ambiguous', 'no_data') and jsonb_typeof(x) = 'number' then
      v_skipped := jsonb_set(v_skipped, array[k], to_jsonb(coalesce((v_skipped->>k)::int, 0) + (x::text)::int));
    end if;
  end loop;
  v_counts := jsonb_build_object(
    'added', c_added, 'linked', c_linked, 'updated', c_updated, 'deactivated', c_deactivated,
    'moved', c_moved, 'deferred', c_deferred, 'renamed', c_renamed, 'rename_conflicts', c_rename_conflicts,
    'conflicts', jsonb_array_length(coalesce(p_plan->'conflicts', '[]')),
    'applied_deferred', coalesce((s.run_counts->>'applied_deferred')::int, 0),
    'skipped', v_skipped,
    'full', coalesce((p_plan->'links'->>'full')::boolean, false));
  update app.entra_sync
  set users_delta_link = case when p_plan->'links'->>'users' like 'https://graph.microsoft.com/v1.0/%' then p_plan->'links'->>'users' else users_delta_link end,
      group_delta_links = coalesce((select array_agg(l) from jsonb_array_elements_text(coalesce(p_plan->'links'->'groups', '[]')) l
                                    where l like 'https://graph.microsoft.com/v1.0/%'), '{}'),
      links_at = now(), full_needed = false,
      run_status = 'done', run_finished_at = now(), run_error = null, run_counts = v_counts
  where org_id = p_org;
  return jsonb_build_object('ok', true, 'counts', v_counts - 'skipped' - 'full');
end $fn$;

create function public.entra_sync_fail(p_org uuid, p_run uuid, p_error text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  update app.entra_sync
  set run_status = 'failed', run_finished_at = now(),
      run_error = case when p_error ~ '^[a-z0-9_]{1,60}$' then p_error else 'failed' end,
      -- an expired or refused delta link is read whole next time
      full_needed = full_needed or p_error in ('resync', 'delta_incomplete')
  where org_id = p_org and run_id = p_run and run_status = 'running';
  return jsonb_build_object('ok', found);
end $fn$;

-- ============================================================ 6. the daglig leder's (each checks the role itself)
-- The picker's role check: the Edge Function calls this as the caller, with their own token.
create function public.entra_group_search_target(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_tenant text;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select t.tenant_id into v_tenant from app.entra_tenants t where t.org_id = p_org;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;
  return jsonb_build_object('ok', true, 'tenant_id', v_tenant);
end $fn$;

-- What the Entra screen shows: settings, the last run's codes and counts, the selected groups, who
-- waits for a round to close, who is in two groups, and how many are not imported and why. Never a
-- delta link. Names are the organisation's own employees', for its daglig leder.
create function public.entra_sync_status(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  s app.entra_sync;
  v_tenant text;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select t.tenant_id into v_tenant from app.entra_tenants t where t.org_id = p_org;
  select * into s from app.entra_sync x where x.org_id = p_org;
  return jsonb_build_object(
    'ok', true,
    'bound', v_tenant is not null,
    'set_up', s.org_id is not null,
    'function_ready', exists (select 1 from vault.decrypted_secrets v where v.name = 'orgpuls_dispatch_url')
                      and exists (select 1 from vault.decrypted_secrets v where v.name = 'orgpuls_dispatch_secret'),
    'mode', coalesce(s.mode, 'nightly'),
    'include_phone', coalesce(s.include_phone, false),
    'requested_at', s.requested_at,
    'round_open', app.entra_round_open(p_org),
    'run', case when s.run_status is null then null else jsonb_build_object(
      'status', s.run_status, 'started_at', s.run_started_at, 'finished_at', s.run_finished_at,
      'error', s.run_error, 'counts', s.run_counts) end,
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'entra_group_id', m.entra_group_id, 'group_id', m.group_id, 'name', g.name, 'entra_name', m.entra_name,
        'priority', m.priority, 'nested', m.nested,
        'members', (select count(*) from app.entra_members em where em.org_id = p_org and em.entra_group_id = m.entra_group_id),
        'active', (select count(*) from app.employees e where e.org_id = p_org and e.group_id = m.group_id and e.active))
        order by m.priority)
      from app.entra_group_map m join app.groups g on g.id = m.group_id where m.org_id = p_org), '[]'),
    'synced', (select count(*) from app.employees e where e.org_id = p_org and e.source = 'entra' and e.active),
    'synced_inactive', (select count(*) from app.employees e where e.org_id = p_org and e.source = 'entra' and not e.active),
    'pinned', (select count(*) from app.employees e where e.org_id = p_org and e.entra_group_pinned),
    'deferred', coalesce((select jsonb_agg(jsonb_build_object(
        'employee_id', d.employee_id, 'name', e.full_name, 'from', gf.name, 'to', gt.name, 'since', d.since) order by e.full_name)
      from app.entra_deferred d join app.employees e on e.id = d.employee_id
      left join app.groups gf on gf.id = e.group_id join app.groups gt on gt.id = d.group_id
      where d.org_id = p_org), '[]'),
    'conflicts', coalesce((select jsonb_agg(c order by c->>'name') from (
        select jsonb_build_object('employee_id', e.id, 'name', e.full_name,
                 'groups', (select jsonb_agg(g.name order by m.priority) from app.entra_members em
                            join app.entra_group_map m on m.org_id = em.org_id and m.entra_group_id = em.entra_group_id
                            join app.groups g on g.id = m.group_id
                            where em.org_id = p_org and em.object_id = e.entra_object_id),
                 'chosen', (select g.name from app.groups g where g.id = app.entra_desired_group(p_org, e.entra_object_id))) as c
        from app.employees e
        where e.org_id = p_org and e.source = 'entra' and e.active
          and (select count(*) from app.entra_members em where em.org_id = p_org and em.object_id = e.entra_object_id) > 1) z), '[]'),
    'skipped', coalesce((select jsonb_object_agg(z.reason, z.n) from (
        select sk.reason, count(*) as n from app.entra_skips sk where sk.org_id = p_org group by sk.reason) z), '{}'));
end $fn$;

-- The groups to import, in the order that settles a person in two (first wins). A group new to the
-- list fills the Orgpuls group of the same name (case-insensitive) if there is one nobody else maps,
-- or a new group with the directory's name; a group left out is unmapped, and its Orgpuls group and
-- history stay. The next run reads everything whole.
create function public.entra_select_groups(p_org uuid, p_groups jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  x jsonb;
  i int := 0;
  v_guid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_name text;
  v_gid uuid;
  v_ids text[] := '{}';
  v_taken text[] := '{}';
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.entra_tenants t where t.org_id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for x in select value from jsonb_array_elements(p_groups) loop
    if coalesce(x->>'id', '') !~ v_guid or x->>'id' = any (v_ids)
       or btrim(regexp_replace(coalesce(x->>'name', ''), '\s+', ' ', 'g')) = '' then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    v_ids := v_ids || (x->>'id');
  end loop;

  insert into app.entra_sync (org_id) values (p_org) on conflict (org_id) do nothing;
  delete from app.entra_group_map m where m.org_id = p_org and not (m.entra_group_id = any (v_ids));

  for x in select value from jsonb_array_elements(p_groups) loop
    if exists (select 1 from app.entra_group_map m where m.org_id = p_org and m.entra_group_id = x->>'id') then
      update app.entra_group_map set priority = i where org_id = p_org and entra_group_id = x->>'id';
    else
      v_name := btrim(left(btrim(regexp_replace(x->>'name', '\s+', ' ', 'g')), 60));
      select g.id into v_gid from app.groups g where g.org_id = p_org and lower(g.name) = lower(v_name);
      if v_gid is not null and exists (select 1 from app.entra_group_map m where m.group_id = v_gid) then
        v_taken := v_taken || (x->>'id');
        continue;
      end if;
      if v_gid is null then
        insert into app.groups (org_id, name, sort_order)
        values (p_org, v_name, coalesce((select max(g.sort_order) from app.groups g where g.org_id = p_org), 0) + 1)
        returning id into v_gid;
      end if;
      insert into app.entra_group_map (org_id, entra_group_id, group_id, entra_name, priority)
      values (p_org, x->>'id', v_gid, left(btrim(x->>'name'), 256), i);
    end if;
    i := i + 1;
  end loop;
  update app.entra_sync set full_needed = true where org_id = p_org;
  return jsonb_build_object('ok', cardinality(v_taken) = 0, 'error', case when cardinality(v_taken) > 0 then 'name_taken' end,
                            'taken', to_jsonb(v_taken));
end $fn$;

create function public.entra_sync_settings(p_org uuid, p_mode text, p_include_phone boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_mode not in ('nightly', 'manual') or p_include_phone is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from app.entra_tenants t where t.org_id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;
  insert into app.entra_sync as s (org_id, mode, include_phone) values (p_org, p_mode, p_include_phone)
  on conflict (org_id) do update
    set mode = excluded.mode,
        -- turning the number on reads everyone whole once, so numbers arrive for all, not only the changed
        full_needed = s.full_needed or (excluded.include_phone and not s.include_phone),
        include_phone = excluded.include_phone;
  return jsonb_build_object('ok', true);
end $fn$;

-- «Synkroniser nå»: once in five minutes, not while a run is going; the function is asked at once.
create function public.entra_sync_now(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  s app.entra_sync;
  v jsonb;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into s from app.entra_sync x where x.org_id = p_org for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_set_up');
  end if;
  if not exists (select 1 from app.entra_group_map m where m.org_id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'no_groups');
  end if;
  if s.run_status = 'running' and s.run_started_at > now() - interval '1 hour' then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  if s.requested_at > now() - interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v := app.entra_request(p_org);
  if (v->>'ok')::boolean then
    update app.entra_sync set requested_at = now(), requested_by = auth.uid() where org_id = p_org;
  end if;
  return v;
end $fn$;

-- Stop importing: the settings, links, mapping and mirror go; the people and groups stay, as ordinary
-- ones (app.entra_sync_released). The tenant stays bound (0155's entra_unbind is a separate choice).
create function public.entra_disconnect(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  delete from app.entra_sync s where s.org_id = p_org;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_set_up');
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

-- «Følg Entra»: a group set by hand is let go, and the person is placed by the directory again
-- (held back while a round is open, rule 2).
create function public.entra_follow_directory(p_org uuid, p_employee uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_oid text;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update app.employees set entra_group_pinned = false
  where id = p_employee and org_id = p_org and source = 'entra'
  returning entra_object_id into v_oid;
  if v_oid is null then
    return jsonb_build_object('ok', false, 'error', 'not_synced');
  end if;
  perform 1 from app.rounds r where r.org_id = p_org for share;
  return jsonb_build_object('ok', true, 'placed', app.entra_place(p_org, v_oid));
end $fn$;

-- ============================================================ 7. grants
do $$
declare f text;
begin
  -- the Edge Function's (service role only)
  foreach f in array array['public.entra_sync_due(uuid)', 'public.entra_sync_begin(uuid)',
                           'public.entra_sync_apply(uuid,uuid,jsonb)', 'public.entra_sync_fail(uuid,uuid,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- the daglig leder's (each checks the role itself)
  foreach f in array array['public.entra_group_search_target(uuid)', 'public.entra_sync_status(uuid)',
                           'public.entra_select_groups(uuid,jsonb)', 'public.entra_sync_settings(uuid,text,boolean)',
                           'public.entra_sync_now(uuid)', 'public.entra_disconnect(uuid)',
                           'public.entra_follow_directory(uuid,uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
