-- hardening_invariants.sql — the P8 security pass (0042), proved against the live schema.
--
--   * every result reader finds an open round as it finds no round: not_available (1)
--   * nobody but a definer function reads or writes invitations: RLS, no policy, no grant (2)
--   * a client may change four of a round's settings, never its status, dates or existence (3)
--   * a group that holds responses cannot be deleted (4)
--   * renaming a group does not change which of two equal groups is protected (5)
--   * a statement is released per group from the people who answered it: a group where
--     most skipped it keeps its other statements and loses that one (6), and a factor is
--     released only where every statement of it is (7)
--   * the withheld answers to a statement are none or at least k: the next group is
--     protected for that statement when they are not (8), and the house's figure for a
--     statement needs k answers (9)
--   * "wrote" counts writers in released groups only (10)
--   * one write path: one submit_response, and a comment opens its thread (11)
--   * nothing written here survives (12)
--
-- Runs as the design fixture's daglig leder against a synthetic organisation built inside
-- a block that is rolled back. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hardening_invariants.sql

create unlogged table if not exists public._hard(seq int, name text, expected text, actual text, pass bool);
truncate public._hard;

do $$
declare
  v_fix   uuid := '00000000-0000-4000-8000-000000000001';
  v_org   uuid := '00000000-0000-4000-8000-00000000d0de';
  v_meas  uuid := '00000000-0000-4000-8000-00000000d0d1';
  v_dl    uuid := '00000000-0000-4000-8000-0000000d0001';
  v_fixdl uuid;
  v_open  uuid;
  v_round uuid;
  v_ga    uuid := '00000000-0000-4000-8000-00000000d101';
  v_gb    uuid := '00000000-0000-4000-8000-00000000d102';
  v_gc    uuid := '00000000-0000-4000-8000-00000000d103';
  v_rows  jsonb := '[]';
  v_json  jsonb;
  v_txt   text;
  v_msg   text;
  v_n     int;
  v_i     int;
  v_resp  uuid;
  rw      record;
