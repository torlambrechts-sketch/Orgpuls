-- 0013_measures.sql — tiltak: what the organisation decided to do about a factor.
--
-- Why this table exists at all: § 3-1 bokstav c requires the survey to end in plans and
-- measures, not in insight, and section 5 of the statutory report is where an inspector
-- reads them. Until now that section could not be printed, because nothing held a
-- measure. Five of the report's eight sections wait on this table.
--
-- Three things the design states and this encodes rather than leaves to a caption:
--
--   * A measure hangs on a factor. "Hvert tiltak henger på en faktor" is the screen's
--     own lead, so `factor_key` is NOT NULL and points at the instrument.
--   * It hangs on the round that raised it — "· fra Grunnlinje 2026" is a join, so a
--     measure can be shown against the measurement that produced it and the one that
--     measured its effect.
--   * It cannot be closed before its effect is measured. The six steps are an ordered
--     enum and `lukket` is the sixth, so "closed without an effect measurement" is not a
--     state the data can hold by accident.
--
-- Deletion semantics, chosen rather than defaulted: deleting a round or an employee
-- must NOT delete the measure. A measure is the organisation's record of a decision —
-- the person who owned it leaving is not the decision being undone. So both references
-- are ON DELETE SET NULL, and tenancy is enforced by a trigger instead of by a composite
-- foreign key: a composite key with ON DELETE SET NULL would null `org_id` as well,
-- which is NOT NULL, and deleting a round would fail with an error pointing at the wrong
-- table. That is the same class of trap CLAUDE.md records for immutability triggers —
-- referential maintenance is something the database does on your behalf, and a rule
-- written without it in mind collides with it far from where it was written.

create type app.measure_step as enum
  ('foreslatt', 'besluttet', 'pagar', 'gjennomfort', 'effekt_malt', 'lukket');

-- Arbeidstilsynet and STAMI both hold that collective measures aimed at the
-- organisation of work are to be considered before individual ones. Which kind a measure
-- is therefore belongs on the record, not in somebody's memory of the meeting.
create type app.measure_kind as enum ('kollektivt', 'individuelt');

create table app.measures (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references app.organizations (id) on delete cascade,
  factor_key        text not null references app.factors (key) on update cascade,
  round_id          uuid references app.rounds (id) on delete set null,
  owner_employee_id uuid references app.employees (id) on delete set null,
  title             text not null check (length(btrim(title)) > 0),
  -- "Mål — hva skal være annerledes": the sentence the card prints under the step rail
  goal              text,
  due_date          date,
  step              app.measure_step not null default 'foreslatt',
  kind              app.measure_kind not null default 'kollektivt',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index measures_org_idx on app.measures (org_id, step);
create index measures_round_idx on app.measures (round_id);
create index measures_factor_idx on app.measures (factor_key);

/**
 * Tenancy, as a trigger rather than a key, for the reason in the header.
 *
 * It fires on insert and on update and passes when the reference is null, which is what
 * makes ON DELETE SET NULL work: the database nulls the column, this runs, and finds
 * nothing to disagree with.
 */
create function app.measures_same_org() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.round_id is not null
     and not exists (select 1 from app.rounds r
                     where r.id = new.round_id and r.org_id = new.org_id) then
    raise exception 'round % is not in organisation %', new.round_id, new.org_id;
  end if;

  if new.owner_employee_id is not null
     and not exists (select 1 from app.employees e
                     where e.id = new.owner_employee_id and e.org_id = new.org_id) then
    raise exception 'employee % is not in organisation %', new.owner_employee_id, new.org_id;
  end if;

  new.updated_at := now();
  return new;
end $fn$;

create trigger measures_same_org
  before insert or update on app.measures
  for each row execute function app.measures_same_org();

alter table app.measures enable row level security;

-- Every member of the organisation may read the measures. A verneombud in particular
-- must be able to: § 6-2 gives them a right to be consulted on exactly this, and a list
-- they cannot see is not a consultation.
create policy measure_read on app.measures
  for select using (app.is_org_member(org_id));

-- Writing is the employer's side of the same paragraph. A daglig leder or an
-- avdelingsleder decides and owns measures; a verneombud raises concerns about them
-- rather than authoring them, and the design's owners are all leaders.
create policy measure_write on app.measures
  for all
  using (app.has_role(org_id, array['daglig_leder', 'avdelingsleder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder', 'avdelingsleder']::app.org_role[]));

revoke all on app.measures from anon, public;
grant select, insert, update, delete on app.measures to authenticated;
