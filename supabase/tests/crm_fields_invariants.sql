-- crm_fields_invariants.sql — CRM custom fields (0197, D-212): the registry, custom values, quality rules, hidden
-- and read-only fields, formulas, filters and import, proved against the live schema.
--
--   * structure: the registry closed to clients, its calls to anon and its helpers to every client; the rules at
--     their defaults; the value columns and their indexes; a history line may name a custom value (1)
--   * a new field appears in the record, the list, the registry and the contact page without a deploy (2)
--   * each of the sixteen types takes a valid value, normalised, and refuses an invalid one (3)
--   * required: blocks a manual save and a stage move from its stage on, and is reported, not enforced, on import (4)
--   * hidden and read-only per permission set: absent from the record, the list, the registry, the history and the
--     filters, refused as unknown by every writer; read-only shown and refused as read-only; the registry is the
--     CRM settings' to change (5)
--   * formulas: the stored value equals the result and follows its inputs; no self-reference, no cycle, no bad
--     syntax or reference; a formula field is not typed in (6)
--   * every save is a version, a stale one is refused, a version is never changed (7)
--   * filters: the companies list and segments by custom conditions (8)
--   * import: columns by key or label, text made into values, unknown columns and bad values reported (9)
--   * history: a custom value's change is a line of its own (10)
--   * limits: fields and options per field, unlimited by default (11)
--   * archive and guards: an archived field leaves the screens and keeps its values; a field a formula reads, a type
--     in use, an option in use, a group in use and a reserved key are refused (12)
--   * no reader hands out a whole company or contact row but through the registry (13)
--   * nothing written here survives (14)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_fields_invariants.sql

create unlogged table if not exists public._cfi(seq int, name text, expected text, actual text, pass bool);
truncate public._cfi;

do $$
declare
  v_su    uuid := '00000000-0000-4000-8000-0000000cf101';
  v_m1    uuid := '00000000-0000-4000-8000-0000000cf102';
  claims  text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
  v_rows  jsonb := '[]';
  v_json  jsonb;
  v_txt   text;
  v_ok    boolean;
  v_set   uuid;
  v_group uuid;
  v_region uuid;
  v_shoe  uuid;
  v_budget uuid;
  v_secret uuid;
  v_csecret uuid;
  v_extra uuid;
  v_total uuid;
  v_bf    uuid;
  v_co    uuid;
  v_co2   uuid;
  v_co3   uuid;
  v_ct    uuid;
  f       app.crm_fields;
  r       record;
