-- count_answer_keys_invariants.sql — a count question's answer keys and its factor (0090, D-138).
--
--   * handel as seeded: HA-T-2 is stored ja / nei / ikke_aktuelt and asked with «Alene på vakt»;
--     every other count question is by position, as before (1)
--   * the database refuses answer keys out of order, keys or a factor on a statement, and a
--     factor of another module (2)
--   * the form sends each option's answer key, and asks the question only where its factor is
--     asked (3)
--   * «vet ikke» is refused where the question does not offer it, a question whose factor is not
--     asked is refused, and «Jobber aldri alene» is taken (4)
--   * the totals keep it out of the share, and say which answer each option is (5)
--   * a published question's answer keys cannot change (6)
--   * nothing written here survives (7)
--
-- A probe module is seeded inside a block that is rolled back, and put on the fixture's open
-- round (and a closed one) with round_module_ok disabled for that transaction only.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/count_answer_keys_invariants.sql

create unlogged table if not exists public._cak(seq int, name text, expected text, actual text, pass bool);
truncate public._cak;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_round  uuid;
  v_closed uuid;
  v_emp    uuid;
  v_tok    text;
  v_dl     uuid;
  v_mod    uuid;
  v_a      uuid[];
  v_b      uuid[];
  v_t1     uuid;
  v_t2     uuid;
  v_form   jsonb;
  v_json   jsonb;
  v_txt    text;
  v_rows   jsonb := '[]';
  v_cnt    int;
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
  probe    constant jsonb := jsonb_build_object(
    'module_id', 'probe-answer-keys', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 2,
    'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
    'sources', '[]'::jsonb,
    'factors', '[
      {"id":"pa","name":"A","summary":"S","rationale":"R","rationale_sources":[],"legal_basis":[],
       "items":[{"id":"PK-PA-1","text":"A1","reverse":false,"pulse_eligible":true},
                {"id":"PK-PA-2","text":"A2","reverse":false,"pulse_eligible":true},
                {"id":"PK-PA-3","text":"A3","reverse":false,"pulse_eligible":true}],
       "action_suggestions":[{"type":"rutine","title":"T","description":"D","remeasure_item":"PK-PA-1"}]},
      {"id":"pb","name":"B","summary":"S","rationale":"R","rationale_sources":[],"legal_basis":[],
       "items":[{"id":"PK-PB-1","text":"B1","reverse":false,"pulse_eligible":true},
                {"id":"PK-PB-2","text":"B2","reverse":false,"pulse_eligible":true},
                {"id":"PK-PB-3","text":"B3","reverse":false,"pulse_eligible":true}],
       "action_suggestions":[{"type":"rutine","title":"T","description":"D","remeasure_item":"PK-PB-1"}]}]'::jsonb,
    'count_items', '[{"id":"PK-T-1","text":"En","options":["Ja","Nei","Vet ikke"]},
                     {"id":"PK-T-2","text":"To","options":["Ja","Nei","Aldri"],"answer_keys":["ja","nei","ikke_aktuelt"],
                      "asked_with":"pb"}]'::jsonb,
    'segments', '[]'::jsonb);
