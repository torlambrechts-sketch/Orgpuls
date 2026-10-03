-- 0196 — CRM access: permission sets, visibility groups, teams; audit completeness; the editor grant and
-- marketing's reach (WP-0.4; D-211)
--
-- docs/crm-enrichment/INSTRUCTIONS.md SEC-07, SEC-08, SEC-09 (teams), SF-01; 06-QUESTIONS Q2, Q3, Q4;
-- DECISIONS DEC-11, DEC-12.
--
-- Permission sets (SEC-07, DEC-11): named sets of allowed actions per app — deals (today's companies and their
-- activities), contacts, campaigns and global — checked by every CRM write and report. The actions are data
-- (app.crm_permission_actions). Roles stay the coarse gate: a set narrows what super_admin and marketing may
-- write, and what analyst may read as reports; it never lets another role in. Built in: «Admin» (everything,
-- the super-admin's), «Regular» (editable; every action, so marketing works as today) and «Read only» (reports,
-- the analyst's). A staff member without a set of their own has their role's.
--
-- Visibility (SEC-08): a company — and with it its activities — is visible to its owner only, the owner's
-- group, the owner's group and its sub-groups, or everyone. Staff sit in one group each; groups form a tree.
-- The default for a new company is a rule, «everyone» (today); the admin set sees everything; a company
-- nobody owns is visible to all; the system's own jobs (no signed-in viewer) see everything. Every reader
-- and writer of companies checks app.crm_visible, or is on the reviewed list in crm_access_invariants.sql.
--
-- Teams (SEC-09): a manager and members, for assignment, reports and goals as those arrive.
--
-- Audit completeness (Q4): every admin reader of customer, person or CRM data writes an audit row (and is
-- volatile, so PostgREST does not run it read-only). Content and configuration readers and the caller's own
-- session are reviewed exceptions, listed in crm_access_invariants.sql.
--
-- Q2: admin_set_admin grants every platform role, the editor included. Q3/DEC-12: the organisation's page
-- and the audit trail become allow-lists — marketing keeps the CRM and loses both.

-- ------------------------------------------------------------------------------------------ the catalogue
create table app.crm_permission_actions (
  key   text primary key check (key ~ '^(deals|contacts|campaigns|global)\.[a-z_]{2,30}$'),
  area  text not null check (area in ('deals', 'contacts', 'campaigns', 'global')),
  kind  text not null check (kind in ('write', 'read')),
  sort  int not null default 0,
  check (split_part(key, '.', 1) = area)
);
alter table app.crm_permission_actions enable row level security;
revoke all on app.crm_permission_actions from public, anon, authenticated;
insert into app.crm_permission_actions (key, area, kind, sort) values
  ('deals.create',       'deals',     'write', 10), ('deals.edit',       'deals',     'write', 11),
  ('deals.delete',       'deals',     'write', 12), ('deals.import',     'deals',     'write', 13),
  ('deals.export',       'deals',     'write', 14), ('deals.bulk_edit',  'deals',     'write', 15),
  ('deals.visibility',   'deals',     'write', 16), ('deals.reports',    'deals',     'read',  17),
  ('contacts.create',    'contacts',  'write', 20), ('contacts.edit',    'contacts',  'write', 21),
  ('contacts.delete',    'contacts',  'write', 22), ('contacts.import',  'contacts',  'write', 23),
  ('contacts.export',    'contacts',  'write', 24), ('contacts.bulk_edit', 'contacts', 'write', 25),
  ('campaigns.create',   'campaigns', 'write', 30), ('campaigns.edit',   'campaigns', 'write', 31),
  ('campaigns.delete',   'campaigns', 'write', 32), ('campaigns.send',   'campaigns', 'write', 33),
  ('campaigns.reports',  'campaigns', 'read',  34),
  ('global.settings',    'global',    'write', 40);

-- ------------------------------------------------------------------------------------------ the sets
create table app.crm_permission_sets (
  id         uuid primary key default gen_random_uuid(),
  product_id text not null default 'orgpuls',
  key        text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  kind       text not null check (kind in ('admin', 'regular', 'custom')),
  builtin    boolean not null default false,
  -- the admin set holds every action, present and future, so its list stays empty
  actions    text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (kind <> 'admin' or actions = '{}'),
  check (kind <> 'custom' or not builtin)
);
create index crm_permission_sets_updated_by_idx on app.crm_permission_sets (updated_by);
alter table app.crm_permission_sets enable row level security;
revoke all on app.crm_permission_sets from public, anon, authenticated;

-- a set names only actions the catalogue holds
create function app.crm_permission_sets_check() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.actions) a where not exists (select 1 from app.crm_permission_actions c where c.key = a)) then
    raise exception 'a permission set names an action the catalogue does not hold' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger crm_permission_sets_check before insert or update of actions on app.crm_permission_sets
  for each row execute function app.crm_permission_sets_check();

insert into app.crm_permission_sets (key, name, kind, builtin, actions) values
  ('admin',     'Admin',     'admin',   true, '{}'),
  ('regular',   'Regular',   'regular', true, array(select a.key from app.crm_permission_actions a order by a.sort)),
  ('read_only', 'Read only', 'regular', true, array['deals.reports', 'campaigns.reports']);

-- ------------------------------------------------------------------------------------------ groups and teams
create table app.crm_visibility_groups (
  id         uuid primary key default gen_random_uuid(),
  product_id text not null default 'orgpuls',
  name       text not null unique check (char_length(btrim(name)) between 1 and 80),
  parent_id  uuid references app.crm_visibility_groups (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index crm_visibility_groups_parent_idx on app.crm_visibility_groups (parent_id);
alter table app.crm_visibility_groups enable row level security;
revoke all on app.crm_visibility_groups from public, anon, authenticated;

-- one row per staff member who has a set or a group of their own; without a row, the role's set and no group
create table app.crm_staff_access (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  set_id     uuid references app.crm_permission_sets (id) on delete set null,
  group_id   uuid references app.crm_visibility_groups (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index crm_staff_access_set_idx on app.crm_staff_access (set_id);
create index crm_staff_access_group_idx on app.crm_staff_access (group_id);
create index crm_staff_access_updated_by_idx on app.crm_staff_access (updated_by);
alter table app.crm_staff_access enable row level security;
revoke all on app.crm_staff_access from public, anon, authenticated;

create table app.crm_teams (
  id         uuid primary key default gen_random_uuid(),
  product_id text not null default 'orgpuls',
  name       text not null unique check (char_length(btrim(name)) between 1 and 80),
  manager_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_teams_manager_idx on app.crm_teams (manager_id);
alter table app.crm_teams enable row level security;
revoke all on app.crm_teams from public, anon, authenticated;

create table app.crm_team_members (
  team_id uuid not null references app.crm_teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (team_id, user_id)
);
create index crm_team_members_user_idx on app.crm_team_members (user_id);
alter table app.crm_team_members enable row level security;
revoke all on app.crm_team_members from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ the rules
alter table app.crm_setting_defs drop constraint crm_setting_defs_area_check,
  add constraint crm_setting_defs_area_check check (area in ('contacts', 'audit', 'limits', 'deletion', 'access'));
insert into app.crm_setting_defs (key, area, kind, options, default_value, applies_to, sort) values
  ('default_visibility_company', 'access', 'choice', array['everyone', 'group_tree', 'group', 'owner'], '"everyone"', array['SEC-08'], 140),
  ('limit_permission_sets',      'limits', 'limit',  null, 'null', array['SEC-07'], 150),
  ('limit_visibility_groups',    'limits', 'limit',  null, 'null', array['SEC-08'], 160);

-- a new company's visibility: the rule's default
create function app.crm_default_visibility() returns text
language sql stable security definer set search_path = '' as $$
  select app.crm_choice('default_visibility_company')
$$;

-- who sees a company: owner only, the owner's group, the group and its sub-groups, or everyone (SEC-08)
alter table app.crm_companies
  add column visibility text not null default app.crm_default_visibility()
    check (visibility in ('owner', 'group', 'group_tree', 'everyone'));

-- ------------------------------------------------------------------------------------------ who may do what
-- the set a staff member works under: their own, else their role's
create function app.crm_set_of(p_user uuid) returns app.crm_permission_sets
language sql stable security definer set search_path = '' as $$
  select s.* from app.crm_permission_sets s
  where s.id = coalesce(
    (select a.set_id from app.crm_staff_access a where a.user_id = p_user),
    (select d.id from app.crm_permission_sets d
     where d.key = case (select pa.role from app.platform_admins pa where pa.user_id = p_user and pa.active)
                     when 'super_admin' then 'admin' when 'marketing' then 'regular' when 'analyst' then 'read_only' end))
$$;

-- SF-01 step 2: the signed-in staff member may do this action. The role is the coarse gate (a write needs
-- super_admin or marketing at aal2, a report super_admin, marketing or analyst), the set the fine one. An
-- unknown action is a programming error, loudly.
create function app.crm_can(p_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_kind text;
  v_set app.crm_permission_sets;
begin
  select a.kind into v_kind from app.crm_permission_actions a where a.key = p_action;
  if v_kind is null then
    raise exception 'unknown CRM permission action: %', p_action;
  end if;
  if (v_kind = 'write' and not app.crm_can_write()) or (v_kind = 'read' and not app.crm_can_read()) then
    return false;
  end if;
  v_set := app.crm_set_of(auth.uid());
  return v_set.id is not null and (v_set.kind = 'admin' or p_action = any (v_set.actions));
end $$;

-- what the signed-in staff member may do in one area, for the screens: {"create": true, "edit": false, …}
create function app.crm_may(p_area text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(split_part(a.key, '.', 2), app.crm_can(a.key)), '{}'::jsonb)
  from app.crm_permission_actions a where a.area = p_area
$$;

create function app.crm_group_of(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.group_id from app.crm_staff_access a where a.user_id = p_user
$$;

-- SF-01 step 3: the signed-in staff member may see a record with this owner and visibility
create function app.crm_visible(p_owner uuid, p_visibility text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then true                                -- the system's own jobs: no viewer
    when coalesce(p_visibility, 'everyone') = 'everyone' then true
    when p_owner is null or p_owner = auth.uid() then true           -- nobody to restrict it to, or one's own
    when (app.crm_set_of(auth.uid())).kind = 'admin' then true       -- the admin set sees everything
    when p_visibility = 'owner' then false
    when p_visibility = 'group' then coalesce(app.crm_group_of(p_owner) = app.crm_group_of(auth.uid()), false)
    when p_visibility = 'group_tree' then coalesce(app.crm_group_of(auth.uid()) in (
           with recursive tree as (
             select g.id from app.crm_visibility_groups g where g.id = app.crm_group_of(p_owner)
             union all
             select g.id from app.crm_visibility_groups g join tree t on g.parent_id = t.id)
           select tree.id from tree), false)
    else false end
$$;

-- a company's visibility, by id (an activity follows its company); no company, nothing to hide
create function app.crm_visible_company(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select app.crm_visible(c.owner_id, c.visibility) from app.crm_companies c where c.id = p_company), true)
$$;

-- the ids among p_ids the signed-in staff member may see: companies by their visibility, activities by their
-- company's; contacts are not owned yet, so all of them
create function app.crm_visible_ids(p_entity text, p_ids uuid[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select case p_entity
    when 'company' then array(select c.id from app.crm_companies c where c.id = any (p_ids) and app.crm_visible(c.owner_id, c.visibility))
    when 'activity' then array(select a.id from app.crm_activities a where a.id = any (p_ids) and app.crm_visible_company(a.company_id))
    else p_ids end
$$;

revoke all on function app.crm_set_of(uuid), app.crm_can(text), app.crm_may(text), app.crm_group_of(uuid), app.crm_visible(uuid, text),
  app.crm_visible_company(uuid), app.crm_visible_ids(text, uuid[]), app.crm_default_visibility(), app.crm_permission_sets_check()
  from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ Users & roles
-- The CRM's access on Admin › Users & roles: the catalogue, the sets and who has which, the groups and the
-- teams. The super-admin's, as the roles are; audited.
create function public.admin_crm_access() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('admins.crm_access');
  return jsonb_build_object('ok', true,
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('key', a.key, 'area', a.area, 'kind', a.kind) order by a.sort), '[]')
                from app.crm_permission_actions a),
    'sets', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'key', s.key, 'name', s.name, 'kind', s.kind, 'builtin', s.builtin,
               'actions', to_jsonb(s.actions),
               'members', (select count(*) from app.platform_admins pa where pa.active and (app.crm_set_of(pa.user_id)).id = s.id))
             order by s.builtin desc, s.created_at, s.name), '[]') from app.crm_permission_sets s),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('user_id', pa.user_id, 'email', u.email, 'role', pa.role, 'active', pa.active,
                'set_id', a.set_id, 'effective_set', (app.crm_set_of(pa.user_id)).id, 'group_id', a.group_id)
              order by pa.active desc, u.email), '[]')
              from app.platform_admins pa join auth.users u on u.id = pa.user_id
              left join app.crm_staff_access a on a.user_id = pa.user_id),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'parent_id', g.parent_id,
                 'members', (select count(*) from app.crm_staff_access a where a.group_id = g.id)) order by g.name), '[]')
               from app.crm_visibility_groups g),
    'teams', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'manager_id', t.manager_id,
                'manager', (select u.email from auth.users u where u.id = t.manager_id),
                'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email) order by u.email), '[]')
                            from app.crm_team_members m join auth.users u on u.id = m.user_id where m.team_id = t.id))
              order by t.name), '[]') from app.crm_teams t),
    'limits', jsonb_build_object('sets', app.crm_limit('limit_permission_sets'), 'groups', app.crm_limit('limit_visibility_groups')),
    'default_visibility', app.crm_choice('default_visibility_company'));
end $$;

