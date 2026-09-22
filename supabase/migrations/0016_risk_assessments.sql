-- 0016_risk_assessments.sql — the middle step of § 3-1 bokstav c.
--
-- The statute names three things in one sentence: kartlegge, "og på denne bakgrunn
-- vurdere risikoforholdene", and plan measures. This product had the first (rounds,
-- responses, answers) and, since 0013, the third (measures). The middle one was a word
-- printed on two screens and stored nowhere.
--
-- That gap is why four things in the design could not be rendered: the Sløyfen's
-- "Risikovurdert · 19. sep", the "Kartlegging og risikovurdering — Dokumentert" chip,
-- the årshjul's "Risikovurdering · 2 av 2 ferdig", and section 4 of the statutory
-- report. The prototype computes all four from the index with a hand-written sentence
-- per factor key. A risk assessment is not computable: § 4-1 requires the environment be
-- assessed "enkeltvis og samlet", and both halves of that are a judgement a named person
-- made on a date. Deriving it from a number and printing it on a document an inspector
-- reads is the worst case of the fabrication rule, which is why D-18 left section 4 out
-- rather than filling it in.
--
-- Two tables, because the statute asks for both halves:
--
--   app.risk_assessments         the assessment as an act — which kartlegging it rests
--                                on, the date it was made, and who made it. "Samlet".
--   app.risk_factor_assessments  one factor's probability, consequence, the written
--                                assessment and its conclusion. "Enkeltvis".
--
-- Probability and consequence are enums rather than free text because they are a scale
-- an inspector compares across years and across undertakings; a field that accepts
-- "ganske høy" is a field that cannot be compared. The written assessment is free text
-- and required — a row with a band and no reasoning is a number wearing a judgement's
-- clothes, which is the thing this table exists to prevent.

create type app.risk_probability as enum ('lav', 'middels', 'hoy');
create type app.risk_consequence as enum ('liten', 'moderat', 'alvorlig');

-- The conclusion the design prints under each factor: "Krever tiltak", "Uforsvarlig uten
-- tiltak". `forsvarlig` completes the scale — a factor that was assessed and found sound
-- is a result worth recording, not an absence.
create type app.risk_conclusion as enum ('forsvarlig', 'krever_tiltak', 'uforsvarlig_uten_tiltak');

create table app.risk_assessments (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references app.organizations (id) on delete cascade,
  -- the kartlegging it rests on. NOT NULL: an assessment of nothing is not an assessment,
  -- and the statute's "på denne bakgrunn" is this column.
  round_id               uuid not null references app.rounds (id) on delete cascade,
  assessed_on            date not null,
  -- who made it, on the same terms as a measure's owner: an employee row, readable
  -- org-wide, nulled rather than cascaded when the person leaves. The assessment stays
  -- true after its author has gone; it was still made, and on that date.
  assessed_by_employee_id uuid references app.employees (id) on delete set null,
  -- the "samlet" half of § 4-1: what the factors amount to together
  summary                text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- one standing assessment per kartlegging. A revision replaces it rather than
  -- accumulating beside it, so "is this round risk-assessed" has one answer.
  unique (round_id)
);

create index risk_assessments_org_idx on app.risk_assessments (org_id, assessed_on desc);

create table app.risk_factor_assessments (
  assessment_id uuid not null references app.risk_assessments (id) on delete cascade,
  factor_key    text not null references app.factors (key) on update cascade,
  probability   app.risk_probability not null,
  consequence   app.risk_consequence not null,
  -- "Ansatte melder at avvik ikke følges opp…" — the reasoning, without which the two
  -- bands above are an unexplained verdict
  assessment    text not null check (length(btrim(assessment)) > 0),
  conclusion    app.risk_conclusion not null,
  primary key (assessment_id, factor_key)
);

create index risk_factor_assessments_factor_idx on app.risk_factor_assessments (factor_key);

/**
 * Tenancy, as a trigger rather than a composite key, for the reason 0013 gives at
 * length: `assessed_by_employee_id` is ON DELETE SET NULL, and a composite key would
 * null `org_id` with it. It passes when the reference is null, which is what makes the
 * database's own referential maintenance work.
 */
create function app.risk_assessments_same_org() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.rounds r
                 where r.id = new.round_id and r.org_id = new.org_id) then
    raise exception 'round % is not in organisation %', new.round_id, new.org_id;
  end if;

  if new.assessed_by_employee_id is not null
     and not exists (select 1 from app.employees e
                     where e.id = new.assessed_by_employee_id and e.org_id = new.org_id) then
    raise exception 'employee % is not in organisation %', new.assessed_by_employee_id, new.org_id;
  end if;

  new.updated_at := now();
  return new;
end $fn$;

create trigger risk_assessments_same_org
  before insert or update on app.risk_assessments
  for each row execute function app.risk_assessments_same_org();

/**
 * A factor may only be assessed if the round it was measured in actually carried it.
 *
 * A puls carries two or three factors; assessing a factor that round never asked about
 * would be an assessment resting on no data, which is precisely what "på denne bakgrunn"
 * forbids. app.round_factors already says which factors a round carried, so this asks it
 * rather than trusting the caller.
 */
create function app.risk_factor_in_round() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (
    select 1
    from app.risk_assessments ra
    join app.round_factors rf on rf.round_id = ra.round_id
    where ra.id = new.assessment_id and rf.factor_key = new.factor_key
  ) then
    raise exception 'factor % was not measured in the round this assessment rests on',
      new.factor_key;
  end if;
  return new;
end $fn$;

create trigger risk_factor_in_round
  before insert or update on app.risk_factor_assessments
  for each row execute function app.risk_factor_in_round();

alter table app.risk_assessments enable row level security;
alter table app.risk_factor_assessments enable row level security;

-- Every member may read it. A verneombud most of all: § 3-1 and § 6-2 together make the
-- risk assessment the document they are entitled to be consulted on, and one they cannot
-- open is not a consultation. This is the same reasoning as `measure_read` in 0013.
create policy risk_assessment_read on app.risk_assessments
  for select using (app.is_org_member(org_id));

-- Assessing risk is the employer's duty under § 3-1, so it is the employer's side that
-- writes: daglig leder and avdelingsleder, the same pair that owns measures.
create policy risk_assessment_write on app.risk_assessments
  for all
  using (app.has_role(org_id, array['daglig_leder', 'avdelingsleder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder', 'avdelingsleder']::app.org_role[]));

-- The rows follow their assessment: whoever may read it may read its factors, whoever
-- may write it may write them. Keying off the parent means the rule is stated once.
create policy risk_factor_read on app.risk_factor_assessments
  for select using (
    exists (select 1 from app.risk_assessments ra
            where ra.id = assessment_id and app.is_org_member(ra.org_id))
  );

create policy risk_factor_write on app.risk_factor_assessments
  for all
  using (
    exists (
      select 1 from app.risk_assessments ra
      where ra.id = assessment_id
        and app.has_role(ra.org_id, array['daglig_leder', 'avdelingsleder']::app.org_role[])
    )
  )
  with check (
    exists (
      select 1 from app.risk_assessments ra
      where ra.id = assessment_id
        and app.has_role(ra.org_id, array['daglig_leder', 'avdelingsleder']::app.org_role[])
    )
  );

revoke all on app.risk_assessments, app.risk_factor_assessments from anon, public;
grant select, insert, update, delete
  on app.risk_assessments, app.risk_factor_assessments to authenticated;
