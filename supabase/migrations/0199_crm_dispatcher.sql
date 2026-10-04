-- 0199 — CRM event dispatcher and job runs (WP-0.6; D-213)
--
-- docs/crm-enrichment/INSTRUCTIONS.md SF-02 steps 2–4 and SF-26 steps 1 and 6: a dispatcher reads new CRM events
-- and delivers them to their subscribers, each event to each subscriber once, and a subscriber that fails retries
-- without holding up the others; each scheduled CRM job records its runs, and a failed run is shown as an alert.
--
-- Subscribers are rows (app.crm_event_subscribers): a key, the handler that receives (one of a fixed set, called by
-- name through a CASE — no dynamic SQL), the events it takes and how far it has read. Each run offers a subscriber the
-- events past that point, oldest first, each in a block of its own, and moves the point past them in the transaction
-- that holds what the handler wrote: the point is the "once". A delivery that fails rolls back alone and gets a row in
-- app.crm_event_deliveries; it is retried after 1, 5, 30 and 120 minutes, claimed FOR UPDATE SKIP LOCKED, and after
-- the fifth attempt waits for an admin's retry. A delivery that succeeds the first time leaves no row, so the table
-- holds only what needed a second look and needs no clean-up. The first subscriber is the daily rollup of events per
-- kind (SF-02's «report rollups»), read by the job monitor.
--
-- Technical safeguards (the loop window): a subscriber takes at most limit_event_loop events of one record in a
-- rolling ten minutes, by when they happened (10,000 by default, the source value); the rest are set aside as skipped,
-- counted and alerted, until an admin retries them, which the window does not hold back. What a handler writes is
-- attributed to automation and is itself an event, so a subscriber that writes the records it hears about cannot run
-- away.
--
-- Runs (SF-26): app.crm_run(job) runs one of the CRM's scheduled jobs — the dispatcher, the restore list's purge,
-- lead routing and the register triggers — records its last run on app.crm_jobs and counts every run in an hourly row
-- of app.crm_job_runs (runs, failed runs, items, the longest run, the last failure's code), so the table grows by at
-- most one row per job and hour. A failure keeps its SQLSTATE only: a message can carry what a record holds (CLAUDE.md
-- invariant 7). A job never raises into pg_cron, and two runs of one job never overlap.

-- ------------------------------------------------------------------------------------------ jobs and their runs
create table app.crm_jobs (
  job              text primary key check (job ~ '^[a-z_]{2,40}$'),
  product_id       text not null default 'orgpuls',
  cron_job         text not null unique check (cron_job ~ '^[a-z0-9-]{2,60}$'),
  last_started_at  timestamptz,
  last_finished_at timestamptz,
  last_ok          boolean,
  last_error       text check (last_error is null or last_error ~ '^[a-z0-9_]{1,40}$'),
  runs             int not null default 0 check (runs >= 0),
  failures         int not null default 0 check (failures >= 0),
  created_at       timestamptz not null default now()
);
alter table app.crm_jobs enable row level security;
revoke all on app.crm_jobs from public, anon, authenticated;
insert into app.crm_jobs (job, cron_job) values
  ('crm_dispatch', 'orgpuls-crm-dispatch'),
  ('crm_purge', 'orgpuls-crm-purge'),
  ('lead_route', 'orgpuls-lead-route'),
  ('brreg_triggers', 'orgpuls-brreg-triggers');

-- every run, counted in its hour (UTC)
create table app.crm_job_runs (
  job        text not null references app.crm_jobs (job) on delete cascade,
  hour       timestamptz not null check (hour = date_trunc('hour', hour, 'UTC')),
  product_id text not null default 'orgpuls',
  runs       int not null default 0 check (runs >= 0),
  failed     int not null default 0 check (failed >= 0),
  items      bigint not null default 0 check (items >= 0),
  longest_ms int not null default 0 check (longest_ms >= 0),
  last_error text check (last_error is null or last_error ~ '^[a-z0-9_]{1,40}$'),
  primary key (job, hour),
  check (failed <= runs),
  check ((failed = 0) = (last_error is null))
);
create index crm_job_runs_failed_idx on app.crm_job_runs (hour) where failed > 0;
alter table app.crm_job_runs enable row level security;
revoke all on app.crm_job_runs from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ subscribers and deliveries
create table app.crm_event_subscribers (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  product_id text not null default 'orgpuls',
  handler    text not null check (handler in ('rollup')),
  events     text[] check (events is null or cardinality(events) between 1 and 50),
  active     boolean not null default true,
  read_to    bigint not null default 0 check (read_to >= 0),
  created_at timestamptz not null default now()
);
alter table app.crm_event_subscribers enable row level security;
revoke all on app.crm_event_subscribers from public, anon, authenticated;

-- a subscriber names only events the catalogue holds
create function app.crm_event_subscribers_check() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.events is not null and exists (select 1 from unnest(new.events) x where not exists (select 1 from app.crm_event_types t where t.name = x)) then
    raise exception 'crm_event_subscribers: an event the catalogue does not hold' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger crm_event_subscribers_check before insert or update on app.crm_event_subscribers
  for each row execute function app.crm_event_subscribers_check();

-- the deliveries that needed a second look: retrying, given up on, set aside, or done at a retry
create table app.crm_event_deliveries (
  subscriber   text not null references app.crm_event_subscribers (key) on delete cascade,
  event_id     bigint not null references app.crm_events (id) on delete cascade,
  product_id   text not null default 'orgpuls',
  status       text not null check (status in ('pending', 'done', 'failed', 'skipped')),
  attempts     int not null default 0 check (attempts >= 0),
  next_at      timestamptz not null default now(),
  last_error   text check (last_error is null or last_error ~ '^[a-z0-9_]{1,40}$'),
  created_at   timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (subscriber, event_id)
);
create index crm_event_deliveries_due_idx on app.crm_event_deliveries (subscriber, next_at) where status = 'pending';
create index crm_event_deliveries_event_idx on app.crm_event_deliveries (event_id);
alter table app.crm_event_deliveries enable row level security;
revoke all on app.crm_event_deliveries from public, anon, authenticated;

-- SF-02's report rollups: events per kind and day (Oslo)
create table app.crm_event_rollups (
  day        date not null,
  name       text not null references app.crm_event_types (name) on delete cascade,
  product_id text not null default 'orgpuls',
  n          int not null default 0 check (n >= 0),
  primary key (day, name)
);
create index crm_event_rollups_name_idx on app.crm_event_rollups (name);
alter table app.crm_event_rollups enable row level security;
revoke all on app.crm_event_rollups from public, anon, authenticated;

-- the rollup reads from the first event on, so its counts cover the history the events hold
insert into app.crm_event_subscribers (key, handler) values ('rollup', 'rollup');

-- ------------------------------------------------------------------------------------------ the rule
insert into app.crm_setting_defs (key, area, kind, options, default_value, applies_to, sort) values
  ('limit_event_loop', 'limits', 'limit', null, '10000', array['SF-02', 'AUT-09'], 190);

-- ------------------------------------------------------------------------------------------ handlers
create function app.crm_event_rollup(e app.crm_events) returns void
language sql security definer set search_path = '' as $$
  insert into app.crm_event_rollups (day, name, n) values ((e.occurred_at at time zone 'Europe/Oslo')::date, e.name, 1)
  on conflict (day, name) do update set n = app.crm_event_rollups.n + 1
$$;

-- one event to one handler; a handler the registry names but this does not know fails the delivery (20000)
create function app.crm_event_deliver(p_handler text, e app.crm_events) returns void
language plpgsql security definer set search_path = '' as $$
begin
  case p_handler
    when 'rollup' then perform app.crm_event_rollup(e);
  end case;
end $$;

-- ------------------------------------------------------------------------------------------ the dispatcher (SF-02)
-- every active subscriber: the new events, each offered once as the read point passes it, then the retries due
create function app.crm_dispatch() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s app.crm_event_subscribers;
  e app.crm_events;
  d record;
  v_batch constant int := 500;
  v_cap int := app.crm_limit('limit_event_loop');
  v_to bigint;
  v_seen int;
  v_error text;
  v_delivered int := 0;
  v_failed int := 0;
  v_parked int := 0;
  v_skipped int := 0;
begin
  for s in select * from app.crm_event_subscribers x where x.active order by x.key for update skip locked loop
    -- what it has not read yet: every event, taken or not, moves the read point
    v_to := null;
    for e in select * from app.crm_events x where x.id > s.read_to order by x.id limit v_batch loop
      v_to := e.id;
      continue when s.events is not null and not (e.name = any (s.events));
      -- the loop window: this record has had its fill of this subscriber's events in the ten minutes before this one
      if v_cap is not null then
        select count(*) into v_seen from (
          select 1 from app.crm_events w
          where w.entity = e.entity and w.record_id = e.record_id and w.id < e.id
            and w.occurred_at > e.occurred_at - interval '10 minutes'
            and (s.events is null or w.name = any (s.events))
          limit v_cap) x;
        if v_seen >= v_cap then
          insert into app.crm_event_deliveries (subscriber, event_id, status, last_error)
          values (s.key, e.id, 'skipped', 'loop_window') on conflict do nothing;
          v_skipped := v_skipped + 1;
          continue;
        end if;
      end if;
      v_error := null;
      begin
        perform app.crm_event_deliver(s.handler, e);
      exception when others then
        v_error := lower(sqlstate);
      end;
      if v_error is null then
        v_delivered := v_delivered + 1;
      else
        insert into app.crm_event_deliveries (subscriber, event_id, status, attempts, next_at, last_error)
        values (s.key, e.id, 'pending', 1, now() + interval '1 minute', v_error) on conflict do nothing;
        v_failed := v_failed + 1;
      end if;
    end loop;
    if v_to is not null then
      update app.crm_event_subscribers set read_to = v_to where key = s.key;
    end if;
    -- the retries that are due; an admin's retry is not held back by the loop window
    for d in select x.event_id, x.attempts from app.crm_event_deliveries x
             where x.subscriber = s.key and x.status = 'pending' and x.next_at <= now()
             order by x.event_id limit v_batch for update skip locked loop
      select * into e from app.crm_events where id = d.event_id;
      v_error := null;
      begin
        perform app.crm_event_deliver(s.handler, e);
      exception when others then
        v_error := lower(sqlstate);
      end;
      if v_error is null then
        update app.crm_event_deliveries set status = 'done', attempts = d.attempts + 1, last_error = null, delivered_at = now()
        where subscriber = s.key and event_id = d.event_id;
        v_delivered := v_delivered + 1;
      else
        -- retried after 1, 5, 30 and 120 minutes; after the fifth attempt it waits for an admin's retry
        update app.crm_event_deliveries set attempts = d.attempts + 1, last_error = v_error,
          status = case when d.attempts + 1 >= 5 then 'failed' else 'pending' end,
          next_at = now() + case d.attempts when 0 then interval '1 minute' when 1 then interval '5 minutes'
                                            when 2 then interval '30 minutes' else interval '2 hours' end
        where subscriber = s.key and event_id = d.event_id;
        v_failed := v_failed + 1;
        v_parked := v_parked + (d.attempts + 1 >= 5)::int;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('delivered', v_delivered, 'failed', v_failed, 'parked', v_parked, 'skipped', v_skipped);
end $$;

-- ------------------------------------------------------------------------------------------ the runner (SF-26)
create function app.crm_run(p_job text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_started timestamptz := clock_timestamp();
  v_ms int;
  v_out jsonb;
  v_items int := 0;
  v_error text;
begin
  if not exists (select 1 from app.crm_jobs j where j.job = p_job) then
    raise exception 'crm_run: no such job' using errcode = '22023';
  end if;
  -- one run of a job at a time: a run that finds the last still going leaves it be
  if not pg_try_advisory_xact_lock(hashtext('app.crm_run'), hashtext(p_job)) then
    return;
  end if;
  perform set_config('app.change_source', 'automation', true);
  begin
    case p_job
      when 'crm_dispatch' then
        v_out := app.crm_dispatch();
        v_items := (v_out ->> 'delivered')::int + (v_out ->> 'failed')::int + (v_out ->> 'skipped')::int;
      when 'crm_purge' then
        v_out := app.crm_purge_due();
        v_items := coalesce((v_out ->> 'companies')::int, 0) + coalesce((v_out ->> 'contacts')::int, 0) + coalesce((v_out ->> 'activities')::int, 0);
      when 'lead_route' then
        v_items := coalesce(app.lead_route(), 0);
      when 'brreg_triggers' then
        perform app.brreg_cron();
    end case;
  exception when others then
    -- the code only: a message can carry what a record holds
    v_error := lower(sqlstate);
    v_items := 0;
  end;
  v_ms := least(2147483647, floor(extract(epoch from clock_timestamp() - v_started) * 1000))::int;
  update app.crm_jobs set last_started_at = v_started, last_finished_at = clock_timestamp(), last_ok = v_error is null,
    last_error = v_error, runs = runs + 1, failures = failures + (v_error is not null)::int
  where job = p_job;
  insert into app.crm_job_runs as r (job, hour, runs, failed, items, longest_ms, last_error)
  values (p_job, date_trunc('hour', v_started, 'UTC'), 1, (v_error is not null)::int, v_items, v_ms, v_error)
  on conflict (job, hour) do update set runs = r.runs + 1, failed = r.failed + excluded.failed, items = r.items + excluded.items,
    longest_ms = greatest(r.longest_ms, excluded.longest_ms), last_error = coalesce(excluded.last_error, r.last_error);
end $$;

revoke all on function app.crm_event_subscribers_check(), app.crm_event_rollup(app.crm_events), app.crm_event_deliver(text, app.crm_events),
  app.crm_dispatch(), app.crm_run(text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ the job monitor
-- The CRM's jobs and their last day, the hours with failed runs, the subscribers' backlog and the week's events per
-- kind, for Operations
create function public.admin_crm_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.jobs');
  return jsonb_build_object('ok', true,
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object('job', j.job, 'cron_job', j.cron_job, 'schedule', c.schedule, 'scheduled', c.jobid is not null,
               'last_started_at', j.last_started_at, 'last_finished_at', j.last_finished_at, 'last_ok', j.last_ok, 'last_error', j.last_error,
               'runs', j.runs, 'failures', j.failures,
               'day', (select jsonb_build_object('runs', coalesce(sum(r.runs), 0), 'failed', coalesce(sum(r.failed), 0),
                                                 'items', coalesce(sum(r.items), 0), 'longest_ms', coalesce(max(r.longest_ms), 0))
                       from app.crm_job_runs r where r.job = j.job and r.hour > now() - interval '24 hours'))
             order by j.job), '[]')
             from app.crm_jobs j left join cron.job c on c.jobname = j.cron_job),
    'failed_runs', (select coalesce(jsonb_agg(jsonb_build_object('job', r.job, 'hour', r.hour, 'runs', r.runs, 'failed', r.failed,
                      'last_error', r.last_error) order by r.hour desc, r.job), '[]')
                    from (select * from app.crm_job_runs x where x.failed > 0 and x.hour > now() - interval '7 days'
                          order by x.hour desc, x.job limit 50) r),
    'subscribers', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'handler', s.handler, 'events', to_jsonb(s.events), 'active', s.active,
               'read_to', s.read_to,
               'behind', (select count(*) from app.crm_events e where e.id > s.read_to),
               'pending', (select count(*) from app.crm_event_deliveries d where d.subscriber = s.key and d.status = 'pending'),
               'failed', (select count(*) from app.crm_event_deliveries d where d.subscriber = s.key and d.status = 'failed'),
               'skipped', (select count(*) from app.crm_event_deliveries d where d.subscriber = s.key and d.status = 'skipped'),
               'oldest_waiting', (select min(e.occurred_at) from app.crm_event_deliveries d join app.crm_events e on e.id = d.event_id
                                  where d.subscriber = s.key and d.status <> 'done'),
               'last_error', (select d.last_error from app.crm_event_deliveries d where d.subscriber = s.key and d.last_error is not null
                              order by d.event_id desc limit 1))
             order by s.key), '[]')
             from app.crm_event_subscribers s),
    'rollups', (select coalesce(jsonb_agg(jsonb_build_object('day', r.day, 'name', r.name, 'n', r.n) order by r.day desc, r.name), '[]')
                from app.crm_event_rollups r where r.day > (now() at time zone 'Europe/Oslo')::date - 7),
    'loop_limit', app.crm_limit('limit_event_loop'));