begin
  -- 1 ---------------------------------------------------------------- structure
  v_ok := (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('app.crm_field_groups'::regclass, 'app.crm_fields'::regclass, 'app.crm_field_versions'::regclass))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('crm_field_groups', 'crm_fields', 'crm_field_versions'))
    and not exists (select 1 from unnest(array['app.crm_field_groups', 'app.crm_fields', 'app.crm_field_versions']) t, unnest(array['anon', 'authenticated']) g
                    where has_table_privilege(g, t, 'select,insert,update,delete'))
    and not exists (select 1 from unnest(array['public.admin_crm_fields(text)', 'public.admin_crm_field_save(uuid,jsonb,text)',
                      'public.admin_crm_field_archive(uuid,boolean,text)', 'public.admin_crm_field_group_save(uuid,text,text,integer,text)',
                      'public.admin_crm_field_group_archive(uuid,boolean,text)', 'public.admin_crm_companies(text,text,uuid,jsonb)']) x
                    where has_function_privilege('anon', x, 'execute') or not has_function_privilege('authenticated', x, 'execute'))
    and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'app' and p.proname in ('crm_field_access', 'crm_custom_out', 'crm_custom_refs', 'crm_field_value', 'crm_field_text',
                      'crm_custom_in', 'crm_custom_missing', 'crm_conditions_ok', 'crm_conditions_visible', 'crm_custom_match', 'crm_formula_compile',
                      'crm_formula_eval', 'crm_custom_formulas', 'crm_field_in_use', 'crm_options_in_use', 'crm_formulas_recompute', 'crm_custom_import',
                      'crm_custom_key_visible', 'crm_filter_out', 'crm_num', 'crm_date_text', 'crm_formula_columns')
                      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')))
    and to_regprocedure('public.admin_crm_companies(text,text,uuid)') is null
    and app.crm_limit('limit_custom_fields') is null and app.crm_limit('limit_field_options') is null
    and (select count(*) from pg_indexes where schemaname = 'app' and indexname in ('crm_companies_custom_idx', 'crm_contacts_custom_idx')) = 2
    and (select count(*) from app.crm_companies where custom <> '{}'::jsonb) + (select count(*) from app.crm_contacts where custom <> '{}'::jsonb) = 0
    and 'custom.shoe_size' ~ (select substring(pg_get_constraintdef(c.oid) from 'field ~ ''(\^custom[^'']+)''') from pg_constraint c where c.conname = 'crm_changes_field_check');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'registry closed to clients; calls closed to anon, helpers to every client; rules unlimited; value columns indexed and empty; history names custom values',
    'expected', 'true', 'actual', coalesce(v_ok::text, 'null'), 'pass', coalesce(v_ok, false));

  begin
    insert into auth.users (id, email) values (v_su, 'super@fields-test.example'), (v_m1, 'm1@fields-test.example');
    insert into app.platform_admins (user_id, role) values (v_su, 'super_admin'), (v_m1, 'marketing');
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    -- m1 works under a set that edits companies and contacts and runs campaigns, without the CRM's settings
    v_set := (public.admin_crm_set_save(null, 'Fields test', array['deals.create', 'deals.edit', 'deals.reports', 'contacts.create', 'contacts.edit',
               'contacts.import', 'campaigns.create', 'campaigns.edit', 'campaigns.reports'], null)->>'id')::uuid;
    perform public.admin_crm_staff_access(v_m1, v_set, null, null);

    -- 2 -------------------------------------------------------------- a new field, no deploy
    v_group := (public.admin_crm_field_group_save(null, 'company', 'Deal facts', 1, null)->>'id')::uuid;
    v_region := (public.admin_crm_field_save(null, jsonb_build_object('entity', 'company', 'key', 'region', 'label', 'Region', 'type', 'single_option',
                  'options', '[{"key":"vest","label":"Vestlandet"},{"key":"nord","label":"Nord-Norge"}]'::jsonb, 'group_id', v_group, 'in_add_form', true), null)->>'id')::uuid;
    v_shoe := (public.admin_crm_field_save(null, '{"entity":"contact","key":"shoe","label":"Shoe size","type":"number"}'::jsonb, null)->>'id')::uuid;
    v_co := (public.admin_crm_company_save(null, '{"name":"Felt Test AS","custom":{"region":"vest"}}'::jsonb)->>'id')::uuid;
    v_ct := (public.admin_crm_save_contact(null, '{"email":"kari@fields-test.example","custom":{"shoe":42}}'::jsonb)->>'id')::uuid;
    v_txt := (public.admin_crm_company(v_co)->'company'->'custom'->>'region')
      || ',' || (select r2->'custom'->>'region' from jsonb_array_elements(public.admin_crm_companies('felt test', null, null, null)->'rows') r2 where (r2->>'id')::uuid = v_co)
      || ',' || (select string_agg(x->>'key', '/' order by x->>'key') from jsonb_array_elements(public.admin_crm_fields(null)->'fields') x)
      || ',' || (public.admin_crm_contact(v_ct)->'contact'->'custom'->>'shoe');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a field made in the registry is read on the company page, the list, the registry and the contact page at once',
      'expected', 'vest,vest,region/shoe,42', 'actual', v_txt, 'pass', v_txt = 'vest,vest,region/shoe,42');

    -- 3 -------------------------------------------------------------- the sixteen types
    v_txt := '';
    for r in select * from (values
        ('text', '"  Hei  "', '{"a":1}'::text, '"Hei"'),
        ('large_text', '"Linje en\nLinje to"', '42', '"Linje en\nLinje to"'),
        ('single_option', '"a"', '"z"', '"a"'),
        ('multiple_options', '["b","a"]', '["a","z"]', '["a", "b"]'),
        ('autocomplete', '"Fritt valg"', '{"x":1}', '"Fritt valg"'),
        ('number', '12.50', '"tolv"', '12.5'),
        ('monetary', '1200.5', '{"amount":5,"currency":"SEK"}', '{"amount": 1200.5, "currency": "NOK"}'),
        ('user', '"super@fields-test.example"', '"nobody@fields-test.example"', to_jsonb(v_su::text)::text),
        ('organization', '"Felt Test AS"', '"Ingen Slik AS"', to_jsonb(v_co::text)::text),
        ('person', '"KARI@fields-test.example"', '"nobody@fields-test.example"', to_jsonb(v_ct::text)::text),
        ('phone', '"+47 22 33 44 55"', '"ring meg"', '"+47 22 33 44 55"'),
        ('time', '"08:30"', '"25:00"', '"08:30"'),
        ('time_range', '{"from":"08:00","to":"16:00"}', '{"from":"16:00","to":"08:00"}', '{"to": "16:00", "from": "08:00"}'),
        ('date', '"03.10.2026"', '"31.02.2026"', '"2026-10-03"'),
        ('date_range', '{"from":"2026-01-01","to":"2026-02-01"}', '{"from":"2026-02-01","to":"2026-01-01"}', '{"to": "2026-02-01", "from": "2026-01-01"}'),
        ('address', '{"street":" Storgata 1 ","postcode":"0155","city":"Oslo"}', '{"street":"x","floor":"2"}', '{"city": "Oslo", "street": "Storgata 1", "postcode": "0155"}'))
      t(type, good, bad, norm) loop
      f := null;
      f.entity := 'company'; f.key := 'probe'; f.type := r.type;
      f.options := '[{"key":"a","label":"A"},{"key":"b","label":"B"}]'::jsonb;
      v_json := app.crm_field_value(f, r.good::jsonb);
      v_txt := v_txt || r.type || ':' || case when (v_json->>'ok')::boolean and (v_json->'value') = r.norm::jsonb then 'ok' else 'BAD(' || coalesce(v_json::text, 'null') || ')' end
        || '/' || case when (app.crm_field_value(f, r.bad::jsonb)->>'ok')::boolean then 'ACCEPTED' else 'refused' end || ' ';
    end loop;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'each type takes a valid value, normalised, and refuses an invalid one',
      'expected', 'all ok/refused', 'actual', btrim(v_txt), 'pass', v_txt !~ '(BAD|ACCEPTED)');

    -- 4 -------------------------------------------------------------- required
    v_budget := (public.admin_crm_field_save(null, '{"entity":"company","key":"budget","label":"Budget","type":"number","importance":"required","required_from_stage":"meeting"}'::jsonb, null)->>'id')::uuid;
    v_txt := (public.admin_crm_company_save(v_co, '{"next_step":"Ring"}'::jsonb)->>'ok');
    v_json := public.admin_crm_stage_move(array[v_co], 'meeting');
    v_txt := v_txt || ',' || (v_json->>'moved') || ':' || (v_json->>'blocked');
    v_json := public.admin_crm_company_save(v_co, '{"stage":"meeting"}'::jsonb);
    v_txt := v_txt || ',' || (v_json->>'error') || ':' || (v_json->'fields'->>0);
    v_txt := v_txt || ',' || (public.admin_crm_company_save(v_co, '{"stage":"meeting","custom":{"budget":1000}}'::jsonb)->>'ok');
    v_txt := v_txt || ',' || (select c.stage from app.crm_companies c where c.id = v_co);
    perform public.admin_crm_field_save(v_shoe, '{"importance":"required"}'::jsonb, null);
    v_txt := v_txt || ',' || (public.admin_crm_save_contact(null, '{"email":"ola@fields-test.example"}'::jsonb)->>'error');
    v_json := public.admin_crm_import('[{"email":"per@fields-test.example"}]'::jsonb);
    v_txt := v_txt || ',' || (v_json->>'inserted') || ':' || (v_json->'warnings'->0->>'reason');
    perform public.admin_crm_field_save(v_shoe, '{"importance":"none"}'::jsonb, null);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'required blocks a manual save and a stage move from its stage on, and an import reports it and imports',
      'expected', 'true,0:1,required_fields:budget,true,meeting,required_fields,1:required_fields', 'actual', v_txt,
      'pass', v_txt = 'true,0:1,required_fields:budget,true,meeting,required_fields,1:required_fields');

    -- 5 -------------------------------------------------------------- hidden and read-only
    v_secret := (public.admin_crm_field_save(null, jsonb_build_object('entity', 'company', 'key', 'secret', 'label', 'Secret', 'type', 'text',
                  'hidden_sets', jsonb_build_array(v_set)), null)->>'id')::uuid;
    perform public.admin_crm_field_save(null, jsonb_build_object('entity', 'company', 'key', 'locked', 'label', 'Locked', 'type', 'text',
              'read_only_sets', jsonb_build_array(v_set)), null);
    v_csecret := (public.admin_crm_field_save(null, jsonb_build_object('entity', 'contact', 'key', 'csecret', 'label', 'Contact secret', 'type', 'text',
                   'hidden_sets', jsonb_build_array(v_set)), null)->>'id')::uuid;
    perform public.admin_crm_company_save(v_co, '{"custom":{"secret":"s","locked":"l"}}'::jsonb);
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    v_json := public.admin_crm_company(v_co)->'company'->'custom';
    v_txt := case when v_json ? 'secret' then 'present' else 'absent' end || ',' || case when v_json ? 'locked' then 'present' else 'absent' end;
    v_json := (select r2->'custom' from jsonb_array_elements(public.admin_crm_companies('felt test', null, null, null)->'rows') r2 where (r2->>'id')::uuid = v_co);
    v_txt := v_txt || ',' || case when v_json ? 'secret' then 'present' else 'absent' end || ',' || case when v_json ? 'locked' then 'present' else 'absent' end;
    v_json := public.admin_crm_fields('company');
    v_txt := v_txt || ',' || case when exists (select 1 from jsonb_array_elements(v_json->'fields') x where x->>'key' = 'secret') then 'present' else 'absent' end
      || ',' || (select x->>'access' from jsonb_array_elements(v_json->'fields') x where x->>'key' = 'locked')
      || ',' || (v_json->>'manage');
    v_json := public.admin_crm_history('company', v_co, null)->'changes';
    v_txt := v_txt || ',' || case when exists (select 1 from jsonb_array_elements(v_json) x where x->>'field' = 'custom.secret') then 'present' else 'absent' end
      || ',' || case when exists (select 1 from jsonb_array_elements(v_json) x where x->>'field' = 'custom.locked') then 'present' else 'absent' end;
    v_txt := v_txt || ',' || (public.admin_crm_companies(null, null, null, '[{"key":"secret","op":"eq","value":"s"}]'::jsonb)->>'error')
      || ',' || (public.admin_crm_company_save(v_co, '{"custom":{"secret":"x"}}'::jsonb)->>'error')
      || ',' || (public.admin_crm_company_save(v_co, '{"custom":{"locked":"y"}}'::jsonb)->>'error')
      || ',' || (public.admin_crm_company_save(v_co, '{"custom":{"locked":"l"}}'::jsonb)->>'ok')
      || ',' || (public.admin_crm_segment_preview('{"custom":[{"key":"csecret","op":"not_empty"}]}'::jsonb)->>'error')
      || ',' || (public.admin_crm_segment_save(null, 'Hemmelig', '{"custom":[{"key":"csecret","op":"not_empty"}]}'::jsonb)->>'error')
      || ',' || (public.admin_crm_field_save(null, '{"entity":"company","key":"mine","label":"Mine","type":"text"}'::jsonb, null)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_txt := v_txt || ',' || case when exists (select 1 from jsonb_array_elements(public.admin_crm_history('company', v_co, null)->'changes') x
                                               where x->>'field' = 'custom.secret') then 'present' else 'absent' end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a hidden field is absent from the record, the list, the registry, the history and the filters and unknown to writers; read-only is shown and refused; the registry is the settings'' to change',
      'expected', 'absent,present,absent,present,absent,read,false,absent,present,invalid_filter,unknown_field,read_only_field,true,unknown_field,unknown_field,not_allowed,present',
      'actual', v_txt,
      'pass', v_txt = 'absent,present,absent,present,absent,read,false,absent,present,invalid_filter,unknown_field,read_only_field,true,unknown_field,unknown_field,not_allowed,present');

    -- 6 -------------------------------------------------------------- formulas
    v_extra := (public.admin_crm_field_save(null, '{"entity":"company","key":"extra","label":"Extra","type":"number"}'::jsonb, null)->>'id')::uuid;
    v_total := (public.admin_crm_field_save(null, '{"entity":"company","key":"total","label":"Total","type":"monetary","formula":"{value_nok} * 2 + {extra}"}'::jsonb, null)->>'id')::uuid;
    perform public.admin_crm_company_save(v_co, '{"value_nok":"100","custom":{"extra":5}}'::jsonb);
    v_txt := (select c.custom->'total'->>'amount' from app.crm_companies c where c.id = v_co);
    perform public.admin_crm_company_save(v_co, '{"custom":{"extra":10}}'::jsonb);
    v_txt := v_txt || ',' || (select c.custom->'total'->>'amount' from app.crm_companies c where c.id = v_co);
    perform public.admin_crm_company_save(v_co, '{"value_nok":""}'::jsonb);
    v_txt := v_txt || ',' || coalesce((select c.custom->'total'->>'amount' from app.crm_companies c where c.id = v_co), 'none');
    v_txt := v_txt || ',' || (public.admin_crm_company_save(v_co, '{"custom":{"total":1}}'::jsonb)->>'error')
      || ',' || (public.admin_crm_field_save(null, '{"entity":"company","key":"selfie","label":"Selfie","type":"number","formula":"{selfie} + 1"}'::jsonb, null)->>'error');
    v_bf := (public.admin_crm_field_save(null, '{"entity":"company","key":"b_f","label":"B","type":"number"}'::jsonb, null)->>'id')::uuid;
    perform public.admin_crm_field_save(null, '{"entity":"company","key":"a_f","label":"A","type":"number","formula":"{b_f} + 1"}'::jsonb, null);
    v_txt := v_txt || ',' || (public.admin_crm_field_save(v_bf, '{"formula":"{a_f} * 2"}'::jsonb, null)->>'error')
      || ',' || (public.admin_crm_field_save(null, '{"entity":"company","key":"broken","label":"Broken","type":"number","formula":"{extra} +"}'::jsonb, null)->>'error')
      || ',' || (public.admin_crm_field_save(null, '{"entity":"company","key":"wrongref","label":"Wrong","type":"number","formula":"{region} * 2"}'::jsonb, null)->>'error');
    perform public.admin_crm_field_save(null, '{"entity":"company","key":"ratio","label":"Ratio","type":"number","formula":"{extra} / (2 - 2)"}'::jsonb, null);
    perform public.admin_crm_company_save(v_co, '{"custom":{"b_f":3}}'::jsonb);
    v_txt := v_txt || ',' || coalesce((select c.custom->>'ratio' from app.crm_companies c where c.id = v_co), 'none')
      || ',' || (select c.custom->>'a_f' from app.crm_companies c where c.id = v_co)
      || ',' || (select c.custom->>'a_f' from app.crm_companies c where c.id = v_co
                 and (c.custom->>'a_f')::numeric = app.crm_formula_eval((select x.formula_rpn from app.crm_fields x where x.key = 'a_f'), to_jsonb(c)));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a formula''s stored value equals its result and follows its inputs; self-reference, cycles, bad syntax and bad references refused; not typed in',
      'expected', '205,210,none,formula_field,formula_self,formula_cycle,invalid_formula,formula_ref,none,4,4', 'actual', v_txt,
      'pass', v_txt = '205,210,none,formula_field,formula_self,formula_cycle,invalid_formula,formula_ref,none,4,4');

    -- 7 -------------------------------------------------------------- versions
    perform public.admin_crm_field_save(v_region, '{"label":"Landsdel"}'::jsonb, null);
    v_txt := (select f2.version::text from app.crm_fields f2 where f2.id = v_region)
      || ',' || (select string_agg(x.version::text, ':' order by x.version) from app.crm_field_versions x where x.field_id = v_region)
      || ',' || (public.admin_crm_field_save(v_region, '{"label":"Igjen","version":1}'::jsonb, null)->>'error');
    begin
      update app.crm_field_versions set definition = '{}' where field_id = v_region;
      v_txt := v_txt || ',changed';
    exception when check_violation then
      v_txt := v_txt || ',refused';
    end;
    begin
      delete from app.crm_field_versions where field_id = v_region;
      v_txt := v_txt || ',removed';
    exception when check_violation then
      v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every save is a version; a stale save is refused; a version is not changed or removed while its field is there',
      'expected', '2,1:2,stale,refused,refused', 'actual', v_txt, 'pass', v_txt = '2,1:2,stale,refused,refused');

    -- 8 -------------------------------------------------------------- filters
    v_co2 := (public.admin_crm_company_save(null, '{"name":"Felt To AS","custom":{"region":"nord"}}'::jsonb)->>'id')::uuid;
    v_co3 := (public.admin_crm_company_save(null, '{"name":"Felt Tre AS"}'::jsonb)->>'id')::uuid;
    perform public.admin_crm_save_contact(null, '{"email":"liten@fields-test.example","custom":{"shoe":38}}'::jsonb);
    v_txt := (select string_agg(r2->>'name', '/' order by r2->>'name') from jsonb_array_elements(public.admin_crm_companies('felt', null, null,
                '[{"key":"region","op":"in","value":["vest"]}]'::jsonb)->'rows') r2)
      || '|' || (select string_agg(r2->>'name', '/' order by r2->>'name') from jsonb_array_elements(public.admin_crm_companies('felt', null, null,
                '[{"key":"region","op":"empty"}]'::jsonb)->'rows') r2)
      || '|' || (select string_agg(r2->>'name', '/' order by r2->>'name') from jsonb_array_elements(public.admin_crm_companies('felt', null, null,
                '[{"key":"budget","op":"gte","value":500}]'::jsonb)->'rows') r2)
      || '|' || (select count(*) from app.crm_segment_contacts('{"custom":[{"key":"shoe","op":"gte","value":40}]}'::jsonb) c where c.email like '%@fields-test.example')
      || '|' || (public.admin_crm_companies(null, null, null, '[{"key":"region","op":"gte","value":1}]'::jsonb)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'the companies list and segments filter by custom conditions; an operator the type lacks is refused',
      'expected', 'Felt Test AS|Felt Tre AS|Felt Test AS|1|invalid_filter', 'actual', v_txt,
      'pass', v_txt = 'Felt Test AS|Felt Tre AS|Felt Test AS|1|invalid_filter');

    -- 9 -------------------------------------------------------------- import
    perform public.admin_crm_field_save(null, '{"entity":"contact","key":"birthday","label":"Birthday","type":"date"}'::jsonb, null);
    perform public.admin_crm_field_save(null, '{"entity":"contact","key":"langs","label":"Languages","type":"multiple_options","options":[{"key":"no","label":"Norsk"},{"key":"en","label":"Engelsk"}]}'::jsonb, null);
    v_json := public.admin_crm_import('[{"email":"imp1@fields-test.example","custom":{"Shoe size":"42,5","birthday":"03.10.2000","LANGUAGES":"Norsk; engelsk","Hobby":"sjakk"}},
                                        {"email":"imp2@fields-test.example","custom":{"shoe":"stor"}}]'::jsonb);
    v_txt := (v_json->>'inserted') || '|' || (v_json->'unknown_columns'->>0) || '|' || (v_json->'warnings'->0->>'row') || ':' || (v_json->'warnings'->0->>'reason')
      || ':' || (v_json->'warnings'->0->'fields'->>0)
      || '|' || (select c.custom->>'shoe' || ';' || (c.custom->>'birthday') || ';' || (c.custom->'langs')::text from app.crm_contacts c where c.email = 'imp1@fields-test.example');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'an import maps columns by key or label and makes text into values; unknown columns and bad values are reported, the row imported',
      'expected', '2|Hobby|2:invalid_field:shoe|42.5;2000-10-03;["no", "en"]', 'actual', v_txt,
      'pass', v_txt = '2|Hobby|2:invalid_field:shoe|42.5;2000-10-03;["no", "en"]');

    -- 10 ------------------------------------------------------------- history
    perform public.admin_crm_company_save(v_co, '{"custom":{"region":"nord"}}'::jsonb);
    perform public.admin_crm_field_save(null, '{"entity":"company","key":"parent","label":"Parent","type":"organization"}'::jsonb, null);
    perform public.admin_crm_company_save(v_co, '{"custom":{"parent":"Felt To AS"}}'::jsonb);
    v_json := public.admin_crm_history('company', v_co, null);
    v_txt := (select x->>'field' || ':' || (x->'old')::text || '>' || (x->'new')::text from jsonb_array_elements(v_json->'changes') x
              where x->>'field' = 'custom.region' order by (x->>'id')::bigint desc limit 1)
      -- a reference's line comes with the name behind it, as the record's page shows it
      || '|' || coalesce(v_json->'refs'->>(v_co2::text), 'no name');
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'a custom value''s change is a history line of its own, with the old and new value and the names behind references',
      'expected', 'custom.region:"vest">"nord"|Felt To AS', 'actual', v_txt, 'pass', v_txt = 'custom.region:"vest">"nord"|Felt To AS');

    -- 11 ------------------------------------------------------------- limits
    insert into app.crm_setting_values (key, value) values ('limit_custom_fields', to_jsonb((select count(*) from app.crm_fields x where x.archived_at is null)));
    v_txt := (public.admin_crm_field_save(null, '{"entity":"company","key":"one_more","label":"One more","type":"text"}'::jsonb, null)->>'error')
      || ':' || coalesce(public.admin_crm_field_save(null, '{"entity":"company","key":"one_more","label":"One more","type":"text"}'::jsonb, null)->>'setting', '');
    delete from app.crm_setting_values where key = 'limit_custom_fields';
    insert into app.crm_setting_values (key, value) values ('limit_field_options', '1');
    v_json := public.admin_crm_field_save(null, '{"entity":"company","key":"two_opts","label":"Two","type":"single_option","options":[{"key":"a","label":"A"},{"key":"b","label":"B"}]}'::jsonb, null);
    v_txt := v_txt || ',' || (v_json->>'error') || ':' || (v_json->>'setting');
    delete from app.crm_setting_values where key = 'limit_field_options';
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'fields and options per field are limited only when the rule says so',
      'expected', 'too_many:limit_custom_fields,too_many:limit_field_options', 'actual', v_txt,
      'pass', v_txt = 'too_many:limit_custom_fields,too_many:limit_field_options');

    -- 12 ------------------------------------------------------------- archive and guards
    perform public.admin_crm_field_archive(v_region, true, null);
    v_txt := case when public.admin_crm_company(v_co2)->'company'->'custom' ? 'region' then 'present' else 'absent' end
      || ',' || case when (select c.custom ? 'region' from app.crm_companies c where c.id = v_co2) then 'kept' else 'lost' end;
    perform public.admin_crm_field_archive(v_region, false, null);
    v_txt := v_txt || ',' || case when public.admin_crm_company(v_co2)->'company'->'custom' ? 'region' then 'present' else 'absent' end
      || ',' || (public.admin_crm_field_archive(v_extra, true, null)->>'error')
      || ',' || (public.admin_crm_field_save(v_region, '{"type":"text"}'::jsonb, null)->>'error')
      || ',' || (public.admin_crm_field_save(v_region, '{"options":[{"key":"vest","label":"Vestlandet"}]}'::jsonb, null)->>'error')
      || ',' || (public.admin_crm_field_group_archive(v_group, true, null)->>'error')
      || ',' || (public.admin_crm_field_save(null, '{"entity":"company","key":"name","label":"Name","type":"text"}'::jsonb, null)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'an archived field leaves the screens and keeps its values; formula inputs, types and options in use, groups in use and reserved keys are refused',
      'expected', 'absent,kept,present,used_by_formula,type_in_use,option_in_use,group_in_use,reserved_key', 'actual', v_txt,
      'pass', v_txt = 'absent,kept,present,used_by_formula,type_in_use,option_in_use,group_in_use,reserved_key');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 13 --------------------------------------------------------------- whole rows only through the registry
  select coalesce(string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname), '') into v_txt
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'public') and p.prokind = 'f'
    -- a record variable handed out whole (arrays and the registry's own rows are not records)
    and pg_get_functiondef(p.oid) ~* '((to_jsonb|row_to_json)\((co|c|new|old|x|v_co|v_c|v_old|v_new|v_row)\)|jsonb_agg\((co|c|x)\)|returns setof app\.crm_(companies|contacts)|returns app\.crm_(companies|contacts))'
    and pg_get_functiondef(p.oid) ~ 'crm_(companies|contacts|segment_contacts)'
    and n.nspname || '.' || p.proname not in (
      'app.crm_track',                -- the history: its reader leaves out what a viewer may not see (seq 5)
      'app.crm_custom_formulas',      -- computes formula values inside the record's own write
      'app.crm_segment_contacts');    -- returns contacts to its callers, which pick their columns
  v_txt := v_txt || '|' || case when pg_get_functiondef('app.crm_company_json(app.crm_companies)'::regprocedure) ~ 'crm_custom_out\(''company'', co\.custom\)'
                                 and pg_get_functiondef('app.crm_contact_json(app.crm_contacts)'::regprocedure) ~ 'crm_custom_out\(''contact'', c\.custom\)'
                                then 'filtered' else 'raw' end;
  v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'no reader hands out a whole company or contact row except the record helpers, which put the custom values through the registry',
    'expected', 'app.crm_company_json|filtered', 'actual', v_txt, 'pass', v_txt = 'app.crm_company_json|filtered');

  -- 14 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.crm_fields union all select id::text from app.crm_field_groups
    union all select field_id::text from app.crm_field_versions
    union all select email from auth.users where email like '%@fields-test.example'
    union all select email from app.crm_contacts where email like '%@fields-test.example'
    union all select id::text from app.crm_companies where name like 'Felt %') x;
  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._cfi
  select (r2->>'seq')::int, r2->>'name', r2->>'expected', r2->>'actual', (r2->>'pass')::boolean from jsonb_array_elements(v_rows) r2;
end $$;

select seq, name, expected, actual, pass from public._cfi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cfi;
  if v_failed is not null then raise exception 'crm fields invariants failed: %', v_failed; end if;
  if v_count <> 14 then raise exception 'crm fields invariants: expected 14 rows, got %', v_count; end if;
end $$;
