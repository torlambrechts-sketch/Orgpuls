-- 0071_module_measures.sql — measures from a module factor, and the puls that re-measures them
-- (D-115).
--
-- **A measure on a module factor.** app.measures keeps one lifecycle for every measure (step,
-- owner, deadline, effect), so a module measure is a row there too, naming the module factor
-- and the statement that re-measures it instead of a core factor:
--
--   factor_key         the core factor, or null
--   module_factor_id   the module factor, or null — exactly one of the two
--   remeasure_item_id  the module statement the next puls asks; required with a module factor,
--                      and a statement of that factor
--
-- Every existing reader of measures reads the core ones (factor_key is not null) and stays as
-- it was; a module measure is read by lib/modules/measures.ts. Nothing else changes.
--
-- **The puls.** When a puls is created — planned by the wheel, or started now — it asks the
-- re-measure statement of every open module measure (trigger round_pulse_modules), exactly as
-- it asks every core factor with an open measure. A module factor with no open measure drops
-- out. round_module_ok (0067, 0068) lets the database's own functions set a round's modules
-- while nobody has answered it; a client still only on a planned round.

alter table app.measures
  alter column factor_key drop not null,
  add column module_factor_id uuid references app.module_factors (id),
  add column remeasure_item_id uuid references app.module_items (id),
  add constraint measure_one_factor check ((factor_key is null) <> (module_factor_id is null)),
  add constraint measure_module_remeasure check (module_factor_id is null or remeasure_item_id is not null),
  add constraint measure_core_no_item check (factor_key is null or remeasure_item_id is null);
create index measures_module_factor_idx on app.measures (module_factor_id);
create index measures_remeasure_item_idx on app.measures (remeasure_item_id);

create function app.measure_module_ok() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if new.module_factor_id is not null and (tg_op = 'INSERT'
     or new.module_factor_id is distinct from old.module_factor_id
     or new.remeasure_item_id is distinct from old.remeasure_item_id) then
    if not exists (select 1 from app.module_items i
                   where i.id = new.remeasure_item_id and i.factor_id = new.module_factor_id and i.kind = 'likert5') then
      raise exception 'the re-measure statement must be one of the module factor''s' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $fn$;

create trigger measure_module_ok before insert or update on app.measures
  for each row execute function app.measure_module_ok();

-- ---------------------------------------------------------------- a round's modules, by the database
/** Whether anyone has answered a round: a yes or no, for the trigger below, which runs as the caller. */
create function app.round_answered(p_round uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select exists (select 1 from app.responses r where r.round_id = p_round) $fn$;
revoke all on function app.round_answered(uuid) from public, anon;
grant execute on function app.round_answered(uuid) to authenticated;

/** Whether an organisation's round may ask a module: published, or a draft it pilots (0068). */
create function app.module_usable(p_module uuid, p_org uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from app.question_modules m
                 where m.id = p_module
                   and (m.status = 'published'
                        or (m.status = 'draft' and exists (select 1 from app.module_pilots p
                                                           where p.module_id = m.id and p.org_id = p_org))))
$fn$;
revoke all on function app.module_usable(uuid, uuid) from public, anon;
grant execute on function app.module_usable(uuid, uuid) to authenticated;

create or replace function app.round_module_ok() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare
  v_status   app.round_status;
  v_answered boolean;
  v_client   boolean := current_user in ('authenticated', 'anon');
begin
  select r.status into v_status from app.rounds r
  where r.id = case when tg_op = 'DELETE' then old.round_id else new.round_id end;
  v_answered := app.round_answered(case when tg_op = 'DELETE' then old.round_id else new.round_id end);
  if tg_op = 'DELETE' then
    if found and (v_answered or (v_client and v_status <> 'planlagt')) then
      raise exception 'a round''s modules are fixed once it has opened' using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  -- a client changes a planned round only; the database's own functions (a puls it opens now)
  -- until somebody has answered
  if (v_answered or v_status = 'lukket' or (v_client and v_status <> 'planlagt'))
     and (tg_op = 'INSERT' or to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception 'a round''s modules are fixed once it has opened' using errcode = 'restrict_violation';
  end if;
  if not app.module_usable(new.module_id, new.org_id) then
    raise exception 'module % is not published', new.module_id using errcode = 'check_violation';
  end if;
  -- module_items is readable by the caller wherever the module is usable (module_visible)
  if exists (select 1 from unnest(new.item_ids) x
             where not exists (select 1 from app.module_items i
                               where i.id = x and i.module_id = new.module_id and i.kind = 'likert5')) then
    raise exception 'a round asks only statements of its module' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

/**
 * A new puls asks the re-measure statement of every open module measure, one row per module.
 * It runs as the definer, whoever created the round, and only for a puls.
 */
create function app.round_pulse_modules() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.measurements ms where ms.id = new.measurement_id and ms.kind = 'puls') then
    return null;
  end if;
  insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items, include_segments)
  select new.org_id, new.id, f.module_id, array_agg(distinct me.remeasure_item_id), false, false
  from app.measures me join app.module_factors f on f.id = me.module_factor_id
  where me.org_id = new.org_id and me.step <> 'lukket' and me.remeasure_item_id is not null
  group by f.module_id
  on conflict do nothing;
  return null;
