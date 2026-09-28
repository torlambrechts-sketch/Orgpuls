-- own_questions_invariants.sql — own questions, open answers and masking (0095, D-145), proved
-- against the live schema.
--
--   * app.org_question_answers is an answer table: RLS on, no policy, no client privilege (1)
--   * respond_form asks the round's own questions, with their kind (2)
--   * anon answers a «skala» and a «fritekst» one; both are written, no id comes back (3)
--   * an answer in the wrong shape, or to a question the round does not ask, is refused and
--     consumes nothing (4)
--   * the answers are append-only while their response and question exist (5)
--   * a question a round has asked keeps its words, and a client cannot delete it (6)
--   * anon may not call results_own_questions or open_answers (7)
--   * a daglig leder gets a «skala» question's n, mean and share at k answers, nothing below (8)
--   * open answers: the open field and «Fritekst», masked — names, departments, locations —
--     «per uke» left alone, «Per» masked (9)
--   * a verneombud gets the figures and not the texts (as with comments, 0022); avdelingsleder,
--     a non-member and an open round are refused (10)
--   * a round under k responses gives no open answers (11)
--   * conversations masks what the employee wrote, not what the leader wrote (12)
--   * the per-round cap is five, and the demo copy plan takes the answers (13)
--   * nothing written here survives (14)
--   * Måleoppsett's add and remove: trimmed, kind kept, capped, refused on an opened round, and
--     a removed question goes with its last round (15)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/own_questions_invariants.sql

create unlogged table if not exists public._oqi(seq int, name text, expected text, actual text, pass bool);
truncate public._oqi;

do $$
declare
  v_fix    uuid := '00000000-0000-4000-8000-000000000001';
  v_round  uuid;
  v_emp    uuid;
  v_tok    text;
  v_q1     uuid;
  v_q2     uuid;
  v_res    jsonb;
  v_txt    text;
  v_msg    text;
  v_before int;
  v_after  int;
  v_fixdl  uuid;
  -- the reader's own organisation
  v_org    uuid := '00000000-0000-4000-8000-00000000ac01';
  v_meas   uuid := '00000000-0000-4000-8000-00000000ac02';
  v_dl     uuid := '00000000-0000-4000-8000-0000000ac011';
  v_vo     uuid := '00000000-0000-4000-8000-0000000ac012';
  v_al     uuid := '00000000-0000-4000-8000-0000000ac013';
  v_out    uuid := '00000000-0000-4000-8000-0000000ac014';
  v_grp    uuid;
  v_closed uuid;
  v_small  uuid;
  v_open   uuid;
  v_s1     uuid;
  v_s2     uuid;
  v_f1     uuid;
  v_resp   uuid;
  v_thread uuid;
  v_k      int;
  v_json   jsonb;
  v_rows   jsonb := '[]';
  v_cnt    int;
  v_plan   uuid;
  v_new    uuid;
  v_i      int;
