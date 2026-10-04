-- crm_events_invariants.sql — the CRM's event dispatcher and job runs (0199, D-213), proved against the live schema.
--
--   * structure: the five tables closed to clients, the helpers to every client, the calls to anon; the four jobs
--     scheduled once each through the runner; the rule at its default; the rollup subscribed (1)
--   * each subscriber takes each event once and moves past it; a delivery that succeeds leaves no row; a second run
--     delivers nothing again, and the rollup counts every event (2)
--   * a failing subscriber retries after 1, 5, 30 and 120 minutes, is set aside after the fifth attempt, and never
--     holds up another; an admin's retry starts it again (3)
--   * the loop window: a subscriber takes at most limit_event_loop of one record's events in ten minutes (4)
--   * the runner records each run on the job and counts it in its hour, keeps the SQLSTATE and no message, and never
--     raises into the scheduler (5)
--   * a subscriber added later reads from where it starts, and one that names events takes only those (6)
--   * the job monitor is Operations' (super-admin, support), the dashboard counts failed runs and set-aside
--     deliveries, and an admin's retry is not held back by the loop window (7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_events_invariants.sql

create unlogged table if not exists public._cei(seq int, name text, expected text, actual text, pass bool);
truncate public._cei;

do $$
declare
  v_su    uuid := '00000000-0000-4000-8000-0000000ce101';
  v_m1    uuid := '00000000-0000-4000-8000-0000000ce102';
  claims  text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  v_rows  jsonb := '[]';
  v_json  jsonb;
  v_txt   text;
  v_ok    boolean;
  v_max   bigint;
  v_co    uuid;
  v_co2   uuid;
  v_n     bigint;
  v_r     bigint;
  v_i     bigint;
  i       int;
