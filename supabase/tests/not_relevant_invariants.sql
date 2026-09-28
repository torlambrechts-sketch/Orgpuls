-- not_relevant_invariants.sql — «Ikke relevant for meg» (0087, D-134), proved against the live schema.
--
--   * the two tables are answer tables: RLS on, no policy, no client privilege (1)
--   * «ikke relevant» in place of a value is written to its own table and nowhere an index
--     reads, core and module alike; the answers count returned leaves it out (2)
--   * «ikke relevant» beside a value is refused, core and module, and consumes nothing (3)
--   * the rows are append-only while their response exists (4)
--   * anon may not call results_not_relevant (5)
--   * a daglig leder gets n and na for a statement at least k people marked not relevant, and
--     nothing where fewer did, however many answered (6)
--   * a verneombud is answered; an avdelingsleder and a non-member get the same refusal (7)
--   * an open round gives nothing (8)
--   * still one submit_response, still no response id returned (9)
--   * nothing written here survives (10)
--
-- The write path runs on the fixture's open round with a probe module, as
-- module_respond_invariants.sql does; the reader on an organisation of its own. Both inside
-- blocks that are rolled back. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/not_relevant_invariants.sql

create unlogged table if not exists public._nri(seq int, name text, expected text, actual text, pass bool);
truncate public._nri;

