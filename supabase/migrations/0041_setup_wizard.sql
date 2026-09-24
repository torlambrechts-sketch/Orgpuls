-- 0041_setup_wizard.sql — what the Veiviser needs beneath it (P7, D-76).
--
-- 1. `app.setup_progress`: where an organisation is in the wizard. One row per
--    organisation, holding a step and whether it was finished or put aside. A half-done
--    wizard is a valid state, so every step saves through its own action and this row
--    only remembers where to resume ("Fortsett senere"). It holds no person: it says how
--    far the undertaking got, not who pressed what.
-- 2. `halvarspuls`: the design's "Hvert halvår", one puls six months after the baseline.
-- 3. `wheel_tick()` plans ahead by month rather than by exact time, keeps a grunnlinje
--    yearly, and plans a puls only when a measure is open for it to follow. Everything
--    else is 0020's text unchanged.
-- 4. `public.plan_first_round`: "Planlegg utsendingen". The first grunnlinje on the
--    Tuesday chosen, and the wheel switched on so it opens, reminds and closes as every
--    round after it does.

alter type app.wheel_cadence add value if not exists 'halvarspuls';

create or replace function app.wheel_months(p_cadence app.wheel_cadence, p_baseline int,
                                            p_skip_fellesferie boolean)
  returns table (month int, kind app.measurement_kind)
  language plpgsql immutable set search_path = ''
as $fn$
declare i int;
begin
  month := p_baseline; kind := 'grunnlinje'; return next;

  if p_cadence = 'kvartalspuls' then
    for i in 1..3 loop
      month := ((p_baseline - 1 + i * 3) % 12) + 1;
      kind := 'puls';
      if not (p_skip_fellesferie and month = 7) then return next; end if;
    end loop;
  elsif p_cadence::text = 'halvarspuls' then
    month := ((p_baseline - 1 + 6) % 12) + 1;
    kind := 'puls';
    if not (p_skip_fellesferie and month = 7) then return next; end if;
  elsif p_cadence = 'manedspuls' then
    for i in 1..11 loop
      month := ((p_baseline - 1 + i) % 12) + 1;
      kind := 'puls';
      if not (p_skip_fellesferie and month = 7) then return next; end if;
    end loop;
  end if;
end $fn$;

-- 1 ---------------------------------------------------------------------- progress
create table app.setup_progress (
  org_id       uuid primary key references app.organizations (id) on delete cascade,
  step         int not null default 0 check (step between 0 and 8),
  completed_at timestamptz,
  skipped_at   timestamptz,
  updated_at   timestamptz not null default now()
);

comment on table app.setup_progress is
  'Where an organisation is in the Veiviser: the step to resume at, and whether it was finished or put aside. One row per organisation; no person.';

create function app.setup_progress_touch() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

create trigger setup_progress_touch
  before update on app.setup_progress
  for each row execute function app.setup_progress_touch();

alter table app.setup_progress enable row level security;

create policy setup_progress_read on app.setup_progress for select to authenticated
  using (app.is_org_member(org_id));
create policy setup_progress_insert on app.setup_progress for insert to authenticated
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
create policy setup_progress_update on app.setup_progress for update to authenticated
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

revoke all on app.setup_progress from anon, public;
grant select, insert, update on app.setup_progress to authenticated;

-- 3 ---------------------------------------------------------------------- the tick
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
begin
  for w in select * from app.year_wheels where active loop
    select coalesce(o.timezone, 'Europe/Oslo') into v_tz
    from app.organizations o where o.id = w.org_id;

    -- 1 ---------------------------------------------------------------- forvarsel
    -- The notification ladder. Each audience has its own lead time, and the verneombud's
    -- is first by construction of the rows rather than by a rule written here: § 6-2
    -- requires involvement before the kartlegging starts, so a wheel that warned them
    -- last would be a wheel that broke the law on a schedule.
    for r in
      select ro.id, ro.org_id, ro.opens_at from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'planlagt' and ro.opens_at is not null
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
-- 4 ---------------------------------------------------------------- first send-out
-- The first grunnlinje at 09:00 on the day chosen, in the organisation's own zone: the
-- whole instrument (every factor and the four questions outside the index), a reminder
-- on day four and a close on day seven, as the wizard's timeline says. It is planned, not
-- opened: the wheel opens it when the hour comes, after the ladder has warned the
-- verneombud, so this and every round after it go out the same way.
--
-- Refused unless the caller is a daglig leder; once the organisation has measured (the
-- wheel plans from then on); for a weekend; less than three days ahead, which is the
-- verneombud's notice plus a day; more than 120 days ahead; and with nobody to invite.
-- Pressed again, it moves the grunnlinje it planned rather than planning a second.
create function public.plan_first_round(p_org uuid, p_opens_on date) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
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
    values (p_org, v_meas, 'planlagt', v_at, v_at + interval '7 days', 4, 7)
    returning id into v_round;
  end if;

  insert into app.round_factors (org_id, round_id, factor_key)
  select p_org, v_round, f.key from app.factors f
  on conflict do nothing;
  insert into app.round_extra_questions (org_id, round_id, extra_key)
  select p_org, v_round, q.key from app.extra_questions q
  on conflict do nothing;

  -- the wheel has described the year until now; from here it keeps it
  insert into app.year_wheels (org_id, active) values (p_org, true)
  on conflict (org_id) do update set active = true;

  return jsonb_build_object('ok', true, 'round_id', v_round, 'opens_at', v_at);
end $fn$;

revoke all on function public.plan_first_round(uuid, date) from public, anon;
grant execute on function public.plan_first_round(uuid, date) to authenticated;
