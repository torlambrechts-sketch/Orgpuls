-- k_floor_invariants.sql — the anonymity floor of three and the round's own threshold (0150, D-198).
--
-- The owner decided on 2 October 2026 that an organisation may lower its threshold to three for
-- small teams; five stays the default and the recommendation. What must hold:
--
--   * the floor is a function returning 3, and the default stays 5 (1, 2)
--   * the daglig leder may set 3 and not 2; another role may set nothing (3, 4, 5)
--   * every change is logged with who, from and to (6)
--   * a round takes the organisation's threshold when it is made (7)
--   * a group of three answers is shown in a round whose k is 3 (8) and withheld in a round whose
--     k is 5 (9)
--   * a change of the setting after a round has closed changes neither its k nor what it shows:
--     raising does not hide what was shown (10), lowering does not expose what was withheld (11)
--   * a planned round follows the setting both ways (12); the update that opens it freezes it, and
--     a later lowering leaves it (13); nobody may change an opened round's k (14), and an update
--     naming a lower k on a planned round still gets the organisation's (15)
--   * the respondent and the invitation preview are told the round's k, not the current setting (16)
--   * complementary suppression holds at k = 3 (17, 18)
--   * comments follow the round's k: a thread from a group of three is shown in a k = 3 round, one
--     from a group of two is not, and one from a group of three in a k = 5 round is not — asked for
--     one round or for all (19, 20); a leader may answer only the first (21)
--   * the segment rule floors at three (22)
--   * the frozen k lets PostgreSQL's own referential maintenance through: ON DELETE SET NULL on a
--     frozen round, and the cascade that deletes it with its measurement (23)
--   * nothing written here survives (24)
--
-- The synthetic organisation is built inside a block that is rolled back. Every row must read
-- pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/k_floor_invariants.sql

create unlogged table if not exists public._kfl(seq int, name text, expected text, actual text, pass bool);
truncate public._kfl;

do $$
declare
  v_org  uuid := '00000000-0000-4000-8000-0000000c3f00';
  v_meas uuid := '00000000-0000-4000-8000-0000000c3f01';
  v_dl   uuid := '00000000-0000-4000-8000-0000000c3f02';
  v_vo   uuid := '00000000-0000-4000-8000-0000000c3f03';
  v_g    jsonb := '{}';
  v_rows jsonb := '[]';
  v_r3   uuid; v_r5 uuid; v_rp uuid; v_rq uuid; v_rs uuid; v_rc uuid;
  v_rid  uuid;
  v_gid  uuid;
  v_i    int;
  v_n    int;
  v_txt  text;
  v_json jsonb;
  v_ok   boolean;
  v_name text;
  v_t1   uuid; v_t2 uuid; v_t3 uuid;
  v_plan jsonb;
  v_cell jsonb;
  v_rest int;