-- Add a custom set (no id), or change the actions of a regular or custom one; the admin set holds everything
create function public.admin_crm_set_save(p_id uuid, p_name text, p_actions text[], p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_set app.crm_permission_sets;
  v_name text := btrim(coalesce(p_name, ''));
  v_actions text[] := array(select distinct a from unnest(coalesce(p_actions, '{}')) a order by a);
  v_max int := app.crm_limit('limit_permission_sets');
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if exists (select 1 from unnest(v_actions) a where not exists (select 1 from app.crm_permission_actions c where c.key = a)) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_id is null then
    if v_max is not null and (select count(*) from app.crm_permission_sets s where s.kind = 'custom') >= v_max then
      return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_permission_sets', 'limit', v_max);
    end if;
    if exists (select 1 from app.crm_permission_sets s where lower(s.name) = lower(v_name)) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_permission_sets (key, name, kind, actions, updated_by)
    values ('custom_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), v_name, 'custom', v_actions, auth.uid())
    returning * into v_set;
  else
    select * into v_set from app.crm_permission_sets s where s.id = p_id;
    if v_set.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_set.kind = 'admin' then
      return jsonb_build_object('ok', false, 'error', 'builtin');
    end if;
    if exists (select 1 from app.crm_permission_sets s where lower(s.name) = lower(v_name) and s.id <> p_id) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    update app.crm_permission_sets set name = case when builtin then name else v_name end, actions = v_actions,
      updated_at = now(), updated_by = auth.uid()
    where id = p_id returning * into v_set;
  end if;
  perform app.admin_log('admins.crm_set_save', null, 'crm_permission_set', v_set.id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_set.name, 'actions', to_jsonb(v_set.actions)));
  return jsonb_build_object('ok', true, 'id', v_set.id);
end $$;

-- Remove a custom set; whoever had it works under their role's set again
create function public.admin_crm_set_delete(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_set app.crm_permission_sets;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select * into v_set from app.crm_permission_sets s where s.id = p_id;
  if v_set.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_set.builtin then
    return jsonb_build_object('ok', false, 'error', 'builtin');
  end if;
  delete from app.crm_permission_sets where id = p_id;
  perform app.admin_log('admins.crm_set_delete', null, 'crm_permission_set', p_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_set.name));
  return jsonb_build_object('ok', true);
end $$;

-- A staff member's own set and group (null: their role's set; no group)
create function public.admin_crm_staff_access(p_user uuid, p_set uuid, p_group uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if not exists (select 1 from app.platform_admins pa where pa.user_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if (p_set is not null and not exists (select 1 from app.crm_permission_sets s where s.id = p_set))
     or (p_group is not null and not exists (select 1 from app.crm_visibility_groups g where g.id = p_group)) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into app.crm_staff_access (user_id, set_id, group_id, updated_by)
  values (p_user, p_set, p_group, auth.uid())
  on conflict (user_id) do update set set_id = excluded.set_id, group_id = excluded.group_id, updated_at = now(), updated_by = auth.uid();
  perform app.admin_log('admins.crm_staff_access', null, 'admin', p_user::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('set', p_set, 'group', p_group));
  return jsonb_build_object('ok', true);
end $$;

-- Add a visibility group (no id) or rename and move one; a group cannot sit under itself or its own sub-group
create function public.admin_crm_group_save(p_id uuid, p_name text, p_parent uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid := p_id;
  v_max int := app.crm_limit('limit_visibility_groups');
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if p_parent is not null and not exists (select 1 from app.crm_visibility_groups g where g.id = p_parent) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if exists (select 1 from app.crm_visibility_groups g where lower(g.name) = lower(v_name) and g.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  if p_id is null then
    if v_max is not null and (select count(*) from app.crm_visibility_groups) >= v_max then
      return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_visibility_groups', 'limit', v_max);
    end if;
    insert into app.crm_visibility_groups (name, parent_id) values (v_name, p_parent) returning id into v_id;
  else
    if not exists (select 1 from app.crm_visibility_groups g where g.id = p_id) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if p_parent is not null and p_parent in (
         with recursive tree as (
           select g.id from app.crm_visibility_groups g where g.id = p_id
           union all
           select g.id from app.crm_visibility_groups g join tree t on g.parent_id = t.id)
         select tree.id from tree) then
      return jsonb_build_object('ok', false, 'error', 'cycle');
    end if;
    update app.crm_visibility_groups set name = v_name, parent_id = p_parent where id = p_id;
  end if;
  perform app.admin_log('admins.crm_group_save', null, 'crm_visibility_group', v_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_name, 'parent', p_parent));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Remove a group without sub-groups; its members keep their sets and have no group
create function public.admin_crm_group_delete(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select g.name into v_name from app.crm_visibility_groups g where g.id = p_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if exists (select 1 from app.crm_visibility_groups g where g.parent_id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'has_children');
  end if;
  delete from app.crm_visibility_groups where id = p_id;
  perform app.admin_log('admins.crm_group_delete', null, 'crm_visibility_group', p_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true);
end $$;

-- Add a team (no id) or change one: its name, manager and members (the list replaces the old one)
create function public.admin_crm_team_save(p_id uuid, p_name text, p_manager uuid, p_members uuid[], p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid := p_id;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if (p_manager is not null and not exists (select 1 from app.platform_admins pa where pa.user_id = p_manager))
     or exists (select 1 from unnest(coalesce(p_members, '{}')) m where not exists (select 1 from app.platform_admins pa where pa.user_id = m)) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if exists (select 1 from app.crm_teams t where lower(t.name) = lower(v_name) and t.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  if p_id is null then
    insert into app.crm_teams (name, manager_id) values (v_name, p_manager) returning id into v_id;
  else
    update app.crm_teams set name = v_name, manager_id = p_manager, updated_at = now() where id = p_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    delete from app.crm_team_members m where m.team_id = p_id and not (m.user_id = any (coalesce(p_members, '{}')));
  end if;
  insert into app.crm_team_members (team_id, user_id)
  select v_id, m from (select distinct unnest(coalesce(p_members, '{}')) m) x
  on conflict do nothing;
  perform app.admin_log('admins.crm_team_save', null, 'crm_team', v_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_name, 'manager', p_manager, 'members', coalesce(cardinality(p_members), 0)));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create function public.admin_crm_team_delete(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select t.name into v_name from app.crm_teams t where t.id = p_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  delete from app.crm_teams where id = p_id;
  perform app.admin_log('admins.crm_team_delete', null, 'crm_team', p_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_crm_access(), public.admin_crm_set_save(uuid, text, text[], text), public.admin_crm_set_delete(uuid, text),
  public.admin_crm_staff_access(uuid, uuid, uuid, text), public.admin_crm_group_save(uuid, text, uuid, text),
  public.admin_crm_group_delete(uuid, text), public.admin_crm_team_save(uuid, text, uuid, uuid[], text),
  public.admin_crm_team_delete(uuid, text) from public, anon;
grant execute on function public.admin_crm_access(), public.admin_crm_set_save(uuid, text, text[], text), public.admin_crm_set_delete(uuid, text),
  public.admin_crm_staff_access(uuid, uuid, uuid, text), public.admin_crm_group_save(uuid, text, uuid, text),
  public.admin_crm_group_delete(uuid, text), public.admin_crm_team_save(uuid, text, uuid, uuid[], text),
  public.admin_crm_team_delete(uuid, text) to authenticated;

-- ------------------------------------------------------------------------------------------ the existing calls
-- Each function below now checks its action, its records' visibility, or writes its audit row (or all three)

CREATE OR REPLACE FUNCTION public.admin_brreg_poll_now()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
  v_n int;
begin
  if not (app.crm_can('global.settings')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform pg_advisory_xact_lock(hashtext('orgpuls:brreg_poll'));
  -- the sweep writes companies and tasks: audited whether or not a poll follows
  v_n := app.brreg_requeue_sweep();
  if v_n > 0 then
    perform app.admin_log('crm.brreg_requeue', null, 'brreg_outreach', null, null, jsonb_build_object('assigned', v_n));
  end if;
  if exists (select 1 from app.brreg_polls p where p.requested_at > now() - interval '15 minutes'
             or (p.status = 'running' and p.started_at > now() - interval '1 hour')) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v := app.brreg_request('manual', auth.uid());
  if (v->>'ok')::boolean then
    perform app.admin_log('crm.brreg_poll', null, 'brreg_poll', v->>'poll_id');
  end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_brreg_set_dry_run(p_on boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_n int := 0;
begin
  if not (app.crm_can('global.settings')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_on is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if (select s.dry_run from app.brreg_settings s) = p_on then
    return jsonb_build_object('ok', false, 'error', 'unchanged');
  end if;
  update app.brreg_settings set dry_run = p_on where id;
  -- switched off: what is queued is assigned now
  if not p_on then
    for v_id in select o.id from app.brreg_outreach o where o.status = 'queued' order by o.created_at loop
      if app.brreg_assign(v_id) then v_n := v_n + 1; end if;
    end loop;
  end if;
  perform app.admin_log('crm.brreg_dry_run', null, 'brreg_settings', null, p_reason, jsonb_build_object('dry_run', p_on, 'assigned', v_n));
  return jsonb_build_object('ok', true, 'assigned', v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_consent_phone_notice(p_org_number text, p_objected boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org text := regexp_replace(coalesce(p_org_number, ''), '\s', '', 'g');
  v_company uuid;
  en app.brreg_entities;
  v_stopped int := 0;
begin
  if not (app.crm_can('contacts.edit')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_org !~ '^[0-9]{9}$' or p_objected is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select c.id into v_company from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = v_org;
  if v_company is null then
    select * into en from app.brreg_entities e where e.org_number = v_org;
    if en.org_number is null then
      return jsonb_build_object('ok', false, 'error', 'unknown_company');
    end if;
    insert into app.crm_companies (name, org_number, form_code, nace_code, employees, municipality, phone, source, stage)
    values (en.name, en.org_number, en.form_code, en.nace_code, en.employees, en.municipality, en.phone, 'brreg', 'contacted')
    returning id into v_company;
  end if;
  insert into app.consent_records (company_id, purpose, status, lawful_basis, method, created_by)
  values (v_company, 'phone_outreach', case when p_objected then 'withdrawn' else 'notice_given' end, 'legit_interest_phone',
          'phone_notice', auth.uid());
  if p_objected then
    -- the entity's row lock orders the objection with brreg_ingest, whose brreg_raise reads the list
    -- under the same lock: a trigger raised meanwhile either sees the objection or is stopped below
    perform 1 from app.brreg_entities e where e.org_number = v_org for update;
    insert into app.brreg_dnc (org_number, reason, created_by) values (v_org, 'objected', auth.uid()) on conflict (org_number) do nothing;
    update app.brreg_outreach set status = 'do_not_contact', manager_name = null
    where org_number = v_org and status in ('queued', 'assigned');
    get diagnostics v_stopped = row_count;
    -- once the organisation has objected, no row of it has a purpose for the manager's name — run
    -- after the update above, so a name written while it waited is cleared as well
    update app.brreg_outreach set manager_name = null where org_number = v_org and manager_name is not null;
    -- a statement of its own, with a fresh snapshot: a task an assignment committed while the update
    -- above waited on its row lock is closed as well
    update app.crm_activities a set done_at = now(), skipped = true
    where a.done_at is null
      and a.id in (select o.activity_id from app.brreg_outreach o where o.org_number = v_org and o.activity_id is not null);
  end if;
  perform app.admin_log('crm.phone_notice', null, 'crm_company', v_company::text, null,
                        jsonb_build_object('objected', p_objected, 'stopped', v_stopped));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_cancel(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text;
begin
  if not (app.crm_can('campaigns.send')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select status into v_status from app.crm_campaigns where id = p_id for update;
  if v_status = 'scheduled' then
    update app.crm_campaigns set status = 'draft', scheduled_at = null, updated_at = now() where id = p_id;
  elsif v_status = 'sending' then
    update app.crm_sends set status = 'skipped', to_email = null where campaign_id = p_id and status = 'pending';
    update app.crm_campaigns set status = 'cancelled', finished_at = now(), updated_at = now() where id = p_id;
  else
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;
  perform app.admin_log('crm.campaign_cancel', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_pipeline(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_campaigns;
  v_parent app.crm_campaigns;
  v_target text := nullif(p->>'stage_target', '');
  v_on_send text := nullif(p->>'stage_on_send', '');
  v_when text := coalesce(nullif(p->>'follow_when', ''), 'no_reply');
  v_auto boolean;
  v_sender uuid;
  v_follows uuid;
  v_days int;
begin
  if not (app.crm_can('campaigns.edit')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_c.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;
  if v_target is not null and not exists (select 1 from app.crm_stages s where s.key = v_target and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if v_on_send is not null and not exists (select 1 from app.crm_stages s where s.key = v_on_send and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if v_when not in ('no_reply', 'no_click', 'no_open') then
    return jsonb_build_object('ok', false, 'error', 'invalid_follow');
  end if;
  begin
    v_sender := nullif(p->>'sender_id', '')::uuid;
    v_follows := nullif(p->>'follows_id', '')::uuid;
    v_days := nullif(p->>'follow_days', '')::int;
    v_auto := coalesce((p->>'follow_auto')::boolean, false);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  if v_sender is not null and not exists (select 1 from app.crm_senders s where s.id = v_sender and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_sender');
  end if;
  if v_follows is not null then
    select * into v_parent from app.crm_campaigns where id = v_follows;
    if v_parent.id is null or v_parent.id = p_id or v_days is null or v_days not between 1 and 60 then
      return jsonb_build_object('ok', false, 'error', 'invalid_follow');
    end if;
    -- no loops, and at most seven mails in a chain
    if exists (with recursive up as (select v_parent.id as id, v_parent.follows_id as f, 1 as n
                                     union all select c.id, c.follows_id, up.n + 1 from app.crm_campaigns c join up on c.id = up.f where up.n < 1000)
               select 1 from up where up.id = p_id) then
      return jsonb_build_object('ok', false, 'error', 'invalid_follow');
    end if;
    if app.crm_chain_depth(v_parent.id) >= coalesce(app.crm_limit('limit_sequence_mails'), 2147483647) then
      return jsonb_build_object('ok', false, 'error', 'too_many_steps', 'setting', 'limit_sequence_mails');
    end if;
  end if;
  if v_follows is null then v_auto := false; end if;
  update app.crm_campaigns set stage_target = v_target, stage_on_send = v_on_send, sender_id = v_sender,
    follows_id = v_follows, follow_days = case when v_follows is not null then v_days end,
    follow_when = case when v_follows is not null then v_when else 'no_reply' end,
    follow_auto = v_auto,
    list_id = case when v_follows is not null then v_parent.list_id else list_id end,
    lang = case when v_follows is not null then v_parent.lang else lang end,
    updated_at = now()
  where id = p_id;
  perform app.admin_log('crm.campaign_pipeline', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_resend(p_id uuid, p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p app.crm_campaigns;
  v_id uuid;
begin
  if not (app.crm_can('campaigns.send')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_p from app.crm_campaigns where id = p_id;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_p.step_kind <> 'mail' then
    return jsonb_build_object('ok', false, 'error', 'invalid_step');
  end if;
  if coalesce(p_days, 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_follow');
  end if;
  if app.crm_chain_depth(v_p.id) >= coalesce(app.crm_limit('limit_sequence_mails'), 2147483647) then
    return jsonb_build_object('ok', false, 'error', 'too_many_steps', 'setting', 'limit_sequence_mails');
  end if;
  insert into app.crm_campaigns (name, kind, lang, subject, preheader, blocks, segment_id, list_id, utm_campaign, template_key, style,
                                 signature, sender_id, stage_target, follows_id, follow_days, follow_when, follow_auto, created_by)
  values (left(v_p.name || ' · resend', 120), v_p.kind, v_p.lang, v_p.subject, v_p.preheader, v_p.blocks, null, v_p.list_id,
          left(v_p.utm_campaign || '-resend', 60), v_p.template_key, v_p.style, v_p.signature, v_p.sender_id, null,
          v_p.id, p_days, 'no_click', true, auth.uid())
  returning id into v_id;
  perform app.admin_log('crm.campaign_resend', null, 'crm_campaign', v_id::text, null, jsonb_build_object('follows', p_id, 'days', p_days));
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_save(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
  v_status text;
  v_utm text := lower(btrim(coalesce(p->>'utm_campaign', '')));
  v_slug text := nullif(lower(btrim(coalesce(p->>'slug', ''))), '');
  v_t app.crm_templates;
begin
  if not (app.crm_can(case when p_id is null then 'campaigns.create' else 'campaigns.edit' end)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if nullif(p->>'template_key', '') is not null then
    select * into v_t from app.crm_templates t where t.key = p->>'template_key';
    if v_t.key is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_template');
    end if;
  end if;
  if coalesce(p->>'kind', v_t.kind, 'newsletter') not in ('newsletter', 'campaign', 'promotion', 'announcement') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if v_utm = '' then
    v_utm := left(trim(both '-' from regexp_replace(translate(replace(lower(p->>'name'), 'æ', 'ae'), 'øå', 'oa'), '[^a-z0-9]+', '-', 'g')), 60);
  end if;
  if v_utm !~ '^[a-z0-9_-]{1,60}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_utm');
  end if;
  if char_length(coalesce(p->>'subject', '')) > 150 or char_length(coalesce(p->>'subject_b', '')) > 150
     or char_length(coalesce(p->>'preheader', '')) > 200 or char_length(coalesce(p->>'web_description', '')) > 200
     or char_length(coalesce(p->>'signature', '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if p ? 'blocks' and jsonb_array_length(coalesce(p->'blocks', '[]')) > 0 and not app.crm_blocks_ok(p->'blocks') then
    return jsonb_build_object('ok', false, 'error', 'invalid_blocks');
  end if;
  -- 0192: the number of blocks is a setting, unlimited by default
  if p ? 'blocks' and app.crm_limit('limit_campaign_blocks') is not null
     and jsonb_typeof(p->'blocks') = 'array' and jsonb_array_length(p->'blocks') > app.crm_limit('limit_campaign_blocks') then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_campaign_blocks', 'limit', app.crm_limit('limit_campaign_blocks'));
  end if;
  if nullif(p->>'segment_id', '') is not null and not exists (select 1 from app.crm_segments g where g.id = (p->>'segment_id')::uuid) then
    return jsonb_build_object('ok', false, 'error', 'invalid_segment');
  end if;
  if nullif(p->>'list_id', '') is not null and not exists (select 1 from app.crm_lists l where l.id = (p->>'list_id')::uuid and l.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_list');
  end if;
  if coalesce(p->>'style', 'branded') not in ('branded', 'letter') or coalesce(p->>'ab_metric', 'click') not in ('open', 'click')
     or coalesce(p->>'ab_percent', '20') !~ '^[0-9]{2}$' or (coalesce(p->>'ab_percent', '20'))::int not between 10 and 50
     or coalesce(p->>'ab_wait_hours', '4') !~ '^[0-9]{1,2}$' or (coalesce(p->>'ab_wait_hours', '4'))::int not between 1 and 48 then
    return jsonb_build_object('ok', false, 'error', 'invalid_ab');
  end if;
  if v_slug is not null and (v_slug !~ '^[a-z0-9-]{3,80}$'
      or exists (select 1 from app.crm_campaigns c where c.product_id = 'orgpuls' and c.slug = v_slug and c.id is distinct from p_id)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_slug');
  end if;

  if v_id is null then
    insert into app.crm_campaigns (name, kind, lang, subject, preheader, blocks, segment_id, list_id, utm_campaign, template_key, style, signature,
                                   subject_b, ab_percent, ab_metric, ab_wait_hours, publish_web, slug, web_description, created_by)
    values (btrim(p->>'name'), coalesce(p->>'kind', v_t.kind, 'newsletter'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            coalesce(p->>'subject', v_t.subject, ''), coalesce(p->>'preheader', v_t.preheader, ''), coalesce(p->'blocks', v_t.blocks, '[]'),
            nullif(p->>'segment_id', '')::uuid, nullif(p->>'list_id', '')::uuid, v_utm, v_t.key, coalesce(p->>'style', v_t.style, 'branded'),
            coalesce(p->>'signature', ''), coalesce(p->>'subject_b', ''), coalesce((p->>'ab_percent')::int, 20),
            coalesce(p->>'ab_metric', 'click'), coalesce((p->>'ab_wait_hours')::int, 4), coalesce((p->>'publish_web')::boolean, false),
            v_slug, coalesce(p->>'web_description', ''), auth.uid())
    returning id into v_id;
  else
    select status into v_status from app.crm_campaigns where id = v_id;
    if v_status is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_status <> 'draft' then
      return jsonb_build_object('ok', false, 'error', 'not_draft');
    end if;
    update app.crm_campaigns set name = btrim(p->>'name'), kind = coalesce(p->>'kind', kind),
      lang = case when p->>'lang' in ('no', 'en') then p->>'lang' else lang end,
      subject = coalesce(p->>'subject', subject), preheader = coalesce(p->>'preheader', preheader),
      blocks = coalesce(p->'blocks', blocks), segment_id = case when p ? 'segment_id' then nullif(p->>'segment_id', '')::uuid else segment_id end,
      list_id = case when p ? 'list_id' then nullif(p->>'list_id', '')::uuid else list_id end,
      utm_campaign = v_utm, style = coalesce(p->>'style', style), signature = coalesce(p->>'signature', signature),
      subject_b = coalesce(p->>'subject_b', subject_b), ab_percent = coalesce((p->>'ab_percent')::int, ab_percent),
      ab_metric = coalesce(p->>'ab_metric', ab_metric), ab_wait_hours = coalesce((p->>'ab_wait_hours')::int, ab_wait_hours),
      publish_web = coalesce((p->>'publish_web')::boolean, publish_web),
      slug = case when p ? 'slug' then v_slug else slug end, web_description = coalesce(p->>'web_description', web_description),
      updated_at = now()
    where id = v_id;
  end if;
  perform app.admin_log('crm.campaign_save', null, 'crm_campaign', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_schedule(p_id uuid, p_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_campaigns;
  v_why text;
begin
  if not (app.crm_can('campaigns.send')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id for update;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_c.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;
  v_why := app.crm_campaign_ready(v_c);
  if v_why is not null then
    return jsonb_build_object('ok', false, 'error', v_why);
  end if;
  if p_at is null or p_at < now() - interval '5 minutes' or p_at > now() + interval '366 days' then
    return jsonb_build_object('ok', false, 'error', 'invalid_time');
  end if;
  update app.crm_campaigns set status = 'scheduled', scheduled_at = greatest(p_at, now()), updated_at = now() where id = p_id;
  perform app.admin_log('crm.campaign_schedule', null, 'crm_campaign', p_id::text, null, jsonb_build_object('at', p_at));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_test(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_campaigns;
  v_why text;
begin
  if not (app.crm_can('campaigns.send')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_why := case when char_length(btrim(v_c.subject)) = 0 then 'no_subject' when not app.crm_blocks_ok(v_c.blocks) then 'invalid_blocks' end;
  if v_why is not null then
    return jsonb_build_object('ok', false, 'error', v_why);
  end if;
  -- 0192: test sends per hour are a setting, unlimited by default
  if app.crm_limit('limit_test_sends_per_hour') is not null
     and (select count(*) from app.crm_sends s where s.kind = 'test' and s.created_at > now() - interval '1 hour') >= app.crm_limit('limit_test_sends_per_hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'setting', 'limit_test_sends_per_hour', 'limit', app.crm_limit('limit_test_sends_per_hour'));
  end if;
  insert into app.crm_sends (kind, campaign_id, to_email)
  select 'test', p_id, lower(u.email) from auth.users u where u.id = auth.uid();
  perform app.admin_log('crm.campaign_test', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true, 'to', (select lower(u.email) from auth.users u where u.id = auth.uid()));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_contact_action(p_id uuid, p_action text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_contacts;
begin
  if not (app.crm_can(case when p_action = 'erase' then 'contacts.delete' else 'contacts.edit' end)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- 0192: a typed reason is a setting, off by default; the audit row is written either way
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select * into v_c from app.crm_contacts where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_action = 'unsubscribe' then
    update app.crm_contacts set status = 'unsubscribed', updated_at = now() where id = p_id;
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_c.email), 'manual') on conflict (email_hash) do nothing;
  elsif p_action = 'erase' then
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_c.email), 'erased')
    on conflict (email_hash) do update set reason = 'erased', at = now();
    delete from app.crm_sends where contact_id = p_id and status in ('pending', 'sending');
    delete from app.crm_contacts where id = p_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('crm.contact_' || p_action, v_c.org_id, 'crm_contact', p_id::text, nullif(btrim(coalesce(p_reason, '')), ''));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_daily_cap(p_cap integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.crm_can('global.settings')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_cap is not null and p_cap not between 1 and 5000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update app.crm_settings set daily_cap = p_cap, changed_by = auth.uid(), changed_at = now() where id;
  perform app.admin_log('crm.daily_cap', null, null, null, null, jsonb_build_object('cap', p_cap));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_list_add(p_list uuid, p_contacts uuid[], p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n int;
begin
  if not (app.crm_can('campaigns.edit')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_source, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;
  if not exists (select 1 from app.crm_lists l where l.id = p_list and l.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  insert into app.crm_list_members (list_id, contact_id, status, source, subscribed_at)
  select p_list, c.id, 'subscribed', left(btrim(p_source), 200), now()
  from app.crm_contacts c
  where c.id = any (coalesce(p_contacts, '{}')) and c.deleted_at is null and c.basis = 'consent' and c.status = 'active' and not app.crm_suppressed(c.email)
  on conflict (list_id, contact_id) do update set status = 'subscribed', subscribed_at = now(), unsubscribed_at = null, source = excluded.source
  where app.crm_list_members.status = 'pending';
  get diagnostics v_n = row_count;
  perform app.admin_log('crm.list_add', null, 'crm_list', p_list::text, p_source, jsonb_build_object('added', v_n));
  return jsonb_build_object('ok', true, 'added', v_n, 'refused', coalesce(cardinality(p_contacts), 0) - v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_list_remove(p_list uuid, p_contact uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.crm_can('campaigns.edit')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- 0192: a typed reason is a setting, off by default; the audit row is written either way
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  update app.crm_list_members set status = 'unsubscribed', unsubscribed_at = now()
  where list_id = p_list and contact_id = p_contact and status <> 'unsubscribed';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.list_remove', null, 'crm_contact', p_contact::text, nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('list', p_list));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_list_save(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
begin
  if not (app.crm_can(case when p_id is null then 'campaigns.create' else 'campaigns.edit' end)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p->>'name_no', ''))) not between 1 and 80 or char_length(btrim(coalesce(p->>'name_en', ''))) not between 1 and 80
     or char_length(coalesce(p->>'description_no', '')) > 300 or char_length(coalesce(p->>'description_en', '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_id is null then
    if coalesce(p->>'key', '') !~ '^[a-z0-9-]{2,40}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_key');
    end if;
    if exists (select 1 from app.crm_lists l where l.product_id = 'orgpuls' and l.key = p->>'key') then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_lists (key, name_no, name_en, description_no, description_en, public, sort)
    values (p->>'key', btrim(p->>'name_no'), btrim(p->>'name_en'), coalesce(p->>'description_no', ''), coalesce(p->>'description_en', ''),
            coalesce((p->>'public')::boolean, true), (select coalesce(max(sort), 0) + 1 from app.crm_lists))
    returning id into v_id;
  else
    update app.crm_lists set name_no = btrim(p->>'name_no'), name_en = btrim(p->>'name_en'),
      description_no = coalesce(p->>'description_no', description_no), description_en = coalesce(p->>'description_en', description_en),
      public = coalesce((p->>'public')::boolean, public),
      archived_at = case when (p->>'archived')::boolean then coalesce(archived_at, now()) when p ? 'archived' then null else archived_at end
    where id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  perform app.admin_log('crm.list_save', null, 'crm_list', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_partner_save(p_id uuid, p_name text, p_org_number text, p_kind text, p_contact text, p_code text, p_share_kind text, p_share_pct integer, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_org text := nullif(regexp_replace(coalesce(p_org_number, ''), '\s', '', 'g'), '');
begin
  if not (app.crm_can('deals.edit')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 200
     or coalesce(p_kind, '') not in ('accounting', 'bht', 'hms', 'bransje')
     or coalesce(p_status, '') not in ('in_talks', 'kit_sent', 'pilot_signed', 'member_offer_drafted', 'phase_2')
     or (v_org is not null and v_org !~ '^[0-9]{9}$')
     or (v_code is not null and v_code !~ '^[A-Z0-9]{2,20}$')
     or (p_share_kind is not null and p_share_kind not in ('recurring', 'client_discount', 'affiliate', 'member_discount'))
     or (p_share_pct is not null and (p_share_pct not between 1 and 50 or p_share_kind is null or p_share_kind = 'member_discount'))
     or (p_share_kind in ('recurring', 'client_discount', 'affiliate') and p_share_pct is null)
     or (nullif(btrim(coalesce(p_contact, '')), '') is not null and char_length(btrim(p_contact)) not between 2 and 120) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_code is not null and exists (select 1 from app.partners x where x.referral_code = v_code and x.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'code_taken');
  end if;
  if v_org is not null and exists (select 1 from app.partners x where x.org_number = v_org and x.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'org_taken');
  end if;
  if p_id is null then
    insert into app.partners (name, org_number, kind, contact_name, referral_code, share_kind, share_pct, status, created_by)
    values (btrim(p_name), v_org, p_kind, nullif(btrim(coalesce(p_contact, '')), ''), v_code, p_share_kind, p_share_pct, p_status, auth.uid())
    returning id into v_id;
  else
    update app.partners set name = btrim(p_name), org_number = v_org, kind = p_kind, contact_name = nullif(btrim(coalesce(p_contact, '')), ''),
      referral_code = v_code, share_kind = p_share_kind, share_pct = p_share_pct, status = p_status, updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  perform app.admin_log('crm.partner_save', null, 'partner', v_id::text, null,
                        jsonb_build_object('created', p_id is null, 'status', p_status, 'code', v_code));
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_reply_stage(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.crm_can('global.settings')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.crm_stages s where s.key = p_key and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  update app.crm_settings set reply_stage = p_key, changed_by = auth.uid(), changed_at = now() where id;
  perform app.admin_log('crm.reply_stage', null, 'crm_stage', p_key);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_segment_delete(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.crm_can('campaigns.delete')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if exists (select 1 from app.crm_campaigns c where c.segment_id = p_id and c.status in ('scheduled', 'sending')) then
    return jsonb_build_object('ok', false, 'error', 'in_use');
  end if;
  delete from app.crm_segments where id = p_id;
  perform app.admin_log('crm.segment_delete', null, 'crm_segment', p_id::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_segment_save(p_id uuid, p_name text, p_filter jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
begin
  if not (app.crm_can(case when p_id is null then 'campaigns.create' else 'campaigns.edit' end)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if not app.crm_filter_ok(p_filter) then
    return jsonb_build_object('ok', false, 'error', 'invalid_filter');
  end if;
  if exists (select 1 from app.crm_segments g where g.product_id = 'orgpuls' and g.name = btrim(p_name) and g.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  if v_id is null then
    insert into app.crm_segments (name, filter, created_by) values (btrim(p_name), p_filter, auth.uid()) returning id into v_id;
  else
    update app.crm_segments set name = btrim(p_name), filter = p_filter, updated_at = now() where id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  perform app.admin_log('crm.segment_save', null, 'crm_segment', v_id::text, null, jsonb_build_object('name', btrim(p_name), 'filter', p_filter));
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_sender_save(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_reply text := lower(btrim(coalesce(p->>'reply_to', '')));
  v_re constant text := '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$';
begin
  if not (app.crm_can('global.settings')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 80 or v_email !~ v_re or v_reply !~ v_re
     or char_length(coalesce(p->>'signature', '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_id is null then
    insert into app.crm_senders (name, email, reply_to, signature)
    values (btrim(p->>'name'), v_email, v_reply, coalesce(p->>'signature', '')) returning id into v_id;
  else
    update app.crm_senders set name = btrim(p->>'name'), email = v_email, reply_to = v_reply, signature = coalesce(p->>'signature', ''),
      archived_at = case when coalesce((p->>'archived')::boolean, false) then coalesce(archived_at, now()) end
    where id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  perform app.admin_log('crm.sender_save', null, 'crm_sender', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_sla(p_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.crm_can('global.settings')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_minutes is null or p_minutes not between 1 and 1440 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update app.crm_settings set sla_minutes = p_minutes, changed_by = auth.uid(), changed_at = now() where id;
  perform app.admin_log('crm.sla', null, null, null, null, jsonb_build_object('minutes', p_minutes));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_stage_save(p_key text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old app.crm_stages;
  v_kind text := coalesce(p->>'kind', 'open');
  v_exit text := nullif(btrim(coalesce(p->>'exit_criterion', '')), '');
begin
  if not (app.crm_can('global.settings')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_key, '') !~ '^[a-z][a-z0-9_]{1,39}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 60 or coalesce(p->>'sort', '') !~ '^[0-9]{1,4}$'
     or v_kind not in ('open', 'won', 'lost', 'parked') or char_length(coalesce(v_exit, '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_old from app.crm_stages where key = p_key;
  if v_old.key is null then
    insert into app.crm_stages (key, name, sort, kind, exit_criterion) values (p_key, btrim(p->>'name'), (p->>'sort')::int, v_kind, v_exit);
    perform app.admin_log('crm.stage_create', null, 'crm_stage', p_key);
    return jsonb_build_object('ok', true);
  end if;
  if v_old.managed and v_kind <> v_old.kind then
    return jsonb_build_object('ok', false, 'error', 'managed');
  end if;
  if coalesce((p->>'archived')::boolean, false) and (v_old.managed
      or exists (select 1 from app.crm_companies co where co.stage = p_key)
      or exists (select 1 from app.crm_campaigns c where c.status in ('draft', 'scheduled', 'sending') and p_key in (c.stage_target, c.stage_on_send))
      or (select s.reply_stage from app.crm_settings s) = p_key) then
    return jsonb_build_object('ok', false, 'error', 'in_use');
  end if;
  update app.crm_stages set name = btrim(p->>'name'), sort = (p->>'sort')::int, kind = v_kind,
    exit_criterion = case when p ? 'exit_criterion' then v_exit else exit_criterion end,
    archived_at = case when coalesce((p->>'archived')::boolean, false) then coalesce(archived_at, now()) end
  where key = p_key;
  perform app.admin_log('crm.stage_update', null, 'crm_stage', p_key);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_step_save(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_campaigns;
  v_parent app.crm_campaigns;
  v_kind text := p->>'step_kind';
  v_title text := btrim(coalesce(p->>'title', ''));
  v_name text := btrim(coalesce(p->>'name', ''));
  v_days int;
  v_id uuid;
begin
  if not (app.crm_can(case when p_id is null then 'campaigns.create' else 'campaigns.edit' end)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_kind not in ('call', 'linkedin') then
    return jsonb_build_object('ok', false, 'error', 'invalid_step');
  end if;
  if char_length(v_title) not between 1 and 150 then
    return jsonb_build_object('ok', false, 'error', 'no_subject');
  end if;
  if char_length(v_name) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if coalesce(p->>'follow_days', '') !~ '^[0-9]{1,2}$' or (p->>'follow_days')::int not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_follow');
  end if;
  v_days := (p->>'follow_days')::int;

  if p_id is null then
    select * into v_parent from app.crm_campaigns where id = nullif(p->>'follows_id', '')::uuid;
    if v_parent.id is null or v_parent.status = 'cancelled' then
      return jsonb_build_object('ok', false, 'error', 'invalid_follow');
    end if;
    if app.crm_chain_depth(v_parent.id) >= coalesce(app.crm_limit('limit_sequence_mails'), 2147483647) then
      return jsonb_build_object('ok', false, 'error', 'too_many_steps', 'setting', 'limit_sequence_mails');
    end if;
    insert into app.crm_campaigns (name, kind, lang, subject, blocks, list_id, utm_campaign, follows_id, follow_days, follow_when,
                                   follow_auto, step_kind, created_by)
    values (v_name, v_parent.kind, v_parent.lang, v_title, '[]', v_parent.list_id,
            left(v_parent.utm_campaign, 50) || '-' || v_kind, v_parent.id, v_days, 'no_reply', true, v_kind, auth.uid())
    returning id into v_id;
    perform app.admin_log('crm.step_create', null, 'crm_campaign', v_id::text, null, jsonb_build_object('follows', v_parent.id, 'kind', v_kind));
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_c from app.crm_campaigns where id = p_id for update;
  if v_c.id is null or v_c.step_kind = 'mail' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_c.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;
  update app.crm_campaigns set name = v_name, subject = v_title, step_kind = v_kind, follow_days = v_days, updated_at = now()
  where id = p_id;
  perform app.admin_log('crm.step_save', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true, 'id', p_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_suppress(p_email text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
begin
  if not (app.crm_can('contacts.edit')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if coalesce(p_reason, '') not in ('unsubscribed', 'hard_bounce', 'spam', 'erased', 'manual') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_hash := app.crm_hash(v_email);
  insert into app.crm_suppression (email_hash, reason) values (v_hash, p_reason) on conflict (email_hash) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'already');
  end if;
  perform app.admin_log('crm.suppress', null, 'suppression', left(v_hash, 12), null, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_import(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  i int := 0;
  v_email text;
  v_at timestamptz;
  v_tags text[];
  v_inserted int := 0;
  v_updated int := 0;
  v_suppressed int := 0;
  v_rejected jsonb := '[]';
  v_rule text := app.crm_choice('contact_rule');
  v_need_source boolean := app.crm_choice('import_consent_source') = 'required' or app.crm_choice('contact_rule') = 'source_and_basis';
  v_max int := app.crm_limit('limit_contact_import_rows');
  v_source text;
begin
  perform set_config('app.consent_via', 'import', true);  -- 0141: the ledger records the method
  if not (app.crm_can('contacts.import')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- 0192: limits and the contact rule are settings, unlimited and off by default
  if v_max is not null and jsonb_array_length(p_rows) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_contact_import_rows', 'limit', v_max);
  end if;
  if v_rule = 'opt_in_only' then
    return jsonb_build_object('ok', false, 'error', 'blocked_by_setting', 'setting', 'contact_rule');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_email := lower(btrim(coalesce(r->>'email', '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_email'); continue;
    end if;
    v_source := nullif(left(btrim(coalesce(r->>'consent_source', '')), 200), '');
    if char_length(coalesce(v_source, '')) < 3 then
      if v_need_source then
        v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'consent_required'); continue;
      end if;
      v_source := null;
    end if;
    v_at := null;
    if v_source is not null then
      begin
        v_at := coalesce(nullif(btrim(coalesce(r->>'consent_at', '')), '')::timestamptz, now());
      exception when others then
        v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_consent_at'); continue;
      end;
      if v_at > now() + interval '1 day' then
        v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_consent_at'); continue;
      end if;
    end if;
    if coalesce(r->>'role', '') <> '' and r->>'role' not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet') then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_role'); continue;
    end if;
    v_tags := array(select distinct t from unnest(string_to_array(lower(coalesce(r->>'tags', '')), ';')) t
                    where btrim(t) ~ '^[a-z0-9æøå_-]{1,40}$');
    -- 0195: an address held by a deleted contact is restored from the restore list, not re-imported
    if exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email and c.deleted_at is not null) then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'deleted'); continue;
    end if;
    if app.crm_suppressed(v_email) then v_suppressed := v_suppressed + 1; end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang)
    values (v_email, nullif(left(btrim(coalesce(r->>'name', '')), 120), ''), nullif(left(btrim(coalesce(r->>'company', '')), 200), ''),
            case when regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g') ~ '^[0-9]{9}$' then regexp_replace(r->>'org_number', '\s', '', 'g') end,
            nullif(r->>'role', ''), 'import', case when v_source is not null then 'consent' else 'none' end, 'active', v_at, v_source,
            coalesce(v_tags, '{}'), case when r->>'lang' = 'en' then 'en' else 'no' end)
    on conflict (product_id, email) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    else
      update app.crm_contacts c set
        name = coalesce(c.name, nullif(left(btrim(coalesce(r->>'name', '')), 120), '')),
        company = coalesce(c.company, nullif(left(btrim(coalesce(r->>'company', '')), 200), '')),
        role = coalesce(c.role, nullif(r->>'role', '')),
        tags = array(select distinct t from unnest(c.tags || coalesce(v_tags, '{}')) t),
        updated_at = now()
      where c.product_id = 'orgpuls' and c.email = v_email;
      v_updated := v_updated + 1;
    end if;
  end loop;
  perform app.admin_log('crm.import', null, null, null, null,
    jsonb_build_object('rows', i, 'inserted', v_inserted, 'updated', v_updated, 'rejected', jsonb_array_length(v_rejected)));
  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated, 'suppressed', v_suppressed, 'rejected', v_rejected);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_consent_export()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows jsonb;
begin
  if not (app.crm_can('contacts.export')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'at', r.created_at, 'email', c.email, 'name', c.name,
                                               'company', case when app.crm_visible(co.owner_id, co.visibility) then co.name end, 'org_number', case when app.crm_visible(co.owner_id, co.visibility) then co.org_number end, 'purpose', r.purpose,
                                               'status', r.status, 'basis', r.lawful_basis, 'method', r.method,
                                               'doi_sent_at', r.doi_sent_at, 'doi_confirmed_at', r.doi_confirmed_at,
                                               'by', (select u.email::text from auth.users u where u.id = r.created_by))
                    order by r.id), '[]')
  into v_rows
  from app.consent_records r
  left join app.crm_contacts c on c.id = r.contact_id
  left join app.crm_companies co on co.id = r.company_id;
  perform app.admin_log('crm.consent_export', null, 'consent_ledger', null, null, jsonb_build_object('records', jsonb_array_length(v_rows)));
  return jsonb_build_object('ok', true, 'rows', v_rows);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_consent()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.consent_view');
  return (
    with latest as (
      select distinct on (r.contact_id, r.purpose) r.contact_id, r.purpose, r.status, r.lawful_basis
      from app.consent_records r where r.contact_id is not null
      order by r.contact_id, r.purpose, r.id desc
    ), doi as (
      select distinct r.contact_id, r.purpose from app.consent_records r where r.doi_confirmed_at is not null
    )
    select jsonb_build_object('ok', true,
      'kpis', jsonb_build_object(
        'marketing', (select count(*) from latest l where l.purpose = 'marketing' and l.status = 'granted'),
        'contacts', (select count(*) from app.crm_contacts c where c.product_id = 'orgpuls'),
        'with_record', (select count(*) from app.crm_contacts c where c.product_id = 'orgpuls'
                        and exists (select 1 from app.consent_records r where r.contact_id = c.id)),
        'doi_confirmed', (select count(distinct d.contact_id) from doi d),
        'doi_pending', (select count(*) from app.crm_contacts c where c.product_id = 'orgpuls' and c.status = 'pending'),
        'withdrawn_30d', (select count(*) from app.consent_records r where r.status = 'withdrawn' and r.created_at > now() - interval '30 days'),
        'sunset', (select count(*) from latest l join app.crm_contacts c on c.id = l.contact_id
                   where l.purpose = 'marketing' and l.status = 'granted'
                     and coalesce(c.last_engaged_at, c.consent_at, c.created_at) < now() - interval '180 days')),
      'rows', (select coalesce(jsonb_agg(x.j order by x.id desc), '[]') from (
        select r.id, jsonb_build_object('id', r.id, 'at', r.created_at, 'contact_id', r.contact_id, 'company_id', case when app.crm_visible(co.owner_id, co.visibility) then r.company_id end,
                 'who', coalesce(nullif(btrim(c.name), ''), c.email, case when app.crm_visible(co.owner_id, co.visibility) then co.name end), 'purpose', r.purpose,
                 'list', (select l.name_en from app.consent_purposes p join app.crm_lists l on l.id = p.list_id where p.key = r.purpose),
                 'status', r.status, 'basis', r.lawful_basis, 'method', r.method,
                 'doi_sent_at', r.doi_sent_at, 'doi_confirmed_at', r.doi_confirmed_at) as j
        from app.consent_records r
        left join app.crm_contacts c on c.id = r.contact_id
        left join app.crm_companies co on co.id = r.company_id
        order by r.id desc limit 20) x),
      'purposes', (select coalesce(jsonb_agg(jsonb_build_object('key', p.key,
                     'list', (select l.name_en from app.crm_lists l where l.id = p.list_id),
                     'granted', (select count(*) from latest l where l.purpose = p.key and l.status = 'granted'),
                     'consent', (select count(*) from latest l where l.purpose = p.key and l.status = 'granted' and l.lawful_basis = 'consent'),
                     'doi', (select count(*) from latest l join doi d on d.contact_id = l.contact_id and d.purpose = l.purpose
                             where l.purpose = p.key and l.status = 'granted' and l.lawful_basis = 'consent'))
                   order by p.key <> 'marketing', p.key), '[]')
                   from app.consent_purposes p
                   where p.key <> 'phone_outreach' and (p.list_id is not null or p.key = 'marketing')),
      'suppression', jsonb_build_object(
        'count', (select count(*) from app.crm_suppression),
        'rows', (select coalesce(jsonb_agg(jsonb_build_object('head', left(s.email_hash, 4), 'tail', right(s.email_hash, 2),
                                                              'reason', s.reason, 'at', s.at) order by s.at desc), '[]')
                 from (select * from app.crm_suppression order by at desc limit 5) s))));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_activity(p_company uuid, p_contact uuid, p_kind text, p_body text, p_due date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.crm_can('deals.edit')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_kind not in ('note', 'call', 'meeting', 'email', 'task', 'reply') or char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from app.crm_companies c where c.id = p_company and c.deleted_at is null and app.crm_visible(c.owner_id, c.visibility)) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_contact is not null and not exists (select 1 from app.crm_contacts c where c.id = p_contact and c.company_id = p_company and c.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.crm_log(p_company, p_contact, p_kind, btrim(p_body), case when p_kind = 'task' then p_due end);
  -- a first call, mail or meeting moves a new prospect to "contacted"
  if p_kind in ('call', 'email', 'meeting') then
    update app.crm_companies set stage = 'contacted', stage_changed_at = now() where id = p_company and stage = 'new' and org_id is null;
  end if;
  -- 0093: an answer is the signal that counts (not an open, not a click): the company moves on to
  -- the stage the settings name for it, forward only
  if p_kind = 'reply' then
    perform app.crm_advance(p_company, (select s.reply_stage from app.crm_settings s), 'svar mottatt');
  end if;
  perform app.admin_log('crm.activity_add', null, 'crm_company', p_company::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_task_done(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.crm_can('deals.edit')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if exists (select 1 from app.crm_activities a where a.id = p_id and a.done_at is not null) and app.brreg_task_objected(p_id) then
    return jsonb_build_object('ok', false, 'error', 'stopped');
  end if;
  -- 0137: reopening a task also takes back a skip
  update app.crm_activities set done_at = case when done_at is null then now() end, skipped = false where id = p_id and kind = 'task' and deleted_at is null and app.crm_visible_company(company_id);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.task_done', null, 'crm_activity', p_id::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_task_skip(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.crm_can('deals.edit')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update app.crm_activities set done_at = now(), skipped = true
  where id = p_id and kind = 'task' and campaign_id is not null and done_at is null and deleted_at is null and app.crm_visible_company(company_id);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.task_skip', null, 'crm_activity', p_id::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_stage_move(p_ids uuid[], p_to text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_co app.crm_companies;
  v_to text;
  v_moved int := 0;
  v_skipped int := 0;
  v_max int := app.crm_limit('limit_bulk_move');
begin
  if not (app.crm_can('deals.edit') and (coalesce(cardinality(p_ids), 0) <= 1 or app.crm_can('deals.bulk_edit'))) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_max is not null and cardinality(p_ids) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_bulk_move', 'limit', v_max);
  end if;
  if p_to is not null and not exists (select 1 from app.crm_stages s where s.key = p_to and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  foreach v_id in array p_ids loop
    select * into v_co from app.crm_companies where id = v_id for update;
    if v_co.id is null or v_co.org_id is not null or v_co.deleted_at is not null or not app.crm_visible(v_co.owner_id, v_co.visibility) then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_to := coalesce(p_to, (
      select n.key from app.crm_stages cur, app.crm_stages n
      where cur.key = v_co.stage and cur.kind = 'open' and n.kind = 'open' and not n.managed and n.archived_at is null and n.sort > cur.sort
      order by n.sort limit 1));
    if v_to is null or v_to = v_co.stage then
      v_skipped := v_skipped + 1; continue;
    end if;
    update app.crm_companies set stage = v_to, stage_changed_at = now(), updated_at = now() where id = v_id;
    perform app.crm_log(v_id, null, 'stage', v_co.stage || ' → ' || v_to);
    v_moved := v_moved + 1;
  end loop;
  perform app.admin_log('crm.stage_move', null, 'crm_company', null, null,
    jsonb_build_object('to', coalesce(p_to, 'next'), 'moved', v_moved, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'moved', v_moved, 'skipped', v_skipped);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_company_import(p_rows jsonb, p_source text DEFAULT 'brreg'::text, p_tag text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  v_orgnr text;
  v_id uuid;
  v_email text;
  v_basis text;
  v_manager text;
  v_role text;
  v_old text;
  v_tag text := nullif(lower(btrim(coalesce(p_tag, ''))), '');
  v_tags text[];
  v_added int := 0;
  v_known int := 0;
  v_business int := 0;
  v_managers int := 0;
  v_skipped int := 0;
  v_max int := app.crm_limit('limit_register_import_rows');
begin
  perform set_config('app.consent_via', 'import', true);  -- 0141: the ledger records the method
  if not (app.crm_can('deals.import')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1
     or (v_tag is not null and v_tag !~ '^[a-z0-9æøå_-]{1,40}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_max is not null and jsonb_array_length(p_rows) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_register_import_rows', 'limit', v_max);
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_orgnr := regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g');
    if v_orgnr !~ '^[0-9]{9}$' or char_length(btrim(coalesce(r->>'name', ''))) = 0 then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_role := case when r->>'manager_role' in ('DAGL', 'INNH') then r->>'manager_role' end;
    v_manager := case when v_role is not null and char_length(btrim(coalesce(r->>'manager_name', ''))) between 2 and 120
                      then btrim(r->>'manager_name') end;
    if v_manager is null then v_role := null; end if;
    v_tags := coalesce(array(select distinct t from unnest(string_to_array(lower(coalesce(r->>'tags', '')), ';') || v_tag) t
                             where t ~ '^[a-z0-9æøå_-]{1,40}$'), '{}');

    select id into v_id from app.crm_companies where product_id = 'orgpuls' and org_number = v_orgnr;
    -- 0195: a company in the restore list is left as it is; the row is skipped
    if v_id is not null and exists (select 1 from app.crm_companies c where c.id = v_id and (c.deleted_at is not null or not app.crm_visible(c.owner_id, c.visibility))) then
      v_skipped := v_skipped + 1; continue;
    end if;
    if v_id is not null then
      v_known := v_known + 1;
      select manager_name into v_old from app.crm_companies where id = v_id;
      -- the register's address greets whoever the register names now, unless a person renamed it
      if v_manager is not null and v_manager is distinct from v_old then
        update app.crm_contacts c set name = v_manager, role = 'daglig_leder'
         where c.company_id = v_id and c.source = 'brreg' and (c.name is null or c.name = v_old);
      end if;
      update app.crm_companies c
         set manager_name = coalesce(v_manager, c.manager_name),
             manager_role = case when v_manager is not null then v_role else c.manager_role end,
             manager_seen_at = case when v_manager is not null then now() else c.manager_seen_at end,
             tags = array(select distinct t from unnest(c.tags || v_tags) t)
       where c.id = v_id;
    else
      insert into app.crm_companies (org_number, name, form_code, nace_code, nace_label, employees, municipality, municipality_no, website, phone,
                                     source, tags, manager_name, manager_role, manager_seen_at)
      values (v_orgnr, left(btrim(r->>'name'), 200), left(r->>'form_code', 10),
              case when r->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then r->>'nace_code' end, left(r->>'nace_label', 200),
              case when r->>'employees' ~ '^[0-9]{1,7}$' then (r->>'employees')::int end, left(r->>'municipality', 80),
              case when r->>'municipality_no' ~ '^[0-9]{4}$' then r->>'municipality_no' end,
              nullif(left(btrim(coalesce(r->>'website', '')), 300), ''), nullif(left(btrim(coalesce(r->>'phone', '')), 40), ''),
              case when p_source = 'import' then 'import' else 'brreg' end, v_tags,
              v_manager, v_role, case when v_manager is not null then now() end)
      returning id into v_id;
      v_added := v_added + 1;
      perform app.crm_log(v_id, null, 'stage', 'Lagt til fra ' || case when p_source = 'import' then 'import' else 'Brønnøysundregistrene' end);
    end if;
    if v_manager is not null then v_managers := v_managers + 1; end if;

    v_email := lower(btrim(coalesce(r->>'email', '')));
    if v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(v_email) <= 254 then
      v_basis := case when app.crm_role_address(v_email) and coalesce(r->>'form_code', '') <> 'ENK' then 'business' else 'none' end;
      insert into app.crm_contacts (email, name, company, org_number, company_id, role, source, basis, status, consent_source, tags)
      values (v_email, v_manager, left(btrim(r->>'name'), 200), v_orgnr, v_id,
              case when v_manager is not null then 'daglig_leder' end, 'brreg', v_basis, 'active',
              case when v_basis = 'business' then 'role address in Enhetsregisteret' end, v_tags)
      on conflict (product_id, email) do update
        set company_id = coalesce(app.crm_contacts.company_id, excluded.company_id),
            -- the register's manager greets the company address, unless a person has named it otherwise
            name = case when app.crm_contacts.source = 'brreg' then coalesce(excluded.name, app.crm_contacts.name) else app.crm_contacts.name end,
            role = case when app.crm_contacts.source = 'brreg' then coalesce(excluded.role, app.crm_contacts.role) else app.crm_contacts.role end,
            tags = array(select distinct t from unnest(app.crm_contacts.tags || excluded.tags) t)
      where app.crm_contacts.deleted_at is null;
      if v_basis = 'business' then v_business := v_business + 1; end if;
    end if;
  end loop;
  perform app.admin_log('crm.company_import', null, null, null, v_tag,
    jsonb_build_object('added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_save_contact(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_tags text[];
  v_consent_at timestamptz;
  v_rule text := app.crm_choice('contact_rule');
  v_source text := nullif(left(btrim(coalesce(p->>'consent_source', '')), 200), '');
begin
  if not (app.crm_can(case when p_id is null then 'contacts.create' else 'contacts.edit' end)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p ? 'tags' then
    if jsonb_typeof(p->'tags') <> 'array' or jsonb_array_length(p->'tags') > 20
       or exists (select 1 from jsonb_array_elements_text(p->'tags') t where t !~ '^[a-z0-9æøå_-]{1,40}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_tags');
    end if;
    v_tags := array(select distinct jsonb_array_elements_text(p->'tags'));
  end if;
  if coalesce(p->>'role', '') <> '' and p->>'role' not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  if nullif(p->>'company_id', '') is not null and not exists (select 1 from app.crm_companies co where co.id = (p->>'company_id')::uuid and app.crm_visible(co.owner_id, co.visibility)) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if coalesce(p->>'org_number', '') <> '' and regexp_replace(p->>'org_number', '\s', '', 'g') !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;

  if v_id is null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      return jsonb_build_object('ok', false, 'error', 'invalid_email');
    end if;
    -- 0192: the contact rule decides (default none: a consent source is optional)
    if v_rule = 'opt_in_only' then
      return jsonb_build_object('ok', false, 'error', 'blocked_by_setting', 'setting', 'contact_rule');
    end if;
    if char_length(coalesce(v_source, '')) < 3 then
      if v_rule = 'source_and_basis' then
        return jsonb_build_object('ok', false, 'error', 'consent_required', 'setting', 'contact_rule');
      end if;
      v_source := null;
    end if;
    if v_source is not null then
      begin
        v_consent_at := coalesce(nullif(p->>'consent_at', '')::timestamptz, now());
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
      end;
      if v_consent_at > now() + interval '1 day' then
        return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
      end if;
    end if;
    if exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email) then
      -- 0195: a deleted contact keeps its address; the form points to the restore list
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls'
        and c.email = v_email and c.deleted_at is not null) then 'exists_deleted' else 'exists' end);
    end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang, company_id)
    values (v_email, nullif(left(btrim(coalesce(p->>'name', '')), 120), ''), nullif(left(btrim(coalesce(p->>'company', '')), 200), ''),
            nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), ''), nullif(p->>'role', ''),
            case when p->>'source' = 'event' then 'event' else 'manual' end,
            -- without a consent source the contact has no basis, so no campaign mails it (app.crm_mailable)
            case when v_source is not null then 'consent' else 'none' end, 'active', v_consent_at,
            v_source, coalesce(v_tags, '{}'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            nullif(p->>'company_id', '')::uuid)
    returning id into v_id;
    perform app.admin_log('crm.contact_create', null, 'crm_contact', v_id::text, null, jsonb_build_object('consent_source', v_source));
  else
    if exists (select 1 from app.crm_contacts c where c.id = v_id and c.deleted_at is not null) then
      return jsonb_build_object('ok', false, 'error', 'deleted');
    end if;
    -- 0194: a form sends the version it was opened at; a newer one means someone else saved meanwhile
    if nullif(p->>'version', '') is not null and (p->>'version' !~ '^[0-9]{1,9}$'
        or not exists (select 1 from app.crm_contacts c where c.id = v_id and c.version = (p->>'version')::int)) then
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_contacts c where c.id = v_id) then 'stale' else 'not_found' end);
    end if;
    update app.crm_contacts c set
      name = case when p ? 'name' then nullif(left(btrim(coalesce(p->>'name', '')), 120), '') else c.name end,
      company = case when p ? 'company' then nullif(left(btrim(coalesce(p->>'company', '')), 200), '') else c.company end,
      org_number = case when p ? 'org_number' then nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), '') else c.org_number end,
      role = case when p ? 'role' then nullif(p->>'role', '') else c.role end,
      tags = coalesce(v_tags, c.tags),
      lang = case when p->>'lang' in ('no', 'en') then p->>'lang' else c.lang end,
      company_id = case when p ? 'company_id' then nullif(p->>'company_id', '')::uuid else c.company_id end,
      updated_at = now()
    where c.id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    perform app.admin_log('crm.contact_update', null, 'crm_contact', v_id::text, null, p - 'email' - 'consent_source' - 'consent_at');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_company_save(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
  v_old app.crm_companies;
  v_tags text[];
  v_orgnr text := nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), '');
  v_stage text := nullif(p->>'stage', '');
begin
  if not (app.crm_can(case when p_id is null then 'deals.create' else 'deals.edit' end)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p ? 'name' and char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_orgnr is not null and v_orgnr !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;
  -- 0093: any configured stage a person may set: not one that follows the plan, not an archived one
  if v_stage is not null and not exists (select 1 from app.crm_stages s where s.key = v_stage and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if p ? 'tags' then
    if jsonb_typeof(p->'tags') <> 'array' or jsonb_array_length(p->'tags') > 20
       or exists (select 1 from jsonb_array_elements_text(p->'tags') t where t !~ '^[a-z0-9æøå_-]{1,40}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_tags');
    end if;
    v_tags := array(select distinct jsonb_array_elements_text(p->'tags'));
  end if;
  if nullif(p->>'owner_id', '') is not null and not exists (
      select 1 from app.platform_admins a where a.user_id = (p->>'owner_id')::uuid and a.active) then
    return jsonb_build_object('ok', false, 'error', 'invalid_owner');
  end if;
  -- 0119: the deal's yearly value in whole kroner, or empty for none
  if p ? 'value_nok' and nullif(p->>'value_nok', '') is not null and (p->>'value_nok' !~ '^[0-9]{1,9}$' or (p->>'value_nok')::bigint > 100000000) then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;
  begin
    perform nullif(p->>'next_step_at', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_date');
  end;

  -- 0196: who sees the company (SEC-08), changed only where the set allows it
  if p ? 'visibility' then
    if coalesce(p->>'visibility', '') not in ('owner', 'group', 'group_tree', 'everyone') then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if not app.crm_can('deals.visibility') then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
  end if;

  if v_id is null then
    if not p ? 'name' then
      return jsonb_build_object('ok', false, 'error', 'invalid_name');
    end if;
    if v_orgnr is not null and exists (select 1 from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = v_orgnr) then
      -- 0195: a deleted company keeps its organisation number; the form points to the restore list
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_companies c where c.product_id = 'orgpuls'
        and c.org_number = v_orgnr and c.deleted_at is not null) then 'exists_deleted' else 'exists' end);
    end if;
    insert into app.crm_companies (org_number, name, nace_code, employees, municipality, website, phone, source, stage, owner_id,
                                   next_step, next_step_at, tags, value_nok, visibility)
    values (v_orgnr, btrim(p->>'name'), case when p->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then p->>'nace_code' end,
            case when p->>'employees' ~ '^[0-9]{1,7}$' then (p->>'employees')::int end, nullif(left(btrim(coalesce(p->>'municipality', '')), 80), ''),
            nullif(left(btrim(coalesce(p->>'website', '')), 300), ''), nullif(left(btrim(coalesce(p->>'phone', '')), 40), ''),
            'manual', coalesce(v_stage, 'new'), nullif(p->>'owner_id', '')::uuid,
            nullif(left(btrim(coalesce(p->>'next_step', '')), 300), ''), nullif(p->>'next_step_at', '')::date, coalesce(v_tags, '{}'),
            nullif(p->>'value_nok', '')::int, coalesce(nullif(p->>'visibility', ''), app.crm_default_visibility()))
    returning id into v_id;
    perform app.crm_log(v_id, null, 'stage', 'Opprettet: ' || coalesce(v_stage, 'new'));
    perform app.admin_log('crm.company_create', null, 'crm_company', v_id::text);
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_old from app.crm_companies where id = v_id;
  if v_old.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- 0196: a company outside the editor's visibility does not exist for them
  if not app.crm_visible(v_old.owner_id, v_old.visibility) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_old.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'deleted');
  end if;
  -- 0194: a form sends the version it was opened at; a newer one means someone else saved meanwhile
  if nullif(p->>'version', '') is not null and (p->>'version' !~ '^[0-9]{1,9}$' or (p->>'version')::int <> v_old.version) then
    return jsonb_build_object('ok', false, 'error', 'stale', 'version', v_old.version);
  end if;
  if v_stage is not null and v_old.org_id is not null then
    return jsonb_build_object('ok', false, 'error', 'stage_follows_plan');
  end if;
  update app.crm_companies c set
    name = case when p ? 'name' then btrim(p->>'name') else c.name end,
    website = case when p ? 'website' then nullif(left(btrim(coalesce(p->>'website', '')), 300), '') else c.website end,
    phone = case when p ? 'phone' then nullif(left(btrim(coalesce(p->>'phone', '')), 40), '') else c.phone end,
    owner_id = case when p ? 'owner_id' then nullif(p->>'owner_id', '')::uuid else c.owner_id end,
    next_step = case when p ? 'next_step' then nullif(left(btrim(coalesce(p->>'next_step', '')), 300), '') else c.next_step end,
    next_step_at = case when p ? 'next_step_at' then nullif(p->>'next_step_at', '')::date else c.next_step_at end,
    lost_reason = case when p ? 'lost_reason' then nullif(left(btrim(coalesce(p->>'lost_reason', '')), 300), '') else c.lost_reason end,
    value_nok = case when p ? 'value_nok' then nullif(p->>'value_nok', '')::int else c.value_nok end,
    visibility = case when p ? 'visibility' then p->>'visibility' else c.visibility end,
    tags = coalesce(v_tags, c.tags),
    stage = coalesce(v_stage, c.stage),
    stage_changed_at = case when v_stage is not null and v_stage <> c.stage then now() else c.stage_changed_at end,
    updated_at = now()
  where c.id = v_id;
  if v_stage is not null and v_stage <> v_old.stage then
    perform app.crm_log(v_id, null, 'stage', v_old.stage || ' → ' || v_stage
      || case when (select s.kind from app.crm_stages s where s.key = v_stage) = 'lost' and nullif(p->>'lost_reason', '') is not null
              then ': ' || left(p->>'lost_reason', 300) else '' end);
  end if;
  perform app.admin_log('crm.company_update', v_old.org_id, 'crm_company', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_delete(p_entity text, p_ids uuid[], p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids uuid[];
  v_n int;
  v_req uuid;
begin
  if not (app.crm_can(case p_entity when 'contact' then 'contacts.delete' else 'deals.delete' end) and (coalesce(cardinality(p_ids), 0) <= 1 or app.crm_can(case p_entity when 'contact' then 'contacts.bulk_edit' else 'deals.bulk_edit' end))) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_ids := case p_entity
    when 'company' then array(select c.id from app.crm_companies c where c.id = any (p_ids) and c.deleted_at is null and app.crm_visible(c.owner_id, c.visibility))
    when 'contact' then array(select c.id from app.crm_contacts c where c.id = any (p_ids) and c.deleted_at is null)
    else array(select a.id from app.crm_activities a where a.id = any (p_ids) and a.deleted_at is null and app.crm_visible_company(a.company_id)) end;
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if app.crm_choice('delete_approval') = 'on' and cardinality(v_ids) > 1 then
    insert into app.crm_delete_requests (entity, ids, reason, requested_by)
    values (p_entity, v_ids, nullif(left(btrim(coalesce(p_reason, '')), 500), ''), auth.uid())
    returning id into v_req;
    perform app.admin_log('crm.delete_request', null, 'crm_delete_request', v_req::text, nullif(btrim(coalesce(p_reason, '')), ''),
      jsonb_build_object('entity', p_entity, 'count', cardinality(v_ids)));
    return jsonb_build_object('ok', true, 'pending', true, 'request', v_req, 'count', cardinality(v_ids));
  end if;
  v_n := app.crm_soft_delete(p_entity, v_ids, auth.uid());
  perform app.admin_log('crm.delete', null, 'crm_' || p_entity, case when v_n = 1 then v_ids[1]::text end,
    nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('entity', p_entity, 'count', v_n));
  return jsonb_build_object('ok', true, 'deleted', v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_delete_preview(p_entity text, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids uuid[];
begin
  if not (app.crm_can(case p_entity when 'contact' then 'contacts.delete' else 'deals.delete' end) and (coalesce(cardinality(p_ids), 0) <= 1 or app.crm_can(case p_entity when 'contact' then 'contacts.bulk_edit' else 'deals.bulk_edit' end))) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_ids := case p_entity
    when 'company' then array(select c.id from app.crm_companies c where c.id = any (p_ids) and c.deleted_at is null and app.crm_visible(c.owner_id, c.visibility))
    when 'contact' then array(select c.id from app.crm_contacts c where c.id = any (p_ids) and c.deleted_at is null)
    else array(select a.id from app.crm_activities a where a.id = any (p_ids) and a.deleted_at is null and app.crm_visible_company(a.company_id)) end;
  perform app.admin_log('crm.delete_preview', null, 'crm_' || p_entity, null, null,
    jsonb_build_object('entity', p_entity, 'count', cardinality(v_ids)));
  return jsonb_build_object('ok', true, 'entity', p_entity, 'count', cardinality(v_ids),
    'missing', (select count(distinct x) from unnest(p_ids) x) - cardinality(v_ids),
    'names', (select coalesce(jsonb_agg(app.crm_record_label(p_entity, x.id) order by x.n), '[]')
              from unnest(v_ids) with ordinality x(id, n) where x.n <= 10),
    'approval', app.crm_choice('delete_approval') = 'on' and cardinality(v_ids) > 1,
    'window', app.crm_limit('restore_window_days'),
    'effects', case p_entity
      when 'company' then jsonb_build_object(
        'activities', (select count(*) from app.crm_activities a where a.company_id = any (v_ids) and a.deleted_at is null),
        'open_tasks', (select count(*) from app.crm_activities a where a.company_id = any (v_ids) and a.deleted_at is null and a.kind = 'task' and a.done_at is null),
        'contacts', (select count(*) from app.crm_contacts c where c.company_id = any (v_ids) and c.deleted_at is null))
      when 'contact' then jsonb_build_object(
        'lists', (select count(*) from app.crm_list_members m where m.contact_id = any (v_ids) and m.status = 'subscribed'),
        'consent_records', (select count(*) from app.consent_records r where r.contact_id = any (v_ids)),
        'queued', (select count(*) from app.crm_sends s where s.contact_id = any (v_ids) and s.status in ('pending', 'sending', 'held')))
      else '{}'::jsonb end);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_restore(p_entity text, p_ids uuid[], p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r jsonb;
begin
  if not (app.crm_can(case p_entity when 'contact' then 'contacts.delete' else 'deals.delete' end)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_r := app.crm_undelete(p_entity, app.crm_visible_ids(p_entity, p_ids));
  if (v_r->>'restored')::int = 0 then
    return jsonb_build_object('ok', false, 'error', case when p_entity = 'activity' then 'company_deleted' else 'not_found' end);
  end if;
  perform app.admin_log('crm.restore', null, 'crm_' || p_entity, case when cardinality(p_ids) = 1 then p_ids[1]::text end,
    nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('entity', p_entity) || v_r);
  return jsonb_build_object('ok', true) || v_r;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_purge_now(p_entity text, p_ids uuid[], p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n int;
begin
  if app.admin_role() is distinct from 'super_admin' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_n := app.crm_purge(p_entity, app.crm_visible_ids(p_entity, p_ids));
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.purge', null, 'crm_' || p_entity, case when cardinality(p_ids) = 1 then p_ids[1]::text end,
    nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('entity', p_entity, 'count', v_n));
  return jsonb_build_object('ok', true, 'purged', v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_delete_decide(p_request uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r app.crm_delete_requests;
  v_n int := 0;
begin
  if not ((app.crm_can('deals.delete') or app.crm_can('contacts.delete'))) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if p_approve is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into r from app.crm_delete_requests q where q.id = p_request for update;
  if r.id is null or r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.requested_by = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'own_request');
  end if;
  if not app.crm_can(case r.entity when 'contact' then 'contacts.delete' else 'deals.delete' end) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_approve then
    v_n := app.crm_soft_delete(r.entity, app.crm_visible_ids(r.entity, r.ids), r.requested_by);
  end if;
  update app.crm_delete_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
  where id = r.id;
  perform app.admin_log(case when p_approve then 'crm.delete_approve' else 'crm.delete_reject' end, null, 'crm_delete_request', r.id::text,
    nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('entity', r.entity, 'count', cardinality(r.ids), 'deleted', v_n));
  return jsonb_build_object('ok', true, 'deleted', v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_trash(p_entity text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days int := app.crm_limit('restore_window_days');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_entity is not null and p_entity not in ('company', 'contact', 'activity') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('crm.trash', null, null, null, null, jsonb_build_object('entity', p_entity));
  return (
    with del as (
      select 'company'::text as entity, c.id, c.deleted_at, c.deleted_by, c.deleted_source, true as restorable,
             (select count(*) from app.crm_activities a where a.deleted_with = c.id) as with_activities
      from app.crm_companies c where c.deleted_at is not null and app.crm_visible(c.owner_id, c.visibility)
      union all
      select 'contact', c.id, c.deleted_at, c.deleted_by, c.deleted_source, true, 0
      from app.crm_contacts c where c.deleted_at is not null
      union all
      select 'activity', a.id, a.deleted_at, a.deleted_by, a.deleted_source,
             exists (select 1 from app.crm_companies c where c.id = a.company_id and c.deleted_at is null), 0
      from app.crm_activities a where a.deleted_at is not null and a.deleted_with is null and app.crm_visible_company(a.company_id)
    )
    select jsonb_build_object('ok', true,
      'window', v_days,
      'approval', app.crm_choice('delete_approval') = 'on',
      'may_write', app.crm_can('deals.delete') or app.crm_can('contacts.delete'),
      'may_purge', coalesce(app.admin_role() = 'super_admin', false),
      'counts', jsonb_build_object(
        'company', (select count(*) from del where entity = 'company'),
        'contact', (select count(*) from del where entity = 'contact'),
        'activity', (select count(*) from del where entity = 'activity')),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('entity', x.entity, 'id', x.id, 'label', app.crm_record_label(x.entity, x.id),
                 'deleted_at', x.deleted_at, 'deleted_by', u.email, 'source', x.deleted_source, 'restorable', x.restorable,
                 'with_activities', x.with_activities,
                 'purge_at', case when v_days is not null then x.deleted_at + make_interval(days => v_days) end)
               order by x.deleted_at desc, x.id), '[]')
               from del x left join auth.users u on u.id = x.deleted_by
               where p_entity is null or x.entity = p_entity),
      'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'entity', q.entity, 'count', cardinality(q.ids),
                     'names', (select coalesce(jsonb_agg(app.crm_record_label(q.entity, i.id) order by i.n), '[]')
                               from unnest(app.crm_visible_ids(q.entity, q.ids)) with ordinality i(id, n) where i.n <= 5),
                     'reason', q.reason, 'requested_at', q.requested_at, 'requested_by', u.email, 'mine', q.requested_by = auth.uid())
                   order by q.requested_at), '[]')
                   from app.crm_delete_requests q left join auth.users u on u.id = q.requested_by
                   where q.status = 'pending'))
  );
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_companies(p_q text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_owner uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.companies');
  return jsonb_build_object('ok', true,
    -- 0196: what the set allows, for the screen
    'may', app.crm_may('deals'),
    'stages', (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (select stage, count(*) n from app.crm_companies where deleted_at is null and app.crm_visible(owner_id, visibility) group by stage) x),
    'tasks_due', (select count(*) from app.crm_activities a where a.deleted_at is null and app.crm_visible_company(a.company_id) and a.kind = 'task' and a.done_at is null and a.due_at <= current_date),
    'rows', (select coalesce(jsonb_agg(app.crm_company_json(co) order by co.next_step_at nulls last, co.updated_at desc), '[]') from (
        select co.* from app.crm_companies co
        -- 0195: a deleted company is in the restore list, not here
        where co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility) and (v_q is null or lower(co.name) like '%' || v_q || '%' or co.org_number = v_q or v_q = any (co.tags))
          and (p_stage is null or co.stage = p_stage)
          and (p_owner is null or co.owner_id = p_owner)
        order by co.next_step_at nulls last, co.updated_at desc limit app.crm_limit('limit_company_read')) co),
    -- 0192: the list's cap is a setting (null: every company); the page says when it is reached
    'limit', app.crm_limit('limit_company_read'));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_company(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_co app.crm_companies;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_co from app.crm_companies where id = p_id;
  if v_co.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- 0196: a company outside the viewer's visibility does not exist for them
  if not app.crm_visible(v_co.owner_id, v_co.visibility) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- 0195: a deleted company is read from the restore list; its page says so
  if v_co.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'deleted');
  end if;
  perform app.admin_log('crm.company', v_co.org_id, 'crm_company', p_id::text);
  return jsonb_build_object('ok', true, 'company', app.crm_company_json(v_co),
    -- 0196: what the set allows, for the screen
    'may', app.crm_may('deals'), 'may_contacts', app.crm_may('contacts'),
    -- the score a «lead score» callback is made at (app.lead_rules), for its title
    'rules', app.lead_rules(),
    'contacts', (select coalesce(jsonb_agg(app.crm_contact_json(c) order by c.created_at), '[]') from app.crm_contacts c where c.company_id = p_id and c.deleted_at is null),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'body', a.body, 'due_at', a.due_at, 'done_at', a.done_at,
                     'admin_email', a.admin_email, 'created_at', a.created_at,
                     'contact', (select coalesce(c.name, c.email) from app.crm_contacts c where c.id = a.contact_id),
                     'origin', a.origin,
                     'trigger', (select t.kind from app.brreg_outreach o join app.brreg_triggers t on t.id = o.trigger_id where o.activity_id = a.id),
                     'stopped', a.kind = 'task' and app.brreg_task_objected(a.id)) order by a.created_at desc), '[]')
                   from app.crm_activities a where a.company_id = p_id and a.deleted_at is null),
    'mail', (select jsonb_build_object('sent', count(*) filter (where s.status = 'sent'), 'opened', count(*) filter (where s.opened_at is not null),
                     'clicked', count(*) filter (where s.clicked_at is not null), 'last_at', max(s.sent_at))
             from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id where c.company_id = p_id and s.kind = 'campaign'),
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', a.user_id, 'email', u.email) order by u.email), '[]')
               from app.platform_admins a join auth.users u on u.id = a.user_id
               where a.active and a.role in ('super_admin', 'marketing')));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_contacts(p_q text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.contacts', null, null, null, null, jsonb_build_object('q', v_q is not null, 'type', p_type));
  return jsonb_build_object('ok', true,
    -- 0196: what the set allows, for the screen
    'may', app.crm_may('contacts'),
    'counts', (select jsonb_build_object(
        'total', count(*),
        'prospect', count(*) filter (where t = 'prospect'), 'trial', count(*) filter (where t = 'trial'),
        'customer', count(*) filter (where t = 'customer'), 'former', count(*) filter (where t = 'former'),
        'mailable', count(*) filter (where m), 'pending', count(*) filter (where st = 'pending'),
        'unsubscribed', count(*) filter (where st = 'unsubscribed'))
      from (select app.crm_type(c.user_id, c.org_id, c.source) t, app.crm_mailable(c) m, c.status st from app.crm_contacts c where c.deleted_at is null) x),
    'suppressed', (select count(*) from app.crm_suppression),
    'customer_exception', (select s.customer_exception from app.crm_settings s),
    'waiting', (select count(*) from app.crm_sends s where s.status in ('pending', 'sending')),
    'rows', (select coalesce(jsonb_agg(app.crm_contact_json(c) order by c.created_at desc), '[]') from (
        select c.* from app.crm_contacts c left join app.organizations o on o.id = c.org_id
        -- 0195: a deleted contact is in the restore list, not here
        where c.deleted_at is null and (v_q is null or c.email like '%' || v_q || '%' or lower(coalesce(c.name, '')) like '%' || v_q || '%'
               or lower(coalesce(c.company, o.name, '')) like '%' || v_q || '%' or v_q = any (c.tags))
          and (p_type is null or app.crm_type(c.user_id, c.org_id, c.source) = p_type)
        -- 0192: no cap unless the setting sets one; a caller's own p_limit narrows it further
        order by c.created_at desc
        -- (greatest() skips a null, so a missing p_limit is spelled out rather than greatest(null, 1) = 1)
        limit nullif(least(case when p_limit is null then 2147483647 else greatest(p_limit, 1) end,
                           coalesce(app.crm_limit('limit_contact_read'), 2147483647)), 2147483647)) c),
    'limit', app.crm_limit('limit_contact_read'));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_contact(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_contacts;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_contacts where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- 0195: a deleted contact is read from the restore list; its page says so
  if v_c.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'deleted');
  end if;
  perform app.admin_log('crm.contact', v_c.org_id, 'crm_contact', p_id::text);
  return jsonb_build_object('ok', true, 'contact', app.crm_contact_json(v_c),
    -- 0196: what the set allows, for the screen
    'may', app.crm_may('contacts'), 'may_campaigns', app.crm_may('campaigns'),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', s.kind, 'campaign_id', s.campaign_id, 'campaign', g.name, 'status', s.status, 'created_at', s.created_at,
        'sent_at', s.sent_at, 'delivery', s.delivery, 'opened_at', s.opened_at, 'clicked_at', s.clicked_at,
        'unsubscribed_at', s.unsubscribed_at) order by s.created_at desc), '[]')
      from app.crm_sends s left join app.crm_campaigns g on g.id = s.campaign_id where s.contact_id = p_id));
end $function$;

CREATE OR REPLACE FUNCTION app.crm_contact_json(c app.crm_contacts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', c.id, 'email', c.email, 'name', c.name, 'company', coalesce(co.name, c.company, o.name), 'org_number', coalesce(c.org_number, co.org_number, o.org_number),
    'org_id', c.org_id, 'org_name', o.name, 'company_id', c.company_id, 'role', c.role, 'source', c.source, 'basis', c.basis, 'status', c.status,
    'type', app.crm_type(c.user_id, c.org_id, c.source), 'mailable', app.crm_mailable(c), 'suppressed', app.crm_suppressed(c.email),
    'consent_at', c.consent_at, 'consent_source', c.consent_source, 'tags', to_jsonb(c.tags), 'lang', c.lang,
    'last_engaged_at', c.last_engaged_at, 'created_at', c.created_at, 'version', c.version,
    'lists', (select coalesce(jsonb_agg(l.key order by l.sort), '[]') from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
              where m.contact_id = c.id and m.status = 'subscribed'))
  from (select 1) one
  left join app.organizations o on o.id = c.org_id
  -- 0195: a deleted company is not named
  left join app.crm_companies co on co.id = c.company_id and co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility)
$function$;

CREATE OR REPLACE FUNCTION public.admin_crm_history(p_entity text, p_record uuid, p_before bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_page int := 50;
  v_rows jsonb;
  v_more boolean;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_record is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- 0196: a record outside the viewer's visibility has no history for them
  if (p_entity = 'company' and not app.crm_visible_company(p_record))
     or (p_entity = 'activity' and not app.crm_visible_company((select a.company_id from app.crm_activities a where a.id = p_record))) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.history', null, 'crm_' || p_entity, p_record::text);
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'field', x.field, 'old', x.old_value, 'new', x.new_value,
                                               'by', u.email, 'source', x.source, 'at', x.at) order by x.id desc), '[]')
    into v_rows
  from (select * from app.crm_changes c where c.entity = p_entity and c.record_id = p_record and (p_before is null or c.id < p_before)
        order by c.id desc limit v_page) x
  left join auth.users u on u.id = x.actor;
  select exists (select 1 from app.crm_changes c where c.entity = p_entity and c.record_id = p_record
                 and c.id < coalesce((select min((r->>'id')::bigint) from jsonb_array_elements(v_rows) r), 0))
    into v_more;
  return jsonb_build_object('ok', true, 'changes', v_rows, 'more', v_more,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('name', e.name, 'at', e.occurred_at, 'source', e.source, 'by', u.email,
                                                            'fields', to_jsonb(e.fields)) order by e.id desc), '[]')
               from (select * from app.crm_events e where e.entity = p_entity and e.record_id = p_record
                     and e.name not like '%.updated' order by e.id desc limit v_page) e
               left join auth.users u on u.id = e.actor),
    'created_by', (select u.email from auth.users u where u.id = case p_entity
                     when 'company' then (select x.created_by from app.crm_companies x where x.id = p_record)
                     when 'contact' then (select x.created_by from app.crm_contacts x where x.id = p_record) end),
    'updated_by', (select u.email from auth.users u where u.id = case p_entity
                     when 'company' then (select x.updated_by from app.crm_companies x where x.id = p_record)
                     when 'contact' then (select x.updated_by from app.crm_contacts x where x.id = p_record)
                     else (select x.updated_by from app.crm_activities x where x.id = p_record) end));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_pipeline_summary(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quarter timestamptz := date_trunc('quarter', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
  v_history timestamptz := (select s.stage_history_since from app.crm_settings s where s.id);
  v_since timestamptz;
begin
  if not app.crm_can('deals.reports') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.pipeline');
  v_since := greatest(coalesce(p_from, v_quarter), coalesce(v_history, now()));
  return jsonb_build_object('ok', true,
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'count', x.n, 'valued', x.valued, 'value', x.value) order by x.sort), '[]')
               from (select s.key, s.sort, count(c.id) as n, count(c.value_nok) as valued, coalesce(sum(c.value_nok), 0) as value
                     from app.crm_stages s left join app.crm_companies c on c.stage = s.key and c.deleted_at is null and app.crm_visible(c.owner_id, c.visibility)
                     group by s.key, s.sort) x),
    'open', (select jsonb_build_object('count', count(*), 'valued', count(c.value_nok), 'value', coalesce(sum(c.value_nok), 0))
             from app.crm_companies c join app.crm_stages s on s.key = c.stage
             where c.deleted_at is null and app.crm_visible(c.owner_id, c.visibility) and s.kind = 'open' and s.archived_at is null),
    'won_quarter', (select jsonb_build_object('count', count(*), 'valued', count(c.value_nok), 'value', coalesce(sum(c.value_nok), 0))
                    from app.crm_companies c join app.crm_stages s on s.key = c.stage
                    where c.deleted_at is null and app.crm_visible(c.owner_id, c.visibility) and s.kind = 'won' and c.stage_changed_at >= v_quarter),
    'closed', (select jsonb_build_object('won', count(*) filter (where x.to_kind = 'won'), 'lost', count(*) filter (where x.to_kind = 'lost'))
               from (select distinct on (h.company_id) h.company_id, h.to_kind
                     from app.crm_stage_changes h
                     join app.crm_companies hc on hc.id = h.company_id and hc.deleted_at is null and app.crm_visible(hc.owner_id, hc.visibility)
                     where h.changed_at >= v_since and h.to_kind in ('won', 'lost') and h.from_kind in ('open', 'parked')
                     order by h.company_id, h.changed_at desc, h.id desc) x),
    'since', v_since,
    'history_since', v_history,
    'quarter', v_quarter);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.crm_can('campaigns.reports') or app.crm_can('deals.reports')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.overview');
  return jsonb_build_object('ok', true,
    'mail', (select jsonb_build_object(
        'campaigns', count(distinct s.campaign_id), 'sent', count(*),
        'open_rate', round(avg((s.opened_at is not null)::int) * 100, 1),
        'click_rate', round(avg((s.clicked_at is not null)::int) * 100, 1),
        'ctor', round(100.0 * count(*) filter (where s.clicked_at is not null) / nullif(count(*) filter (where s.opened_at is not null), 0), 1),
        'unsubscribe_rate', round(avg((s.unsubscribed_at is not null)::int) * 100, 2),
        'bounce_rate', round(avg((s.delivery in ('hard_bounce', 'soft_bounce', 'invalid', 'blocked'))::int) * 100, 2))
      from app.crm_sends s where s.kind = 'campaign' and s.status = 'sent' and s.sent_at > now() - interval '90 days'),
    'subscribers', (select jsonb_build_object(
        'total', count(distinct m.contact_id) filter (where m.status = 'subscribed'),
        'joined_30d', count(*) filter (where m.subscribed_at > now() - interval '30 days'),
        'left_30d', count(*) filter (where m.unsubscribed_at > now() - interval '30 days'))
      from app.crm_list_members m),
    'pipeline', (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (select stage, count(*) n from app.crm_companies where deleted_at is null and app.crm_visible(owner_id, visibility) group by stage) x),
    'won_90d', (select count(*) from app.crm_companies c where c.deleted_at is null and app.crm_visible(c.owner_id, c.visibility) and c.stage = 'customer' and c.stage_changed_at > now() - interval '90 days'),
    'trials_90d', (select count(*) from app.crm_companies c where c.deleted_at is null and app.crm_visible(c.owner_id, c.visibility) and c.stage in ('trial', 'customer') and c.created_at > now() - interval '90 days'
                   and c.source = 'signup'),
    'tasks_due', (select count(*) from app.crm_activities a where a.deleted_at is null and app.crm_visible_company(a.company_id) and a.kind = 'task' and a.done_at is null and a.due_at <= current_date),
    'signups_from_email', (select count(*) from app.org_attribution a where a.channel = 'email'));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_stages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.stages');
  return jsonb_build_object('ok', true,
    'reply_stage', (select s.reply_stage from app.crm_settings s),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'name', s.name, 'sort', s.sort, 'kind', s.kind, 'managed', s.managed,
               'archived', s.archived_at is not null, 'exit_criterion', s.exit_criterion,
               'companies', (select count(*) from app.crm_companies co where co.stage = s.key and co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility)),
               'campaigns', (select count(*) from app.crm_campaigns c where s.key in (c.stage_target, c.stage_on_send)))
             order by s.sort, s.key), '[]') from app.crm_stages s));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_inbox(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_sla int := (select s.sla_minutes from app.crm_settings s where s.id);
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.inbox');
  return (
    with leads as (
      -- a trial sign-up: the company the sign-up made
      select 'trial'::text as kind, co.id as company_id, null::uuid as contact_id, co.name as company,
             (select coalesce(c.name, c.email) from app.crm_contacts c where c.company_id = co.id order by c.created_at limit 1) as person,
             co.employees, co.stage, co.created_at,
             (select min(a.created_at) from app.crm_activities a where a.company_id = co.id
                and a.kind in ('call', 'email', 'meeting', 'reply', 'note') and a.created_at >= co.created_at) as answered_at
      from app.crm_companies co
      where co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility) and co.source = 'signup' and co.created_at >= now() - make_interval(days => v_days)
      union all
      -- someone who wrote to us or asked for a demo
      select c.source, c.company_id, c.id, coalesce(co.name, c.company), coalesce(c.name, c.email),
             co.employees, co.stage, c.created_at,
             (select min(a.created_at) from app.crm_activities a where (a.contact_id = c.id or (c.company_id is not null and a.company_id = c.company_id))
                and a.kind in ('call', 'email', 'meeting', 'reply', 'note') and a.created_at >= c.created_at)
      from app.crm_contacts c left join app.crm_companies co on co.id = c.company_id and co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility)
      where c.deleted_at is null and c.source in ('contact_form', 'demo') and c.created_at >= now() - make_interval(days => v_days)
    ),
    week as (select * from leads where created_at >= now() - interval '7 days')
    select jsonb_build_object('ok', true, 'sla_minutes', v_sla,
      'awaiting', (select count(*) from leads where answered_at is null),
      'week', jsonb_build_object(
        'leads', (select count(*) from week),
        'trials', (select count(*) from week where kind = 'trial'),
        'answered', (select count(*) from week where answered_at is not null),
        'median_minutes', (select percentile_cont(0.5) within group (order by extract(epoch from answered_at - created_at) / 60)
                           from week where answered_at is not null),
        'within_sla', (select count(*) from week where answered_at is not null and answered_at - created_at <= make_interval(mins => v_sla))),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'company_id', l.company_id, 'contact_id', l.contact_id,
                 'company', l.company, 'person', l.person, 'employees', l.employees, 'stage', l.stage,
                 'created_at', l.created_at, 'answered_at', l.answered_at)
               order by (l.answered_at is not null), l.created_at desc), '[]') from leads l))
  );
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_tasks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.tasks');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'company_id', a.company_id, 'company', co.name, 'body', a.body, 'due_at', a.due_at,
      'admin_email', a.admin_email) order by a.due_at nulls last, a.created_at), '[]')
    from app.crm_activities a join app.crm_companies co on co.id = a.company_id
    where a.deleted_at is null and co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility) and a.kind = 'task' and a.done_at is null));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_task_list(p_view text DEFAULT 'open'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_view, '') not in ('open', 'done', 'all') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- contacts' names, a register's general manager and outreach addresses: read under audit
  perform app.admin_log('crm.task_list', null, null, null, null, jsonb_build_object('view', p_view));
  return jsonb_build_object('ok', true,
    -- the score a «lead score» callback was made at (app.lead_rules), for its title
    'rules', app.lead_rules(),
    'counts', (select jsonb_build_object(
        'open', count(*) filter (where a.done_at is null),
        'done', count(*) filter (where a.done_at > now() - interval '90 days'),
        'all', count(*) filter (where a.done_at is null or a.done_at > now() - interval '90 days'),
        -- 0143: made by a journey, a rule or a trigger; and the open ones on a one-hour SLA
        'automated', count(*) filter (where (a.campaign_id is not null or a.origin is not null)
                                        and (a.done_at is null or a.done_at > now() - interval '90 days')),
        'sla_open', count(*) filter (where a.sla_due_at is not null and a.done_at is null))
      from app.crm_activities a where a.deleted_at is null and app.crm_visible_company(a.company_id) and a.kind = 'task'),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'company_id', a.company_id, 'company', co.name,
        'contact', (select coalesce(nullif(btrim(c.name), ''), c.email) from app.crm_contacts c where c.id = a.contact_id),
        'body', a.body, 'due_at', a.due_at, 'done_at', a.done_at, 'created_at', a.created_at, 'admin_email', a.admin_email,
        'skipped', a.skipped, 'campaign_id', a.campaign_id, 'step_kind', st.step_kind,
        'journey', (select r.name from app.crm_campaigns r where r.id = app.crm_chain_root(st.id)),
        'origin', a.origin, 'rule', a.rule, 'task_kind', a.task_kind, 'sla_due_at', a.sla_due_at,
        'sla_left', case when a.sla_due_at is not null and a.done_at is null then app.business_minutes(now(), a.sla_due_at) end,
        'sla_met', case when a.sla_due_at is not null and a.done_at is not null then a.done_at <= a.sla_due_at end,
        'trigger', (select t.kind from app.brreg_outreach o join app.brreg_triggers t on t.id = o.trigger_id where o.activity_id = a.id),
        'manager', (select o.manager_name from app.brreg_outreach o where o.activity_id = a.id),
        -- where the outreach goes: a letter to the business address the register gives, an email to the
        -- generic address (never one on the suppression list: brreg_suppression_reroute makes such an
        -- outreach a call or a letter, and this reads the list again); and whether an objection stopped it
        'to', (select case o.channel when 'letter' then e.address
                                     when 'email' then case when not app.crm_suppressed(o.email) then o.email end end
               from app.brreg_outreach o join app.brreg_entities e on e.org_number = o.org_number where o.activity_id = a.id),
        'stopped', app.brreg_task_objected(a.id))
        order by (a.done_at is not null), a.sla_due_at nulls last, a.due_at nulls last, a.done_at desc, a.created_at), '[]')
      from app.crm_activities a join app.crm_companies co on co.id = a.company_id
      left join app.crm_campaigns st on st.id = a.campaign_id
      where a.deleted_at is null and co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility) and a.kind = 'task'
        and case p_view when 'open' then a.done_at is null
                        when 'done' then a.done_at > now() - interval '90 days'
                        else a.done_at is null or a.done_at > now() - interval '90 days' end));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role app.platform_role := app.admin_role();
  v_support boolean;
  v_finance boolean;
begin
  if v_role is null or v_role = 'editor' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('attention.view');
  v_support := v_role in ('super_admin', 'support');
  v_finance := v_role in ('super_admin', 'support', 'finance');
  return jsonb_build_object('ok', true,
    'trials', (
      select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'ends_at', b.trial_ends_at,
               'employees', (select count(*) from app.employees e where e.org_id = o.id and e.active))
             order by b.trial_ends_at), '[]')
      from app.billing b join app.organizations o on o.id = b.org_id
      where not app.is_demo(o.id) and b.confirmed_at is null and b.cancelled_at is null
        and b.trial_ends_at > now() and b.trial_ends_at <= now() + interval '7 days'),
    'deletions', case when v_finance then (
      select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'due_at', b.deletion_due_at) order by b.deletion_due_at), '[]')
      from app.billing b join app.organizations o on o.id = b.org_id
      where not app.is_demo(o.id) and b.deletion_due_at is not null and b.deletion_due_at <= now() + interval '14 days') else '[]'::jsonb end,
    'tickets', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'org_name', coalesce(o.name, t.requester_org),
               'due_at', t.first_response_due) order by t.first_response_due), '[]')
      from app.tickets t left join app.organizations o on o.id = t.org_id
      where t.status not in ('resolved', 'closed') and t.first_responded_at is null and t.first_response_due < now()) else '[]'::jsonb end,
    'failures', case when v_support then (
      select count(*) from app.outbox x where x.failed_at > now() - interval '24 hours') else 0 end,
    'tasks', case when app.crm_can_read() then (
      select count(*) from app.crm_activities a where a.deleted_at is null and app.crm_visible_company(a.company_id) and a.kind = 'task' and a.done_at is null and a.due_at < now()) else 0 end);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_lead_scores()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- names and addresses of open leads: read under audit, as the CRM's other contact reads are
  perform app.admin_log('crm.lead_scores', null, null, null, null, null);
  return jsonb_build_object('ok', true,
    -- the rules as the database scores them, row or no row
    'fit_rules', app.fit_score(null, null, null, null, null)->'parts',
    -- the rules fit and routing apply (app.brreg_rules, app.lead_rules), which the card writes: the
    -- target industries, the size band, the thresholds and their windows, the founder score
    'rules', app.brreg_rules() || app.lead_rules(),
    'intent_rules', app.intent_score(false)->'parts',
    'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(nullif(btrim(c.name), ''), c.email),
             'company', co.name, 'company_id', co.id) || s.v
           order by (s.v->>'total')::int desc, c.name), '[]')
    from app.crm_contacts c
    join app.crm_companies co on co.id = c.company_id and app.crm_visible(co.owner_id, co.visibility)
    cross join lateral (select app.lead_score(c.id) as v offset 0) s
    where c.id in (select app.lead_contacts())));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_brreg_triggers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p app.brreg_polls;
  v_min int;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.brreg_triggers');
  select * into p from app.brreg_polls x where x.status = 'done' order by x.finished_at desc limit 1;
  v_min := (app.brreg_rules()->>'fit_min')::int;
  return jsonb_build_object('ok', true,
    'dry_run', (select s.dry_run from app.brreg_settings s),
    -- the rules the engine applies, for «Edit triggers» (the thresholds, the industries, the fit minimum)
    'rules', app.brreg_rules(),
    'last', case when p.id is null then null else jsonb_build_object('id', p.id, 'finished_at', p.finished_at, 'changes', p.changes) end,
    -- the latest attempt that failed after the last finished poll (the feed's error code, or no_answer: a
    -- request nobody answered within the hour), so an engine that keeps failing never reads as a run
    'failed', (select jsonb_build_object('at', x.at, 'error', x.error) from (
                 select coalesce(f.finished_at, f.requested_at + interval '1 hour') as at, coalesce(f.error, 'no_answer') as error
                 from app.brreg_polls f
                 where f.status = 'failed' or (f.status in ('requested', 'running') and f.requested_at < now() - interval '1 hour')) x
               where x.at > coalesce(p.finished_at, '-infinity'::timestamptz) order by x.at desc limit 1),
    'pending', exists (select 1 from app.brreg_polls x where x.status in ('requested', 'running') and x.requested_at > now() - interval '1 hour'),
    'kpis', jsonb_build_object(
      'raised', (select count(*) from app.brreg_triggers t where t.poll_id = p.id),
      'matched', (select count(*) from app.brreg_triggers t where t.poll_id = p.id and t.fit >= v_min),
      'queued', (select count(*) from app.brreg_outreach o where o.status in ('queued', 'assigned')),
      'held_out', (select count(*) from app.brreg_outreach o where o.status = 'holdout'),
      'dnc', (select count(*) from app.brreg_dnc),
      'purged', (select count(*) from app.brreg_purges x where x.purged_at is not null)),
    'types', (select jsonb_agg(jsonb_build_object('kind', k.kind,
                'n', (select count(*) from app.brreg_triggers t where t.poll_id = p.id and t.kind = k.kind),
                'fit', (select count(*) from app.brreg_triggers t where t.poll_id = p.id and t.kind = k.kind and t.fit >= v_min),
                'tasks', (select count(*) from app.brreg_triggers t join app.brreg_outreach o on o.trigger_id = t.id
                          where t.poll_id = p.id and t.kind = k.kind and o.status in ('queued', 'assigned', 'sent')),
                'hold', (select count(*) from app.brreg_triggers t join app.brreg_outreach o on o.trigger_id = t.id
                         where t.poll_id = p.id and t.kind = k.kind and o.status = 'holdout')) order by k.ord)
              from (values ('threshold_5', 1), ('threshold_30', 2), ('company_new', 3), ('manager_changed', 4)) k(kind, ord)),
    'queue', (select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]') from (
      select o.created_at, jsonb_build_object('id', o.id, 'org', e.name, 'org_number', e.org_number, 'kind', t.kind,
               'from', t.employees_from, 'to', t.employees_to, 'nace', e.nace_code, 'fit', t.fit, 'channel', o.channel,
               'email_local', split_part(o.email, '@', 1), 'status', o.status, 'company_id', o.company_id) as j
      from app.brreg_outreach o join app.brreg_triggers t on t.id = o.trigger_id join app.brreg_entities e on e.org_number = o.org_number
      order by o.created_at desc limit 25) x),
    'results', (select jsonb_agg(jsonb_build_object('channel', ch.channel,
                  'contacts', (select count(*) from app.brreg_outreach o where o.channel = ch.channel and o.status = 'sent'),
                  'trials', (select count(*) from app.brreg_outreach o where o.channel = ch.channel and o.status = 'sent'
                             and exists (select 1 from app.organizations g where g.org_number = o.org_number and g.created_at > o.sent_at
                                         and not app.is_demo(g.id)))) order by ch.ord)
                from (values ('phone', 1), ('letter', 2), ('email', 3)) ch(channel, ord)),
    'holdout', jsonb_build_object(
      'contacts', (select count(*) from app.brreg_outreach o where o.status = 'holdout'),
      'trials', (select count(*) from app.brreg_outreach o where o.status = 'holdout'
                 and exists (select 1 from app.organizations g where g.org_number = o.org_number and g.created_at > o.created_at
                             and not app.is_demo(g.id)))));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_journeys()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can('campaigns.reports') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.journeys');
  return jsonb_build_object('ok', true, 'rows', (
    with recursive roots as (
      select r.* from app.crm_campaigns r
      where r.follows_id is null
        and (r.stage_target is not null or exists (select 1 from app.crm_campaigns f where f.follows_id = r.id))
    ), chain as (
      select r.id as root, r.id, 1 as step from roots r
      union all
      select chain.root, c.id, chain.step + 1 from app.crm_campaigns c join chain on c.follows_id = chain.id where chain.step < 1000
    ), steps as (
      select ch.root, ch.step, c.* from chain ch join app.crm_campaigns c on c.id = ch.id
    ), per as (
      select r.id, r.number, r.name, r.status as first_status, r.stage_target, r.stage_on_send, r.created_at,
        (select count(*) from steps s where s.root = r.id and s.step_kind = 'mail') as mails,
        (select count(*) from steps s where s.root = r.id and s.step_kind <> 'mail') as tasks,
        (select bool_or(s.status in ('scheduled', 'sending')) from steps s where s.root = r.id) as running,
        (select bool_and(s.status in ('sent', 'cancelled')) from steps s where s.root = r.id) as finished,
        (select s.id from steps s where s.root = r.id order by s.step desc limit 1) as last_id,
        (select s.step_kind from steps s where s.root = r.id order by s.step desc limit 1) as last_kind,
        (select min(x.sent_at) from app.crm_sends x where x.campaign_id = r.id and x.kind = 'campaign' and x.status = 'sent') as first_sent
      from roots r
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'number', p.number, 'name', p.name,
      'status', case when p.first_status = 'cancelled' then 'cancelled'
                     when p.running then 'active'
                     when p.first_status = 'draft' then 'draft'
                     when p.finished then 'done' else 'active' end,
      'stage_target', p.stage_target, 'stage_on_send', p.stage_on_send, 'mails', p.mails, 'tasks', p.tasks,
      'reached', (select count(distinct x.contact_id) from app.crm_sends x where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'),
      -- who an automatic step still waits to reach, and (0137) whose call or LinkedIn task is still open
      'in_journey', (select coalesce(sum((select count(*) from app.crm_follow_audience(s2) a
                                           where not exists (select 1 from app.crm_sends x where x.campaign_id = s2.id and x.contact_id = a.contact_id)
                                             and not exists (select 1 from app.crm_activities t where t.campaign_id = s2.id and t.contact_id = a.contact_id))), 0)
                     from app.crm_campaigns s2 join steps s on s.id = s2.id
                     where s.root = p.id and s2.follow_auto and s2.status in ('scheduled', 'sending'))
                  + (select count(*) from app.crm_activities t join steps s on s.id = t.campaign_id
                     where s.root = p.id and t.kind = 'task' and t.done_at is null),
      'completed', case when p.last_kind = 'mail'
                     then (select count(distinct x.contact_id) from app.crm_sends x where x.campaign_id = p.last_id and x.kind = 'campaign' and x.status = 'sent')
                     else (select count(distinct t.contact_id) from app.crm_activities t where t.campaign_id = p.last_id and t.kind = 'task' and t.done_at is not null) end,
      'moved', (select count(distinct co.id) from app.crm_sends x
                join app.crm_contacts c on c.id = x.contact_id join app.crm_companies co on co.id = c.company_id
                join app.crm_stages now_s on now_s.key = co.stage
                join app.crm_stages from_s on from_s.key = coalesce(p.stage_on_send, p.stage_target)
                where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'
                  and now_s.kind in ('open', 'won') and now_s.sort > from_s.sort),
      'replied', (select count(distinct co.id) from app.crm_sends x
                  join app.crm_contacts c on c.id = x.contact_id join app.crm_companies co on co.id = c.company_id
                  where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'
                    and exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= x.sent_at)),
      'first_sent', p.first_sent, 'created_at', p.created_at
    ) order by p.created_at desc), '[]') from per p));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_sequence(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_root uuid;
begin
  if not app.crm_can('campaigns.reports') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.sequence', null, 'crm_campaign', p_id::text);
  if not exists (select 1 from app.crm_campaigns where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_root := app.crm_chain_root(p_id);
  return jsonb_build_object('ok', true, 'steps', (
    with recursive down as (
      select c.*, 1 as step from app.crm_campaigns c where c.id = v_root
      union all select c.*, down.step + 1 from app.crm_campaigns c join down on c.follows_id = down.id where down.step < 1000
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'number', d.number, 'name', d.name, 'status', d.status, 'step', d.step, 'subject', d.subject,
      'step_kind', d.step_kind,
      'follow_days', d.follow_days, 'follow_when', d.follow_when, 'follow_auto', d.follow_auto,
      'scheduled_at', d.scheduled_at, 'finished_at', d.finished_at,
      'stats', app.crm_campaign_stats(d.id),
      -- 0137: a call or LinkedIn step's tasks, by state
      'tasks', case when d.step_kind <> 'mail' then (
                 select jsonb_build_object('made', count(*), 'open', count(*) filter (where a.done_at is null),
                                           'done', count(*) filter (where a.done_at is not null and not a.skipped),
                                           'skipped', count(*) filter (where a.skipped))
                 from app.crm_activities a where a.campaign_id = d.id and a.kind = 'task') end,
      -- answers logged on the recipients' companies after this step's mail reached them
      'replied', (select count(distinct co.id) from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id
                  join app.crm_companies co on co.id = c.company_id
                  where s.campaign_id = d.id and s.kind = 'campaign' and s.status = 'sent'
                    and exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= s.sent_at)),
      'waiting', case when d.follow_auto and d.status in ('scheduled', 'sending')
                   then (select count(*) from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = d.id)) x
                         where not exists (select 1 from app.crm_sends s where s.campaign_id = d.id and s.contact_id = x.contact_id)
                           and not exists (select 1 from app.crm_activities a where a.campaign_id = d.id and a.contact_id = x.contact_id)) end
      ) order by d.step, d.created_at), '[]') from down d));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_known_orgnrs(p_orgnrs text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.known_orgnrs');
  return jsonb_build_object('ok', true, 'known', (
    select coalesce(jsonb_agg(co.org_number), '[]') from app.crm_companies co
    where co.org_number = any (coalesce(p_orgnrs[1:200], '{}'))));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_owners()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.owners');
  return jsonb_build_object('ok', true, 'rows',
    (select coalesce(jsonb_agg(jsonb_build_object('id', a.user_id, 'email', u.email) order by u.email), '[]')
     from app.platform_admins a join auth.users u on u.id = a.user_id
     where a.active and a.role in ('super_admin', 'marketing')));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_partners()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.partners');
  return jsonb_build_object('ok', true,
    -- the one part of the kit the product holds: the referral code on the organisation at signup. It is
    -- a presence check, not a measure of use — Live while the path exists (the beacon keeps
    -- web_events.ref_code, the signup's source puts the partner on org_attribution.partner_id), so it
    -- reads Planned the day a migration takes the path away. No partner dashboard is built: the kit
    -- names it Planned, from the page, with the other parts not in the product.
    'kit', jsonb_build_object(
      'code', exists (select 1 from pg_attribute a where a.attrelid = 'app.web_events'::regclass and a.attname = 'ref_code' and not a.attisdropped)
              and exists (select 1 from pg_attribute a where a.attrelid = 'app.org_attribution'::regclass and a.attname = 'partner_id' and not a.attisdropped)
              and coalesce((select p.prosrc ~ 'partner_id' from pg_proc p where p.oid = to_regprocedure('public.record_signup_source(text,text)')), false)),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'org_number', p.org_number, 'kind', p.kind,
               'contact', p.contact_name, 'code', p.referral_code, 'share_kind', p.share_kind, 'share_pct', p.share_pct,
               'status', p.status, 'updated_at', p.updated_at,
               'trials_30', (select count(*) from app.org_attribution a join app.organizations o on o.id = a.org_id
                             where a.partner_id = p.id and o.created_at > now() - interval '30 days' and not app.is_demo(o.id)),
               'trials_7', (select count(*) from app.org_attribution a join app.organizations o on o.id = a.org_id
                            where a.partner_id = p.id and o.created_at > now() - interval '7 days' and not app.is_demo(o.id)))
             order by p.status <> 'pilot_signed', p.created_at), '[]')
             from app.partners p));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_segment_preview(p_filter jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.segment_preview');
  if not app.crm_filter_ok(p_filter) then
    return jsonb_build_object('ok', false, 'error', 'invalid_filter');
  end if;
  perform app.crm_sync();
  return jsonb_build_object('ok', true,
    'total', (select count(*) from app.crm_segment_contacts(p_filter)),
    'mailable', (select count(*) from app.crm_segment_contacts(p_filter) c where app.crm_mailable(c)),
    'sample', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'email', c.email, 'name', c.name,
                 'type', app.crm_type(c.user_id, c.org_id, c.source), 'mailable', app.crm_mailable(c))), '[]')
               from (select * from app.crm_segment_contacts(p_filter) limit 20) c));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_senders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.senders');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'reply_to', p.reply_to,
             'signature', p.signature, 'archived', p.archived_at is not null,
             'campaigns', (select count(*) from app.crm_campaigns c where c.sender_id = p.id)) order by p.archived_at nulls first, p.name), '[]')
    from app.crm_senders p));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_sending()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.sending');
  return jsonb_build_object('ok', true,
    'daily_cap', (select s.daily_cap from app.crm_settings s where s.id),
    'sent_today', (select count(*) from app.crm_sends s where s.kind = 'campaign' and s.status = 'sent'
                   and (s.sent_at at time zone 'Europe/Oslo')::date = (now() at time zone 'Europe/Oslo')::date),
    'business_hours', app.crm_business_hours());
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_templates()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.templates');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort), '[]') from app.crm_templates t));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_audit_list(p_org uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role app.platform_role := app.admin_role();
  v_rows jsonb;
