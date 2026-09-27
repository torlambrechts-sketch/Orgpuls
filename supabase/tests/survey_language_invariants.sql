-- survey_language_invariants.sql — the survey in more languages (0086, D-133).
--
--   * the dispatcher's texts only for the service role; the import and the sources only for a
--     signed-in caller, the reading helper for none (1)
--   * the registry takes page (ui:), mail (mail:) and module factor (mfactor:) keys, and nothing
--     shaped otherwise; Ukrainian, Swedish and Danish are languages; an employee may prefer them (2)
--   * what may be approved: machine text in English only, an official version at any step,
--     anything else once pretested (3)
--   * the import: super-admin only; new rows as drafts or the step named, never approved; the same
--     file again changes nothing; a new wording is a new version; a bad row is refused alone;
--     audited (4)
--   * respond_locales: a module statement's factor name under module:<item>:factor, and the
--     approved page strings with the source they were made from (5)
--   * dispatch_language_texts: the approved mail texts and page-string hashes per language (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/survey_language_invariants.sql

create unlogged table if not exists public._sli(seq int, name text, expected text, actual text, pass bool);
truncate public._sli;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_dl    uuid;
  v_sa    uuid := '00000000-0000-4000-8000-00000000c861';
  v_mod   uuid;
  v_item  uuid;
  v_fac   uuid;
  v_meas  uuid;
  v_round uuid;
  v_emp   uuid;
  v_rows  jsonb := '[]';
  v_txt   text;
  v_json  jsonb;
  v_ok    boolean;
  v_token constant text := 'sli-probe-token-0000000000000001';
  h       constant text := repeat('ab', 32);
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  -- 1 -------------------------------------------------------------- the grant surface
  v_txt := concat_ws('/',
    has_function_privilege('service_role', 'public.dispatch_language_texts()', 'execute'),
    has_function_privilege('authenticated', 'public.dispatch_language_texts()', 'execute'),
    has_function_privilege('anon', 'public.dispatch_language_texts()', 'execute'),
    has_function_privilege('authenticated', 'public.admin_translations_import(text, jsonb)', 'execute'),
    has_function_privilege('anon', 'public.admin_translations_import(text, jsonb)', 'execute'),
    has_function_privilege('anon', 'public.admin_translation_sources()', 'execute'),
    has_function_privilege('authenticated', 'app.approved_texts(text, text)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the dispatcher''s texts for the service role only; import and sources for a signed-in caller; the helper for none',
    'expected', 't/f/f/t/f/f/f', 'actual', v_txt, 'pass', v_txt = 't/f/f/t/f/f/f');

  begin
    -- 2 ------------------------------------------------------------ keys and languages
    v_txt := '';
    foreach v_json in array array['"ui:respond.intro"', '"ui:factor.ytring.label"', '"mail:invitasjon.subject"',
                                  '"mfactor:0f0e0d0c-0b0a-4908-8706-050403020100"', '"mfactor:0f0e0d0c-0b0a-4908-8706-050403020100:v:skole"',
                                  '"ui:Respond"', '"ui:respond..x"', '"mail:"', '"ui:respond.x y"']::jsonb[] loop
      begin
        insert into app.item_translations (item_id, locale, text, source) values (v_json #>> '{}', 'uk', 'проба', 'professional');
        v_txt := v_txt || 'y';
      exception when check_violation then v_txt := v_txt || 'n';
      end;
    end loop;
    insert into app.item_translations (item_id, locale, text, source) values ('core:ytring:3', 'sv', 'prov', 'official'), ('core:ytring:3', 'da', 'prøve', 'official');
    insert into app.employees (org_id, full_name, email, language, active) values (v_org, 'Sli Probe', 'sli-probe@orgpuls.com', 'uk', true) returning id into v_emp;
    v_txt := v_txt || ',' || (select count(*) from app.item_translations where item_id = 'core:ytring:3' and locale in ('sv', 'da'));
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'page, mail and module factor keys are taken, other shapes refused; uk, sv and da are languages',
      'expected', 'yyyyynnnn,2', 'actual', v_txt, 'pass', v_txt = 'yyyyynnnn,2');

    -- 3 ------------------------------------------------------------ what may be approved
    v_txt := concat_ws('/',
      app.translation_approvable('machine', 'draft', 'pl'), app.translation_approvable('machine', 'pretested', 'pl'),
      app.translation_approvable('machine', 'draft', 'en'), app.translation_approvable('official', 'draft', 'sv'),
      app.translation_approvable('professional', 'adjudicated', 'uk'), app.translation_approvable('professional', 'pretested', 'uk'),
      app.translation_approvable('official', 'approved', 'da'));
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'machine text approvable in English only, an official version at any step, the rest once pretested',
      'expected', 'f/t/t/t/f/t/f', 'actual', v_txt, 'pass', v_txt = 'f/t/t/t/f/t/f');

    -- 4 ------------------------------------------------------------ the import
    insert into auth.users (id, email) values (v_sa, 'sa@sli-test.example');
    insert into app.platform_admins (user_id, role) values (v_sa, 'super_admin');
    delete from app.item_translations where locale = 'pl' and item_id in ('ui:respond.sliA', 'ui:respond.sliB', 'ui:respond.sliC');
    v_json := jsonb_build_array(
      jsonb_build_object('key', 'ui:respond.sliA', 'text', 'Próba A', 'source', 'professional', 'source_hash', h),
      jsonb_build_object('key', 'ui:respond.sliB', 'text', 'Próba B', 'source', 'professional', 'status', 'pretested', 'notes', 'Wywiad kognitywny', 'source_hash', h),
      jsonb_build_object('key', 'ui:respond.sliC', 'text', 'Próba C', 'source', 'professional', 'status', 'approved'),
      jsonb_build_object('key', 'nonsense key', 'text', 'x', 'source', 'professional'));
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    v_txt := public.admin_translations_import('pl', v_json)->>'error';
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_sa), true);
    set local role authenticated;
    v_json := public.admin_translations_import('pl', v_json);
    reset role;
    v_txt := v_txt || ',' || concat_ws('/', v_json->>'new', v_json->>'changed', v_json->>'same', jsonb_array_length(v_json->'refused'))
          || ',' || (select string_agg(item_id || '=' || status, ' ' order by item_id) from app.item_translations where locale = 'pl' and item_id like 'ui:respond.sli%');
    -- the same file again changes nothing; a new wording is the next version
    set local role authenticated;
    v_json := public.admin_translations_import('pl', jsonb_build_array(
      jsonb_build_object('key', 'ui:respond.sliA', 'text', 'Próba A', 'source', 'professional', 'source_hash', h),
      jsonb_build_object('key', 'ui:respond.sliB', 'text', 'Próba B2', 'source', 'professional', 'status', 'pretested', 'source_hash', h)));
    reset role;
    v_txt := v_txt || ',' || concat_ws('/', v_json->>'new', v_json->>'changed', v_json->>'same')
          || ',' || (select version || ':' || status from app.item_translations where locale = 'pl' and item_id = 'ui:respond.sliB')
          || ',' || (select count(*) from app.admin_audit where admin_id = v_sa and action = 'translations.import');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'import: super-admin only; drafts or the step named, never approved; the same row twice unchanged; a new wording a new version; audited',
      'expected', 'not_allowed,2/0/0/2,ui:respond.sliA=draft ui:respond.sliB=pretested,0/1/1,2:pretested,2', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,2/0/0/2,ui:respond.sliA=draft ui:respond.sliB=pretested,0/1/1,2:pretested,2');

    -- 5 ------------------------------------------------------------ the respondent's texts
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-sli', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object('id', 'f', 'name', 'Faktor', 'summary', 'S', 'rationale', 'R',
        'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb,
        'items', '[{"id":"PS-FF-1","text":"en","reverse":false,"pulse_eligible":true},{"id":"PS-FF-2","text":"to","reverse":false,"pulse_eligible":true},{"id":"PS-FF-3","text":"tre","reverse":false,"pulse_eligible":true}]'::jsonb,
        'action_suggestions', '[]'::jsonb)),
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('c', 64));
    perform app.module_set_status('probe-sli', '0.0.1', 'published');
    select m.id into v_mod from app.question_modules m where m.key = 'probe-sli';
    select i.id, i.factor_id into v_item, v_fac from app.module_items i where i.module_id = v_mod and i.code = 'PS-FF-1';
    insert into app.measurements (org_id, kind, year) values (v_org, 'oppfolging', 2092) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', now() - interval '1 day', now() + interval '5 days') returning id into v_round;
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_round, 'ytring');
    insert into app.round_modules (org_id, round_id, module_id, item_ids)
    select v_org, v_round, v_mod, array_agg(i.id) from app.module_items i where i.module_id = v_mod and i.kind = 'likert5';
    delete from app.item_translations where locale = 'pl' and item_id in (select app.round_item_keys(v_round));
    insert into app.item_translations (item_id, locale, text, source)
    select k, 'pl', 'sli ' || k, 'official' from app.round_item_keys(v_round) k;
    update app.item_translations set status = 'approved' where locale = 'pl' and source = 'official' and text like 'sli %';
    -- English for every item but the factor's name, which English reads from the module itself
    insert into app.item_translations (item_id, locale, text, source, approved_at)
    select k, 'en', 'sli-en ' || k, 'machine', now() from app.round_item_keys(v_round) k where k not like 'mfactor:%'
    on conflict (item_id, locale) do update set text = excluded.text, source = excluded.source, approved_at = excluded.approved_at;
    update app.item_translations set status = 'pretested' where locale = 'pl' and item_id = 'ui:respond.sliA';
    update app.item_translations set status = 'approved' where locale = 'pl' and item_id like 'ui:respond.sli%';
    update app.rounds set status = 'apen' where id = v_round;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    values (v_org, v_round, v_emp, extensions.digest(v_token, 'sha256'), now() + interval '5 days');
    set local role anon;
    v_json := public.respond_locales(v_token);
    reset role;
    v_txt := concat_ws(',', v_json#>>'{locales,pl,missing}', v_json#>>'{locales,en,missing}',
                       v_json#>>array['texts', 'pl', 'module:' || v_item || ':factor'],
                       v_json#>>'{ui,pl,respond.sliB,t}', (v_json#>>'{ui,pl,respond.sliB,h}') = h,
                       v_json#>>'{employee_lang}');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'respond_locales: Polish complete, English complete without the factor''s name, the name under module:<item>:factor, page strings with their source hash, a Ukrainian speaker',
      'expected', format('0,0,sli mfactor:%s,Próba B2,t,uk', v_fac), 'actual', v_txt,
      'pass', v_txt = format('0,0,sli mfactor:%s,Próba B2,t,uk', v_fac));

    -- 6 ------------------------------------------------------------ the dispatcher's
    insert into app.item_translations (item_id, locale, text, source, status)
    values ('mail:invitasjon.subject', 'pl', '{org}: ankieta', 'official', 'approved');
    update app.item_translations set source_hash = h where locale = 'pl' and item_id = 'mail:invitasjon.subject';
    set local role service_role;
    v_json := public.dispatch_language_texts();
    reset role;
    v_txt := concat_ws(',', v_json#>>'{mail,pl,invitasjon.subject,t}', (v_json#>>'{mail,pl,invitasjon.subject,h}') = h,
                       (v_json#>'{ui,pl}') ? 'respond.sliA', v_json#>>'{mail,sv}');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'dispatch_language_texts: approved mail texts with their source, page-string keys, nothing for a language with none',
      'expected', '{org}: ankieta,t,t,{}', 'actual', v_txt, 'pass', v_txt = '{org}: ankieta,t,t,{}');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_txt := (not exists (select 1 from app.item_translations where item_id like 'ui:respond.sli%' or text like 'sli %' or text in ('проба', 'prov', 'prøve'))
            and not exists (select 1 from app.question_modules where key = 'probe-sli')
            and not exists (select 1 from app.employees where email = 'sli-probe@orgpuls.com')
            and not exists (select 1 from app.platform_admins where user_id = v_sa))::text;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe change was rolled back', 'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._sli
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._sli order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._sli;
  if v_failed is not null then raise exception 'survey language invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'survey language invariants: expected 7 rows, got %', v_count; end if;
end $$;

drop table public._sli;
