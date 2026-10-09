-- markets_invariants.sql — the market an organisation is in, and its anonymity floor (0214, D-251).
--
-- A market may make anonymity stricter, never looser. What must hold:
--
--   * markets is readable by a signed-in client and writable by none (1)
--   * Norway is a market with today's values, and the default for every organisation (2)
--   * no market's floor goes under the platform's (3)
--   * the daglig leder may not set a threshold under the market's floor (4) and may set one above
--     it (5); they may not move the organisation to another market (6), the platform may (7)
--   * app.k_threshold floors at the market even where a row says less, so a round made there takes
--     the market's floor (8)
--   * a market's floor is never lowered (9); raising it lifts the organisations under it, logs the
--     change, carries the planned rounds and leaves an opened round's k alone (10, 11)
--   * create_organisation: four arguments give the call it always was (12); a market gives its
--     floor, language and time zone (13); an unknown market is refused and writes nothing (14);
--     p_market is last and defaults to 'no' (15)
--   * a market in use cannot be deleted (16)
--   * nothing written here survives (17)
--   * Sweden (0218): a market at floor 5, in Swedish, on Stockholm time, under its own number rule (18);
--     the rule takes a legal person's organisationsnummer and refuses a wrong check digit, a
--     personnummer, nine digits, and a Swedish number in Norway (19); a sign-up in Sweden gets
--     Sweden's floor, language and time zone, and a Norwegian number there is refused (20); no
--     organisation may hold a number its market's rule refuses, and the error never echoes it (21)
--
-- Built inside a block that is rolled back. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/markets_invariants.sql

create unlogged table if not exists public._mkt(seq int, name text, expected text, actual text, pass bool);
truncate public._mkt;

do $$
declare
  v_a    uuid := '00000000-0000-4000-8000-0000000a4b01';
  v_b    uuid := '00000000-0000-4000-8000-0000000a4b02';
  v_c    uuid := '00000000-0000-4000-8000-0000000a4b03';
  v_no   uuid := '00000000-0000-4000-8000-0000000a4b04';
  v_dl   uuid := '00000000-0000-4000-8000-0000000a4b05';
  v_u1   uuid := '00000000-0000-4000-8000-0000000a4b06';
  v_u2   uuid := '00000000-0000-4000-8000-0000000a4b07';
  v_u3   uuid := '00000000-0000-4000-8000-0000000a4b0a';
  v_meas uuid := '00000000-0000-4000-8000-0000000a4b08';
  v_rb   uuid; v_rp uuid; v_ro uuid;
  v_rows jsonb := '[]';
  v_txt  text;
  v_n    int;
  v_json jsonb;
