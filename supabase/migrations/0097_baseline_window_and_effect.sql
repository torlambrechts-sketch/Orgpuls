-- 0097_baseline_window_and_effect.sql — a baseline open for two weeks, and a standing question on
-- whether last year's measures made a difference (gap analysis P1-9 and P1-7, D-147).
--
-- P1-9. A grunnlinje closed after seven days unless the organisation had saved a standard that
-- said otherwise. Two weeks covers a holiday week and a full shift rotation (the research's B
-- grade evidence), so the product's own standard for a grunnlinje is now 14 days: the column
-- default, `survey_defaults_of`'s fallback, and a grunnlinje planned for an organisation with no
-- saved standard. A puls keeps seven. A standard an organisation saved is left as it is.
--
-- P1-7. «Tiltakene etter forrige kartlegging har hatt positiv effekt på arbeidsplassen min» is a
-- question outside the index (`tiltak_effekt`, agreement scale 1–5), and it is data: a row in
-- app.extra_questions with its five options, and message keys. It is asked from the second
-- cycle: a grunnlinje gets it when the organisation has an earlier grunnlinje that closed.
-- Måleoppsett lists it with the round's other extras, so a leader can leave it out for a round.
-- It is reported by public.results_effect: the whole organisation only, at k answers.

-- ---------------------------------------------------------------- P1-9: two weeks
alter table app.survey_defaults alter column close_days_grunnlinje set default 14;

create or replace function app.survey_defaults_of(p_org uuid) returns app.survey_defaults
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  d app.survey_defaults;
begin
  select * into d from app.survey_defaults where org_id = p_org;
  if not found then
    -- 0097: a grunnlinje's window is two weeks
    d := jsonb_populate_record(null::app.survey_defaults, jsonb_build_object(
      'org_id', p_org, 'close_days_grunnlinje', 14, 'close_days_puls', 7, 'reminder_day', 2,
      'final_reminder', true, 'quiet_hours', true, 'comment_policy', 'lave',
      'allow_dialogue', true, 'extras', to_jsonb(app.builtin_extras())));
  end if;
  return d;
