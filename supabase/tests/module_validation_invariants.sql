-- module_validation_invariants.sql — a module's validation status, decided by the platform (0092, D-140;
-- through the platform API since 0205/0206).
--
--   * the decision log: RLS on, no policy, no client privilege (1)
--   * only the platform decides: no client may execute the operation, and without a platform actor it
--     refuses (2)
--   * «Validert» needs a report link and a reason; «Foreløpig» a reason (3)
--   * a decision through the platform API moves the published module's status, logs it, and is recorded
--     in app.platform_commands (4)
--   * nothing else can move it: a direct update is refused, and a logged decision cannot change (5)
--   * the platform's module list shows the status, the last decision and the variants (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_validation_invariants.sql

create unlogged table if not exists public._mval(seq int, name text, expected text, actual text, pass bool);
truncate public._mval;

-- a command token as the platform would sign it (HS256 under the Vault secret)
create or replace function pg_temp.tok(p_claims jsonb) returns text
  language plpgsql as $$
declare
  h text := rtrim(translate(encode(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'), 'base64'), E'+/\n', '-_'), '=');
  p text := rtrim(translate(encode(convert_to(p_claims::text, 'UTF8'), 'base64'), E'+/\n', '-_'), '=');
begin
  return h || '.' || p || '.' ||
    rtrim(translate(encode(extensions.hmac(h || '.' || p, app.platform_secret('token'), 'sha256'), 'base64'), E'+/\n', '-_'), '=');
end $$;

do $$
declare
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_txt     text;
  v_n       int;
  v_cmd     jsonb := jsonb_build_object('aud', 'orgpuls', 'sub', 'tor@platform', 'scope', 'modules:write',
                                        'iat', extract(epoch from now())::bigint, 'exp', extract(epoch from now())::bigint + 120);
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

    -- 2 ------------------------------------------------------------ who
    v_txt := (has_function_privilege('anon', 'app.op_module_set_validation(text,text,text,text,text)', 'execute')
              or has_function_privilege('authenticated', 'app.op_module_set_validation(text,text,text,text,text)', 'execute'))::text;
    perform set_config('app.platform_actor', '', true);
    v_txt := v_txt || ',' || (app.op_module_set_validation('probe-validation', '0.0.1', 'validated', 'https://example.org/rapport', 'Pilot bestått')->>'error')
          || ',' || (app.op_modules()->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'no client may execute the decision; without a platform actor it and the list refuse',
      'expected', 'false,not_allowed,not_allowed', 'actual', v_txt, 'pass', v_txt = 'false,not_allowed,not_allowed');

    -- 3 ------------------------------------------------------------ what it takes
    perform set_config('app.platform_actor', 'test@platform', true);
    v_txt := concat_ws(',',
      app.op_module_set_validation('probe-validation', '0.0.1', 'validated', null, 'Pilot bestått')->>'error',
      app.op_module_set_validation('probe-validation', '0.0.1', 'validated', 'http://example.org/r', 'Pilot bestått')->>'error',
      app.op_module_set_validation('probe-validation', '0.0.1', 'validated', 'https://example.org/r', 'ok')->>'error',
      app.op_module_set_validation('probe-validation', '0.0.1', 'godkjent', 'https://example.org/r', 'Pilot bestått')->>'error',
      app.op_module_set_validation('probe-validation', '9.9.9', 'validated', 'https://example.org/r', 'Pilot bestått')->>'error');
    perform set_config('app.platform_actor', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no link, no https, a short reason, an unknown status or version: refused',
      'expected', 'report_required,report_required,reason_required,invalid,not_found', 'actual', v_txt,
      'pass', v_txt = 'report_required,report_required,reason_required,invalid,not_found');

    -- 4 ------------------------------------------------------------ a decision
    v_json := public.platform_command(pg_temp.tok(v_cmd || '{"jti":"mval-validate-001"}'), 'modules.set_validation',
      jsonb_build_object('p_key', 'probe-validation', 'p_version', '0.0.1', 'p_status', 'validated',
                         'p_report_url', 'https://example.org/rapport', 'p_reason', 'Pilot med 312 svar bestått'));
    perform set_config('app.platform_actor', '', true);
    v_txt := concat_ws('|', coalesce(v_json #>> '{result,result}', v_json::text),
      (select validation_status from app.question_modules where key = 'probe-validation'),
      (select status || ',' || report_url from app.module_validation_log where module_key = 'probe-validation'),
      (select count(*) from app.platform_commands where jti = 'mval-validate-001' and command = 'modules.set_validation' and ok));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the decision through the platform API moves the published module''s status, logged and recorded',
      'expected', 'validated|validated|validated,https://example.org/rapport|1', 'actual', v_txt,
      'pass', v_txt = 'validated|validated|validated,https://example.org/rapport|1');

    -- 5 ------------------------------------------------------------ nothing else moves it
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
    perform set_config('app.platform_actor', 'test@platform', true);
    perform app.op_module_set_validation('probe-validation', '0.0.1', 'provisional', null, 'Nye funn i pilot to');
    select concat_ws('|', m->>'validation_status', m->'decision'->>'status', m->'decision'->>'reason',
                     jsonb_array_length(m->'variants'), (select count(*) from app.module_validation_log where module_key = 'probe-validation'))
      into v_txt
    from jsonb_array_elements(app.op_modules()->'modules') m where m->>'key' = 'probe-validation';
    select v_txt || '#' || count(*) into v_txt
    from jsonb_array_elements(app.op_modules()->'modules') m, jsonb_array_elements(m->'variants') v
    where m->>'key' = 'kunnskap-og-kontor' and (v->>'items')::int in (24, 62);
    perform set_config('app.platform_actor', '', true);
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
    union all select jti from app.platform_commands where jti like 'mval-%'
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
