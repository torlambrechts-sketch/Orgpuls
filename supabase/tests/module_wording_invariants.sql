-- module_wording_invariants.sql — a module's statements in the organisation's words (0083, D-131).
--
--   * the choice has one write path, and no client reads the helper that decides it (1)
--   * a worded module keeps its three wordings and its NACE rule; a module without keeps none (2)
--   * with no choice, the registered industry suggests: 85.1 and 88.911 a kindergarten, 85.2 a
--     school, anything else the module's default (3)
--   * a round takes the organisation's wording as the module is put on it; a module without
--     wordings has none, whatever is passed (4)
--   * only a daglig leder chooses, only a known wording, only for a worded module; the choice
--     reaches the planned rounds and never an open one (5)
--   * the respondent reads the round's wording, statements and count questions alike (6)
--   * an open round's wording is fixed, and a published module's rule is (7)
--   * a client cannot write a round's wording itself; a change of the registered industry reaches
--     the planned rounds; a round still on a retired version does not stop the choice; the
--     screen is told where the wording came from (8)
--   * nothing written here survives (9)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_wording_invariants.sql

create unlogged table if not exists public._mwi(seq int, name text, expected text, actual text, pass bool);
truncate public._mwi;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_dl     uuid;
  v_vo     uuid := '00000000-0000-4000-8000-00000000c601';
  v_mod    uuid;
  v_plain  uuid;
  v_meas   uuid;
  v_planned uuid;
  v_open   uuid;
  v_emp    uuid;
  v_tok    text;
  v_items  uuid[];
  v_nace   text;
  v_rows   jsonb := '[]';
  v_txt    text;
  v_json   jsonb;
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
  item     constant text := '{"id":"%s","text":"%s","text_variants":{"barnehage":"%s","skole":"%s"},"reverse":false,"pulse_eligible":true}';