end $fn$;

create trigger round_pulse_modules after insert on app.rounds
  for each row execute function app.round_pulse_modules();

revoke all on function app.measure_module_ok() from public, anon, authenticated;
revoke all on function app.round_pulse_modules() from public, anon, authenticated;

-- ---------------------------------------------------------------- start_next_pulse
-- 0038 / 0052's function, with the two 0071 lines marked.
create or replace function app.start_next_pulse_unchecked(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- what the next planned puls was defined with
  select r.* into v_src
  from app.rounds r join app.measurements m on m.id = r.measurement_id
  where r.org_id = p_org and r.status = 'planlagt' and m.kind = 'puls'
  order by r.opens_at nulls last, r.id
  limit 1;

  v_close := coalesce(v_src.close_after_days, 7);
  v_remind := coalesce(v_src.reminder_day, 2);

  select coalesce(o.timezone, 'Europe/Oslo') into v_tz from app.organizations o where o.id = p_org;
  v_year := extract(year from v_now at time zone v_tz)::int;

  insert into app.measurements (org_id, kind, year, label)
  values (p_org, 'puls', v_year, null) returning id into v_meas;

  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, audience,
                          comment_policy, allow_dialogue, reminder_day, close_after_days)
  values (p_org, v_meas, 'apen', v_now, v_now + make_interval(days => v_close),
          coalesce(v_src.audience, 'alle_ansatte'), coalesce(v_src.comment_policy, 'lave'),
          coalesce(v_src.allow_dialogue, true), v_remind, v_close)
  returning id into v_round;

  if v_src.id is not null then
    insert into app.round_factors (org_id, round_id, factor_key)
    select p_org, v_round, rf.factor_key from app.round_factors rf where rf.round_id = v_src.id;
    insert into app.round_extra_questions (org_id, round_id, extra_key)
    select p_org, v_round, q.extra_key from app.round_extra_questions q where q.round_id = v_src.id;
    insert into app.round_groups (round_id, group_id)
    select v_round, g.group_id from app.round_groups g where g.round_id = v_src.id;
  else
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

  -- the ladder, all due now: the verneombud still hears first in the queue's order
  insert into app.outbox (org_id, round_id, kind, audience, due_at)
  select p_org, v_round, 'forvarsel', n.audience, v_now - make_interval(days => n.lead_days)
  from app.wheel_notifications n
  join app.year_wheels w on w.id = n.wheel_id
  where w.org_id = p_org
  on conflict do nothing;

  insert into app.round_starts (org_id, round_id, started_by) values (p_org, v_round, auth.uid());

  return jsonb_build_object('ok', true, 'round_id', v_round);
exception
  when raise_exception then
    if sqlerrm = 'no_factors' then
      return jsonb_build_object('error', 'no_factors');
    end if;
    raise;
end $function$;