do $$
declare
  v_fix    uuid := '00000000-0000-4000-8000-000000000001';
  v_round  uuid;
  v_emp    uuid;
  v_tok    text;
  v_mod    uuid;
  v_items  uuid[];
  v_res    jsonb;
  v_txt    text;
  v_before int;
  v_after  int;
  v_f1     text;
  v_f2     text;
  -- the reader's own organisation
  v_org    uuid := '00000000-0000-4000-8000-00000000ab01';
  v_meas   uuid := '00000000-0000-4000-8000-00000000ab02';
  v_dl     uuid := '00000000-0000-4000-8000-0000000ab011';
  v_vo     uuid := '00000000-0000-4000-8000-0000000ab012';
  v_al     uuid := '00000000-0000-4000-8000-0000000ab013';
  v_out    uuid := '00000000-0000-4000-8000-0000000ab014';
  v_grp    uuid;
  v_closed uuid;
  v_open   uuid;
  v_k      int;
  v_json   jsonb;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  -- 1 ---------------------------------------------------------------- answer tables
  select concat_ws('|',
    (select string_agg(c.relname || ':' || c.relrowsecurity, ',' order by c.relname) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname in ('not_relevant_answers', 'module_not_relevant_answers')),
    (select count(*) from pg_policies where schemaname = 'app' and tablename in ('not_relevant_answers', 'module_not_relevant_answers')),
    (select count(*) from information_schema.role_table_grants where table_schema = 'app'
      and table_name in ('not_relevant_answers', 'module_not_relevant_answers') and grantee in ('anon', 'authenticated', 'PUBLIC')))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'both tables: RLS on, no policy, no client privilege',
    'expected', 'module_not_relevant_answers:true,not_relevant_answers:true|0|0', 'actual', v_txt,
    'pass', v_txt = 'module_not_relevant_answers:true,not_relevant_answers:true|0|0');

  select r.id into v_round from app.rounds r where r.status = 'apen' and r.org_id = v_fix order by r.opens_at desc limit 1;
  select e.id into v_emp from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_round and i.responded_at is null order by e.full_name limit 1;
  v_tok := 'fixture.' || v_round::text || '.' || v_emp::text;
  select rf.factor_key into v_f1 from app.round_factors rf where rf.round_id = v_round order by rf.factor_key limit 1;
  select rf.factor_key into v_f2 from app.round_factors rf where rf.round_id = v_round order by rf.factor_key desc limit 1;

  begin
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-na', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 2,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object(
        'id', 'probe_faktor', 'name', 'Probefaktor', 'summary', 'S', 'rationale', 'R', 'rationale_sources', '[]'::jsonb,
        'legal_basis', '[]'::jsonb,
        'items', '[{"id":"PN-PF-1","text":"En","reverse":false,"pulse_eligible":true},
                   {"id":"PN-PF-2","text":"To","reverse":false,"pulse_eligible":true},
                   {"id":"PN-PF-3","text":"Tre","reverse":false,"pulse_eligible":true}]'::jsonb,
        'action_suggestions', '[{"type":"rutine","title":"T","description":"D","remeasure_item":"PN-PF-2"}]'::jsonb)),
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('d', 64));
    select m.id into v_mod from app.question_modules m where m.key = 'probe-na';
    perform app.module_set_status('probe-na', '0.0.1', 'published');
    select array_agg(i.id order by i.sort) into v_items from app.module_items i where i.module_id = v_mod and i.kind = 'likert5';
    alter table app.round_modules disable trigger round_module_ok;
    insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items)
    values (v_fix, v_round, v_mod, v_items, false);
    alter table app.round_modules enable trigger round_module_ok;

    -- 3 ---------------------------------------------------------------- beside a value: refused
    select count(*) into v_before from app.responses where round_id = v_round;
    v_res := public.submit_response(v_tok,
      jsonb_build_array(jsonb_build_object('factor', v_f1, 'ordinal', 1, 'value', 3, 'na', true)), '[]'::jsonb, '{}'::jsonb);
    v_txt := coalesce(v_res->>'error', 'ok');
    v_res := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('answers', jsonb_build_array(jsonb_build_object('item', v_items[1], 'value', 3, 'na', true))));
    v_txt := v_txt || ',' || coalesce(v_res->>'error', 'ok');
    v_res := public.submit_response(v_tok,
      jsonb_build_array(jsonb_build_object('factor', v_f1, 'ordinal', 1, 'na', false)), '[]'::jsonb, '{}'::jsonb);
    v_txt := v_txt || ',' || coalesce(v_res->>'error', 'ok');
    select count(*) into v_after from app.responses where round_id = v_round;
    v_txt := v_txt || ',' || (v_after - v_before)
      || ',' || (select (responded_at is null)::text from app.invitations where round_id = v_round and employee_id = v_emp);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'not relevant beside a value is refused, core and module, consuming nothing',
      'expected', 'invalid_answer,question_not_in_round,invalid_answer,0,true', 'actual', v_txt,
      'pass', v_txt = 'invalid_answer,question_not_in_round,invalid_answer,0,true');

    -- 2 ---------------------------------------------------------------- in place of a value, as anon
    set local role anon;
    v_res := public.submit_response(v_tok,
      jsonb_build_array(jsonb_build_object('factor', v_f1, 'ordinal', 1, 'na', true),
                        jsonb_build_object('factor', v_f2, 'ordinal', 2, 'value', 4)),
      '[]'::jsonb,
      jsonb_build_object('answers', jsonb_build_array(jsonb_build_object('item', v_items[1], 'na', true),
                                                     jsonb_build_object('item', v_items[2], 'value', 5))));
    reset role;
    select concat_ws('|', v_res->>'ok', v_res->>'answers',
      (select count(*) from app.not_relevant_answers x join app.responses r on r.id = x.response_id
        where r.round_id = v_round and x.factor_key = v_f1 and x.ordinal = 1),
      (select count(*) from app.module_not_relevant_answers x where x.item_id = v_items[1]),
      (select count(*) from app.module_answers a where a.item_id = v_items[1]),
      (select count(*) from app.module_answers a where a.item_id = v_items[2]))
      into v_txt;
    -- the response just written is the round's newest: its core not-relevant row, and no answer beside it
    select v_txt || '|' || (select count(*) from app.answers a
                            where a.factor_key = v_f1 and a.ordinal = 1
                              and a.response_id in (select x.response_id from app.not_relevant_answers x
                                                    join app.responses r on r.id = x.response_id where r.round_id = v_round))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'anon marks one core and one module statement not relevant: own tables, no answer rows, not counted',
      'expected', 'true|2|1|1|0|1|0', 'actual', v_txt, 'pass', v_txt = 'true|2|1|1|0|1|0');

    -- 4 ---------------------------------------------------------------- append-only
    v_txt := '';
    begin
      update app.not_relevant_answers set ordinal = 2
      where response_id in (select r.id from app.responses r where r.round_id = v_round);
      v_txt := 'updated';
    exception when restrict_violation then v_txt := 'refused';
    end;
    begin
      delete from app.module_not_relevant_answers where item_id = v_items[1];
      v_txt := v_txt || ',deleted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'not-relevant rows cannot be changed or deleted while their response exists',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    -- 9 ---------------------------------------------------------------- one write path
    v_txt := (select count(*) from pg_proc where proname = 'submit_response')::text || ','
      || has_function_privilege('anon', 'public.submit_response(text,jsonb,jsonb,jsonb,jsonb)', 'execute')::text || ','
      || (select count(*) from jsonb_object_keys(v_res) k where k like '%id%');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'still one submit_response, anon may call it, and no id comes back',
      'expected', '1,true,0', 'actual', v_txt, 'pass', v_txt = '1,true,0');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 5 ---------------------------------------------------------------- the reader
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'anon may not execute results_not_relevant', 'expected', 'false',
    'actual', has_function_privilege('anon', 'public.results_not_relevant(uuid)', 'execute')::text,
    'pass', not has_function_privilege('anon', 'public.results_not_relevant(uuid)', 'execute'));

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Not Relevant Test AS', '999000444', 20);
    v_k := app.k_threshold(v_org);
    insert into app.groups (org_id, name) values (v_org, 'Alle') returning id into v_grp;
    insert into auth.users (id, email) values
      (v_dl, 'dl@na-test.example'), (v_vo, 'vo@na-test.example'), (v_al, 'al@na-test.example'), (v_out, 'out@na-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_vo, 'VO'), (v_al, 'AL'), (v_out, 'OUT');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_grp);
    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_org, 'grunnlinje', 2026, 'Probe');

    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_meas, 'lukket', '2026-09-01 08:00+02', '2026-09-08 20:00+02', '2026-09-08 20:00+02')
    returning id into v_closed;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', '2026-09-20 08:00+02', '2026-12-08 20:00+02')
    returning id into v_open;
    insert into app.round_factors (org_id, round_id, factor_key)
    select v_org, x.id, 'kontakt' from (values (v_closed), (v_open)) as x(id);

    -- ten responses: kontakt:2 gets 4 answers and 6 «ikke relevant» (6 ≥ k);
    -- kontakt:1 gets 8 answers and 2 «ikke relevant» (10 people, but 2 < k);
    -- kontakt:3 gets 2 answers and 1 «ikke relevant»
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, v_closed, v_grp, '2026-09-02 10:00+02' from generate_series(1, 10);
    insert into app.answers (response_id, factor_key, ordinal, value)
    select x.id, 'kontakt', 2, 4 from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x where x.n <= 4;
    insert into app.not_relevant_answers (response_id, factor_key, ordinal)
    select x.id, 'kontakt', 2 from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x where x.n > 4;
    insert into app.answers (response_id, factor_key, ordinal, value)
    select x.id, 'kontakt', 1, 3 from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x where x.n <= 8;
    insert into app.not_relevant_answers (response_id, factor_key, ordinal)
    select x.id, 'kontakt', 1 from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x where x.n > 8;
    insert into app.answers (response_id, factor_key, ordinal, value)
    select x.id, 'kontakt', 3, 2 from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x where x.n <= 2;
    insert into app.not_relevant_answers (response_id, factor_key, ordinal)
    select x.id, 'kontakt', 3 from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x where x.n = 3;

    -- 6 ------------------------------------------------------ what a daglig leder sees
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.results_not_relevant(v_closed);
    select string_agg(i->>'key' || ':' || (i->>'n') || '/' || (i->>'na'), ',' order by i->>'key')
      into v_txt from jsonb_array_elements(v_json->'items') i;
    v_txt := coalesce(v_txt, '-') || '|' || (v_json->>'threshold')::int::text;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'n and na where at least k marked it not relevant; nothing where fewer did, even with k answers',
      'expected', 'core:kontakt:2:4/6|' || v_k, 'actual', v_txt, 'pass', v_txt = 'core:kontakt:2:4/6|' || v_k);

    -- 8 ------------------------------------------------------ an open round
    v_json := public.results_not_relevant(v_open);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'an open round gives nothing',
      'expected', 'not_available', 'actual', coalesce(v_json->>'error', 'items'), 'pass', v_json->>'error' = 'not_available');

    -- 7 ------------------------------------------------------ who
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_txt := coalesce(public.results_not_relevant(v_closed)->>'error', 'ok');
    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    v_txt := v_txt || ',' || coalesce(public.results_not_relevant(v_closed)->>'error', 'ok');
    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    v_txt := v_txt || ',' || coalesce(public.results_not_relevant(v_closed)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'verneombud answered; avdelingsleder and a non-member refused alike',
      'expected', 'ok,not_available,not_available', 'actual', v_txt, 'pass', v_txt = 'ok,not_available,not_available');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 10 ----------------------------------------------------------------- nothing left
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_vo, v_al, v_out)
    union all select key from app.question_modules where key = 'probe-na'
    union all select i.id::text from app.invitations i where i.round_id = v_round and i.employee_id = v_emp and i.responded_at is not null
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._nri
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._nri order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._nri;
  if v_failed is not null then raise exception 'not-relevant invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'not-relevant invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._nri;