begin
  -- 1 ------------------------------------------------------------ open rounds
  select m.user_id into v_fixdl from app.memberships m
  where m.org_id = v_fix and m.active and m.role = 'daglig_leder' order by m.id limit 1;
  select r.id into v_open from app.rounds r where r.org_id = v_fix and r.status = 'apen' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fixdl, 'role', 'authenticated')::text, true);
  select string_agg(f || '=' || coalesce(res->>'error', 'ANSWERED'), ' ' order by f) into v_txt
  from (values
    ('summary', public.results_summary(v_open)), ('by_group', public.results_by_group(v_open)),
    ('items', public.results_items(v_open)), ('importance', public.results_importance(v_open)),
    ('recommendation', public.results_recommendation(v_open)), ('themes', public.comment_themes(v_open))
  ) x(f, res);
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'every result reader refuses an open round',
    'expected', 'all not_available', 'actual', coalesce(v_txt, 'no open round in the fixture'),
    'pass', v_open is not null and v_txt !~ 'ANSWERED' and v_txt ~ 'not_available');

  -- 2 ------------------------------------------------------------ invitations
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'invitations: RLS, no policy, no client privilege',
    'expected', 'rls, 0 policies, none',
    'actual', (select relrowsecurity::text from pg_class where oid = 'app.invitations'::regclass) || ', '
      || (select count(*) from pg_policies where schemaname = 'app' and tablename = 'invitations') || ' policies, '
      || case when exists (select 1 from information_schema.column_privileges
                           where table_schema = 'app' and table_name = 'invitations'
                             and grantee in ('authenticated', 'anon', 'PUBLIC'))
                then 'GRANTED' else 'none' end,
    'pass', (select relrowsecurity from pg_class where oid = 'app.invitations'::regclass)
      and not exists (select 1 from pg_policies where schemaname = 'app' and tablename = 'invitations')
      and not exists (select 1 from information_schema.column_privileges
                      where table_schema = 'app' and table_name = 'invitations'
                        and grantee in ('authenticated', 'anon', 'PUBLIC')));

  -- 3 ------------------------------------------------------------------ rounds
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'rounds: four settings writable, status and dates not',
    'expected', 'settings yes; status, opens_at, closes_at, insert, delete no',
    'actual', 'settings ' || has_column_privilege('authenticated', 'app.rounds', 'comment_policy', 'update')
      || '; status ' || has_column_privilege('authenticated', 'app.rounds', 'status', 'update')
      || ', opens_at ' || has_column_privilege('authenticated', 'app.rounds', 'opens_at', 'update')
      || ', closes_at ' || has_column_privilege('authenticated', 'app.rounds', 'closes_at', 'update')
      || ', insert ' || has_table_privilege('authenticated', 'app.rounds', 'insert')
      || ', delete ' || has_table_privilege('authenticated', 'app.rounds', 'delete'),
    'pass', has_column_privilege('authenticated', 'app.rounds', 'comment_policy', 'update')
      and has_column_privilege('authenticated', 'app.rounds', 'close_after_days', 'update')
      and not has_column_privilege('authenticated', 'app.rounds', 'status', 'update')
      and not has_column_privilege('authenticated', 'app.rounds', 'opens_at', 'update')
      and not has_column_privilege('authenticated', 'app.rounds', 'closes_at', 'update')
      and not has_table_privilege('authenticated', 'app.rounds', 'insert')
      and not has_table_privilege('authenticated', 'app.rounds', 'delete'));

  begin
    -- a closed round: A 6, B 6, C 6 respondents. Everybody answers ytring 1 and 3; on
    -- ytring 2, five in A skip it, and four in C do.
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Herding AS', '999000333', 18);
    insert into app.groups (id, org_id, name) values (v_ga, v_org, 'Zeta'), (v_gb, v_org, 'Beta'), (v_gc, v_org, 'Alfa');
    insert into auth.users (id, email) values (v_dl, 'dl@hard-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder');
    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_org, 'grunnlinje', 2026, 'Probe');
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_meas, 'lukket', '2026-09-01 08:00+02', '2026-09-08 20:00+02', '2026-09-08 20:00+02')
    returning id into v_round;
    for rw in select * from (values (v_ga, 5), (v_gb, 0), (v_gc, 4)) x(g, skips) loop
      for v_i in 1..6 loop
        insert into app.responses (org_id, round_id, group_id, submitted_hour)
        values (v_org, v_round, rw.g, '2026-09-02 10:00+02') returning id into v_resp;
        insert into app.answers (response_id, factor_key, ordinal, value)
        select v_resp, 'ytring', o, 3 from generate_series(1, 3) o
        where o <> 2 or v_i > rw.skips;
        if rw.g = v_gc and v_i = 1 then
          insert into app.response_comments (response_id, factor_key, ordinal, body)
          values (v_resp, 'ytring', 1, 'probe');
        end if;
      end loop;
    end loop;

    -- 4 --------------------------------------------------------------- group delete
    begin
      delete from app.groups where id = v_gb;
      v_msg := 'DELETED';
    exception when foreign_key_violation then
      v_msg := 'refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a group that holds responses cannot be deleted',
      'expected', 'refused', 'actual', v_msg, 'pass', v_msg = 'refused');

    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);

    -- 6, 7, 8 ------------------------------------------------------- statement cells
    select string_agg(g.name || ':' || c.status, ' ' order by g.name) into v_txt
    from app.cell_release(v_round) c join app.groups g on g.id = c.group_id
    where c.factor_key = 'ytring' and c.ordinal = 2;
    v_rows := v_rows || jsonb_build_object('seq', 6,
      'name', 'ytring 2: one answer in Zeta and two in Alfa are withheld, not released',
      'expected', 'Alfa:insufficient_data Beta:protected Zeta:insufficient_data', 'actual', v_txt,
      'pass', v_txt = 'Alfa:insufficient_data Beta:protected Zeta:insufficient_data');

    select string_agg(g.name || ':' || c.status, ' ' order by g.name) into v_txt
    from app.cell_release(v_round) c join app.groups g on g.id = c.group_id
    where c.factor_key = 'ytring' and c.ordinal = 0;
    v_rows := v_rows || jsonb_build_object('seq', 7,
      'name', 'a factor is released only where every statement of it is',
      'expected', 'Alfa:insufficient_data Beta:protected Zeta:insufficient_data', 'actual', v_txt,
      'pass', v_txt = 'Alfa:insufficient_data Beta:protected Zeta:insufficient_data');

    v_json := public.results_items(v_round);
    select string_agg(g->>'group_name' || '=' || coalesce((
             select string_agg(i->>'ordinal', ',' order by (i->>'ordinal')::int)
             from jsonb_array_elements(g->'items') i where i->>'key' = 'ytring'), '-'), ' ' order by g->>'group_name')
      into v_txt
    from jsonb_array_elements(v_json->'groups') g;
    v_rows := v_rows || jsonb_build_object('seq', 8,
      'name', 'results_items: each group keeps the statements it answered by k, and the rest are withheld',
      'expected', 'Alfa=1,3 Beta=1,3 Zeta=1,3', 'actual', v_txt, 'pass', v_txt = 'Alfa=1,3 Beta=1,3 Zeta=1,3');

    -- the house: ytring 2 has 9 answers (1 + 6 + 2), so it is shown; the withheld part of it
    -- (Zeta and Alfa, 3 answers, plus Beta, protected) is 9, never 3
    select string_agg(i->>'ordinal', ',' order by (i->>'ordinal')::int) into v_txt
    from jsonb_array_elements(v_json->'items') i where i->>'key' = 'ytring';
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the house shows a statement only with k answers',
      'expected', '1,2,3', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = '1,2,3');

    -- 10 --------------------------------------------------------------- themes
    v_json := public.comment_themes(v_round);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', '"wrote" counts writers in released groups only',
      'expected', 'counted over released responses',
      'actual', coalesce(v_json->>'wrote', v_json->>'status'),
      'pass', (v_json->>'wrote')::int = 1);

    -- 5 ---------------------------------------------------------------- renames
    -- a second closed round where Zeta and Beta tie at 6 and Alfa has 1: one of the two
    -- equal groups is protected, and renaming them does not change which
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_meas, 'lukket', '2026-10-01 08:00+02', '2026-10-08 20:00+02', '2026-10-08 20:00+02')
    returning id into v_round;
    for rw in select * from (values (v_ga, 6), (v_gb, 6), (v_gc, 1)) x(g, n) loop
      for v_i in 1..rw.n loop
        insert into app.responses (org_id, round_id, group_id, submitted_hour)
        values (v_org, v_round, rw.g, '2026-10-02 10:00+02');
      end loop;
    end loop;
    select rel.group_id::text into v_txt from app.group_release(v_round) rel where rel.status = 'protected';
    -- by name, Beta (v_gb) came first; these names put v_ga first, so a rule by name flips
    update app.groups set name = 'Zzz' where id = v_gb;
    update app.groups set name = 'Aaa' where id = v_ga;
    select rel.group_id::text into v_msg from app.group_release(v_round) rel where rel.status = 'protected';
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'renaming two equal groups does not change which is protected',
      'expected', coalesce(v_txt, 'one protected'), 'actual', coalesce(v_msg, 'none'),
      'pass', v_txt is not null and v_txt = v_msg);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 11 ------------------------------------------------------------ one write path
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'one submit_response, and it opens a thread per comment',
    'expected', '1 function, opens threads',
    'actual', (select count(*) from pg_proc where proname = 'submit_response') || ' function, '
      || case when (select prosrc from pg_proc where proname = 'submit_response' limit 1) ~ 'comment_threads'
              then 'opens threads' else 'NO THREADS' end,
    'pass', (select count(*) from pg_proc where proname = 'submit_response') = 1
      and (select prosrc from pg_proc where proname = 'submit_response' limit 1) ~ 'comment_threads');

  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'every probe row was rolled back', 'expected', '0 orgs, 0 users',
    'actual', (select count(*) from app.organizations where id = v_org) || ' orgs, '
      || (select count(*) from auth.users where id = v_dl) || ' users',
    'pass', not exists (select 1 from app.organizations where id = v_org) and not exists (select 1 from auth.users where id = v_dl));

  insert into public._hard
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean
  from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._hard order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._hard;
  if v_failed is not null then
    raise exception 'hardening invariants failed: %', v_failed;
  end if;
  if v_count <> 12 then
    raise exception 'hardening invariants: expected 12 rows, got %', v_count;
  end if;
end $$;

drop table public._hard;
