-- 0108_journey_p1.sql — P1s the deep audit's journeys found (docs/audits/2026-09-28-deep.md, J2, J4, J6).
--
-- AUD-29  The notice ladder named tillitsvalgte and reached nobody: dispatch_recipients had no
--         branch for them, and it looked for the verneombud among members only, so an employee
--         recorded as verneombud (duty_role, 0021) without a login was told nothing. A rung now
--         reaches the members in that role and the active employees recorded in that duty.
--         duty_role still grants nothing: it is an address for a notice, never a read.
-- AUD-30  «Start nå» made a new puls from the planned one's factors and left the planned round —
--         its own questions, intro, publish date, modules, reminders — to open again on its own
--         date. It now opens the planned round itself. Its ladder was queued «due lead days ago»,
--         which dispatch_claim reads as due before the opening and drops: every rung is now due at
--         the start, and the queue's order still tells the ladder before the invitations.
-- AUD-31  The product says only the daglig leder changes a survey's setup (Oppsett › Hvem ser
--         hva, «Endre oppsett»); the policies let the verneombud write rounds, their factors,
--         extras and modules, and the avdelingsleder their groups and own questions. Setup writes
--         are the daglig leder's now, through the policies and the two definer functions.

-- ---------------------------------------------------------------- AUD-29: every rung has an address

create or replace function app.dispatch_recipients(p_outbox uuid)
 returns table(email text, phone text, name text, lang text, member boolean)
 language sql stable security definer set search_path to ''
as $function$
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
    select nullif(lower(btrim(e.email)), '') as email, e.phone, e.full_name as name, e.language as lang, false as member
    from x join app.employees e on e.id = x.employee_id
    union all
    select mb.email, null, mb.name, mb.lang, true from members mb, x
    where (x.audience = 'daglig_leder' and mb.role = 'daglig_leder')
       or (x.audience = 'avdelingsledere' and mb.role = 'avdelingsleder')
       or (x.audience = 'verneombud' and mb.role = 'verneombud')
    union all
    -- 0108 (AUD-29): the people the register records in the duty, login or not
    select nullif(lower(btrim(e.email)), ''), null, e.full_name, e.language, false
    from x join app.employees e on e.org_id = x.org_id and e.active
    where (x.audience = 'daglig_leder' and e.duty_role = 'daglig_leder')
       or (x.audience = 'avdelingsledere' and e.duty_role = 'avdelingsleder')
       or (x.audience = 'verneombud' and e.duty_role = 'verneombud')
       or (x.audience = 'tillitsvalgte' and e.duty_role = 'tillitsvalgt')
    union all
    select nullif(lower(btrim(s.email)), ''), null, s.full_name, null, false from scope s, x
    where x.audience = 'alle_ansatte'
  )
  select distinct on (coalesce(email, phone)) email, phone, name, lang, member
  from picked
  where email is not null or phone is not null
  order by coalesce(email, phone), member desc
