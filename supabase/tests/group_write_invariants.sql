-- group_write_invariants.sql — groups created and renamed in Oppsett › Grupper (0130, D-172),
-- proved against the live schema.
--
--   * the write path is the table's own: authenticated holds insert and update under 0026's
--     daglig-leder policies; the shape check, the case-blind key and the trigger are in place,
--     and the trigger function is no client's (1)
--   * the daglig leder creates a group; the verneombud, an avdelingsleder and another
--     organisation's leader are refused, and anon holds nothing (2)
--   * a name is trimmed and 1..60 characters; blank, padded and 61 characters are refused (3)
--   * one name per organisation in any case — «lager» beside «Lager» is a duplicate — while
--     another organisation may use it (4)
--   * the daglig leder renames: the id stays, the old name is kept in former_names, and a
--     client cannot write former_names; the others rename nothing (5)
--   * a rename leaves a closed round's responses on the group, and comment masking still masks
--     the old name (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/group_write_invariants.sql

create unlogged table if not exists public._gwi(seq int, name text, expected text, actual text, pass bool);
truncate public._gwi;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f301';
  v_org2  uuid := '00000000-0000-4000-8000-00000000f302';
  v_dl    uuid := '00000000-0000-4000-8000-0000000f3011';
  v_vo    uuid := '00000000-0000-4000-8000-0000000f3012';
  v_al    uuid := '00000000-0000-4000-8000-0000000f3013';
  v_dl2   uuid := '00000000-0000-4000-8000-0000000f3014';
  v_seed  uuid;
  v_grp   uuid;
  v_meas  uuid;
  v_round uuid;
  v_n     int;
  v_who   uuid;
  v_name  text;
  v_txt   text;
  v_rows  jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated"}';
begin
  -- 1 ---------------------------------------------------------------- the write path
  select concat_ws('|',
    (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
      where table_schema = 'app' and table_name = 'groups' and grantee = 'authenticated'
        and privilege_type in ('INSERT', 'UPDATE')),
    (select count(*) from information_schema.role_table_grants
      where table_schema = 'app' and table_name = 'groups' and grantee = 'anon'),
    (select string_agg(polname, ',' order by polname) from pg_policy
      where polrelid = 'app.groups'::regclass and polname in ('group_admin_insert', 'group_admin_update')),
    (select count(*) from pg_constraint where conrelid = 'app.groups'::regclass and conname = 'groups_name_shape'),
    (select count(*) from pg_indexes where schemaname = 'app' and indexname = 'groups_org_name_ci'),
    (select count(*) from pg_trigger where tgrelid = 'app.groups'::regclass and tgname = 'groups_keep_names'),
    has_function_privilege('authenticated', 'app.groups_keep_names()', 'execute'),
    has_function_privilege('authenticated', 'app.mask_patterns(uuid)', 'execute'))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'insert and update under the daglig-leder policies; shape, case-blind key and trigger in place',
    'expected', 'INSERT,UPDATE|0|group_admin_insert,group_admin_update|1|1|1|f|f', 'actual', v_txt,
    'pass', v_txt = 'INSERT,UPDATE|0|group_admin_insert,group_admin_update|1|1|1|f|f');

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Gruppeskriving AS', '999000301', 8), (v_org2, 'Annen AS', '999000302', 3);
    insert into auth.users (id, email) values
      (v_dl, 'dl@gwi-probe.no'), (v_vo, 'vo@gwi-probe.no'), (v_al, 'al@gwi-probe.no'), (v_dl2, 'dl2@gwi-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina'), (v_vo, 'Vera'), (v_al, 'Arne'), (v_dl2, 'Dag');
    insert into app.groups (org_id, name, sort_order) values (v_org, 'Verksted', 1) returning id into v_seed;
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud'),
      (v_org2, v_dl2, 'daglig_leder');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_seed);

    -- 2 -------------------------------------------------------------- who may create one
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    insert into app.groups (org_id, name, sort_order) values (v_org, 'Lager', 2) returning id into v_grp;
    v_txt := 'created';
    foreach v_who in array array[v_vo, v_al, v_dl2] loop
      perform set_config('request.jwt.claims', format(claims, v_who), true);
      begin
        insert into app.groups (org_id, name, sort_order) values (v_org, 'Kontor', 3);
        v_txt := v_txt || ',allowed';
      exception when insufficient_privilege then v_txt := v_txt || ',42501';
      end;
    end loop;
    reset role;
    v_txt := v_txt || ',' || (select count(*) from app.groups where org_id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the daglig leder creates a group; the verneombud, an avdelingsleder and another leader are refused',
      'expected', 'created,42501,42501,42501,2', 'actual', v_txt, 'pass', v_txt = 'created,42501,42501,42501,2');

    -- 3 -------------------------------------------------------------- the shape of a name
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := '';
    foreach v_name in array array['', '   ', ' Kontor', 'Kontor ', repeat('x', 61), repeat('y', 60)] loop
      begin
        insert into app.groups (org_id, name, sort_order) values (v_org, v_name, 3);
        v_txt := v_txt || 'ok,';
      exception when check_violation then v_txt := v_txt || '23514,';
      end;
    end loop;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'blank, padded and 61 characters are refused; 60 is a name',
      'expected', '23514,23514,23514,23514,23514,ok,', 'actual', v_txt, 'pass', v_txt = '23514,23514,23514,23514,23514,ok,');

    -- 4 -------------------------------------------------------------- one name per organisation, in any case
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := '';
    foreach v_name in array array['Lager', 'lager', 'LAGER', 'verksted'] loop
      begin
        insert into app.groups (org_id, name, sort_order) values (v_org, v_name, 4);
        v_txt := v_txt || 'ok,';
      exception when unique_violation then v_txt := v_txt || '23505,';
      end;
    end loop;
    -- a rename onto another group's name is the same refusal
    begin
      update app.groups set name = 'VERKSTED' where id = v_grp;
      v_txt := v_txt || 'renamed,';
    exception when unique_violation then v_txt := v_txt || '23505,';
    end;
    perform set_config('request.jwt.claims', format(claims, v_dl2), true);
    insert into app.groups (org_id, name, sort_order) values (v_org2, 'Lager', 1);
    v_txt := v_txt || 'other-org-ok';
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', '«lager» beside «Lager» is a duplicate, on insert and on rename; another organisation may use it',
      'expected', '23505,23505,23505,23505,23505,other-org-ok', 'actual', v_txt,
      'pass', v_txt = '23505,23505,23505,23505,23505,other-org-ok');

    -- 5 -------------------------------------------------------------- renaming
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    with u as (update app.groups set name = 'Kapret' where id = v_seed returning 1) select count(*) into v_n from u;
    v_txt := v_n::text;
    perform set_config('request.jwt.claims', format(claims, v_al), true);
    with u as (update app.groups set name = 'Kapret' where id = v_seed returning 1) select count(*) into v_n from u;
    v_txt := v_txt || ',' || v_n;
    perform set_config('request.jwt.claims', format(claims, v_dl2), true);
    with u as (update app.groups set name = 'Kapret' where id = v_seed returning 1) select count(*) into v_n from u;
    v_txt := v_txt || ',' || v_n;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    update app.groups set name = 'Mekanisk' where id = v_seed;
    update app.groups set former_names = '{}' where id = v_seed;       -- a client's attempt, ignored
    reset role;
    v_txt := v_txt || '|' || (select id = v_seed and name = 'Mekanisk' and former_names = '{Verksted}' from app.groups where id = v_seed)::text;
    set local role authenticated;
    update app.groups set name = 'Verksted' where id = v_seed;          -- and back: no name is both
    update app.groups set name = 'Mekanisk' where id = v_seed;
    insert into app.groups (org_id, name, sort_order, former_names) values (v_org, 'Kontor', 5, '{Hemmelig}') returning id into v_grp;
    reset role;
    v_txt := v_txt || ',' || (select array_to_string(former_names, '/') from app.groups where id = v_seed)
                   || ',' || (select cardinality(former_names) from app.groups where id = v_grp);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the daglig leder renames and the old name is kept; the others rename nothing; a client cannot write former_names',
      'expected', '0,0,0|true,Verksted,0', 'actual', v_txt, 'pass', v_txt = '0,0,0|true,Verksted,0');

    -- 6 -------------------------------------------------------------- a closed round after a rename
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'lukket', now() - interval '40 days', now() - interval '26 days') returning id into v_round;
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, v_round, v_seed, date_trunc('hour', now() - interval '30 days') from generate_series(1, 5);
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    update app.groups set name = 'Mekanikk og lager' where id = v_seed;
    reset role;
    v_txt := concat_ws(',',
      (select count(*) from app.responses where round_id = v_round and group_id = v_seed),
      app.mask_apply('Folk på Verksted, i Mekanisk og i Mekanikk og lager sier det samme', app.mask_patterns(v_org)));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the responses stay on the renamed group; every name it has had is masked',
      'expected', '5,Folk på ⟦a⟧, i ⟦a⟧ og i ⟦a⟧ sier det samme', 'actual', v_txt,
      'pass', v_txt = '5,Folk på ⟦a⟧, i ⟦a⟧ og i ⟦a⟧ sier det samme');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 7 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email ilike '%@gwi-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_org2)
    union all select id::text from app.groups where org_id in (v_org, v_org2)) x;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._gwi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._gwi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._gwi;
  if v_failed is not null then raise exception 'group write invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'group write invariants: expected 7 rows, got %', v_count; end if;
end $$;
