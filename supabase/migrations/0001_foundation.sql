-- 0001_foundation.sql — schemas, roles, tenancy, and the k-anonymity floor.
--
-- Read before changing anything here: the threshold functions are the mechanism the
-- whole product's anonymity promise rests on. The design bundle states the rule in the
-- statutory report itself: "Resultater vises ikke for grupper med færre enn 5 svar."

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Roles. The design's header switches between exactly these three.
-- ---------------------------------------------------------------------------
create type app.org_role as enum ('daglig_leder', 'avdelingsleder', 'verneombud');

-- ---------------------------------------------------------------------------
-- The k-anonymity floor.
--
-- The bundle's Personvern control offers 3–10 (line 2488: threshold, min 3, max 10,
-- default 5). CLAUDE.md's security invariant 1 says k = 5, and that lowering it is a
-- stop-and-ask. Where the bundle and that contract disagree the contract wins on
-- security, so the statutory floor is 5 and an organisation may only raise it.
-- Logged as a deviation: the control's minimum is 5, not the bundle's 3.
--
-- k_min() is a function, not a column, precisely so that no row can lower it.
-- ---------------------------------------------------------------------------
create function app.k_min() returns int
  language sql immutable parallel safe
  set search_path = ''
as $$ select 5 $$;

comment on function app.k_min() is
  'Statutory minimum group size for any published result. Not configurable by data.';

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table app.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) > 0),
  org_number      text check (org_number ~ '^[0-9]{9}$'),
  employee_count  int  not null default 0 check (employee_count >= 0),
  -- an org may demand MORE privacy than the floor, never less
  threshold       int  not null default 5 check (threshold between 5 and 10),
  default_lang    text not null default 'no' check (default_lang in ('no', 'en')),
  timezone        text not null default 'Europe/Oslo',
  created_at      timestamptz not null default now()
);

create table app.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  lang        text check (lang in ('no', 'en')),
  created_at  timestamptz not null default now()
);

create table app.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  user_id    uuid not null references app.profiles (id) on delete cascade,
  role       app.org_role not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index memberships_user_idx on app.memberships (user_id) where active;
create index memberships_org_idx  on app.memberships (org_id)  where active;

-- Groups are the unit k-anonymity is applied across (Drift, Prosjekt, Verksted,
-- Administrasjon in the design's own data).
create table app.groups (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  sort_order int  not null default 0,
  unique (org_id, name)
);

-- ---------------------------------------------------------------------------
-- Membership and role predicates.
--
-- SECURITY DEFINER because they are called from RLS policies on tables the caller
-- cannot read: a policy that needed the caller to already have select rights on
-- memberships would be circular. search_path is pinned on every one of them.
-- ---------------------------------------------------------------------------
create function app.is_org_member(p_org uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from app.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.active
  )
$$;

create function app.has_role(p_org uuid, p_roles app.org_role[]) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from app.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.active
      and m.role = any (p_roles)
  )
$$;

-- The effective threshold for an organisation: its own setting, floored at the
-- statutory minimum. greatest() is the whole point — a row cannot go below k_min().
create function app.k_threshold(p_org uuid) returns int
  language sql stable security definer
  set search_path = ''
as $$
  select greatest(
    coalesce((select o.threshold from app.organizations o where o.id = p_org), app.k_min()),
    app.k_min()
  )
$$;

comment on function app.k_threshold(uuid) is
  'Effective k for an org. Always >= app.k_min(); an org setting can only raise it.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table app.organizations enable row level security;
alter table app.profiles      enable row level security;
alter table app.memberships   enable row level security;
alter table app.groups        enable row level security;

create policy org_read on app.organizations
  for select to authenticated using (app.is_org_member(id));

create policy org_update on app.organizations
  for update to authenticated
  using (app.has_role(id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(id, array['daglig_leder']::app.org_role[]));

create policy profile_self_read on app.profiles
  for select to authenticated using (id = auth.uid());

create policy profile_self_write on app.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy membership_read on app.memberships
  for select to authenticated using (app.is_org_member(org_id));

create policy membership_admin on app.memberships
  for all to authenticated
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

create policy group_read on app.groups
  for select to authenticated using (app.is_org_member(org_id));

create policy group_admin on app.groups
  for all to authenticated
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

grant select on app.organizations, app.profiles, app.memberships, app.groups to authenticated;
grant update on app.organizations, app.profiles to authenticated;
grant insert, update, delete on app.memberships, app.groups to authenticated;
