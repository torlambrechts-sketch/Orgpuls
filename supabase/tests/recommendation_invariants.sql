-- recommendation_invariants.sql — "Anbefaler oss" (0035), proved against the live schema.
--
--   * anon may not call it (1)
--   * a daglig leder and a verneombud are answered; an avdelingsleder and a non-member are
--     refused with the same single refusal (2..5)
--   * the score is 100 × (fives − ones-to-threes) / answers, rounded (6)
--   * it carries a score and counts, never options or groups (7)
--   * fewer than k answers yields no score, even when the round has k responses (8)
--   * a round that did not ask the question says so, rather than scoring zero (9)
--   * nothing written here survives (10)
--
-- Built inside a block that is rolled back. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/recommendation_invariants.sql

create unlogged table if not exists public._reci(seq int, name text, expected text, actual text, pass bool);
truncate public._reci;

do $$
declare
  v_org  uuid := '00000000-0000-4000-8000-00000000ec01';
  v_meas uuid := '00000000-0000-4000-8000-00000000ec02';
  v_dl   uuid := '00000000-0000-4000-8000-0000000ec011';
  v_vo   uuid := '00000000-0000-4000-8000-0000000ec012';
  v_al   uuid := '00000000-0000-4000-8000-0000000ec013';
  v_out  uuid := '00000000-0000-4000-8000-0000000ec014';
  v_grp  uuid;
  v_r    uuid[] := '{}';
  v_rid  uuid;
  v_rows jsonb := '[]';
  v_json jsonb;
  v_cnt  int;
  v_i    int;
  v_k    int;
  -- 5 for, 2 neutral, 3 against, of 10 answers: 100 × (5 − 3) / 10 = +20
  v_answers int[] := array[5, 5, 5, 5, 5, 4, 4, 3, 2, 1];
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may not execute it', 'expected', 'false',
    'actual', has_function_privilege('anon', 'public.results_recommendation(uuid)', 'execute')::text,
    'pass', not has_function_privilege('anon', 'public.results_recommendation(uuid)', 'execute'));

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Recommendation Test AS', '999000333', 20);
    v_k := app.k_threshold(v_org);
    insert into app.groups (org_id, name) values (v_org, 'Alle') returning id into v_grp;

    insert into auth.users (id, email) values
      (v_dl, 'dl@rec-test.example'), (v_vo, 'vo@rec-test.example'),
      (v_al, 'al@rec-test.example'), (v_out, 'out@rec-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_vo, 'VO'), (v_al, 'AL'), (v_out, 'OUT');
    insert into app.memberships (org_id, user_id, role) values
      (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_grp);

    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_org, 'grunnlinje', 2026, 'Probe');

    -- three rounds of ten responses: 1 = everyone answers, 2 = k-1 answer, 3 = not asked
    for v_i in 1..3 loop
      insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
      values (v_org, v_meas, 'lukket', '2026-09-01 08:00+02', '2026-09-08 20:00+02', '2026-09-08 20:00+02')
      returning id into v_rid;
      v_r := v_r || v_rid;
      insert into app.responses (org_id, round_id, group_id, submitted_hour)
      select v_org, v_rid, v_grp, '2026-09-02 10:00+02' from generate_series(1, 10);
      if v_i < 3 then
        insert into app.round_extra_questions (org_id, round_id, extra_key) values (v_org, v_rid, 'anbefaling');
      end if;
    end loop;

    insert into app.extra_answers (response_id, extra_key, option_ordinal)
    select x.id, 'anbefaling', v_answers[x.n]
    from (select r.id, row_number() over (order by r.id) as n from app.responses r where r.round_id = v_r[1]) x;

    insert into app.extra_answers (response_id, extra_key, option_ordinal)
    select x.id, 'anbefaling', 5
    from (select r.id, row_number() over (order by r.id) as n from app.responses r where r.round_id = v_r[2]) x
    where x.n < v_k;

    -- 2..5 ----------------------------------------------------------------- who
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.results_recommendation(v_r[1]);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a daglig leder is answered', 'expected', 'ok',
      'actual', coalesce(v_json->>'status', v_json->>'error'), 'pass', v_json->>'status' = 'ok');

    -- 6, 7 ----------------------------------------------------- the figure and its shape
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'score = 100 × (fives − ones-to-threes) / answers',
      'expected', '20 over 10 answers', 'actual', coalesce(v_json->>'score', '?') || ' over ' || coalesce(v_json->>'answered', '?') || ' answers',
      'pass', (v_json->>'score')::int = 20 and (v_json->>'answered')::int = 10);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'it carries a score and counts, nothing per option or group',
      'expected', 'answered,n,score,status,threshold',
      'actual', (select string_agg(k, ',' order by k) from jsonb_object_keys(v_json) k),
      'pass', (select array_agg(k order by k) from jsonb_object_keys(v_json) k)
              = array['answered', 'n', 'score', 'status', 'threshold']);

    -- 8 ------------------------------------------------------ fewer than k answers
    v_json := public.results_recommendation(v_r[2]);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'k-1 answers in a round of ten yield no score',
      'expected', 'insufficient_data, no score',
      'actual', coalesce(v_json->>'status', v_json->>'error') || case when v_json ? 'score' then ', SCORE' else ', no score' end,
      'pass', v_json->>'status' = 'insufficient_data' and not v_json ? 'score');

    -- 9 ----------------------------------------------------------- not asked at all
    v_json := public.results_recommendation(v_r[3]);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a round that did not ask says so',
      'expected', 'not_asked', 'actual', coalesce(v_json->>'status', v_json->>'error'),
      'pass', v_json->>'status' = 'not_asked' and not v_json ? 'score');

    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_json := public.results_recommendation(v_r[1]);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a verneombud is answered', 'expected', 'ok',
      'actual', coalesce(v_json->>'status', v_json->>'error'), 'pass', v_json->>'status' = 'ok');

    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    v_json := public.results_recommendation(v_r[1]);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'an avdelingsleder is refused (whole organisation only)',
      'expected', 'not_available', 'actual', coalesce(v_json->>'error', v_json->>'status'),
      'pass', v_json->>'error' = 'not_available' and not v_json ? 'score');

    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    v_json := public.results_recommendation(v_r[1]);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a signed-in non-member is refused the same way',
      'expected', 'not_available', 'actual', coalesce(v_json->>'error', v_json->>'status'),
      'pass', v_json->>'error' = 'not_available' and not v_json ? 'score');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 10 ------------------------------------------------------------------ nothing left
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_vo, v_al, v_out)
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._reci
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._reci order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._reci;
  if v_failed is not null then
    raise exception 'recommendation invariants failed: %', v_failed;
  end if;
  if v_count <> 10 then
    raise exception 'recommendation invariants: expected 10 rows, got %', v_count;
  end if;
end $$;

drop table public._reci;
