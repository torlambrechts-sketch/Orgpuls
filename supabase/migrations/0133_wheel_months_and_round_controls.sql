-- 0133_wheel_months_and_round_controls.sql — the Målinger write paths D-74 left out (D-180).
--
-- The year rail's detail line draws «＋ Legg til puls i …» on an empty month and «Hopp over denne»
-- on a planned puls; the Deltakelse card, while a round is open, draws «Lukk runden» and «Send
-- påminnelse til de N» (v3 1170-1210, 4455-4493, 6100-6131). D-74 left all four out because
-- nothing in the schema could keep the promise: the wheel re-plans every month its cadence names
-- (0020 step 5), so a deleted puls came back within the hour. This gives each a record and a
-- guarded function.
--
-- ---------------------------------------------------------------- the months
--   * app.wheel_month_marks: one row per organisation and month the leader changed — «hoppet_over»
--     (the wheel's puls is not wanted this month) or «lagt_til» (a puls the cadence does not name).
--     The wheel reads it: it does not plan a puls in a skipped month, and it plans an added month
--     as it plans its own (app.wheel_plan, the tick's step 5 lifted out so the functions below can
--     plan at once rather than within the hour).
--   * public.wheel_month_change(org, year, month, action) is the one write: daglig leder only; a
--     month after the current one, in this year or the next (the rail's years); never a month with
--     an open or closed round. «hopp_over» deletes the planned puls — the rail's «Hopp over denne»,
--     and «Fjern pulsen» when the puls was added — and records a skip only where the cadence would
--     plan it again. «ta_tilbake» removes the skip and lets the wheel plan the month. «legg_til»
--     plans a puls at the wheel's hour (first Tuesday, 09:00) with the wheel's factors: those with
--     an open measure, so with none it says so, as «Start neste puls nå» does (0038).
--
-- ---------------------------------------------------------------- the open round
--   * app.close_round is the tick's close (0020 step 4) lifted out, so «Lukk runden» closes a round
--     exactly as the wheel does: status, frozen_at, and the resultat notice to the ladder. Results,
--     notices and k are unchanged because nothing else is. public.close_round_now sets closes_at to
--     the moment it closed (the date every screen prints, and the publish date that follows it,
--     0129), then calls it. It never extends: the leader chose to close.
--   * app.round_reminders records every reminder a round has sent, from any source: the ladder's
--     (stige), the day-before one (siste, 0076), the extension's (forlengelse, 0096) and the
--     leader's (manuell). The design's rule is «Maks to påminnelser per runde» — «mer enn to
--     oppleves som mas» — and a person does not care who pressed what, so every source counts
--     against the same two, and every source stops at two.
--   * public.send_round_reminder queues the ladder's own reminder — the round's «paminnelse» row
--     per unanswered invitation, re-queued as 0096 and request_link do — only to those who have
--     not answered, only while the round is open, and never a third.
--   * public.reminder_status gives the card what it prints: how many reminders went, when the last
--     did, and N, the round's outstanding invitations. N is a count for the whole round, never per
--     group, and it is the organisation total participation already prints (D-123 keeps totals);
--     it is withheld when fewer than k were asked in the whole round, as D-123 withholds a group.

-- ---------------------------------------------------------------- tables

create type app.wheel_month_mark as enum ('hoppet_over', 'lagt_til');

create table app.wheel_month_marks (
  org_id     uuid not null references app.organizations (id) on delete cascade,
  year       int not null check (year between 2000 and 2200),
  month      int not null check (month between 1 and 12),
  mark       app.wheel_month_mark not null,
  -- the leader who changed the month; kept when their account goes, as round_starts does
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, year, month)
);

create index wheel_month_marks_created_by_idx on app.wheel_month_marks (created_by) where created_by is not null;

alter table app.wheel_month_marks enable row level security;

-- every member reads the rail; only the function below writes
create policy wheel_month_mark_read on app.wheel_month_marks
  for select to authenticated using (app.is_org_member(org_id));

revoke all on app.wheel_month_marks from anon, authenticated, public;
grant select on app.wheel_month_marks to authenticated;

create type app.reminder_source as enum ('stige', 'siste', 'forlengelse', 'manuell');

create table app.round_reminders (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references app.organizations (id) on delete cascade,
  round_id  uuid not null references app.rounds (id) on delete cascade,
  source    app.reminder_source not null,
  -- who pressed «Send påminnelse»; the wheel's own reminders have no sender
  sent_by   uuid references auth.users (id) on delete set null,
  sent_at   timestamptz not null default now(),
  check (source = 'manuell' or sent_by is null)
);

-- each automatic reminder once per round: this is what keeps the tick idempotent
create unique index round_reminders_auto_once on app.round_reminders (round_id, source) where source <> 'manuell';
create index round_reminders_round_idx on app.round_reminders (round_id, sent_at desc);
create index round_reminders_org_idx on app.round_reminders (org_id);
create index round_reminders_sent_by_idx on app.round_reminders (sent_by) where sent_by is not null;

alter table app.round_reminders enable row level security;

-- read by the two roles that answer for the kartlegging, as round_starts (0038); written only by
-- the functions below
create policy round_reminder_read on app.round_reminders
  for select to authenticated using (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));

