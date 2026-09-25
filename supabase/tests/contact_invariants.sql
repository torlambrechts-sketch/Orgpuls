-- contact_invariants.sql — the request for direct contact (0046), proved against the live schema.
--
--   * anon may call neither write, and no client may call the visibility helper (1, 2)
--   * the table is closed: RLS on, no policy, no grant (3)
--   * it holds no reference to anyone on the respondent's side: its only foreign keys are
--     the thread and the leader's profile (4)
--   * a daglig leder asks on a thread they can read; the key's holder then sees that
--     leader's name and work address, and conversations marks the request as theirs (5..7)
--   * a verneombud, an avdelingsleder of another department and an unknown thread are
--     refused alike, as conversations refuses them (8..10)
--   * a closed thread cannot be asked on (11)
--   * a leader who leaves the organisation stops being offered (12)
--   * the request can be withdrawn, and then nothing is offered (13)
--   * nothing written here survives (14)
--
-- Reads the design fixture's organisation. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/contact_invariants.sql

create unlogged table if not exists public._cti(seq int, name text, expected text, actual text, pass bool);
truncate public._cti;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_vo     uuid := '00000000-0000-4000-8000-0000000c5001';
  v_al     uuid := '00000000-0000-4000-8000-0000000c5002';
  v_key    text := repeat('ab', 32);
  v_dl     uuid;
  v_thread uuid;
  v_group  uuid;
  v_other  uuid;
  v_rows   jsonb := '[]';
  v_json   jsonb;
  v_cnt    int;
  v_txt    text;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may call neither request_contact nor withdraw_contact', 'expected', 'false',
    'actual', (has_function_privilege('anon', 'public.request_contact(uuid)', 'execute')
               or has_function_privilege('anon', 'public.withdraw_contact(uuid)', 'execute'))::text,
    'pass', not (has_function_privilege('anon', 'public.request_contact(uuid)', 'execute')
               or has_function_privilege('anon', 'public.withdraw_contact(uuid)', 'execute')));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'no client may call app.thread_visible', 'expected', 'false',
    'actual', (has_function_privilege('authenticated', 'app.thread_visible(uuid)', 'execute')
               or has_function_privilege('anon', 'app.thread_visible(uuid)', 'execute'))::text,
    'pass', not (has_function_privilege('authenticated', 'app.thread_visible(uuid)', 'execute')
               or has_function_privilege('anon', 'app.thread_visible(uuid)', 'execute')));

  select count(*) into v_cnt from pg_policies where schemaname = 'app' and tablename = 'contact_requests';
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'contact_requests: RLS on, no policy, no client grant',
    'expected', 'rls true, 0 policies, no select',
    'actual', 'rls ' || (select c.relrowsecurity::text from pg_class c where c.oid = 'app.contact_requests'::regclass)
              || ', ' || v_cnt || ' policies, select ' || has_table_privilege('authenticated', 'app.contact_requests', 'select')::text,
    'pass', (select c.relrowsecurity from pg_class c where c.oid = 'app.contact_requests'::regclass)
            and v_cnt = 0
            and not has_table_privilege('authenticated', 'app.contact_requests', 'select')
            and not has_table_privilege('anon', 'app.contact_requests', 'select'));

  select string_agg(confrelid::regclass::text, ',' order by confrelid::regclass::text) into v_txt
  from pg_constraint where conrelid = 'app.contact_requests'::regclass and contype = 'f';
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'its only references are the thread and the leader',
    'expected', 'app.comment_threads,app.profiles', 'actual', v_txt,
    'pass', v_txt = 'app.comment_threads,app.profiles');

  select m.user_id into v_dl from app.memberships m
  where m.org_id = v_org and m.active and m.role = 'daglig_leder' order by m.id limit 1;

  begin
    -- 5..7 ------------------------------------------------------------ daglig leder
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    select (t->>'id')::uuid into v_thread
    from jsonb_array_elements(public.conversations(null)->'threads') t
    where t->>'state' <> 'lukket' limit 1;
    select r.group_id into v_group from app.comment_threads ct join app.responses r on r.id = ct.response_id where ct.id = v_thread;
    select g.id into v_other from app.groups g where g.org_id = v_org and g.id is distinct from v_group order by g.id limit 1;
    -- a key this test knows, on a thread the fixture made
    update app.comment_threads set key_hash = extensions.digest(v_key, 'sha256') where id = v_thread;

    v_json := public.request_contact(v_thread);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a daglig leder asks on a thread they can read', 'expected', '{"ok": true}',
      'actual', v_json::text, 'pass', v_json = '{"ok": true}'::jsonb);

    v_json := public.thread_by_key(v_key)->'contact';
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the key''s holder is shown that leader''s name and address', 'expected', 'the leader''s profile name and auth e-mail',
      'actual', coalesce(v_json::text, 'null'),
      'pass', v_json->>'email' = (select u.email from auth.users u where u.id = v_dl)
              and v_json->>'name' is not distinct from (select p.full_name from app.profiles p where p.id = v_dl));

    select t->'contact' into v_json from jsonb_array_elements(public.conversations(null)->'threads') t where (t->>'id')::uuid = v_thread;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'conversations marks the request as the caller''s', 'expected', 'mine true',
      'actual', coalesce(v_json::text, 'null'), 'pass', (v_json->>'mine')::boolean);

    -- 8..10 -------------------------------------------------------- refused alike
    insert into auth.users (id, email) values (v_vo, 'vo@contact-test.example'), (v_al, 'al@contact-test.example');
    insert into app.profiles (id, full_name) values (v_vo, 'VO'), (v_al, 'AL');
    insert into app.memberships (org_id, user_id, role, group_id) values
      (v_org, v_vo, 'verneombud', null), (v_org, v_al, 'avdelingsleder', v_other);

    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_json := public.request_contact(v_thread);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a verneombud is refused, as conversations refuses them', 'expected', 'not_available',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_available');

    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    v_json := public.request_contact(v_thread);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'an avdelingsleder of another department is refused', 'expected', 'not_available',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_available' and v_other is not null);

    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.request_contact(gen_random_uuid());
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'an unknown thread is refused the same way', 'expected', 'not_available',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_available');

    -- 11 ------------------------------------------------------------ closed thread
    update app.comment_threads set state = 'lukket' where id = v_thread;
    v_json := public.request_contact(v_thread);
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'a closed thread cannot be asked on', 'expected', 'closed',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'closed');
    update app.comment_threads set state = 'dialog' where id = v_thread;

    -- 12 ------------------------------------------------------------ leader leaves
    update app.memberships set active = false where user_id = v_dl and org_id = v_org;
    v_json := public.thread_by_key(v_key)->'contact';
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a leader who has left is no longer offered', 'expected', 'null',
      'actual', coalesce(nullif(v_json, 'null'::jsonb)::text, 'null'), 'pass', v_json is null or v_json = 'null'::jsonb);
    update app.memberships set active = true where user_id = v_dl and org_id = v_org;

    -- 13 ------------------------------------------------------------ withdrawn
    v_json := public.withdraw_contact(v_thread);
    select count(*) into v_cnt from app.contact_requests where thread_id = v_thread;
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'withdrawn, nothing is offered', 'expected', 'ok, 0 rows, no contact',
      'actual', (v_json->>'ok') || ', ' || v_cnt || ' rows, contact ' || coalesce(nullif(public.thread_by_key(v_key)->'contact', 'null'::jsonb)::text, 'none'),
      'pass', (v_json->>'ok')::boolean and v_cnt = 0
              and (public.thread_by_key(v_key)->'contact' is null or public.thread_by_key(v_key)->'contact' = 'null'::jsonb));

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from auth.users where id in (v_vo, v_al);
  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'every probe row was rolled back', 'expected', '0 users, 0 requests',
    'actual', v_cnt || ' users, ' || (select count(*) from app.contact_requests where thread_id = v_thread) || ' requests',
    'pass', v_cnt = 0 and not exists (select 1 from app.contact_requests where thread_id = v_thread));

  insert into public._cti
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cti order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._cti;
  if v_failed is not null then
    raise exception 'contact invariants failed: %', v_failed;
  end if;
  if v_count <> 14 then
    raise exception 'contact invariants: expected 14 rows, got %', v_count;
  end if;
end $$;

drop table public._cti;