begin
  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;
  select r.id into v_open from app.rounds r where r.org_id = v_org and r.status = 'apen' order by r.opens_at desc limit 1;
  select e.id into v_emp from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_open and i.responded_at is null order by e.full_name limit 1;
  v_tok := 'fixture.' || v_open::text || '.' || v_emp::text;
  select o.registry_nace_code into v_nace from app.organizations o where o.id = v_org;

  -- 1 ------------------------------------------------------------------ the grant surface
  v_txt := has_function_privilege('authenticated', 'app.org_wording(uuid, uuid)', 'execute')::text
    || ',' || has_function_privilege('authenticated', 'public.set_org_module_wording(uuid, text, text)', 'execute')::text
    || ',' || has_function_privilege('anon', 'public.set_org_module_wording(uuid, text, text)', 'execute')::text
    || ',' || has_function_privilege('anon', 'public.org_module_wordings(uuid)', 'execute')::text;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the rule is not callable by a client; the write path is, by a signed-in one only',
    'expected', 'false,true,false,false', 'actual', v_txt, 'pass', v_txt = 'false,true,false,false');

  begin
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-ord', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'wording', '{"modes":["barnehage","skole","begge"],"default":"begge","tokens":{},
                   "auto_from_nace":{"85.1":"barnehage","85.2":"skole","85.3":"skole","88.911":"barnehage"}}'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object('id', 'f', 'name', 'F barn og elever', 'summary', 'S', 'rationale', 'R',
        'name_variants', '{"barnehage":"F barn","skole":"F elever"}'::jsonb,
        'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb,
        'items', jsonb_build_array(
          format(item, 'PO-FF-1', 'barna eller elevene 1', 'barna 1', 'elevene 1')::jsonb,
          format(item, 'PO-FF-2', 'barna eller elevene 2', 'barna 2', 'elevene 2')::jsonb,
          format(item, 'PO-FF-3', 'barna eller elevene 3', 'barna 3', 'elevene 3')::jsonb),
        'action_suggestions', '[]'::jsonb)),
      'count_items', '[{"id":"PO-T-1","text":"et barn eller en elev","text_variants":{"barnehage":"et barn","skole":"en elev"},"options":["Ja","Nei","Vet ikke"]}]'::jsonb,
      'segments', '[]'::jsonb), repeat('e', 64));
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-uten', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object('id', 'f', 'name', 'F', 'summary', 'S', 'rationale', 'R',
        'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb,
        'items', '[{"id":"PU-FF-1","text":"a","reverse":false,"pulse_eligible":true},{"id":"PU-FF-2","text":"b","reverse":false,"pulse_eligible":true},{"id":"PU-FF-3","text":"c","reverse":false,"pulse_eligible":true}]'::jsonb,
        'action_suggestions', '[]'::jsonb)),
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('f', 64));
    perform app.module_set_status('probe-ord', '0.0.1', 'published');
    perform app.module_set_status('probe-uten', '0.0.1', 'published');
    select m.id into v_mod from app.question_modules m where m.key = 'probe-ord';
    select m.id into v_plain from app.question_modules m where m.key = 'probe-uten';
    select array_agg(i.id order by i.sort) into v_items from app.module_items i where i.module_id = v_mod and i.kind = 'likert5';

    -- 2 ---------------------------------------------------------------- what is stored
    select concat_ws(',',
      (select i.text->>'nb.barnehage' || '/' || (i.text->>'nb.skole') || '/' || (i.text->>'nb')
       from app.module_items i where i.module_id = v_mod and i.code = 'PO-FF-1'),
      (select i.text->>'nb.skole' from app.module_items i where i.module_id = v_mod and i.code = 'PO-T-1'),
      (select m.wording->>'default' || '/' || (m.wording->'auto_from_nace'->>'85.2') from app.question_modules m where m.id = v_mod),
      (select (m.wording is null)::text from app.question_modules m where m.id = v_plain),
      (select count(*) from app.module_items i where i.module_id = v_plain and i.text ? 'nb.skole')::text)
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a worded module keeps three wordings and its rule; a module without keeps none',
      'expected', 'barna 1/elevene 1/barna eller elevene 1,en elev,begge/skole,true,0', 'actual', v_txt,
      'pass', v_txt = 'barna 1/elevene 1/barna eller elevene 1,en elev,begge/skole,true,0');

    -- 3 ---------------------------------------------------------------- suggested by the industry
    v_txt := '';
    foreach v_json in array array['"85.100"', '"85.201"', '"88.911"', '"62.010"', 'null']::jsonb[] loop
      update app.organizations set registry_nace_code = v_json #>> '{}' where id = v_org;
      v_txt := v_txt || app.org_wording(v_org, v_mod) || ',';
    end loop;
    v_txt := v_txt || coalesce(app.org_wording(v_org, v_plain), 'null');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the registered industry suggests the wording; a module without wordings has none',
      'expected', 'barnehage,skole,barnehage,begge,begge,null', 'actual', v_txt,
      'pass', v_txt = 'barnehage,skole,barnehage,begge,begge,null');

    -- 4 ---------------------------------------------------------------- a round takes it
    update app.organizations set registry_nace_code = '85.100' where id = v_org;
    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2097) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2097-09-01', '2097-09-12') returning id into v_planned;
    perform app.add_round_module(v_org, v_planned, v_mod);
    insert into app.round_modules (org_id, round_id, module_id, item_ids, wording)
    select v_org, v_planned, v_plain, array_agg(i.id), 'skole' from app.module_items i where i.module_id = v_plain and i.kind = 'likert5';
    select (select rm.wording from app.round_modules rm where rm.round_id = v_planned and rm.module_id = v_mod) || ','
           || coalesce((select rm.wording from app.round_modules rm where rm.round_id = v_planned and rm.module_id = v_plain), 'null')
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a round takes the suggested wording; a module without wordings stores none',
      'expected', 'barnehage,null', 'actual', v_txt, 'pass', v_txt = 'barnehage,null');

    -- the open round asks it too (answered by the fixture, so as the database's own functions would)
    alter table app.round_modules disable trigger round_module_ok;
    insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items)
    values (v_org, v_open, v_mod, v_items, true);
    alter table app.round_modules enable trigger round_module_ok;

    -- 5 ---------------------------------------------------------------- the choice
    insert into auth.users (id, email) values (v_vo, 'vo@mwi-test.example');
    insert into app.profiles (id, full_name) values (v_vo, 'VO') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_vo, 'verneombud', true);
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    set local role authenticated;
    v_txt := public.set_org_module_wording(v_org, 'probe-ord', 'skole')->>'error';
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := v_txt || ',' || (public.set_org_module_wording(v_org, 'probe-ord', 'elevene')->>'error')
                   || ',' || (public.set_org_module_wording(v_org, 'probe-uten', 'skole')->>'error');
    v_json := public.set_org_module_wording(v_org, 'probe-ord', 'skole');
    v_txt := v_txt || ',' || (v_json->>'wording') || ',' || (v_json->>'planned_rounds')
      || ',' || (public.org_module_wordings(v_org)->'wordings'->'probe-ord'->>'chosen');
    reset role;
    v_txt := v_txt || ',' || (select rm.wording from app.round_modules rm where rm.round_id = v_planned and rm.module_id = v_mod)
                   || ',' || (select rm.wording from app.round_modules rm where rm.round_id = v_open and rm.module_id = v_mod);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a daglig leder chooses a known wording of a worded module; planned rounds follow, the open one does not',
      'expected', 'not_allowed,invalid,not_available,skole,1,true,skole,barnehage', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,invalid,not_available,skole,1,true,skole,barnehage');

    -- 6 ---------------------------------------------------------------- the respondent reads it
    v_json := public.respond_form(v_tok);
    select string_agg(s->>'text', '|' order by s->>'text') into v_txt
    from jsonb_array_elements(v_json->'modules') mo, jsonb_array_elements(mo->'statements') s
    where mo->>'name' = 'Probe';
    v_txt := v_txt || ',' || (select c->>'text' from jsonb_array_elements(v_json->'modules') mo, jsonb_array_elements(mo->'count') c
                              where mo->>'name' = 'Probe')
      || ',' || (select string_agg(distinct s->>'factor', '|') from jsonb_array_elements(v_json->'modules') mo, jsonb_array_elements(mo->'statements') s
                 where mo->>'name' = 'Probe');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the form gives the round''s wording: statements, count questions and the factor''s name',
      'expected', 'barna 1|barna 2|barna 3,et barn,F barn', 'actual', v_txt, 'pass', v_txt = 'barna 1|barna 2|barna 3,et barn,F barn');

    -- 7 ---------------------------------------------------------------- fixed
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    begin
      update app.round_modules set wording = 'skole' where round_id = v_open and module_id = v_mod;
      v_txt := 'changed';
    -- no client may write the column at all (0083's column grants), let alone on an open round
    exception when restrict_violation or insufficient_privilege then v_txt := 'refused';
    end;
    reset role;
    begin
      update app.question_modules set wording = jsonb_set(wording, '{default}', '"skole"') where id = v_mod;
      v_txt := v_txt || ',changed';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an open round''s wording and a published module''s rule are fixed',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    -- 8 ---------------------------------------------------------------- the wording is not a client's to write
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    set local role authenticated;
    begin
      update app.round_modules set wording = 'begge' where round_id = v_planned and module_id = v_mod;
      v_txt := 'written';
    exception when insufficient_privilege then v_txt := 'refused';
    end;
    reset role;
    -- back to the suggestion; then the registered industry changes to a school's
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    perform public.set_org_module_wording(v_org, 'probe-ord', null);
    v_txt := v_txt || ',' || (public.org_module_wordings(v_org)->'wordings'->'probe-ord'->>'source');
    reset role;
    update app.organizations set registry_nace_code = '85.201' where id = v_org;
    v_txt := v_txt || ',' || (select rm.wording from app.round_modules rm where rm.round_id = v_planned and rm.module_id = v_mod);
    update app.organizations set registry_nace_code = '62.010' where id = v_org;
    set local role authenticated;
    v_txt := v_txt || ',' || (public.org_module_wordings(v_org)->'wordings'->'probe-ord'->>'source');
    reset role;
    -- a planned round still on a version since retired does not stop the choice
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-ord', 'version', '0.0.2', 'name', 'Probe', 'description', 'Probe 2', 'estimated_minutes', 1,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'wording', '{"modes":["barnehage","skole","begge"],"default":"begge","tokens":{},"auto_from_nace":{"85.1":"barnehage"}}'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object('id', 'f', 'name', 'F', 'summary', 'S', 'rationale', 'R',
        'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb,
        'items', jsonb_build_array(
          format(item, 'PO-FF-1', 'a', 'b', 'c')::jsonb, format(item, 'PO-FF-2', 'a', 'b', 'c')::jsonb, format(item, 'PO-FF-3', 'a', 'b', 'c')::jsonb),
        'action_suggestions', '[]'::jsonb)),
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('9', 64));
    perform app.module_set_status('probe-ord', '0.0.2', 'published');
    perform app.module_set_status('probe-ord', '0.0.1', 'retired');
    set local role authenticated;
    v_txt := v_txt || ',' || coalesce(public.set_org_module_wording(v_org, 'probe-ord', 'barnehage')->>'wording', 'failed');
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'no client writes the wording; the industry code reaches planned rounds; a retired version stops nothing; the source is told',
      'expected', 'refused,nace,skole,default,barnehage', 'actual', v_txt, 'pass', v_txt = 'refused,nace,skole,default,barnehage');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 9 ------------------------------------------------------------------ nothing survives
  v_txt := (not exists (select 1 from app.question_modules where key in ('probe-ord', 'probe-uten'))
            and not exists (select 1 from auth.users where email like '%@mwi-test.example')
            and (select o.registry_nace_code is not distinct from v_nace from app.organizations o where o.id = v_org))::text;
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'every probe change was rolled back', 'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._mwi
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._mwi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._mwi;
  if v_failed is not null then raise exception 'module wording invariants failed: %', v_failed; end if;
  if v_count <> 9 then raise exception 'module wording invariants: expected 9 rows, got %', v_count; end if;
end $$;

drop table public._mwi;
