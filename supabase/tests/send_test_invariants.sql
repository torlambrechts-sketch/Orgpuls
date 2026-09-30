-- send_test_invariants.sql — «Send test til meg» and the ready-to-send check (0127, D-171), proved
-- against the live schema.
--
--   * send_tests: RLS on, no policy, no client privilege; the claim and done functions are the
--     service role's alone, and the round_preview_json builder no client's (1)
--   * a test goes only to the caller's own address, from the daglig leder only; the verneombud,
--     an avdelingsleder, another organisation's leader and anon are refused (2)
--   * a closed round, mail turned off, and a sixth test within the hour are refused (3)
--   * the claim carries the invitation's facts and the address, and no token; done marks it sent,
--     or failed with a code and never free text (4)
--   * round_send_preview still refuses a non-member and answers a member as before (5)
--   * round_ready counts the audience the opening invites: e-mail, phone only, neither; names the
--     invited groups too small for any figure; reads the two consultations and the caller's last
--     test; the daglig leder's only (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/send_test_invariants.sql

create unlogged table if not exists public._stt(seq int, name text, expected text, actual text, pass bool);
truncate public._stt;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f271';
  v_org2  uuid := '00000000-0000-4000-8000-00000000f272';
  v_dl    uuid := '00000000-0000-4000-8000-0000000f2711';
  v_vo    uuid := '00000000-0000-4000-8000-0000000f2712';
  v_al    uuid := '00000000-0000-4000-8000-0000000f2713';
  v_dl2   uuid := '00000000-0000-4000-8000-0000000f2714';
  v_big   uuid;
  v_small uuid;
  v_meas  uuid;
  v_round uuid;
  v_closed uuid;
  v_json  jsonb;
  v_txt   text;
  v_rows  jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated"}';

  -- a call's result, or the SQLSTATE it was refused with
  function_state text;
