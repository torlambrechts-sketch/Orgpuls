-- crm_rules_invariants.sql — the CRM rule settings registry (0192, D-208), proved against the live schema.
--
--   * every setting exists with its documented default, and nothing is set out of the box (1)
--   * with the defaults nothing is refused: a contact without a consent source is added with no basis,
--     is not mailable and gets no consent record; an import row without one likewise; erase,
--     unsubscribe and leaving a list need no reason; no cap applies (2–5)
--   * each setting switched on does what it says, and the refusal names the setting: the contact rule
--     (source and basis; opt-in only), a consent source per import row, a typed reason, every limit (6–11)
--   * only a super-admin changes a setting; a value outside the setting's options is refused; each change
--     is logged with who and the reason, the log is append-only, and the CRM's readers see the rules (12–14)
--   * an unknown key is an error; no client role may touch the tables or the readers (15, 16)
--   * every registered key has a consumer: a function that reads it through crm_rule/crm_limit/crm_choice (17)
--   * the engagement window of mailability is a setting, 12 months by default (19, 0193)
--   * nothing written here survives (18)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_rules_invariants.sql

create unlogged table if not exists public._crr(seq int, name text, expected text, actual text, pass bool);
truncate public._crr;

do $$
declare
  v_super uuid := '00000000-0000-4000-8000-0000000c8101';
  v_mkt   uuid := '00000000-0000-4000-8000-0000000c8102';
  v_ana   uuid := '00000000-0000-4000-8000-0000000c8103';
  claims  text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  v_rows  jsonb := '[]';
  v_json  jsonb;
  v_txt   text;
  v_id    uuid;
  v_co1   uuid;
  v_co2   uuid;
  v_list  uuid;
  v_ok    boolean;
  v_blocks jsonb := '[{"type":"heading","text":"Hei"},{"type":"text","text":"Nytt."},{"type":"text","text":"Mer."}]';
