-- 0052_trial_end.sql — what happens when a trial ends unconfirmed (D-94).
--
-- Decided by the owner (D-93): the trial is 15 days, one extension of 15 is possible, and an
-- organisation that has not confirmed a plan gets 14 days' grace with everything working.
-- After that it is read-only until it confirms:
--
--   * it can still sign in, read every result and report, work with its measures, and
--     confirm a plan under Oppsett › Betaling;
--   * it cannot start a survey: start_next_pulse and plan_first_round refuse, and the
--     scheduler neither sends a forvarsel nor opens a planned round;
--   * a round that is already open is never cut off. Its reminders go out and it closes on
--     its date: the people who have answered did so in good faith, and a round stopped
--     halfway would change who counts against the threshold.
--
-- Confirming a plan (save_billing), or an admin extending the trial, lifts it at once; a
-- planned round that waited opens on the next tick with its full length.
--
-- Everything turns on one function, app.org_access(), so the rule lives in one place.

create function app.grace_days() returns int
  language sql immutable parallel safe set search_path = ''
as $fn$ select 14 $fn$;

-- trial | grace | read_only | active. An organisation with no billing row is treated as in trial.
create function app.org_access(p_org uuid) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce((
    select case
      when b.confirmed_at is not null then 'active'
      when now() < b.trial_ends_at then 'trial'
      when now() < b.trial_ends_at + make_interval(days => app.grace_days()) then 'grace'
      else 'read_only'
    end
    from app.billing b where b.org_id = p_org), 'trial')
$fn$;

-- The admin's status reads the same function: trial, active, grace or read_only.
create or replace function app.org_status(p_org uuid) returns text
  language sql stable security definer set search_path = ''
as $fn$ select app.org_access(p_org) $fn$;

