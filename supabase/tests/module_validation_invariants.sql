-- module_validation_invariants.sql — a module's validation status, decided in the admin (0092, D-140).
--
--   * the decision log: RLS on, no policy, no client privilege (1)
--   * only a super-admin with a second factor decides (2)
--   * «Validert» needs a report link and a reason; «Foreløpig» a reason (3)
--   * a decision moves the published module's status, logs it, and audits it (4)
--   * nothing else can move it: a direct update is refused, and a logged decision cannot change (5)
--   * the admin's list shows the status, the last decision and the variants (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_validation_invariants.sql

create unlogged table if not exists public._mval(seq int, name text, expected text, actual text, pass bool);
truncate public._mval;

do $$
declare
  v_super   uuid := '00000000-0000-4000-8000-0000000af001';
  v_support uuid := '00000000-0000-4000-8000-0000000af002';
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_txt     text;
  v_n       int;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  -- 1 ---------------------------------------------------------------- the log
  select concat_ws('|',
    (select relrowsecurity from pg_class where oid = 'app.module_validation_log'::regclass),
    (select count(*) from pg_policies where schemaname = 'app' and tablename = 'module_validation_log'),
    (select count(*) from information_schema.role_table_grants
     where table_schema = 'app' and table_name = 'module_validation_log' and grantee in ('anon', 'authenticated')))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the decision log: RLS on, no policy, no client privilege',
    'expected', 't|0|0', 'actual', v_txt, 'pass', v_txt = 't|0|0');

  begin
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-validation', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
      'validation_status', 'provisional',
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', '[{"id":"pv","name":"P","summary":"S","rationale":"R","rationale_sources":[],"legal_basis":[],
                    "items":[{"id":"PQ-PV-1","text":"En","reverse":false,"pulse_eligible":true},
                             {"id":"PQ-PV-2","text":"To","reverse":false,"pulse_eligible":true},
                             {"id":"PQ-PV-3","text":"Tre","reverse":false,"pulse_eligible":true}],
                    "action_suggestions":[{"type":"rutine","title":"T","description":"D","remeasure_item":"PQ-PV-1"}]}]'::jsonb,
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('e', 64));
    perform app.module_set_status('probe-validation', '0.0.1', 'published');

    insert into auth.users (id, email) values (v_super, 'super@val-test.example'), (v_support, 'support@val-test.example');
    insert into app.platform_admins (user_id, role) values (v_super, 'super_admin'), (v_support, 'support');

    -- 2 ------------------------------------------------------------ who
    perform set_config('request.jwt.claims', format(claims, v_support, 'aal2'), true);
    v_txt := public.admin_module_set_validation('probe-validation', '0.0.1', 'validated', 'https://example.org/rapport', 'Pilot bestått')->>'error';
    perform set_config('request.jwt.claims', format(claims, v_super, 'aal1'), true);
    v_txt := v_txt || ',' || (public.admin_module_set_validation('probe-validation', '0.0.1', 'validated', 'https://example.org/rapport', 'Pilot bestått')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'support, and a super-admin without a second factor, are refused',
      'expected', 'not_allowed,not_allowed', 'actual', v_txt, 'pass', v_txt = 'not_allowed,not_allowed');

    -- 3 ------------------------------------------------------------ what it takes
    perform set_config('request.jwt.claims', format(claims, v_super, 'aal2'), true);
    v_txt := concat_ws(',',
      public.admin_module_set_validation('probe-validation', '0.0.1', 'validated', null, 'Pilot bestått')->>'error',
      public.admin_module_set_validation('probe-validation', '0.0.1', 'validated', 'http://example.org/r', 'Pilot bestått')->>'error',
      public.admin_module_set_validation('probe-validation', '0.0.1', 'validated', 'https://example.org/r', 'ok')->>'error',
      public.admin_module_set_validation('probe-validation', '0.0.1', 'godkjent', 'https://example.org/r', 'Pilot bestått')->>'error',
      public.admin_module_set_validation('probe-validation', '9.9.9', 'validated', 'https://example.org/r', 'Pilot bestått')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no link, no https, a short reason, an unknown status or version: refused',
      'expected', 'report_required,report_required,reason_required,invalid,not_found', 'actual', v_txt,
      'pass', v_txt = 'report_required,report_required,reason_required,invalid,not_found');

    -- 4 ------------------------------------------------------------ a decision
    select count(*) into v_n from app.admin_audit where action = 'module.validate';
    v_json := public.admin_module_set_validation('probe-validation', '0.0.1', 'validated', 'https://example.org/rapport', 'Pilot med 312 svar bestått');
    v_txt := concat_ws('|', v_json->>'result',
      (select validation_status from app.question_modules where key = 'probe-validation'),
      (select status || ',' || report_url from app.module_validation_log where module_key = 'probe-validation'),
      (select count(*) - v_n from app.admin_audit where action = 'module.validate'));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the decision moves the published module''s status, logged and audited',
      'expected', 'validated|validated|validated,https://example.org/rapport|1', 'actual', v_txt,
      'pass', v_txt = 'validated|validated|validated,https://example.org/rapport|1');

    -- 5 ------------------------------------------------------------ nothing else moves it
    perform set_config('request.jwt.claims', '', true);
    begin
      update app.question_modules set validation_status = 'provisional' where key = 'probe-validation';
      v_txt := 'written';
    exception when restrict_violation then v_txt := 'refused';
    end;
    begin
      update app.module_validation_log set reason = 'Endret i ettertid' where module_key = 'probe-validation';
      v_txt := v_txt || ',written';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    begin
      update app.question_modules set name = 'Annet navn' where key = 'probe-validation';
      v_txt := v_txt || ',written';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a direct update, a changed decision, other content: refused',
      'expected', 'refused,refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused,refused');

    -- 6 ------------------------------------------------------------ the admin's list
    perform set_config('request.jwt.claims', format(claims, v_super, 'aal2'), true);
    perform public.admin_module_set_validation('probe-validation', '0.0.1', 'provisional', null, 'Nye funn i pilot to');
    perform set_config('request.jwt.claims', format(claims, v_support, 'aal2'), true);
    select concat_ws('|', m->>'validation_status', m->'decision'->>'status', m->'decision'->>'reason',
                     jsonb_array_length(m->'variants'), (select count(*) from app.module_validation_log where module_key = 'probe-validation'))
      into v_txt
    from jsonb_array_elements(public.admin_modules()->'modules') m where m->>'key' = 'probe-validation';
    select v_txt || '#' || count(*) into v_txt
    from jsonb_array_elements(public.admin_modules()->'modules') m, jsonb_array_elements(m->'variants') v
    where m->>'key' = 'kunnskap-og-kontor' and (v->>'items')::int in (24, 62);
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the list shows the status, the last decision, and kontor''s two variants of 24 and 62',
      'expected', 'provisional|provisional|Nye funn i pilot to|0|2#2', 'actual', coalesce(v_txt, 'none'),
      'pass', v_txt = 'provisional|provisional|Nye funn i pilot to|0|2#2');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 7 ---------------------------------------------------------------- nothing left
  select count(*) into v_n from (
    select key from app.question_modules where key = 'probe-validation'
    union all select module_key from app.module_validation_log where module_key = 'probe-validation'
    union all select id::text from auth.users where id in (v_super, v_support)
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._mval
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._mval order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._mval;
  if v_failed is not null then raise exception 'module validation invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'module validation invariants: expected 7 rows, got %', v_count; end if;
end $$;

drop table public._mval;