revoke all on app.round_reminders from anon, authenticated, public;
grant select on app.round_reminders to authenticated;

-- a demo copy takes neither: its wheel plans its own months, and a sandbox sends no reminder
insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('wheel_month_marks', null, 'skip', null, 'the template''s changed months; a visitor''s wheel plans its own'),
  ('round_reminders', null, 'skip', null, 'the template''s reminders; a sandbox sends no mail');

-- The rounds open now have had their automatic reminders under the old rules; record them, so the
-- tick below neither sends them again nor lets a third through.
insert into app.round_reminders (org_id, round_id, source, sent_at)
select r.org_id, r.id, 'stige', r.opens_at + make_interval(days => r.reminder_day)
from app.rounds r
where r.status = 'apen' and r.reminder_day is not null and r.opens_at is not null
  and r.opens_at + make_interval(days => r.reminder_day) <= now()
on conflict do nothing;

insert into app.round_reminders (org_id, round_id, source, sent_at)
select r.org_id, r.id, 'forlengelse', r.extended_at
from app.rounds r
where r.status = 'apen' and r.extended_at is not null
on conflict do nothing;

insert into app.round_reminders (org_id, round_id, source, sent_at)
select r.org_id, r.id, 'siste', min(o.due_at)
from app.rounds r join app.outbox o on o.round_id = r.id and o.kind = 'siste_paminnelse'
where r.status = 'apen'
group by r.org_id, r.id
on conflict do nothing;

-- ---------------------------------------------------------------- helpers

/** How many reminders the round has sent, from every source (the two the design allows). */
create function app.round_reminder_count(p_round uuid) returns int
  language sql stable security definer set search_path = ''
as $fn$
  select count(*)::int from app.round_reminders rr where rr.round_id = p_round
$fn$;

revoke all on function app.round_reminder_count(uuid) from public, anon, authenticated;

/**
 * One planned round in a month, as the wheel plans it (0020 step 5): its measurement, the round at
 * the first Tuesday, 09:00, and its factors — the whole instrument for a grunnlinje, the factors
 * with an open measure for a puls. Returns the new round, or null when that month already had it.
 */
create function app.plan_round(p_org uuid, p_kind app.measurement_kind, p_year int, p_month int, p_tz text)
  returns uuid
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_at    timestamptz := app.first_tuesday(p_year, p_month, p_tz);
  v_meas  uuid;
  v_round uuid;
begin
  select ms.id into v_meas from app.measurements ms
  where ms.org_id = p_org and ms.kind = p_kind and ms.year = p_year
    and extract(month from coalesce(
          (select min(ro.opens_at) from app.rounds ro where ro.measurement_id = ms.id),
          v_at)) = p_month
  limit 1;

  if v_meas is null then
    insert into app.measurements (org_id, kind, year, label)
    values (p_org, p_kind, p_year, null) returning id into v_meas;
  end if;

  select ro.id into v_round from app.rounds ro
  where ro.measurement_id = v_meas and ro.opens_at = v_at;
  if v_round is not null then
    return null;
  end if;

  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (p_org, v_meas, 'planlagt', v_at, v_at + interval '7 days')
  returning id into v_round;

  insert into app.round_factors (org_id, round_id, factor_key)
  select p_org, v_round, f.key
  from app.factors f
  where p_kind = 'grunnlinje'
     or f.key in (select distinct me.factor_key from app.measures me
                  where me.org_id = p_org and me.step <> 'lukket')
  on conflict do nothing;

  return v_round;
end $fn$;