end $$;

-- Deliveries a subscriber gave up on, or set aside at the loop window, are tried again from now
create function public.admin_crm_event_retry(p_subscriber text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.crm_event_subscribers s where s.key = p_subscriber) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update app.crm_event_deliveries set status = 'pending', attempts = 0, next_at = now(), last_error = null, delivered_at = null
  where subscriber = p_subscriber and status in ('failed', 'skipped');
  get diagnostics v_n = row_count;
  perform app.admin_log('crm.events_retry', null, 'crm_event_subscriber', p_subscriber, null, jsonb_build_object('deliveries', v_n));
  return jsonb_build_object('ok', true, 'retried', v_n);
end $$;

revoke all on function public.admin_crm_jobs(), public.admin_crm_event_retry(text) from public, anon;
grant execute on function public.admin_crm_jobs(), public.admin_crm_event_retry(text) to authenticated;

-- ------------------------------------------------------------------------------------------ the schedule
-- the dispatcher every minute; the CRM's other jobs keep their times and now run through the runner (pg_cron updates a
-- job scheduled again under its name)
select cron.schedule('orgpuls-crm-dispatch', '* * * * *', $job$ select app.crm_run('crm_dispatch') $job$);
select cron.schedule('orgpuls-lead-route', '*/5 * * * *', $job$ select app.crm_run('lead_route') $job$);
select cron.schedule('orgpuls-brreg-triggers', '10 3 * * *', $job$ select app.crm_run('brreg_triggers') $job$);
select cron.schedule('orgpuls-crm-purge', '25 2 * * *', $job$ select app.crm_run('crm_purge') $job$);

