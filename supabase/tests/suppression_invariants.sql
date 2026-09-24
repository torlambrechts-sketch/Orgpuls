-- suppression_invariants.sql — complementary suppression (0034), proved against the live schema.
--
-- A withheld group must not be recoverable by subtracting the published parts from the
-- published whole. What must hold:
--
--   * the release decision is internal: no client role may call app.group_release (1)
--   * a group of one is withheld, and the smallest visible group is withheld with it,
--     ties broken by name (2)
--   * a protected group carries its count and no figures (3)
--   * the subtraction a reader can do lands on k or more people, never on one (4)
--   * which group is protected depends on counts, never on scores (5)
--   * nothing is protected when there is nothing to protect: remainder 0 (6) or already
--     at least k (7)
--   * "Uten gruppe" is a group like any other (8)
--   * the avdelingsleder of a protected group gets no figures from either reader (9, 10),
--     while the leader of a released group still gets theirs (11)
--   * comment themes count only comments that `conversations` releases (12)
--   * every round in this database, fixture and demo included, leaves no remainder in
--     1..k-1 (13)
--   * nothing written here survives (14)
--
-- The synthetic organisation is built inside a block that is rolled back, so the suite
-- writes nothing it has to clean up. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/suppression_invariants.sql

create unlogged table if not exists public._supi(seq int, name text, expected text, actual text, pass bool);
truncate public._supi;

do $$
declare
  v_org  uuid := '00000000-0000-4000-8000-00000000c0de';
  v_meas uuid := '00000000-0000-4000-8000-00000000c0d1';
  v_dl   uuid := '00000000-0000-4000-8000-0000000c0001';
  v_alb  uuid := '00000000-0000-4000-8000-0000000c0002';
  v_ald  uuid := '00000000-0000-4000-8000-0000000c0003';
  v_g    jsonb := '{}';            -- group name -> id
  v_r    uuid[] := '{}';           -- rounds 1..5
  v_rows jsonb := '[]';            -- results, carried out of the rolled-back block
  v_json jsonb;
  v_sum  jsonb;
  v_rest int;
  v_i    int;
  v_name text;
  v_cnt  int;
  v_val  int;
  v_gid  uuid;
  v_rid  uuid;
  v_status text;
  v_k    int;
  -- rounds: {group name, respondents, answer value}
  v_plan jsonb := '[
    [["Anlegg",1,1],["Bygg",8,4],["Drift",8,2],["Kontor",9,5]],
    [["Anlegg",1,1],["Bygg",8,2],["Drift",8,4],["Kontor",9,5]],
    [["Bygg",8,3],["Drift",8,3],["Kontor",9,3]],
    [["Anlegg",3,1],["Bygg",3,2],["Kontor",9,4]],
    [[null,2,1],["Bygg",6,3],["Drift",7,3]]
  ]';
  v_round jsonb;
  v_cell  jsonb;
