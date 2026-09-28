-- 0096_extend_if_low.sql — «Forleng tre dager hvis svarprosenten er under 50» does what it says
-- (gap analysis P0-4, D-146).
--
-- Årshjulet has stored `year_wheels.extend_if_low` since 0019, default on, with the line «Én gang
-- per runde. Ny påminnelse følger med.» Nothing read it: a round with a third of its people
-- answered closed on time like any other. Now the scheduler reads it where it closes a round:
--
--   * when the wheel says so, the round is open, its closing time has come, it has fewer than
--     half as many responses as invitations (the rate every screen shows), and it has not been extended before, the round stays open three
--     days more instead of closing: `closes_at` moves, and so does every invitation's
--     `expires_at`, so the links keep working for exactly as long as the round does;
--   * `rounds.extended_at` records that it happened, which is what makes it once per round;
--   * everyone who has not answered is sent a reminder, now. The reminder is the round's
--     «paminnelse» row, queued again (the same upsert request_link uses, 0076): a person has one
--     reminder row per round, and the dispatcher mints a fresh link each time it sends one.
--
-- The rest of wheel_tick is 0052's, unchanged.

alter table app.rounds add column extended_at timestamptz;

comment on column app.rounds.extended_at is
  'When the wheel kept the round open three days more because fewer than half had answered (0096, extend_if_low). Once per round.';

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
  v_invited int;
  v_answered int;
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
      -- 0096: fewer than half answered, and the wheel says extend: three days more, once
      -- the response rate as every screen counts it: responses over invitations
      select count(*) into v_invited from app.invitations i where i.round_id = r.id;
      select count(*) into v_answered from app.responses x where x.round_id = r.id;

      if w.extend_if_low and r.extended_at is null and v_invited > 0 and v_answered * 2 < v_invited then
        update app.rounds
        set closes_at = r.closes_at + interval '3 days', extended_at = now()
        where id = r.id;
        update app.invitations
        set expires_at = greatest(expires_at, r.closes_at + interval '3 days')
        where round_id = r.id and responded_at is null;

        -- a reminder now to everyone who has not answered: their one reminder row, queued again
        insert into app.outbox as ob (org_id, round_id, kind, employee_id, invitation_id, due_at)
        select r.org_id, r.id, 'paminnelse', i.employee_id, i.id, now()
        from app.invitations i
        where i.round_id = r.id and i.responded_at is null
        on conflict (round_id, kind, employee_id) where employee_id is not null do update
          set due_at = now(), sent_at = null, failed_at = null, claimed_at = null, attempts = 0,
              last_error = null, provider_id = null, invitation_id = excluded.invitation_id;
        get diagnostics v_n = row_count;
        v_queued := v_queued + v_n;
        continue;
      end if;

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
    for m in select * from app.wheel_months(w.cadence, w.baseline_month, w.skip_fellesferie) loop
      for v_year in extract(year from now())::int .. extract(year from now())::int + 1 loop
        v_at := app.first_tuesday(v_year, m.month, v_tz);
        continue when v_at <= now() or v_at > now() + interval '1 year';

        continue when exists (
          select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
          where ro.org_id = w.org_id and ms.kind = m.kind
            and date_trunc('month', ro.opens_at at time zone v_tz)
              = date_trunc('month', v_at at time zone v_tz));

        continue when m.kind = 'grunnlinje' and exists (
          select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
          where ro.org_id = w.org_id and ms.kind = 'grunnlinje'
            and ro.opens_at < v_at and ro.opens_at > v_at - interval '6 months');

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