begin
  -- 1 ------------------------------------------------------------------ the floor
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the floor is app.k_floor() = 3, a function; the default app.k_min() stays 5',
    'expected', '3,5,immutable', 'actual', app.k_floor() || ',' || app.k_min() || ',' ||
      (select case p.provolatile when 'i' then 'immutable' else 'volatile' end from pg_proc p where p.oid = 'app.k_floor()'::regprocedure),
    'pass', app.k_floor() = 3 and app.k_min() = 5
            and (select p.provolatile = 'i' from pg_proc p where p.oid = 'app.k_floor()'::regprocedure));

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Terskel Tre AS', '999000333', 20);

    -- 2 --------------------------------------------------------- a new org starts at 5
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a new organisation starts at 5, and signup gives it app.k_min()',
      'expected', '5,5,true', 'actual', (select threshold from app.organizations where id = v_org) || ',' || app.k_threshold(v_org)
        || ',' || (pg_get_functiondef('public.create_organisation(text,text,integer,text)'::regprocedure) ~ 'app\.k_min\(\)')::text,
      'pass', (select threshold from app.organizations where id = v_org) = 5 and app.k_threshold(v_org) = 5
              and pg_get_functiondef('public.create_organisation(text,text,integer,text)'::regprocedure) ~ 'app\.k_min\(\)');

    for v_i in 1..6 loop
      v_name := (array['G1', 'G2', 'A', 'B', 'C', 'D'])[v_i];
      insert into app.groups (id, org_id, name)
      values (('00000000-0000-4000-8000-0000000c3f' || lpad((10 + v_i)::text, 2, '0'))::uuid, v_org, v_name)
      returning id into v_gid;
      v_g := v_g || jsonb_build_object(v_name, v_gid);
    end loop;

    insert into auth.users (id, email) values (v_dl, 'dl@kfloor-test.example'), (v_vo, 'vo@kfloor-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_vo, 'VO');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_org, 'grunnlinje', 2026, 'Probe');

    -- 3 ------------------------------------------------------ the daglig leder: not 2
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    begin
      set local role authenticated;
      update app.organizations set threshold = 2 where id = v_org;
      reset role;
      v_txt := 'ACCEPTED';
    exception when check_violation then
      reset role;
      v_txt := 'check_violation';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a threshold of 2 is refused by the database',
      'expected', 'check_violation, still 5', 'actual', v_txt || ', still ' || (select threshold from app.organizations where id = v_org),
      'pass', v_txt = 'check_violation' and (select threshold from app.organizations where id = v_org) = 5);

    -- 4 ---------------------------------------------------------- the daglig leder: 3
    set local role authenticated;
    with u as (update app.organizations set threshold = 3 where id = v_org returning id) select count(*) into v_n from u;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the daglig leder may set 3, and the effective threshold is 3',
      'expected', '1 row, k 3', 'actual', v_n || ' row, k ' || app.k_threshold(v_org),
      'pass', v_n = 1 and app.k_threshold(v_org) = 3);

    -- 5 -------------------------------------------------------- nobody else may change it
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    with u as (update app.organizations set threshold = 10 where id = v_org returning id) select count(*) into v_n from u;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a verneombud changes nothing',
      'expected', '0 rows, still 3', 'actual', v_n || ' rows, still ' || (select threshold from app.organizations where id = v_org),
      'pass', v_n = 0 and (select threshold from app.organizations where id = v_org) = 3);
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);

    -- 6 ------------------------------------------------------------------ the record
    select l.change->'threshold' || jsonb_build_object('by', l.changed_by) into v_json
    from app.survey_defaults_log l where l.org_id = v_org and l.change ? 'threshold'
    order by l.id desc limit 1;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the change is logged: who, from and to (survey_defaults_log, read by Målinger)',
      'expected', '5 -> 3 by the daglig leder, one row', 'actual',
        coalesce(v_json->>'from', '?') || ' -> ' || coalesce(v_json->>'to', '?') || case when (v_json->>'by')::uuid = v_dl then ' by the daglig leder' else ' by someone else' end
        || ', ' || (select count(*) from app.survey_defaults_log l where l.org_id = v_org) || ' row',
      'pass', (v_json->>'from')::int = 5 and (v_json->>'to')::int = 3 and (v_json->>'by')::uuid = v_dl
              and (select count(*) from app.survey_defaults_log l where l.org_id = v_org) = 1);

    -- two closed rounds with the same shape: G1 3 answers, G2 3 answers. R3 made at k 3, R5 at k 5.
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at, k)
    values (v_org, v_meas, 'lukket', '2026-09-01 08:00+02', '2026-09-08 20:00+02', '2026-09-08 20:00+02', 10)
    returning id into v_r3;
    update app.organizations set threshold = 5 where id = v_org;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_meas, 'lukket', '2026-09-10 08:00+02', '2026-09-17 20:00+02', '2026-09-17 20:00+02')
    returning id into v_r5;
    foreach v_rid in array array[v_r3, v_r5] loop
      for v_name in select unnest(array['G1', 'G2']) loop
        for v_i in 1..3 loop
          with resp as (
            insert into app.responses (org_id, round_id, group_id, submitted_hour)
            values (v_org, v_rid, (v_g->>v_name)::uuid, '2026-09-02 10:00+02') returning id
          )
          insert into app.answers (response_id, factor_key, ordinal, value)
          select resp.id, 'ytring', o, 4 from resp cross join generate_series(1, 3) o;
        end loop;
      end loop;
    end loop;

    -- 7 ----------------------------------------------------- a round takes the setting
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a round takes its organisation''s threshold when made, whatever the insert names',
      'expected', 'R3 k 3, R5 k 5', 'actual', 'R3 k ' || (select k from app.rounds where id = v_r3) || ', R5 k ' || (select k from app.rounds where id = v_r5),
      'pass', (select k from app.rounds where id = v_r3) = 3 and (select k from app.rounds where id = v_r5) = 5);

    -- 8 --------------------------------------------------- three answers at k 3: shown
    v_json := public.results_by_group(v_r3);
    select string_agg((g->>'group_name') || ':' || (g->>'status') || ':' || coalesce(g->>'n', '-'), ' ' order by g->>'group_name') into v_txt
    from jsonb_array_elements(v_json->'groups') g;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a group of three answers is shown in a round whose k is 3',
      'expected', 'threshold 3: G1:ok:3 G2:ok:3', 'actual', 'threshold ' || coalesce(v_json->>'threshold', '?') || ': ' || coalesce(v_txt, v_json::text),
      'pass', (v_json->>'threshold')::int = 3 and v_txt = 'G1:ok:3 G2:ok:3');

    -- 9 ------------------------------------------------- three answers at k 5: withheld
    v_json := public.results_by_group(v_r5);
    select string_agg((g->>'group_name') || ':' || (g->>'status'), ' ' order by g->>'group_name') into v_txt
    from jsonb_array_elements(v_json->'groups') g;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the same group is withheld in a round whose k is 5',
      'expected', 'threshold 5: G1:insufficient_data G2:insufficient_data', 'actual', 'threshold ' || coalesce(v_json->>'threshold', '?') || ': ' || coalesce(v_txt, v_json::text),
      'pass', (v_json->>'threshold')::int = 5 and v_txt = 'G1:insufficient_data G2:insufficient_data');

    -- 10 -------------------------------------- raising after close changes no closed round
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'raising the setting (now 5) leaves a closed k 3 round at 3, still shown',
      'expected', 'k 3, G1 ok', 'actual', 'k ' || (select k from app.rounds where id = v_r3) || ', G1 ' ||
        (select rel.status from app.group_release(v_r3) rel where rel.group_id = (v_g->>'G1')::uuid),
      'pass', (select k from app.rounds where id = v_r3) = 3
              and (select rel.status from app.group_release(v_r3) rel where rel.group_id = (v_g->>'G1')::uuid) = 'ok');

    -- 11 ------------------------------------- lowering after close exposes nothing
    update app.organizations set threshold = 3 where id = v_org;
    v_json := public.results_by_group(v_r5);
    select string_agg((g->>'group_name') || ':' || (g->>'status'), ' ' order by g->>'group_name') into v_txt
    from jsonb_array_elements(v_json->'groups') g;
    -- the whole has six answers, which clears 5: the organisation's figure is shown, its groups are not
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'lowering the setting to 3 after a k 5 round closed exposes none of its groups',
      'expected', 'k 5, summary ok, G1:insufficient_data G2:insufficient_data',
      'actual', 'k ' || (select k from app.rounds where id = v_r5) || ', summary ' || coalesce(public.results_summary(v_r5)->>'status', '?') || ', ' || coalesce(v_txt, '?'),
      'pass', (select k from app.rounds where id = v_r5) = 5 and app.k_round(v_r5) = 5
              and v_txt = 'G1:insufficient_data G2:insufficient_data'
              and public.results_summary(v_r5)->>'status' = 'ok'
              and (select bool_and(rel.status <> 'ok') from app.group_release(v_r5) rel));

    -- 12 ------------------------------------------ a planned round follows the setting
    insert into app.rounds (org_id, measurement_id, status) values (v_org, v_meas, 'planlagt') returning id into v_rp;
    v_txt := (select k from app.rounds where id = v_rp)::text;
    update app.organizations set threshold = 6 where id = v_org;
    v_txt := v_txt || ',' || (select k from app.rounds where id = v_rp);
    update app.organizations set threshold = 4 where id = v_org;
    v_txt := v_txt || ',' || (select k from app.rounds where id = v_rp);
    update app.organizations set threshold = 5 where id = v_org;
    v_txt := v_txt || ',' || (select k from app.rounds where id = v_rp);
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a planned round follows the setting, up and down (3, 6, 4, 5)',
      'expected', '3,6,4,5', 'actual', v_txt, 'pass', v_txt = '3,6,4,5');

    -- 13 ---------------------------------------------- opening freezes it
    update app.rounds set status = 'apen', opens_at = now() - interval '1 hour', closes_at = now() + interval '6 days' where id = v_rp;
    update app.organizations set threshold = 3 where id = v_org;
    v_txt := (select k from app.rounds where id = v_rp)::text;
    update app.rounds set status = 'lukket', closes_at = now(), frozen_at = now() where id = v_rp;
    v_txt := v_txt || ',' || (select k from app.rounds where id = v_rp) || ',' || app.k_round(v_rp);
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'opened at 5, lowered to 3 while open: the round keeps 5, open and closed',
      'expected', '5,5,5', 'actual', v_txt, 'pass', v_txt = '5,5,5');

    -- 14 ---------------------------------------------- nobody changes an opened round's k
    begin
      update app.rounds set k = 3 where id = v_rp;
      v_txt := 'ACCEPTED';
    exception when restrict_violation then
      v_txt := 'restrict_violation';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'an opened round''s k cannot be changed, not even by the database owner',
      'expected', 'restrict_violation, k 5', 'actual', v_txt || ', k ' || (select k from app.rounds where id = v_rp),
      'pass', v_txt = 'restrict_violation' and (select k from app.rounds where id = v_rp) = 5);

    -- 15 ------------------------------------- a planned round's k is the organisation's
    update app.organizations set threshold = 5 where id = v_org;
    insert into app.rounds (org_id, measurement_id, status) values (v_org, v_meas, 'planlagt') returning id into v_rq;
    update app.rounds set k = 3 where id = v_rq;
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'an update naming k = 3 on a planned round leaves the organisation''s 5',
      'expected', '5', 'actual', (select k from app.rounds where id = v_rq)::text, 'pass', (select k from app.rounds where id = v_rq) = 5);

    -- 16 ------------------------------------- the respondent is told the round's k
    update app.rounds set status = 'apen', opens_at = now() - interval '1 hour', closes_at = now() + interval '6 days' where id = v_rq;
    insert into app.invitations (org_id, round_id, token_hash, expires_at)
    values (v_org, v_rq, extensions.digest('kfloor-probe-token-0000000001', 'sha256'), now() + interval '6 days');
    update app.organizations set threshold = 3 where id = v_org;
    v_json := public.respond_form('kfloor-probe-token-0000000001');
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'respond_form and the invitation preview state the round''s k (5), not the setting (3)',
      'expected', '5,5', 'actual', coalesce(v_json->>'threshold', v_json->>'error', '?') || ',' || coalesce(app.round_preview_json(v_rq)->>'k', '?'),
      'pass', (v_json->>'threshold')::int = 5 and (app.round_preview_json(v_rq)->>'k')::int = 5);

    -- 17, 18 ----------------------------------------- complementary suppression at k 3
    -- A 2, B 3, C 4, D 5: A is withheld; its 2 answers are under 3, so B (the smallest shown) is given up
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_meas, 'lukket', '2026-08-01 08:00+02', '2026-08-08 20:00+02', '2026-08-08 20:00+02')
    returning id into v_rs;
    v_plan := '[["A",2],["B",3],["C",4],["D",5]]';
    for v_cell in select * from jsonb_array_elements(v_plan) loop
      for v_i in 1..(v_cell->>1)::int loop
        with resp as (
          insert into app.responses (org_id, round_id, group_id, submitted_hour)
          values (v_org, v_rs, (v_g->>(v_cell->>0))::uuid, '2026-08-02 10:00+02') returning id
        )
        insert into app.answers (response_id, factor_key, ordinal, value)
        select resp.id, 'ytring', o, 3 from resp cross join generate_series(1, 3) o;
      end loop;
    end loop;
    select string_agg(g.name || ':' || rel.status, ' ' order by g.name) into v_txt
    from app.group_release(v_rs) rel join app.groups g on g.id = rel.group_id;
    v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'at k 3 a group of two is withheld and the smallest shown group with it',
      'expected', 'k 3: A:insufficient_data B:protected C:ok D:ok', 'actual', 'k ' || app.k_round(v_rs) || ': ' || coalesce(v_txt, '?'),
      'pass', app.k_round(v_rs) = 3 and v_txt = 'A:insufficient_data B:protected C:ok D:ok');

    v_json := public.results_by_group(v_rs);
    select (public.results_summary(v_rs)->>'n')::int - coalesce(sum((g->>'n')::int), 0) into v_rest
    from jsonb_array_elements(v_json->'groups') g where g->>'status' = 'ok';
    v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'at k 3 the whole minus the published groups is at least 3 answers',
      'expected', '5', 'actual', coalesce(v_rest::text, '?'), 'pass', v_rest >= 3 and v_rest = 5);

    -- 19, 20, 21 ------------------------------------------------ comments at k 3
    -- Rc (k 3): G1 three answers, G2 two. One comment from each (alpha, beta). R5 (k 5): one from G1 (gamma).
    -- (the bodies name no group: a group's name in a comment is masked, 0095)
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_meas, 'lukket', '2026-07-01 08:00+02', '2026-07-08 20:00+02', '2026-07-08 20:00+02')
    returning id into v_rc;
    for v_name, v_n in select * from (values ('G1', 3), ('G2', 2)) x loop
      for v_i in 1..v_n loop
        insert into app.responses (org_id, round_id, group_id, submitted_hour)
        values (v_org, v_rc, (v_g->>v_name)::uuid, '2026-07-02 10:00+02');
      end loop;
    end loop;
    insert into app.response_comments (response_id, factor_key, ordinal, body)
    select x.id, 'ytring', 1, 'kfloor-probe ' || x.g
    from (
      (select r.id, 'alpha' as g from app.responses r where r.round_id = v_rc and r.group_id = (v_g->>'G1')::uuid limit 1)
      union all (select r.id, 'beta' from app.responses r where r.round_id = v_rc and r.group_id = (v_g->>'G2')::uuid limit 1)
      union all (select r.id, 'gamma' from app.responses r where r.round_id = v_r5 and r.group_id = (v_g->>'G1')::uuid limit 1)
    ) x;
    insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
    select v_org, rc.response_id, rc.factor_key, rc.ordinal, extensions.digest(rc.body || '-key-000000000000000000000', 'sha256'),
           '2026-07-02 10:00+02'
    from app.response_comments rc where rc.body like 'kfloor-probe %';
    select ct.id into v_t1 from app.comment_threads ct join app.response_comments rc using (response_id, factor_key, ordinal) where rc.body = 'kfloor-probe alpha';
    select ct.id into v_t2 from app.comment_threads ct join app.response_comments rc using (response_id, factor_key, ordinal) where rc.body = 'kfloor-probe beta';
    select ct.id into v_t3 from app.comment_threads ct join app.response_comments rc using (response_id, factor_key, ordinal) where rc.body = 'kfloor-probe gamma';

    select string_agg(t->>'opening', ' | ' order by t->>'opening') into v_txt
    from jsonb_array_elements(public.conversations(v_rc)->'threads') t;
    v_rows := v_rows || jsonb_build_object('seq', 19, 'name', 'in a k 3 round the comment from a group of three is shown, from a group of two it is absent',
      'expected', 'kfloor-probe alpha', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = 'kfloor-probe alpha');

    select string_agg(t->>'opening', ' | ' order by t->>'opening') into v_txt
    from jsonb_array_elements(public.conversations(null)->'threads') t where t->>'opening' like 'kfloor-probe %';
    v_rows := v_rows || jsonb_build_object('seq', 20, 'name', 'across rounds each thread meets its own round''s k: G1 of R5 (k 5, three answers) stays absent',
      'expected', 'kfloor-probe alpha', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = 'kfloor-probe alpha');

    v_rows := v_rows || jsonb_build_object('seq', 21, 'name', 'a leader may answer the shown thread only (thread_visible)',
      'expected', 'true,false,false', 'actual', app.thread_visible(v_t1) || ',' || app.thread_visible(v_t2) || ',' || app.thread_visible(v_t3),
      'pass', app.thread_visible(v_t1) and not app.thread_visible(v_t2) and not app.thread_visible(v_t3));

    -- 22 ------------------------------------------------------------ the segment rule
    v_rows := v_rows || jsonb_build_object('seq', 22, 'name', 'a segment needs the round''s k on both sides, never fewer than three',
      'expected', 'true,false,false,false', 'actual',
        app.segment_cell_ok(3, 3, 6) || ',' || app.segment_cell_ok(2, 2, 6) || ',' || app.segment_cell_ok(1, 2, 4) || ',' || app.segment_cell_ok(5, 3, 8),
      'pass', app.segment_cell_ok(3, 3, 6) and not app.segment_cell_ok(2, 2, 6) and not app.segment_cell_ok(1, 2, 4)
              and not app.segment_cell_ok(5, 3, 8));

    -- 23 ------------------------------------------- referential maintenance passes the freeze
    perform set_config('request.jwt.claims', '', true);
    begin
      update app.rounds set intro_by = v_dl where id = v_rp;   -- a frozen round, its k untouched
      delete from app.memberships where user_id = v_dl;
      delete from auth.users where id = v_dl;                   -- intro_by → null: an UPDATE PostgreSQL issues
      v_ok := (select intro_by is null and k = 5 from app.rounds where id = v_rp);
      delete from app.measurements where id = v_meas;           -- every round, frozen or not, goes by cascade
      v_txt := case when v_ok then 'set null, ' else 'NOT NULLED, ' end
               || (select count(*) from app.rounds where org_id = v_org) || ' rounds left';
    exception when others then
      v_txt := 'BLOCKED: ' || left(sqlerrm, 80);
    end;
    v_rows := v_rows || jsonb_build_object('seq', 23, 'name', 'ON DELETE SET NULL on a frozen round and the cascade that deletes it pass',
      'expected', 'set null, 0 rounds left', 'actual', v_txt, 'pass', v_txt = 'set null, 0 rounds left');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 24 ---------------------------------------------------------------- nothing left
  select count(*) into v_n from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_vo)
    union all select org_id::text from app.survey_defaults_log where org_id = v_org
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 24, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._kfl
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._kfl order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._kfl;
  if v_failed is not null then
    raise exception 'k floor invariants failed: %', v_failed;
  end if;
  if v_count <> 24 then
    raise exception 'k floor invariants: expected 24 rows, got %', v_count;
  end if;
end $$;

drop table public._kfl;
