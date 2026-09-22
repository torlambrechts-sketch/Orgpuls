-- 0023_report_tail.sql — the three things the report's last sections were waiting on.
--
-- Sections 6, 7 and 8 of the statutory report have been unbuilt since the report was
-- first printed, each for a different missing fact. This migration supplies all three.
--
-- **6. Effektvurdering** needs to know whether a measure worked, which means comparing the
-- factor it addressed across the round it was raised from and a later one. Nothing linked
-- a measure to the round that measured its effect. `effect_round_id` does, guarded so it
-- cannot point at a round in another organisation or at the same round the measure came
-- from — a measure cannot be evaluated by the measurement that produced it.
--
-- **7. Krenkende atferd, vold og trusler** needs counts from `app.extra_answers`, which no
-- client may select from. `rpc.screening_counts` is the k-gated reader, and it is the most
-- carefully bounded RPC in the product: see its own comment.
--
-- **8. Informasjon og opplæring** needs a record that findings were shared and that people
-- were trained. `app.round_information` and `app.trainings` hold those. They are
-- deliberately thin — who was told, when, and how — because the alternative was to keep
-- printing the design's prose about an allmøte that nothing recorded.

-- --------------------------------------------------------------------- 6. effect
alter table app.measures
  add column effect_round_id uuid references app.rounds (id) on delete set null,
  add column effect_note text check (effect_note is null or length(btrim(effect_note)) > 0);

comment on column app.measures.effect_round_id is
  'The round whose result is the evidence this measure worked, or did not. Never the '
  'round the measure was raised from.';

create function app.measure_effect_round_ok() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare v_org uuid;
begin
  if new.effect_round_id is null then
    return new;
  end if;

  if new.effect_round_id = new.round_id then
    raise exception 'a measure cannot be evaluated by the round it was raised from';
  end if;

  select r.org_id into v_org from app.rounds r where r.id = new.effect_round_id;
  if v_org is distinct from new.org_id then
    raise exception 'round % is not in organisation %', new.effect_round_id, new.org_id;
  end if;

  return new;
end $fn$;

create trigger measure_effect_round_ok
  before insert or update on app.measures
  for each row execute function app.measure_effect_round_ok();

-- ------------------------------------------------------------------ 7. screening
--
-- The screening questions are the most sensitive rows in the database. "Har du opplevd
-- krenkende atferd" answered yes by three people is a fact about three people, and the
-- rules the design states for it are stricter than the ones k applies elsewhere:
-- **counts only, for the whole undertaking, never per group.**
--
-- This RPC therefore does something no other reader here does — it refuses to break down
-- at all. There is no group parameter, and adding one later would be a change to what the
-- product promises rather than a feature. It also applies the ordinary k gate to the round
-- as a whole, so a round with four responses yields nothing.
--
-- `vil ikke svare` is counted and reported like any other option, because leaving it out
-- would make "three of 28" mean something different from what it says.
create function public.screening_counts(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare v_org uuid; v_k int; v_n int; v_out jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);
  select count(*) into v_n from app.responses where round_id = p_round;
  if v_n < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'n', v_n, 'threshold', v_k);
  end if;

  select coalesce(jsonb_agg(q order by q.sort_order), '[]'::jsonb) into v_out
  from (
    select
      eq.key,
      eq.sort_order,
      (select count(*) from app.extra_answers ea
        join app.responses r2 on r2.id = ea.response_id
        where r2.round_id = p_round and ea.extra_key = eq.key) as answered,
      (select coalesce(jsonb_agg(jsonb_build_object('ordinal', o.ordinal, 'n', o.n)
                                 order by o.ordinal), '[]'::jsonb)
         from (
           select eo.ordinal,
                  (select count(*) from app.extra_answers ea2
                    join app.responses r3 on r3.id = ea2.response_id
                    where r3.round_id = p_round
                      and ea2.extra_key = eq.key
                      and ea2.option_ordinal = eo.ordinal) as n
           from app.extra_options eo where eo.extra_key = eq.key
         ) o) as options
    from app.extra_questions eq
    where eq.kind = 'choice'
      and eq.key in ('krenkende', 'vold')
      and exists (select 1 from app.round_extra_questions rq
                  where rq.round_id = p_round and rq.extra_key = eq.key)
  ) q;

  return jsonb_build_object('status', 'ok', 'n', v_n, 'threshold', v_k,
                            'questions', coalesce(v_out, '[]'::jsonb));
end $fn$;

revoke all on function public.screening_counts(uuid) from public, anon;
grant execute on function public.screening_counts(uuid) to authenticated;

-- ------------------------------------------------- 8. information and training
--
-- Two records, both about people and neither about a respondent. Who was told what a
-- measurement found is a fact about a meeting, not about an answer, so these are ordinary
-- org-scoped tables with ordinary policies.
create type app.information_audience as enum
  ('alle_ansatte', 'verneombud', 'tillitsvalgte', 'ledere', 'amu');

create type app.information_channel as enum
  ('allmote', 'skriftlig', 'epost', 'mote', 'intranett');

create table app.round_information (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  round_id   uuid not null references app.rounds (id) on delete cascade,
  audience   app.information_audience not null,
  channel    app.information_channel not null,
  held_on    date not null,
  note       text check (note is null or length(btrim(note)) > 0),
  created_at timestamptz not null default now(),
  unique (round_id, audience, channel, held_on)
);

create table app.trainings (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  title      text not null check (length(btrim(title)) > 0 and length(title) <= 200),
  audience   app.information_audience not null,
  held_on    date not null,
  /* the act's own framing: training is not done once, it is due again */
  next_due   date check (next_due is null or next_due > held_on),
  note       text check (note is null or length(btrim(note)) > 0),
  created_at timestamptz not null default now()
);

alter table app.round_information enable row level security;
alter table app.trainings enable row level security;

create policy information_read on app.round_information
  for select using (app.is_org_member(org_id));
create policy information_write on app.round_information
  for all
  using (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));

create policy training_read on app.trainings
  for select using (app.is_org_member(org_id));
create policy training_write on app.trainings
  for all
  using (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));

revoke all on app.round_information, app.trainings from anon, public;
grant select, insert, update, delete on app.round_information, app.trainings to authenticated;

-- a round's information record must belong to the round's own organisation
create function app.information_round_ok() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare v_org uuid;
begin
  select r.org_id into v_org from app.rounds r where r.id = new.round_id;
  if v_org is distinct from new.org_id then
    raise exception 'round % is not in organisation %', new.round_id, new.org_id;
  end if;
  return new;
end $fn$;

create trigger information_round_ok
  before insert or update on app.round_information
  for each row execute function app.information_round_ok();