begin
  -- 1 ---------------------------------------------------------------- the registry and its defaults
  select string_agg(key || '=' || coalesce(default_value #>> '{}', ''), ',' order by sort) into v_txt from app.crm_setting_defs;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'every setting with its documented default, none set',
    'expected', 'contact_rule=none,mailable_engagement_months=12,import_consent_source=off,typed_reason=off,limit_contact_import_rows=,limit_register_import_rows=,limit_bulk_move=,limit_company_read=,limit_contact_read=,limit_campaign_blocks=,limit_sequence_mails=,limit_test_sends_per_hour= / 0 set',
    'actual', coalesce(v_txt, '') || ' / ' || (select count(*) from app.crm_setting_values) || ' set',
    'pass', v_txt = 'contact_rule=none,mailable_engagement_months=12,import_consent_source=off,typed_reason=off,limit_contact_import_rows=,limit_register_import_rows=,limit_bulk_move=,limit_company_read=,limit_contact_read=,limit_campaign_blocks=,limit_sequence_mails=,limit_test_sends_per_hour='
      and not exists (select 1 from app.crm_setting_values));

  begin
    insert into auth.users (id, email) values (v_super, 'super@rules-test.example'), (v_mkt, 'marketing@rules-test.example'), (v_ana, 'analyst@rules-test.example');
    insert into app.platform_admins (user_id, role) values (v_super, 'super_admin'), (v_mkt, 'marketing'), (v_ana, 'analyst');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);

    -- 2 -------------------------------------------------------------- default: a contact without a source
    v_json := public.admin_crm_save_contact(null, jsonb_build_object('email', 'uten.kilde@rules-test.example', 'name', 'Uten Kilde'));
    v_id := (v_json->>'id')::uuid;
    v_txt := coalesce(v_json->>'error', 'ok') || ',' || coalesce((select c.basis || '/' || app.crm_mailable(c)::text || '/' || coalesce(c.consent_source, '-')
                                                                    from app.crm_contacts c where c.id = v_id), '?')
      || ',' || (select count(*) from app.consent_records r where r.contact_id = v_id and r.status = 'granted');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'default: a contact needs no consent source; it has no basis, is not mailable, no consent recorded',
      'expected', 'ok,none/false/-,0', 'actual', v_txt, 'pass', v_txt = 'ok,none/false/-,0');

    -- 3 -------------------------------------------------------------- default: an import row without a source
    v_json := public.admin_crm_import(jsonb_build_array(
      jsonb_build_object('email', 'import.uten@rules-test.example', 'name', 'Import Uten'),
      jsonb_build_object('email', 'import.med@rules-test.example', 'consent_source', 'Arendalsuka 2026, påmelding')));
    v_txt := concat_ws(',', v_json->>'inserted', jsonb_array_length(v_json->'rejected'),
      (select string_agg(c.basis, '/' order by c.email desc) from app.crm_contacts c where c.email like 'import.%@rules-test.example'));
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'default: an import row needs no consent source; with one it is consent, without none',
      'expected', '2,0,none/consent', 'actual', v_txt, 'pass', v_txt = '2,0,none/consent');

    -- 4 -------------------------------------------------------------- default: no typed reason
    insert into app.crm_lists (key, name_no, name_en) values ('rules-probe', 'Regelprobe', 'Rules probe') returning id into v_list;
    insert into app.crm_list_members (list_id, contact_id, status, source) values (v_list, v_id, 'subscribed', 'regelprobe');
    v_txt := coalesce(public.admin_crm_list_remove(v_list, v_id, null)->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_contact_action(v_id, 'unsubscribe', '')->>'error', 'ok');
    v_ok := exists (select 1 from app.admin_audit a where a.admin_id = v_mkt and a.action = 'crm.contact_unsubscribe' and a.reason is null);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'default: leaving a list and unsubscribing need no reason; the audit row is still written',
      'expected', 'ok,ok audited', 'actual', v_txt || case when v_ok then ' audited' else ' not audited' end, 'pass', v_txt = 'ok,ok' and v_ok);

    -- 5 -------------------------------------------------------------- default: no caps
    insert into app.crm_companies (name, org_number, stage) values ('Regel AS', '999810001', 'new') returning id into v_co1;
    insert into app.crm_companies (name, org_number, stage) values ('Regel To AS', '999810002', 'new') returning id into v_co2;
    v_txt := coalesce(public.admin_crm_stage_move(array[v_co1, v_co2], 'contacted')->>'moved', '?')
      || ',' || coalesce(public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Regelprobe', 'blocks',
                  (select jsonb_agg(jsonb_build_object('type', 'text', 'text', 'Linje ' || g)) from generate_series(1, 31) g)))->>'ok', '?')
      || ',' || ((public.admin_crm_companies(null, null, null)->'limit') = 'null'::jsonb)::text
      || ',' || app.crm_blocks_ok((select jsonb_agg(jsonb_build_object('type', 'text', 'text', 'x')) from generate_series(1, 31)))::text;
    -- every contact and company is listed, asked with no p_limit as the page asks
    v_txt := v_txt || ',' || (jsonb_array_length(public.admin_crm_contacts(null, null, null)->'rows') = (select count(*) from app.crm_contacts))::text
      || ',' || (jsonb_array_length(public.admin_crm_companies(null, null, null)->'rows') = (select count(*) from app.crm_companies))::text;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'default: no cap on bulk moves, campaign blocks or list reads; every contact and company is listed',
      'expected', '2,true,true,true,true,true', 'actual', v_txt, 'pass', v_txt = '2,true,true,true,true,true');

    -- 6, 7 ----------------------------------------------------------- the contact rule switched on
    insert into app.crm_setting_values (key, value) values ('contact_rule', '"source_and_basis"');
    v_json := public.admin_crm_save_contact(null, jsonb_build_object('email', 'regel.kreves@rules-test.example'));
    v_txt := coalesce(v_json->>'error', 'ok') || '/' || coalesce(v_json->>'setting', '-');
    v_json := public.admin_crm_save_contact(null, jsonb_build_object('email', 'regel.med@rules-test.example', 'consent_source', 'Møtt på messe'));
    v_txt := v_txt || ',' || coalesce((select c.basis from app.crm_contacts c where c.id = (v_json->>'id')::uuid), coalesce(v_json->>'error', '?'))
      || ',' || coalesce((select string_agg(r->>'reason', '+') from jsonb_array_elements(public.admin_crm_import('[{"email":"regel.imp@rules-test.example"}]')->'rejected') r), 'none');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'contact rule «source and basis»: no source is refused naming the setting; with one it is consent; imports too',
      'expected', 'consent_required/contact_rule,consent,consent_required', 'actual', v_txt, 'pass', v_txt = 'consent_required/contact_rule,consent,consent_required');

    update app.crm_setting_values set value = '"opt_in_only"' where key = 'contact_rule';
    v_txt := coalesce(public.admin_crm_save_contact(null, jsonb_build_object('email', 'regel.optin@rules-test.example', 'consent_source', 'Møtt på messe'))->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_import('[{"email":"regel.optin2@rules-test.example","consent_source":"Liste fra messe"}]')->>'setting', 'ok');
    delete from app.crm_setting_values where key = 'contact_rule';
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'contact rule «opt-in only»: no manual or imported contact',
      'expected', 'blocked_by_setting,contact_rule', 'actual', v_txt, 'pass', v_txt = 'blocked_by_setting,contact_rule');

    -- 8 -------------------------------------------------------------- consent source per import row
    insert into app.crm_setting_values (key, value) values ('import_consent_source', '"required"');
    v_json := public.admin_crm_import('[{"email":"kilde.mangler@rules-test.example"},{"email":"kilde.finnes@rules-test.example","consent_source":"Kundeliste 2026"}]');
    v_txt := concat_ws(',', v_json->>'inserted', (select string_agg(r->>'reason', '+') from jsonb_array_elements(v_json->'rejected') r));
    delete from app.crm_setting_values where key = 'import_consent_source';
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'consent source on import «required»: a row without one is rejected with the reason',
      'expected', '1,consent_required', 'actual', v_txt, 'pass', v_txt = '1,consent_required');

    -- 9 -------------------------------------------------------------- typed reason on
    insert into app.crm_setting_values (key, value) values ('typed_reason', '"on"');
    v_json := public.admin_crm_contact_action(v_id, 'erase', 'x');
    v_txt := coalesce(v_json->>'error', 'ok') || '/' || coalesce(v_json->>'setting', '-')
      || ',' || coalesce(public.admin_crm_contact_action(v_id, 'erase', 'Ba om sletting på telefon')->>'error', 'ok');
    delete from app.crm_setting_values where key = 'typed_reason';
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'typed reason «on»: a short reason is refused naming the setting; a real one passes',
      'expected', 'reason_required/typed_reason,ok', 'actual', v_txt, 'pass', v_txt = 'reason_required/typed_reason,ok');

    -- 10 ------------------------------------------------------------- limits switched on
    insert into app.crm_setting_values (key, value) values ('limit_bulk_move', '1'), ('limit_contact_import_rows', '1'),
      ('limit_register_import_rows', '1'), ('limit_campaign_blocks', '2'), ('limit_company_read', '1'), ('limit_contact_read', '1');
    v_txt := concat_ws(',',
      public.admin_crm_stage_move(array[v_co1, v_co2], 'new')->>'setting',
      public.admin_crm_import('[{"email":"a@rules-test.example"},{"email":"b@rules-test.example"}]')->>'setting',
      public.admin_crm_company_import('[{"org_number":"999810003","name":"A"},{"org_number":"999810004","name":"B"}]', 'brreg', null)->>'setting',
      public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Regelprobe to', 'blocks', v_blocks))->>'setting',
      jsonb_array_length(public.admin_crm_companies(null, null, null)->'rows'),
      jsonb_array_length(public.admin_crm_contacts(null, null, null)->'rows'));
    -- a chain of two mails meets a sequence limit of two; an eleventh test send in the hour meets a limit of ten
    update app.crm_setting_values set value = '2' where key = 'limit_campaign_blocks';
    insert into app.crm_setting_values (key, value) values ('limit_sequence_mails', '2'), ('limit_test_sends_per_hour', '1');
    v_json := public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Kjede en', 'subject', 'Hei', 'blocks', '[{"type":"text","text":"En."}]'::jsonb));
    update app.crm_campaigns set status = 'sent' where id = (v_json->>'id')::uuid;
    v_json := public.admin_crm_campaign_resend((v_json->>'id')::uuid, 3);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_campaign_resend((v_json->>'id')::uuid, 3)->>'setting', coalesce(public.admin_crm_campaign_resend((v_json->>'id')::uuid, 3)->>'error', 'none'));
    insert into app.crm_sends (kind, campaign_id, to_email, status) values ('test', (v_json->>'id')::uuid, 'marketing@rules-test.example', 'sent');
    v_txt := v_txt || ',' || coalesce(public.admin_crm_campaign_test((v_json->>'id')::uuid)->>'setting', 'none');
    delete from app.crm_setting_values where key like 'limit_%';
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'each limit, once set, refuses past it naming the setting or caps the list',
      'expected', 'limit_bulk_move,limit_contact_import_rows,limit_register_import_rows,limit_campaign_blocks,1,1,limit_sequence_mails,limit_test_sends_per_hour', 'actual', v_txt,
      'pass', v_txt = 'limit_bulk_move,limit_contact_import_rows,limit_register_import_rows,limit_campaign_blocks,1,1,limit_sequence_mails,limit_test_sends_per_hour');

    -- 11 ------------------------------------------------------------- and off again restores full function
    v_txt := coalesce(public.admin_crm_stage_move(array[v_co1, v_co2], 'new')->>'moved', '?')
      || ',' || coalesce(public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Regelprobe tre', 'blocks', v_blocks))->>'ok', '?');
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'switching a limit off restores full function',
      'expected', '2,true', 'actual', v_txt, 'pass', v_txt = '2,true');

    -- 12 ------------------------------------------------------------- who may change a setting
    v_txt := coalesce(public.admin_crm_rule_set('typed_reason', '"on"')->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_super, 'aal1'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_rule_set('typed_reason', '"on"')->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_super, 'aal2'), true);
    v_txt := v_txt || ',' || concat_ws('/',
      public.admin_crm_rule_set('typed_reason', '"maybe"')->>'error',
      public.admin_crm_rule_set('limit_bulk_move', '0')->>'error',
      public.admin_crm_rule_set('limit_bulk_move', '"10"')->>'error',
      public.admin_crm_rule_set('no_such_rule', '"on"')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'marketing and a super-admin without the second factor may not; values outside the options are refused',
      'expected', 'not_allowed,not_allowed,invalid/invalid/invalid/not_found', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,not_allowed,invalid/invalid/invalid/not_found');

    -- 13 ------------------------------------------------------------- a change is logged with who and why
    -- one call per statement: a statement's subqueries do not see what its own calls wrote
    v_txt := coalesce(public.admin_crm_rule_set('limit_bulk_move', '25', 'Pilot med manuell kontroll')->>'changed', '?');
    v_txt := v_txt || ',' || coalesce(public.admin_crm_rule_set('limit_bulk_move', '25')->>'changed', '?');
    v_txt := v_txt || ',' || coalesce(public.admin_crm_rule_set('typed_reason', '"on"', 'Revisjon ber om begrunnelser')->>'changed', '?');
    v_txt := v_txt || ',' || coalesce(public.admin_crm_rule_set('typed_reason', '"off"')->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.admin_crm_rule_set('typed_reason', '"off"', 'Revisjonen er ferdig')->>'changed', '?');
    -- unlimited arrives from PostgREST as SQL NULL
    v_txt := v_txt || ',' || coalesce(public.admin_crm_rule_set('limit_bulk_move', null)->>'changed', '?')
      || '/' || coalesce(public.admin_crm_rule_set('typed_reason', null)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce((select string_agg(l.key || ':' || coalesce(l.old_value::text, '-') || '>' || l.new_value::text || ':' || (l.changed_by = v_super)::text, ';' order by l.id) from app.crm_setting_log l), '-');
    v_txt := v_txt || ',' || (select count(*) from app.admin_audit a where a.admin_id = v_super and a.action = 'crm.rule_set');
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'a change is logged with old and new value and who; the same value changes nothing; with typed reason on, changing a setting needs one too; SQL NULL means unlimited for a limit and is refused for a choice',
      'expected', 'true,false,true,reason_required,true,true/invalid,limit_bulk_move:null>25:true;typed_reason:"off">"on":true;typed_reason:"on">"off":true;limit_bulk_move:25>null:true,4',
      'actual', v_txt,
      'pass', v_txt = 'true,false,true,reason_required,true,true/invalid,limit_bulk_move:null>25:true;typed_reason:"off">"on":true;typed_reason:"on">"off":true;limit_bulk_move:25>null:true,4');

    begin
      update app.crm_setting_log set reason = 'rewritten';
      v_txt := 'updated';
    exception when others then
      v_txt := 'refused';
    end;
    begin
      delete from app.crm_setting_log;
      v_txt := v_txt || ',deleted';
    exception when others then
      v_txt := v_txt || ',refused';
    end;
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_json := public.admin_crm_rules();
    v_txt := v_txt || ',analyst sees ' || coalesce(jsonb_array_length(v_json->'rules'), 0) || ' rules, '
      || case when (v_json->>'may_change')::boolean then 'may change' else 'may not change' end;
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'the settings log is append-only; the CRM''s readers see the rules, only a super-admin may change them',
      'expected', 'refused,refused,analyst sees 12 rules, may not change', 'actual', v_txt,
      'pass', v_txt = 'refused,refused,analyst sees 12 rules, may not change');
    -- 19 ------------------------------------------------------------- the engagement window (0193)
    insert into app.crm_contacts (email, source, basis, status, consent_at, consent_source, last_engaged_at)
    values ('stille@rules-test.example', 'import', 'consent', 'active', now() - interval '2 years', 'Liste fra 2024', now() - interval '20 months');
    v_txt := (select app.crm_mailable(c)::text from app.crm_contacts c where c.email = 'stille@rules-test.example');
    insert into app.crm_setting_values (key, value) values ('mailable_engagement_months', 'null');
    v_txt := v_txt || ',' || (select app.crm_mailable(c)::text from app.crm_contacts c where c.email = 'stille@rules-test.example');
    update app.crm_setting_values set value = '24' where key = 'mailable_engagement_months';
    v_txt := v_txt || ',' || (select app.crm_mailable(c)::text from app.crm_contacts c where c.email = 'stille@rules-test.example');
    update app.crm_setting_values set value = '6' where key = 'mailable_engagement_months';
    v_txt := v_txt || ',' || (select app.crm_mailable(c)::text from app.crm_contacts c where c.email = 'stille@rules-test.example');
    delete from app.crm_setting_values where key = 'mailable_engagement_months';
    v_rows := v_rows || jsonb_build_object('seq', 19, 'name', 'engagement window: 12 months by default; unlimited and 24 months mail a contact silent for 20 months, 6 months does not',
      'expected', 'false,true,true,false', 'actual', v_txt, 'pass', v_txt = 'false,true,true,false');

    perform set_config('request.jwt.claims', '', true);

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 15 --------------------------------------------------------------- an unknown key is an error
  begin
    perform app.crm_rule('no_such_rule');
    v_txt := 'answered';
  exception when others then
    v_txt := 'raised';
  end;
  v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'an unknown setting is an error, not a silent default', 'expected', 'raised', 'actual', v_txt, 'pass', v_txt = 'raised');

  -- 16 --------------------------------------------------------------- closed to clients
  v_ok := not exists (
      select 1 from unnest(array['app.crm_setting_defs', 'app.crm_setting_values', 'app.crm_setting_log']) t(name), unnest(array['anon', 'authenticated']) r(role)
      where has_table_privilege(r.role, t.name, 'select,insert,update,delete'))
    and (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('app.crm_setting_defs'::regclass, 'app.crm_setting_values'::regclass, 'app.crm_setting_log'::regclass))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename like 'crm_setting_%')
    and not exists (
      select 1 from unnest(array['app.crm_rule(text)', 'app.crm_limit(text)', 'app.crm_choice(text)', 'app.crm_reason_ok(text)']) f(sig), unnest(array['anon', 'authenticated']) r(role)
      where has_function_privilege(r.role, f.sig, 'execute'))
    and not has_function_privilege('anon', 'public.admin_crm_rules()', 'execute')
    and not has_function_privilege('anon', 'public.admin_crm_rule_set(text,jsonb,text)', 'execute')
    -- a function that writes the audit log cannot be stable or immutable: PostgREST runs those read-only
    and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname like 'admin_crm%' and p.provolatile <> 'v' and p.prosrc like '%admin_log(%');
  v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'RLS on, no policy, no client grant on the tables or the readers; anon may not call the screen''s functions; no audited CRM function is read-only',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  -- 17 --------------------------------------------------------------- every key has a consumer
  select coalesce(string_agg(d.key, ',' order by d.key), '') into v_txt from app.crm_setting_defs d
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public') and p.proname not in ('crm_rule', 'crm_limit', 'crm_choice')
      and p.prosrc ~ ('crm_(rule|limit|choice)\(''' || d.key || ''''));
  if not exists (select 1 from app.crm_setting_defs d where d.key = 'typed_reason') then v_txt := v_txt || ',typed_reason missing'; end if;
  v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'every registered setting is read by a function (typed_reason through crm_reason_ok)',
    'expected', '', 'actual', v_txt, 'pass', v_txt = '');

  -- 18 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select key from app.crm_setting_values union all select key from app.crm_setting_log
    union all select email from app.crm_contacts where email like '%@rules-test.example'
    union all select email from auth.users where email like '%@rules-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._crr
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._crr order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._crr;
  if v_failed is not null then raise exception 'crm rules invariants failed: %', v_failed; end if;
  if v_count <> 19 then raise exception 'crm rules invariants: expected 19 rows, got %', v_count; end if;
end $$;
