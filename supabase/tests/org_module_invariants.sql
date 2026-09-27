-- org_module_invariants.sql — an organisation's standing choice of question sets (0074, D-124).
--
--   * the choice is readable by members and writable only through set_org_module (1)
--   * only a daglig leder may set it, and only for a module the organisation may use (2, 3)
--   * the default is off: with no choice, a new grunnlinje asks no module (4)
--   * on: the planned grunnlinjer take the module, a new grunnlinje takes it, a puls does not,
--     and an open round is never touched (5, 6)
--   * off: it leaves the planned grunnlinjer (7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/org_module_invariants.sql

create unlogged table if not exists public._omi(seq int, name text, expected text, actual text, pass bool);
truncate public._omi;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_dl      uuid;
  v_vo      uuid := '00000000-0000-4000-8000-00000000b501';
  v_mod     uuid;
  v_meas    uuid;
  v_plain   uuid;
  v_chosen  uuid;
  v_puls    uuid;
  v_open    uuid;
  v_rows    jsonb := '[]';
  v_txt     text;
  v_json    jsonb;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
begin
  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;
  select r.id into v_open from app.rounds r where r.org_id = v_org and r.status = 'apen' limit 1;

  -- 1 -------------------------------------------------------------- the grant surface
  select (select relrowsecurity from pg_class where oid = 'app.org_modules'::regclass)::text || ','
         || (select count(*) from pg_policies where schemaname = 'app' and tablename = 'org_modules' and cmd <> 'SELECT')::text || ','
         || has_table_privilege('authenticated', 'app.org_modules', 'insert')::text
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on, no write policy, no insert grant',
    'expected', 'true,0,false', 'actual', v_txt, 'pass', v_txt = 'true,0,false');

  begin
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-valg', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object('id', 'f', 'name', 'F', 'summary', 'S', 'rationale', 'R',
        'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb,
        'items', '[{"id":"PV-FF-1","text":"a","reverse":false,"pulse_eligible":true},{"id":"PV-FF-2","text":"b","reverse":false,"pulse_eligible":true},{"id":"PV-FF-3","text":"c","reverse":false,"pulse_eligible":true}]'::jsonb,
        'action_suggestions', '[]'::jsonb)),
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('d', 64));
    select m.id into v_mod from app.question_modules m where m.key = 'probe-valg';
    insert into auth.users (id, email) values (v_vo, 'vo@omi-test.example');
    insert into app.profiles (id, full_name) values (v_vo, 'VO') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_vo, 'verneombud', true);
    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2098) returning id into v_meas;

    -- 2, 3 ------------------------------------------------------------ who, and which module
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    v_txt := public.set_org_module(v_org, 'probe-valg', true)->>'error';
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    reset role; perform app.module_set_status('probe-valg', '0.0.1', 'published'); set local role authenticated;
    v_txt := v_txt || ',' || coalesce(public.set_org_module(v_org, 'probe-valg', true)->>'error', 'ok');
    begin
      insert into app.org_modules (org_id, module_key, enabled) values (v_org, 'probe-valg', true);
      v_txt := v_txt || ',written';
    exception when insufficient_privilege then v_txt := v_txt || ',refused';
    end;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a draft is not available; a verneombud may not choose; no direct write',
      'expected', 'not_available,not_allowed,refused', 'actual', v_txt, 'pass', v_txt = 'not_available,not_allowed,refused');

    -- 4 -------------------------------------------------------------- off by default
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2098-09-01', '2098-09-12') returning id into v_plain;
    select count(*)::text into v_txt from app.round_modules rm where rm.round_id = v_plain and rm.module_id = v_mod;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'with no choice made, a new grunnlinje asks no module',
      'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

    -- 5 -------------------------------------------------------------- on
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    v_json := public.set_org_module(v_org, 'probe-valg', true);
    reset role;
    select count(*)::text || ',' || coalesce(max(cardinality(rm.item_ids)), 0)::text into v_txt
    from app.round_modules rm where rm.round_id = v_plain and rm.module_id = v_mod;
    v_txt := v_txt || ',' || (select count(*) from app.round_modules rm where rm.round_id = v_open and rm.module_id = v_mod)::text;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'on: the planned grunnlinje asks all three statements; the open round is untouched',
      'expected', '1,3,0', 'actual', v_txt, 'pass', v_txt = '1,3,0');

    -- 6 -------------------------------------------------------------- new rounds
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2098-10-01', '2098-10-12') returning id into v_chosen;
    insert into app.measurements (org_id, kind, year) values (v_org, 'puls', 2098) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2098-11-01', '2098-11-08') returning id into v_puls;
    select (select count(*) from app.round_modules rm where rm.round_id = v_chosen and rm.module_id = v_mod)::text || ','
           || (select count(*) from app.round_modules rm where rm.round_id = v_puls and rm.module_id = v_mod)::text into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a new grunnlinje takes the chosen module; a new puls does not',
      'expected', '1,0', 'actual', v_txt, 'pass', v_txt = '1,0');

    -- 7 -------------------------------------------------------------- off
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    perform public.set_org_module(v_org, 'probe-valg', false);
    select count(*)::text into v_txt from app.org_modules om where om.org_id = v_org and om.module_key = 'probe-valg' and not om.enabled;
    reset role;
    v_txt := v_txt || ',' || (select count(*) from app.round_modules rm where rm.module_id = v_mod)::text;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'off: members read the choice; the module leaves every planned grunnlinje',
      'expected', '1,0', 'actual', v_txt, 'pass', v_txt = '1,0');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe change was rolled back', 'expected', 'true',
    'actual', (not exists (select 1 from app.question_modules where key = 'probe-valg')
               and not exists (select 1 from app.org_modules where module_key = 'probe-valg'))::text,
    'pass', not exists (select 1 from app.question_modules where key = 'probe-valg')
            and not exists (select 1 from app.org_modules where module_key = 'probe-valg'));

  insert into public._omi
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._omi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._omi;
  if v_failed is not null then raise exception 'org module invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'org module invariants: expected 7 rows, got %', v_count; end if;
end $$;

drop table public._omi;
