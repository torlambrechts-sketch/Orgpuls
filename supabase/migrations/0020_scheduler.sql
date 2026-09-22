-- 0020_scheduler.sql — the årshjul, actually turning.
--
-- Årshjulet's whole claim is that the year runs by itself: rounds open, reminders go,
-- results freeze, the next round is planned, and the verneombud is warned before anyone
-- else. Until now that was a screen describing a capability nothing had. This makes it
-- real with pg_cron.
--
-- ---------------------------------------------------------------------------
-- THE TOKEN, AND WHY THE OUTBOX HAS NO COLUMN FOR IT
-- ---------------------------------------------------------------------------
--
-- An invitation is a secret in a link. Somebody has to generate it and somebody has to
-- deliver it, and if delivery is asynchronous the obvious design is to park the plaintext
-- in the queue until it is sent. That would undo invariant 3: `app.invitations` stores a
-- SHA-256 precisely so the plaintext is never at rest, and a queue table holding live
-- login links is the same exposure with a different name.
--
-- So the queue holds an instruction, never a credential: "send the invitation for round R
-- to employee E". The scheduler creates the invitation row with a hash of 32 random bytes
-- **that it then discards** — which means an invitation nobody has been sent is an
-- invitation nobody can redeem, a property worth having on its own. The dispatcher calls
-- `public.mint_invitation_link()` at the moment it sends, which overwrites the hash with
-- one whose plaintext it returns exactly once, in that call, and stores nowhere.
--
-- The consequence is deliberate: with no dispatcher configured, the wheel still opens and
-- closes rounds on time and still queues every notification, and nothing is delivered.
-- That is a true state and the screen says it. Delivery is an integration.

create table app.job_runs (
  id       uuid primary key default gen_random_uuid(),
  ran_at   timestamptz not null default now(),
  opened   int not null default 0,
  closed   int not null default 0,
  queued   int not null default 0,
  planned  int not null default 0,
  note     text
);

create index job_runs_recent_idx on app.job_runs (ran_at desc);

create type app.outbox_kind as enum ('forvarsel', 'invitasjon', 'paminnelse', 'resultat');

create table app.outbox (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references app.organizations (id) on delete cascade,
  round_id    uuid not null references app.rounds (id) on delete cascade,
  kind        app.outbox_kind not null,
  -- who it is for. An `audience` row goes to a role; an `employee_id` row goes to one
  -- person, and is the only kind that carries an invitation.
  audience    app.notify_audience,
  employee_id uuid references app.employees (id) on delete cascade,
  invitation_id uuid references app.invitations (id) on delete cascade,
  due_at      timestamptz not null,
  sent_at     timestamptz,
  attempts    int not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  check (audience is not null or employee_id is not null)
);

create index outbox_due_idx on app.outbox (due_at) where sent_at is null;
-- two partial uniques rather than one over coalesce(): a cast is not immutable, so an
-- index over one is refused — and these say the rule more plainly anyway. One notice per
-- audience per round, and one per person per round, per kind. This is what makes the tick
-- idempotent: a second run in the same hour inserts nothing.
create unique index outbox_audience_once
  on app.outbox (round_id, kind, audience) where audience is not null;
create unique index outbox_employee_once
  on app.outbox (round_id, kind, employee_id) where employee_id is not null;

alter table app.job_runs enable row level security;
alter table app.outbox enable row level security;

-- The queue is readable by members so Årshjulet can say what is waiting; it is never
-- writable from a client, because the scheduler is the only thing that should fill it.
create policy outbox_read on app.outbox
  for select using (app.is_org_member(org_id));
create policy job_run_read on app.job_runs for select using (true);

revoke all on app.outbox, app.job_runs from anon, public;
grant select on app.outbox, app.job_runs to authenticated;

-- ---------------------------------------------------------------------------
-- Which months a wheel measures in.
-- ---------------------------------------------------------------------------
--
-- Derived from the cadence and the baseline month rather than stored per month: a
-- quarterly wheel with its baseline in September pulses in December, March and June, and
-- saying so in three rows would let the rows and the cadence disagree.
create function app.wheel_months(p_cadence app.wheel_cadence, p_baseline int,
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
  elsif p_cadence = 'manedspuls' then
    for i in 1..11 loop
      month := ((p_baseline - 1 + i) % 12) + 1;
      kind := 'puls';
      if not (p_skip_fellesferie and month = 7) then return next; end if;
    end loop;
  end if;
end $fn$;

/**
 * 09:00 on the first Tuesday of a month, in the organisation's own zone.
 *
 * Tuesday is the design's own choice — "E-post. Tirsdag gir høyest svarprosent" — and the
 * hour is the design's too. Computed rather than stored so a round planned two years out
 * lands on a real Tuesday rather than on whatever date a formula guessed once.
 */
create function app.first_tuesday(p_year int, p_month int, p_tz text)
  returns timestamptz
  language sql immutable set search_path = ''
as $fn$
  select (make_date(p_year, p_month, 1)
          + ((9 - extract(isodow from make_date(p_year, p_month, 1))::int) % 7)
          + time '09:00') at time zone coalesce(p_tz, 'Europe/Oslo')
$fn$;

-- ---------------------------------------------------------------------------
-- The tick. Idempotent: running it twice in an hour does nothing the second time.
-- ---------------------------------------------------------------------------
create function app.wheel_tick() returns app.job_runs
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

-- ---------------------------------------------------------------------------
-- The dispatcher's one call: a token that exists for the length of one response.
-- ---------------------------------------------------------------------------
create function public.mint_invitation_link(p_outbox uuid)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_inv uuid; v_key text;
begin
  select o.invitation_id into v_inv
  from app.outbox o
  where o.id = p_outbox and o.sent_at is null and o.invitation_id is not null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;

  v_key := encode(extensions.gen_random_bytes(32), 'hex');

  update app.invitations
  set token_hash = extensions.digest(v_key, 'sha256'), sent_at = now()
  where id = v_inv;

  update app.outbox set sent_at = now(), attempts = attempts + 1 where id = p_outbox;

  -- the plaintext leaves here and is stored nowhere
  return jsonb_build_object('ok', true, 'token', v_key);
end $fn$;

revoke all on function public.mint_invitation_link(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hourly. The tick is idempotent, so a missed hour catches up and a double run is a
-- no-op — which is what makes it safe to run from a scheduler nobody is watching.
-- ---------------------------------------------------------------------------
select cron.schedule('orgpuls-wheel', '0 * * * *', $cron$select app.wheel_tick()$cron$);
