-- question_choice_invariants.sql — choosing a module's statements one by one, and the whole core
-- in every grunnlinje (0088, D-136), proved against the live schema.
--
--   * the two tables: RLS on; members may read, no client may write (1)
--   * only a daglig leder may leave a statement out; a verneombud gets not_allowed (2)
--   * leaving one out: kept with its reason, logged, and gone from the planned grunnlinje (3)
--   * the last statement cannot be left out (4)
--   * putting it back: back in the planned grunnlinje, and logged again (5)
--   * a new grunnlinje asks the module without the statements left out (6)
--   * the log is append-only while the organisation exists (7)
--   * a grunnlinje opens with all eleven core factors, whatever was removed (8)
--   * a puls opens with its own factors, untouched (9)
--   * nothing written here survives (10)
--
-- Built inside a block that is rolled back. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/question_choice_invariants.sql

create unlogged table if not exists public._qci(seq int, name text, expected text, actual text, pass bool);
truncate public._qci;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000ac01';
  v_meas   uuid := '00000000-0000-4000-8000-00000000ac02';
  v_pmeas  uuid := '00000000-0000-4000-8000-00000000ac03';
  v_dl     uuid := '00000000-0000-4000-8000-0000000ac011';
  v_vo     uuid := '00000000-0000-4000-8000-0000000ac012';
  v_round  uuid;
  v_round2 uuid;
  v_puls   uuid;
  v_mod    uuid;
  v_ids    uuid[];
  v_json   jsonb;
  v_txt    text;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  -- 1 ---------------------------------------------------------------- the tables
  select concat_ws('|',
    (select string_agg(c.relname || ':' || c.relrowsecurity, ',' order by c.relname) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname in ('org_module_items_off', 'org_module_items_log')),
    (select string_agg(distinct privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
      where table_schema = 'app' and table_name in ('org_module_items_off', 'org_module_items_log') and grantee = 'authenticated'),
    (select count(*) from information_schema.role_table_grants
      where table_schema = 'app' and table_name in ('org_module_items_off', 'org_module_items_log') and grantee = 'anon'))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on, members read, nobody writes but the function',
    'expected', 'org_module_items_log:true,org_module_items_off:true|SELECT|0', 'actual', v_txt,
    'pass', v_txt = 'org_module_items_log:true,org_module_items_off:true|SELECT|0');

  begin
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-choice', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 2,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object(
        'id', 'probe_faktor', 'name', 'Probefaktor', 'summary', 'S', 'rationale', 'R', 'rationale_sources', '[]'::jsonb,
        'legal_basis', '[]'::jsonb,
        'items', '[{"id":"PC-PF-1","text":"En","reverse":false,"pulse_eligible":true},
                   {"id":"PC-PF-2","text":"To","reverse":false,"pulse_eligible":true},
                   {"id":"PC-PF-3","text":"Tre","reverse":false,"pulse_eligible":true}]'::jsonb,
        'action_suggestions', '[{"type":"rutine","title":"T","description":"D","remeasure_item":"PC-PF-2"}]'::jsonb)),
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('e', 64));
    select m.id into v_mod from app.question_modules m where m.key = 'probe-choice';
    perform app.module_set_status('probe-choice', '0.0.1', 'published');

    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Question Choice AS', '999000555', 20);
    insert into auth.users (id, email) values (v_dl, 'dl@qc-test.example'), (v_vo, 'vo@qc-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_vo, 'VO');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_org, 'grunnlinje', 2027, 'Probe');
    insert into app.measurements (id, org_id, kind, year, label) values (v_pmeas, v_org, 'puls', 2027, 'Probe puls');
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2027-03-01 08:00+01', '2027-03-15 20:00+01') returning id into v_round;
    insert into app.round_factors (org_id, round_id, factor_key) select v_org, v_round, f.key from app.factors f;

    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.set_org_module(v_org, 'probe-choice', true);

    -- 2 ------------------------------------------------------------ who
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_json := public.set_org_module_item(v_org, 'probe-choice', 'PC-PF-1', false, 'Gjelder ikke oss');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a verneombud may not leave a statement out',
      'expected', 'not_allowed', 'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'not_allowed');

    -- 3 ------------------------------------------------------------ out
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.set_org_module_item(v_org, 'probe-choice', 'PC-PF-1', false, 'Gjelder ikke oss');
    select concat_ws('|', v_json->>'ok', v_json->>'planned_rounds',
      (select o.reason from app.org_module_items_off o where o.org_id = v_org and o.item_code = 'PC-PF-1'),
      (select count(*) from app.org_module_items_log l where l.org_id = v_org and not l.asked),
      (select string_agg(i.code, ',' order by i.code) from app.round_modules rm, unnest(rm.item_ids) x(id)
        join app.module_items i on i.id = x.id where rm.round_id = v_round))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a daglig leder leaves one out: kept, logged, gone from the planned grunnlinje',
      'expected', 'true|1|Gjelder ikke oss|1|PC-PF-2,PC-PF-3', 'actual', v_txt, 'pass', v_txt = 'true|1|Gjelder ikke oss|1|PC-PF-2,PC-PF-3');

    -- 4 ------------------------------------------------------------ the last one stays
    v_json := public.set_org_module_item(v_org, 'probe-choice', 'PC-PF-2', false, null);
    v_json := public.set_org_module_item(v_org, 'probe-choice', 'PC-PF-3', false, null);
    v_txt := coalesce(v_json->>'error', 'ok') || '|' ||
      (select string_agg(i.code, ',' order by i.code) from app.round_modules rm, unnest(rm.item_ids) x(id)
        join app.module_items i on i.id = x.id where rm.round_id = v_round);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the last statement cannot be left out',
      'expected', 'last_statement|PC-PF-3', 'actual', v_txt, 'pass', v_txt = 'last_statement|PC-PF-3');

    -- 5 ------------------------------------------------------------ back in
    v_json := public.set_org_module_item(v_org, 'probe-choice', 'PC-PF-1', true, null);
    select concat_ws('|', v_json->>'ok',
      (select count(*) from app.org_module_items_off o where o.org_id = v_org),
      (select count(*) from app.org_module_items_log l where l.org_id = v_org),
      (select string_agg(i.code, ',' order by i.code) from app.round_modules rm, unnest(rm.item_ids) x(id)
        join app.module_items i on i.id = x.id where rm.round_id = v_round))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'putting one back: in the planned grunnlinje again, and logged',
      'expected', 'true|1|3|PC-PF-1,PC-PF-3', 'actual', v_txt, 'pass', v_txt = 'true|1|3|PC-PF-1,PC-PF-3');

    -- 6 ------------------------------------------------------------ a new grunnlinje
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2028-03-01 08:00+01', '2028-03-15 20:00+01') returning id into v_round2;
    select string_agg(i.code, ',' order by i.code) into v_txt
    from app.round_modules rm, unnest(rm.item_ids) x(id) join app.module_items i on i.id = x.id where rm.round_id = v_round2;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a new grunnlinje asks the module without what is left out',
      'expected', 'PC-PF-1,PC-PF-3', 'actual', coalesce(v_txt, '-'), 'pass', v_txt = 'PC-PF-1,PC-PF-3');

    -- 7 ------------------------------------------------------------ the log
    v_txt := '';
    begin
      update app.org_module_items_log set reason = 'rewritten' where org_id = v_org;
      v_txt := 'updated';
    exception when restrict_violation then v_txt := 'refused';
    end;
    begin
      delete from app.org_module_items_log where org_id = v_org;
      v_txt := v_txt || ',deleted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the log cannot be rewritten or deleted while the organisation exists',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    -- 8 ------------------------------------------------------------ the whole core
    perform set_config('request.jwt.claims', '', true);
    delete from app.round_factors where round_id = v_round and factor_key in ('kontakt', 'emosjon', 'mening');
    select count(*) into v_cnt from app.round_factors where round_id = v_round;
    update app.rounds set status = 'apen' where id = v_round;
    v_txt := v_cnt || '→' || (select count(*) from app.round_factors where round_id = v_round) || '/' || (select count(*) from app.factors);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a grunnlinje opens with every core factor, whatever was removed',
      'expected', '8→11/11', 'actual', v_txt, 'pass', v_txt = '8→11/11');

    -- 9 ------------------------------------------------------------ a puls is its own
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_pmeas, 'planlagt', '2027-06-01 08:00+02', '2027-06-10 20:00+02') returning id into v_puls;
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_puls, 'mengde'), (v_org, v_puls, 'leder');
    update app.rounds set status = 'apen' where id = v_puls;
    v_txt := (select string_agg(factor_key, ',' order by factor_key) from app.round_factors where round_id = v_puls);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a puls opens with its own factors, untouched',
      'expected', 'leder,mengde', 'actual', coalesce(v_txt, '-'), 'pass', v_txt = 'leder,mengde');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 10 ---------------------------------------------------------------- nothing left
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_vo)
    union all select key from app.question_modules where key = 'probe-choice'
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._qci
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._qci order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._qci;
  if v_failed is not null then raise exception 'question choice invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'question choice invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._qci;