begin
  -- 1 ---------------------------------------------------------------- handel as seeded
  select concat_ws('|',
    (select string_agg(i.code || ':' || array_to_string(app.count_answer_keys(i), ',') || ':' || coalesce(f.key, '-'), ' ' order by i.code)
     from app.module_items i left join app.module_factors f on f.id = i.asked_with
     where i.module_id = m.id and i.kind = 'count'),
    (select count(*) from app.module_items i where i.module_id <> m.id and (i.answer_keys is not null or i.asked_with is not null)))
    into v_txt
  from app.question_modules m where m.key = 'handel' and m.version = '1.0.0';
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'handel: HA-T-2 is ja/nei/ikke_aktuelt with «Alene på vakt»; no other module has either',
    'expected', 'HA-T-1:ja,nei,vet_ikke:- HA-T-2:ja,nei,ikke_aktuelt:alene_pa_vakt|0', 'actual', coalesce(v_txt, 'not seeded'),
    'pass', v_txt = 'HA-T-1:ja,nei,vet_ikke:- HA-T-2:ja,nei,ikke_aktuelt:alene_pa_vakt|0');

  select r.id into v_round from app.rounds r where r.status = 'apen' and r.org_id = v_org order by r.opens_at desc limit 1;
  select e.id into v_emp from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_round and i.responded_at is null order by e.full_name limit 1;
  v_tok := 'fixture.' || v_round::text || '.' || v_emp::text;

  begin
    perform app.module_seed(probe, repeat('d', 64));
    select m.id into v_mod from app.question_modules m where m.key = 'probe-answer-keys';
    select array_agg(i.id order by i.sort) into v_a from app.module_items i where i.module_id = v_mod and i.code like 'PK-PA-%';
    select array_agg(i.id order by i.sort) into v_b from app.module_items i where i.module_id = v_mod and i.code like 'PK-PB-%';
    select i.id into v_t1 from app.module_items i where i.module_id = v_mod and i.code = 'PK-T-1';
    select i.id into v_t2 from app.module_items i where i.module_id = v_mod and i.code = 'PK-T-2';

    -- 2 ------------------------------------------------------------ the shape, on a draft
    begin
      update app.module_items set answer_keys = array['ja', 'ikke_aktuelt', 'nei'] where id = v_t2;
      v_txt := 'written';
    exception when check_violation then v_txt := 'refused';
    end;
    begin
      update app.module_items set answer_keys = array['ja', 'nei', 'vet_ikke'] where id = v_a[1];
      v_txt := v_txt || ',written';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    begin
      update app.module_items set asked_with = (select f.id from app.module_factors f where f.module_id = v_mod and f.key = 'pa')
      where id = v_a[2];
      v_txt := v_txt || ',written';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    begin
      update app.module_items set asked_with = (select f.id from app.module_factors f join app.question_modules m on m.id = f.module_id
                                                where m.key = 'handel' limit 1)
      where id = v_t2;
      v_txt := v_txt || ',written';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'keys out of order, keys or a factor on a statement, another module''s factor: refused',
      'expected', 'refused,refused,refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused,refused,refused');

    perform app.module_set_status('probe-answer-keys', '0.0.1', 'published');

    -- 3 ------------------------------------------------------------ the form
    alter table app.round_modules disable trigger round_module_ok;
    insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items)
    values (v_org, v_round, v_mod, v_a || v_b, true);
    v_form := public.respond_form(v_tok);
    select string_agg(c->>'text' || ':' || (c->'answers')::text, ' ' order by c->>'text')
      into v_txt from jsonb_array_elements(v_form->'modules'->0->'count') c;
    update app.round_modules set item_ids = v_a where round_id = v_round and module_id = v_mod;
    select v_txt || '#' || string_agg(c->>'text', ' ' order by c->>'text')
      into v_txt from jsonb_array_elements(public.respond_form(v_tok)->'modules'->0->'count') c;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'each option''s answer is sent; PK-T-2 only where factor B is asked',
      'expected', 'En:["ja", "nei", "vet_ikke"] To:["ja", "nei", "ikke_aktuelt"]#En', 'actual', v_txt,
      'pass', v_txt = 'En:["ja", "nei", "vet_ikke"] To:["ja", "nei", "ikke_aktuelt"]#En');

    -- 4 ------------------------------------------------------------ what is taken
    v_json := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('count', jsonb_build_array(jsonb_build_object('item', v_t2, 'answer', 'ja'))));
    v_txt := coalesce(v_json->>'error', 'ok');
    update app.round_modules set item_ids = v_a || v_b where round_id = v_round and module_id = v_mod;
    v_json := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('count', jsonb_build_array(jsonb_build_object('item', v_t2, 'answer', 'vet_ikke'))));
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok');
    v_json := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('count', jsonb_build_array(jsonb_build_object('item', v_t1, 'answer', 'ikke_aktuelt'))));
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok');
    v_json := public.submit_response(v_tok, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object('count', jsonb_build_array(jsonb_build_object('item', v_t1, 'answer', 'vet_ikke'),
                                                    jsonb_build_object('item', v_t2, 'answer', 'ikke_aktuelt'))));
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok') || ','
      || (select string_agg(c.answer, ',' order by c.answer) from app.org_count_answers c where c.round_id = v_round and c.item_id in (v_t1, v_t2));
    alter table app.round_modules enable trigger round_module_ok;
    v_rows := v_rows || jsonb_build_object('seq', 4,
      'name', 'factor not asked, «vet ikke» not offered, «ikke aktuelt» not offered: refused; «Aldri» taken',
      'expected', 'question_not_in_round,question_not_in_round,question_not_in_round,ok,ikke_aktuelt,vet_ikke', 'actual', v_txt,
      'pass', v_txt = 'question_not_in_round,question_not_in_round,question_not_in_round,ok,ikke_aktuelt,vet_ikke');

    -- 5 ------------------------------------------------------------ the share
    select r.id into v_closed from app.rounds r join app.measurements ms on ms.id = r.measurement_id
    where r.org_id = v_org and r.status = 'lukket' and ms.kind = 'grunnlinje' order by r.closes_at desc limit 1;
    select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;
    alter table app.round_modules disable trigger round_module_ok;
    insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items)
    values (v_org, v_closed, v_mod, v_a || v_b, true);
    alter table app.round_modules enable trigger round_module_ok;
    insert into app.org_count_answers (round_id, item_id, answer)
    select v_closed, v_t2, a from unnest(array['ja','ja','ja','nei','nei','ikke_aktuelt','ikke_aktuelt','ikke_aktuelt']) a;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    select i->>'n_total' || ':' || (i->>'n_ja') || ':' || (i->>'n_nei') || ':' || (i->>'n_vet_ikke') || ':' || (i->'answers'->>2)
      into v_txt from jsonb_array_elements(public.get_count_item_totals(v_closed)->'items') i where i->>'code' = 'PK-T-2';
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', '«Aldri» is out of the share, and named as ikke_aktuelt',
      'expected', '5:3:2:0:ikke_aktuelt', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = '5:3:2:0:ikke_aktuelt');

    -- 6 ------------------------------------------------------------ frozen
    begin
      update app.module_items set answer_keys = array['ja', 'nei', 'vet_ikke'] where id = v_t2;
      v_txt := 'written';
    exception when restrict_violation then v_txt := 'refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a published question''s answer keys cannot change',
      'expected', 'refused', 'actual', v_txt, 'pass', v_txt = 'refused');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 7 ---------------------------------------------------------------- nothing left
  select count(*) into v_cnt from (
    select key from app.question_modules where key = 'probe-answer-keys'
    union all select id::text from app.invitations where round_id = v_round and employee_id = v_emp and responded_at is not null
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._cak
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cak order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._cak;
  if v_failed is not null then raise exception 'count answer key invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'count answer key invariants: expected 7 rows, got %', v_count; end if;
end $$;

drop table public._cak;