revoke all on function app.plan_round(uuid, app.measurement_kind, int, int, text) from public, anon, authenticated;

/**
 * The tick's step 5 for one wheel: one round per month the cadence names, up to a year out, created
 * only when it does not already exist — except a puls in a month the leader skipped — and a puls in
 * every month the leader added. Returns how many rounds it planned.
 */
create function app.wheel_plan(p_wheel uuid) returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  w         app.year_wheels%rowtype;
  m         record;
  v_tz      text;
  v_year    int;
  v_at      timestamptz;
  v_planned int := 0;
begin
  select * into w from app.year_wheels where id = p_wheel;
  if not found then
    return 0;
  end if;
  select coalesce(o.timezone, 'Europe/Oslo') into v_tz from app.organizations o where o.id = w.org_id;

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

      -- 0133: a month the leader skipped keeps no puls
      continue when m.kind = 'puls' and exists (
        select 1 from app.wheel_month_marks mk
        where mk.org_id = w.org_id and mk.year = v_year and mk.month = m.month and mk.mark = 'hoppet_over');

      if app.plan_round(w.org_id, m.kind, v_year, m.month, v_tz) is not null then
        v_planned := v_planned + 1;
      end if;
    end loop;
  end loop;

  -- 0133: a month the leader added is planned as the wheel's own are, whatever its distance
  for m in
    select mk.year, mk.month from app.wheel_month_marks mk
    where mk.org_id = w.org_id and mk.mark = 'lagt_til'
  loop
    v_at := app.first_tuesday(m.year, m.month, v_tz);
    continue when v_at <= now();
    continue when exists (
      select 1 from app.rounds ro
      where ro.org_id = w.org_id
        and date_trunc('month', ro.opens_at at time zone v_tz) = date_trunc('month', v_at at time zone v_tz));
    continue when not exists (select 1 from app.measures me where me.org_id = w.org_id and me.step <> 'lukket');

    if app.plan_round(w.org_id, 'puls', m.year, m.month, v_tz) is not null then
      v_planned := v_planned + 1;
    end if;
  end loop;

  return v_planned;
end $fn$;

revoke all on function app.wheel_plan(uuid) from public, anon, authenticated;

/**
 * Closing a round, as the wheel closes one (0020 step 4): closed, frozen, and the result notice to
 * every rung of the organisation's ladder, due when it closed. Returns the notices queued.
 */
create function app.close_round(p_round uuid) returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r   app.rounds%rowtype;
  v_n int;
