-- former_names_invariants.sql — former employee names stay masked; an organisation with
-- invitations can be deleted (0190, D-206), proved against the live schema.
--
--   * app.employee_former_names is closed to every client (RLS on, no policy, no grant) and holds
--     an organisation and a name, nothing that says whose; the triggers are in place, no client may
--     call their functions, and a demo copy takes the names with the comments (1)
--   * a comment naming a colleague is masked by the real reader (public.conversations) (2)
--   * renamed by hand in Ansatte (a client update as the daglig leder), the old name stays masked in
--     the older comment, though nobody in the register carries it any more (3)
--   * renamed by the Entra sync (entra_sync_apply's own update), the same (4)
--   * deleted by the daglig leder, the person's name stays masked; their invitation stays, without
--     them (5)
--   * the names are the organisation's own: another organisation's patterns do not hold them, and a
--     client cannot read them (6)
--   * nothing about the answer tables' immutability changed: an answer and a comment can be neither
--     changed nor deleted while their response exists, the triggers and foreign keys are as before (7)
--   * an organisation whose invitations were written in the same transaction deletes in one
--     statement (the reported case); so does one with rounds, invitations, employees, responses,
--     answers, comments, conversations and former names, leaving nothing behind; the deletion's own
--     cascade records no name (8)
--   * so does the design fixture's organisation, with everything it holds (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/former_names_invariants.sql

create unlogged table if not exists public._fni(seq int, name text, expected text, actual text, pass bool);
truncate public._fni;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000f901';
  v_org2   uuid := '00000000-0000-4000-8000-00000000f902';
  v_org3   uuid := '00000000-0000-4000-8000-00000000f903';
  v_dl     uuid := '00000000-0000-4000-8000-0000000f9011';
  v_dl2    uuid := '00000000-0000-4000-8000-0000000f9012';
  v_fix    uuid := '00000000-0000-4000-8000-000000000001';
  v_tenant text := '11111111-2222-4333-8444-5555555f9001';
  g1       text := 'aaaaaaaa-0000-4000-8000-00000000f901';
  u1       text := 'bbbbbbbb-0000-4000-8000-00000000f901';
  v_drift  uuid;
  v_meas   uuid;
  v_round  uuid;
  v_gunn   uuid;
  v_halvor uuid;
  v_sigrun uuid;
  v_inv    uuid;
  v_run    uuid;
  v_resp   uuid[] := '{}';
  v_thr    uuid[] := '{}';
  v_invs   uuid[] := '{}';
  v_id     uuid;
  v_i      int;
  v_n      int;
  v_r      jsonb;
  v_txt    text;
  v_rows   jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated"}';
begin
  -- 1 ---------------------------------------------------------------- the catalogue
  select concat_ws('|',
    (select c.relrowsecurity::text from pg_class c where c.oid = 'app.employee_former_names'::regclass),
    (select count(*) from pg_policy p where p.polrelid = 'app.employee_former_names'::regclass),
    (select count(*) from information_schema.role_table_grants
      where table_schema = 'app' and table_name = 'employee_former_names' and grantee in ('anon', 'authenticated', 'PUBLIC')),
    (select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
      where a.attrelid = 'app.employee_former_names'::regclass and a.attnum > 0 and not a.attisdropped),
    (select string_agg(t.tgname, ',' order by t.tgname) from pg_trigger t
      where t.tgname in ('employees_keep_names', 'organizations_rounds_first') and not t.tgisinternal),
    (select bool_or(has_function_privilege(r, f, 'execute'))::text
      from unnest(array['anon', 'authenticated']) r,
           unnest(array['app.employees_keep_names()', 'app.organization_rounds_first()', 'app.mask_patterns(uuid)']) f),
    (select mode || ':' || step from app.demo_copy_plan where table_name = 'employee_former_names'))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'former names: RLS on, no policy, no client grant, org and name only; triggers in place, no client calls them; a demo copy takes them',
    'expected', 'true|0|0|name,org_id|employees_keep_names,organizations_rounds_first|false|copy:21',
    'actual', v_txt, 'pass', v_txt = 'true|0|0|name,org_id|employees_keep_names,organizations_rounds_first|false|copy:21');

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Navnevern AS', '999009901', 9), (v_org2, 'Annet Navnevern AS', '999009902', 3);
    insert into auth.users (id, email) values (v_dl, 'dl@fni-probe.no'), (v_dl2, 'dl2@fni-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina'), (v_dl2, 'Dag');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org2, v_dl2, 'daglig_leder');
    insert into app.groups (org_id, name, sort_order) values (v_org, 'Drift', 1) returning id into v_drift;
    insert into app.entra_tenants (org_id, tenant_id) values (v_org, v_tenant);
    insert into app.employees (org_id, full_name, email, group_id) values (v_org, 'Gunnhild Berg', 'gunnhild@fni-probe.no', v_drift)
      returning id into v_gunn;
    insert into app.employees (org_id, full_name, email, group_id) values (v_org, 'Halvor Moen', 'halvor@fni-probe.no', v_drift)
      returning id into v_halvor;
    insert into app.employees (org_id, full_name, email, group_id)
    select v_org, n, lower(split_part(n, ' ', 1)) || '@fni-probe.no', v_drift
    from unnest(array['Ola Nilsen', 'Per Li', 'Randi Aas', 'Tone Sæther']) n;

    -- the Entra import adds Sigrun, as it adds anyone: through its own run
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_r := public.entra_select_groups(v_org, jsonb_build_array(jsonb_build_object('id', g1, 'name', 'Drift')));
    reset role;
    set local role service_role;
    v_r := public.entra_sync_begin(v_org);
    v_run := (v_r->>'run_id')::uuid;
    v_r := public.entra_sync_apply(v_org, v_run, jsonb_build_object(
      'members', jsonb_build_object('replace', jsonb_build_object(g1, jsonb_build_array(u1))),
      'people', jsonb_build_array(jsonb_build_object('objectId', u1, 'op', 'add', 'fullName', 'Sigrun Dahl', 'email', 'sigrun@fni-probe.no')),
      'place', jsonb_build_array(u1),
      'links', jsonb_build_object('users', 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=f1', 'groups', jsonb_build_array(), 'full', true)));
    reset role;
    select id into v_sigrun from app.employees where org_id = v_org and entra_object_id = u1;

    -- a round with an invitation for everyone, six responses in Drift, three of them with a comment
    -- that names a colleague, each opening a conversation
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '6 days') returning id into v_round;
    for v_id in select e.id from app.employees e where e.org_id = v_org order by e.full_name loop
      insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
      values (v_org, v_round, v_id, extensions.digest('fni-probe-' || v_id::text, 'sha256'), now() + interval '6 days')
      returning id into v_inv;
      v_invs := v_invs || v_inv;
    end loop;
    for v_i in 1..6 loop
      insert into app.responses (org_id, round_id, group_id, submitted_hour)
      values (v_org, v_round, v_drift, date_trunc('hour', now())) returning id into v_id;
      insert into app.answers (response_id, factor_key, ordinal, value) values (v_id, 'kontakt', 1, 3);
      v_resp := v_resp || v_id;
    end loop;
    insert into app.response_comments (response_id, factor_key, ordinal, body) values
      (v_resp[1], 'kontakt', 1, 'Gunnhild Berg tar all æren'),
      (v_resp[2], 'kontakt', 1, 'Dahl lytter aldri'),
      (v_resp[3], 'kontakt', 1, 'Halvor Moens beskjeder kommer for sent');
    for v_i in 1..3 loop
      insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values (v_org, v_resp[v_i], 'kontakt', 1, extensions.digest('fni-thread-' || v_i, 'sha256'), date_trunc('hour', now()))
      returning id into v_id;
      v_thr := v_thr || v_id;
    end loop;
    insert into app.thread_messages (thread_id, author, body, sent_hour)
    values (v_thr[1], 'ansatt', 'Berg vet det', date_trunc('hour', now()));

    -- 2 -------------------------------------------------------------- masked before anyone is renamed
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_r := public.conversations(v_round);
    select string_agg(t->>'opening', ' / ' order by t->>'opening') into v_txt from jsonb_array_elements(v_r->'threads') t;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the reader masks the colleagues the comments name',
      'expected', '⟦n⟧ ⟦n⟧ beskjeder kommer for sent / ⟦n⟧ ⟦n⟧ tar all æren / ⟦n⟧ lytter aldri',
      'actual', coalesce(v_txt, '-'), 'pass', v_txt = '⟦n⟧ ⟦n⟧ beskjeder kommer for sent / ⟦n⟧ ⟦n⟧ tar all æren / ⟦n⟧ lytter aldri');

    -- 3 -------------------------------------------------------------- renamed by hand
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    update app.employees set full_name = 'Ada Strand' where id = v_gunn;
    get diagnostics v_n = row_count;
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_r := public.conversations(v_round);
    select concat_ws('|', v_n,
      (select count(*) from app.employees where org_id = v_org and (full_name ~ 'Gunnhild' or full_name ~ 'Berg')),
      (select t->>'opening' from jsonb_array_elements(v_r->'threads') t where (t->>'id')::uuid = v_thr[1]),
      (select string_agg(m->>'body', '/') from jsonb_array_elements(v_r->'threads') t, jsonb_array_elements(t->'messages') m
        where (t->>'id')::uuid = v_thr[1]),
      (select string_agg(name, ',' order by name) from app.employee_former_names where org_id = v_org))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'renamed in Ansatte: nobody carries the old name, the older comment and reply still mask it',
      'expected', '1|0|⟦n⟧ ⟦n⟧ tar all æren|⟦n⟧ vet det|Gunnhild Berg', 'actual', v_txt,
      'pass', v_txt = '1|0|⟦n⟧ ⟦n⟧ tar all æren|⟦n⟧ vet det|Gunnhild Berg');

    -- 4 -------------------------------------------------------------- renamed in the directory
    set local role service_role;
    v_r := public.entra_sync_begin(v_org);
    v_run := (v_r->>'run_id')::uuid;
    v_r := public.entra_sync_apply(v_org, v_run, jsonb_build_object(
      'people', jsonb_build_array(jsonb_build_object('objectId', u1, 'op', 'update', 'fullName', 'Sigrun Vik', 'email', 'sigrun@fni-probe.no')),
      'links', jsonb_build_object('users', 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=f2', 'full', false)));
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    select concat_ws('|', v_r->'counts'->>'updated',
      (select full_name || ':' || source from app.employees where id = v_sigrun),
      (select t->>'opening' from jsonb_array_elements(public.conversations(v_round)->'threads') t where (t->>'id')::uuid = v_thr[2]),
      (select string_agg(name, ',' order by name) from app.employee_former_names where org_id = v_org))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'renamed by the Entra sync: its own update is caught, the old name stays masked',
      'expected', '1|Sigrun Vik:entra|⟦n⟧ lytter aldri|Gunnhild Berg,Sigrun Dahl', 'actual', v_txt,
      'pass', v_txt = '1|Sigrun Vik:entra|⟦n⟧ lytter aldri|Gunnhild Berg,Sigrun Dahl');

    -- 5 -------------------------------------------------------------- deleted from the register
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    delete from app.employees where id = v_halvor;
    get diagnostics v_n = row_count;
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    select concat_ws('|', v_n,
      (select count(*) from app.invitations where id = any(v_invs) and employee_id is null),
      (select count(*) from app.invitations where id = any(v_invs)),
      (select t->>'opening' from jsonb_array_elements(public.conversations(v_round)->'threads') t where (t->>'id')::uuid = v_thr[3]),
      (select string_agg(name, ',' order by name) from app.employee_former_names where org_id = v_org))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'deleted by the daglig leder: the name stays masked; the invitation stays, without the person',
      'expected', '1|1|7|⟦n⟧ ⟦n⟧ beskjeder kommer for sent|Gunnhild Berg,Halvor Moen,Sigrun Dahl', 'actual', v_txt,
      'pass', v_txt = '1|1|7|⟦n⟧ ⟦n⟧ beskjeder kommer for sent|Gunnhild Berg,Halvor Moen,Sigrun Dahl');

    -- 6 -------------------------------------------------------------- the organisation's own, and no client's
    v_txt := concat_ws('|',
      (array_to_string(app.mask_patterns(v_org), ' ') ~ 'Gunnhild' and array_to_string(app.mask_patterns(v_org), ' ') ~ 'Moen')::text,
      (coalesce(array_to_string(app.mask_patterns(v_org2), ' '), '') ~ 'Gunnhild|Dahl|Moen')::text);
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims', format(claims, v_dl), true);
      select count(*) into v_n from app.employee_former_names;
      reset role;
      v_txt := v_txt || '|read';
    exception when insufficient_privilege then
      v_txt := v_txt || '|denied';
    end;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the names mask in their organisation only, and the daglig leder cannot read them',
      'expected', 'true|false|denied', 'actual', v_txt, 'pass', v_txt = 'true|false|denied');

    -- 7 -------------------------------------------------------------- the answers' immutability is as it was
    v_txt := '';
    begin
      update app.answers set value = 1 where response_id = v_resp[1];
      v_txt := v_txt || 'changed';
    exception when restrict_violation then v_txt := v_txt || 'refused';
    end;
    begin
      delete from app.answers where response_id = v_resp[1];
      v_txt := v_txt || ',deleted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    begin
      update app.response_comments set body = 'endret' where response_id = v_resp[1];
      v_txt := v_txt || ',changed';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    begin
      delete from app.response_comments where response_id = v_resp[1];
      v_txt := v_txt || ',deleted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_txt := concat_ws('|', v_txt,
      (select string_agg(t.tgrelid::regclass::text || ':' || t.tgname, ',' order by t.tgrelid::regclass::text, t.tgname) from pg_trigger t
        where not t.tgisinternal and t.tgrelid in ('app.responses'::regclass, 'app.answers'::regclass, 'app.extra_answers'::regclass,
                                                   'app.response_comments'::regclass, 'app.invitations'::regclass)),
      (select string_agg(k.conrelid::regclass::text || ':' || k.conname || ':' || k.confdeltype::text || ':' || k.condeferrable::text, ','
                         order by k.conrelid::regclass::text, k.conname) from pg_constraint k
        where k.contype = 'f' and k.conrelid in ('app.responses'::regclass, 'app.invitations'::regclass)));
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'answers and comments can be neither changed nor deleted under a live response; triggers and keys as before',
      'expected', 'refused,refused,refused,refused|app.answers:answers_immutable,app.extra_answers:extra_answer_guard,app.extra_answers:extra_answers_immutable,app.response_comments:comments_immutable|app.invitations:invitations_employee_id_fkey:n:false,app.invitations:invitations_org_id_round_id_fkey:c:false,app.responses:responses_group_id_fkey:a:false,app.responses:responses_org_id_round_id_fkey:c:false',
      'actual', v_txt,
      'pass', v_txt = 'refused,refused,refused,refused|app.answers:answers_immutable,app.extra_answers:extra_answer_guard,app.extra_answers:extra_answers_immutable,app.response_comments:comments_immutable|app.invitations:invitations_employee_id_fkey:n:false,app.invitations:invitations_org_id_round_id_fkey:c:false,app.responses:responses_group_id_fkey:a:false,app.responses:responses_org_id_round_id_fkey:c:false');

    -- 8 -------------------------------------------------------------- the organisation goes, in one statement
    -- Before 0190 both failed. The invitations were written in this transaction, so the employees'
    -- SET NULL re-checked them against the round the same cascade had already removed (23503
    -- invitations_org_id_round_id_fkey: the reported case, alone in v_org3, which has no answers);
    -- and the responses held their group (23503 responses_group_id_fkey, in any transaction).
    insert into app.organizations (id, name, org_number, employee_count) values (v_org3, 'Bare Invitasjoner AS', '999009903', 1);
    insert into app.employees (org_id, full_name, email) values (v_org3, 'Kari Nordmann', 'kari@fni-probe.no') returning id into v_id;
    insert into app.measurements (org_id, kind, year, label) values (v_org3, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org3, v_meas, 'apen', now() - interval '1 day', now() + interval '6 days') returning id into v_round;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    values (v_org3, v_round, v_id, extensions.digest('fni-probe-org3', 'sha256'), now() + interval '6 days');
    begin
      delete from app.organizations where id = v_org3;
      v_txt := 'deleted';
    exception when others then
      v_txt := sqlstate || ' ' || sqlerrm;
    end;
    begin
      delete from app.organizations where id = v_org;
      v_txt := v_txt || ',deleted';
    exception when others then
      v_txt := v_txt || ',' || sqlstate || ' ' || sqlerrm;
    end;
    v_txt := concat_ws('|', v_txt, (select count(*) from app.invitations where org_id = v_org3) + (select count(*) from app.employees where org_id = v_org3), (
      select count(*) from (
        select id from app.organizations where id = v_org
        union all select id from app.rounds where org_id = v_org
        union all select id from app.measurements where org_id = v_org
        union all select id from app.groups where org_id = v_org
        union all select id from app.employees where org_id = v_org
        union all select id from app.invitations where id = any(v_invs) or org_id = v_org
        union all select id from app.responses where id = any(v_resp) or org_id = v_org
        union all select response_id from app.answers where response_id = any(v_resp)
        union all select response_id from app.response_comments where response_id = any(v_resp)
        union all select id from app.comment_threads where id = any(v_thr) or org_id = v_org
        union all select thread_id from app.thread_messages where thread_id = any(v_thr)
        union all select org_id from app.employee_former_names where org_id = v_org
        union all select org_id from app.entra_sync where org_id = v_org
        union all select org_id from app.entra_tenants where org_id = v_org) x),
      (select count(*) from jsonb_each(app.org_row_counts(v_org)) x(k, v) where v::text <> '0'),
      (select count(*) from app.organizations where id = v_org2));
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'an organisation with rounds, invitations, employees, responses and former names deletes in one statement; nothing is left; the other is untouched',
      'expected', 'deleted,deleted|0|0|0|1', 'actual', v_txt, 'pass', v_txt = 'deleted,deleted|0|0|0|1');

    -- 9 -------------------------------------------------------------- and so does the design's organisation
    if exists (select 1 from app.organizations where id = v_fix) then
      begin
        select count(*) into v_n from app.responses where org_id = v_fix;
        delete from app.organizations where id = v_fix;
        v_txt := concat_ws('|', 'deleted', (v_n > 0)::text,
          (select count(*) from jsonb_each(app.org_row_counts(v_fix)) x(k, v) where v::text <> '0'),
          (select count(*) from app.employee_former_names where org_id = v_fix));
        raise exception 'undo';
      exception when others then
        if sqlerrm <> 'undo' then v_txt := sqlstate || ' ' || sqlerrm; end if;
      end;
    else
      v_txt := 'no fixture';
    end if;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the design fixture''s organisation, answers and all, deletes in one statement and leaves nothing',
      'expected', 'deleted|true|0|0', 'actual', v_txt, 'pass', v_txt = 'deleted|true|0|0');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 10 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email ilike '%@fni-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_org2, v_org3)
    union all select id::text from app.employees where org_id in (v_org, v_org2, v_org3)
    union all select org_id::text from app.employee_former_names where org_id in (v_org, v_org2, v_org3)) x;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._fni
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._fni order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._fni;
  if v_failed is not null then raise exception 'former names invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'former names invariants: expected 10 rows, got %', v_count; end if;
end $$;