begin
  -- 1 ---------------------------------------------------------------- structure
  v_ok := (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('app.crm_jobs'::regclass, 'app.crm_job_runs'::regclass,
             'app.crm_event_subscribers'::regclass, 'app.crm_event_deliveries'::regclass, 'app.crm_event_rollups'::regclass))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app'
                    and p.tablename in ('crm_jobs', 'crm_job_runs', 'crm_event_subscribers', 'crm_event_deliveries', 'crm_event_rollups'))
    and not exists (select 1 from unnest(array['app.crm_jobs', 'app.crm_job_runs', 'app.crm_event_subscribers', 'app.crm_event_deliveries',
                      'app.crm_event_rollups']) t, unnest(array['anon', 'authenticated']) g
                    where has_table_privilege(g, t, 'select,insert,update,delete'))
    and not exists (select 1 from unnest(array['app.crm_event_subscribers_check()', 'app.crm_event_rollup(app.crm_events)',
                      'app.crm_event_deliver(text,app.crm_events)', 'app.crm_dispatch()', 'app.crm_run(text)']) f, unnest(array['anon', 'authenticated']) g
                    where has_function_privilege(g, f, 'execute'))
    and not exists (select 1 from unnest(array['public.admin_crm_jobs()', 'public.admin_crm_event_retry(text)']) f
                    where has_function_privilege('anon', f, 'execute') or not has_function_privilege('authenticated', f, 'execute'))
    and (select count(*) from cron.job j join app.crm_jobs x on x.cron_job = j.jobname
         where j.command like '%app.crm_run(''' || x.job || ''')%') = 4
    and (select count(*) from cron.job j where j.jobname in (select cron_job from app.crm_jobs)) = 4
    and app.crm_limit('limit_event_loop') = 10000
    and exists (select 1 from app.crm_event_subscribers s where s.key = 'rollup' and s.handler = 'rollup' and s.events is null and s.active);
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'tables closed to clients, helpers to every client, calls to anon; four jobs scheduled once through the runner; the rule at 10000; the rollup subscribed',
    'expected', 'true', 'actual', coalesce(v_ok::text, 'null'), 'pass', coalesce(v_ok, false));

  begin
    -- the scheduler's own runs wait until this is over, so they neither take the events below nor count in the hour
    perform pg_advisory_xact_lock(hashtext('app.crm_run'), hashtext('crm_dispatch'));
    perform pg_advisory_xact_lock(hashtext('app.crm_run'), hashtext('lead_route'));
    insert into auth.users (id, email) values (v_su, 'super@events-test.example'), (v_m1, 'm1@events-test.example');
    insert into app.platform_admins (user_id, role) values (v_su, 'super_admin'), (v_m1, 'marketing');
    -- what is already there is delivered first, so what follows counts from a clean queue
    for i in 1..1000 loop
      exit when (select read_to from app.crm_event_subscribers where key = 'rollup') >= coalesce((select max(id) from app.crm_events), 0);
      perform app.crm_dispatch();
    end loop;

    -- 2 -------------------------------------------------------------- once
    select coalesce(sum(n), 0) into v_n from app.crm_event_rollups;
    insert into app.crm_companies (name) values ('Hendelse Test AS') returning id into v_co;
    update app.crm_companies set next_step = 'Ring' where id = v_co;
    v_txt := app.crm_dispatch() ->> 'delivered';
    v_txt := v_txt || ',' || (app.crm_dispatch() ->> 'delivered');
    v_txt := v_txt || ',' || (select count(*) from app.crm_event_deliveries d join app.crm_events e on e.id = d.event_id where e.record_id = v_co)
      || ',' || ((select read_to from app.crm_event_subscribers where key = 'rollup') = (select max(id) from app.crm_events))::text
      || ',' || ((select coalesce(sum(n), 0) from app.crm_event_rollups) - v_n);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'each subscriber takes each event once and moves past it; a delivery that succeeds leaves no row; a second run delivers nothing again; the rollup counts every event',
      'expected', '2,0,0,true,2', 'actual', v_txt, 'pass', v_txt = '2,0,0,true,2');

    -- 3 -------------------------------------------------------------- a failing subscriber
    -- a probe handler that always fails, for this transaction only
    alter table app.crm_event_subscribers drop constraint crm_event_subscribers_handler_check;
    alter table app.crm_event_subscribers add constraint crm_event_subscribers_handler_check check (handler in ('rollup', 'probe'));
    create or replace function app.crm_event_deliver(p_handler text, e app.crm_events) returns void
    language plpgsql security definer set search_path = '' as $f$
    begin
      case p_handler
        when 'rollup' then perform app.crm_event_rollup(e);
        when 'probe' then raise exception 'probe failure with words in it' using errcode = 'P0001';
      end case;
    end $f$;
    select max(id) into v_max from app.crm_events;
    insert into app.crm_event_subscribers (key, handler, read_to) values ('probe', 'probe', v_max);
    update app.crm_companies set next_step = 'Send tilbud' where id = v_co;
    v_json := app.crm_dispatch();
    v_txt := (v_json ->> 'delivered') || ':' || (v_json ->> 'failed')
      || ',' || (select d.status || ':' || d.attempts || ':' || d.last_error || ':' || (d.next_at between now() + interval '50 seconds' and now() + interval '70 seconds')
                 from app.crm_event_deliveries d where d.subscriber = 'probe');
    -- four more attempts, each once its time has come
    for i in 1..4 loop
      update app.crm_event_deliveries set next_at = now() - interval '1 second' where subscriber = 'probe' and status = 'pending';
      perform app.crm_dispatch();
    end loop;
    v_txt := v_txt || ',' || (select d.status || ':' || d.attempts from app.crm_event_deliveries d where d.subscriber = 'probe')
      || ',' || (not exists (select 1 from app.crm_event_deliveries d join app.crm_events e on e.id = d.event_id
                             where d.subscriber = 'rollup' and e.record_id = v_co)
                 and (select read_to from app.crm_event_subscribers where key = 'rollup') = (select max(id) from app.crm_events))::text;
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    -- read in a statement of its own: a subquery beside the call would see the snapshot from before it
    v_txt := v_txt || ',' || (public.admin_crm_event_retry('probe') ->> 'retried');
    v_txt := v_txt || ',' || (select d.status || ':' || d.attempts from app.crm_event_deliveries d where d.subscriber = 'probe');
    perform set_config('request.jwt.claims', '', true);
    -- the retry gives it five attempts afresh; it fails them all again and stays set aside for 7 to count
    for i in 1..5 loop
      update app.crm_event_deliveries set next_at = now() - interval '1 second' where subscriber = 'probe' and status = 'pending';
      perform app.crm_dispatch();
    end loop;
    v_txt := v_txt || ',' || (select d.status || ':' || d.attempts from app.crm_event_deliveries d where d.subscriber = 'probe');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a failing subscriber retries on its own clock, keeps the code only, is set aside after five attempts and holds up no one; a retry starts it again',
      'expected', '1:1,pending:1:p0001:true,failed:5,true,1,pending:0,failed:5', 'actual', v_txt,
      'pass', v_txt = '1:1,pending:1:p0001:true,failed:5,true,1,pending:0,failed:5');
    update app.crm_event_subscribers set active = false where key = 'probe';

    -- 4 -------------------------------------------------------------- the loop window
    insert into app.crm_setting_values (key, value) values ('limit_event_loop', '2');
    insert into app.crm_companies (name) values ('Hendelse Sløyfe AS') returning id into v_co2;
    for i in 1..3 loop
      update app.crm_companies set next_step = 'Steg ' || i where id = v_co2;
    end loop;
    v_json := app.crm_dispatch();
    v_txt := (v_json ->> 'delivered') || ':' || (v_json ->> 'skipped')
      || ',' || (select string_agg(d.status || coalesce('/' || d.last_error, ''), ' ' order by d.event_id)
                 from app.crm_event_deliveries d join app.crm_events e on e.id = d.event_id
                 where d.subscriber = 'rollup' and e.record_id = v_co2);
    delete from app.crm_setting_values where key = 'limit_event_loop';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the loop window: at most limit_event_loop of one record''s events in ten minutes; the rest set aside and counted',
      'expected', '2:2,skipped/loop_window skipped/loop_window', 'actual', v_txt,
      'pass', v_txt = '2:2,skipped/loop_window skipped/loop_window');

    -- 5 -------------------------------------------------------------- the runner
    select runs into v_n from app.crm_jobs where job = 'crm_dispatch';
    select coalesce(sum(runs), 0), coalesce(sum(items), 0) into v_r, v_i from app.crm_job_runs where job = 'crm_dispatch';
    update app.crm_companies set next_step = 'Møte' where id = v_co;
    perform app.crm_run('crm_dispatch');
    v_txt := (select (runs - v_n)::text || ':' || last_ok from app.crm_jobs where job = 'crm_dispatch')
      || ',' || (select (sum(runs) - v_r) || ':' || (sum(items) - v_i) from app.crm_job_runs where job = 'crm_dispatch');
    -- a quiet run is counted in its hour too
    perform app.crm_run('crm_dispatch');
    v_txt := v_txt || ',' || (select (sum(runs) - v_r) || ':' || (sum(items) - v_i) from app.crm_job_runs where job = 'crm_dispatch');
    -- a job that fails does not raise; the job and its hour keep the code only
    select failures into v_n from app.crm_jobs where job = 'lead_route';
    select coalesce(sum(failed), 0) into v_r from app.crm_job_runs where job = 'lead_route';
    create or replace function app.lead_route() returns integer language plpgsql set search_path = '' as $f$
    begin
      return 1 / 0;
    end $f$;
    perform app.crm_run('lead_route');
    v_txt := v_txt || ',' || (select last_ok || ':' || last_error || ':' || (failures - v_n) from app.crm_jobs where job = 'lead_route')
      || ',' || (select (sum(failed) - v_r)::text from app.crm_job_runs where job = 'lead_route')
      || ':' || (select r.last_error from app.crm_job_runs r where r.job = 'lead_route' order by r.hour desc limit 1);
    begin
      perform app.crm_run('no_such_job');
      v_txt := v_txt || ',ran';
    exception when invalid_parameter_value then
      v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the runner records each run on the job and counts it in its hour, keeps the SQLSTATE and no message, never raising; an unknown job is refused',
      'expected', '1:true,1:1,2:1,false:22012:1,1:22012,refused', 'actual', v_txt,
      'pass', v_txt = '1:true,1:1,2:1,false:22012:1,1:22012,refused');

    -- 6 -------------------------------------------------------------- read point and events named
    -- the probe handler fails each delivery, so its rows show what the subscriber took
    select max(id) into v_max from app.crm_events;
    insert into app.crm_event_subscribers (key, handler, events, read_to) values ('stages', 'probe', array['company.stage_changed'], v_max);
    update app.crm_companies set stage = 'contacted' where id = v_co;
    perform app.crm_dispatch();
    v_txt := (select string_agg(e.name, ',' order by e.id) from app.crm_event_deliveries d join app.crm_events e on e.id = d.event_id where d.subscriber = 'stages')
      || '|' || ((select read_to from app.crm_event_subscribers where key = 'stages') = (select max(id) from app.crm_events))::text;
    begin
      insert into app.crm_event_subscribers (key, handler, events) values ('typo', 'rollup', array['company.renamed']);
      v_txt := v_txt || '|accepted';
    exception when check_violation then
      v_txt := v_txt || '|refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a subscriber added later reads from where it starts; one that names events takes those only; an event the catalogue lacks is refused',
      'expected', 'company.stage_changed|true|refused', 'actual', v_txt, 'pass', v_txt = 'company.stage_changed|true|refused');

    -- 7 -------------------------------------------------------------- the monitor, the dashboard and the retry
    -- the dashboard's 4: lead_route's failed run (5), the rollup's two set aside (4) and the probe's one given up on (3)
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_json := public.admin_crm_jobs();
    v_txt := (v_json ->> 'ok') || ',' || jsonb_array_length(v_json -> 'jobs')
      || ',' || (select string_agg(x ->> 'job' || ':' || (x ->> 'scheduled'), ' ' order by x ->> 'job') from jsonb_array_elements(v_json -> 'jobs') x)
      || ',' || (select x -> 'day' ->> 'failed' from jsonb_array_elements(v_json -> 'jobs') x where x ->> 'job' = 'lead_route')
      || ',' || (select x ->> 'job' || ':' || (x ->> 'failed') || ':' || (x ->> 'last_error') from jsonb_array_elements(v_json -> 'failed_runs') x limit 1)
      || ',' || (select x ->> 'skipped' from jsonb_array_elements(v_json -> 'subscribers') x where x ->> 'key' = 'rollup')
      || ',' || ((v_json -> 'rollups') <> '[]'::jsonb)::text
      || ',' || (public.admin_attention() ->> 'job_failures');
    -- the two set aside are delivered on an admin's retry although the window is full again
    insert into app.crm_setting_values (key, value) values ('limit_event_loop', '2');
    v_txt := v_txt || ',' || (public.admin_crm_event_retry('rollup') ->> 'retried');
    v_txt := v_txt || ',' || (app.crm_dispatch() ->> 'delivered');
    v_txt := v_txt || ',' || (select string_agg(d.status, ' ' order by d.event_id) from app.crm_event_deliveries d join app.crm_events e on e.id = d.event_id
                              where d.subscriber = 'rollup' and e.record_id = v_co2)
      || ',' || (public.admin_attention() ->> 'job_failures');
    delete from app.crm_setting_values where key = 'limit_event_loop';
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    v_txt := v_txt || ',' || (public.admin_crm_jobs() ->> 'error') || ',' || (public.admin_crm_event_retry('rollup') ->> 'error')
      || ',' || (public.admin_attention() ->> 'job_failures');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the job monitor and the retry are Operations''; the dashboard counts failed runs and set-aside deliveries for support; a retry is not held back by the window',
      'expected', 'true,4,brreg_triggers:true crm_dispatch:true crm_purge:true lead_route:true,1,lead_route:1:22012,2,true,4,2,2,done done,2,not_allowed,not_allowed,0', 'actual', v_txt,
      'pass', v_txt = 'true,4,brreg_triggers:true crm_dispatch:true crm_purge:true lead_route:true,1,lead_route:1:22012,2,true,4,2,2,done done,2,not_allowed,not_allowed,0');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 8 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select key from app.crm_event_subscribers where key <> 'rollup'
    union all select email from auth.users where email like '%@events-test.example'
    union all select id::text from app.crm_companies where name like 'Hendelse %'
    union all select key from app.crm_setting_values where key = 'limit_event_loop') x;
  v_txt := v_txt || ',' || (select count(*) from pg_constraint where conname = 'crm_event_subscribers_handler_check'
                            and pg_get_constraintdef(oid) like '%probe%');
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe row, handler and constraint was rolled back', 'expected', '0,0', 'actual', v_txt, 'pass', v_txt = '0,0');

  insert into public._cei
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cei order by seq;

do $$
declare
  v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from public._cei where not pass;
  if v_failed is not null then
    raise exception 'crm events invariants failed: %', v_failed;
  end if;
end $$;
