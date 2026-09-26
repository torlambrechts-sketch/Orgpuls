-- module_respond_invariants.sql — answering a round's industry module (0069, D-113).
--
--   * the form carries the module, and still no round, invitation, employee or group (1)
--   * the module's statements come shuffled per token, and stable on reload (2)
--   * a module answer the round does not ask is refused, and consumes nothing (3)
--   * an out-of-range value or count answer is refused (4)
--   * a real submission writes statements on the response row, and count answers with
--     no link to it (5)
--   * the count answer's date is a day, and nothing about it names the response (6)
--   * still one submit_response, still no response id returned (7)
--   * nothing written here survives (8)
--
-- It seeds a probe module inside the rolled-back block and puts it on the fixture's open
-- round with round_module_ok disabled for that transaction only (a round's modules are
-- otherwise fixed once it opens).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_respond_invariants.sql

create unlogged table if not exists public._mri(seq int, name text, expected text, actual text, pass bool);
truncate public._mri;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_round  uuid;
  v_emp    uuid;
  v_emp2   uuid;
  v_tok    text;
  v_tok2   text;
  v_mod    uuid;
  v_items  uuid[];
  v_count  uuid;
  v_form   jsonb;
  v_form2  jsonb;
  v_res    jsonb;
  v_before int;
  v_after  int;
  v_rows   jsonb := '[]';
  v_txt    text;
  v_answers jsonb;