-- For every member, not only the daglig leder who may read app.billing: the app's banner.
create function public.org_access_state(p_org uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select case when app.is_org_member(p_org) then (
    select jsonb_build_object('access', app.org_access(p_org),
                              'trial_ends_at', b.trial_ends_at,
                              'read_only_from', b.trial_ends_at + make_interval(days => app.grace_days()))
    from app.billing b where b.org_id = p_org)
  end
$fn$;

-- ---------------------------------------------------------------- starting a survey
-- The two ways a customer starts one are wrapped rather than rewritten: the originals move to
-- app, unchanged, and the public names check access first.
alter function public.start_next_pulse(uuid) set schema app;
alter function app.start_next_pulse(uuid) rename to start_next_pulse_unchecked;
revoke all on function app.start_next_pulse_unchecked(uuid) from public, anon, authenticated;

create function public.start_next_pulse(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if p_org is not null and app.org_access(p_org) = 'read_only' and app.is_org_member(p_org) then
    return jsonb_build_object('error', 'read_only');
  end if;
  return app.start_next_pulse_unchecked(p_org);
end $fn$;

alter function public.plan_first_round(uuid, date) set schema app;
alter function app.plan_first_round(uuid, date) rename to plan_first_round_unchecked;
revoke all on function app.plan_first_round_unchecked(uuid, date) from public, anon, authenticated;

create function public.plan_first_round(p_org uuid, p_opens_on date) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if p_org is not null and app.org_access(p_org) = 'read_only' and app.is_org_member(p_org) then
    return jsonb_build_object('error', 'read_only');
  end if;
  return app.plan_first_round_unchecked(p_org, p_opens_on);
end $fn$;

-- ---------------------------------------------------------------- the scheduler
-- 0042's wheel_tick, with the three 0052 lines marked.
create or replace function app.wheel_tick() returns app.job_runs
  language plpgsql security definer set search_path = ''
as $fn$
declare
  w         app.year_wheels%rowtype;
  r         record;
  m         record;
  v_opened  int := 0;
  v_closed  int := 0;
  v_queued  int := 0;
  v_planned int := 0;
  v_n       int;
  v_tz      text;
  v_meas    uuid;
  v_round   uuid;
  v_year    int;
  v_at      timestamptz;
  v_run     app.job_runs;
  v_readonly boolean;
begin
  for w in select * from app.year_wheels where active loop
    -- 0042: the same lock start_next_pulse takes, so the two cannot open rounds at once
    perform pg_advisory_xact_lock(hashtext('start_next_pulse:' || w.org_id::text));
    select coalesce(o.timezone, 'Europe/Oslo') into v_tz
    from app.organizations o where o.id = w.org_id;

    -- 0052: past its trial and 14 days' grace, unconfirmed, an organisation reads its results
    -- and sends nothing new. A planned round that falls due waits a day at a time, so it opens
    -- with its full length once the plan is confirmed; a round already open runs on, with its
    -- reminders and its close (steps 3 and 4 do not look at this).
    v_readonly := coalesce(app.org_access(w.org_id) = 'read_only', false);
    if v_readonly then
      update app.rounds set opens_at = now() + interval '1 day'
      where org_id = w.org_id and status = 'planlagt' and opens_at is not null and opens_at <= now() + interval '1 day';
    end if;

    -- 1 ---------------------------------------------------------------- forvarsel
    -- The notification ladder. Each audience has its own lead time, and the verneombud's
    -- is first by construction of the rows rather than by a rule written here: § 6-2
    -- requires involvement before the kartlegging starts, so a wheel that warned them
    -- last would be a wheel that broke the law on a schedule.
    for r in
      select ro.id, ro.org_id, ro.opens_at from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'planlagt' and ro.opens_at is not null
        and not v_readonly
    loop
      insert into app.outbox (org_id, round_id, kind, audience, due_at)
      select r.org_id, r.id, 'forvarsel', n.audience, r.opens_at - make_interval(days => n.lead_days)
      from app.wheel_notifications n
      where n.wheel_id = w.id
        and r.opens_at - make_interval(days => n.lead_days) <= now()
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 2 ---------------------------------------------------------------- open
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'planlagt'
        and ro.opens_at is not null and ro.opens_at <= now()
        and not v_readonly
    loop
      update app.rounds
      set status = 'apen',
          closes_at = r.opens_at + make_interval(days => r.close_after_days)
      where id = r.id;
      v_opened := v_opened + 1;

      /*
       * An invitation per invited employee, with a hash of bytes this function then
       * throws away. The row exists so the response rate has a denominator; it cannot be
       * redeemed until a dispatcher mints a real token for it. Nobody has been sent
       * anything yet, so nobody should be able to answer yet.
       */
      insert into app.invitations (org_id, round_id, employee_id, token_hash, sent_at, expires_at)
      select r.org_id, r.id, e.id,
             extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'),
             null,
             r.opens_at + make_interval(days => r.close_after_days)
      from app.employees e
      where e.org_id = r.org_id and e.active
        and (not exists (select 1 from app.round_groups rg where rg.round_id = r.id)
             or e.group_id in (select rg.group_id from app.round_groups rg where rg.round_id = r.id))
      on conflict do nothing;

      insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      select r.org_id, r.id, 'invitasjon', i.employee_id, i.id, r.opens_at
      from app.invitations i where i.round_id = r.id
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 3 ---------------------------------------------------------------- reminder
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'apen'
        and ro.reminder_day is not null
        and ro.opens_at + make_interval(days => ro.reminder_day) <= now()
    loop
      insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      select r.org_id, r.id, 'paminnelse', i.employee_id, i.id,
             r.opens_at + make_interval(days => r.reminder_day)
      from app.invitations i
      where i.round_id = r.id and i.responded_at is null
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 4 ---------------------------------------------------------------- close
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'apen'
        and ro.closes_at is not null and ro.closes_at <= now()
    loop
      update app.rounds set status = 'lukket', frozen_at = now() where id = r.id;
      v_closed := v_closed + 1;

      insert into app.outbox (org_id, round_id, kind, audience, due_at)
      select r.org_id, r.id, 'resultat', n.audience, r.closes_at
      from app.wheel_notifications n where n.wheel_id = w.id
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 5 ---------------------------------------------------------------- plan ahead
    -- One round per month the cadence names, up to a year out, created only when it does
    -- not already exist. This is what makes "Neste: september 2027" a row rather than a
    -- sentence.
    for m in select * from app.wheel_months(w.cadence, w.baseline_month, w.skip_fellesferie) loop
      for v_year in extract(year from now())::int .. extract(year from now())::int + 1 loop
        v_at := app.first_tuesday(v_year, m.month, v_tz);
        continue when v_at <= now() or v_at > now() + interval '1 year';

        -- 0041: a month that already holds a round of this kind is planned, whatever its
        -- day. A first send-out on a chosen Tuesday must not gain a twin on the first one.
        continue when exists (
          select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
          where ro.org_id = w.org_id and ms.kind = m.kind
            and date_trunc('month', ro.opens_at at time zone v_tz)
              = date_trunc('month', v_at at time zone v_tz));

        -- 0041: a grunnlinje is yearly, so none within six months after another. A first
        -- send-out in October with the baseline month set to November is the year's
        -- grunnlinje; the wheel's own comes the November after.
        continue when m.kind = 'grunnlinje' and exists (
          select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
          where ro.org_id = w.org_id and ms.kind = 'grunnlinje'
            and ro.opens_at < v_at and ro.opens_at > v_at - interval '6 months');

        -- 0041: a puls follows measures. With none open it would carry no factor and send
        -- an empty survey, and in a month a grunnlinje opens it would ask the same again.
        continue when m.kind = 'puls' and (
          not exists (select 1 from app.measures me
                      where me.org_id = w.org_id and me.step <> 'lukket')
          or exists (
            select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
            where ro.org_id = w.org_id and ms.kind = 'grunnlinje'
              and date_trunc('month', ro.opens_at at time zone v_tz)
                = date_trunc('month', v_at at time zone v_tz)));

        select ms.id into v_meas from app.measurements ms
        where ms.org_id = w.org_id and ms.kind = m.kind and ms.year = v_year
          and extract(month from coalesce(
                (select min(ro.opens_at) from app.rounds ro where ro.measurement_id = ms.id),
                v_at)) = m.month
        limit 1;

        if v_meas is null then
          insert into app.measurements (org_id, kind, year, label)
          values (w.org_id, m.kind, v_year, null) returning id into v_meas;
        end if;

        select ro.id into v_round from app.rounds ro
        where ro.measurement_id = v_meas and ro.opens_at = v_at;

        if v_round is null then
          insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
          values (w.org_id, v_meas, 'planlagt', v_at, v_at + interval '7 days');
          v_planned := v_planned + 1;

          -- a grunnlinje carries the whole instrument; a puls carries the factors that
          -- currently have an open measure, which is the design's own rule
          insert into app.round_factors (org_id, round_id, factor_key)
          select w.org_id, currval_round.id, f.key
          from (select ro.id from app.rounds ro
                where ro.measurement_id = v_meas and ro.opens_at = v_at) as currval_round
          cross join app.factors f
          where m.kind = 'grunnlinje'
             or f.key in (select distinct me.factor_key from app.measures me
                          where me.org_id = w.org_id and me.step <> 'lukket')
          on conflict do nothing;
        end if;
      end loop;
    end loop;
  end loop;

  insert into app.job_runs (opened, closed, queued, planned)
  values (v_opened, v_closed, v_queued, v_planned)
  returning * into v_run;

  return v_run;
end $fn$;


revoke all on function app.wheel_tick() from public, anon, authenticated;
revoke all on function app.org_access(uuid) from public, anon;
revoke all on function public.org_access_state(uuid) from public, anon;
grant execute on function public.org_access_state(uuid) to authenticated;
revoke all on function public.start_next_pulse(uuid) from public, anon;
grant execute on function public.start_next_pulse(uuid) to authenticated;
revoke all on function public.plan_first_round(uuid, date) from public, anon;
grant execute on function public.plan_first_round(uuid, date) to authenticated;
