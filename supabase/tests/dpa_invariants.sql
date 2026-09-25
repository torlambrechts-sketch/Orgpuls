-- dpa_invariants.sql — the data processing agreement's signatures (0047), proved against the live schema.
--
--   * both tables have RLS on; clients may read, and may write neither (1, 2)
--   * anon may not sign, and a signature refers to nothing but the organisation, the version
--     and the leader's profile: nobody on the respondents' side (3, 4)
--   * a daglig leder signs the current version, and the signature carries that version's
--     hash from app.dpa_versions (5)
--   * signing twice, a verneombud, a leader of another organisation, a version that is not
--     the current one and an empty name are all refused (6..10)
--   * a member of the organisation reads the signature; somebody outside it does not (11, 12)
--   * nobody may change or delete a signature, but the foreign key's own maintenance still
--     works: the signer's profile gone, signed_by goes null (13..15)
--   * a published version's hash cannot be changed (16)
--   * nothing written here survives (17)
--
-- Reads the design fixture's organisation. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dpa_invariants.sql

create unlogged table if not exists public._dpi(seq int, name text, expected text, actual text, pass bool);
truncate public._dpi;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_other  uuid := '00000000-0000-4000-8000-0000000d9001';
  v_vo     uuid := '00000000-0000-4000-8000-0000000d9002';
  v_out    uuid := '00000000-0000-4000-8000-0000000d9003';
  v_dl     uuid;
  v_cur    text;
  v_sha    text;
  v_rows   jsonb := '[]';
  v_json   jsonb;
  v_cnt    int;
  v_txt    text;
  v_ok     boolean;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS is on for both tables', 'expected', 'true, true',
    'actual', (select string_agg(c.relrowsecurity::text, ', ' order by c.relname) from pg_class c
               where c.oid in ('app.dpa_signatures'::regclass, 'app.dpa_versions'::regclass)),
    'pass', (select bool_and(c.relrowsecurity) from pg_class c
             where c.oid in ('app.dpa_signatures'::regclass, 'app.dpa_versions'::regclass)));

  v_ok := has_table_privilege('authenticated', 'app.dpa_signatures', 'select')
          and not has_table_privilege('authenticated', 'app.dpa_signatures', 'insert')
          and not has_table_privilege('authenticated', 'app.dpa_signatures', 'update')
          and not has_table_privilege('authenticated', 'app.dpa_signatures', 'delete')
          and not has_table_privilege('authenticated', 'app.dpa_versions', 'insert')
          and not has_table_privilege('authenticated', 'app.dpa_versions', 'update')
          and not has_table_privilege('anon', 'app.dpa_signatures', 'select')
          and not exists (select 1 from pg_policies where schemaname = 'app' and tablename in ('dpa_signatures', 'dpa_versions')
                            and cmd <> 'SELECT');
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'clients read the signatures and write neither table', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'anon may not call sign_dpa', 'expected', 'false',
    'actual', has_function_privilege('anon', 'public.sign_dpa(uuid,text,text,text)', 'execute')::text,
    'pass', not has_function_privilege('anon', 'public.sign_dpa(uuid,text,text,text)', 'execute'));

  select string_agg(confrelid::regclass::text, ',' order by confrelid::regclass::text) into v_txt
  from pg_constraint where conrelid = 'app.dpa_signatures'::regclass and contype = 'f';
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a signature refers only to the organisation, the version and the leader',
    'expected', 'app.dpa_versions,app.organizations,app.profiles', 'actual', v_txt,
    'pass', v_txt = 'app.dpa_versions,app.organizations,app.profiles');

  select m.user_id into v_dl from app.memberships m
  where m.org_id = v_org and m.active and m.role = 'daglig_leder' order by m.id limit 1;
  select v.version, v.text_sha256 into v_cur, v_sha from app.dpa_versions v order by v.published_on desc, v.version desc limit 1;

  begin
    -- a verneombud in the organisation, and a daglig leder of another one
    insert into auth.users (id, email) values (v_vo, 'vo@dpa-test.example'), (v_out, 'out@dpa-test.example');
    insert into app.profiles (id, full_name) values (v_vo, 'VO'), (v_out, 'OUT');
    insert into app.organizations (id, name, employee_count) values (v_other, 'Annen AS', 10);
    insert into app.memberships (org_id, user_id, role, group_id) values
      (v_org, v_vo, 'verneombud', null), (v_other, v_out, 'daglig_leder', null);

    -- 5 --------------------------------------------------------------- signs
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    select count(*) into v_cnt from app.dpa_signatures where org_id = v_org and version = v_cur;
    if v_cnt = 0 then
      v_json := public.sign_dpa(v_org, v_cur, 'Test Leder', 'Daglig leder');
    else
      v_json := '{"ok": true}';  -- the fixture org has signed already; 6 still proves the second attempt fails
    end if;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a daglig leder signs the current version, with its hash', 'expected', 'ok, hash of ' || v_cur,
      'actual', (v_json->>'ok') || ', ' || coalesce((select text_sha256 from app.dpa_signatures where org_id = v_org and version = v_cur), 'none'),
      'pass', (v_json->>'ok')::boolean
              and (select text_sha256 from app.dpa_signatures where org_id = v_org and version = v_cur) = v_sha);

    -- 6..10 --------------------------------------------------------- refused
    v_json := public.sign_dpa(v_org, v_cur, 'Test Leder', 'Daglig leder');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'signing the same version twice is refused', 'expected', 'already_signed',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'already_signed');

    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_json := public.sign_dpa(v_org, v_cur, 'Verne Ombud', 'Verneombud');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a verneombud cannot sign', 'expected', 'not_allowed',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_allowed');

    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    v_json := public.sign_dpa(v_org, v_cur, 'Ute Leder', 'Daglig leder');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a daglig leder of another organisation cannot sign for this one', 'expected', 'not_allowed',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_allowed');

    v_json := public.sign_dpa(v_other, '1999-01-01', 'Ute Leder', 'Daglig leder');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'only the current version can be signed', 'expected', 'not_current',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_current');

    v_json := public.sign_dpa(v_other, v_cur, ' ', 'Daglig leder');
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'a signature needs a name', 'expected', 'invalid_signer',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'invalid_signer');

    -- 11, 12 -------------------------------------------------------- who reads
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_cnt from app.dpa_signatures where org_id = v_org;
    execute 'reset role';
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'a member of the organisation reads its signature', 'expected', '1',
      'actual', v_cnt::text, 'pass', v_cnt = 1);

    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_cnt from app.dpa_signatures where org_id = v_org;
    execute 'reset role';
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'somebody outside the organisation reads none', 'expected', '0',
      'actual', v_cnt::text, 'pass', v_cnt = 0);

    -- 13..15 -------------------------------------------------------- immutable
    begin
      update app.dpa_signatures set signer_name = 'Endret' where org_id = v_org and version = v_cur;
      v_ok := false;
    exception when others then v_ok := sqlerrm like '%cannot be changed%';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'a signature cannot be changed', 'expected', 'refused',
      'actual', case when v_ok then 'refused' else 'allowed' end, 'pass', v_ok);

    begin
      delete from app.dpa_signatures where org_id = v_org and version = v_cur;
      v_ok := false;
    exception when others then v_ok := sqlerrm like '%cannot be deleted%';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'a signature cannot be deleted while the organisation exists', 'expected', 'refused',
      'actual', case when v_ok then 'refused' else 'allowed' end, 'pass', v_ok);

    begin
      update app.dpa_signatures set signed_by = null where org_id = v_org and version = v_cur;
      v_ok := true;
    exception when others then v_ok := false;
    end;
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'the foreign key can still clear signed_by', 'expected', 'allowed',
      'actual', case when v_ok then 'allowed' else 'refused' end, 'pass', v_ok);

    -- 16 ------------------------------------------------------------- versions fixed
    begin
      update app.dpa_versions set text_sha256 = repeat('0', 64) where version = v_cur;
      v_ok := false;
    exception when others then v_ok := sqlerrm like '%cannot be changed%';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'a published version''s hash cannot be changed', 'expected', 'refused',
      'actual', case when v_ok then 'refused' else 'allowed' end, 'pass', v_ok);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from auth.users where id in (v_vo, v_out);
  v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'every probe row was rolled back', 'expected', '0 users, 0 organisations',
    'actual', v_cnt || ' users, ' || (select count(*) from app.organizations where id = v_other) || ' organisations',
    'pass', v_cnt = 0 and not exists (select 1 from app.organizations where id = v_other));

  insert into public._dpi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._dpi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._dpi;
  if v_failed is not null then
    raise exception 'dpa invariants failed: %', v_failed;
  end if;
  if v_count <> 17 then
    raise exception 'dpa invariants: expected 17 rows, got %', v_count;
  end if;
end $$;

drop table public._dpi;