begin
  select r.id into v_round from app.rounds r
  where r.status = 'apen' and r.org_id = v_org order by r.opens_at desc limit 1;
  select e.id into v_emp from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_round and i.responded_at is null order by e.full_name limit 1;
  select e.id into v_emp2 from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_round and i.responded_at is null and e.id <> v_emp order by e.full_name limit 1;
  v_tok  := 'fixture.' || v_round::text || '.' || v_emp::text;
  v_tok2 := 'fixture.' || v_round::text || '.' || v_emp2::text;

  begin
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-modul', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 2,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object(
        'id', 'probe_faktor', 'name', 'Probefaktor', 'summary', 'S', 'rationale', 'R', 'rationale_sources', '[]'::jsonb,
        'legal_basis', '[]'::jsonb,
        'items', '[{"id":"PR-PF-1","text":"En","reverse":false,"pulse_eligible":true},
                   {"id":"PR-PF-2","text":"To","reverse":false,"pulse_eligible":true},
                   {"id":"PR-PF-3","text":"Tre","reverse":false,"pulse_eligible":true}]'::jsonb,
        'action_suggestions', '[{"type":"rutine","title":"T","description":"D","remeasure_item":"PR-PF-2"}]'::jsonb)),
      'count_items', '[{"id":"PR-T-1","text":"Telles","options":["Ja","Nei","Vet ikke"]}]'::jsonb,
      'segments', '[]'::jsonb), repeat('c', 64));
    select m.id into v_mod from app.question_modules m where m.key = 'probe-modul';
    perform app.module_set_status('probe-modul', '0.0.1', 'published');
    select array_agg(i.id order by i.sort) into v_items from app.module_items i where i.module_id = v_mod and i.kind = 'likert5';
    select i.id into v_count from app.module_items i where i.module_id = v_mod and i.kind = 'count';

    alter table app.round_modules disable trigger round_module_ok;
    insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items)
    values (v_org, v_round, v_mod, v_items, true);
    alter table app.round_modules enable trigger round_module_ok;

    -- 1 ---------------------------------------------------------------- the form
    v_form := public.respond_form(v_tok);
    v_txt := concat_ws('|',
      jsonb_array_length(v_form->'modules'),
      v_form->'modules'->0->>'name',
      v_form->'modules'->0->>'minutes',
      jsonb_array_length(v_form->'modules'->0->'statements'),
      jsonb_array_length(v_form->'modules'->0->'count'),
      v_form->'modules'->0->'count'->0->'options'->>2,
      (select count(*) from jsonb_object_keys(v_form) k where k ~ 'round|invitation|employee|group|id'));
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the form carries the module, and no handle on the person',
      'expected', '1|Probe|2|3|1|Vet ikke|0', 'actual', v_txt, 'pass', v_txt = '1|Probe|2|3|1|Vet ikke|0');

    -- 2 ---------------------------------------------------------------- shuffled per token
    v_form2 := public.respond_form(v_tok2);
    v_txt := ((v_form->'modules'->0->'statements') = (public.respond_form(v_tok)->'modules'->0->'statements'))::text
      || ',' || (select string_agg(x->>'text', '' order by x->>'text') from jsonb_array_elements(v_form2->'modules'->0->'statements') x);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the same token gets the same order, and every statement',
      'expected', 'true,EnToTre', 'actual', v_txt, 'pass', v_txt = 'true,EnToTre');

    -- 3 ---------------------------------------------------------------- only what the round asks
    select count(*) into v_before from app.responses where round_id = v_round;
    v_res := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('answers', jsonb_build_array(jsonb_build_object('item', gen_random_uuid(), 'value', 3))));
    v_txt := coalesce(v_res->>'error', 'ok');
    v_res := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('segments', jsonb_build_array(jsonb_build_object('item', v_items[1], 'option', 1))));
    v_txt := v_txt || ',' || coalesce(v_res->>'error', 'ok');
    select count(*) into v_after from app.responses where round_id = v_round;
    v_txt := v_txt || ',' || (v_after - v_before)
      || ',' || (select (responded_at is null)::text from app.invitations where round_id = v_round and employee_id = v_emp);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a statement or segment the round does not ask is refused, consuming nothing',
      'expected', 'question_not_in_round,question_not_in_round,0,true', 'actual', v_txt,
      'pass', v_txt = 'question_not_in_round,question_not_in_round,0,true');

    -- 4 ---------------------------------------------------------------- shapes
    v_res := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('answers', jsonb_build_array(jsonb_build_object('item', v_items[1], 'value', 6))));
    v_txt := coalesce(v_res->>'error', 'ok');
    v_res := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('count', jsonb_build_array(jsonb_build_object('item', v_count, 'answer', 'kanskje'))));
    v_txt := v_txt || ',' || coalesce(v_res->>'error', 'ok');
    v_res := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb, '[1]'::jsonb);
    v_txt := v_txt || ',' || coalesce(v_res->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a value outside 1-5, an unknown count answer, a malformed payload: refused',
      'expected', 'question_not_in_round,question_not_in_round,question_not_in_round', 'actual', v_txt,
      'pass', v_txt = 'question_not_in_round,question_not_in_round,question_not_in_round');

    -- 5 ---------------------------------------------------------------- the real thing, as anon
    select jsonb_agg(jsonb_build_object('factor', rf.factor_key, 'ordinal', s.ordinal, 'value', 4))
      into v_answers
    from app.round_factors rf join app.statements s on s.factor_key = rf.factor_key where rf.round_id = v_round;
    set local role anon;
    v_res := public.submit_response(v_tok, v_answers, '[]'::jsonb, jsonb_build_object(
      'answers', jsonb_build_array(jsonb_build_object('item', v_items[1], 'value', 5), jsonb_build_object('item', v_items[3], 'value', 2)),
      'count', jsonb_build_array(jsonb_build_object('item', v_count, 'answer', 'ja'))));
    reset role;
    select concat_ws('|', v_res->>'ok', (v_res->>'answers')::int - jsonb_array_length(v_answers),
      (select count(*) from app.module_answers ma join app.responses r on r.id = ma.response_id where r.round_id = v_round),
      (select count(*) from app.org_count_answers c where c.round_id = v_round and c.item_id = v_count and c.answer = 'ja'),
      (select count(*) from jsonb_object_keys(v_res) k where k like '%id%'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'anon submits: two statements on the response, one count answer, no id back',
      'expected', 'true|2|2|1|0', 'actual', v_txt, 'pass', v_txt = 'true|2|2|1|0');

    -- 6 ---------------------------------------------------------------- the count answer is a day, not a person
    select concat_ws('|', (c.answered_on = (now() at time zone 'Europe/Oslo')::date)::text,
                     pg_typeof(c.answered_on)::text)
      into v_txt from app.org_count_answers c where c.round_id = v_round and c.item_id = v_count;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the count answer carries today''s Oslo date and nothing finer',
      'expected', 'true|date', 'actual', v_txt, 'pass', v_txt = 'true|date');

    -- 7 ---------------------------------------------------------------- one write path
    v_txt := (select count(*) from pg_proc where proname = 'submit_response')::text || ','
      || has_function_privilege('anon', 'public.submit_response(text,jsonb,jsonb,jsonb)', 'execute')::text;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'still one submit_response, and anon may call it',
      'expected', '1,true', 'actual', v_txt, 'pass', v_txt = '1,true');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe change was rolled back', 'expected', 'true',
    'actual', (not exists (select 1 from app.question_modules where key = 'probe-modul')
               and not exists (select 1 from app.org_count_answers where round_id = v_round)
               and (select responded_at is null from app.invitations where round_id = v_round and employee_id = v_emp))::text,
    'pass', not exists (select 1 from app.question_modules where key = 'probe-modul')
               and not exists (select 1 from app.org_count_answers where round_id = v_round)
               and (select responded_at is null from app.invitations where round_id = v_round and employee_id = v_emp));

  insert into public._mri
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._mri order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._mri;
  if v_failed is not null then raise exception 'module respond invariants failed: %', v_failed; end if;
  if v_count <> 8 then raise exception 'module respond invariants: expected 8 rows, got %', v_count; end if;
end $$;

drop table public._mri;
