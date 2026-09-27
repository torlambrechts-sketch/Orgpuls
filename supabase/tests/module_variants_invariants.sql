-- module_variants_invariants.sql — a module asked in two variants (0089, D-137), proved against
-- the live schema.
--
--   * the two new tables: RLS on, read only for every client (1)
--   * every module asked one way is scored from exactly its own statements (2)
--   * kunnskap og kontor as seeded: fifteen extended factors of three to five, eight simplified
--     of exactly three core statements, every statement in one extended factor (3)
--   * a published module's membership cannot change (4)
--   * a round's statements follow from its variant: the simplified set is the core statements,
--     whatever a caller sends (5)
--   * a client cannot write a round's variant or factors (6)
--   * only a daglig leder chooses; fewer factors than the minimum, or an unknown one, is refused (7)
--   * the extended set: the chosen factors and the core statements, never an unchosen factor's
--     other statements; applied to the planned grunnlinje (8)
--   * the database refuses a round with fewer extended factors than the minimum (9)
--   * the same answers give the simplified index in both variants, marked comparable in the
--     extended one; an extended factor not chosen is not scored from its core statement (10)
--   * a count question's «ikke aktuelt» is kept out of the share, and only its variant asks it (11)
--   * statements of a module in variants cannot be left out one by one (12)
--   * nothing written here survives (13)
--
-- Built inside a block that is rolled back. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_variants_invariants.sql

create unlogged table if not exists public._mvar(seq int, name text, expected text, actual text, pass bool);
truncate public._mvar;

do $$
declare
  v_fix    uuid := '00000000-0000-4000-8000-000000000001';
  v_org    uuid := '00000000-0000-4000-8000-00000000ad01';
  v_meas   uuid := '00000000-0000-4000-8000-00000000ad02';
  v_dl     uuid := '00000000-0000-4000-8000-0000000ad011';
  v_vo     uuid := '00000000-0000-4000-8000-0000000ad012';
  v_fdl    uuid;
  v_round  uuid;
  v_closed uuid;
  v_mod    uuid;
  v_items  uuid[];
  v_json   jsonb;
  v_txt    text;
  v_rows   jsonb := '[]';
  v_cnt    int;
  v_f1     text;
  v_t2     uuid;
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
  codes    constant text := 'select string_agg(i.code, '','' order by i.code) from app.round_modules rm, unnest(rm.item_ids) x(id) join app.module_items i on i.id = x.id where rm.round_id = $1';
