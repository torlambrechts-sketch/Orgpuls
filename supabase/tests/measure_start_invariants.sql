-- measure_start_invariants.sql — a measure's start date (0131, D-173), proved against the live schema.
--
--   * starts_on is a nullable date with the order check; it rides the measures' existing policies:
--     four of them, a table-level grant, update for authenticated and nothing for anon (1)
--   * a start after the deadline is refused, on either date's change; the same day, and a start
--     with no deadline, are kept (2)
--   * the daglig leder and the avdelingsleder set it and get their row back (3)
--   * the verneombud reads it and cannot set it: zero rows, the value unchanged (4)
--   * another organisation's daglig leder neither reads nor sets it (5)
--   * the step log does not take a start date for a step, and a deleted round still sets its
--     measure's round_id null with the start date kept (referential maintenance) (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/measure_start_invariants.sql

create unlogged table if not exists public._msi(seq int, name text, expected text, actual text, pass bool);
truncate public._msi;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f311';
  v_org2  uuid := '00000000-0000-4000-8000-00000000f312';
  v_dl    uuid := '00000000-0000-4000-8000-0000000f3111';
  v_al    uuid := '00000000-0000-4000-8000-0000000f3112';
  v_vo    uuid := '00000000-0000-4000-8000-0000000f3113';
  v_dl2   uuid := '00000000-0000-4000-8000-0000000f3114';
  v_group uuid;
  v_meas  uuid;
  v_round uuid;
  v_m     uuid;
  v_m2    uuid;
  v_n     int;
  v_steps int;
  v_txt   text;
  v_rows  jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated"}';