begin
  -- 1 ---------------------------------------------------------------- an answer table
  select concat_ws('|',
    (select c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname = 'org_question_answers'),
    (select count(*) from pg_policies where schemaname = 'app' and tablename = 'org_question_answers'),
    (select count(*) from information_schema.role_table_grants where table_schema = 'app'
      and table_name = 'org_question_answers' and grantee in ('anon', 'authenticated', 'PUBLIC')))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'org_question_answers: RLS on, no policy, no client privilege',
    'expected', 'true|0|0', 'actual', v_txt, 'pass', v_txt = 'true|0|0');

  select r.id into v_round from app.rounds r where r.status = 'apen' and r.org_id = v_fix order by r.opens_at desc limit 1;
  select e.id into v_emp from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_round and i.responded_at is null order by e.full_name limit 1;
  v_tok := 'fixture.' || v_round::text || '.' || v_emp::text;
  select m.user_id into v_fixdl from app.memberships m where m.org_id = v_fix and m.role = 'daglig_leder' and m.active limit 1;

  begin
    insert into app.org_questions (org_id, body, kind) values (v_fix, 'Fungerer det nye verktøyet?', 'skala') returning id into v_q1;
    insert into app.org_questions (org_id, body, kind, created_at)
    values (v_fix, 'Hva bør vi slutte med?', 'fritekst', now() + interval '1 second') returning id into v_q2;
    insert into app.round_org_questions (round_id, question_id) values (v_round, v_q1), (v_round, v_q2);

    -- 2 ---------------------------------------------------------------- the form asks them
    set local role anon;
    v_json := public.respond_form(v_tok);
    reset role;
    select string_agg((o->>'text') || ':' || (o->>'kind'), ',' order by n) into v_txt
    from jsonb_array_elements(v_json->'own') with ordinality x(o, n);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'respond_form returns the round''s own questions with their kind, in order',
      'expected', 'Fungerer det nye verktøyet?:skala,Hva bør vi slutte med?:fritekst', 'actual', coalesce(v_txt, '-'),
      'pass', v_txt = 'Fungerer det nye verktøyet?:skala,Hva bør vi slutte med?:fritekst');

    -- 4 ---------------------------------------------------------------- the wrong shape
    select count(*) into v_before from app.responses where round_id = v_round;
    v_txt := '';
    foreach v_res in array array[
      jsonb_build_array(jsonb_build_object('question', v_q1, 'text', 'tekst')),
      jsonb_build_array(jsonb_build_object('question', v_q2, 'value', 3)),
      jsonb_build_array(jsonb_build_object('question', v_q1, 'value', 6)),
      jsonb_build_array(jsonb_build_object('question', v_q2, 'text', '   ')),
      jsonb_build_array(jsonb_build_object('question', gen_random_uuid(), 'value', 3)),
      '{"question": 1}'::jsonb]
    loop
      v_txt := v_txt || coalesce(public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, v_res)->>'error', 'ok') || ',';
    end loop;
    select count(*) into v_after from app.responses where round_id = v_round;
    v_txt := v_txt || (v_after - v_before)
      || ',' || (select (responded_at is null)::text from app.invitations where round_id = v_round and employee_id = v_emp);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'wrong kind, out of range, blank, not in the round, not an array: refused, nothing consumed',
      'expected', repeat('question_not_in_round,', 6) || '0,true', 'actual', v_txt,
      'pass', v_txt = repeat('question_not_in_round,', 6) || '0,true');

    -- 3 ---------------------------------------------------------------- answered, as anon
    set local role anon;
    v_res := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('question', v_q1, 'value', 4),
                        jsonb_build_object('question', v_q2, 'text', '  Møtene på mandag  ')));
    reset role;
    select concat_ws('|', v_res->>'ok',
      (select count(*) from jsonb_object_keys(v_res) k where k like '%id%'),
      (select a.value::text from app.org_question_answers a where a.question_id = v_q1),
      (select a.free_text from app.org_question_answers a where a.question_id = v_q2))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'anon answers a skala and a fritekst question; written trimmed, no id returned',
      'expected', 'true|0|4|Møtene på mandag', 'actual', v_txt, 'pass', v_txt = 'true|0|4|Møtene på mandag');

    -- 5 ---------------------------------------------------------------- append-only
    begin
      update app.org_question_answers set value = 5 where question_id = v_q1;
      v_txt := 'updated';
    exception when restrict_violation then v_txt := 'refused';
    end;
    begin
      delete from app.org_question_answers where question_id = v_q2;
      v_txt := v_txt || ',deleted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'own answers cannot be changed or deleted while response and question exist',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    -- 6 ---------------------------------------------------------------- the question is fixed
    begin
      update app.org_questions set body = 'Noe annet' where id = v_q1;
      v_txt := 'updated';
    exception when restrict_violation then v_txt := 'refused';
    end;
    begin
      update app.org_questions set kind = 'fritekst' where id = v_q1;
      v_txt := v_txt || ',updated';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_fixdl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      delete from app.org_questions where id = v_q2;
      v_txt := v_txt || ',deleted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'an asked question keeps its words and kind; a daglig leder cannot delete it',
      'expected', 'refused,refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused,refused');

    -- 15 --------------------------------------------------------------- Måleoppsett's writes
    select r.id into v_plan from app.rounds r where r.org_id = v_fix and r.status = 'planlagt' order by r.opens_at limit 1;
    perform set_config('request.jwt.claims', json_build_object('sub', v_fixdl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_new := public.add_round_question(v_plan, '  Første  ', 'fritekst');
    for v_i in 2..5 loop
      perform public.add_round_question(v_plan, 'Spørsmål ' || v_i);
    end loop;
    v_txt := (select q.body || ':' || q.kind from app.org_questions q where q.id = v_new)
      || ',' || (select count(*) from app.round_org_questions where round_id = v_plan);
    begin
      perform public.add_round_question(v_plan, 'Det sjette');
      v_txt := v_txt || ',added';
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_txt := v_txt || case when v_msg like '%at most five%' then ',capped' else ',' || v_msg end;
    end;
    begin
      perform public.add_round_question(v_round, 'På en åpen runde');
      v_txt := v_txt || ',added';
    exception when restrict_violation then v_txt := v_txt || ',locked';
    end;
    perform public.remove_round_question(v_plan, v_new);
    v_txt := v_txt || ',' || (select count(*) from app.org_questions where id = v_new)
      || ',' || (select count(*) from app.round_org_questions where round_id = v_plan);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'a daglig leder adds (trimmed, with its kind) and removes; a sixth and an opened round are refused',
      'expected', 'Første:fritekst,5,capped,locked,0,4', 'actual', v_txt, 'pass', v_txt = 'Første:fritekst,5,capped,locked,0,4');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 7 ---------------------------------------------------------------- anon reads nothing
  v_txt := has_function_privilege('anon', 'public.results_own_questions(uuid)', 'execute')::text || ','
        || has_function_privilege('anon', 'public.open_answers(uuid)', 'execute')::text;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'anon may not execute results_own_questions or open_answers',
    'expected', 'false,false', 'actual', v_txt, 'pass', v_txt = 'false,false');

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Egne Spørsmål Test AS', '999000555', 20);
    v_k := app.k_threshold(v_org);
    insert into app.groups (org_id, name) values (v_org, 'Lager') returning id into v_grp;
    insert into app.locations (org_id, name) values (v_org, 'Bergen');
    insert into app.employees (org_id, group_id, full_name, email)
    values (v_org, v_grp, 'Øyvind Hansen', 'oyvind@oq-test.example'), (v_org, v_grp, 'Per Li', 'per@oq-test.example');
    insert into auth.users (id, email) values
      (v_dl, 'dl@oq-test.example'), (v_vo, 'vo@oq-test.example'), (v_al, 'al@oq-test.example'), (v_out, 'out@oq-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_vo, 'VO'), (v_al, 'AL'), (v_out, 'OUT');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_grp);
    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_org, 'grunnlinje', 2026, 'Probe');

    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_meas, 'lukket', '2026-09-01 08:00+02', '2026-09-08 20:00+02', '2026-09-08 20:00+02')
    returning id into v_closed;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_meas, 'lukket', '2026-06-01 08:00+02', '2026-06-08 20:00+02', '2026-06-08 20:00+02')
    returning id into v_small;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', '2026-09-20 08:00+02', '2026-12-08 20:00+02')
    returning id into v_open;
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_closed, 'kontakt');
    insert into app.round_extra_questions (org_id, round_id, extra_key) values (v_org, v_closed, 'apent_felt'), (v_org, v_small, 'apent_felt');

    insert into app.org_questions (org_id, body, kind) values (v_org, 'Vet du hva som ble besluttet?', 'skala') returning id into v_s1;
    insert into app.org_questions (org_id, body, kind, created_at)
    values (v_org, 'Har du sett endringer?', 'skala', now() + interval '1 second') returning id into v_s2;
    insert into app.org_questions (org_id, body, kind, created_at)
    values (v_org, 'Hva bør vi slutte med?', 'fritekst', now() + interval '2 seconds') returning id into v_f1;
    insert into app.round_org_questions (round_id, question_id) values (v_closed, v_s1), (v_closed, v_s2), (v_closed, v_f1);

    -- six responses in the closed round, two in the small one
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, v_closed, v_grp, '2026-09-02 10:00+02' from generate_series(1, 6);
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, v_small, v_grp, '2026-06-02 10:00+02' from generate_series(1, 2);
    -- s1: six answers 5,5,4,3,2,1 → mean 3.3, 3 of 6 high = 50 %; s2: three answers (< k)
    insert into app.org_question_answers (response_id, question_id, value)
    select x.id, v_s1, (array[5, 5, 4, 3, 2, 1])[x.n]
    from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x;
    insert into app.org_question_answers (response_id, question_id, value)
    select x.id, v_s2, 4
    from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x where x.n <= 3;
    insert into app.org_question_answers (response_id, question_id, free_text)
    select x.id, v_f1, 'Per og Øyvinds møter på Lager i Bergen, to per uke'
    from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x where x.n = 1;
    insert into app.extra_answers (response_id, extra_key, free_text)
    select x.id, 'apent_felt', 'Snakk med øyvind hansen om lageret'
    from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_closed) x where x.n = 2;
    insert into app.extra_answers (response_id, extra_key, free_text)
    select r.id, 'apent_felt', 'Liten runde' from app.responses r where r.round_id = v_small limit 1;

    -- 8 ------------------------------------------------------ own question results
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.results_own_questions(v_closed);
    select string_agg(concat_ws(':', i->>'text', coalesce(i->>'n', '-'), coalesce(i->>'mean', '-'),
                                coalesce(i->>'high', '-'), i->>'suppressed'), ',' order by n)
      into v_txt from jsonb_array_elements(v_json->'items') with ordinality x(i, n);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'skala results: n, mean and share at k answers; suppressed below; fritekst not here',
      'expected', 'Vet du hva som ble besluttet?:6:3.3:50:false,Har du sett endringer?:-:-:-:true',
      'actual', coalesce(v_txt, '-'),
      'pass', v_txt = 'Vet du hva som ble besluttet?:6:3.3:50:false,Har du sett endringer?:-:-:-:true');

    -- 9 ------------------------------------------------------ open answers, masked
    v_json := public.open_answers(v_closed);
    select string_agg((i->>'key') || '=' || (i->'answers')::text, ' ' order by n)
      into v_txt from jsonb_array_elements(v_json->'items') with ordinality x(i, n);
    v_txt := replace(v_txt, v_f1::text, 'F');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'open field and fritekst, masked: names, genitive, department, location; «per uke» kept',
      'expected', 'extra:apent_felt=["Snakk med ⟦n⟧ ⟦n⟧ om lageret"] own:F=["⟦n⟧ og ⟦n⟧ møter på ⟦a⟧ i ⟦s⟧, to per uke"]',
      'actual', coalesce(v_txt, '-'),
      'pass', v_txt = 'extra:apent_felt=["Snakk med ⟦n⟧ ⟦n⟧ om lageret"] own:F=["⟦n⟧ og ⟦n⟧ møter på ⟦a⟧ i ⟦s⟧, to per uke"]');

    -- 11 ----------------------------------------------------- under k responses
    v_json := public.open_answers(v_small);
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'a round under k responses gives no open answers',
      'expected', 'insufficient_data|false', 'actual', (v_json->>'status') || '|' || (v_json ? 'items')::text,
      'pass', v_json->>'status' = 'insufficient_data' and not v_json ? 'items');

    -- 12 ----------------------------------------------------- threads, masked
    select r.id into v_resp from app.responses r where r.round_id = v_closed order by r.id limit 1;
    insert into app.answers (response_id, factor_key, ordinal, value) values (v_resp, 'kontakt', 1, 2);
    insert into app.response_comments (response_id, factor_key, ordinal, body)
    values (v_resp, 'kontakt', 1, 'Per Li overser meg i Bergen');
    insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
    values (v_org, v_resp, 'kontakt', 1, extensions.digest('oq-probe', 'sha256'), '2026-09-02 10:00+02')
    returning id into v_thread;
    insert into app.thread_messages (thread_id, author, body, sent_hour) values
      (v_thread, 'leder', 'Hei, Per Li her', '2026-09-03 10:00+02'),
      (v_thread, 'ansatt', 'Øyvind vet det', '2026-09-04 10:00+02');
    v_json := public.conversations(v_closed);
    select concat_ws('|', t->>'opening', (select string_agg(m->>'body', '/' order by m->>'sent_hour') from jsonb_array_elements(t->'messages') m))
      into v_txt from jsonb_array_elements(v_json->'threads') t where (t->>'id')::uuid = v_thread;
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'conversations masks the employee''s opening and replies, not the leader''s',
      'expected', '⟦n⟧ ⟦n⟧ overser meg i ⟦s⟧|Hei, Per Li her/⟦n⟧ vet det', 'actual', coalesce(v_txt, '-'),
      'pass', v_txt = '⟦n⟧ ⟦n⟧ overser meg i ⟦s⟧|Hei, Per Li her/⟦n⟧ vet det');

    -- 10 ----------------------------------------------------- who
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_txt := coalesce(public.results_own_questions(v_closed)->>'error', 'ok') || '/' || coalesce(public.open_answers(v_closed)->>'error', 'ok');
    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    v_txt := v_txt || ',' || coalesce(public.results_own_questions(v_closed)->>'error', 'ok') || '/' || coalesce(public.open_answers(v_closed)->>'error', 'ok');
    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    v_txt := v_txt || ',' || coalesce(public.results_own_questions(v_closed)->>'error', 'ok') || '/' || coalesce(public.open_answers(v_closed)->>'error', 'ok');
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_txt := v_txt || ',' || coalesce(public.results_own_questions(v_open)->>'error', 'ok') || '/' || coalesce(public.open_answers(v_open)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'verneombud gets figures, not texts; avdelingsleder, a non-member and an open round refused',
      'expected', 'ok/not_available,not_available/not_available,not_available/not_available,not_available/not_available', 'actual', v_txt,
      'pass', v_txt = 'ok/not_available,not_available/not_available,not_available/not_available,not_available/not_available');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 13 ----------------------------------------------------------------- cap and copy plan
  v_txt := (select count(*) from pg_trigger where tgname = 'round_org_questions_cap')::text || ','
        || (select count(*) from pg_trigger where tgname = 'org_questions_cap')::text || ','
        || coalesce((select mode || ':' || via from app.demo_copy_plan where table_name = 'org_question_answers'), '-');
  v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'the cap is on the round, not the bank; the demo copy takes the answers',
    'expected', '1,0,copy:response_id', 'actual', v_txt, 'pass', v_txt = '1,0,copy:response_id');

  -- 14 ----------------------------------------------------------------- nothing left
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_vo, v_al, v_out)
    union all select id::text from app.org_questions where org_id = v_fix and body in ('Fungerer det nye verktøyet?', 'Hva bør vi slutte med?')
    union all select i.id::text from app.invitations i where i.round_id = v_round and i.employee_id = v_emp and i.responded_at is not null
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._oqi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._oqi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._oqi;
  if v_failed is not null then raise exception 'own-question invariants failed: %', v_failed; end if;
  if v_count <> 15 then raise exception 'own-question invariants: expected 15 rows, got %', v_count; end if;
end $$;

drop table public._oqi;