begin
  -- 1 ------------------------------------------------------------------ who may touch markets
  select coalesce(string_agg(g.grantee || ':' || g.privilege_type, ',' order by g.grantee, g.privilege_type), 'none') into v_txt
  from information_schema.role_table_grants g
  where g.table_schema = 'app' and g.table_name = 'markets' and g.grantee in ('anon', 'authenticated', 'public');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'markets has RLS, one read policy, and a client may read it and write nothing',
    'expected', 'rls, select/authenticated, authenticated:SELECT', 'actual',
      (select case when c.relrowsecurity then 'rls' else 'NO RLS' end from pg_class c where c.oid = 'app.markets'::regclass) || ', '
      || (select coalesce(string_agg(p.cmd || '/' || array_to_string(p.roles, '+'), ','), 'none') from pg_policies p where p.schemaname = 'app' and p.tablename = 'markets')
      || ', ' || v_txt,
    'pass', (select c.relrowsecurity from pg_class c where c.oid = 'app.markets'::regclass)
            and (select string_agg(p.cmd || '/' || array_to_string(p.roles, '+'), ',') from pg_policies p where p.schemaname = 'app' and p.tablename = 'markets') = 'SELECT/authenticated'
            and v_txt = 'authenticated:SELECT');

  -- 2 ------------------------------------------------------------------ Norway, as it was
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'Norway is a market at the platform floor, in Norwegian, on Oslo time, and the default',
    'expected', '3,no,Europe/Oslo,''no''::text', 'actual',
      coalesce((select m.k_floor || ',' || m.default_lang || ',' || m.timezone from app.markets m where m.code = 'no'), 'MISSING') || ','
      || (select column_default from information_schema.columns where table_schema = 'app' and table_name = 'organizations' and column_name = 'market'),
    'pass', (select m.k_floor = app.k_floor() and m.default_lang = 'no' and m.timezone = 'Europe/Oslo' from app.markets m where m.code = 'no')
            and (select column_default from information_schema.columns where table_schema = 'app' and table_name = 'organizations' and column_name = 'market') = '''no''::text');

  begin
    -- 3 ---------------------------------------------------------------- never under the platform
    begin
      insert into app.markets (code, k_floor, default_lang, timezone) values ('zy', 2, 'en', 'Europe/London');
      v_txt := 'ACCEPTED';
    exception when check_violation then
      v_txt := 'check_violation';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a market whose floor is under app.k_floor() is refused',
      'expected', 'check_violation', 'actual', v_txt, 'pass', v_txt = 'check_violation');

    -- a stricter market, and organisations in it
    insert into app.markets (code, k_floor, default_lang, timezone) values ('zz', 5, 'en', 'Europe/London');
    insert into app.organizations (id, name, org_number, employee_count, market)
    values (v_a, 'Strengere AS', '999000214', 20, 'zz'),
           (v_b, 'Lavere Rad AS', '999000215', 20, 'zz'),
           (v_c, 'Planlagt AS', '999000216', 20, 'zz'),
           (v_no, 'Norge AS', '999000217', 20, 'no');
    insert into auth.users (id, email) values (v_dl, 'dl@markets-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL');
    insert into app.memberships (org_id, user_id, role) values (v_a, v_dl, 'daglig_leder');
    update app.organizations set threshold = 3 where id = v_no;

    -- 4 ---------------------------------------------------------------- not under the market
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    begin
      set local role authenticated;
      update app.organizations set threshold = 4 where id = v_a;
      reset role;
      v_txt := 'ACCEPTED';
    exception when check_violation then
      reset role;
      v_txt := 'check_violation';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the daglig leder may not set a threshold under the market''s floor',
      'expected', 'check_violation, still 5', 'actual', v_txt || ', still ' || (select threshold from app.organizations where id = v_a),
      'pass', v_txt = 'check_violation' and (select threshold from app.organizations where id = v_a) = 5);

    -- 5 ---------------------------------------------------------------- above it, as before
    set local role authenticated;
    with u as (update app.organizations set threshold = 6 where id = v_a returning id) select count(*) into v_n from u;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'and may set one above it',
      'expected', '1 row, k 6', 'actual', v_n || ' row, k ' || app.k_threshold(v_a),
      'pass', v_n = 1 and app.k_threshold(v_a) = 6);

    -- 6 ---------------------------------------------------------------- not the market
    begin
      set local role authenticated;
      update app.organizations set market = 'no' where id = v_a;
      reset role;
      v_txt := 'ACCEPTED';
    exception when insufficient_privilege then
      reset role;
      v_txt := 'insufficient_privilege';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the daglig leder may not move the organisation to a looser market',
      'expected', 'insufficient_privilege, still zz', 'actual', v_txt || ', still ' || (select market from app.organizations where id = v_a),
      'pass', v_txt = 'insufficient_privilege' and (select market from app.organizations where id = v_a) = 'zz');
    perform set_config('request.jwt.claims', '', true);

    -- 7 ---------------------------------------------------------------- the platform may
    update app.organizations set market = 'no' where id = v_a;
    v_txt := (select market from app.organizations where id = v_a);
    update app.organizations set market = 'zz' where id = v_a;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the platform (a migration, a definer function) may move it',
      'expected', 'no, then zz', 'actual', v_txt || ', then ' || (select market from app.organizations where id = v_a),
      'pass', v_txt = 'no' and (select market from app.organizations where id = v_a) = 'zz');

    -- 8 ---------------------------------------------------------------- the reader floors as well
    alter table app.organizations disable trigger organizations_market_rules;
    update app.organizations set threshold = 3 where id = v_b;
    alter table app.organizations enable trigger organizations_market_rules;
    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_b, 'grunnlinje', 2026, 'Probe');
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_b, v_meas, 'planlagt', '2026-11-01 08:00+01', '2026-11-08 20:00+01')
    returning id into v_rb;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a row that says 3 in a market whose floor is 5 reads as 5, and its round takes 5',
      'expected', '3, k 5, round 5', 'actual',
        (select threshold from app.organizations where id = v_b) || ', k ' || app.k_threshold(v_b) || ', round ' || (select k from app.rounds where id = v_rb),
      'pass', (select threshold from app.organizations where id = v_b) = 3 and app.k_threshold(v_b) = 5 and (select k from app.rounds where id = v_rb) = 5);
    update app.organizations set threshold = 5 where id = v_b;

    -- 9 ---------------------------------------------------------------- never lowered
    begin
      update app.markets set k_floor = 4 where code = 'zz';
      v_txt := 'ACCEPTED';
    exception when restrict_violation then
      v_txt := 'restrict_violation';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a market''s floor is never lowered',
      'expected', 'restrict_violation, still 5', 'actual', v_txt || ', still ' || (select k_floor from app.markets where code = 'zz'),
      'pass', v_txt = 'restrict_violation' and (select k_floor from app.markets where code = 'zz') = 5);

    -- 10, 11 ---------------------------------------------------------- raised: lifted, logged, carried
    insert into app.measurements (id, org_id, kind, year, label)
    values ('00000000-0000-4000-8000-0000000a4b09', v_c, 'grunnlinje', 2026, 'Probe C');
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_c, '00000000-0000-4000-8000-0000000a4b09', 'planlagt', '2026-11-01 08:00+01', '2026-11-08 20:00+01')
    returning id into v_rp;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_c, '00000000-0000-4000-8000-0000000a4b09', 'apen', '2026-10-01 08:00+02', '2026-10-20 20:00+02')
    returning id into v_ro;
    update app.markets set k_floor = 7 where code = 'zz';

    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'raising the floor lifts every organisation in the market under it, and only those',
      'expected', 'A 7, B 7, C 7, Norway 3', 'actual',
        'A ' || (select threshold from app.organizations where id = v_a) || ', B ' || (select threshold from app.organizations where id = v_b)
        || ', C ' || (select threshold from app.organizations where id = v_c) || ', Norway ' || (select threshold from app.organizations where id = v_no),
      'pass', (select threshold from app.organizations where id = v_a) = 7 and (select threshold from app.organizations where id = v_b) = 7
              and (select threshold from app.organizations where id = v_c) = 7 and (select threshold from app.organizations where id = v_no) = 3);

    select l.change->'threshold' into v_json from app.survey_defaults_log l
    where l.org_id = v_c and l.change ? 'threshold' order by l.id desc limit 1;
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'the lift is logged, the planned round follows it, the opened round keeps its k',
      'expected', '5 -> 7, planned 7, open 5', 'actual',
        coalesce(v_json->>'from', '?') || ' -> ' || coalesce(v_json->>'to', '?')
        || ', planned ' || (select k from app.rounds where id = v_rp) || ', open ' || (select k from app.rounds where id = v_ro),
      'pass', (v_json->>'from')::int = 5 and (v_json->>'to')::int = 7
              and (select k from app.rounds where id = v_rp) = 7 and (select k from app.rounds where id = v_ro) = 5);

    -- 12..14 ---------------------------------------------------------- sign-up names the market
    insert into auth.users (id, email) values (v_u1, 'u1@markets-test.example'), (v_u2, 'u2@markets-test.example');

    perform set_config('request.jwt.claims', json_build_object('sub', v_u1, 'role', 'authenticated')::text, true);
    v_json := public.create_organisation('Fire Argumenter AS', '999000218', 12, 'Fire');
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a four-argument sign-up is the one it always was: Norway, 5, Norwegian, Oslo',
      'expected', 'true, no, 5, no, Europe/Oslo', 'actual', coalesce(v_json->>'ok', v_json->>'error', 'none') || ', '
        || coalesce((select market || ', ' || threshold || ', ' || default_lang || ', ' || timezone from app.organizations where org_number = '999000218'), 'NOTHING'),
      'pass', (v_json->>'ok')::bool and (select market = 'no' and threshold = app.k_min() and default_lang = 'no' and timezone = 'Europe/Oslo'
                                         from app.organizations where org_number = '999000218'));

    perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
    v_json := public.create_organisation('Ukjent Marked AS', '999000219', 12, 'To', 'qq');
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'an unknown market is refused and nothing is written',
      'expected', 'invalid_market, 0', 'actual', coalesce(v_json->>'error', 'CREATED') || ', '
        || (select count(*) from app.organizations where org_number = '999000219') + (select count(*) from app.memberships where user_id = v_u2),
      'pass', v_json->>'error' = 'invalid_market'
              and (select count(*) from app.organizations where org_number = '999000219') + (select count(*) from app.memberships where user_id = v_u2) = 0);

    v_json := public.create_organisation('Strengt Marked AS', '999000219', 12, 'To', 'zz');
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'a market gives its floor (when above 5), its language and its time zone',
      'expected', 'true, zz, 7, en, Europe/London', 'actual', coalesce(v_json->>'ok', v_json->>'error', 'none') || ', '
        || coalesce((select market || ', ' || threshold || ', ' || default_lang || ', ' || timezone from app.organizations where org_number = '999000219'), 'NOTHING'),
      'pass', (v_json->>'ok')::bool and (select market = 'zz' and threshold = 7 and default_lang = 'en' and timezone = 'Europe/London'
                                         from app.organizations where org_number = '999000219'));
    perform set_config('request.jwt.claims', '', true);

    -- 15 ---------------------------------------------------------------- the signature
    select pg_get_function_arguments('public.create_organisation(text,text,integer,text,text)'::regprocedure) into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'p_market comes last and defaults to Norway, so a four-argument call still resolves',
      'expected', '… p_market text DEFAULT ''no''::text', 'actual', v_txt,
      'pass', v_txt ~ 'p_market text DEFAULT ''no''::text$'
              and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_organisation') = 1);

    -- 16 ---------------------------------------------------------------- a market in use stays
    begin
      delete from app.markets where code = 'zz';
      v_txt := 'DELETED';
    exception when foreign_key_violation then
      v_txt := 'foreign_key_violation';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'a market an organisation is in cannot be deleted',
      'expected', 'foreign_key_violation', 'actual', v_txt, 'pass', v_txt = 'foreign_key_violation');

    -- 18 --------------------------------------------------------------- Sweden
    v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'Sweden is a market at floor 5, in Swedish, on Stockholm time, under the se_legal_ten rule; Norway keeps nine digits',
      'expected', '5,sv,Europe/Stockholm,se_legal_ten; no nine_digits', 'actual',
        coalesce((select m.k_floor || ',' || m.default_lang || ',' || m.timezone || ',' || m.org_number_rule from app.markets m where m.code = 'se'), 'MISSING')
        || '; no ' || (select org_number_rule from app.markets where code = 'no'),
      'pass', (select m.k_floor = 5 and m.default_lang = 'sv' and m.timezone = 'Europe/Stockholm' and m.org_number_rule = 'se_legal_ten' from app.markets m where m.code = 'se')
              and (select org_number_rule from app.markets where code = 'no') = 'nine_digits');

    -- 19 --------------------------------------------------------------- the number rules
    v_txt := concat_ws(',',
      app.org_number_valid('se_legal_ten', '5560125790'),   -- Volvo AB, a real organisationsnummer
      app.org_number_valid('se_legal_ten', '2120000142'),   -- Skatteverket
      app.org_number_valid('se_legal_ten', '5560125791'),   -- wrong check digit
      app.org_number_valid('se_legal_ten', '8507091232'),   -- a personnummer: valid check digit, month 07
      app.org_number_valid('se_legal_ten', '556012579'),    -- nine digits
      app.org_number_valid('nine_digits', '999000214'),
      app.org_number_valid('nine_digits', '5560125790'),
      app.org_number_valid('nine_digits', '99900021a'),
      app.org_number_valid('unknown', '999000214'));
    v_rows := v_rows || jsonb_build_object('seq', 19, 'name', 'a legal person''s organisationsnummer passes; a wrong check digit, a personnummer and nine digits do not; Norway takes nine digits only',
      'expected', 't,t,f,f,f,t,f,f,f', 'actual', v_txt, 'pass', v_txt = 't,t,f,f,f,t,f,f,f');

    -- 20 --------------------------------------------------------------- a sign-up in Sweden
    insert into auth.users (id, email) values (v_u3, 'u3@markets-test.example');
    perform set_config('request.jwt.claims', json_build_object('sub', v_u3, 'role', 'authenticated')::text, true);
    v_json := public.create_organisation('Norskt Nummer AB', '999000220', 12, 'Tre', 'se');
    v_txt := coalesce(v_json->>'error', 'CREATED');
    v_json := public.create_organisation('Svenska Prov AB', '5566778899', 12, 'Tre', 'se');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 20, 'name', 'a sign-up in Sweden gets Sweden''s floor, language and time zone; a Norwegian number there is refused',
      'expected', 'invalid_org_number; true, se, 5, sv, Europe/Stockholm', 'actual', v_txt || '; ' || coalesce(v_json->>'ok', v_json->>'error', 'none') || ', '
        || coalesce((select market || ', ' || threshold || ', ' || default_lang || ', ' || timezone from app.organizations where org_number = '5566778899'), 'NOTHING'),
      'pass', v_txt = 'invalid_org_number' and (v_json->>'ok')::bool
              and (select market = 'se' and threshold = 5 and default_lang = 'sv' and timezone = 'Europe/Stockholm' from app.organizations where org_number = '5566778899'));

    -- 21 --------------------------------------------------------------- held on every write
    begin
      update app.organizations set org_number = '8024000005' where id = v_no;
      v_txt := 'ACCEPTED';
    exception when check_violation then
      get stacked diagnostics v_txt = message_text;
      v_txt := 'check_violation: ' || v_txt;
    end;
    begin
      insert into app.organizations (name, org_number, employee_count, market) values ('Personnummer AB', '8507091232', 3, 'se');
      v_txt := v_txt || '; ACCEPTED';
    exception when check_violation then
      v_txt := v_txt || '; check_violation';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 21, 'name', 'no organisation holds a number its market refuses, on insert or update, and the error does not echo the number',
      'expected', 'check_violation: organisation number not valid in market no; check_violation', 'actual', v_txt,
      'pass', v_txt = 'check_violation: organisation number not valid in market no; check_violation'
              and (select org_number from app.organizations where id = v_no) = '999000217');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 17 ------------------------------------------------------------------ nothing left
  select count(*) into v_n from (
    select code from app.markets where code in ('zz', 'zy')
    union all select id::text from app.organizations where org_number between '999000214' and '999000220' or org_number in ('5566778899', '8507091232')
    union all select id::text from auth.users where id in (v_dl, v_u1, v_u2, v_u3)
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._mkt
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._mkt order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._mkt;
  if v_failed is not null then
    raise exception 'markets invariants failed: %', v_failed;
  end if;
  if v_count <> 21 then
    raise exception 'markets invariants: expected 21 rows, got %', v_count;
  end if;
end $$;

drop table public._mkt;