begin
  -- 1 ---------------------------------------------------------------- the column and its posture
  select concat_ws('|',
    (select data_type || ':' || is_nullable from information_schema.columns
      where table_schema = 'app' and table_name = 'measures' and column_name = 'starts_on'),
    (select count(*) from pg_constraint
      where conrelid = 'app.measures'::regclass and conname = 'measures_starts_before_due' and contype = 'c'),
    (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'app' and tablename = 'measures'),
    has_column_privilege('authenticated', 'app.measures', 'starts_on', 'UPDATE'),
    has_column_privilege('anon', 'app.measures', 'starts_on', 'SELECT'))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'starts_on: a nullable date with its check, on the measures'' own four policies',
    'expected', 'date:YES|1|measure_read,measure_write_delete,measure_write_insert,measure_write_update|t|f',
    'actual', v_txt,
    'pass', v_txt = 'date:YES|1|measure_read,measure_write_delete,measure_write_insert,measure_write_update|t|f');

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Oppstart AS', '999000311', 9), (v_org2, 'Annen Oppstart AS', '999000312', 3);
    insert into auth.users (id, email) values
      (v_dl, 'dl@msi-probe.no'), (v_al, 'al@msi-probe.no'), (v_vo, 'vo@msi-probe.no'), (v_dl2, 'dl2@msi-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina'), (v_al, 'Arne'), (v_vo, 'Vera'), (v_dl2, 'Dag');
    insert into app.groups (org_id, name) values (v_org, 'Lager') returning id into v_group;
    insert into app.memberships (org_id, user_id, role) values
      (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud'), (v_org2, v_dl2, 'daglig_leder');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_group);
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2027, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'lukket', now() - interval '40 days', now() - interval '26 days') returning id into v_round;
    insert into app.measures (org_id, factor_key, round_id, title, step, due_date)
    values (v_org, (select key from app.factors order by key limit 1), v_round, 'Probe-tiltak', 'besluttet', date '2027-03-31')
    returning id into v_m;

    -- 2 -------------------------------------------------------------- the order
    v_txt := '';
    begin
      update app.measures set starts_on = date '2027-04-01' where id = v_m;
      v_txt := 'allowed';
    exception when check_violation then v_txt := '23514';
    end;
    update app.measures set starts_on = date '2027-03-31' where id = v_m;
    v_txt := v_txt || ',' || (select starts_on::text from app.measures where id = v_m);
    begin
      update app.measures set due_date = date '2027-03-30' where id = v_m;
      v_txt := v_txt || ',allowed';
    exception when check_violation then v_txt := v_txt || ',23514';
    end;
    insert into app.measures (org_id, factor_key, title, starts_on)
    values (v_org, (select key from app.factors order by key limit 1), 'Uten frist', date '2027-05-01') returning id into v_m2;
    v_txt := v_txt || ',' || (select coalesce(due_date::text, '-') || ':' || starts_on::text from app.measures where id = v_m2);
    begin
      insert into app.measures (org_id, factor_key, title, starts_on, due_date)
      values (v_org, (select key from app.factors order by key limit 1), 'Baklengs', date '2027-02-01', date '2027-01-01');
      v_txt := v_txt || ',allowed';
    exception when check_violation then v_txt := v_txt || ',23514';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a start after the deadline is refused either way round; the same day and no deadline are kept',
      'expected', '23514,2027-03-31,23514,-:2027-05-01,23514', 'actual', v_txt,
      'pass', v_txt = '23514,2027-03-31,23514,-:2027-05-01,23514');

    -- 3 -------------------------------------------------------------- the leaders set it
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    with touched as (update app.measures set starts_on = date '2027-01-15' where id = v_m returning id)
    select count(*) into v_n from touched;
    reset role;
    v_txt := v_n || ':' || (select starts_on::text from app.measures where id = v_m);
    perform set_config('request.jwt.claims', format(claims, v_al), true);
    set local role authenticated;
    with touched as (update app.measures set starts_on = date '2027-02-01' where id = v_m returning id)
    select count(*) into v_n from touched;
    reset role;
    v_txt := v_txt || ',' || v_n || ':' || (select starts_on::text from app.measures where id = v_m);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the daglig leder and the avdelingsleder set the start date and get their row back',
      'expected', '1:2027-01-15,1:2027-02-01', 'actual', v_txt, 'pass', v_txt = '1:2027-01-15,1:2027-02-01');

    -- 4 -------------------------------------------------------------- the verneombud reads it, and only reads it
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    set local role authenticated;
    select starts_on::text into v_txt from app.measures where id = v_m;
    with touched as (update app.measures set starts_on = date '2027-01-01' where id = v_m returning id)
    select count(*) into v_n from touched;
    reset role;
    v_txt := v_txt || ',' || v_n || ',' || (select starts_on::text from app.measures where id = v_m);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the verneombud reads the start date and cannot set it',
      'expected', '2027-02-01,0,2027-02-01', 'actual', v_txt, 'pass', v_txt = '2027-02-01,0,2027-02-01');

    -- 5 -------------------------------------------------------------- another organisation's leader
    perform set_config('request.jwt.claims', format(claims, v_dl2), true);
    set local role authenticated;
    select count(*) into v_n from app.measures where id = v_m;
    v_txt := v_n::text;
    with touched as (update app.measures set starts_on = date '2027-01-01' where id = v_m returning id)
    select count(*) into v_n from touched;
    reset role;
    v_txt := v_txt || ',' || v_n || ',' || (select starts_on::text from app.measures where id = v_m);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'another organisation''s daglig leder neither reads nor sets it',
      'expected', '0,0,2027-02-01', 'actual', v_txt, 'pass', v_txt = '0,0,2027-02-01');

    -- 6 -------------------------------------------------------------- the step log and referential maintenance
    select count(*) into v_steps from app.measure_steps where measure_id = v_m;
    update app.measures set starts_on = date '2027-02-02' where id = v_m;
    v_txt := ((select count(*) from app.measure_steps where measure_id = v_m) = v_steps)::text;
    delete from app.rounds where id = v_round;
    v_txt := v_txt || ',' || (select coalesce(round_id::text, 'null') || ':' || starts_on::text from app.measures where id = v_m);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a start date is no step; a deleted round nulls round_id and keeps the start date',
      'expected', 'true,null:2027-02-02', 'actual', v_txt, 'pass', v_txt = 'true,null:2027-02-02');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 7 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email ilike '%@msi-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_org2)
    union all select id::text from app.measures where org_id in (v_org, v_org2)) x;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._msi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._msi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._msi;
  if v_failed is not null then raise exception 'measure start invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'measure start invariants: expected 7 rows, got %', v_count; end if;
end $$;
