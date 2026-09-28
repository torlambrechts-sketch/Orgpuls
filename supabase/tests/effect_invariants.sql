-- effect_invariants.sql — a baseline's two weeks and the standing effect question (0097, D-147),
-- proved against the live schema.
--
--   * «tiltak_effekt» is registry data: a scale question with five options, before the open field (1)
--   * no standard: a grunnlinje stays open 14 days, a puls 7, and the first grunnlinje does not
--     ask about effect (2)
--   * from the second cycle a grunnlinje asks it (3)
--   * a saved standard's window is kept (4)
--   * results_effect: anon may not call it; nothing for an open round or a round that did not ask
--     it; below k the sentence; at k the share who agree and the mean (5)
--   * nothing written here survives (6)
--   * saving the standard moves a round asking it and keeps the question; only the leader's own
--     choice for the round removes it (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/effect_invariants.sql

create unlogged table if not exists public._efi(seq int, name text, expected text, actual text, pass bool);
truncate public._efi;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000ae01';
  v_dl     uuid := '00000000-0000-4000-8000-0000000ae011';
  v_grp    uuid;
  v_g1m    uuid;
  v_g2m    uuid;
  v_pm     uuid;
  v_g1     uuid;
  v_g2     uuid;
  v_p      uuid;
  v_closed uuid;
  v_txt    text;
  v_json   jsonb;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  -- 1 ------------------------------------------------------------------ registry
  select concat_ws('|', q.kind, (select count(*) from app.extra_options o where o.extra_key = q.key),
                   q.sort_order < (select a.sort_order from app.extra_questions a where a.key = 'apent_felt'))
    into v_txt from app.extra_questions q where q.key = 'tiltak_effekt';
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'tiltak_effekt: a scale question with five options, before the open field',
    'expected', 'scale|5|t', 'actual', coalesce(v_txt, 'missing'), 'pass', v_txt = 'scale|5|t');

  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Effekt Test AS', '999000777', 10);
    insert into app.groups (org_id, name) values (v_org, 'Alle') returning id into v_grp;
    insert into auth.users (id, email) values (v_dl, 'dl@effect-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder');
    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2095) returning id into v_g1m;
    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2096) returning id into v_g2m;
    insert into app.measurements (org_id, kind, year) values (v_org, 'puls', 2095) returning id into v_pm;

    -- 2 ---------------------------------------------------------------- no standard, first cycle
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_g1m, 'planlagt', '2095-09-01 09:00+02', '2095-09-08 09:00+02') returning id into v_g1;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_pm, 'planlagt', '2095-12-01 09:00+01', '2095-12-08 09:00+01') returning id into v_p;
    set constraints all immediate;
    select concat_ws('|', r.close_after_days, (r.closes_at - r.opens_at)::text, exists (select 1 from app.round_extra_questions x where x.round_id = r.id and x.extra_key = 'tiltak_effekt'),
                     (select p.close_after_days from app.rounds p where p.id = v_p))
      into v_txt from app.rounds r where r.id = v_g1;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'no standard: a grunnlinje 14 days, a puls 7; the first grunnlinje does not ask about effect',
      'expected', '14|14 days|f|7', 'actual', v_txt, 'pass', v_txt = '14|14 days|f|7');

    -- 3 ---------------------------------------------------------------- the second cycle
    update app.rounds set status = 'lukket', frozen_at = now() where id = v_g1;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_g2m, 'planlagt', '2096-09-01 09:00+02', '2096-09-08 09:00+02') returning id into v_g2;
    set constraints all immediate;
    v_txt := exists (select 1 from app.round_extra_questions x where x.round_id = v_g2 and x.extra_key = 'tiltak_effekt')::text;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'with an earlier grunnlinje closed, the next asks about effect',
      'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

    -- 4 ---------------------------------------------------------------- a saved standard
    insert into app.survey_defaults (org_id, close_days_grunnlinje) values (v_org, 10);
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_g2m, 'planlagt', '2096-10-06 09:00+02', '2096-10-13 09:00+02') returning id into v_closed;
    set constraints all immediate;
    v_txt := (select close_after_days::text || '|' || exists (select 1 from app.round_extra_questions x where x.round_id = v_closed and x.extra_key = 'tiltak_effekt')::text from app.rounds where id = v_closed);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a saved standard''s window is kept, and the effect question still comes',
      'expected', '10|true', 'actual', v_txt, 'pass', v_txt = '10|true');

    -- 7 ---------------------------------------------------------------- outside the standard
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    perform public.save_survey_defaults(v_org, '{"close_days_grunnlinje": 12, "close_days_puls": 7, "reminder_day": 2,
      "final_reminder": true, "quiet_hours": true, "comment_policy": "lave", "allow_dialogue": true,
      "extras": ["anbefaling", "krenkende", "vold", "apent_felt"]}'::jsonb);
    v_txt := (select close_after_days::text from app.rounds where id = v_closed) || '|'
      || exists (select 1 from app.round_extra_questions x where x.round_id = v_closed and x.extra_key = 'tiltak_effekt')::text;
    perform public.set_round_extras(v_closed, array['anbefaling', 'krenkende', 'vold', 'apent_felt'], null);
    v_txt := v_txt || '|' || exists (select 1 from app.round_extra_questions x where x.round_id = v_closed and x.extra_key = 'tiltak_effekt')::text;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'saving the standard moves the round and keeps the effect question; the leader''s own choice removes it',
      'expected', '12|true|false', 'actual', v_txt, 'pass', v_txt = '12|true|false');

    -- 5 ---------------------------------------------------------------- the result
    v_txt := has_function_privilege('anon', 'public.results_effect(uuid)', 'execute')::text;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_txt := v_txt || ',' || coalesce(public.results_effect(v_g2)->>'error', 'ok');       -- planned
    v_txt := v_txt || ',' || coalesce(public.results_effect(v_g1)->>'error', 'ok');       -- did not ask it
    -- close the second: three answer it (below k), then six
    update app.rounds set status = 'lukket', frozen_at = now() where id = v_g2;
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, v_g2, v_grp, '2096-09-02 10:00+02' from generate_series(1, 6);
    insert into app.extra_answers (response_id, extra_key, option_ordinal)
    select x.id, 'tiltak_effekt', (array[5, 4, 2])[x.n]
    from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_g2) x where x.n <= 3;
    v_txt := v_txt || ',' || coalesce(public.results_effect(v_g2)->>'status', '-');
    insert into app.extra_answers (response_id, extra_key, option_ordinal)
    select x.id, 'tiltak_effekt', (array[4, 3, 1])[x.n - 3]
    from (select r.id, row_number() over (order by r.id) n from app.responses r where r.round_id = v_g2) x where x.n > 3;
    v_json := public.results_effect(v_g2);
    v_txt := v_txt || ',' || concat_ws('/', v_json->>'n', v_json->>'agree', v_json->>'mean');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'results_effect: no anon; nothing open or unasked; below k the sentence; at k 3 of 6 agree, mean 3.2',
      'expected', 'false,not_available,not_available,insufficient_data,6/50/3.2', 'actual', v_txt,
      'pass', v_txt = 'false,not_available,not_available,insufficient_data,6/50/3.2');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 6 ------------------------------------------------------------------ nothing left
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org union all select id::text from auth.users where id = v_dl) x;
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._efi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._efi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._efi;
  if v_failed is not null then raise exception 'effect invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'effect invariants: expected 7 rows, got %', v_count; end if;
end $$;

drop table public._efi;
