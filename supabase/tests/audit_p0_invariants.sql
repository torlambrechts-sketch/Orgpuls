-- audit_p0_invariants.sql — the four P0s of the 2026-09-28 deep audit (0106), each proved closed.
--
--   * AUD-01: no client role may read app.outbox (a reminder row names who has not answered);
--     the queue's counts come from queue_counts, to members only, as numbers (1, 2)
--   * AUD-02: conversations carries no answer with a comment (3)
--   * AUD-03: screening_counts answers for a closed round only (4)
--   * AUD-04: a pre-notice with a lead of 0, queued in the tick that opens the round, is sent and
--     goes before the invitations; one that fell due before the opening is still stale (5, 6)
--   * no rung of the ladder is told later than everyone, and at the same moment everyone's notice
--     goes last (8)
--   * AUD-28: no client deletes a measurement (the cascade takes its answers) or rewrites what a
--     closed one was (9)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/audit_p0_invariants.sql

create unlogged table if not exists public._ap0(seq int, name text, expected text, actual text, pass bool);
truncate public._ap0;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000a901';
  v_dl     uuid := '00000000-0000-4000-8000-0000000a9011';
  v_vo     uuid := '00000000-0000-4000-8000-0000000a9012';
  v_x      uuid := '00000000-0000-4000-8000-0000000a9013';
  v_meas   uuid;
  v_round  uuid;
  v_plan   uuid;
  v_resp   uuid;
  v_emp    uuid;
  v_wheel  uuid;
  v_json   jsonb;
  v_claim  jsonb;
  v_txt    text;
  v_i      int;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  -- 1 ---------------------------------------------------------------- the outbox is not a client's
  select concat_ws('|',
    (select count(*) from pg_policies where schemaname = 'app' and tablename = 'outbox'),
    (select count(*) from information_schema.role_table_grants where table_schema = 'app'
      and table_name = 'outbox' and grantee in ('anon', 'authenticated', 'PUBLIC')),
    has_table_privilege('authenticated', 'app.outbox', 'select')::text,
    has_function_privilege('anon', 'public.queue_counts(uuid)', 'execute')::text)
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'app.outbox: no policy, no client grant; queue_counts not for anon',
    'expected', '0|0|false|false', 'actual', v_txt, 'pass', v_txt = '0|0|false|false');

  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled)
    values (v_org, 'Revisjon Test AS', '999000941', 8, true);
    insert into auth.users (id, email) values (v_dl, 'dl@ap0-probe.no'), (v_vo, 'vo@ap0-probe.no'), (v_x, 'x@ap0-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina'), (v_vo, 'Vera'), (v_x, 'Xavier');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.survey_defaults (org_id, quiet_hours) values (v_org, false);
    insert into app.employees (org_id, full_name, email)
    select v_org, 'Ansatt ' || g, 'a' || g || '@ap0-probe.no' from generate_series(1, 6) g;
    select id into v_emp from app.employees where org_id = v_org order by full_name limit 1;

    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '3 days', now() + interval '4 days') returning id into v_round;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_org, v_round, e.id, extensions.digest('ap0' || e.id::text, 'sha256'), now() + interval '4 days'
    from app.employees e where e.org_id = v_org;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at, sent_at)
    select v_org, v_round, 'paminnelse', i.employee_id, i.id, now() + interval '1 day', null
    from app.invitations i where i.round_id = v_round;

    -- 2 -------------------------------------------------------------- counts, not rows
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform count(*) from app.outbox;
      v_txt := 'read';
    exception when insufficient_privilege then
      v_txt := 'denied';
    end;
    v_json := public.queue_counts(v_org);
    v_txt := v_txt || '|' || (v_json->>'pending') || ',' || (v_json->>'sent') || ',' || (v_json->>'failed')
          || '|' || (select string_agg(k, ',' order by k) from jsonb_object_keys(v_json) k);
    perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
    begin
      perform public.queue_counts(v_org);
      v_txt := v_txt || '|stranger reads';
    exception when insufficient_privilege then
      v_txt := v_txt || '|denied';
    end;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a verneombud cannot select the outbox; queue_counts gives three numbers; a stranger is refused',
      'expected', 'denied|6,0,0|failed,pending,sent|denied', 'actual', v_txt, 'pass', v_txt = 'denied|6,0,0|failed,pending,sent|denied');

    -- 3 -------------------------------------------------------------- a comment without its answer
    for v_i in 1..5 loop
      insert into app.responses (org_id, round_id, group_id, submitted_hour)
      values (v_org, v_round, null, date_trunc('hour', now())) returning id into v_resp;
      insert into app.answers (response_id, factor_key, ordinal, value) values (v_resp, 'ytring', 1, 5);
      if v_i <= 4 then
        insert into app.response_comments (response_id, factor_key, ordinal, body) values (v_resp, 'ytring', 1, 'Kommentar ' || v_i);
        insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
        values (v_org, v_resp, 'ytring', 1, extensions.digest('ap0-key-' || v_i, 'sha256'), date_trunc('hour', now()));
      end if;
    end loop;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_json := public.conversations(v_round);
    reset role;
    select concat_ws('|', jsonb_array_length(v_json->'threads'),
      (select count(*) from jsonb_array_elements(v_json->'threads') t where t ? 'answer_value'),
      (v_json::text like '%answer%')::text)
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'conversations: four threads, none carrying an answer',
      'expected', '4|0|false', 'actual', v_txt, 'pass', v_txt = '4|0|false');

    -- 4 -------------------------------------------------------------- screening counts after close only
    insert into app.round_extra_questions (org_id, round_id, extra_key) values (v_org, v_round, 'krenkende');
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_txt := coalesce(public.screening_counts(v_round)->>'error', 'answered');
    reset role;
    update app.rounds set status = 'lukket', closes_at = now() - interval '1 minute' where id = v_round;
    set local role authenticated;
    v_txt := v_txt || '|' || coalesce(public.screening_counts(v_round)->>'status', 'error');
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'screening_counts: not_available while open, ok once closed',
      'expected', 'not_available|ok', 'actual', v_txt, 'pass', v_txt = 'not_available|ok');

    -- 5 -------------------------------------------------------------- a lead of 0 is sent, first
    update app.outbox set sent_at = now() where org_id = v_org;
    insert into app.year_wheels (org_id, active) values (v_org, true) returning id into v_wheel;
    insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values
      (v_wheel, 'verneombud', 0, 1), (v_wheel, 'daglig_leder', 0, 2);
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'puls', 2026, 'Probe P') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, close_after_days)
    values (v_org, v_meas, 'planlagt', now() - interval '1 minute', 7) returning id into v_plan;
    perform app.wheel_tick();
    v_claim := public.dispatch_claim(100);
    select concat_ws('|',
      (select status from app.rounds where id = v_plan),
      (select string_agg(j->>'kind' || ':' || coalesce(j->>'audience', '-'), ',' order by n)
         from jsonb_array_elements(v_claim) with ordinality x(j, n)
        where (j->'round'->>'kind') = 'puls' and j->>'org' = 'Revisjon Test AS' and j->>'kind' = 'forvarsel'),
      ((select min(n) from jsonb_array_elements(v_claim) with ordinality x(j, n) where j->>'kind' = 'forvarsel' and j->>'org' = 'Revisjon Test AS')
        < (select min(n) from jsonb_array_elements(v_claim) with ordinality x(j, n) where j->>'kind' = 'invitasjon' and j->>'org' = 'Revisjon Test AS'))::text,
      (select count(*) from app.outbox where round_id = v_plan and kind = 'forvarsel' and last_error = 'round_already_open'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'lead 0: the round opens, both pre-notices are claimed before the invitations, none dropped',
      'expected', 'apen|forvarsel:verneombud,forvarsel:daglig_leder|true|0', 'actual', v_txt,
      'pass', v_txt = 'apen|forvarsel:verneombud,forvarsel:daglig_leder|true|0'
           or v_txt = 'apen|forvarsel:daglig_leder,forvarsel:verneombud|true|0');

    -- 6 -------------------------------------------------------------- a late pre-notice is still stale
    update app.outbox set sent_at = coalesce(sent_at, now()), claimed_at = null where org_id = v_org;
    insert into app.outbox (org_id, round_id, kind, audience, due_at)
    values (v_org, v_plan, 'forvarsel', 'avdelingsledere', (select opens_at from app.rounds where id = v_plan) - interval '2 days');
    perform public.dispatch_claim(100);
    v_txt := (select last_error from app.outbox where round_id = v_plan and kind = 'forvarsel' and audience = 'avdelingsledere');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a pre-notice due before the opening, not sent until after, is dropped as round_already_open',
      'expected', 'round_already_open', 'actual', coalesce(v_txt, 'null'), 'pass', v_txt = 'round_already_open');

    -- 8 -------------------------------------------------------------- nobody after everyone
    update app.wheel_notifications set lead_days = 1 where wheel_id = v_wheel;
    insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values (v_wheel, 'alle_ansatte', 3, 5);
    insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values (v_wheel, 'tillitsvalgte', 0, 2);
    update app.wheel_notifications set lead_days = 0 where wheel_id = v_wheel and audience = 'verneombud';
    select string_agg(audience::text || '=' || lead_days, ',' order by audience::text) into v_txt
    from app.wheel_notifications where wheel_id = v_wheel;
    -- at the same moment, everyone's pre-notice is claimed after the verneombud's
    update app.outbox set sent_at = coalesce(sent_at, now()), claimed_at = null where org_id = v_org;
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'puls', 2026, 'Probe Q') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, close_after_days)
    values (v_org, v_meas, 'planlagt', now() + interval '3 days', 7) returning id into v_plan;
    insert into app.outbox (org_id, round_id, kind, audience, due_at) values
      (v_org, v_plan, 'forvarsel', 'alle_ansatte', now() - interval '1 minute'),
      (v_org, v_plan, 'forvarsel', 'verneombud', now() - interval '1 minute');
    v_claim := public.dispatch_claim(100);
    v_txt := v_txt || '|' || (select string_agg(j->>'audience', ',' order by n) from jsonb_array_elements(v_claim) with ordinality x(j, n)
                              where (j->'round'->>'kind') = 'puls' and j->>'kind' = 'forvarsel' and j->>'org' = 'Revisjon Test AS');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'no rung is told later than everyone; at the same moment the verneombud goes before everyone',
      'expected', 'alle_ansatte=3,daglig_leder=3,tillitsvalgte=3,verneombud=3|verneombud,alle_ansatte', 'actual', v_txt,
      'pass', v_txt = 'alle_ansatte=3,daglig_leder=3,tillitsvalgte=3,verneombud=3|verneombud,alle_ansatte');

    -- 9 -------------------------------------------------------------- a measurement keeps its answers
    select m.id into v_meas from app.measurements m join app.rounds r on r.measurement_id = m.id
    where r.id = v_round;
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      delete from app.measurements where id = v_meas;
      get diagnostics v_i = row_count;
      v_txt := 'deleted ' || v_i;
    exception when insufficient_privilege then
      v_txt := 'delete denied';
    end;
    begin
      update app.measurements set year = 2020 where id = v_meas;
      v_txt := v_txt || '|year changed';
    exception when insufficient_privilege then
      v_txt := v_txt || '|year denied';
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    begin
      update app.measurements set kind = 'puls' where id = v_meas;
      v_txt := v_txt || '|kind changed';
    exception when check_violation then
      v_txt := v_txt || '|kind fixed';
    end;
    update app.measurements set evaluation_cadence = 'arlig' where id = v_meas;
    reset role;
    v_txt := v_txt || '|' || (select count(*) from app.responses where round_id = v_round)
                   || '|' || (select evaluation_cadence::text from app.measurements where id = v_meas);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'no client deletes a measurement or changes its year; its kind is fixed once opened; the cadence may change',
      'expected', 'delete denied|year denied|kind fixed|5|arlig', 'actual', v_txt, 'pass', v_txt = 'delete denied|year denied|kind fixed|5|arlig');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 7 ----------------------------------------------------------------- nothing survives
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_vo, v_x)) x;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._ap0
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._ap0 order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._ap0;
  if v_failed is not null then raise exception 'audit p0 invariants failed: %', v_failed; end if;
  if v_count <> 9 then raise exception 'audit p0 invariants: expected 9 rows, got %', v_count; end if;
end $$;

drop table public._ap0;