begin
  -- 1 ------------------------------------------------------------ who may call it
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'no client role may execute app.group_release',
    'expected', 'anon=false authenticated=false',
    'actual', 'anon=' || has_function_privilege('anon', 'app.group_release(uuid)', 'execute')
              || ' authenticated=' || has_function_privilege('authenticated', 'app.group_release(uuid)', 'execute'),
    'pass', not has_function_privilege('anon', 'app.group_release(uuid)', 'execute')
            and not has_function_privilege('authenticated', 'app.group_release(uuid)', 'execute'));

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Suppression Test AS', '999000222', 40);
    v_k := app.k_threshold(v_org);
    foreach v_name in array array['Anlegg', 'Bygg', 'Drift', 'Kontor'] loop
      insert into app.groups (org_id, name) values (v_org, v_name) returning id into v_gid;
      v_g := v_g || jsonb_build_object(v_name, v_gid);
    end loop;

    insert into auth.users (id, email) values
      (v_dl, 'dl@suppression-test.example'), (v_alb, 'alb@suppression-test.example'),
      (v_ald, 'ald@suppression-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_alb, 'ALB'), (v_ald, 'ALD');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder');
    insert into app.memberships (org_id, user_id, role, group_id) values
      (v_org, v_alb, 'avdelingsleder', (v_g->>'Bygg')::uuid),
      (v_org, v_ald, 'avdelingsleder', (v_g->>'Drift')::uuid);

    insert into app.measurements (id, org_id, kind, year, label)
    values (v_meas, v_org, 'grunnlinje', 2026, 'Probe');

    for v_round in select * from jsonb_array_elements(v_plan) loop
      insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
      values (v_org, v_meas, 'lukket', '2026-09-01 08:00+02', '2026-09-08 20:00+02', '2026-09-08 20:00+02')
      returning id into v_rid;
      v_r := v_r || v_rid;
      for v_cell in select * from jsonb_array_elements(v_round) loop
        v_gid := case when v_cell->>0 is null then null else (v_g->>(v_cell->>0))::uuid end;
        v_cnt := (v_cell->>1)::int;
        v_val := (v_cell->>2)::int;
        for v_i in 1..v_cnt loop
          with resp as (
            insert into app.responses (org_id, round_id, group_id, submitted_hour)
            values (v_org, v_rid, v_gid, '2026-09-02 10:00+02') returning id
          )
          insert into app.answers (response_id, factor_key, ordinal, value)
          select resp.id, 'ytring', o, v_val from resp cross join generate_series(1, 3) o;
        end loop;
      end loop;
    end loop;

    -- 2 --------------------------------------------- the rule on the fixture's shape
    select string_agg(coalesce(g.name, 'Uten gruppe') || ':' || rel.status, ' ' order by coalesce(g.name, 'Uten gruppe'))
      into v_status
    from app.group_release(v_r[1]) rel left join app.groups g on g.id = rel.group_id;
    v_rows := v_rows || jsonb_build_object('seq', 2,
      'name', 'a group of one is withheld, and the smallest visible group with it (ties by name)',
      'expected', 'Anlegg:insufficient_data Bygg:protected Drift:ok Kontor:ok', 'actual', v_status,
      'pass', v_status = 'Anlegg:insufficient_data Bygg:protected Drift:ok Kontor:ok');

    -- 3 ------------------------------------------------------------ what it returns
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.results_by_group(v_r[1]);
    select g into v_cell from jsonb_array_elements(v_json->'groups') g where g->>'group_name' = 'Bygg';
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a protected group carries its count and no figures',
      'expected', 'protected, n=8, factors=null',
      'actual', (v_cell->>'status') || ', n=' || (v_cell->>'n') || ', factors=' || coalesce(v_cell->>'factors', 'null'),
      'pass', v_cell->>'status' = 'protected' and (v_cell->>'n')::int = 8 and jsonb_typeof(v_cell->'factors') = 'null');

    -- 4 ----------------------------------------------- the reader's own subtraction
    v_sum := public.results_summary(v_r[1]);
    select (v_sum->>'n')::int - coalesce(sum((g->>'n')::int), 0) into v_rest
    from jsonb_array_elements(v_json->'groups') g where g->>'status' = 'ok';
    v_rows := v_rows || jsonb_build_object('seq', 4,
      'name', 'whole minus the published groups is at least k people, never one',
      'expected', '>= ' || v_k, 'actual', v_rest::text, 'pass', v_rest >= v_k);

    -- 5 ------------------------------------------------ counts decide, scores do not
    select string_agg(g.name, ',' order by g.name) into v_status
    from app.group_release(v_r[2]) rel join app.groups g on g.id = rel.group_id
    where rel.status = 'protected';
    v_rows := v_rows || jsonb_build_object('seq', 5,
      'name', 'swapping the scores of two equal groups does not change which is protected',
      'expected', 'Bygg', 'actual', coalesce(v_status, 'none'), 'pass', v_status = 'Bygg');

    -- 6, 7 ----------------------------------------------- nothing to protect
    select count(*) into v_cnt from app.group_release(v_r[3]) rel where rel.status <> 'ok';
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'no group under k: nothing is withheld',
      'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

    select count(*) into v_cnt from app.group_release(v_r[4]) rel where rel.status = 'protected';
    v_rows := v_rows || jsonb_build_object('seq', 7,
      'name', 'withheld groups that already pool to k or more protect nobody else',
      'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

    -- 8 ------------------------------------------------------------- Uten gruppe
    select string_agg(coalesce(g.name, 'Uten gruppe') || ':' || rel.status, ' ' order by coalesce(g.name, 'Uten gruppe'))
      into v_status
    from app.group_release(v_r[5]) rel left join app.groups g on g.id = rel.group_id;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'responses with no group are a remainder like any other',
      'expected', 'Bygg:protected Drift:ok Uten gruppe:insufficient_data', 'actual', v_status,
      'pass', v_status = 'Bygg:protected Drift:ok Uten gruppe:insufficient_data');

    -- 9, 10 -------------------------------------- the leader of a protected group
    perform set_config('request.jwt.claims', json_build_object('sub', v_alb, 'role', 'authenticated')::text, true);
    v_json := public.results_by_group(v_r[1]);
    v_rows := v_rows || jsonb_build_object('seq', 9,
      'name', 'the avdelingsleder of a protected group sees it withheld in results_by_group',
      'expected', '1 group, protected, no figures',
      'actual', jsonb_array_length(v_json->'groups') || ' group, ' || (v_json->'groups'->0->>'status')
                || ', ' || case when jsonb_typeof(v_json->'groups'->0->'factors') = 'null' then 'no figures' else 'FIGURES' end,
      'pass', jsonb_array_length(v_json->'groups') = 1 and v_json->'groups'->0->>'status' = 'protected'
              and jsonb_typeof(v_json->'groups'->0->'factors') = 'null');

    v_sum := public.results_summary(v_r[1]);
    v_rows := v_rows || jsonb_build_object('seq', 10,
      'name', 'the avdelingsleder of a protected group gets no figures from results_summary',
      'expected', 'protected, no index, no factors',
      'actual', coalesce(v_sum->>'status', v_sum->>'error')
                || case when v_sum ? 'index' then ', INDEX' else ', no index' end
                || case when v_sum ? 'factors' then ', FACTORS' else ', no factors' end,
      'pass', v_sum->>'status' = 'protected' and not v_sum ? 'index' and not v_sum ? 'factors');

    -- 11 ------------------------------------------ the leader of a released group
    perform set_config('request.jwt.claims', json_build_object('sub', v_ald, 'role', 'authenticated')::text, true);
    v_sum := public.results_summary(v_r[1]);
    v_rows := v_rows || jsonb_build_object('seq', 11,
      'name', 'the avdelingsleder of a released group still reads their department',
      'expected', 'ok, n=8, index 25', 'actual', coalesce(v_sum->>'status', v_sum->>'error') || ', n=' || coalesce(v_sum->>'n', '?')
                || ', index ' || coalesce(v_sum->>'index', '?'),
      'pass', v_sum->>'status' = 'ok' and (v_sum->>'n')::int = 8 and (v_sum->>'index')::int = 25);

    -- 12 -------------------------------------------- themes count released comments
    -- the one respondent in Anlegg and five in Drift comment on the same statement
    insert into app.response_comments (response_id, factor_key, ordinal, body)
    select x.id, 'ytring', 1, 'probe'
    from (
      (select r.id from app.responses r where r.round_id = v_r[1] and r.group_id = (v_g->>'Anlegg')::uuid)
      union all
      (select r.id from app.responses r where r.round_id = v_r[1] and r.group_id = (v_g->>'Drift')::uuid
       order by r.id limit 5)
    ) x;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    select t into v_cell from jsonb_array_elements(public.comment_themes(v_r[1])->'themes') t where t->>'key' = 'ytring';
    v_rows := v_rows || jsonb_build_object('seq', 12,
      'name', 'a theme counts only comments from groups that clear k',
      'expected', '5 people, 5 comments', 'actual',
      coalesce((v_cell->>'people') || ' people, ' || (v_cell->>'comments') || ' comments', 'absent'),
      'pass', (v_cell->>'people')::int = 5 and (v_cell->>'comments')::int = 5);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 13 ------------------------------------------------ every round in this database
  select count(*) into v_cnt
  from app.rounds rd
  cross join lateral (
    select coalesce(sum(rel.n) filter (where rel.status <> 'ok'), 0) as rest
    from app.group_release(rd.id) rel
  ) x
  where x.rest between 1 and app.k_threshold(rd.org_id) - 1;
  v_rows := v_rows || jsonb_build_object('seq', 13,
    'name', 'no round in this database leaves a remainder of 1..k-1',
    'expected', '0 rounds', 'actual', v_cnt || ' rounds', 'pass', v_cnt = 0);

  -- 14 ---------------------------------------------------------------- nothing left
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_alb, v_ald)
    union all select response_id::text from app.response_comments where body = 'probe'
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._supi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._supi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._supi;
  if v_failed is not null then
    raise exception 'suppression invariants failed: %', v_failed;
  end if;
  if v_count <> 14 then
    raise exception 'suppression invariants: expected 14 rows, got %', v_count;
  end if;
end $$;

drop table public._supi;
