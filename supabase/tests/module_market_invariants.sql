-- module_market_invariants.sql — a module is offered in its market (0220, D-260).
--
-- The industry modules state Norwegian law. An organisation in another market is not offered one,
-- by any path. What must hold:
--   * module_markets is readable by a signed-in client and writable by none (1)
--   * a key with no market is Norway's; a key with markets is offered in those alone (2)
--   * the Norwegian modules are offered in Norway only (3)
--   * a Norwegian module is not usable by an organisation in Sweden: set_org_module refuses it, the
--     screens are not offered it, a round cannot carry it, and a pilot does not change that (4–7)
--   * the same module stays usable in Norway (4, 5)
--   * a module given Sweden's market is usable in Sweden and not in Norway (8)
--   * org_module_keys answers members only (9)
--   * nothing written here survives (10)
--   * Sweden's own module, arbetstid-och-aterhamtning, is offered in Sweden alone (11, 0221)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_market_invariants.sql

create unlogged table if not exists public._mmi(seq int, name text, expected text, actual text, pass bool);
truncate public._mmi;

do $$
declare
  v_no      uuid := '00000000-0000-4000-8000-000000000001';
  v_no_dl   uuid;
  v_se      uuid;
  v_se_dl   uuid := '00000000-0000-4000-8000-00000000c601';
  v_mod     uuid;
  v_draft   uuid;
  v_meas    uuid;
  v_round   uuid;
  v_rows    jsonb := '[]';
  v_txt     text;
  v_json    jsonb;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
  probe     constant jsonb := jsonb_build_object(
    'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
    'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
    'sources', '[]'::jsonb, 'count_items', '[]'::jsonb, 'segments', '[]'::jsonb);
  factor    constant text := '[{"id":"f","name":"F","summary":"S","rationale":"R","rationale_sources":[],"legal_basis":[],"action_suggestions":[],"items":[{"id":"%1$s-FF-1","text":"a","reverse":false,"pulse_eligible":true},{"id":"%1$s-FF-2","text":"b","reverse":false,"pulse_eligible":true},{"id":"%1$s-FF-3","text":"c","reverse":false,"pulse_eligible":true}]}]';
