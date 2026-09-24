-- workspace_invariants.sql — Resultater's readers (0037), proved against the live schema.
--
--   * anon may call none of the three (1)
--   * results_workspace holds no privilege: SECURITY INVOKER (2)
--   * a factor's statements average to the factor's own index, within rounding (3)
--   * a protected or small group carries no statements (4)
--   * an avdelingsleder gets their released department only, and the house's statements are
--     never theirs (5, 6)
--   * the leader of a protected department gets no statements at all (7)
--   * importance: daglig leder answered, avdelingsleder refused, under 20 answers refused (8..10)
--   * every r is a correlation, between -1 and 1, and nothing else travels with it (11)
--   * the workspace's history is every closed round, each summary the same as asking directly (12)
--   * nothing written here survives (13)
--
-- Reads the design fixture's organisation. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/workspace_invariants.sql

create unlogged table if not exists public._wsi(seq int, name text, expected text, actual text, pass bool);
truncate public._wsi;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_r26   uuid := '00000000-0000-4000-8000-000000000002';
  v_r23   uuid := '00000000-0000-4000-8000-000000000042';
  v_alv   uuid := '00000000-0000-4000-8000-0000000c3001';
  v_ald   uuid := '00000000-0000-4000-8000-0000000c3002';
  v_dl    uuid;
  v_rows  jsonb := '[]';
  v_json  jsonb;
  v_sum   jsonb;
  v_bad   int;
  v_cnt   int;
  v_txt   text;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may execute none of the three', 'expected', 'false',
    'actual', (has_function_privilege('anon', 'public.results_items(uuid)', 'execute')
               or has_function_privilege('anon', 'public.results_importance(uuid)', 'execute')
               or has_function_privilege('anon', 'public.results_workspace(uuid)', 'execute'))::text,
    'pass', not (has_function_privilege('anon', 'public.results_items(uuid)', 'execute')
               or has_function_privilege('anon', 'public.results_importance(uuid)', 'execute')
               or has_function_privilege('anon', 'public.results_workspace(uuid)', 'execute')));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'results_workspace is SECURITY INVOKER', 'expected', 'false',
    'actual', (select p.prosecdef::text from pg_proc p where p.oid = 'public.results_workspace(uuid)'::regprocedure),
    'pass', not (select p.prosecdef from pg_proc p where p.oid = 'public.results_workspace(uuid)'::regprocedure));

  select m.user_id into v_dl from app.memberships m
  where m.org_id = v_org and m.active and m.role = 'daglig_leder' order by m.id limit 1;

  begin
    insert into auth.users (id, email) values (v_alv, 'alv@ws-test.example'), (v_ald, 'ald@ws-test.example');
    insert into app.profiles (id, full_name) values (v_alv, 'ALV'), (v_ald, 'ALD');
    insert into app.memberships (org_id, user_id, role, group_id) values
      (v_org, v_alv, 'avdelingsleder', (select id from app.groups where org_id = v_org and name = 'Verksted')),
      (v_org, v_ald, 'avdelingsleder', (select id from app.groups where org_id = v_org and name = 'Drift'));

    -- 3, 4 ------------------------------------------------------------ daglig leder
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.results_items(v_r26);
    v_sum := public.results_summary(v_r26);
    select count(*) into v_bad
    from jsonb_array_elements(v_sum->'factors') f
    where abs((f->>'index')::numeric - (
      select avg((i->>'index')::numeric) from jsonb_array_elements(v_json->'items') i where i->>'key' = f->>'key')) > 1;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'statements average to their factor, within rounding',
      'expected', '0 factors off', 'actual', v_bad || ' factors off',
      'pass', v_bad = 0 and jsonb_array_length(v_json->'items') = 33);

    select string_agg((g->>'group_name') || ':' || (g->>'status') || ':' || case when jsonb_typeof(g->'items') = 'array' then jsonb_array_length(g->'items')::text else 'none' end, ' '
                      order by g->>'group_name') into v_txt
    from jsonb_array_elements(v_json->'groups') g;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'only released groups carry statements',
      'expected', 'Administrasjon:insufficient_data:none Drift:protected:none Prosjekt:ok:33 Verksted:ok:33',
      'actual', v_txt, 'pass', v_txt = 'Administrasjon:insufficient_data:none Drift:protected:none Prosjekt:ok:33 Verksted:ok:33');

    -- 5, 6 ------------------------------------------------- avdelingsleder, released
    perform set_config('request.jwt.claims', json_build_object('sub', v_alv, 'role', 'authenticated')::text, true);
    v_json := public.results_items(v_r26);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'an avdelingsleder sees their department and no other',
      'expected', 'Verksted', 'actual', (select string_agg(g->>'group_name', ',') from jsonb_array_elements(v_json->'groups') g),
      'pass', (select string_agg(g->>'group_name', ',') from jsonb_array_elements(v_json->'groups') g) = 'Verksted');
    select count(*) into v_bad
    from jsonb_array_elements(v_json->'items') i
    join jsonb_array_elements((select g->'items' from jsonb_array_elements(v_json->'groups') g where g->>'group_name' = 'Verksted')) j
      on j->>'key' = i->>'key' and j->>'ordinal' = i->>'ordinal'
    where i->>'index' <> j->>'index';
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'their "own scope" statements are their department''s, not the house''s',
      'expected', 'group scope, 33 equal', 'actual', (v_json->>'scope') || ' scope, ' || (33 - v_bad) || ' equal',
      'pass', v_json->>'scope' = 'group' and v_bad = 0 and jsonb_array_length(v_json->'items') = 33);

    -- 7 ------------------------------------------------- avdelingsleder, protected
    perform set_config('request.jwt.claims', json_build_object('sub', v_ald, 'role', 'authenticated')::text, true);
    v_json := public.results_items(v_r26);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the leader of a protected department gets no statements',
      'expected', 'insufficient_data, 0 items, Drift protected',
      'actual', (v_json->>'status') || ', ' || jsonb_array_length(v_json->'items') || ' items, Drift ' || (v_json->'groups'->0->>'status'),
      'pass', v_json->>'status' = 'insufficient_data' and jsonb_array_length(v_json->'items') = 0
              and v_json->'groups'->0->>'status' = 'protected' and jsonb_typeof(v_json->'groups'->0->'items') = 'null');

    -- 8..11 ----------------------------------------------------------------- importance
    v_json := public.results_importance(v_r26);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'an avdelingsleder is refused importance',
      'expected', 'not_available', 'actual', coalesce(v_json->>'error', v_json->>'status'), 'pass', v_json->>'error' = 'not_available');

    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.results_importance(v_r26);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a daglig leder gets importance over 27 answers',
      'expected', 'ok, 11 factors', 'actual', coalesce(v_json->>'status', v_json->>'error') || ', ' || coalesce(jsonb_array_length(v_json->'factors'), 0) || ' factors',
      'pass', v_json->>'status' = 'ok' and jsonb_array_length(v_json->'factors') = 11);
    select count(*) into v_bad from jsonb_array_elements(v_json->'factors') f
    where not (f ?& array['key', 'r']) or (select count(*) from jsonb_object_keys(f)) <> 2
       or (f->>'r')::numeric not between -1 and 1;
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'each factor carries its key and r in [-1, 1], nothing else',
      'expected', '0 off', 'actual', v_bad || ' off', 'pass', v_bad = 0);

    v_json := public.results_importance(v_r23);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'thirteen answers are too few for a correlation',
      'expected', 'insufficient_data, no factors', 'actual', coalesce(v_json->>'status', v_json->>'error') || case when v_json ? 'factors' then ', FACTORS' else ', no factors' end,
      'pass', v_json->>'status' = 'insufficient_data' and not v_json ? 'factors');

    -- 12 ----------------------------------------------------------------- the workspace
    v_json := public.results_workspace(v_r26);
    select count(*) into v_cnt from app.rounds where org_id = v_org and status = 'lukket';
    select count(*) into v_bad from jsonb_array_elements(v_json->'history') h
    where h->'summary' <> public.results_summary((h->>'round_id')::uuid)
       or h->'groups' <> public.results_by_group((h->>'round_id')::uuid);
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'history is every closed round, each as asked directly',
      'expected', v_cnt || ' rounds, 0 differ', 'actual', jsonb_array_length(v_json->'history') || ' rounds, ' || v_bad || ' differ',
      'pass', jsonb_array_length(v_json->'history') = v_cnt and v_bad = 0);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from auth.users where id in (v_alv, v_ald);
  v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._wsi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._wsi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._wsi;
  if v_failed is not null then
    raise exception 'workspace invariants failed: %', v_failed;
  end if;
  if v_count <> 13 then
    raise exception 'workspace invariants: expected 13 rows, got %', v_count;
  end if;
end $$;

drop table public._wsi;
