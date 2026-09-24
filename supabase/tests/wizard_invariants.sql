-- wizard_invariants.sql — what the Veiviser writes through (0041), proved against the live schema.
--
--   * anon may not plan a round; setup_progress has RLS, a read and two write policies,
--     all to authenticated, and no delete (1, 2)
--   * a daglig leder saves their own progress; a verneombud of the same organisation and a
--     leader of another cannot, and the other cannot read it (3, 4, 5)
--   * plan_first_round refuses a verneombud, a weekend, too soon, too far, and an
--     organisation with nobody to invite (6..10)
--   * otherwise it plans one grunnlinje at 09:00 on the day, in the organisation's zone,
--     with every factor and the four questions outside the index, a reminder on day four
--     and a close on day seven, and switches the wheel on (11, 12)
--   * pressed again it moves that round rather than adding one (13)
--   * the wheel then plans no twin in the same month, no grunnlinje within six months
--     after it, and no puls while no measure is open (14, 15, 16)
--   * "Hvert halvår" is one puls six months after the baseline, and July's pause holds (17)
--   * once the organisation has measured, it is refused (18)
--   * nothing written here survives (19)
--
-- Makes an organisation of its own and rolls it back. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/wizard_invariants.sql

create unlogged table if not exists public._wz(seq int, name text, expected text, actual text, pass bool);
truncate public._wz;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-0000000e4101';
  v_other  uuid := '00000000-0000-4000-8000-0000000e4102';
  v_dl     uuid := '00000000-0000-4000-8000-0000000e4111';
  v_vo     uuid := '00000000-0000-4000-8000-0000000e4112';
  v_od     uuid := '00000000-0000-4000-8000-0000000e4113';
  v_rows   jsonb := '[]';
  v_json   jsonb;
  v_today  date := (now() at time zone 'Europe/Oslo')::date;
  v_first  date;   -- the first Tuesday of next month
  v_day    date;   -- the second: a chosen day that is not the wheel's own
  v_later  date;
  v_round  uuid;
  v_n      int;
  v_txt    text;
  v_msg    text;
  v_ok     boolean;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may not execute plan_first_round', 'expected', 'false',
    'actual', has_function_privilege('anon', 'public.plan_first_round(uuid, date)', 'execute')::text,
    'pass', not has_function_privilege('anon', 'public.plan_first_round(uuid, date)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'setup_progress: RLS, select/insert/update to authenticated, no delete',
    'expected', 'rls, INSERT,SELECT,UPDATE, all authenticated, no delete, anon none',
    'actual', (select relrowsecurity::text from pg_class where oid = 'app.setup_progress'::regclass) || ', '
      || (select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'app' and tablename = 'setup_progress') || ', '
      || case when (select bool_and(roles = '{authenticated}') from pg_policies where schemaname = 'app' and tablename = 'setup_progress')
              then 'all authenticated' else 'ROLE MISSING' end || ', '
      || case when has_table_privilege('authenticated', 'app.setup_progress', 'delete') then 'DELETABLE' else 'no delete' end || ', '
      || case when has_table_privilege('anon', 'app.setup_progress', 'select,insert,update,delete') then 'ANON' else 'anon none' end,
    'pass', (select relrowsecurity from pg_class where oid = 'app.setup_progress'::regclass)
      and (select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'app' and tablename = 'setup_progress') = 'INSERT,SELECT,UPDATE'
      and (select bool_and(roles = '{authenticated}') from pg_policies where schemaname = 'app' and tablename = 'setup_progress')
      and not has_table_privilege('authenticated', 'app.setup_progress', 'delete')
      and not has_table_privilege('anon', 'app.setup_progress', 'select,insert,update,delete'));

  v_first := date_trunc('month', v_today + interval '1 month')::date;
  v_first := v_first + ((9 - extract(isodow from v_first)::int) % 7);
  v_day := v_first + 7;
  v_later := v_day + 7;

  begin
    insert into app.organizations (id, name, org_number, employee_count) values
      (v_org, 'Veiviser AS', '999999910', 12), (v_other, 'Annen AS', '999999911', 3);
    insert into auth.users (id, email) values
      (v_dl, 'dl@wz-test.example'), (v_vo, 'vo@wz-test.example'), (v_od, 'od@wz-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_vo, 'VO'), (v_od, 'OD');
    insert into app.memberships (org_id, user_id, role) values
      (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud'), (v_other, v_od, 'daglig_leder');
    insert into app.year_wheels (org_id, baseline_month) values (v_org, extract(month from v_day)::int);

    -- 3, 4, 5 --------------------------------------------------------------- progress
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into app.setup_progress (org_id, step) values (v_org, 3);
    update app.setup_progress set step = 4 where org_id = v_org;
    reset role;
    select step::text into v_txt from app.setup_progress where org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a daglig leder saves and moves their own progress',
      'expected', '4', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = '4');

    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    with touched as (update app.setup_progress set step = 8 where org_id = v_org returning 1)
    select count(*) into v_n from touched;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a verneombud of the same organisation cannot move it',
      'expected', '0 rows, step 4', 'actual', v_n || ' rows, step ' || (select step from app.setup_progress where org_id = v_org),
      'pass', v_n = 0 and (select step from app.setup_progress where org_id = v_org) = 4);

    perform set_config('request.jwt.claims', json_build_object('sub', v_od, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from app.setup_progress where org_id = v_org;
    begin
      insert into app.setup_progress (org_id, step) values (v_org, 8)
      on conflict (org_id) do update set step = 8;
      v_msg := 'ACCEPTED';
    exception when others then
      v_msg := 'rejected';
    end;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'another organisation''s leader can neither read nor write it',
      'expected', '0 read, rejected, step 4',
      'actual', v_n || ' read, ' || v_msg || ', step ' || (select step from app.setup_progress where org_id = v_org),
      'pass', v_n = 0 and v_msg = 'rejected' and (select step from app.setup_progress where org_id = v_org) = 4);

    -- 6..10 ----------------------------------------------------------------- refusals
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_json := public.plan_first_round(v_org, v_day);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a verneombud is refused', 'expected', 'not_available',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'not_available');

    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.plan_first_round(v_org, v_day + 4);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a Saturday is refused', 'expected', 'weekend',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'weekend');
    -- today, or the Monday after a weekend: a weekday less than three days ahead
    v_json := public.plan_first_round(v_org, v_today + case extract(isodow from v_today)::int when 6 then 2 when 7 then 1 else 0 end);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'less than three days ahead is refused', 'expected', 'too_soon',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'too_soon');
    v_json := public.plan_first_round(v_org, v_first + 140);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'more than 120 days ahead is refused', 'expected', 'too_far',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'too_far');
    v_json := public.plan_first_round(v_org, v_day);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'with nobody to invite it is refused, and nothing written',
      'expected', 'no_employees, 0 rounds',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || (select count(*) from app.rounds where org_id = v_org) || ' rounds',
      'pass', v_json->>'error' = 'no_employees' and not exists (select 1 from app.rounds where org_id = v_org));

    -- 11, 12 ------------------------------------------------------------------- plans
    insert into app.employees (org_id, full_name, email)
    select v_org, 'Ansatt ' || i, 'a' || i || '@wz-test.example' from generate_series(1, 6) i;
    v_json := public.plan_first_round(v_org, v_day);
    v_round := (v_json->>'round_id')::uuid;
    select r.status || ' ' || m.kind || ' ' || to_char(r.opens_at at time zone 'Europe/Oslo', 'YYYY-MM-DD HH24:MI')
           || ' r' || r.reminder_day || ' c' || r.close_after_days
           || ' f' || (select count(*) from app.round_factors rf where rf.round_id = r.id)
           || ' x' || (select count(*) from app.round_extra_questions q where q.round_id = r.id)
      into v_txt
    from app.rounds r join app.measurements m on m.id = r.measurement_id where r.id = v_round;
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'one planned grunnlinje: 09:00 on the day, the whole instrument, day 4 and day 7',
      'expected', 'planlagt grunnlinje ' || to_char(v_day, 'YYYY-MM-DD') || ' 09:00 r4 c7 f'
        || (select count(*) from app.factors) || ' x' || (select count(*) from app.extra_questions),
      'actual', coalesce(v_txt, coalesce(v_json->>'error', 'none')),
      'pass', v_txt = 'planlagt grunnlinje ' || to_char(v_day, 'YYYY-MM-DD') || ' 09:00 r4 c7 f'
        || (select count(*) from app.factors) || ' x' || (select count(*) from app.extra_questions));
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'and the wheel is on', 'expected', 'true',
      'actual', (select active::text from app.year_wheels where org_id = v_org),
      'pass', (select active from app.year_wheels where org_id = v_org));

    -- 13 ------------------------------------------------------------------ pressed again
    v_json := public.plan_first_round(v_org, v_later);
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'pressed again, it moves the same round',
      'expected', '1 round, same id, ' || to_char(v_later, 'YYYY-MM-DD'),
      'actual', (select count(*) from app.rounds where org_id = v_org) || ' round, '
        || case when (v_json->>'round_id')::uuid = v_round then 'same id' else 'NEW ID' end || ', '
        || (select to_char(opens_at at time zone 'Europe/Oslo', 'YYYY-MM-DD') from app.rounds where id = v_round),
      'pass', (select count(*) from app.rounds where org_id = v_org) = 1 and (v_json->>'round_id')::uuid = v_round
        and (select (opens_at at time zone 'Europe/Oslo')::date from app.rounds where id = v_round) = v_later);

    -- 14, 15, 16 ------------------------------------------------------------ the wheel
    perform set_config('request.jwt.claims', '', true);
    perform app.wheel_tick();
    select count(*) into v_n from app.rounds r join app.measurements m on m.id = r.measurement_id
    where r.org_id = v_org and m.kind = 'grunnlinje'
      and date_trunc('month', r.opens_at at time zone 'Europe/Oslo') = date_trunc('month', v_later::timestamp);
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'the wheel plans no twin in the month it already holds',
      'expected', '1', 'actual', v_n::text, 'pass', v_n = 1);

    update app.year_wheels set baseline_month = extract(month from v_later + interval '2 months')::int where org_id = v_org;
    perform app.wheel_tick();
    select count(*) into v_n from app.rounds r join app.measurements m on m.id = r.measurement_id
    where r.org_id = v_org and m.kind = 'grunnlinje';
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'nor a grunnlinje within six months after it',
      'expected', '1 grunnlinje', 'actual', v_n || ' grunnlinje', 'pass', v_n = 1);

    select count(*) into v_n from app.rounds r join app.measurements m on m.id = r.measurement_id
    where r.org_id = v_org and m.kind = 'puls';
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'nor a puls while no measure is open', 'expected', '0 puls',
      'actual', v_n || ' puls', 'pass', v_n = 0);

    -- 17 ------------------------------------------------------------------ half-yearly
    select string_agg(month || ':' || kind, ',' order by kind, month) into v_txt
    from app.wheel_months('halvarspuls', 9, true);
    select string_agg(month || ':' || kind, ',' order by kind, month) into v_msg
    from app.wheel_months('halvarspuls', 1, true);
    v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'Hvert halvår: one puls six months on, and July stays empty',
      'expected', '9:grunnlinje,3:puls | 1:grunnlinje', 'actual', v_txt || ' | ' || v_msg,
      'pass', v_txt = '9:grunnlinje,3:puls' and v_msg = '1:grunnlinje');

    -- 18 -------------------------------------------------------------- after measuring
    update app.rounds set status = 'apen', opens_at = now() - interval '1 hour', closes_at = now() + interval '6 days'
    where id = v_round;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.plan_first_round(v_org, v_later + 7);
    v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'once it has measured, the wheel plans and this is refused',
      'expected', 'already_measured', 'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'already_measured');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 19, 'name', 'every probe row was rolled back', 'expected', '0 orgs, 0 users',
    'actual', (select count(*) from app.organizations where id in (v_org, v_other)) || ' orgs, '
      || (select count(*) from auth.users where id in (v_dl, v_vo, v_od)) || ' users',
    'pass', not exists (select 1 from app.organizations where id in (v_org, v_other))
      and not exists (select 1 from auth.users where id in (v_dl, v_vo, v_od)));

  insert into public._wz
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._wz order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._wz;
  if v_failed is not null then
    raise exception 'wizard invariants failed: %', v_failed;
  end if;
  if v_count <> 19 then
    raise exception 'wizard invariants: expected 19 rows, got %', v_count;
  end if;
end $$;

drop table public._wz;