begin
  -- 1 ---------------------------------------------------------------- the table and the grants
  select concat_ws('|',
    (select c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname = 'send_tests'),
    (select count(*) from pg_policies where schemaname = 'app' and tablename = 'send_tests'),
    (select count(*) from information_schema.role_table_grants
      where table_schema = 'app' and table_name = 'send_tests' and grantee in ('anon', 'authenticated')),
    has_function_privilege('authenticated', 'public.dispatch_test_claim(int)', 'execute'),
    has_function_privilege('authenticated', 'public.dispatch_test_done(uuid, boolean, text)', 'execute'),
    has_function_privilege('service_role', 'public.dispatch_test_claim(int)', 'execute'),
    has_function_privilege('authenticated', 'app.round_preview_json(uuid)', 'execute'),
    has_function_privilege('anon', 'public.send_test_invitation(uuid)', 'execute'),
    has_function_privilege('anon', 'public.round_ready(uuid)', 'execute'))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'send_tests: RLS on, no policy, no client grant; claim and done the service role''s',
    'expected', 'true|0|0|f|f|t|f|f|f', 'actual', v_txt, 'pass', v_txt = 'true|0|0|f|f|t|f|f|f');

  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled)
    values (v_org, 'Testsending AS', '999000271', 9, true), (v_org2, 'Annen AS', '999000272', 3, true);
    insert into auth.users (id, email) values
      (v_dl, 'Leder@STT-probe.no'), (v_vo, 'vo@stt-probe.no'), (v_al, 'al@stt-probe.no'), (v_dl2, 'dl2@stt-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina Leder'), (v_vo, 'Vera'), (v_al, 'Arne'), (v_dl2, 'Dag');
    insert into app.groups (org_id, name) values (v_org, 'Stor') returning id into v_big;
    insert into app.groups (org_id, name) values (v_org, 'Liten') returning id into v_small;
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud'),
      (v_org2, v_dl2, 'daglig_leder');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_big);
    -- Stor: four by e-mail, one by phone only, one with neither, one inactive; Liten: two by e-mail
    insert into app.employees (org_id, group_id, full_name, email, phone, active) values
      (v_org, v_big, 'A', 'a@stt-probe.no', null, true), (v_org, v_big, 'B', 'b@stt-probe.no', null, true),
      (v_org, v_big, 'C', 'c@stt-probe.no', null, true), (v_org, v_big, 'D', 'd@stt-probe.no', '+4790000001', true),
      (v_org, v_big, 'E', null, '+4790000002', true), (v_org, v_big, 'F', null, null, true),
      (v_org, v_big, 'G', 'g@stt-probe.no', null, false),
      (v_org, v_small, 'H', 'h@stt-probe.no', null, true), (v_org, v_small, 'I', 'i@stt-probe.no', null, true);
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2027, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', now() + interval '20 days', now() + interval '34 days') returning id into v_round;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'lukket', now() - interval '40 days', now() - interval '26 days') returning id into v_closed;

    -- 2 -------------------------------------------------------------- who may send one
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_json := public.send_test_invitation(v_round);
    v_txt := concat_ws(',', v_json->>'ok', v_json->>'to');
    foreach function_state in array array[v_vo::text, v_al::text, v_dl2::text] loop
      perform set_config('request.jwt.claims', format(claims, function_state), true);
      begin
        perform public.send_test_invitation(v_round);
        v_txt := v_txt || ',allowed';
      exception when insufficient_privilege then v_txt := v_txt || ',42501';
      end;
    end loop;
    v_txt := v_txt || ',' || (select count(*) from app.send_tests where round_id = v_round)
                   || ',' || (select string_agg(to_email || ':' || status, ';') from app.send_tests where round_id = v_round);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the daglig leder''s test goes to their own address; the others are refused',
      'expected', 'true,leder@stt-probe.no,42501,42501,42501,1,leder@stt-probe.no:pending', 'actual', v_txt,
      'pass', v_txt = 'true,leder@stt-probe.no,42501,42501,42501,1,leder@stt-probe.no:pending');

    -- 3 -------------------------------------------------------------- closed, mail off, the hour's limit
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := public.send_test_invitation(v_closed)->>'error';
    update app.organizations set mail_enabled = false where id = v_org;
    v_txt := v_txt || ',' || (public.send_test_invitation(v_round)->>'error');
    update app.organizations set mail_enabled = true where id = v_org;
    perform public.send_test_invitation(v_round) from generate_series(1, 4);
    v_txt := v_txt || ',' || (public.send_test_invitation(v_round)->>'error')
                   || ',' || (select count(*) from app.send_tests where user_id = v_dl);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a closed round, mail off and a sixth test in the hour are refused',
      'expected', 'closed,mail_off,rate_limited,5', 'actual', v_txt, 'pass', v_txt = 'closed,mail_off,rate_limited,5');

    -- 4 -------------------------------------------------------------- claim and done
    delete from app.send_tests where user_id = v_dl and id <> (select id from app.send_tests where user_id = v_dl order by created_at limit 1);
    -- other organisations' waiting tests are not this probe's to claim: only this one is counted
    v_json := (select e from jsonb_array_elements(public.dispatch_test_claim(50)) e where (e->>'round_id')::uuid = v_round);
    v_txt := concat_ws(',',
      v_json->>'to', v_json->>'name', v_json->'preview'->>'org', v_json->'preview'->'round'->>'kind',
      (v_json ? 'token')::text, (v_json->'preview' ? 'token')::text,
      (select status from app.send_tests where id = (v_json->>'id')::uuid));
    perform public.dispatch_test_done((v_json->>'id')::uuid, false, 'HTTP 500: Something about a@b.no');
    v_txt := v_txt || ',' || (select status || ':' || coalesce(error, '-') from app.send_tests where id = (v_json->>'id')::uuid);
    update app.send_tests set status = 'sending' where id = (v_json->>'id')::uuid;
    perform public.dispatch_test_done((v_json->>'id')::uuid, true, null);
    v_txt := v_txt || ',' || (select status || ':' || (sent_at is not null)::text || ':' || coalesce(error, '-') from app.send_tests where id = (v_json->>'id')::uuid);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the claim carries the facts and the address, no token; done records a code, never text',
      'expected', 'leder@stt-probe.no,Dina Leder,Testsending AS,grunnlinje,false,false,sending,failed:http,sent:true:-', 'actual', v_txt,
      'pass', v_txt = 'leder@stt-probe.no,Dina Leder,Testsending AS,grunnlinje,false,false,sending,failed:http,sent:true:-');

    -- 5 -------------------------------------------------------------- the preview as before
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    v_txt := public.round_send_preview(v_round)->>'org';
    perform set_config('request.jwt.claims', format(claims, v_dl2), true);
    begin
      perform public.round_send_preview(v_round);
      v_txt := v_txt || ',allowed';
    exception when insufficient_privilege then v_txt := v_txt || ',42501';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'round_send_preview: a member reads it, another organisation''s leader is refused',
      'expected', 'Testsending AS,42501', 'actual', v_txt, 'pass', v_txt = 'Testsending AS,42501');

    -- 6 -------------------------------------------------------------- ready to send
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_json := public.round_ready(v_round);
    v_txt := concat_ws(',', v_json->>'audience', v_json->>'email', v_json->>'phone_only', v_json->>'neither',
      v_json->>'small_groups', v_json->'consultations'->>'verneombud_raad', v_json->'test'->>'status');
    -- only Stor invited, both consultations confirmed
    insert into app.round_groups (round_id, group_id) values (v_round, v_big);
    insert into app.round_consultations (round_id, kind, confirmed) values
      (v_round, 'verneombud_raad', true), (v_round, 'droftet_tillitsvalgte', true);
    v_json := public.round_ready(v_round);
    v_txt := v_txt || '|' || concat_ws(',', v_json->>'audience', v_json->>'email', v_json->>'small_groups',
      v_json->'consultations'->>'verneombud_raad', v_json->'consultations'->>'droftet_tillitsvalgte');
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    begin
      perform public.round_ready(v_round);
      v_txt := v_txt || '|allowed';
    exception when insufficient_privilege then v_txt := v_txt || '|42501';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'round_ready counts the invited audience by channel, names small groups, reads consultations and the test',
      'expected', '8,6,1,1,["Liten"],false,sent|6,4,[],true,true|42501', 'actual', v_txt,
      'pass', v_txt = '8,6,1,1,["Liten"],false,sent|6,4,[],true,true|42501');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 7 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email ilike '%@stt-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_org2)
    union all select id::text from app.send_tests where user_id in (v_dl, v_vo, v_al, v_dl2)) x;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._stt
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._stt order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._stt;
  if v_failed is not null then raise exception 'send test invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'send test invariants: expected 7 rows, got %', v_count; end if;
end $$;
