-- 0003_measurement.sql — measurements, rounds, invitations, responses, answers.
--
-- This migration is where the anonymity promise is kept or broken. The product tells
-- every respondent, in the footer of every page: "ingen enkeltsvar kan spores tilbake
-- til en person." That is implemented here, and the implementation is *absence*:
--
--   app.responses has no invitation_id, no user_id, no ip, no user_agent, and no
--   created_at. Not "nullable" — absent. A column that does not exist cannot be
--   populated by a future careless insert, cannot be back-filled, and cannot be
--   leaked. This is strictly stronger than a CHECK constraint permitting NULL.
--
-- Double-submission is still prevented, without linkage: submitting marks
-- app.invitations.responded_at AND inserts an unlinked app.responses row, in one
-- transaction, with no foreign key between the two. Nothing in the database relates
-- a response back to the invitation that authorised it.
--
-- Timing is coarsened: submitted_hour is truncated to the hour, so a response cannot
-- be fingerprinted by when it arrived.

-- ---------------------------------------------------------------------------
-- Who gets asked
-- ---------------------------------------------------------------------------
create table app.employees (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  group_id   uuid references app.groups (id) on delete set null,
  full_name  text not null check (length(btrim(full_name)) > 0),
  email      text check (position('@' in email) > 1),
  phone      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index employees_org_idx on app.employees (org_id) where active;

-- ---------------------------------------------------------------------------
-- What gets asked, and when
-- ---------------------------------------------------------------------------
create type app.measurement_kind as enum ('grunnlinje', 'puls');
create type app.round_status     as enum ('planlagt', 'apen', 'lukket');

create table app.measurements (
  id         uuid not null default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  kind       app.measurement_kind not null,
  year       int  not null check (year between 2020 and 2100),
  label      text,
  created_at timestamptz not null default now(),
  primary key (id),
  unique (org_id, id)          -- composite target so children can carry org_id
);

create table app.rounds (
  id             uuid not null default gen_random_uuid(),
  org_id         uuid not null,
  measurement_id uuid not null,
  status         app.round_status not null default 'planlagt',
  opens_at       timestamptz,
  closes_at      timestamptz,
  -- a closed round is frozen: its questions and its answers stop changing
  frozen_at      timestamptz,
  primary key (id),
  unique (org_id, id),
  -- tenancy cannot drift: a round's org must be its measurement's org
  foreign key (org_id, measurement_id) references app.measurements (org_id, id) on delete cascade,
  constraint round_window check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create index rounds_org_idx on app.rounds (org_id, status);

-- Which factors a given round asks about. A puls asks a subset; a grunnlinje asks all.
create table app.round_factors (
  org_id     uuid not null,
  round_id   uuid not null,
  factor_key text not null references app.factors (key),
  primary key (round_id, factor_key),
  foreign key (org_id, round_id) references app.rounds (org_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Invitations. These ARE linked to a person — that is their job. They carry no
-- answers. The token is never stored, only its SHA-256.
-- ---------------------------------------------------------------------------
create table app.invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  round_id     uuid not null,
  employee_id  uuid references app.employees (id) on delete set null,
  token_hash   bytea not null unique,
  sent_at      timestamptz,
  responded_at timestamptz,
  expires_at   timestamptz not null,
  foreign key (org_id, round_id) references app.rounds (org_id, id) on delete cascade
);

create index invitations_round_idx on app.invitations (round_id);

-- ---------------------------------------------------------------------------
-- The answers. Deliberately impoverished.
-- ---------------------------------------------------------------------------
create table app.responses (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  round_id       uuid not null,
  -- the group is kept because per-group results are the product; k-anonymity is
  -- what makes that safe, and it is enforced at read time in 0004.
  group_id       uuid references app.groups (id) on delete set null,
  -- truncated to the hour, on the server, by the write path. No finer resolution
  -- exists anywhere.
  submitted_hour timestamptz not null,
  foreign key (org_id, round_id) references app.rounds (org_id, id) on delete cascade,
  constraint submitted_hour_is_truncated
    check (submitted_hour = date_trunc('hour', submitted_hour))
);

create index responses_round_idx on app.responses (round_id, group_id);

create table app.answers (
  response_id uuid not null references app.responses (id) on delete cascade,
  factor_key  text not null references app.factors (key),
  ordinal     int  not null,
  -- five-point scale, per the design's "besvart på femdelt skala"
  value       int  not null check (value between 1 and 5),
  primary key (response_id, factor_key, ordinal),
  foreign key (factor_key, ordinal) references app.statements (factor_key, ordinal)
);

-- ---------------------------------------------------------------------------
-- Freeze trigger.
--
-- Written as "nobody may change this content", NOT as "reject any UPDATE or DELETE".
-- The difference matters: PostgreSQL issues its own UPDATEs and DELETEs for foreign
-- key maintenance — ON DELETE SET NULL on group_id is an UPDATE the database performs
-- on your behalf — and a blanket rejection makes a parent group undeletable, with the
-- failure surfacing far from this trigger. So compare only the columns that carry
-- meaning and let FK-driven nulling of reference columns through.
-- ---------------------------------------------------------------------------
create function app.forbid_answer_change() returns trigger
  language plpgsql
  set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    -- cascade from a deleted response is legitimate; a direct delete is not
    if exists (select 1 from app.responses r where r.id = old.response_id) then
      raise exception 'answers are append-only: % cannot be deleted', old.response_id
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.value is distinct from old.value
     or new.factor_key is distinct from old.factor_key
     or new.ordinal   is distinct from old.ordinal
     or new.response_id is distinct from old.response_id then
    raise exception 'answers are immutable once submitted'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

create trigger answers_immutable
  before update or delete on app.answers
  for each row execute function app.forbid_answer_change();

-- ---------------------------------------------------------------------------
-- RLS.
--
-- responses and answers get RLS enabled and NO select policy, for anybody. That is
-- the invariant, not an oversight: clients never read raw responses. Every result
-- read goes through the SECURITY DEFINER aggregate RPCs in 0004, which apply k.
-- Do not add a select policy to either table.
-- ---------------------------------------------------------------------------
alter table app.employees     enable row level security;
alter table app.measurements  enable row level security;
alter table app.rounds        enable row level security;
alter table app.round_factors enable row level security;
alter table app.invitations   enable row level security;
alter table app.responses     enable row level security;
alter table app.answers       enable row level security;

create policy employee_read on app.employees
  for select to authenticated using (app.is_org_member(org_id));
create policy employee_write on app.employees
  for all to authenticated
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

create policy measurement_read on app.measurements
  for select to authenticated using (app.is_org_member(org_id));
create policy measurement_write on app.measurements
  for all to authenticated
  using (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]));

create policy round_read on app.rounds
  for select to authenticated using (app.is_org_member(org_id));
create policy round_write on app.rounds
  for all to authenticated
  using (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]));

create policy round_factor_read on app.round_factors
  for select to authenticated using (app.is_org_member(org_id));
create policy round_factor_write on app.round_factors
  for all to authenticated
  using (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]));

-- Invitations are readable in aggregate by the org (who has answered, not what they
-- said) but the token hash must never leave the server, so no column-level grant.
create policy invitation_read on app.invitations
  for select to authenticated using (app.is_org_member(org_id));
create policy invitation_write on app.invitations
  for all to authenticated
  using (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]));

-- NO POLICIES for app.responses and app.answers. Intentional. RLS is on, so the
-- default is deny for every role including authenticated.

grant select on app.employees, app.measurements, app.rounds, app.round_factors to authenticated;
grant insert, update, delete on app.employees, app.measurements, app.rounds, app.round_factors to authenticated;
grant select (id, org_id, round_id, employee_id, sent_at, responded_at, expires_at)
  on app.invitations to authenticated;
grant insert, update, delete on app.invitations to authenticated;

-- responses/answers: no grants to anon or authenticated at all.
revoke all on app.responses, app.answers from anon, authenticated;
