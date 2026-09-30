-- health_score_invariants.sql — health score v1 (0141, D-182; report § 7.7), proved against the live
-- schema.
--
--   * the score is not a client's to call (1)
--   * an organisation with nothing yet: each component says what is missing, NPS says it has no source (2)
--   * a healthy organisation: survey cycle, action items, two sign-ins, a 70 % round and no P1 ticket —
--     90, because customer NPS has no source (3)
--   * an open urgent ticket and a 50 % round lose their points and say why (4)
--   * a wheel whose last round is older than its longest gap is overdue (5)
--   * for every organisation in the database: six components summing to the total, the maxima to 100,
--     NPS 0 with 'no_source'; an unknown organisation has no score (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/health_score_invariants.sql

create unlogged table if not exists public._hsc(seq int, name text, expected text, actual text, pass bool);
truncate public._hsc;

do $$
declare
  v_empty uuid := '00000000-0000-4000-8000-0000000a1a01';
  v_good  uuid := '00000000-0000-4000-8000-0000000a1a02';
  v_late  uuid := '00000000-0000-4000-8000-0000000a1a03';
  v_u1    uuid := '00000000-0000-4000-8000-0000000a1b01';
  v_u2    uuid := '00000000-0000-4000-8000-0000000a1b02';
  v_meas  uuid;
  v_closed uuid;
  v_i     int;
  v_txt   text;
  v_rows  jsonb := '[]';
begin
  -- 1 ---------------------------------------------------------------- not a client's
  select concat_ws('|', has_function_privilege('authenticated', 'app.health_score(uuid)', 'execute'),
                        has_function_privilege('anon', 'app.health_score(uuid)', 'execute'))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'no client may call the health score', 'expected', 'f|f', 'actual', v_txt, 'pass', v_txt = 'f|f');

  begin
    insert into app.organizations (id, name, org_number, employee_count) values
      (v_empty, 'Tom AS', '999001451', 10), (v_good, 'Frisk AS', '999001452', 10), (v_late, 'Sein AS', '999001453', 10);

    -- 2 -------------------------------------------------------------- nothing yet
    select app.health_score(v_empty)->>'total' || '|' ||
           (select string_agg((c->>'key') || ':' || (c->>'points') || ':' || coalesce(c->>'missing', '-'), ',')
            from jsonb_array_elements(app.health_score(v_empty)->'components') c)
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'an organisation with nothing yet: what is missing, per component',
      'expected', '5|survey_cycle:0:no_active_wheel,action_items:0:no_action_item_90d,logins:0:fewer_than_2_logins_30d,response_rate:0:no_closed_round,nps:0:no_source,p1_tickets:5:-',
      'actual', v_txt,
      'pass', v_txt = '5|survey_cycle:0:no_active_wheel,action_items:0:no_action_item_90d,logins:0:fewer_than_2_logins_30d,response_rate:0:no_closed_round,nps:0:no_source,p1_tickets:5:-');

    -- 3 -------------------------------------------------------------- a healthy organisation
    insert into app.year_wheels (org_id, active) values (v_good, true);
    insert into auth.users (id, email, last_sign_in_at) values (v_u1, 'a@hsc-probe.no', now() - interval '1 day'), (v_u2, 'b@hsc-probe.no', now() - interval '3 days');
    insert into app.profiles (id, full_name) values (v_u1, 'A'), (v_u2, 'B');
    insert into app.memberships (org_id, user_id, role) values (v_good, v_u1, 'daglig_leder'), (v_good, v_u2, 'verneombud');
    insert into app.measures (org_id, factor_key, title) values (v_good, 'kontakt', 'Probe-tiltak');
    insert into app.employees (org_id, full_name, email) select v_good, 'Ansatt ' || g, 'e' || g || '@hsc-probe.no' from generate_series(1, 10) g;
    insert into app.measurements (org_id, kind, year, label) values (v_good, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_good, v_meas, 'lukket', now() - interval '60 days', now() - interval '40 days') returning id into v_closed;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_good, v_closed, e.id, extensions.digest('hsc' || e.id::text, 'sha256'), now() - interval '40 days'
    from app.employees e where e.org_id = v_good;
    for v_i in 1..7 loop
      insert into app.responses (org_id, round_id, group_id, submitted_hour) values (v_good, v_closed, null, date_trunc('hour', now() - interval '50 days'));
    end loop;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_good, v_meas, 'apen', now() - interval '2 days', now() + interval '12 days');
    select app.health_score(v_good)->>'total' || '|' ||
           (select string_agg((c->>'key') || ':' || (c->>'points'), ',') from jsonb_array_elements(app.health_score(v_good)->'components') c)
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a healthy organisation scores 90: every component but NPS, which has no source',
      'expected', '90|survey_cycle:30,action_items:25,logins:15,response_rate:15,nps:0,p1_tickets:5', 'actual', v_txt,
      'pass', v_txt = '90|survey_cycle:30,action_items:25,logins:15,response_rate:15,nps:0,p1_tickets:5');

    -- 4 -------------------------------------------------------------- an urgent ticket, a 50 % round
    -- urgent is derived: blocking, for the organisation (app.ticket_priority_of)
    insert into app.tickets (category, queue, channel, subject, requester_email, org_id, impact, blocking)
    values ('bug', 'support', 'admin', 'Probe', 'a@hsc-probe.no', v_good, 'one_org', true);
    delete from app.responses where id in (select id from app.responses where round_id = v_closed limit 2);
    select app.health_score(v_good)->>'total' || '|' ||
           (select string_agg((c->>'key') || ':' || (c->>'points') || ':' || coalesce(c->>'missing', '-'), ',')
            from jsonb_array_elements(app.health_score(v_good)->'components') c where c->>'key' in ('response_rate', 'p1_tickets'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'an open urgent ticket and a 50 % round lose their points and say why',
      'expected', '78|response_rate:8:response_rate_below_60,p1_tickets:0:open_p1_ticket', 'actual', v_txt,
      'pass', v_txt = '78|response_rate:8:response_rate_below_60,p1_tickets:0:open_p1_ticket');

    -- 5 -------------------------------------------------------------- overdue
    insert into app.year_wheels (org_id, active) values (v_late, true);
    insert into app.measurements (org_id, kind, year, label) values (v_late, 'grunnlinje', 2024, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_late, v_meas, 'lukket', now() - interval '20 months', now() - interval '19 months');
    select c->>'points' || ':' || (c->>'missing') into v_txt
    from jsonb_array_elements(app.health_score(v_late)->'components') c where c->>'key' = 'survey_cycle';
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a wheel whose last round opened 20 months ago is overdue',
      'expected', '0:survey_overdue', 'actual', v_txt, 'pass', v_txt = '0:survey_overdue');

    -- 6 -------------------------------------------------------------- every organisation
    select concat_ws('|',
      count(*) filter (where jsonb_array_length(h->'components') <> 6
                          or (h->>'total')::int <> (select sum((c->>'points')::int) from jsonb_array_elements(h->'components') c)
                          or (h->>'max')::int <> 100
                          or not exists (select 1 from jsonb_array_elements(h->'components') c
                                         where c->>'key' = 'nps' and c->>'points' = '0' and c->>'missing' = 'no_source')),
      count(*) >= 3,
      app.health_score('00000000-0000-4000-8000-0000000a1aff') is null)
      into v_txt
    from (select app.health_score(o.id) as h from app.organizations o) x;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every organisation: six components summing to the total, maxima to 100, NPS 0 with no source; an unknown one has no score',
      'expected', '0|t|t', 'actual', v_txt, 'pass', v_txt = '0|t|t');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 7 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@hsc-probe.no'
    union all select id::text from app.organizations where id in (v_empty, v_good, v_late)) x;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._hsc
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._hsc order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._hsc;
  if v_failed is not null then raise exception 'health score invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'health score invariants: expected 7 rows, got %', v_count; end if;
end $$;
