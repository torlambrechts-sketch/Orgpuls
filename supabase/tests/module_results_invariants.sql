-- module_results_invariants.sql — reading a round's industry module (0070, D-114).
--
--   * app.release_cells decides every core statement cell of every closed round exactly as
--     app.cell_release does (1)
--   * a module factor answered by the same people as a core factor is released for exactly
--     the same groups, with the same index per group and for the house (2, 3)
--   * get_count_item_totals takes one argument, a round: no group, no segment (4)
--   * below k it says nothing, not even how many answered; at k it counts (5, 6)
--   * an open round, or a reader without the house's view, gets nothing (7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_results_invariants.sql

create unlogged table if not exists public._mres(seq int, name text, expected text, actual text, pass bool);
truncate public._mres;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_round  uuid;
  v_open   uuid;
  v_dl     uuid;
  v_mod    uuid;
  v_items  uuid[];
  v_count  uuid;
  v_rows   jsonb := '[]';
  v_txt    text;
  v_n      int;
  v_json   jsonb;
  v_k      int;
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
begin
  -- 1 ------------------------------------------------------------------ the same rule
  select count(*) into v_n
  from app.rounds r
  cross join lateral (
    select cr.factor_key, cr.ordinal, cr.group_id, cr.status from app.cell_release(r.id) cr where cr.ordinal > 0
    except
    select x.factor_key, x.ordinal, rc.group_id, rc.status
    from (
      select a.factor_key, a.ordinal,
             array_agg(g.group_id order by g.n, g.group_id::text) as gs, array_agg(g.n order by g.n, g.group_id::text) as ns
      from (select distinct st.factor_key, st.ordinal from app.statements st) a
      join lateral (
        select resp.group_id, count(distinct an.response_id)::int as n
        from app.answers an join app.responses resp on resp.id = an.response_id
        where resp.round_id = r.id and an.factor_key = a.factor_key and an.ordinal = a.ordinal
        group by resp.group_id
      ) g on true
      group by a.factor_key, a.ordinal
    ) x
    cross join lateral app.release_cells(app.k_threshold(r.org_id),
      (select array_agg(gr.group_id) from app.group_release(r.id) gr),
      (select array_agg(gr.status) from app.group_release(r.id) gr), x.gs, x.ns) rc
  ) diff
  where r.status = 'lukket';
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'release_cells decides every core cell of every closed round as cell_release does',
    'expected', '0 differing cells', 'actual', v_n || ' differing cells', 'pass', v_n = 0);

  select r.id into v_round from app.rounds r join app.responses resp on resp.round_id = r.id
  where r.org_id = v_org and r.status = 'lukket' group by r.id order by count(*) desc limit 1;
  select r.id into v_open from app.rounds r where r.org_id = v_org and r.status = 'apen' limit 1;
  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;
  v_k := app.k_threshold(v_org);

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
      'segments', '[]'::jsonb), repeat('d', 64));
    select m.id into v_mod from app.question_modules m where m.key = 'probe-modul';
    perform app.module_set_status('probe-modul', '0.0.1', 'published');
    select array_agg(i.id order by i.sort) into v_items from app.module_items i where i.module_id = v_mod and i.kind = 'likert5';
    select i.id into v_count from app.module_items i where i.module_id = v_mod and i.kind = 'count';

    alter table app.round_modules disable trigger round_module_ok;
    insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items)
    values (v_org, v_round, v_mod, v_items, true), (v_org, v_open, v_mod, v_items, true);
    alter table app.round_modules enable trigger round_module_ok;

    -- the module's three statements answered by exactly the people, with exactly the values,
    -- that answered ytring's three
    insert into app.module_answers (response_id, item_id, value)
    select an.response_id, v_items[an.ordinal], an.value
    from app.answers an join app.responses resp on resp.id = an.response_id
    where resp.round_id = v_round and an.factor_key = 'ytring';

    -- 2 ---------------------------------------------------------------- same groups released
    select count(*) into v_n from (
      (select cr.group_id, cr.status from app.cell_release(v_round) cr where cr.factor_key = 'ytring' and cr.ordinal = 0
       except
       select mc.group_id, mc.status from app.module_cell_release(v_round) mc where mc.item_id is null)
      union all
      (select mc.group_id, mc.status from app.module_cell_release(v_round) mc where mc.item_id is null
       except
       select cr.group_id, cr.status from app.cell_release(v_round) cr where cr.factor_key = 'ytring' and cr.ordinal = 0)
    ) d;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the module factor is released for exactly the groups ytring is',
      'expected', '0 differences', 'actual', v_n || ' differences', 'pass', v_n = 0);

    -- 3 ---------------------------------------------------------------- same numbers
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_json := public.module_results(v_round);
    select concat_ws('|',
      ((v_json->'modules'->0->'factors'->0->>'index') = (select e->>'index' from jsonb_array_elements(public.results_summary(v_round)->'factors') e where e->>'key' = 'ytring'))::text,
      (select count(*) from jsonb_array_elements(v_json->'modules'->0->'groups') g
        where g->>'status' = 'ok' and (g->'factors'->0->>'index') is distinct from (
          select f->>'index' from jsonb_array_elements(public.results_by_group(v_round)->'groups') cg
          cross join jsonb_array_elements(cg->'factors') f
          where cg->>'group_name' = g->>'group_name' and f->>'key' = 'ytring')))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the house''s index and every released group''s index equal ytring''s',
      'expected', 'true|0', 'actual', v_txt, 'pass', v_txt = 'true|0');

    -- 4 ---------------------------------------------------------------- no group parameter
    select string_agg(format_type(t, null), ',') into v_txt
    from pg_proc p cross join unnest(p.proargtypes) t where p.proname = 'get_count_item_totals';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'get_count_item_totals takes a round and nothing else',
      'expected', 'uuid', 'actual', v_txt, 'pass', v_txt = 'uuid');

    -- 5 ---------------------------------------------------------------- below k: nothing
    insert into app.org_count_answers (round_id, item_id, answer)
    select v_round, v_count, 'ja' from generate_series(1, v_k - 1);
    v_json := public.get_count_item_totals(v_round)->'items'->0;
    v_txt := concat_ws('|', v_json->>'suppressed', coalesce(v_json->>'n_total', '-'), coalesce(v_json->>'n_ja', '-'));
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'k - 1 answers: suppressed, and not even the total is given',
      'expected', 'true|-|-', 'actual', v_txt, 'pass', v_txt = 'true|-|-');

    -- 6 ---------------------------------------------------------------- at k: counted
    insert into app.org_count_answers (round_id, item_id, answer) values (v_round, v_count, 'nei');
    v_json := public.get_count_item_totals(v_round)->'items'->0;
    v_txt := concat_ws('|', v_json->>'suppressed', v_json->>'n_total', v_json->>'n_ja', v_json->>'n_nei', v_json->>'n_vet_ikke');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'k answers: the organisation''s counts',
      'expected', concat_ws('|', 'false', v_k, v_k - 1, 1, 0), 'actual', v_txt,
      'pass', v_txt = concat_ws('|', 'false', v_k, v_k - 1, 1, 0));

    -- 7 ---------------------------------------------------------------- who and when
    v_txt := coalesce(public.get_count_item_totals(v_open)->>'error', 'answered')
      || ',' || coalesce(public.module_results(v_open)->>'error', 'answered');
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || ',' || coalesce(public.get_count_item_totals(v_round)->>'error', 'answered')
      || ',' || coalesce(public.module_results(v_round)->>'error', 'answered');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an open round, or no member, gets nothing',
      'expected', 'not_available,not_available,not_available,not_available', 'actual', v_txt,
      'pass', v_txt = 'not_available,not_available,not_available,not_available');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe change was rolled back', 'expected', 'true',
    'actual', (not exists (select 1 from app.question_modules where key = 'probe-modul')
               and not exists (select 1 from app.org_count_answers where round_id = v_round))::text,
    'pass', not exists (select 1 from app.question_modules where key = 'probe-modul')
               and not exists (select 1 from app.org_count_answers where round_id = v_round));

  insert into public._mres
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._mres order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._mres;
  if v_failed is not null then raise exception 'module results invariants failed: %', v_failed; end if;
  if v_count <> 8 then raise exception 'module results invariants: expected 8 rows, got %', v_count; end if;
end $$;

drop table public._mres;