begin
  -- the whole trail is the super-admin's; support reads one organisation's
  -- 0196 (DEC-12): an allow-list — the super-admin reads the whole trail, support one organisation's
  if v_role is null or v_role not in ('super_admin', 'support') or (v_role = 'support' and p_org is null) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('audit.view', p_org, null, null, null, jsonb_build_object('limit', p_limit));
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'at', a.at, 'admin_email', a.admin_email, 'admin_role', a.admin_role, 'action', a.action,
    'org_id', a.org_id, 'org_name', a.org_name, 'target_type', a.target_type, 'target_id', a.target_id,
    'reason', a.reason, 'detail', a.detail) order by a.at desc, a.id desc), '[]') into v_rows
  from (select * from app.admin_audit a
        where p_org is null or a.org_id = p_org
        order by a.at desc, a.id desc
        limit least(greatest(coalesce(p_limit, 200), 1), 1000)) a;
  return jsonb_build_object('ok', true, 'rows', v_rows);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_notice_recipients(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('org.notice_recipients', p_org, 'organization', p_org::text);
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'kind', l.kind, 'audience', l.audience, 'masked', l.masked, 'sent_at', l.sent_at,
        'delivery', l.delivery, 'delivery_at', l.delivery_at, 'reason', l.reason)
        order by l.sent_at desc, l.id desc), '[]'::jsonb)
    from (
      select r.id, x.kind, x.audience, r.masked, r.sent_at, r.delivery, r.delivery_at,
             case when r.delivery is distinct from 'delivered' and r.provider_id is not null then (
               select e.reason from app.mail_events e
               where e.message_id = r.provider_id and e.event = r.delivery::text and e.at = r.delivery_at
               order by e.id desc limit 1) end as reason
      from app.outbox_recipients r join app.outbox x on x.id = r.outbox_id
      where x.org_id = p_org
      order by r.sent_at desc, r.id desc
      limit 200) l));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_ticket_mail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('ticket.mail', null, 'ticket', p_id::text);
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'message_id', tm.message_id, 'delivery', tm.delivery, 'delivery_at', tm.delivery_at,
        'reason', case when tm.delivery is distinct from 'delivered' and tm.provider_id is not null then (
          select e.reason from app.mail_events e
          where e.ticket_mail_id = tm.id and e.event = tm.delivery::text and e.at = tm.delivery_at
          order by e.id desc limit 1) end)
        order by m.created_at), '[]'::jsonb)
    from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id
    where m.ticket_id = p_id and tm.delivery is not null));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_org_cancellation(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('org.cancellation_view', p_org, 'organization', p_org::text);
  return jsonb_build_object('ok', true, 'row', (
    select jsonb_build_object('cancelled_at', b.cancelled_at, 'cancelled_by', u.email, 'effective_at', b.cancel_effective_at,
                              'deletion_due_at', b.deletion_due_at, 'org_number', o.org_number,
                              'source', b.cancel_source, 'reason', b.cancel_reason)
    from app.billing b join app.organizations o on o.id = b.org_id left join auth.users u on u.id = b.cancelled_by
    where b.org_id = p_org));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_org_owner(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role app.platform_role := app.admin_role();
begin
  if v_role is null or v_role not in ('super_admin', 'support', 'finance') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('org.owner_view', p_org, 'organization', p_org::text);
  return jsonb_build_object('ok', true,
    'owner', (select jsonb_build_object('id', o.user_id, 'email', u.email, 'set_at', o.set_at)
              from app.account_owners o join auth.users u on u.id = o.user_id where o.org_id = p_org),
    'can_set', v_role in ('super_admin', 'support'),
    'candidates', case when v_role in ('super_admin', 'support') then (
      select coalesce(jsonb_agg(jsonb_build_object('id', a.user_id, 'email', u.email, 'role', a.role) order by u.email), '[]')
      from app.platform_admins a join auth.users u on u.id = a.user_id where a.active) else '[]'::jsonb end);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_web_report(p_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days int := least(greatest(coalesce(p_days, 14), 1), 366);
  v_to date := (now() at time zone 'Europe/Oslo')::date;
  v_from date;
  v_pfrom date;
  v_start timestamptz;
  v_pstart timestamptz;
  v_web_prev boolean;
  v_demo_now boolean;
  v_demo_prev boolean;
  v jsonb;
begin
  if app.admin_role() is null or app.admin_role() = 'editor' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('web.report', null, null, null, null, jsonb_build_object('days', v_days));
  v_from := v_to - (v_days - 1);
  v_pfrom := v_from - v_days;
  v_start := v_from::timestamp at time zone 'Europe/Oslo';
  v_pstart := v_pfrom::timestamp at time zone 'Europe/Oslo';
  v_web_prev := v_pfrom >= v_to - 400;
  v_demo_now := v_start >= now() - interval '30 days';
  v_demo_prev := v_pstart >= now() - interval '30 days';

  with ev as (
    select e.*, case when lag(e.at) over w is null or e.at - lag(e.at) over w > interval '30 minutes' then 1 else 0 end as starts
    from app.web_events e where e.day >= v_from
    window w as (partition by e.visitor, e.day order by e.at, e.id)
  ), numbered as (
    select ev.*, sum(ev.starts) over (partition by ev.visitor, ev.day order by ev.at, ev.id) as sn from ev
  ), sess as (
    select n.visitor, n.day, n.sn, extract(epoch from max(n.at) - min(n.at)) as seconds,
           (array_agg(n.path order by n.at, n.id) filter (where n.kind = 'view'))[1] as landing
    from numbered n group by n.visitor, n.day, n.sn
  ), vw as (
    select n.visitor, n.day, n.path, n.at,
           lead(n.at) over (partition by n.visitor, n.day, n.sn order by n.at, n.id) as next_at
    from numbered n where n.kind = 'view'
  ), orgs as (
    select o.id, o.created_at, a.first_landing
    from app.organizations o left join app.org_attribution a on a.org_id = o.id
    where o.created_at >= v_pstart and not app.is_demo(o.id)
  ), paid as (
    select b.org_id, b.confirmed_at from app.billing b
    where b.confirmed_at >= v_pstart and not app.is_demo(b.org_id)
  ), prev as (
    select count(distinct (e.visitor, e.day)) as visitors from app.web_events e where e.day >= v_pfrom and e.day < v_from
  )
  select jsonb_build_object(
    'ok', true,
    'days', v_days,
    'from', v_from,
    'to', v_to,
    'avg_seconds', (select coalesce(round(avg(sess.seconds)), 0) from sess),
    'previous', case when v_web_prev then (select jsonb_build_object('visitors', prev.visitors) from prev) end,
    'devices', (select coalesce(jsonb_agg(d order by d.visitors desc, d.device), '[]') from (
        select e.device, count(distinct (e.visitor, e.day)) as visitors
        from app.web_events e where e.day >= v_from and e.device is not null group by e.device) d),
    'pages_total', (select count(distinct vw.path) from vw),
    'views_total', (select count(*) from vw),
    'pages', (select coalesce(jsonb_agg(p order by p.views desc, p.path), '[]') from (
        select vw.path, count(*) as views, count(distinct (vw.visitor, vw.day)) as uniq,
               round(avg(extract(epoch from vw.next_at - vw.at)) filter (where vw.next_at is not null)) as seconds,
               count(*) filter (where vw.next_at is null) as exits,
               (select count(*) from sess where sess.landing = vw.path) as entries,
               (select count(*) from orgs where orgs.first_landing = vw.path and orgs.created_at >= v_start) as signups
        from vw group by vw.path order by count(*) desc, vw.path limit 50) p),
    'funnel', jsonb_build_object(
        'visitors', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.day >= v_from),
        'pricing', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.day >= v_from and e.kind = 'view' and e.path = '/priser'),
        'signup', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.day >= v_from and e.kind = 'view' and e.path = '/registrer'),
        'trials', (select count(*) from orgs where orgs.created_at >= v_start),
        'customers', (select count(*) from paid where paid.confirmed_at >= v_start)),
    'goals', jsonb_build_object(
        'trials', jsonb_build_object(
            'n', (select count(*) from orgs where orgs.created_at >= v_start),
            'prev', (select count(*) from orgs where orgs.created_at < v_start)),
        'demos', jsonb_build_object(
            'n', case when v_demo_now then (select count(*) from app.demo_requests r where r.at >= v_start) end,
            'prev', case when v_demo_prev then (select count(*) from app.demo_requests r where r.at >= v_pstart and r.at < v_start) end),
        'newsletter', jsonb_build_object(
            'n', (select count(distinct m.contact_id) from app.crm_list_members m where m.subscribed_at >= v_start),
            'prev', (select count(distinct m.contact_id) from app.crm_list_members m where m.subscribed_at >= v_pstart and m.subscribed_at < v_start)),
        'contact', jsonb_build_object(
            'n', (select count(*) from app.tickets t where t.channel = 'contact_form' and t.created_at >= v_start),
            'prev', (select count(*) from app.tickets t where t.channel = 'contact_form' and t.created_at >= v_pstart and t.created_at < v_start)))
  ) into v;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_cms_traffic(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  perform app.admin_log('web.cms_traffic', null, null, null, null, jsonb_build_object('days', v_days));
  return jsonb_build_object('ok', true, 'days', v_days, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('path', x.path, 'views', x.views, 'visitors', x.visitors, 'cta', x.cta, 'signups', x.signups)
                              order by x.views desc, x.path), '[]')
    from (
      select e.path,
             count(*) filter (where e.kind = 'view') as views,
             count(distinct e.visitor) filter (where e.kind = 'view') as visitors,
             count(*) filter (where e.kind = 'cta') as cta,
             (select count(*) from app.org_attribution a join app.organizations o on o.id = a.org_id
               where a.first_landing = e.path and o.created_at >= now() - make_interval(days => v_days)) as signups
      from app.web_events e
      where e.day >= (now() at time zone 'Europe/Oslo')::date - v_days
      group by e.path) x));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_admin(p_email text, p_role text, p_active boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  -- 0196 (Q2): every platform role can be granted, the editor included
  if p_role is null or p_role not in (select r::text from unnest(enum_range(null::app.platform_role)) r) then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_such_account');
  end if;
  if v_user = auth.uid() and (not coalesce(p_active, true) or p_role <> 'super_admin') then
    return jsonb_build_object('ok', false, 'error', 'not_yourself');
  end if;
  if exists (select 1 from app.memberships m where m.user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'customer_account');
  end if;
  insert into app.platform_admins (user_id, role, active, created_by)
  values (v_user, p_role::app.platform_role, coalesce(p_active, true), auth.uid())
  on conflict (user_id) do update set role = excluded.role, active = excluded.active;
  perform app.admin_log('admins.set', null, 'admin', v_user::text, p_reason,
    jsonb_build_object('email', lower(btrim(p_email)), 'role', p_role, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_org_detail(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role app.platform_role := app.admin_role();
  v_support boolean;
  v_out jsonb;
begin
  -- 0196 (DEC-12): an allow-list — marketing keeps the CRM and does not read an organisation's page
  if v_role is null or v_role not in ('super_admin', 'support', 'finance') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.organizations where id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_support := v_role in ('super_admin', 'support');
  perform app.admin_log('org.view', p_org, 'organization', p_org::text);

  select jsonb_build_object(
    'ok', true,
    'org', jsonb_build_object(
      'id', o.id, 'name', o.name, 'org_number', o.org_number, 'employee_count', o.employee_count,
      'threshold', o.threshold, 'created_at', o.created_at, 'status', app.org_status(o.id),
      'registry_address', o.registry_address, 'registry_municipality', o.registry_municipality,
      'registry_nace_code', o.registry_nace_code, 'registry_nace_label', o.registry_nace_label,
      'registry_form_label', o.registry_form_label, 'registry_employees', o.registry_employees,
      'registry_fetched_at', o.registry_fetched_at, 'mail_enabled', o.mail_enabled, 'sms_enabled', o.sms_enabled),
    'billing', (select jsonb_build_object(
      'plan', b.plan, 'trial_started_at', b.trial_started_at, 'trial_ends_at', b.trial_ends_at,
      'trial_extended_at', b.trial_extended_at, 'invoice_email', b.invoice_email, 'invoice_ref', b.invoice_ref,
      'ehf', b.ehf, 'confirmed_at', b.confirmed_at, 'mrr',
      case when b.confirmed_at is not null then app.plan_monthly_nok(b.plan) end)
      from app.billing b where b.org_id = o.id),
    'dpa', (select jsonb_build_object('version', s.version, 'signed_at', s.signed_at, 'signer_name', s.signer_name,
                                      'signer_title', s.signer_title)
            from app.dpa_signatures s where s.org_id = o.id order by s.signed_at desc limit 1),
    'structure', jsonb_build_object(
      'groups', (select count(*) from app.groups g where g.org_id = o.id),
      'employees', (select count(*) from app.employees e where e.org_id = o.id and e.active),
      'with_phone', (select count(*) from app.employees e where e.org_id = o.id and e.active and e.phone is not null),
      'locations', (select count(*) from app.locations l where l.org_id = o.id)),
    'users', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'name', p.full_name, 'email', u.email, 'role', m.role, 'active', m.active,
        'joined_at', m.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'mfa_factors', (select count(*) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))
        order by m.created_at), '[]')
      from app.memberships m join app.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
      where m.org_id = o.id) end,
    -- surveys as metadata: counts and dates, never a person, never an answer
    'rounds', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', ms.kind, 'year', ms.year, 'status', r.status, 'opens_at', r.opens_at, 'closes_at', r.closes_at,
        'invited', inv.invited, 'answered', inv.answered,
        'groups_below_threshold', inv.groups_below,
        'reminders_sent', (select count(*) from app.outbox x where x.round_id = r.id and x.kind = 'paminnelse' and x.sent_at is not null),
        'notices_sent', (select count(*) from app.outbox x where x.round_id = r.id and x.sent_at is not null),
        'notices_failed', (select count(*) from app.outbox x where x.round_id = r.id and x.failed_at is not null),
        'notices_pending', (select count(*) from app.outbox x where x.round_id = r.id and x.sent_at is null and x.failed_at is null))
        order by r.opens_at desc nulls last), '[]')
      from app.rounds r
      join app.measurements ms on ms.id = r.measurement_id
      left join lateral (
        select sum(g.invited)::int as invited, sum(g.answered)::int as answered,
               count(*) filter (where g.answered > 0 and g.answered < app.k_round(r.id))::int as groups_below
        from (select e.group_id, count(*) as invited, count(i.responded_at) as answered
              from app.invitations i join app.employees e on e.id = i.employee_id
              where i.round_id = r.id group by e.group_id) g
      ) inv on true
      where r.org_id = o.id) end,
    'measures', (select jsonb_build_object(
      'total', count(*),
      'open', count(*) filter (where m.step not in ('gjennomfort', 'effekt_malt', 'lukket')),
      'closed', count(*) filter (where m.step = 'lukket'),
      'overdue', count(*) filter (where m.due_date < current_date and m.step not in ('gjennomfort', 'effekt_malt', 'lukket')))
      from app.measures m where m.org_id = o.id),
    'timeline', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object('at', t.at, 'event', t.event) order by t.at), '[]')
      from (
        select o.created_at as at, 'signed_up' as event
        union all select min(e.created_at), 'employees_added' from app.employees e where e.org_id = o.id having min(e.created_at) is not null
        union all select min(ms.created_at), 'first_survey_planned' from app.measurements ms where ms.org_id = o.id having min(ms.created_at) is not null
        union all select min(i.sent_at), 'first_survey_sent' from app.invitations i where i.org_id = o.id having min(i.sent_at) is not null
        union all select min(pe.at), 'results_viewed' from app.product_events pe where pe.org_id = o.id and pe.name = 'results_viewed' having min(pe.at) is not null
        union all select min(m.created_at), 'first_measure' from app.measures m where m.org_id = o.id having min(m.created_at) is not null
        union all select s.signed_at, 'dpa_signed' from app.dpa_signatures s where s.org_id = o.id
        union all select b.trial_extended_at, 'trial_extended' from app.billing b where b.org_id = o.id and b.trial_extended_at is not null
        union all select b.confirmed_at, 'plan_confirmed' from app.billing b where b.org_id = o.id and b.confirmed_at is not null
      ) t) end,
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'author_email', n.author_email,
                                                           'created_at', n.created_at) order by n.created_at desc), '[]')
              from app.admin_org_notes n where n.org_id = o.id)
  ) into v_out
  from app.organizations o where o.id = p_org;

  return v_out;
end $function$;
