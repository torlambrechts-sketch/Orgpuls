-- legal_invariants.sql — the legal review (0082, D-130).
--
--   * app.legal_approvals: RLS on, no policy, no grant; no client role reads or writes it (1)
--   * only a super-admin with a second factor approves; a member, an aal1 session and another
--     platform role are refused (2)
--   * an approval stores the text's hash and who; approving again replaces it; withdrawing
--     deletes it; both are audited (3)
--   * a malformed key or hash is refused (4)
--   * approving a language's survey approves its unapproved items and the page strings' hash,
--     leaves a qa-fixture row alone off the QA stack, and is audited (5)
--   * nothing written here survives (6)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/legal_invariants.sql

create unlogged table if not exists public._legal(seq int, name text, expected text, actual text, pass bool);
truncate public._legal;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_member uuid := '00000000-0000-4000-8000-00000d0e0001';
  v_sa     uuid := '00000000-0000-4000-8000-00000d0e0002';
  v_sup    uuid := '00000000-0000-4000-8000-00000d0e0003';
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  h1       constant text := repeat('a', 64);
  h2       constant text := repeat('b', 64);
  hui      constant text := repeat('c', 64);
  v_rows   jsonb := '[]'::jsonb;
  v_txt    text;
  v_n      int;
begin
  -- 1 ------------------------------------------------------------------ no client access
  select concat_ws('/', c.relrowsecurity,
                   (select count(*) from pg_policies p where p.schemaname = 'app' and p.tablename = 'legal_approvals'),
                   has_table_privilege('authenticated', 'app.legal_approvals', 'select'),
                   has_table_privilege('anon', 'app.legal_approvals', 'select'),
                   has_table_privilege('authenticated', 'app.legal_approvals', 'insert'))
    into v_txt
  from pg_class c where c.oid = 'app.legal_approvals'::regclass;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on, no policy, no grant to a client role',
    'expected', 't/0/f/f/f', 'actual', v_txt, 'pass', v_txt = 't/0/f/f/f');

  begin
    insert into auth.users (id, email) values (v_member, 'member@legal-test.example'), (v_sa, 'sa@legal-test.example'),
                                              (v_sup, 'support@legal-test.example');
    insert into app.profiles (id, full_name) values (v_member, 'Med Lem') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_member, 'daglig_leder', true);
    insert into app.platform_admins (user_id, role) values (v_sa, 'super_admin'), (v_sup, 'support');

    -- 2 ---------------------------------------------------------------- who may approve
    perform set_config('request.jwt.claims', format(claims, v_member, 'aal2'), true);
    set local role authenticated;
    v_txt := coalesce(public.admin_legal_set('doc:probe:no', h1, true)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.admin_legal_approvals()->>'error', 'ok');
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal1'), true);
    set local role authenticated;
    v_txt := v_txt || ',' || coalesce(public.admin_legal_set('doc:probe:no', h1, true)->>'error', 'ok');
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    set local role authenticated;
    v_txt := v_txt || ',' || coalesce(public.admin_legal_set('doc:probe:no', h1, true)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.admin_translations_approve('en', hui)->>'error', 'ok');
    reset role;
    v_txt := v_txt || ',' || (select count(*) from app.legal_approvals where key = 'doc:probe:no');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a member, an aal1 super-admin and support are refused',
      'expected', 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,0',
      'actual', v_txt, 'pass', v_txt = 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,0');

    -- 3 ---------------------------------------------------------------- approve, replace, withdraw
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal2'), true);
    set local role authenticated;
    v_txt := coalesce(public.admin_legal_set('doc:probe:no', h1, true)->>'error', 'ok');
    reset role;
    select v_txt || ',' || (a.text_hash = h1) || ',' || (a.approved_by = v_sa) into v_txt
    from app.legal_approvals a where a.key = 'doc:probe:no';
    set local role authenticated;
    v_txt := v_txt || ',' || (public.admin_legal_approvals()->'approvals'->0->>'by' is not null);
    v_txt := v_txt || ',' || coalesce(public.admin_legal_set('doc:probe:no', upper(h2), true)->>'error', 'ok');
    reset role;
    v_txt := v_txt || ',' || (select text_hash = h2 from app.legal_approvals where key = 'doc:probe:no');
    set local role authenticated;
    v_txt := v_txt || ',' || coalesce(public.admin_legal_set('doc:probe:no', h2, false)->>'error', 'ok');
    reset role;
    v_txt := v_txt || ',' || (select count(*) from app.legal_approvals where key = 'doc:probe:no')
                   || ',' || (select count(*) from app.admin_audit where admin_id = v_sa and target_id = 'doc:probe:no'
                              and action in ('legal.approve', 'legal.withdraw'));
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'an approval holds the hash and who; a new hash replaces it; withdrawing deletes it; all audited',
      'expected', 'ok,true,true,true,ok,true,ok,0,3', 'actual', v_txt, 'pass', v_txt = 'ok,true,true,true,ok,true,ok,0,3');

    -- 4 ---------------------------------------------------------------- malformed input
    set local role authenticated;
    v_txt := coalesce(public.admin_legal_set('x', h1, true)->>'error', 'ok')
      || ',' || coalesce(public.admin_legal_set('doc:probe no', h1, true)->>'error', 'ok')
      || ',' || coalesce(public.admin_legal_set('doc:probe:no', 'abc', true)->>'error', 'ok')
      || ',' || coalesce(public.admin_legal_set('doc:probe:no', h1, null)->>'error', 'ok')
      || ',' || coalesce(public.admin_translations_approve('de', hui)->>'error', 'ok');
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a malformed key, hash, choice or language is refused',
      'expected', 'invalid,invalid,invalid,invalid,invalid', 'actual', v_txt, 'pass', v_txt = 'invalid,invalid,invalid,invalid,invalid');

    -- 5 ---------------------------------------------------------------- a language's survey
    delete from app.item_translations where item_id like 'core:ytring:%' and locale = 'lt';
    insert into app.item_translations (item_id, locale, text, source)
    values ('core:ytring:1', 'lt', 'bandymas-1', 'machine'), ('core:ytring:2', 'lt', 'bandymas-2', 'qa-fixture');
    perform set_config('app.environment', '', true);
    set local role authenticated;
    v_txt := coalesce(public.admin_translations_approve('lt', hui)->>'approved', 'none');
    v_txt := v_txt || ',' || (select count(*) from jsonb_array_elements(public.admin_translations('lt')->'items') x
                              where x->>'item' like 'core:ytring:%' and (x->>'approved')::boolean);
    reset role;
    v_txt := v_txt || ',' || (select approved_at is null from app.item_translations where item_id = 'core:ytring:2' and locale = 'lt')
                   || ',' || (select count(*) from app.ui_translation_approvals where locale = 'lt' and messages_hash = hui)
                   || ',' || (select count(*) from app.admin_audit where admin_id = v_sa and action = 'translations.approve' and target_id = 'lt');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'approving a language: its items and the page strings, never a qa-fixture off QA, audited',
      'expected', '1,1,true,1,1', 'actual', v_txt, 'pass', v_txt like '%,1,true,1,1' and split_part(v_txt, ',', 1)::int >= 1);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 6 ------------------------------------------------------------------ nothing survives
  v_txt := (not exists (select 1 from auth.users where email like '%@legal-test.example')
            and not exists (select 1 from app.legal_approvals where key = 'doc:probe:no')
            and not exists (select 1 from app.item_translations where text like 'bandymas-%')
            and not exists (select 1 from app.ui_translation_approvals where messages_hash = hui))::text;
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every probe change was rolled back', 'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._legal
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._legal order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._legal;
  if v_failed is not null then raise exception 'legal invariants failed: %', v_failed; end if;
  if v_count <> 6 then raise exception 'legal invariants: expected 6 rows, got %', v_count; end if;
end $$;

drop table public._legal;
