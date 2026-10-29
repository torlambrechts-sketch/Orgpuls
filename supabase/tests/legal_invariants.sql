-- legal_invariants.sql — the legal review (0082, D-130).
--
--   * app.legal_approvals: RLS on, no policy, no grant; no client role reads or writes it (1)
--   * only a verified platform command (app.platform_actor, 0206) approves: without one a signed-in
--     member is refused, and no client role may execute the operations at all (2)
--   * an approval stores the text's hash and when, under no person (the platform approves); approving
--     again replaces it; withdrawing needs the hash approved and deletes it (3)
--   * a malformed key, hash, choice or language is refused, NULL included (4)
--   * approving a language's survey approves its unapproved items and the page strings' hash,
--     only if they are still what the page showed, and leaves a qa-fixture row alone off the QA
--     stack (5)
--   * nothing written here survives (6)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/legal_invariants.sql

create unlogged table if not exists public._legal(seq int, name text, expected text, actual text, pass bool);
truncate public._legal;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_member uuid := '00000000-0000-4000-8000-00000d0e0001';
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  v_ops    constant text[] := array['app.op_legal_set(text,text,boolean)', 'app.op_legal_approvals()',
                                    'app.op_translations(text)', 'app.op_translations_approve(text,text,text)'];
  h1       constant text := repeat('a', 64);
  h2       constant text := repeat('b', 64);
  hui      constant text := repeat('c', 64);
  v_rows   jsonb := '[]'::jsonb;
  v_txt    text;
  v_json   jsonb;
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
    insert into auth.users (id, email) values (v_member, 'member@legal-test.example');
    insert into app.profiles (id, full_name) values (v_member, 'Med Lem') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_member, 'daglig_leder', true);

    -- 2 ---------------------------------------------------------------- who may approve
    -- a signed-in member outside a platform command: no actor, refused by every operation
    perform set_config('app.platform_actor', '', true);
    perform set_config('request.jwt.claims', format(claims, v_member, 'aal2'), true);
    v_txt := coalesce(app.op_legal_set('doc:probe:no', h1, true)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(app.op_legal_approvals()->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(app.op_translations('en')->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(app.op_translations_approve('en', hui, h1)->>'error', 'ok');
    perform set_config('request.jwt.claims', '', true);
    -- and no client role reaches them at all
    v_txt := v_txt || ',' || (select count(*) from unnest(v_ops) f, unnest(array['anon', 'authenticated', 'service_role']) r
                              where has_function_privilege(r, f, 'execute'));
    v_txt := v_txt || ',' || (select count(*) from app.legal_approvals where key = 'doc:probe:no');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'without a platform actor every operation refuses; no client role may execute them',
      'expected', 'not_allowed,not_allowed,not_allowed,not_allowed,0,0',
      'actual', v_txt, 'pass', v_txt = 'not_allowed,not_allowed,not_allowed,not_allowed,0,0');

    -- 3 ---------------------------------------------------------------- approve, replace, withdraw
    perform set_config('app.platform_actor', 'test@platform', true);
    v_txt := coalesce(app.op_legal_set('doc:probe:no', h1, true)->>'error', 'ok');
    select v_txt || ',' || (a.text_hash = h1) || ',' || (a.approved_by is null and a.approved_at = now() and not a.auto) into v_txt
    from app.legal_approvals a where a.key = 'doc:probe:no';
    v_txt := v_txt || ',' || (select count(*) = 1 from jsonb_array_elements(app.op_legal_approvals()->'approvals') x
                              where x->>'key' = 'doc:probe:no' and x->>'hash' = h1);
    v_txt := v_txt || ',' || coalesce(app.op_legal_set('doc:probe:no', upper(h2), true)->>'error', 'ok');
    v_txt := v_txt || ',' || (select text_hash = h2 from app.legal_approvals where key = 'doc:probe:no');
    -- withdrawing with the hash of an older version withdraws nothing
    v_txt := v_txt || ',' || coalesce(app.op_legal_set('doc:probe:no', h1, false)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(app.op_legal_set('doc:probe:no', h2, false)->>'error', 'ok');
    v_txt := v_txt || ',' || (select count(*) from app.legal_approvals where key = 'doc:probe:no');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'an approval holds the hash and when; a new hash replaces it; withdrawing deletes it, a stale hash withdraws nothing',
      'expected', 'ok,true,true,true,ok,true,stale,ok,0', 'actual', v_txt, 'pass', v_txt = 'ok,true,true,true,ok,true,stale,ok,0');

    -- 4 ---------------------------------------------------------------- malformed input
    v_txt := coalesce(app.op_legal_set('x', h1, true)->>'error', 'ok')
      || ',' || coalesce(app.op_legal_set('doc:probe no', h1, true)->>'error', 'ok')
      || ',' || coalesce(app.op_legal_set('doc:probe:no', 'abc', true)->>'error', 'ok')
      || ',' || coalesce(app.op_legal_set('doc:probe:no', h1, null)->>'error', 'ok')
      || ',' || coalesce(app.op_translations_approve('fi', hui, h1)->>'error', 'ok')
      || ',' || coalesce(app.op_translations_approve(null, hui, h1)->>'error', 'ok')
      || ',' || coalesce(app.op_translations_approve('lt', hui, 'x')->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a malformed key, hash, choice, language or digest is refused, NULL included',
      'expected', 'invalid,invalid,invalid,invalid,invalid,invalid,invalid', 'actual', v_txt,
      'pass', v_txt = 'invalid,invalid,invalid,invalid,invalid,invalid,invalid');

    -- 5 ---------------------------------------------------------------- a language's survey
    delete from app.item_translations where item_id like 'core:ytring:%' and locale = 'lt';
    insert into app.item_translations (item_id, locale, text, source)
    values ('core:ytring:1', 'lt', 'bandymas-1', 'official'), ('core:ytring:2', 'lt', 'bandymas-2', 'qa-fixture');
    perform set_config('app.environment', '', true);
    v_json := app.op_translations('lt');
    -- a row changed after the page was read: nothing is approved
    update app.item_translations set text = 'bandymas-1b' where item_id = 'core:ytring:1' and locale = 'lt';
    v_txt := coalesce(app.op_translations_approve('lt', hui, v_json->>'digest')->>'error', 'ok');
    v_json := app.op_translations('lt');
    v_txt := v_txt || ',' || coalesce(app.op_translations_approve('lt', hui, v_json->>'digest')->>'approved', 'none');
    v_txt := v_txt || ',' || (select count(*) from jsonb_array_elements(app.op_translations('lt')->'items') x
                              where x->>'item' like 'core:ytring:%' and (x->>'approved')::boolean);
    v_txt := v_txt || ',' || (select approved_at is null from app.item_translations where item_id = 'core:ytring:2' and locale = 'lt')
                   || ',' || (select count(*) from app.ui_translation_approvals where locale = 'lt' and messages_hash = hui);
    perform set_config('app.platform_actor', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'approving a language: only what the page showed, its items and the page strings, never a qa-fixture off QA',
      'expected', 'stale,1,1,true,1', 'actual', v_txt,
      'pass', v_txt like 'stale,%,1,true,1' and split_part(v_txt, ',', 2)::int >= 1);

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