begin
  select m.user_id into v_no_dl from app.memberships m where m.org_id = v_no and m.role = 'daglig_leder' and m.active limit 1;

  -- 1 -------------------------------------------------------------- the grant surface
  select (select relrowsecurity from pg_class where oid = 'app.module_markets'::regclass)::text || ','
         || (select string_agg(p.cmd || '/' || array_to_string(p.roles, '+'), ',') from pg_policies p
             where p.schemaname = 'app' and p.tablename = 'module_markets') || ','
         || has_table_privilege('authenticated', 'app.module_markets', 'select')::text || ','
         || (has_table_privilege('authenticated', 'app.module_markets', 'insert')
             or has_table_privilege('authenticated', 'app.module_markets', 'update')
             or has_table_privilege('authenticated', 'app.module_markets', 'delete')
             or has_table_privilege('anon', 'app.module_markets', 'select'))::text
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'module_markets has RLS and one read policy; a signed-in client reads it, nobody writes it, anon sees nothing',
    'expected', 'true,SELECT/authenticated,true,false', 'actual', v_txt, 'pass', v_txt = 'true,SELECT/authenticated,true,false');

  -- 3 -------------------------------------------------------------- the Norwegian modules
  select string_agg(k || '=' || app.module_market_ok(k, 'no')::text || '/' || app.module_market_ok(k, 'se')::text, ',' order by k)
    into v_txt
  from unnest(array['barnehage-og-skole', 'bygg-og-anlegg', 'handel', 'helse-og-omsorg', 'kunnskap-og-kontor']) k;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the five Norwegian industry modules are offered in Norway and not in Sweden',
    'expected', 'barnehage-og-skole=true/false,bygg-og-anlegg=true/false,handel=true/false,helse-og-omsorg=true/false,kunnskap-og-kontor=true/false',
    'actual', v_txt,
    'pass', v_txt = 'barnehage-og-skole=true/false,bygg-og-anlegg=true/false,handel=true/false,helse-og-omsorg=true/false,kunnskap-og-kontor=true/false');

  -- 11 ------------------------------------------------------------- Sweden's own module (0221)
  v_txt := app.module_market_ok('arbetstid-och-aterhamtning', 'se')::text || ',' || app.module_market_ok('arbetstid-och-aterhamtning', 'no')::text;
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'arbetstid-och-aterhamtning, the working-time module on AFS 2023:2, is offered in Sweden and not in Norway',
    'expected', 'true,false', 'actual', v_txt, 'pass', v_txt = 'true,false');

  begin
    -- a published module with no market (Norway's), and an organisation in Sweden
    perform app.module_seed(probe || jsonb_build_object('module_id', 'probe-marked', 'factors', format(factor, 'PM')::jsonb), repeat('e', 64));
    perform app.module_set_status('probe-marked', '0.0.1', 'published');
    select m.id into v_mod from app.question_modules m where m.key = 'probe-marked';
    insert into auth.users (id, email) values (v_se_dl, 'dl@mmi-test.example');
    perform set_config('request.jwt.claims', format(claims, v_se_dl), true);
    v_json := public.create_organisation('Modulprov AB', '5566778899', 12, 'Tre', 'se');
    perform set_config('request.jwt.claims', '', true);
    select o.id into v_se from app.organizations o where o.org_number = '5566778899' and o.market = 'se';
    if v_se is null then raise exception 'probe: the Swedish organisation was not created: %', v_json; end if;

    -- 2 ------------------------------------------------------------ the rule
    insert into app.module_markets (module_key, market) values ('probe-se', 'se'), ('probe-both', 'no'), ('probe-both', 'se');
    v_txt := concat_ws(',',
      app.module_market_ok('probe-marked', 'no'), app.module_market_ok('probe-marked', 'se'),
      app.module_market_ok('probe-se', 'no'), app.module_market_ok('probe-se', 'se'),
      app.module_market_ok('probe-both', 'no'), app.module_market_ok('probe-both', 'se'));
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'no market: Norway alone; Sweden''s market: Sweden alone; both: both',
      'expected', 't,f,f,t,t,t', 'actual', v_txt, 'pass', v_txt = 't,f,f,t,t,t');

    -- 4 ------------------------------------------------------------ the gate
    v_txt := app.module_usable(v_mod, v_se)::text || ',' || app.module_usable(v_mod, v_no)::text;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a Norwegian module is usable by an organisation in Norway and not by one in Sweden',
      'expected', 'false,true', 'actual', v_txt, 'pass', v_txt = 'false,true');

    -- 5 ------------------------------------------------------------ the one write path, and the screens
    perform set_config('request.jwt.claims', format(claims, v_se_dl), true);
    set local role authenticated;
    v_txt := coalesce(public.set_org_module(v_se, 'probe-marked', true)->>'error', 'ok') || ','
          || ('probe-marked' = any (public.org_module_keys(v_se)))::text || ','
          || (select count(*) from unnest(public.org_module_keys(v_se)) k
              where k in ('barnehage-og-skole', 'bygg-og-anlegg', 'handel', 'helse-og-omsorg', 'kunnskap-og-kontor'))::text;
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_no_dl), true);
    set local role authenticated;
    v_txt := v_txt || ';' || coalesce(public.set_org_module(v_no, 'probe-marked', true)->>'error', 'ok') || ','
          || ('probe-marked' = any (public.org_module_keys(v_no)))::text;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'Sweden: set_org_module says not_available and the screens are offered no Norwegian module; Norway: on, and offered',
      'expected', 'not_available,false,0;ok,true', 'actual', v_txt, 'pass', v_txt = 'not_available,false,0;ok,true');

    -- 6 ------------------------------------------------------------ a round cannot carry it
    insert into app.measurements (org_id, kind, year) values (v_se, 'grunnlinje', 2098) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_se, v_meas, 'planlagt', '2098-09-01', '2098-09-12') returning id into v_round;
    begin
      perform app.add_round_module(v_se, v_round, v_mod);
      v_txt := 'ACCEPTED';
    exception when check_violation then v_txt := 'check_violation';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a planned round of an organisation in Sweden cannot carry a Norwegian module, even from the database''s own functions',
      'expected', 'check_violation', 'actual', v_txt, 'pass', v_txt = 'check_violation');

    -- 7 ------------------------------------------------------------ a pilot does not open it
    perform app.module_seed(probe || jsonb_build_object('module_id', 'probe-pilot', 'factors', format(factor, 'PP')::jsonb), repeat('f', 64));
    select m.id into v_draft from app.question_modules m where m.key = 'probe-pilot';
    insert into app.module_pilots (module_id, org_id) values (v_draft, v_se);
    v_txt := app.module_usable(v_draft, v_se)::text;
    insert into app.module_markets (module_key, market) values ('probe-pilot', 'se');
    v_txt := v_txt || ',' || app.module_usable(v_draft, v_se)::text;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a draft piloted in Sweden is usable there only once it names Sweden''s market',
      'expected', 'false,true', 'actual', v_txt, 'pass', v_txt = 'false,true');

    -- 8 ------------------------------------------------------------ a module for Sweden
    insert into app.module_markets (module_key, market) values ('probe-marked', 'se');
    v_txt := app.module_usable(v_mod, v_se)::text || ',' || app.module_usable(v_mod, v_no)::text;
    perform set_config('request.jwt.claims', format(claims, v_se_dl), true);
    set local role authenticated;
    v_txt := v_txt || ',' || coalesce(public.set_org_module(v_se, 'probe-marked', true)->>'error', 'ok') || ','
          || ('probe-marked' = any (public.org_module_keys(v_se)))::text;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || ',' || (select count(*) from app.round_modules rm where rm.round_id = v_round and rm.module_id = v_mod)::text;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'given Sweden''s market, the module is usable there and not in Norway; switched on, the planned round takes it',
      'expected', 'true,false,ok,true,1', 'actual', v_txt, 'pass', v_txt = 'true,false,ok,true,1');

    -- 9 ------------------------------------------------------------ members only
    perform set_config('request.jwt.claims', format(claims, v_no_dl), true);
    set local role authenticated;
    v_txt := cardinality(public.org_module_keys(v_se))::text;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'org_module_keys tells a non-member nothing',
      'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 10 ------------------------------------------------------------- nothing left
  v_txt := (not exists (select 1 from app.question_modules where key in ('probe-marked', 'probe-pilot'))
            and not exists (select 1 from app.module_markets where module_key like 'probe-%')
            and not exists (select 1 from app.organizations where org_number = '5566778899')
            and not exists (select 1 from auth.users where id = v_se_dl))::text;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._mmi
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._mmi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._mmi;
  if v_failed is not null then raise exception 'module market invariants failed: %', v_failed; end if;
  if v_count <> 11 then raise exception 'module market invariants: expected 11 rows, got %', v_count; end if;
end $$;

drop table public._mmi;
