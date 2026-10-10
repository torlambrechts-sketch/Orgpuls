-- module_instrument_invariants.sql — a module that carries a published instrument as published (0224, D-267).
--
--   * every module seeded before 0224 is stored as it was: no statement with its own answers, a
--     preface, or «not relevant» turned off, and no module in a fixed order (1)
--   * an instrument's statements carry the five answers of the scale they name, the text before
--     the first, no «not relevant», a factor of more than five statements, and the instrument's order;
--     the module its attribution (2)
--   * a round asks the registry for each statement's answers and preface (round_item_keys), and
--     the translation package lists them for a published module (all_item_keys) (3)
--   * respond_form sends them, and asks an instrument in its own order for every respondent, where
--     another module is shuffled per token (4)
--   * submit_response refuses «not relevant» on a statement that offers none, and takes an answer (5)
--   * the registry takes a preface key and refuses a key it does not know (6)
--   * a published instrument's order and attribution are frozen (7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_instrument_invariants.sql

create unlogged table if not exists public._minst(seq int, name text, expected text, actual text, pass bool);
truncate public._minst;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_round  uuid;
  v_emp1   uuid;
  v_emp2   uuid;
  v_tok1   text;
  v_tok2   text;
  v_mod    uuid;
  v_items  uuid[];
  v_first  uuid;
  v_form   jsonb;
  v_json   jsonb;
  v_txt    text;
  v_n      int;
  v_rows   jsonb := '[]';
  probe    constant jsonb := jsonb_build_object(
    'module_id', 'probe-instrument', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 2,
    'scale', '{"type":"likert5","labels":["Helt uenig","Uenig","Nøytral","Enig","Helt enig"]}'::jsonb,
    'scales', '{"frekvens":{"labels":["Aldri","Sjelden","Iblant","Ofte","Alltid"]},
                "enighet":{"labels":["Helt uenig","Uenig","Nøytral","Enig","Helt enig"]}}'::jsonb,
    'instrument', '{"order":["PI-AA-1","PI-BB-1","PI-AA-2","PI-AA-3","PI-AA-4","PI-AA-5","PI-AA-6","PI-BB-2","PI-BB-3"],"not_relevant":false}'::jsonb,
    'attribution', 'Inneholder offentlig informasjon',
    'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb, 'sources', '[]'::jsonb,
    'translations', '{"en":{"attribution":"Contains public sector information",
                            "scales":{"frekvens":{"labels":["Never","Seldom","Sometimes","Often","Always"]}},
                            "factors":{"aa":{"prefaces":{"PI-AA-1":"Think of the last six months."}}}}}'::jsonb,
    'factors', '[
      {"id":"aa","name":"A","summary":"S","rationale":"R","rationale_sources":[],"legal_basis":[],
       "items":[{"id":"PI-AA-1","text":"A1","reverse":false,"pulse_eligible":true,"scale":"frekvens","preface":"Tenk på de siste seks månedene."},
                {"id":"PI-AA-2","text":"A2","reverse":true,"pulse_eligible":true,"scale":"frekvens"},
                {"id":"PI-AA-3","text":"A3","reverse":false,"pulse_eligible":true,"scale":"frekvens"},
                {"id":"PI-AA-4","text":"A4","reverse":false,"pulse_eligible":true,"scale":"frekvens"},
                {"id":"PI-AA-5","text":"A5","reverse":false,"pulse_eligible":true,"scale":"frekvens"},
                {"id":"PI-AA-6","text":"A6","reverse":false,"pulse_eligible":true,"scale":"frekvens"}],
       "action_suggestions":[{"type":"rutine","title":"T","description":"D","remeasure_item":"PI-AA-1"}]},
      {"id":"bb","name":"B","summary":"S","rationale":"R","rationale_sources":[],"legal_basis":[],
       "items":[{"id":"PI-BB-1","text":"B1","reverse":false,"pulse_eligible":true,"scale":"frekvens"},
                {"id":"PI-BB-2","text":"B2","reverse":false,"pulse_eligible":true,"scale":"enighet"},
                {"id":"PI-BB-3","text":"B3","reverse":false,"pulse_eligible":true,"scale":"enighet"}],
       "action_suggestions":[{"type":"rutine","title":"T","description":"D","remeasure_item":"PI-BB-1"}]}]'::jsonb,
    'count_items', '[]'::jsonb, 'segments', '[]'::jsonb);