-- ------------------------------------------------------------------------------------------ the existing calls
CREATE OR REPLACE FUNCTION public.admin_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role app.platform_role := app.admin_role();
  v_support boolean;
  v_finance boolean;
begin
  if v_role is null or v_role = 'editor' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('attention.view');
  v_support := v_role in ('super_admin', 'support');
  v_finance := v_role in ('super_admin', 'support', 'finance');
  return jsonb_build_object('ok', true,
    'trials', (
      select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'ends_at', b.trial_ends_at,
               'employees', (select count(*) from app.employees e where e.org_id = o.id and e.active))
             order by b.trial_ends_at), '[]')
      from app.billing b join app.organizations o on o.id = b.org_id
      where not app.is_demo(o.id) and b.confirmed_at is null and b.cancelled_at is null
        and b.trial_ends_at > now() and b.trial_ends_at <= now() + interval '7 days'),
    'deletions', case when v_finance then (
      select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'due_at', b.deletion_due_at) order by b.deletion_due_at), '[]')
      from app.billing b join app.organizations o on o.id = b.org_id
      where not app.is_demo(o.id) and b.deletion_due_at is not null and b.deletion_due_at <= now() + interval '14 days') else '[]'::jsonb end,
    'tickets', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'org_name', coalesce(o.name, t.requester_org),
               'due_at', t.first_response_due) order by t.first_response_due), '[]')
      from app.tickets t left join app.organizations o on o.id = t.org_id
      where t.status not in ('resolved', 'closed') and t.first_responded_at is null and t.first_response_due < now()) else '[]'::jsonb end,
    'failures', case when v_support then (
      select count(*) from app.outbox x where x.failed_at > now() - interval '24 hours') else 0 end,
    -- 0199: CRM job runs that failed in the last day, and event deliveries given up on or set aside
    'job_failures', case when v_support then (
      select coalesce(sum(r.failed), 0) from app.crm_job_runs r where r.failed > 0 and r.hour > now() - interval '24 hours')
      + (select count(*) from app.crm_event_deliveries d where d.status in ('failed', 'skipped')) else 0 end,
    'tasks', case when app.crm_can_read() then (
      select count(*) from app.crm_activities a where a.deleted_at is null and app.crm_visible_company(a.company_id) and a.kind = 'task' and a.done_at is null and a.due_at < now()) else 0 end);
end $function$;
