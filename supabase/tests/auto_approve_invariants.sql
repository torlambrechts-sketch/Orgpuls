-- auto_approve_invariants.sql — bokmål and English overrides, and the auto-approve switch (0101,
-- D-152), proved against the live schema.
--
--   * app.message_overrides and app.platform_settings: RLS on, no policy, no grant (1)
--   * anon reads only approved overrides, as text; a member, an aal1 session and support cannot
--     import, approve or switch (2)
--   * an import writes drafts; approving needs the hash of the text shown; a new wording is a
--     draft again; a remove row goes back to the file's text (3)
--   * switching on approves what waits — registry rows and overrides — marked automatic, leaves a
--     qa-fixture row alone off the QA stack, and is audited (4)
--   * while on, a new import and a new registry row arrive approved and marked; a legal text and a
--     page-string hash are recorded as automatic; round_locale_state says «auto» (5)
--   * switched off, a new import is a draft again, nothing is recorded, «auto» is false, and a
--     person's approval of a legal text is not automatic (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/auto_approve_invariants.sql

create unlogged table if not exists public._aai(seq int, name text, expected text, actual text, pass bool);
truncate public._aai;

do $$
declare
  v_member uuid := '00000000-0000-4000-8000-00000a0a0001';
  v_sa     uuid := '00000000-0000-4000-8000-00000a0a0002';
  v_sup    uuid := '00000000-0000-4000-8000-00000a0a0003';
  v_org    uuid := '00000000-0000-4000-8000-00000a0a0010';
  v_meas   uuid;
  v_round  uuid;
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  h1       constant text := repeat('d', 64);
  v_was    boolean;
  v_rows   jsonb := '[]'::jsonb;
  v_txt    text;
  v_json   jsonb;
  v_cnt    int;
  v_exp    text;
