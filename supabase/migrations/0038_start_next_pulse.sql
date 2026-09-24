-- 0038_start_next_pulse.sql — "Start neste puls nå" (design 3, Målinger's Deltakelse card).
--
-- The design offers a leader one button to send the next puls today instead of waiting for
-- the wheel. It writes rounds, invitations and notices, so it is a function with its guards
-- in the database (plan S7), not a client insert:
--
--   * only a daglig leder may call it — the role that runs the undertaking and the one the
--     wheel already answers to (`wheel_write`);
--   * it refuses while any round of the organisation is open: two open rounds would ask the
--     same people twice at once, and a second invitation would reach them before the first
--     had closed;
--   * it refuses within 14 days of the last round closing. A puls a week after a grunnlinje
--     measures nothing a measure could have moved, and asking again that soon is what
--     teaches people to stop answering;
--   * it sends through the outbox, exactly as the wheel opens a round (0020 step 2): an
--     invitation per invited employee with a hash nobody holds, a notice per invitation,
--     and the ladder's forvarsel — due now, since there is no "before" left;
--   * every start is recorded in `app.round_starts`: who started which round, when.
--
-- It sends an EXTRA puls; it does not move a planned one. The planned rounds are the
-- wheel's, and the wheel re-plans any month whose round went missing (0020 step 5), so
-- moving December's puls to today would only make December's come back. The new puls
-- takes what the next planned puls was defined with — its factors, extra questions,
-- reminder day and length — and, with none planned, the wheel's own rule: the factors with
-- an open measure. With no factor to ask about there is no puls, and it says so.
--
-- It returns `{ok, round_id}` or `{error}`. The round id is not a response and links no
-- one to anything; invariant 3 is about the row a respondent writes.

create table app.round_starts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  round_id   uuid not null references app.rounds (id) on delete cascade,
  -- the leader who pressed it; kept when their account goes, as "someone who has left"
  started_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now()
);

create index round_starts_org_idx on app.round_starts (org_id, started_at desc);

alter table app.round_starts enable row level security;

-- read by the two roles that answer for the kartlegging; written only by the function below
create policy round_start_read on app.round_starts
  for select using (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));

revoke all on app.round_starts from anon, authenticated, public;
grant select on app.round_starts to authenticated;

create function public.start_next_pulse(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
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
    from app.measures me where me.org_id = p_org and me.step <> 'lukket';
  end if;

  if not exists (select 1 from app.round_factors rf where rf.round_id = v_round) then
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
end $fn$;

revoke all on function public.start_next_pulse(uuid) from public, anon;
grant execute on function public.start_next_pulse(uuid) to authenticated;