$function$;
revoke all on function app.dispatch_recipients(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- AUD-30: «Start nå» opens the planned puls

create or replace function app.start_next_pulse_unchecked(p_org uuid)
 returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_last   timestamptz;
  v_src    app.rounds%rowtype;
  v_meas   uuid;
  v_round  uuid;
  v_now    timestamptz := now();
  v_year   int;
  v_tz     text;
  v_close  int;
  v_remind int;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_available');
  end if;

  -- one start at a time per organisation: the checks below and the insert are one decision
  perform pg_advisory_xact_lock(hashtext('start_next_pulse:' || p_org::text));

  if exists (select 1 from app.rounds r where r.org_id = p_org and r.status = 'apen') then
    return jsonb_build_object('error', 'round_open');
  end if;

  select max(r.closes_at) into v_last from app.rounds r where r.org_id = p_org and r.status = 'lukket';
  if v_last is not null and v_last > v_now - interval '14 days' then
    return jsonb_build_object('error', 'too_soon', 'available_from', v_last + interval '14 days');
  end if;

  -- the next planned puls: the one the leader set up
  select r.* into v_src
  from app.rounds r join app.measurements m on m.id = r.measurement_id
  where r.org_id = p_org and r.status = 'planlagt' and m.kind = 'puls'
  order by r.opens_at nulls last, r.id
  limit 1;

  select coalesce(o.timezone, 'Europe/Oslo') into v_tz from app.organizations o where o.id = p_org;
  v_year := extract(year from v_now at time zone v_tz)::int;

  if v_src.id is not null then
    -- 0108 (AUD-30): open that round itself, with everything set up on it. Its measurement takes
    -- the year it opens in (still planned, so 0106's measurements_fixed allows it).
    v_round := v_src.id;
    v_close := coalesce(v_src.close_after_days, 7);
    update app.measurements set year = v_year where id = v_src.measurement_id and year <> v_year;
    update app.rounds
       set status = 'apen', opens_at = v_now, closes_at = v_now + make_interval(days => v_close)
     where id = v_round;
  else
    v_close := 7;
    v_remind := 2;
    insert into app.measurements (org_id, kind, year, label)
    values (p_org, 'puls', v_year, null) returning id into v_meas;

    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, audience,
                            comment_policy, allow_dialogue, reminder_day, close_after_days)
    values (p_org, v_meas, 'apen', v_now, v_now + make_interval(days => v_close),
            'alle_ansatte', 'lave', true, v_remind, v_close)
    returning id into v_round;

    insert into app.round_factors (org_id, round_id, factor_key)
    select distinct p_org, v_round, me.factor_key
    from app.measures me where me.org_id = p_org and me.step <> 'lukket'
      -- 0071: a module measure has no core factor; its statement comes by round_pulse_modules
      and me.factor_key is not null;
  end if;

  -- 0071: a puls that asks only module statements still asks something
  if not exists (select 1 from app.round_factors rf where rf.round_id = v_round)
     and not exists (select 1 from app.round_modules rm where rm.round_id = v_round) then
    raise exception 'no_factors' using errcode = 'P0001';
  end if;

  -- as the wheel opens a round (0020 step 2)
  insert into app.invitations (org_id, round_id, employee_id, token_hash, sent_at, expires_at)
  select p_org, v_round, e.id,
         extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'),
         null, v_now + make_interval(days => v_close)
  from app.employees e
  where e.org_id = p_org and e.active
    and (not exists (select 1 from app.round_groups rg where rg.round_id = v_round)
         or e.group_id in (select rg.group_id from app.round_groups rg where rg.round_id = v_round))
  on conflict do nothing;

  insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
  select p_org, v_round, 'invitasjon', i.employee_id, i.id, v_now
  from app.invitations i where i.round_id = v_round
  on conflict do nothing;

  -- 0108 (AUD-30): the ladder, all due now. Due before the opening would be dropped as stale; at
  -- the same moment, dispatch_claim sends the pre-notices first and everyone's last (0106). A
  -- notice the wheel queued for the planned date and not yet sent is brought forward.
  insert into app.outbox as ob (org_id, round_id, kind, audience, due_at)
  select p_org, v_round, 'forvarsel', n.audience, v_now
  from app.wheel_notifications n
  join app.year_wheels w on w.id = n.wheel_id
  where w.org_id = p_org
  on conflict (round_id, kind, audience) where audience is not null do update
    set due_at = excluded.due_at, claimed_at = null
    where ob.sent_at is null and ob.failed_at is null;

  insert into app.round_starts (org_id, round_id, started_by) values (p_org, v_round, auth.uid());

  return jsonb_build_object('ok', true, 'round_id', v_round);
exception
  when raise_exception then
    if sqlerrm = 'no_factors' then
      return jsonb_build_object('error', 'no_factors');
    end if;
    raise;
end $function$;
revoke all on function app.start_next_pulse_unchecked(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- AUD-31: setup is the daglig leder's

alter policy measurement_write_insert on app.measurements
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy measurement_write_update on app.measurements
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

alter policy round_write_insert on app.rounds
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy round_write_update on app.rounds
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy round_write_delete on app.rounds
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

alter policy round_factor_write_insert on app.round_factors
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy round_factor_write_update on app.round_factors
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy round_factor_write_delete on app.round_factors
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

alter policy round_extra_write_insert on app.round_extra_questions
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy round_extra_write_update on app.round_extra_questions
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy round_extra_write_delete on app.round_extra_questions
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

alter policy round_module_write_insert on app.round_modules
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy round_module_write_update on app.round_modules
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy round_module_write_delete on app.round_modules
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

alter policy round_group_write_insert on app.round_groups
  with check (exists (select 1 from app.rounds r where r.id = round_groups.round_id
                        and app.has_role(r.org_id, array['daglig_leder']::app.org_role[])));
alter policy round_group_write_update on app.round_groups
  using (exists (select 1 from app.rounds r where r.id = round_groups.round_id
                   and app.has_role(r.org_id, array['daglig_leder']::app.org_role[])))
  with check (exists (select 1 from app.rounds r where r.id = round_groups.round_id
                        and app.has_role(r.org_id, array['daglig_leder']::app.org_role[])));
alter policy round_group_write_delete on app.round_groups
  using (exists (select 1 from app.rounds r where r.id = round_groups.round_id
                   and app.has_role(r.org_id, array['daglig_leder']::app.org_role[])));

alter policy round_org_question_write_insert on app.round_org_questions
  with check (exists (select 1 from app.rounds r where r.id = round_org_questions.round_id
                        and app.has_role(r.org_id, array['daglig_leder']::app.org_role[])));
alter policy round_org_question_write_update on app.round_org_questions
  using (exists (select 1 from app.rounds r where r.id = round_org_questions.round_id
                   and app.has_role(r.org_id, array['daglig_leder']::app.org_role[])))
  with check (exists (select 1 from app.rounds r where r.id = round_org_questions.round_id
                        and app.has_role(r.org_id, array['daglig_leder']::app.org_role[])));
alter policy round_org_question_write_delete on app.round_org_questions
  using (exists (select 1 from app.rounds r where r.id = round_org_questions.round_id
                   and app.has_role(r.org_id, array['daglig_leder']::app.org_role[])));

-- the organisation's own question bank, which the rounds ask from
alter policy org_question_write_insert on app.org_questions
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy org_question_write_update on app.org_questions
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
alter policy org_question_write_delete on app.org_questions
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

-- the two definer functions behind Måleoppsett's extras and «Tilbakestill»
CREATE OR REPLACE FUNCTION public.set_round_extras(p_round uuid, p_keys text[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_round  record;
  v_keys   text[];
  v_reason text := nullif(btrim(p_reason), '');
begin
  select r.*, ms.kind as ms_kind into v_round
  from app.rounds r join app.measurements ms on ms.id = r.measurement_id where r.id = p_round;
  if not found or not app.has_role(v_round.org_id, array['daglig_leder']::app.org_role[]) then
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
end $function$;

CREATE OR REPLACE FUNCTION public.reset_round_settings(p_round uuid, p_section text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_round record;
  d       app.survey_defaults;
begin
  select r.*, ms.kind as ms_kind into v_round
  from app.rounds r join app.measurements ms on ms.id = r.measurement_id where r.id = p_round;
  if not found or not app.has_role(v_round.org_id, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if v_round.status <> 'planlagt' then
    return jsonb_build_object('error', 'locked');
  end if;
  select * into d from app.survey_defaults where org_id = v_round.org_id;
  if not found then
    return jsonb_build_object('error', 'no_standard');
  end if;

  if p_section = 'rytme' then
    update app.rounds set
      reminder_day = d.reminder_day, final_reminder = d.final_reminder,
      close_after_days = case when v_round.ms_kind = 'grunnlinje' then d.close_days_grunnlinje else d.close_days_puls end
    where id = p_round;
    update app.rounds r set closes_at = r.opens_at + make_interval(days => r.close_after_days)
    where r.id = p_round and r.opens_at is not null;
  elsif p_section = 'kommentarer' then
    update app.rounds set comment_policy = d.comment_policy, allow_dialogue = d.allow_dialogue where id = p_round;
  elsif p_section = 'tillegg' and v_round.ms_kind = 'grunnlinje' then
    perform app.set_round_extras_unchecked(p_round, d.extras);
    update app.rounds set extras_off_reason = d.extras_off_reason where id = p_round;
  elsif p_section = 'utsending' then
    update app.rounds set sms_when = null where id = p_round;
  else
    return jsonb_build_object('error', 'invalid');
  end if;
  return jsonb_build_object('ok', true);
end $function$;