begin
  select auto_approve into v_was from app.platform_settings where id;

  -- 1 ------------------------------------------------------------------ no client access
  select string_agg(concat_ws('/', c.relrowsecurity,
                   (select count(*) from pg_policies p where p.schemaname = 'app' and p.tablename = c.relname),
                   has_table_privilege('authenticated', c.oid, 'select'), has_table_privilege('anon', c.oid, 'select'),
                   has_table_privilege('authenticated', c.oid, 'insert')), ' ' order by c.relname)
    into v_txt
  from pg_class c where c.oid in ('app.message_overrides'::regclass, 'app.platform_settings'::regclass);
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'overrides and settings: RLS on, no policy, no grant',
    'expected', 't/0/f/f/f t/0/f/f/f', 'actual', v_txt, 'pass', v_txt = 't/0/f/f/f t/0/f/f/f');

  begin
    update app.platform_settings set auto_approve = false where id;
    insert into auth.users (id, email) values (v_member, 'member@aa-test.example'), (v_sa, 'sa@aa-test.example'),
                                              (v_sup, 'support@aa-test.example');
    insert into app.platform_admins (user_id, role) values (v_sa, 'super_admin'), (v_sup, 'support');
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Auto Test AS', '999000902', 5);
    insert into app.measurements (org_id, kind, year) values (v_org, 'puls', 2098) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2098-01-01', '2098-01-08') returning id into v_round;

    -- 2 ---------------------------------------------------------------- who may do what
    insert into app.message_overrides (locale, key, text, status) values ('en', 'probe.approved', 'Shown', 'approved'),
                                                                         ('en', 'probe.draft', 'Not shown', 'draft');
    set local role anon;
    v_txt := public.message_overrides('en') ->> 'probe.approved';
    v_txt := v_txt || '|' || coalesce(public.message_overrides('en') ->> 'probe.draft', 'none');
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal1'), true);
    set local role authenticated;
    v_txt := v_txt || '|' || coalesce(public.admin_message_overrides_import('en', '[{"key":"probe.x","text":"X"}]')->>'error', 'ok');
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    set local role authenticated;
    v_txt := v_txt || '|' || coalesce(public.admin_auto_approve_set(true)->>'error', 'ok');
    v_txt := v_txt || '|' || coalesce(public.admin_message_overrides_approve('en', '[]')->>'error', 'ok');
    v_txt := v_txt || '|' || coalesce(public.admin_auto_approve()->>'error', 'ok');
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_member, 'aal2'), true);
    set local role authenticated;
    v_txt := v_txt || '|' || coalesce(public.admin_message_overrides('en')->>'error', 'ok');
    reset role;
    v_txt := v_txt || '|' || (select auto_approve::text from app.platform_settings where id);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'anon reads approved text only; aal1, support and a member are refused',
      'expected', 'Shown|none|not_allowed|not_allowed|not_allowed|ok|not_allowed|false', 'actual', v_txt,
      'pass', v_txt = 'Shown|none|not_allowed|not_allowed|not_allowed|ok|not_allowed|false');

    -- 3 ---------------------------------------------------------------- import, approve, reword, remove
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal2'), true);
    set local role authenticated;
    v_json := public.admin_message_overrides_import('en', '[{"key":"probe.one","text":"One","status":"pretested"},{"key":"probe.two","text":"Two"},{"key":"probe.bad","text":"Bad","status":"approved"}]');
    v_txt := concat_ws('|', v_json->>'new', jsonb_array_length(v_json->'refused'));
    v_json := public.admin_message_overrides_approve('en', jsonb_build_array(
      jsonb_build_object('key', 'probe.one', 'hash', encode(extensions.digest('One', 'sha256'), 'hex')),
      jsonb_build_object('key', 'probe.two', 'hash', h1)));
    v_txt := v_txt || '|' || (v_json->>'approved');
    perform public.admin_message_overrides_import('en', '[{"key":"probe.one","text":"One, again"},{"key":"probe.draft","remove":true}]');
    reset role;
    v_txt := v_txt || '|' || (select string_agg(key || ':' || status || ':' || approved_auto, ',' order by key)
                             from app.message_overrides where locale = 'en' and key like 'probe.%');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'drafts in, approved by the shown hash only, reworded to draft, removed on request',
      'expected', '2|1|1|probe.approved:approved:false,probe.one:draft:false,probe.two:draft:false', 'actual', v_txt,
      'pass', v_txt = '2|1|1|probe.approved:approved:false,probe.one:draft:false,probe.two:draft:false');

    -- 4 ---------------------------------------------------------------- switching on
    insert into app.item_translations (item_id, locale, text, source, status)
    values ('core:ytring:1', 'da', 'Probe dansk', 'machine', 'draft')
    on conflict (item_id, locale) do update set text = excluded.text, source = excluded.source, status = 'draft';
    insert into app.item_translations (item_id, locale, text, source, status)
    values ('core:ytring:2', 'da', 'Probe fixture', 'qa-fixture', 'draft')
    on conflict (item_id, locale) do update set text = excluded.text, source = excluded.source, status = 'draft';
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal2'), true);
    set local role authenticated;
    v_json := public.admin_auto_approve_set(true);
    reset role;
    v_txt := concat_ws('|', v_json->>'on',
      (select status || ':' || approved_auto from app.item_translations where item_id = 'core:ytring:1' and locale = 'da'),
      (select status from app.item_translations where item_id = 'core:ytring:2' and locale = 'da'),
      (select string_agg(key || ':' || status || ':' || approved_auto, ',' order by key)
       from app.message_overrides where locale = 'en' and key in ('probe.one', 'probe.two')),
      (select count(*) from app.admin_audit where action = 'settings.auto_approve' and admin_id = v_sa));
    -- on the QA stack a qa-fixture row may be approved (0079); anywhere else it stays a draft
    v_exp := 'true|approved:true|' || case when coalesce(current_setting('app.environment', true), '') = 'qa' then 'approved' else 'draft' end
             || '|probe.one:approved:true,probe.two:approved:true|1';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'on: waiting rows approved and marked, a qa-fixture left alone, audited',
      'expected', v_exp, 'actual', v_txt, 'pass', v_txt = v_exp);

    -- 5 ---------------------------------------------------------------- while on
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal2'), true);
    set local role authenticated;
    perform public.admin_message_overrides_import('no', '[{"key":"probe.three","text":"Tre"}]');
    v_json := public.admin_auto_record(('[{"key":"doc:probe:auto","hash":"' || h1 || '"}]')::jsonb, ('[{"locale":"pl","hash":"' || h1 || '"}]')::jsonb);
    reset role;
    insert into app.item_translations (item_id, locale, text, source, status)
    values ('core:ytring:3', 'da', 'Probe ny', 'machine', 'draft')
    on conflict (item_id, locale) do update set text = excluded.text, source = excluded.source, status = 'draft';
    v_txt := concat_ws('|',
      (select status || ':' || approved_auto from app.message_overrides where locale = 'no' and key = 'probe.three'),
      (select status || ':' || approved_auto from app.item_translations where item_id = 'core:ytring:3' and locale = 'da'),
      v_json->>'legal', v_json->>'ui',
      (select auto::text from app.legal_approvals where key = 'doc:probe:auto'),
      app.round_locale_state(v_round)->'pl'->>'auto');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'on: imports and new rows arrive approved; legal and page hashes recorded as automatic; auto in the state',
      'expected', 'approved:true|approved:true|1|1|true|true', 'actual', v_txt,
      'pass', v_txt = 'approved:true|approved:true|1|1|true|true');

    -- 6 ---------------------------------------------------------------- switched off
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal2'), true);
    set local role authenticated;
    perform public.admin_auto_approve_set(false);
    perform public.admin_message_overrides_import('no', '[{"key":"probe.four","text":"Fire"}]');
    v_json := public.admin_auto_record(('[{"key":"doc:probe:off","hash":"' || h1 || '"}]')::jsonb, '[]'::jsonb);
    perform public.admin_legal_set('doc:probe:auto', h1, true);
    reset role;
    v_txt := concat_ws('|',
      (select status from app.message_overrides where locale = 'no' and key = 'probe.four'),
      v_json->>'legal',
      app.round_locale_state(v_round)->'pl'->>'auto',
      (select auto::text from app.legal_approvals where key = 'doc:probe:auto'));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'off: drafts again, nothing recorded, auto false, a person''s approval is not automatic',
      'expected', 'draft|0|false|false', 'actual', v_txt, 'pass', v_txt = 'draft|0|false|false');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 7 ------------------------------------------------------------------ nothing left
  select count(*) into v_cnt from (
    select key from app.message_overrides where key like 'probe.%'
    union all select id::text from auth.users where id in (v_member, v_sa, v_sup)
    union all select key from app.legal_approvals where key like 'doc:probe:%') x;
  v_txt := v_cnt || '|' || ((select auto_approve from app.platform_settings where id) is not distinct from v_was)::text;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back, and the switch is as it was',
    'expected', '0|true', 'actual', v_txt, 'pass', v_txt = '0|true');

  insert into public._aai
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._aai order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._aai;
  if v_failed is not null then raise exception 'auto-approve invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'auto-approve invariants: expected 7 rows, got %', v_count; end if;
end $$;

drop table public._aai;
