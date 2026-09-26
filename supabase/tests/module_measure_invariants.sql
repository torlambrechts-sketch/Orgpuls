-- module_measure_invariants.sql — measures on a module factor, and the puls (0071, D-115).
--
--   * a measure names a core factor or a module factor, never both, never neither (1)
--   * a module measure's re-measure statement must be its own factor's (2)
--   * a new puls asks the re-measure statement of every open module measure, and no other
--     module statement (3)
--   * a closed module measure drops out of the next puls (4)
--   * a client may not change an open round's modules; nobody may once someone answered (5)
--   * nothing written here survives (6)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_measure_invariants.sql

create unlogged table if not exists public._mmi(seq int, name text, expected text, actual text, pass bool);
truncate public._mmi;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_dl    uuid;
  v_mod   uuid;
  v_f1    uuid;
  v_f2    uuid;
  v_i1    uuid;
  v_i2    uuid;
  v_meas  uuid;
  v_m1    uuid;
  v_round uuid;
  v_open  uuid;
  v_rows  jsonb := '[]';
  v_txt   text;
begin
  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;
  select r.id into v_open from app.rounds r where r.org_id = v_org and r.status = 'apen' limit 1;

  begin
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-modul', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 2,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', jsonb_build_array(
        jsonb_build_object('id', 'en', 'name', 'En', 'summary', 'S', 'rationale', 'R', 'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb,
          'items', '[{"id":"PR-EN-1","text":"a","reverse":false,"pulse_eligible":true},{"id":"PR-EN-2","text":"b","reverse":false,"pulse_eligible":true},{"id":"PR-EN-3","text":"c","reverse":false,"pulse_eligible":true}]'::jsonb,
          'action_suggestions', '[{"type":"rutine","title":"T","description":"D","remeasure_item":"PR-EN-2"}]'::jsonb),
        jsonb_build_object('id', 'to', 'name', 'To', 'summary', 'S', 'rationale', 'R', 'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb,
          'items', '[{"id":"PR-TO-1","text":"d","reverse":false,"pulse_eligible":true},{"id":"PR-TO-2","text":"e","reverse":false,"pulse_eligible":true},{"id":"PR-TO-3","text":"f","reverse":false,"pulse_eligible":true}]'::jsonb,
          'action_suggestions', '[{"type":"rutine","title":"T","description":"D","remeasure_item":"PR-TO-1"}]'::jsonb)),
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('e', 64));
    select m.id into v_mod from app.question_modules m where m.key = 'probe-modul';
    perform app.module_set_status('probe-modul', '0.0.1', 'published');
    select f.id into v_f1 from app.module_factors f where f.module_id = v_mod and f.key = 'en';
    select f.id into v_f2 from app.module_factors f where f.module_id = v_mod and f.key = 'to';
    select i.id into v_i1 from app.module_items i where i.module_id = v_mod and i.code = 'PR-EN-2';
    select i.id into v_i2 from app.module_items i where i.module_id = v_mod and i.code = 'PR-TO-1';

    -- 1 -------------------------------------------------------------- one factor or the other
    v_txt := '';
    begin
      insert into app.measures (org_id, factor_key, module_factor_id, remeasure_item_id, title)
      values (v_org, 'ytring', v_f1, v_i1, 'Begge');
      v_txt := 'both';
    exception when check_violation then v_txt := 'refused';
    end;
    begin
      insert into app.measures (org_id, factor_key, module_factor_id, title) values (v_org, null, null, 'Ingen');
      v_txt := v_txt || ',neither';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a measure names exactly one factor, core or module',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    -- 2 -------------------------------------------------------------- its own statement
    begin
      insert into app.measures (org_id, module_factor_id, remeasure_item_id, title) values (v_org, v_f1, v_i2, 'Feil påstand');
      v_txt := 'accepted';
    exception when check_violation then v_txt := 'refused';
    end;
    insert into app.measures (org_id, module_factor_id, remeasure_item_id, title) values (v_org, v_f1, v_i1, 'Stopp og meld')
      returning id into v_m1;
    v_txt := v_txt || ',' || (v_m1 is not null)::text;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a module measure is re-measured by a statement of its own factor',
      'expected', 'refused,true', 'actual', v_txt, 'pass', v_txt = 'refused,true');

    -- 3 -------------------------------------------------------------- the puls asks it
    insert into app.measurements (org_id, kind, year) values (v_org, 'puls', 2099) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2099-03-01', '2099-03-08') returning id into v_round;
    select coalesce((select array_to_string(rm.item_ids, ',') from app.round_modules rm where rm.round_id = v_round and rm.module_id = v_mod), '-')
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a new puls asks the open module measure''s statement, and only it',
      'expected', v_i1::text, 'actual', v_txt, 'pass', v_txt = v_i1::text);

    -- 4 -------------------------------------------------------------- closed, it drops out
    update app.measures set step = 'effekt_malt' where id = v_m1;
    update app.measures set step = 'lukket' where id = v_m1;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2099-06-01', '2099-06-08') returning id into v_round;
    select count(*)::text into v_txt from app.round_modules rm where rm.round_id = v_round and rm.module_id = v_mod;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'with its measure closed, the module factor drops out of the next puls',
      'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

    -- 5 -------------------------------------------------------------- an open round's modules
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal1"}', v_dl), true);
    set local role authenticated;
    begin
      insert into app.round_modules (org_id, round_id, module_id, item_ids) values (v_org, v_open, v_mod, array[v_i1]);
      v_txt := 'client added';
    exception when restrict_violation then v_txt := 'refused';
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    begin
      insert into app.round_modules (org_id, round_id, module_id, item_ids)
      select v_org, r.id, v_mod, array[v_i1] from app.rounds r
      where r.org_id = v_org and exists (select 1 from app.responses x where x.round_id = r.id) limit 1;
      v_txt := v_txt || ',answered round changed';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a client cannot add a module to an open round; nobody to an answered one',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every probe change was rolled back', 'expected', 'true',
    'actual', (not exists (select 1 from app.question_modules where key = 'probe-modul')
               and not exists (select 1 from app.measures where module_factor_id is not null and title = 'Stopp og meld'))::text,
    'pass', not exists (select 1 from app.question_modules where key = 'probe-modul')
               and not exists (select 1 from app.measures where module_factor_id is not null and title = 'Stopp og meld'));

  insert into public._mmi
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._mmi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._mmi;
  if v_failed is not null then raise exception 'module measure invariants failed: %', v_failed; end if;
  if v_count <> 6 then raise exception 'module measure invariants: expected 6 rows, got %', v_count; end if;
end $$;

drop table public._mmi;