begin
  -- 1 ---------------------------------------------------------------- the tables
  select concat_ws('|',
    (select string_agg(c.relname || ':' || c.relrowsecurity, ',' order by c.relname) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname in ('module_variants', 'module_factor_items')),
    (select string_agg(distinct privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
      where table_schema = 'app' and table_name in ('module_variants', 'module_factor_items') and grantee in ('anon', 'authenticated')),
    (select string_agg(distinct cmd, ',') from pg_policies
      where schemaname = 'app' and tablename in ('module_variants', 'module_factor_items')))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on, read only for every client',
    'expected', 'module_factor_items:true,module_variants:true|SELECT|SELECT', 'actual', v_txt,
    'pass', v_txt = 'module_factor_items:true,module_variants:true|SELECT|SELECT');

  -- 2 ---------------------------------------------------------------- one way, as before
  select count(*) into v_cnt from (
    (select i.factor_id, i.id from app.module_items i
     where i.kind = 'likert5' and not exists (select 1 from app.module_variants v where v.module_id = i.module_id)
     except
     select mi.factor_id, mi.item_id from app.module_factor_items mi
     where not exists (select 1 from app.module_variants v where v.module_id = mi.module_id))
    union all
    (select mi.factor_id, mi.item_id from app.module_factor_items mi
     where not exists (select 1 from app.module_variants v where v.module_id = mi.module_id)
     except
     select i.factor_id, i.id from app.module_items i
     where i.kind = 'likert5' and not exists (select 1 from app.module_variants v where v.module_id = i.module_id))
  ) d;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a module asked one way is scored from its own statements, and only those',
    'expected', '0 differences', 'actual', v_cnt || ' differences', 'pass', v_cnt = 0);

  -- 3 ---------------------------------------------------------------- kunnskap og kontor
  select concat_ws('|',
    (select count(*) from app.module_factors f where f.module_id = m.id and f.variant_key = 'utvidet'
       and (select count(*) from app.module_factor_items mi where mi.factor_id = f.id) between 3 and 5),
    (select count(*) from app.module_factors f where f.module_id = m.id and f.variant_key = 'forenklet'
       and (select count(*) from app.module_factor_items mi join app.module_items i on i.id = mi.item_id
            where mi.factor_id = f.id and i.core_indicator) = 3
       and (select count(*) from app.module_factor_items mi where mi.factor_id = f.id) = 3),
    (select count(*) from app.module_items i where i.module_id = m.id and i.kind = 'likert5'
       and (select count(*) from app.module_factor_items mi join app.module_factors f on f.id = mi.factor_id
            where mi.item_id = i.id and f.variant_key = 'utvidet') = 1),
    (select count(*) from app.module_items i where i.module_id = m.id and i.core_indicator),
    (select string_agg(v.key || ':' || coalesce(v.min_factors, 0), ',' order by v.sort) from app.module_variants v where v.module_id = m.id),
    m.validation_status)
    into v_txt
  from app.question_modules m where m.key = 'kunnskap-og-kontor' and m.version = '1.0.0';
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'kunnskap og kontor: 15 extended factors, 8 simplified of 3 core, 62 statements each in one',
    'expected', '15|8|62|24|forenklet:0,utvidet:8|provisional', 'actual', coalesce(v_txt, 'not seeded'),
    'pass', v_txt = '15|8|62|24|forenklet:0,utvidet:8|provisional');

  begin
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-variant', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
      'validation_status', 'provisional',
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', '[
        {"id":"ua","code":"UA","name":"A","summary":"S","rationale":"R","rationale_sources":[],"legal_basis":[],
         "items":[{"id":"PV-UA-1","text":"A1","reverse":false,"pulse_eligible":true,"core_indicator":true},
                  {"id":"PV-UA-2","text":"A2","reverse":false,"pulse_eligible":true,"core_indicator":true},
                  {"id":"PV-UA-3","text":"A3","reverse":false,"pulse_eligible":true,"core_indicator":false},
                  {"id":"PV-UA-4","text":"A4","reverse":false,"pulse_eligible":true,"core_indicator":false}],
         "action_suggestions":[{"type":"rutine","title":"T","description":"D","remeasure_item":"PV-UA-3"}]},
        {"id":"ub","code":"UB","name":"B","summary":"S","rationale":"R","rationale_sources":[],"legal_basis":[],
         "items":[{"id":"PV-UB-1","text":"B1","reverse":false,"pulse_eligible":true,"core_indicator":true},
                  {"id":"PV-UB-2","text":"B2","reverse":false,"pulse_eligible":true,"core_indicator":false},
                  {"id":"PV-UB-3","text":"B3","reverse":false,"pulse_eligible":true,"core_indicator":false}],
         "action_suggestions":[{"type":"rutine","title":"T","description":"D","remeasure_item":"PV-UB-2"}]},
        {"id":"uc","code":"UC","name":"C","summary":"S","rationale":"R","rationale_sources":[],"legal_basis":[],
         "optional":true,"extended_only":true,
         "items":[{"id":"PV-UC-1","text":"C1","reverse":false,"pulse_eligible":true,"core_indicator":false},
                  {"id":"PV-UC-2","text":"C2","reverse":false,"pulse_eligible":true,"core_indicator":false},
                  {"id":"PV-UC-3","text":"C3","reverse":false,"pulse_eligible":true,"core_indicator":false}],
         "action_suggestions":[{"type":"rutine","title":"T","description":"D","remeasure_item":"PV-UC-1"}]}]'::jsonb,
      'variants', '[
        {"key":"forenklet","code":"PV-F","version":"1.0","name":"Forenklet","estimated_minutes":1,"factor_toggles":false,
         "factors":[{"id":"f_en","code":"F1","name":"En","summary":"S","built_from":["ua","ub"],
                     "items":["PV-UA-1","PV-UA-2","PV-UB-1"],
                     "action_suggestions":[{"type":"rutine","title":"T","description":"D","remeasure_item":"PV-UB-1"}]}],
         "count_items":["PV-T-1"],"segments":[]},
        {"key":"utvidet","code":"PV-U","version":"1.0","name":"Utvidet","estimated_minutes":2,"factor_toggles":true,
         "min_factors":2,"default_off":["uc"],"locked_items":["PV-UA-1","PV-UA-2","PV-UB-1"],
         "count_items":["PV-T-1","PV-T-2"],"segments":[]}]'::jsonb,
      'count_items', '[{"id":"PV-T-1","text":"En","options":["Ja","Nei","Vet ikke"],"variants":["forenklet","utvidet"]},
                       {"id":"PV-T-2","text":"To","options":["Ja","Nei","Vet ikke","Ikke aktuelt"],"variants":["utvidet"]}]'::jsonb,
      'segments', '[]'::jsonb), repeat('f', 64));
    select m.id into v_mod from app.question_modules m where m.key = 'probe-variant';
    perform app.module_set_status('probe-variant', '0.0.1', 'published');
    select i.id into v_t2 from app.module_items i where i.module_id = v_mod and i.code = 'PV-T-2';

    -- 4 ------------------------------------------------------------ frozen
    begin
      insert into app.module_factor_items (module_id, factor_id, item_id, sort)
      select v_mod, f.id, i.id, 9 from app.module_factors f, app.module_items i
      where f.module_id = v_mod and f.key = 'f_en' and i.module_id = v_mod and i.code = 'PV-UA-3';
      v_txt := 'inserted';
    exception when restrict_violation then v_txt := 'refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a published module''s membership cannot change',
      'expected', 'refused', 'actual', v_txt, 'pass', v_txt = 'refused');

    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Module Variant AS', '999000556', 20);
    insert into auth.users (id, email) values (v_dl, 'dl@mv-test.example'), (v_vo, 'vo@mv-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_vo, 'VO');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_org, 'grunnlinje', 2027, 'Probe');
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2027-03-01 08:00+01', '2027-03-15 20:00+01') returning id into v_round;

    -- 5 ------------------------------------------------------------ derived, not chosen
    insert into app.round_modules (org_id, round_id, module_id, item_ids)
    select v_org, v_round, v_mod, array_agg(i.id) from app.module_items i where i.module_id = v_mod and i.code = 'PV-UC-1';
    execute codes into v_txt using v_round;
    v_txt := (select rm.variant_key from app.round_modules rm where rm.round_id = v_round) || '|' || v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the simplified set is the core statements, whatever is sent',
      'expected', 'forenklet|PV-UA-1,PV-UA-2,PV-UB-1', 'actual', v_txt, 'pass', v_txt = 'forenklet|PV-UA-1,PV-UA-2,PV-UB-1');

    -- 6 ------------------------------------------------------------ not a client's to write
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    begin
      set local role authenticated;
      update app.round_modules set variant_key = 'utvidet' where round_id = v_round;
      v_txt := 'written';
    exception when insufficient_privilege then v_txt := 'refused';
    end;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a client cannot write a round''s variant',
      'expected', 'refused', 'actual', v_txt, 'pass', v_txt = 'refused');

    -- 7 ------------------------------------------------------------ who, and how many
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    v_txt := coalesce(public.set_org_module_variant(v_org, 'probe-variant', 'utvidet', null)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := v_txt || ',' || coalesce(public.set_org_module_variant(v_org, 'probe-variant', 'utvidet', array['ua'])->>'error', 'ok')
                   || ',' || coalesce(public.set_org_module_variant(v_org, 'probe-variant', 'utvidet', array['ua', 'zz'])->>'error', 'ok')
                   || ',' || coalesce(public.set_org_module_variant(v_org, 'probe-variant', 'annet', null)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'only a daglig leder; too few, an unknown factor or variant refused',
      'expected', 'not_allowed,too_few,invalid,invalid', 'actual', v_txt, 'pass', v_txt = 'not_allowed,too_few,invalid,invalid');

    -- 8 ------------------------------------------------------------ the extended set
    v_json := public.set_org_module_variant(v_org, 'probe-variant', 'utvidet', null);
    execute codes into v_txt using v_round;
    v_txt := concat_ws('|', v_json->>'planned_rounds', v_json->'factors'->>0, v_json->'factors'->>1, v_txt);
    v_json := public.set_org_module_variant(v_org, 'probe-variant', 'utvidet', array['ua', 'uc']);
    execute codes into v_f1 using v_round;
    v_txt := v_txt || '#' || v_f1;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'extended: the chosen factors and the core statements; the default leaves out uc',
      'expected', '1|ua|ub|PV-UA-1,PV-UA-2,PV-UA-3,PV-UA-4,PV-UB-1,PV-UB-2,PV-UB-3#PV-UA-1,PV-UA-2,PV-UA-3,PV-UA-4,PV-UB-1,PV-UC-1,PV-UC-2,PV-UC-3',
      'actual', v_txt,
      'pass', v_txt = '1|ua|ub|PV-UA-1,PV-UA-2,PV-UA-3,PV-UA-4,PV-UB-1,PV-UB-2,PV-UB-3#PV-UA-1,PV-UA-2,PV-UA-3,PV-UA-4,PV-UB-1,PV-UC-1,PV-UC-2,PV-UC-3');

    -- 9 ------------------------------------------------------------ the database's own floor
    perform set_config('request.jwt.claims', '', true);
    begin
      update app.round_modules set factor_keys = array['ua'] where round_id = v_round;
      v_txt := 'written';
    exception when check_violation then v_txt := 'refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a round with fewer extended factors than the minimum is refused',
      'expected', 'refused', 'actual', v_txt, 'pass', v_txt = 'refused');

    -- 10 ----------------------------------------------------------- the simplified index, both ways
    select r.id into v_closed from app.rounds r join app.responses resp on resp.round_id = r.id
    join app.measurements ms on ms.id = r.measurement_id
    where r.org_id = v_fix and r.status = 'lukket' and ms.kind = 'grunnlinje' group by r.id order by count(*) desc limit 1;
    select m.user_id into v_fdl from app.memberships m where m.org_id = v_fix and m.role = 'daglig_leder' and m.active limit 1;
    select array_agg(i.id order by i.sort) into v_items from app.module_items i where i.module_id = v_mod and i.kind = 'likert5';

    alter table app.round_modules disable trigger round_module_ok;
    insert into app.round_modules (org_id, round_id, module_id, item_ids, variant_key)
    values (v_fix, v_closed, v_mod, '{}', 'forenklet');
    -- every probe statement answered by the people, with the values, that answered ytring
    insert into app.module_answers (response_id, item_id, value)
    select an.response_id, it.id, an.value
    from app.answers an join app.responses resp on resp.id = an.response_id
    join app.module_items it on it.module_id = v_mod and it.kind = 'likert5'
    where resp.round_id = v_closed and an.factor_key = 'ytring' and an.ordinal = (it.sort % 3) + 1;

    perform set_config('request.jwt.claims', format(claims, v_fdl), true);
    v_json := public.module_results(v_closed)->'modules'->0;
    select string_agg(f->>'key' || ':' || coalesce(f->>'index', '-') || ':' || (f->>'comparable'), ',' order by f->>'key')
      into v_f1 from jsonb_array_elements(v_json->'factors') f;
    v_f1 := concat_ws('|', v_json->>'validation_status', v_json->'variant'->>'code', v_f1);

    perform set_config('request.jwt.claims', '', true);
    delete from app.round_modules where round_id = v_closed and module_id = v_mod;
    insert into app.round_modules (org_id, round_id, module_id, item_ids, variant_key, factor_keys)
    values (v_fix, v_closed, v_mod, '{}', 'utvidet', array['ua', 'uc']);
    perform set_config('request.jwt.claims', format(claims, v_fdl), true);
    v_json := public.module_results(v_closed)->'modules'->0;
    select string_agg(f->>'key' || ':' || (f->>'index' is not null) || ':' || (f->>'comparable'), ',' order by f->>'key')
      into v_txt from jsonb_array_elements(v_json->'factors') f;
    v_txt := concat_ws('|', v_json->'variant'->>'code', v_txt,
      ((select f->>'index' from jsonb_array_elements(v_json->'factors') f where f->>'key' = 'f_en')
        = split_part(split_part(v_f1, '|', 3), ':', 2))::text);
    v_rows := v_rows || jsonb_build_object('seq', 10,
      'name', 'the same answers give the same simplified index both ways; an unchosen factor is not scored',
      'expected', 'provisional|PV-F|f_en:true|PV-U|f_en:true:true,ua:true:false,uc:true:false|true',
      'actual', regexp_replace(v_f1, 'f_en:[0-9]+:false', 'f_en:true') || '|' || v_txt,
      'pass', v_f1 ~ '^provisional\|PV-F\|f_en:[0-9]+:false$'
              and v_txt = 'PV-U|f_en:true:true,ua:true:false,uc:true:false|true');

    -- 11 ----------------------------------------------------------- «ikke aktuelt»
    insert into app.org_count_answers (round_id, item_id, answer)
    select v_closed, v_t2, a from unnest(array['ja','ja','ja','ja','nei','ikke_aktuelt','ikke_aktuelt']) a;
    v_json := public.get_count_item_totals(v_closed);
    select string_agg(i->>'code' || ':' || coalesce(i->>'n_total', '-') || ':' || coalesce(i->>'n_ja', '-'), ',' order by i->>'code')
      into v_txt from jsonb_array_elements(v_json->'items') i where i->>'code' like 'PV-%';
    perform set_config('request.jwt.claims', '', true);
    update app.round_modules set variant_key = 'forenklet', factor_keys = null where round_id = v_closed and module_id = v_mod;
    alter table app.round_modules enable trigger round_module_ok;
    perform set_config('request.jwt.claims', format(claims, v_fdl), true);
    select v_txt || '#' || coalesce(string_agg(i->>'code', ',' order by i->>'code'), '')
      into v_txt from jsonb_array_elements(public.get_count_item_totals(v_closed)->'items') i where i->>'code' like 'PV-%';
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', '«ikke aktuelt» is out of the share; the simplified set does not ask PV-T-2',
      'expected', 'PV-T-1:-:-,PV-T-2:5:4#PV-T-1', 'actual', v_txt, 'pass', v_txt = 'PV-T-1:-:-,PV-T-2:5:4#PV-T-1');

    -- 12 ----------------------------------------------------------- no statement choice
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := coalesce(public.set_org_module_item(v_org, 'probe-variant', 'PV-UA-3', false, null)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a module in variants is not chosen statement by statement',
      'expected', 'not_available', 'actual', v_txt, 'pass', v_txt = 'not_available');
    perform set_config('request.jwt.claims', '', true);

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 13 ---------------------------------------------------------------- nothing left
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_vo)
    union all select key from app.question_modules where key = 'probe-variant'
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._mvar
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._mvar order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._mvar;
  if v_failed is not null then raise exception 'module variant invariants failed: %', v_failed; end if;
  if v_count <> 13 then raise exception 'module variant invariants: expected 13 rows, got %', v_count; end if;
end $$;

drop table public._mvar;
