-- digest_invariants.sql — the one-call reader (0044), proved against the live schema.
--
--   * anon may not call it (1); it holds no privilege: SECURITY INVOKER (2)
--   * for the daglig leder, every round's participation and summary are exactly what the
--     reader answers when asked directly — open and planned rounds included, so they come
--     back refused as they would alone (3, 4)
--   * the workspace is the workspace, and none asked is none returned (5, 6)
--   * the parts come back in the order they were asked for (7)
--   * a round of another organisation, or one that does not exist, is refused the same way
--     it is when asked directly (8)
--   * for an avdelingsleder, the summaries are their scope, as asked directly (9)
--   * more than 500 ids is refused whole (10)
--   * an id asked for twice is answered once (11)
--   * nothing written here survives (12)
--
-- Reads the design fixture's organisation. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/digest_invariants.sql

create unlogged table if not exists public._dgi(seq int, name text, expected text, actual text, pass bool);
truncate public._dgi;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_r26   uuid := '00000000-0000-4000-8000-000000000002';
  v_alv   uuid := '00000000-0000-4000-8000-0000000c4001';
  v_dl    uuid;
  v_ids   uuid[];
  v_other uuid;
  v_rows  jsonb := '[]';
  v_json  jsonb;
  v_bad   int;
  v_cnt   int;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may not execute results_digest', 'expected', 'false',
    'actual', has_function_privilege('anon', 'public.results_digest(uuid[],uuid[],uuid)', 'execute')::text,
    'pass', not has_function_privilege('anon', 'public.results_digest(uuid[],uuid[],uuid)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'results_digest is SECURITY INVOKER', 'expected', 'false',
    'actual', (select p.prosecdef::text from pg_proc p where p.oid = 'public.results_digest(uuid[],uuid[],uuid)'::regprocedure),
    'pass', not (select p.prosecdef from pg_proc p where p.oid = 'public.results_digest(uuid[],uuid[],uuid)'::regprocedure));

  select m.user_id into v_dl from app.memberships m
  where m.org_id = v_org and m.active and m.role = 'daglig_leder' order by m.id limit 1;
  select array_agg(r.id order by r.closes_at desc nulls first, r.id) into v_ids from app.rounds r where r.org_id = v_org;
  -- a round the fixture's leader has no part in, or failing that, one that does not exist
  select coalesce((select r.id from app.rounds r where r.org_id <> v_org order by r.id limit 1), gen_random_uuid())
    into v_other;

  begin
    insert into auth.users (id, email) values (v_alv, 'alv@digest-test.example');
    insert into app.profiles (id, full_name) values (v_alv, 'ALV');
    insert into app.memberships (org_id, user_id, role, group_id) values
      (v_org, v_alv, 'avdelingsleder', (select id from app.groups where org_id = v_org and name = 'Verksted'));

    -- 3..8 ------------------------------------------------------------- daglig leder
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.results_digest(v_ids, v_ids, v_r26);

    select count(*) into v_bad from jsonb_array_elements(v_json->'participation') p
    where p->'participation' <> public.participation((p->>'round_id')::uuid);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'participation per round, each as asked directly',
      'expected', cardinality(v_ids) || ' rounds, 0 differ',
      'actual', jsonb_array_length(v_json->'participation') || ' rounds, ' || v_bad || ' differ',
      'pass', jsonb_array_length(v_json->'participation') = cardinality(v_ids) and v_bad = 0);

    select count(*) into v_bad from jsonb_array_elements(v_json->'summaries') s
    where s->'summary' <> public.results_summary((s->>'round_id')::uuid);
    select count(*) into v_cnt from jsonb_array_elements(v_json->'summaries') s where s->'summary' ? 'error';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'summary per round, each as asked directly, unclosed ones refused',
      'expected', cardinality(v_ids) || ' rounds, 0 differ, ' || (select count(*) from app.rounds where org_id = v_org and status <> 'lukket') || ' refused',
      'actual', jsonb_array_length(v_json->'summaries') || ' rounds, ' || v_bad || ' differ, ' || v_cnt || ' refused',
      'pass', jsonb_array_length(v_json->'summaries') = cardinality(v_ids) and v_bad = 0
              and v_cnt = (select count(*) from app.rounds where org_id = v_org and status <> 'lukket'));

    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the workspace is results_workspace', 'expected', 'true',
      'actual', (v_json->'workspace' = public.results_workspace(v_r26))::text,
      'pass', v_json->'workspace' = public.results_workspace(v_r26));

    v_json := public.results_digest('{}', '{}', null);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'nothing asked, nothing returned',
      'expected', '{"summaries": [], "workspace": null, "participation": []}', 'actual', v_json::text,
      'pass', v_json = '{"summaries": [], "workspace": null, "participation": []}'::jsonb);

    v_json := public.results_digest(array[v_ids[2], v_ids[1]], array[v_ids[3], v_ids[1], v_ids[2]], null);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'parts come back in the order asked',
      'expected', 'true',
      'actual', ((select array_agg((p->>'round_id')::uuid) from jsonb_array_elements(v_json->'participation') p) = array[v_ids[2], v_ids[1]]
                 and (select array_agg((s->>'round_id')::uuid) from jsonb_array_elements(v_json->'summaries') s) = array[v_ids[3], v_ids[1], v_ids[2]])::text,
      'pass', (select array_agg((p->>'round_id')::uuid) from jsonb_array_elements(v_json->'participation') p) = array[v_ids[2], v_ids[1]]
              and (select array_agg((s->>'round_id')::uuid) from jsonb_array_elements(v_json->'summaries') s) = array[v_ids[3], v_ids[1], v_ids[2]]);

    v_json := public.results_digest(array[v_other], array[v_other], v_other);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'another organisation''s round: refused, as asked directly',
      'expected', 'not_available ×2, the workspace as asked directly',
      'actual', coalesce(v_json#>>'{participation,0,participation,error}', '-') || ' ' || coalesce(v_json#>>'{summaries,0,summary,error}', '-')
                || ', the workspace ' || case when v_json->'workspace' = public.results_workspace(v_other) then 'as asked directly' else 'differs' end,
      'pass', v_json#>'{participation,0,participation}' = public.participation(v_other)
              and v_json#>>'{participation,0,participation,error}' = 'not_available'
              and v_json#>'{summaries,0,summary}' = public.results_summary(v_other)
              and v_json#>>'{summaries,0,summary,error}' = 'not_available'
              and v_json->'workspace' = public.results_workspace(v_other));

    -- 9 ------------------------------------------------------------- avdelingsleder
    perform set_config('request.jwt.claims', json_build_object('sub', v_alv, 'role', 'authenticated')::text, true);
    v_json := public.results_digest('{}', v_ids, null);
    select count(*) into v_bad from jsonb_array_elements(v_json->'summaries') s
    where s->'summary' <> public.results_summary((s->>'round_id')::uuid);
    select count(*) into v_cnt from jsonb_array_elements(v_json->'summaries') s where s#>>'{summary,scope}' = 'org';
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'an avdelingsleder gets their own scope, as asked directly',
      'expected', '0 differ, 0 whole-house', 'actual', v_bad || ' differ, ' || v_cnt || ' whole-house',
      'pass', v_bad = 0 and v_cnt = 0);

    -- 10 -------------------------------------------------------------------- the cap
    v_json := public.results_digest(array(select v_r26 from generate_series(1, 501)), '{}', null);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', '501 ids are refused whole', 'expected', '{"error": "too_many"}',
      'actual', v_json::text, 'pass', v_json = '{"error": "too_many"}'::jsonb);

    -- 11 ---------------------------------------------------------------- duplicates
    v_json := public.results_digest(array[v_r26, v_r26, v_r26], array[v_r26, v_ids[1], v_r26], null);
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'an id asked for twice is answered once', 'expected', '1 and 2',
      'actual', jsonb_array_length(v_json->'participation') || ' and ' || jsonb_array_length(v_json->'summaries'),
      'pass', jsonb_array_length(v_json->'participation') = 1
              and jsonb_array_length(v_json->'summaries') = case when v_ids[1] = v_r26 then 1 else 2 end);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from auth.users where id = v_alv;
  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._dgi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._dgi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._dgi;
  if v_failed is not null then
    raise exception 'digest invariants failed: %', v_failed;
  end if;
  if v_count <> 12 then
    raise exception 'digest invariants: expected 12 rows, got %', v_count;
  end if;
end $$;

drop table public._dgi;