end $fn$;
revoke all on function app.survey_defaults_of(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- P1-7: the question
update app.extra_questions set sort_order = 5 where key = 'apent_felt';
insert into app.extra_questions (key, kind, sort_order, org_only) values ('tiltak_effekt', 'scale', 4, false);
insert into app.extra_options (extra_key, ordinal) select 'tiltak_effekt', n from generate_series(1, 5) n;

-- a planned round takes its standard; 0097 adds the window for a grunnlinje with none, and the
-- effect question from the second cycle
create or replace function app.round_apply_defaults() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_round record;
  d       app.survey_defaults;
begin
  select r.*, ms.kind as ms_kind into v_round
  from app.rounds r join app.measurements ms on ms.id = r.measurement_id
  where r.id = new.id;
  if not found or v_round.status <> 'planlagt' then
    return null;
  end if;

  select * into d from app.survey_defaults where org_id = v_round.org_id;
  if not found then
    -- no standard: a grunnlinje the year wheel planned asked none of the screening, which
    -- the statutory report counts on. It gets plan_first_round's set, and the product's
    -- window for a grunnlinje (0097).
    if v_round.ms_kind = 'grunnlinje' then
      if app.round_extras(new.id) = '{}' then
        perform app.set_round_extras_unchecked(new.id, app.builtin_extras());
      end if;
      update app.rounds r
      set close_after_days = 14,
          closes_at = case when r.opens_at is null then r.closes_at else r.opens_at + interval '14 days' end
      where r.id = new.id;
    end if;
  else
    update app.rounds r
    set close_after_days = case when v_round.ms_kind = 'grunnlinje' then d.close_days_grunnlinje else d.close_days_puls end,
        closes_at = case when r.opens_at is null then r.closes_at
                         else r.opens_at + make_interval(days => case when v_round.ms_kind = 'grunnlinje'
                                                                      then d.close_days_grunnlinje else d.close_days_puls end) end,
        reminder_day = d.reminder_day,
        final_reminder = d.final_reminder,
        comment_policy = d.comment_policy,
        allow_dialogue = d.allow_dialogue,
        extras_off_reason = case when v_round.ms_kind = 'grunnlinje' then d.extras_off_reason end
    where r.id = new.id;

    if v_round.ms_kind = 'grunnlinje' then
      perform app.set_round_extras_unchecked(new.id, d.extras);
    end if;
  end if;

  -- 0097: from the second cycle, a grunnlinje asks whether the measures had an effect
  if v_round.ms_kind = 'grunnlinje' and exists (
       select 1 from app.rounds r join app.measurements ms on ms.id = r.measurement_id
       where r.org_id = v_round.org_id and ms.kind = 'grunnlinje' and r.status = 'lukket' and r.id <> new.id) then
    insert into app.round_extra_questions (org_id, round_id, extra_key)
    values (v_round.org_id, new.id, 'tiltak_effekt')
    on conflict do nothing;
  end if;
  return null;
end $fn$;
revoke all on function app.round_apply_defaults() from public, anon, authenticated;

-- ---------------------------------------------------------------- P1-7: the answer
/*
 * «Tiltakene … har hatt positiv effekt» for a closed round: how many answered, the share who
 * agreed (4 or 5), and the mean. Whole organisation only, at k answers; to any member, as the
 * recommendation figure is.
 */
create function public.results_effect(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_k   int;
  v_n   int;
  v_agree int;
  v_mean numeric;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not app.is_org_member(v_org)
     or not exists (select 1 from app.round_extra_questions x where x.round_id = p_round and x.extra_key = 'tiltak_effekt') then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  select count(*), count(*) filter (where e.option_ordinal >= 4), round(avg(e.option_ordinal), 1)
  into v_n, v_agree, v_mean
  from app.extra_answers e join app.responses r on r.id = e.response_id
  where r.round_id = p_round and e.extra_key = 'tiltak_effekt' and e.option_ordinal is not null;

  if v_n < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'threshold', v_k);
  end if;
  return jsonb_build_object('status', 'ok', 'threshold', v_k, 'n', v_n,
                            'agree', round(100.0 * v_agree / v_n)::int, 'mean', v_mean);
end $fn$;
revoke all on function public.results_effect(uuid) from public, anon;
grant execute on function public.results_effect(uuid) to authenticated;

-- ---------------------------------------------------------------- P1-7: outside the standard
/*
 * The effect question is not one of the standard's extras (Målinger › Innstillinger chooses
 * those): it comes by itself from the second cycle. So a round's *standard* extras leave it out —
 * saving the standard compares a planned round's extras with the old standard to see whether the
 * round followed it, and a round that asks about effect has not been edited by hand for that —
 * and applying or resetting the standard never takes it away. Only a leader's own choice for the
 * round does (set_round_extras).
 */
create or replace function app.round_extras(p_round uuid) returns text[]
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(array_agg(x.extra_key order by x.extra_key), '{}')
  from app.round_extra_questions x where x.round_id = p_round and x.extra_key <> 'tiltak_effekt'
$fn$;
revoke all on function app.round_extras(uuid) from public, anon, authenticated;

create or replace function app.set_round_extras_unchecked(p_round uuid, p_keys text[]) returns void
  language sql security definer set search_path = ''
as $fn$
  delete from app.round_extra_questions x
  where x.round_id = p_round and not (x.extra_key = any (p_keys)) and x.extra_key <> 'tiltak_effekt';
  insert into app.round_extra_questions (org_id, round_id, extra_key)
  select r.org_id, r.id, q.key
  from app.rounds r, app.extra_questions q
  where r.id = p_round and q.key = any (p_keys)
  on conflict do nothing;
$fn$;
revoke all on function app.set_round_extras_unchecked(uuid, text[]) from public, anon, authenticated;

create or replace function public.set_round_extras(p_round uuid, p_keys text[], p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_round  record;
  v_keys   text[];
  v_reason text := nullif(btrim(p_reason), '');
begin
  select r.*, ms.kind as ms_kind into v_round
  from app.rounds r join app.measurements ms on ms.id = r.measurement_id where r.id = p_round;
  if not found or not app.has_role(v_round.org_id, array['daglig_leder', 'verneombud']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if v_round.status <> 'planlagt' then
    return jsonb_build_object('error', 'locked');
  end if;
  v_keys := app.sorted(array(select distinct x from unnest(coalesce(p_keys, '{}')) x
                             where x in (select q.key from app.extra_questions q)));
  if v_keys @> array['krenkende', 'vold'] then
    v_reason := null;
  elsif v_reason is null or length(v_reason) < 10 or length(v_reason) > 500 then
    return jsonb_build_object('error', 'reason_required');
  end if;
  perform app.set_round_extras_unchecked(p_round, v_keys);
  -- 0097: the leader's own choice for the round is the one thing that takes the effect question away
  if not ('tiltak_effekt' = any (v_keys)) then
    delete from app.round_extra_questions where round_id = p_round and extra_key = 'tiltak_effekt';
  end if;
  update app.rounds set extras_off_reason = v_reason where id = p_round;
  return jsonb_build_object('ok', true, 'extras', to_jsonb(v_keys));
end $fn$;

-- ---------------------------------------------------------------- the first round
-- 0097: plan_first_round's own grunnlinje stays open two weeks and asks the builtin extras, not
-- every question in the registry: a first grunnlinje has no earlier measures to ask the effect of.
CREATE OR REPLACE FUNCTION app.plan_first_round_unchecked(p_org uuid, p_opens_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tz    text;
  v_today date;
  v_at    timestamptz;
  v_round uuid;
  v_meas  uuid;
begin
  if p_org is null or p_opens_on is null
     or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_available');
  end if;

  perform pg_advisory_xact_lock(hashtext('plan_first_round:' || p_org::text));

  select coalesce(o.timezone, 'Europe/Oslo') into v_tz from app.organizations o where o.id = p_org;
  v_today := (now() at time zone v_tz)::date;

  if exists (select 1 from app.rounds r where r.org_id = p_org and r.status <> 'planlagt') then
    return jsonb_build_object('error', 'already_measured');
  end if;
  if extract(isodow from p_opens_on) in (6, 7) then
    return jsonb_build_object('error', 'weekend');
  end if;
  if p_opens_on < v_today + 3 then
    return jsonb_build_object('error', 'too_soon');
  end if;
  if p_opens_on > v_today + 120 then
    return jsonb_build_object('error', 'too_far');
  end if;
  if not exists (select 1 from app.employees e where e.org_id = p_org and e.active) then
    return jsonb_build_object('error', 'no_employees');
  end if;

  v_at := (p_opens_on + time '09:00') at time zone v_tz;

  -- the grunnlinje this planned before, or the wheel's own next one within six months
  select r.id, r.measurement_id into v_round, v_meas
  from app.rounds r join app.measurements m on m.id = r.measurement_id
  where r.org_id = p_org and r.status = 'planlagt' and m.kind = 'grunnlinje'
    and r.opens_at < now() + interval '6 months'
  order by r.opens_at
  limit 1;

  if v_round is not null then
    update app.rounds
    set opens_at = v_at,
        closes_at = v_at + make_interval(days => close_after_days),
        reminder_day = coalesce(reminder_day, 4)
    where id = v_round;
    update app.measurements set year = extract(year from p_opens_on)::int where id = v_meas;
  else
    insert into app.measurements (org_id, kind, year, label)
    values (p_org, 'grunnlinje', extract(year from p_opens_on)::int, null)
    returning id into v_meas;

    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at,
                            reminder_day, close_after_days)
    values (p_org, v_meas, 'planlagt', v_at, v_at + interval '14 days', 4, 14)
    returning id into v_round;
  end if;

  insert into app.round_factors (org_id, round_id, factor_key)
  select p_org, v_round, f.key from app.factors f
  on conflict do nothing;
  insert into app.round_extra_questions (org_id, round_id, extra_key)
  select p_org, v_round, q.key from app.extra_questions q where q.key = any (app.builtin_extras())
  on conflict do nothing;

  -- the wheel has described the year until now; from here it keeps it
  insert into app.year_wheels (org_id, active) values (p_org, true)
  on conflict (org_id) do update set active = true;

  return jsonb_build_object('ok', true, 'round_id', v_round, 'opens_at', v_at);
end $function$;

revoke all on function app.plan_first_round_unchecked(uuid, date) from public, anon, authenticated;