begin
  update app.rounds set status = 'lukket', frozen_at = now()
  where id = p_round and status = 'apen'
  returning * into r;
  if not found then
    return 0;
  end if;

  insert into app.outbox (org_id, round_id, kind, audience, due_at)
  select r.org_id, r.id, 'resultat', n.audience, r.closes_at
  from app.wheel_notifications n
  join app.year_wheels w on w.id = n.wheel_id
  where w.org_id = r.org_id
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function app.close_round(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- the tick
-- 0096's, with three changes: the ladder's reminder (step 3) and the extension's (step 4) count
-- against the round's two and are recorded; the close is app.close_round; the plan is app.wheel_plan.
create or replace function app.wheel_tick() returns app.job_runs
  language plpgsql security definer set search_path = ''
as $fn$
declare
  w         app.year_wheels%rowtype;
  r         record;
  v_opened  int := 0;
  v_closed  int := 0;
  v_queued  int := 0;
  v_planned int := 0;
  v_n       int;
  v_tz      text;
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
    -- 0133: once per round (the record, not the rows, says it went), and only while the round has
    -- sent fewer than two. A person the leader reminded earlier is reminded again: their row is
    -- queued again, as the extension does.
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'apen'
        and ro.reminder_day is not null
        and ro.opens_at + make_interval(days => ro.reminder_day) <= now()
        and not exists (select 1 from app.round_reminders rr where rr.round_id = ro.id and rr.source = 'stige')
        and app.round_reminder_count(ro.id) < 2
    loop
      insert into app.outbox as ob (org_id, round_id, kind, employee_id, invitation_id, due_at)
      select r.org_id, r.id, 'paminnelse', i.employee_id, i.id,
             r.opens_at + make_interval(days => r.reminder_day)
      from app.invitations i
      where i.round_id = r.id and i.responded_at is null
      on conflict (round_id, kind, employee_id) where employee_id is not null do update
        set due_at = excluded.due_at, sent_at = null, failed_at = null, claimed_at = null, attempts = 0,
            last_error = null, provider_id = null, delivery = null, delivery_at = null,
            invitation_id = excluded.invitation_id;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;

      insert into app.round_reminders (org_id, round_id, source, sent_at)
      values (r.org_id, r.id, 'stige', r.opens_at + make_interval(days => r.reminder_day))
      on conflict do nothing;
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

        -- a reminder now to everyone who has not answered: their one reminder row, queued again —
        -- 0133: unless the round has sent its two
        if app.round_reminder_count(r.id) < 2 then
          insert into app.outbox as ob (org_id, round_id, kind, employee_id, invitation_id, due_at)
          select r.org_id, r.id, 'paminnelse', i.employee_id, i.id, now()
          from app.invitations i
          where i.round_id = r.id and i.responded_at is null
          on conflict (round_id, kind, employee_id) where employee_id is not null do update
            set due_at = now(), sent_at = null, failed_at = null, claimed_at = null, attempts = 0,
                last_error = null, provider_id = null, delivery = null, delivery_at = null,
                invitation_id = excluded.invitation_id;
          get diagnostics v_n = row_count;
          v_queued := v_queued + v_n;

          insert into app.round_reminders (org_id, round_id, source, sent_at)
          values (r.org_id, r.id, 'forlengelse', now())
          on conflict do nothing;
        end if;
        continue;
      end if;

      v_queued := v_queued + app.close_round(r.id);
      v_closed := v_closed + 1;
    end loop;

    -- 5 ---------------------------------------------------------------- plan ahead
    v_planned := v_planned + app.wheel_plan(w.id);
  end loop;

  insert into app.job_runs (opened, closed, queued, planned)
  values (v_opened, v_closed, v_queued, v_planned)
  returning * into v_run;

  return v_run;
end $fn$;

revoke all on function app.wheel_tick() from public, anon, authenticated;

-- ---------------------------------------------------------------- the day-before reminder (0076)
-- As before, and it counts against the round's two: queued only while fewer than two have gone
-- (or once it has itself been recorded, so a re-queue of its own rows is not refused), recorded once.
create or replace function app.queue_final_reminders() returns integer
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  with ins as (
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
    select r.org_id, r.id, 'siste_paminnelse', i.employee_id, i.id, r.closes_at - interval '1 day'
    from app.rounds r
    join app.invitations i on i.round_id = r.id
    where r.status = 'apen' and r.final_reminder
      and r.opens_at is not null and r.closes_at is not null
      and r.closes_at - interval '1 day' <= now()
      and r.closes_at > now() + interval '2 hours'
      -- only when it is a second reminder, not the first one again on the same day
      and r.opens_at < r.closes_at - interval '1 day'
      and (r.reminder_day is null or r.opens_at + make_interval(days => r.reminder_day) < r.closes_at - interval '1 day')
      and i.responded_at is null and i.expires_at > now()
      -- 0133: never a third
      and (exists (select 1 from app.round_reminders rr where rr.round_id = r.id and rr.source = 'siste')
           or app.round_reminder_count(r.id) < 2)
    on conflict do nothing
    returning org_id, round_id, due_at
  ), rec as (
    insert into app.round_reminders (org_id, round_id, source, sent_at)
    select distinct on (ins.round_id) ins.org_id, ins.round_id, 'siste'::app.reminder_source, ins.due_at
    from ins
    order by ins.round_id, ins.due_at
    on conflict (round_id, source) where source <> 'manuell' do nothing
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $fn$;

revoke all on function app.queue_final_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------- the rail: a month changed

create function public.wheel_month_change(p_org uuid, p_year int, p_month int, p_action text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_tz      text;
  v_now_y   int;
  v_now_m   int;
  w         app.year_wheels%rowtype;
  v_cadence boolean;
  v_mark    app.wheel_month_mark;
  v_round   uuid;
  v_meas    uuid;
  v_first   date;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_available');
  end if;
  if p_action is null or p_action not in ('legg_til', 'hopp_over', 'ta_tilbake')
     or p_year is null or p_month is null or p_month not between 1 and 12 then
    return jsonb_build_object('error', 'invalid');
  end if;

  -- the wheel's lock (0042): the tick and this cannot plan the same month at once
  perform pg_advisory_xact_lock(hashtext('start_next_pulse:' || p_org::text));

  select coalesce(o.timezone, 'Europe/Oslo') into v_tz from app.organizations o where o.id = p_org;
  v_now_y := extract(year from now() at time zone v_tz)::int;
  v_now_m := extract(month from now() at time zone v_tz)::int;

  -- a month after this one, on the rail (this year and the next)
  if p_year < v_now_y or (p_year = v_now_y and p_month <= v_now_m) or p_year > v_now_y + 1 then
    return jsonb_build_object('error', 'past');
  end if;

  v_first := make_date(p_year, p_month, 1);
  select * into w from app.year_wheels where org_id = p_org;
  v_cadence := w.id is not null and exists (
    select 1 from app.wheel_months(w.cadence, w.baseline_month, w.skip_fellesferie) m
    where m.month = p_month and m.kind = 'puls');
  select mk.mark into v_mark from app.wheel_month_marks mk
  where mk.org_id = p_org and mk.year = p_year and mk.month = p_month;

  -- never a month that has gone out: an open or closed round is not the rail's to change
  if exists (select 1 from app.rounds ro
             where ro.org_id = p_org and ro.status <> 'planlagt'
               and date_trunc('month', ro.opens_at at time zone v_tz)::date = v_first) then
    return jsonb_build_object('error', 'occupied');
  end if;

  if p_action = 'hopp_over' then
    select ro.id, ro.measurement_id into v_round, v_meas
    from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
    where ro.org_id = p_org and ro.status = 'planlagt' and ms.kind = 'puls'
      and date_trunc('month', ro.opens_at at time zone v_tz)::date = v_first
    order by ro.opens_at
    limit 1;
    if v_round is null then
      return jsonb_build_object('error', 'not_planned');
    end if;

    -- its setup, factors, audience and notices go with it; measures that pointed at it keep
    -- themselves and lose the link (ON DELETE SET NULL, 0023)
    delete from app.rounds where id = v_round;
    delete from app.measurements ms
    where ms.id = v_meas and not exists (select 1 from app.rounds ro where ro.measurement_id = v_meas);

    delete from app.wheel_month_marks mk where mk.org_id = p_org and mk.year = p_year and mk.month = p_month;
    -- a skip is recorded only where the wheel would plan the month again; an added puls removed
    -- leaves an empty month
    if v_cadence then
      insert into app.wheel_month_marks (org_id, year, month, mark, created_by)
      values (p_org, p_year, p_month, 'hoppet_over', auth.uid());
      return jsonb_build_object('ok', true, 'mark', 'hoppet_over');
    end if;
    return jsonb_build_object('ok', true, 'mark', null);
  end if;

  if p_action = 'ta_tilbake' then
    if v_mark is distinct from 'hoppet_over' then
      return jsonb_build_object('error', 'not_skipped');
    end if;
    delete from app.wheel_month_marks mk where mk.org_id = p_org and mk.year = p_year and mk.month = p_month;
    -- the wheel plans it as it would have; beyond its year it plans it when the month comes near
    if w.id is not null and w.active then
      perform app.wheel_plan(w.id);
    end if;
    return jsonb_build_object('ok', true, 'mark', null,
      'planned', exists (select 1 from app.rounds ro where ro.org_id = p_org and ro.status = 'planlagt'
                          and date_trunc('month', ro.opens_at at time zone v_tz)::date = v_first));
  end if;

  -- legg_til
  if v_mark = 'hoppet_over' then
    return jsonb_build_object('error', 'skipped');
  end if;
  if exists (select 1 from app.rounds ro where ro.org_id = p_org
               and date_trunc('month', ro.opens_at at time zone v_tz)::date = v_first)
     or (w.id is not null and w.baseline_month = p_month) then
    return jsonb_build_object('error', 'occupied');
  end if;
  -- without a running wheel nothing would ever open it
  if w.id is null or not w.active then
    return jsonb_build_object('error', 'no_wheel');
  end if;
  if not exists (select 1 from app.measures me where me.org_id = p_org and me.step <> 'lukket') then
    return jsonb_build_object('error', 'no_factors');
  end if;

  -- a month the cadence names is the wheel's own, planned early; only another month is «lagt til»
  if not v_cadence then
    insert into app.wheel_month_marks (org_id, year, month, mark, created_by)
    values (p_org, p_year, p_month, 'lagt_til', auth.uid())
    on conflict (org_id, year, month) do update set mark = 'lagt_til', created_by = excluded.created_by, created_at = now();
  end if;
  perform app.plan_round(p_org, 'puls', p_year, p_month, v_tz);

  return jsonb_build_object('ok', true, 'mark', case when v_cadence then null else 'lagt_til' end);
end $fn$;

revoke all on function public.wheel_month_change(uuid, int, int, text) from public, anon;
grant execute on function public.wheel_month_change(uuid, int, int, text) to authenticated;

-- ---------------------------------------------------------------- the open round: close it now

create function public.close_round_now(p_round uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_org    uuid;
  v_status app.round_status;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not app.has_role(v_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_available');
  end if;

  perform pg_advisory_xact_lock(hashtext('start_next_pulse:' || v_org::text));
  select r.status into v_status from app.rounds r where r.id = p_round;
  if v_status is distinct from 'apen' then
    return jsonb_build_object('error', 'not_open');
  end if;

  -- the day it closed is the day every screen prints, and the publish date follows it (0129)
  update app.rounds set closes_at = now() where id = p_round and (closes_at is null or closes_at > now());
  perform app.close_round(p_round);

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.close_round_now(uuid) from public, anon;
grant execute on function public.close_round_now(uuid) to authenticated;

-- ---------------------------------------------------------------- the open round: a reminder

create function public.send_round_reminder(p_round uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_org    uuid;
  r        app.rounds%rowtype;
  v_out    int;
begin
  select ro.org_id into v_org from app.rounds ro where ro.id = p_round;
  if v_org is null or not app.has_role(v_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_available');
  end if;

  -- one decision per organisation at a time, with the tick's ladder
  perform pg_advisory_xact_lock(hashtext('start_next_pulse:' || v_org::text));
  select * into r from app.rounds ro where ro.id = p_round;
  if r.status is distinct from 'apen' or r.closes_at is null or r.closes_at <= now() then
    return jsonb_build_object('error', 'not_open');
  end if;
  if app.round_reminder_count(p_round) >= 2 then
    return jsonb_build_object('error', 'max_reached');
  end if;

  select count(*)::int into v_out from app.invitations i
  where i.round_id = p_round and i.responded_at is null and i.expires_at > now();
  if v_out = 0 then
    return jsonb_build_object('error', 'none_outstanding');
  end if;

  -- the ladder's reminder: the round's «paminnelse» row per person, queued again (0096, 0076)
  insert into app.outbox as ob (org_id, round_id, kind, employee_id, invitation_id, due_at)
  select r.org_id, r.id, 'paminnelse', i.employee_id, i.id, now()
  from app.invitations i
  where i.round_id = r.id and i.responded_at is null and i.expires_at > now()
  on conflict (round_id, kind, employee_id) where employee_id is not null do update
    set due_at = now(), sent_at = null, failed_at = null, claimed_at = null, attempts = 0,
        last_error = null, provider_id = null, delivery = null, delivery_at = null,
        invitation_id = excluded.invitation_id;

  insert into app.round_reminders (org_id, round_id, source, sent_by)
  values (r.org_id, r.id, 'manuell', auth.uid());

  -- the count only; never who
  return jsonb_build_object('ok', true, 'sent', app.round_reminder_count(p_round));
end $fn$;

revoke all on function public.send_round_reminder(uuid) from public, anon;
grant execute on function public.send_round_reminder(uuid) to authenticated;

/**
 * What the Deltakelse card prints about reminders: how many the round has sent and when the last
 * did, the two it may send, and N — its outstanding invitations. N is the whole round's, never a
 * group's, and is null when fewer than k were asked in the whole round (D-123's rule for a group).
 */
create function public.reminder_status(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org     uuid;
  v_status  app.round_status;
  v_invited int;
  v_out     int;
begin
  select r.org_id, r.status into v_org, v_status from app.rounds r where r.id = p_round;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;

  select count(*)::int, count(*) filter (where i.responded_at is null and i.expires_at > now())::int
  into v_invited, v_out
  from app.invitations i where i.round_id = p_round;

  return jsonb_build_object(
    'open', v_status = 'apen',
    'sent', app.round_reminder_count(p_round),
    'last_at', (select max(rr.sent_at) from app.round_reminders rr where rr.round_id = p_round),
    'max', 2,
    'outstanding', case when v_invited >= app.k_threshold(v_org) then v_out end
  );
end $fn$;

revoke all on function public.reminder_status(uuid) from public, anon;
grant execute on function public.reminder_status(uuid) to authenticated;