begin
  -- 1 ---------------------------------------------------------------- modules before 0224
  select concat_ws('|',
    (select count(*) from app.module_items where kind = 'likert5' and options is not null),
    (select count(*) from app.module_items where preface is not null),
    (select count(*) from app.module_items where not offers_not_relevant),
    (select count(*) from app.question_modules where fixed_order or attribution is not null))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'every module seeded before is stored as it was: no own answers, preface, «not relevant» off or fixed order',
    'expected', '0|0|0|0', 'actual', v_txt, 'pass', v_txt = '0|0|0|0');

  select r.id into v_round from app.rounds r where r.status = 'apen' and r.org_id = v_org order by r.opens_at desc limit 1;
  select e.id into v_emp1 from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_round and i.responded_at is null order by e.full_name limit 1;
  select e.id into v_emp2 from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_round and i.responded_at is null and e.id <> v_emp1 order by e.full_name limit 1;
  v_tok1 := 'fixture.' || v_round::text || '.' || v_emp1::text;
  v_tok2 := 'fixture.' || v_round::text || '.' || v_emp2::text;

  begin
    perform app.module_seed(probe, repeat('e', 64));
    select m.id into v_mod from app.question_modules m where m.key = 'probe-instrument';
    select array_agg(i.id order by i.sort) into v_items from app.module_items i where i.module_id = v_mod and i.kind = 'likert5';
    select i.id into v_first from app.module_items i where i.module_id = v_mod and i.code = 'PI-AA-1';

    -- 2 -------------------------------------------------------------- stored
    select concat_ws('|',
      (select string_agg(i.code, ',' order by i.sort) from app.module_items i where i.module_id = v_mod),
      (select i.options->0->>'nb' || '/' || (i.options->4->>'en') from app.module_items i where i.id = v_first),
      (select i.options->0->>'nb' || '/' || coalesce(i.options->0->>'en', '-') from app.module_items i where i.module_id = v_mod and i.code = 'PI-BB-2'),
      (select i.preface->>'nb' || '/' || (i.preface->>'en') from app.module_items i where i.id = v_first),
      (select count(*) from app.module_items i where i.module_id = v_mod and i.offers_not_relevant),
      (select m.fixed_order::text || '/' || (m.attribution->>'en') from app.question_modules m where m.id = v_mod),
      (select count(*) from app.module_factor_items mi join app.module_factors f on f.id = mi.factor_id where f.module_id = v_mod and f.key = 'aa'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the instrument''s order, each statement''s answers, the preface, no «not relevant», six statements a factor, the attribution',
      'expected', 'PI-AA-1,PI-BB-1,PI-AA-2,PI-AA-3,PI-AA-4,PI-AA-5,PI-AA-6,PI-BB-2,PI-BB-3|Aldri/Always|Helt uenig/-|Tenk på de siste seks månedene./Think of the last six months.|0|true/Contains public sector information|6',
      'actual', v_txt,
      'pass', v_txt = 'PI-AA-1,PI-BB-1,PI-AA-2,PI-AA-3,PI-AA-4,PI-AA-5,PI-AA-6,PI-BB-2,PI-BB-3|Aldri/Always|Helt uenig/-|Tenk på de siste seks månedene./Think of the last six months.|0|true/Contains public sector information|6');

    perform app.module_set_status('probe-instrument', '0.0.1', 'published');
    alter table app.round_modules disable trigger round_module_ok;
    insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items)
    values (v_org, v_round, v_mod, v_items, false);
    alter table app.round_modules enable trigger round_module_ok;

    -- 3 -------------------------------------------------------------- registry keys
    select concat_ws('|',
      (select count(*) from app.round_item_keys(v_round) k where k like 'module:%:o_' and split_part(k, ':', 2)::uuid = any (v_items)),
      (select count(*) from app.round_item_keys(v_round) k where k = 'module:' || v_first || ':p'),
      (select count(*) from app.all_item_keys() k where k like 'module:%:o_' and split_part(k, ':', 2)::uuid = any (v_items)),
      (select count(*) from app.all_item_keys() k where k = 'module:' || v_first || ':p'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a round, and the translation package, ask for nine statements'' five answers and one preface',
      'expected', '45|1|45|1', 'actual', v_txt, 'pass', v_txt = '45|1|45|1');

    -- 4 -------------------------------------------------------------- the form
    v_form := public.respond_form(v_tok1);
    select concat_ws('|',
      (select m->>'fixed_order' from jsonb_array_elements(v_form->'modules') m where m->>'name' = 'Probe'),
      (select string_agg(s->>'text', ',' order by o) from jsonb_array_elements(v_form->'modules') m
         cross join jsonb_array_elements(m->'statements') with ordinality as x(s, o) where m->>'name' = 'Probe'),
      (select string_agg(s->>'text', ',' order by o) from jsonb_array_elements(public.respond_form(v_tok2)->'modules') m
         cross join jsonb_array_elements(m->'statements') with ordinality as x(s, o) where m->>'name' = 'Probe'),
      (select s->'options'->>0 || '/' || (s->'options_en'->>4) || '/' || (s->>'preface') || '/' || (s->>'na')
         from jsonb_array_elements(v_form->'modules') m cross join jsonb_array_elements(m->'statements') s
         where m->>'name' = 'Probe' and s->>'item' = v_first::text))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the form sends the answers, the preface and no «not relevant», in the instrument''s order for every respondent',
      'expected', 'true|A1,B1,A2,A3,A4,A5,A6,B2,B3|A1,B1,A2,A3,A4,A5,A6,B2,B3|Aldri/Always/Tenk på de siste seks månedene./false',
      'actual', v_txt,
      'pass', v_txt = 'true|A1,B1,A2,A3,A4,A5,A6,B2,B3|A1,B1,A2,A3,A4,A5,A6,B2,B3|Aldri/Always/Tenk på de siste seks månedene./false');

    -- 5 -------------------------------------------------------------- the answer
    v_json := public.submit_response(v_tok1, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('answers', jsonb_build_array(jsonb_build_object('item', v_first, 'na', true))));
    v_txt := coalesce(v_json->>'error', 'ok');
    v_json := public.submit_response(v_tok1, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('answers', jsonb_build_array(jsonb_build_object('item', v_first, 'value', 4))));
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok') || ','
      || (select count(*) from app.module_answers a where a.item_id = v_first and a.value = 4);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', '«not relevant» is refused on a statement that offers none; an answer is taken',
      'expected', 'question_not_in_round,ok,1', 'actual', v_txt, 'pass', v_txt = 'question_not_in_round,ok,1');

    -- 6 -------------------------------------------------------------- registry keys
    begin
      insert into app.item_translations (item_id, locale, text, source, source_hash)
      values ('module:' || v_first || ':p', 'pl', 'Proszę pomyśleć o ostatnich sześciu miesiącach.', 'machine', repeat('0', 64));
      v_txt := 'taken';
    exception when check_violation then v_txt := 'refused';
    end;
    begin
      insert into app.item_translations (item_id, locale, text, source, source_hash)
      values ('module:' || v_first || ':q', 'pl', 'X', 'machine', repeat('0', 64));
      v_txt := v_txt || ',taken';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the registry takes module:<id>:p and refuses a key it does not know',
      'expected', 'taken,refused', 'actual', v_txt, 'pass', v_txt = 'taken,refused');

    -- 7 -------------------------------------------------------------- frozen
    begin
      update app.question_modules set fixed_order = false where id = v_mod;
      v_txt := 'written';
    exception when restrict_violation then v_txt := 'refused';
    end;
    begin
      update app.question_modules set attribution = '{"nb":"Annet"}' where id = v_mod;
      v_txt := v_txt || ',written';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    begin
      update app.module_items set offers_not_relevant = true where id = v_first;
      v_txt := v_txt || ',written';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a published instrument''s order, attribution and statements are frozen',
      'expected', 'refused,refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused,refused');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 8 ---------------------------------------------------------------- nothing left
  select count(*) into v_n from (
    select key from app.question_modules where key = 'probe-instrument'
    union all select id::text from app.invitations where round_id = v_round and employee_id = v_emp1 and responded_at is not null
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._minst
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._minst order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._minst;
  if v_failed is not null then raise exception 'module instrument invariants failed: %', v_failed; end if;
  if v_count <> 8 then raise exception 'module instrument invariants: expected 8 rows, got %', v_count; end if;
end $$;

drop table public._minst;
