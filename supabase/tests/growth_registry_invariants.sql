-- growth_registry_invariants.sql — Sentral › Growth G2: the report's registry, the funnel and the lead
-- math (0142, D-183), proved against the live schema.
--
--   * every G2 table: RLS on, no policy, no grant to anon, authenticated or service_role; the public
--     functions are for signed-in callers only, never anon (1)
--   * the reads: the Growth roles with a second factor only (support refused, aal1 refused); each of
--     the seven views answers, an unknown view is refused, and every read is audited (2)
--   * the writes and the exports refuse support and a missing second factor, and change nothing (3)
--   * a board item's status and owner: the change is audited with what it was and what it became; a
--     new owner outside the Growth roles, an inactive one and «live» are refused; no change, no audit;
--     an owner deactivated since stays through a status change (4)
--   * «Live» is derived, never stored: the column refuses it, an item with a live check that holds is
--     live and falls back to its stored status without one; the compound events and årshjul items
--     carry no partial check (5)
--   * a rule is live only while what implements it exists and is enabled: a missing function, a
--     disabled trigger, the lifecycle switched off, and «none» are off (6)
--   * the plan: no start date → no week and every block planned; a start ahead → no week yet; this
--     Monday → week 1; week 4 → gates open (a gate unmeasured), in progress, next, planned and the
--     current block's first gate; a past block is done only once every gate is met; past the end with
--     gates unmeasured → none done; a start that is not a Monday is refused (7)
--   * PQL has no count; a stage naming an event the catalogue does not have is refused; a source's
--     «now» is null without a channel and counts the month's trials by first touch; the card's «now»
--     is every trial of the month, never a demo (8)
--   * an experiment's status change is audited; an unknown status refused; the backlog highest ICE
--     first (9)
--   * «Decide» records the answer, who gave it and when, audited with what it replaced; an empty
--     answer, an unknown decision refused; the table refuses a value without a time (10)
--   * the exports: each kind answers and is audited as growth.export; an unknown kind refused; the
--     board's statuses are the derived ones the page shows (11)
--   * the Event catalogue page's read says when the firewall was computed and which funnel stages
--     read each event (12)
--   * the registry is honest as seeded: every rule without an implementation names none, every funnel
--     event is in the catalogue, every owner is a Growth admin, every address is an admin route (13)
--   * nothing written here survives (14)
--   * the plan's gates read live: consent coverage unmet with an uncovered marketing contact and
--     unmeasured with none; double opt-in subscribers by the latest record, confirmed only (15)
--   * every funnel measure on events built for it in a month long past: the 30-minute session split,
--     Signup needing the Brønnøysund lookup, Setup's fifth employee, Value's two events, activation
--     inside vs outside 14 days, a second cycle only after a first send and within six months, an
--     upgrade but not a downgrade (16)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/growth_registry_invariants.sql

create unlogged table if not exists public._grg(seq int, name text, expected text, actual text, pass bool);
truncate public._grg;

do $$
declare
  v_mkt   uuid := '00000000-0000-4000-8000-0000000e2b01';
  v_ana   uuid := '00000000-0000-4000-8000-0000000e2b02';
  v_sup   uuid := '00000000-0000-4000-8000-0000000e2b03';
  v_off   uuid := '00000000-0000-4000-8000-0000000e2b04';
  v_org   uuid := '00000000-0000-4000-8000-0000000e2a01';
  v_demo  uuid := '00000000-0000-4000-8000-0000000e2a02';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  v_json  jsonb;
  v_txt   text;
  v_n     bigint;
  v_rows  jsonb := '[]';
  v_exp7  text;
  v_a     uuid := '00000000-0000-4000-8000-0000000e2a11';
  v_b     uuid := '00000000-0000-4000-8000-0000000e2a12';
  v_c     uuid := '00000000-0000-4000-8000-0000000e2a13';
  v_ct    uuid := '00000000-0000-4000-8000-0000000e2c01';
  v_ct2   uuid := '00000000-0000-4000-8000-0000000e2c02';
  v_x     numeric;
  -- a month long past, so nothing but the probes below is in it
  w_from  timestamptz := timestamptz '2020-03-01 00:00 Europe/Oslo';
  w_to    timestamptz := timestamptz '2020-04-01 00:00 Europe/Oslo';
  v_tables constant text[] := array['growth_settings', 'growth_tiers', 'growth_items', 'growth_plan_blocks', 'growth_plan_gates',
    'growth_rules', 'growth_experiments', 'growth_guardrails', 'growth_risks', 'growth_decisions', 'growth_funnel_stages',
    'growth_lead_sources', 'growth_assumptions', 'growth_benchmarks', 'growth_coverage', 'growth_recommendations', 'growth_cuts'];
  v_fns constant text[] := array['public.admin_growth_view(text)', 'public.admin_growth_export(text)',
    'public.admin_growth_set_item(text,text,uuid)', 'public.admin_growth_set_experiment(text,text)', 'public.admin_growth_decide(integer,text,text)'];
  v_from timestamptz := date_trunc('month', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
  v_to timestamptz := (date_trunc('month', now() at time zone 'Europe/Oslo') + interval '1 month') at time zone 'Europe/Oslo';
begin
  -- 1 ---------------------------------------------------------------- closed to clients
  select concat_ws('|',
    (select count(*) from unnest(v_tables) t join pg_class c on c.relnamespace = 'app'::regnamespace and c.relname = t
     where c.relrowsecurity
       and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename = t)
       and not exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r
                       where has_table_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                          or has_any_column_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))),
    (select count(*) from unnest(v_fns) f where has_function_privilege('authenticated', f::regprocedure, 'execute')
                                             and not has_function_privilege('anon', f::regprocedure, 'execute')),
    (select count(*) from pg_proc p where p.pronamespace = 'app'::regnamespace and p.proname ~ '^growth_(live|impl_live|funnel_count|lead_now|trials|gate_value|gate_state|plan_status|plan_week|item_json|plan_json|admin|owner_ok|funnel_events_known)$'
       and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'every G2 table: RLS, no policy, no client or service grant; the public functions for signed-in callers only; the app helpers for no client',
    'expected', '17|5|0', 'actual', v_txt, 'pass', v_txt = '17|5|0');

  begin
    insert into auth.users (id, email) values (v_mkt, 'mkt@grg-probe.no'), (v_ana, 'ana@grg-probe.no'),
      (v_sup, 'sup@grg-probe.no'), (v_off, 'off@grg-probe.no');
    insert into app.platform_admins (user_id, role, active) values (v_mkt, 'marketing', true), (v_ana, 'analyst', true),
      (v_sup, 'support', true), (v_off, 'marketing', false);

    -- 2 -------------------------------------------------------------- the reads
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := public.admin_growth_view('board')->>'error';
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal1'), true);
    v_txt := v_txt || '|' || (public.admin_growth_view('board')->>'error');
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := concat_ws('|', v_txt,
      (select count(*) from unnest(array['board', 'plan', 'funnel', 'rules', 'experiments', 'risks', 'coverage']) v
       where (public.admin_growth_view(v)->>'ok')::boolean),
      public.admin_growth_view('secrets')->>'error');
    -- a separate statement: the audit rows the reads wrote are visible only to the next one
    v_txt := concat_ws('|', v_txt, (select count(distinct action) from app.admin_audit where admin_id = v_ana and action ~ '^growth\.[a-z]+_view$'));
    v_json := public.admin_growth_view('board');
    v_txt := concat_ws('|', v_txt, jsonb_array_length(v_json->'tiers'), jsonb_array_length(v_json->'items'),
      exists (select 1 from jsonb_array_elements(v_json->'admins') a where (a->>'id')::uuid = v_mkt),
      exists (select 1 from jsonb_array_elements(v_json->'admins') a where (a->>'id')::uuid in (v_sup, v_off)));
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the reads: support and aal1 refused; the analyst reads all seven views, an unknown one is refused, each audited; the owners offered are the active Growth admins',
      'expected', 'not_allowed|not_allowed|7|invalid|7|5|19|t|f', 'actual', v_txt, 'pass', v_txt = 'not_allowed|not_allowed|7|invalid|7|5|19|t|f');

    -- 3 -------------------------------------------------------------- the writes refuse the others
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := concat_ws('|', public.admin_growth_set_item('seo', 'planned', null)->>'error',
      public.admin_growth_set_experiment('E1', 'running')->>'error',
      public.admin_growth_decide(1, 'Yes', 'Counsel')->>'error',
      public.admin_growth_export('board')->>'error');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal1'), true);
    v_txt := concat_ws('|', v_txt, public.admin_growth_set_item('seo', 'planned', null)->>'error',
      public.admin_growth_decide(1, 'Yes', 'Counsel')->>'error');
    perform set_config('request.jwt.claims', '', true);
    v_txt := concat_ws('|', v_txt, (select status from app.growth_items where key = 'seo'),
      (select status from app.growth_experiments where key = 'E1'),
      (select decided_value is null from app.growth_decisions where sort = 1),
      (select count(*) from app.admin_audit where admin_id in (v_sup, v_mkt)));
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the writes and the export refuse support and a missing second factor, and nothing changes or is logged',
      'expected', 'not_allowed|not_allowed|not_allowed|not_allowed|not_allowed|not_allowed|building|queued|t|0', 'actual', v_txt,
      'pass', v_txt = 'not_allowed|not_allowed|not_allowed|not_allowed|not_allowed|not_allowed|building|queued|t|0');

    -- 4 -------------------------------------------------------------- a board item's status and owner
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := concat_ws('|',
      public.admin_growth_set_item('seo', 'planned', v_ana)->>'changed',
      public.admin_growth_set_item('seo', 'planned', v_ana)->>'changed',
      public.admin_growth_set_item('seo', 'live', null)->>'error',
      public.admin_growth_set_item('seo', 'building', v_sup)->>'error',
      public.admin_growth_set_item('seo', 'building', v_off)->>'error',
      public.admin_growth_set_item('nope', 'building', null)->>'error');
    perform set_config('request.jwt.claims', '', true);
    select concat_ws('|', v_txt, i.status, i.owner = v_ana,
      (select count(*) from app.admin_audit a where a.admin_id = v_mkt and a.action = 'growth.item_update'),
      (select a.detail #>> '{status,from}' || '>' || (a.detail #>> '{status,to}') || '>' || (a.detail #>> '{owner,to}')::uuid::text
       from app.admin_audit a where a.admin_id = v_mkt and a.action = 'growth.item_update' and a.target_id = 'seo'
       order by a.id desc limit 1) = 'building>planned>' || v_ana)
    into v_txt from app.growth_items i where i.key = 'seo';
    -- the owner is deactivated afterwards: a status change that keeps them is saved (never a silent
    -- clear), while naming them anew on another item is still refused
    update app.platform_admins set active = false where user_id = v_ana;
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := concat_ws('|', v_txt, public.admin_growth_set_item('seo', 'building', v_ana)->>'changed',
      public.admin_growth_set_item('tools', 'building', v_ana)->>'error');
    perform set_config('request.jwt.claims', '', true);
    update app.platform_admins set active = true where user_id = v_ana;
    v_txt := concat_ws('|', v_txt, (select status || '>' || (owner = v_ana) from app.growth_items where key = 'seo'));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'an item''s status and owner change once, audited with from and to; «live», a support or inactive new owner and an unknown item are refused; an owner deactivated since stays through a status change',
      'expected', 'true|false|invalid_status|invalid_owner|invalid_owner|not_found|planned|t|1|t|true|invalid_owner|building>true', 'actual', v_txt,
      'pass', v_txt = 'true|false|invalid_status|invalid_owner|invalid_owner|not_found|planned|t|1|t|true|invalid_owner|building>true');

    -- 5 -------------------------------------------------------------- «live» is derived
    begin
      update app.growth_items set status = 'live' where key = 'deliv';
      v_txt := 'stored';
    exception when check_violation then v_txt := 'refused';
    end;
    update app.growth_items set live_check = 'consent_ledger' where key = 'deliv';
    v_txt := concat_ws('|', v_txt,
      (select app.growth_item_json(i)->>'status' from app.growth_items i where i.key = 'deliv') = case when exists (select 1 from app.consent_records) then 'live' else 'building' end);
    update app.growth_items set live_check = null where key = 'deliv';
    v_txt := concat_ws('|', v_txt,
      (select app.growth_item_json(i)->>'status' from app.growth_items i where i.key = 'deliv'),
      (select bool_and((app.growth_item_json(i)->>'status' = 'live') = (i.live_check is not null and app.growth_live(i.live_check))) from app.growth_items i),
      (select string_agg(i.key || ':' || coalesce(i.live_check, '-') || ':' || (app.growth_item_json(i)->>'status'), ',' order by i.key)
       from app.growth_items i where i.key in ('events', 'arshjul')),
      app.growth_live('event_stream'));
    begin
      update app.growth_items set live_check = 'event_stream' where key = 'events';
      v_txt := v_txt || '|stored';
    exception when check_violation then v_txt := v_txt || '|refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', '«live» is never stored; an item is live exactly while its live check holds, and shows its stored status otherwise; the compound events and årshjul items carry no partial check',
      'expected', 'refused|t|building|t|arshjul:-:building,events:-:building|f|refused', 'actual', v_txt,
      'pass', v_txt = 'refused|t|building|t|arshjul:-:building,events:-:building|f|refused');

    -- 6 -------------------------------------------------------------- a rule's state
    v_txt := concat_ws('|',
      app.growth_impl_live('function', 'public.record_crm_event'),
      app.growth_impl_live('function', 'public.no_such_function'),
      app.growth_impl_live('trigger', 'growth_funnel_events_known'));
    alter table app.growth_funnel_stages disable trigger growth_funnel_events_known;
    v_txt := concat_ws('|', v_txt, app.growth_impl_live('trigger', 'growth_funnel_events_known'));
    alter table app.growth_funnel_stages enable trigger growth_funnel_events_known;
    update app.lifecycle_settings set enabled = false;
    v_txt := concat_ws('|', v_txt, app.growth_impl_live('lifecycle', 'setup_help'), app.growth_impl_live('lifecycle', 'no_such_step'),
      app.growth_impl_live('none', null));
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_growth_view('rules');
    perform set_config('request.jwt.claims', '', true);
    v_txt := concat_ws('|', v_txt,
      (select r->>'live' from jsonb_array_elements(v_json->'rules') r where r->>'key' = 'R1'),
      (select bool_and((r->>'live')::boolean = app.growth_impl_live(r->>'impl_kind', r->>'impl_ref')) from jsonb_array_elements(v_json->'rules') r),
      (select bool_and(not (r->>'live')::boolean) from jsonb_array_elements(v_json->'rules') r where r->>'impl_kind' = 'none'));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a rule is live only while its function, trigger, job or lifecycle mail exists and is enabled; nothing named is off',
      'expected', 't|f|t|f|f|f|f|false|t|t', 'actual', v_txt,
      'pass', v_txt = 't|f|t|f|f|f|f|false|t|t');

    -- 7 -------------------------------------------------------------- the plan
    v_exp7 := 'null|13|planned|null|planned|null|1|4|gates_open,in_progress,next,planned,planned,planned|Activation baseline measured|4|unmeasured,'
              || app.growth_gate_state('consent_coverage', 100) || ',unmeasured,unmeasured|done|gates_open|gates_open|refused';
    update app.growth_settings set plan_start = null;
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_growth_view('plan');
    v_txt := concat_ws('|', coalesce(v_json #>> '{plan,week}', 'null'), v_json #>> '{plan,weeks}',
      (select string_agg(DISTINCT b->>'status', ',') from jsonb_array_elements(v_json->'blocks') b));
    -- a start next Monday: no week yet (not week 1), every block planned; this Monday is week 1
    update app.growth_settings set plan_start = date_trunc('week', now() at time zone 'Europe/Oslo')::date + 7;
    v_json := public.admin_growth_view('plan');
    v_txt := concat_ws('|', v_txt, coalesce(v_json #>> '{plan,week}', 'null'),
      (select string_agg(DISTINCT b->>'status', ',') from jsonb_array_elements(v_json->'blocks') b),
      coalesce(public.admin_growth_view('board') #>> '{plan,week}', 'null'));
    update app.growth_settings set plan_start = date_trunc('week', now() at time zone 'Europe/Oslo')::date;
    v_txt := concat_ws('|', v_txt, public.admin_growth_view('plan') #>> '{plan,week}');
    -- week 4: weeks 1–2 are past, but a gate is not measured (DMARC), so the block is «gates open»
    update app.growth_settings set plan_start = date_trunc('week', now() at time zone 'Europe/Oslo')::date - 21;
    v_json := public.admin_growth_view('plan');
    v_txt := concat_ws('|', v_txt, v_json #>> '{plan,week}',
      (select string_agg(b->>'status', ',' order by (b->>'from')::int) from jsonb_array_elements(v_json->'blocks') b),
      v_json #>> '{plan,gate}', public.admin_growth_view('board') #>> '{plan,week}',
      (select string_agg(g->>'state', ',') from jsonb_array_elements(v_json->'blocks') b, jsonb_array_elements(b->'gates') g where b->>'key' = 'w01_02'));
    -- only when every gate of a past block is measured and met is it done: the first block's gates
    -- become one the schema reads (a trial in the last 30 days), met, then set out of reach
    perform set_config('request.jwt.claims', '', true);
    delete from app.growth_plan_gates where block = 'w01_02' and sort <> 2;
    update app.growth_plan_gates set measure = 'trials_30d', target = 1 where block = 'w01_02';
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Plan AS', '999001423', 12);
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := concat_ws('|', v_txt, (select b->>'status' from jsonb_array_elements(public.admin_growth_view('plan')->'blocks') b where b->>'key' = 'w01_02'));
    perform set_config('request.jwt.claims', '', true);
    update app.growth_plan_gates set target = 1000000 where block = 'w01_02';
    delete from app.organizations where id = v_org;
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := concat_ws('|', v_txt, (select b->>'status' from jsonb_array_elements(public.admin_growth_view('plan')->'blocks') b where b->>'key' = 'w01_02'));
    update app.growth_settings set plan_start = date_trunc('week', now() at time zone 'Europe/Oslo')::date - 7 * 20;
    v_json := public.admin_growth_view('plan');
    perform set_config('request.jwt.claims', '', true);
    -- past the end: every block has a gate nothing measures yet, so none is done
    v_txt := concat_ws('|', v_txt, (select string_agg(DISTINCT b->>'status', ',') from jsonb_array_elements(v_json->'blocks') b));
    begin
      update app.growth_settings set plan_start = date_trunc('week', now())::date + 2;
      v_txt := v_txt || '|stored';
    exception when check_violation then v_txt := v_txt || '|refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the plan: no start, no week, all planned; a start ahead is no week yet, this Monday week 1; in week 4 weeks 1–2 are «gates open» with a gate unmeasured, done only once every gate is met; past the end none is done while gates are unmeasured; a start that is not a Monday refused',
      'expected', v_exp7, 'actual', v_txt, 'pass', v_txt = v_exp7);

    -- 8 -------------------------------------------------------------- the funnel and the lead math
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_growth_view('funnel');
    v_n := (select (s->>'n')::bigint from jsonb_array_elements(v_json->'stages') s where s->>'key' = 'signup');
    v_txt := concat_ws('|', (select coalesce(s->>'n', 'null') from jsonb_array_elements(v_json->'stages') s where s->>'key' = 'pql'),
      (select string_agg(coalesce(l->>'now', 'null'), ',' order by l->>'key') from jsonb_array_elements(v_json->'lead') l where l->>'key' in ('loop', 'partners', 'brreg')));
    v_txt := concat_ws('|', v_txt, (v_json->>'trials')::bigint = app.growth_trials(v_from, v_to));
    perform set_config('request.jwt.claims', '', true);
    select app.growth_lead_now(array['organic', 'ai'], v_from, v_to) into v_n;
    select app.growth_trials(v_from, v_to) into v_x;
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Trakt AS', '999001421', 12), (v_demo, 'Demo Trakt AS', '999001422', 12);
    insert into app.demo_orgs (org_id, kind) values (v_demo, 'sandbox');
    insert into app.org_attribution (org_id, channel) values (v_org, 'organic'), (v_demo, 'organic');
    -- the card's «now» (every trial, attributed or not) grows by the one trial, never by the demo;
    -- a trial with no channel of a source's still counts there
    insert into app.organizations (id, name, org_number, employee_count) values (v_a, 'Uten kanal AS', '999001424', 12);
    v_txt := concat_ws('|', v_txt, app.growth_lead_now(array['organic', 'ai'], v_from, v_to) - v_n,
      app.growth_trials(v_from, v_to) - v_x,
      exists (select 1 from app.growth_events g where g.org_id = v_org and g.name = 'org.created'),
      exists (select 1 from app.growth_events g where g.org_id = v_demo));
    delete from app.organizations where id = v_a;
    begin
      insert into app.growth_funnel_stages (key, sort, stage, event_label, events, definition, measure)
      values ('probe', 99, 'Probe', 'x', '{survey.exported}', 'x', 'any');
      v_txt := v_txt || '|stored';
    exception when check_violation then v_txt := v_txt || '|refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'PQL has no count, an unknown event is refused; a source''s «now» is null without a channel and counts a trial by first touch; the card''s «now» is every trial of the month, never a demo',
      'expected', 'null|null,null,null|t|1|2|t|f|refused', 'actual', v_txt, 'pass', v_txt = 'null|null,null,null|t|1|2|t|f|refused');

    -- 9 -------------------------------------------------------------- experiments
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := concat_ws('|', public.admin_growth_set_experiment('E2', 'running')->>'changed',
      public.admin_growth_set_experiment('E2', 'paused')->>'error',
      public.admin_growth_set_experiment('E99', 'done')->>'error');
    v_json := public.admin_growth_view('experiments');
    perform set_config('request.jwt.claims', '', true);
    v_txt := concat_ws('|', v_txt, (select status from app.growth_experiments where key = 'E2'),
      (select a.detail #>> '{status,from}' || '>' || (a.detail #>> '{status,to}') from app.admin_audit a
       where a.admin_id = v_ana and a.action = 'growth.experiment_update' and a.target_id = 'E2'),
      (select bool_and((a->>'impact')::int * (a->>'confidence')::int * (a->>'ease')::int >= (b->>'impact')::int * (b->>'confidence')::int * (b->>'ease')::int)
       from jsonb_array_elements(v_json->'experiments') with ordinality x(a, i)
       join jsonb_array_elements(v_json->'experiments') with ordinality y(b, j) on j = i + 1));
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'an experiment''s status change is audited from and to; an unknown status or experiment refused; highest ICE first',
      'expected', 'true|invalid_status|not_found|running|queued>running|t', 'actual', v_txt,
      'pass', v_txt = 'true|invalid_status|not_found|running|queued>running|t');

    -- 10 ------------------------------------------------------------- «Decide»
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := concat_ws('|', public.admin_growth_decide(3, 'Removable from the annual plan', 'Founder')->>'ok',
      public.admin_growth_decide(3, 'Removable on every plan', 'Founder and counsel')->>'ok',
      public.admin_growth_decide(3, '   ', 'Founder')->>'error',
      public.admin_growth_decide(3, 'Yes', '')->>'error',
      public.admin_growth_decide(42, 'Yes', 'Founder')->>'error');
    perform set_config('request.jwt.claims', '', true);
    select concat_ws('|', v_txt, d.decided_value, d.decided_by, d.decided_at is not null,
      (select count(*) from app.admin_audit a where a.admin_id = v_mkt and a.action = 'growth.decide'),
      (select a.detail #>> '{value,from}' from app.admin_audit a where a.admin_id = v_mkt and a.action = 'growth.decide' order by a.id desc limit 1))
    into v_txt from app.growth_decisions d where d.sort = 3;
    begin
      update app.growth_decisions set decided_value = 'Yes', decided_by = 'x', decided_at = null where sort = 4;
      v_txt := v_txt || '|stored';
    exception when check_violation then v_txt := v_txt || '|refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', '«Decide» records the answer, who and when, audited with what it replaced; empty answers and unknown decisions refused; no value without a time',
      'expected', 'true|true|invalid_value|invalid_by|not_found|Removable on every plan|Founder and counsel|t|2|Removable from the annual plan|refused', 'actual', v_txt,
      'pass', v_txt = 'true|true|invalid_value|invalid_by|not_found|Removable on every plan|Founder and counsel|t|2|Removable from the annual plan|refused');

    -- 11 ------------------------------------------------------------- the exports
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := concat_ws('|', jsonb_array_length(public.admin_growth_export('board')->'rows'),
      jsonb_array_length(public.admin_growth_export('plan')->'rows'),
      jsonb_array_length(public.admin_growth_export('review')->'coverage'),
      public.admin_growth_export('everything')->>'error');
    v_txt := concat_ws('|', v_txt,
      (select string_agg(target_id, ',' order by target_id) from app.admin_audit where admin_id = v_ana and action = 'growth.export'),
      (select bool_and(e->>'status' = app.growth_item_json(i)->>'status') from jsonb_array_elements(public.admin_growth_export('board')->'rows') e
       join app.growth_items i on i.key = e->>'key'));
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'each export answers and is audited as growth.export with its kind; an unknown kind refused; the board''s statuses are the derived ones',
      'expected', '19|6|30|invalid|board,plan,review|t', 'actual', v_txt, 'pass', v_txt = '19|6|30|invalid|board,plan,review|t');

    -- 12 ------------------------------------------------------------- the Event catalogue page
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_growth_events();
    perform set_config('request.jwt.claims', '', true);
    v_txt := concat_ws('|', (v_json->>'checked_at')::timestamptz between now() and clock_timestamp(),
      (select e->>'used' from jsonb_array_elements(v_json->'events') e where e->>'name' = 'org.created'),
      (select e->>'used' from jsonb_array_elements(v_json->'events') e where e->>'name' = 'results.viewed'),
      (select e->>'used' from jsonb_array_elements(v_json->'events') e where e->>'name' = 'ticket.created'));
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'the Event catalogue says when the firewall was computed and which funnel stages read each event',
      'expected', 't|["Signup"]|["Activated"]|[]', 'actual', v_txt, 'pass', v_txt = 't|["Signup"]|["Activated"]|[]');

    -- 15 ------------------------------------------------------------- the plan's gates, read live
    v_x := app.growth_gate_value('doi_subscribers');
    -- a marketing contact with no consent record yet (the ledger's trigger is deferred to commit)
    insert into app.crm_contacts (id, email, source, basis) values (v_ct, 'gate@grg-probe.no', 'manual', 'customer');
    v_txt := app.growth_gate_state('consent_coverage', 100);
    insert into app.consent_records (contact_id, purpose, status, lawful_basis, method, doi_sent_at, doi_confirmed_at)
      values (v_ct, 'marketing', 'granted', 'consent', 'double_opt_in', now() - interval '1 hour', now());
    v_txt := concat_ws('|', v_txt,
      app.growth_gate_state('consent_coverage', 100)
        = case when exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls' and c.basis <> 'none'
                            and not exists (select 1 from app.consent_records r where r.contact_id = c.id and r.purpose = 'marketing'))
               then 'unmet' else 'met' end,
      app.growth_gate_value('doi_subscribers') - v_x,
      app.growth_gate_state('doi_subscribers', (v_x + 1)::int), app.growth_gate_state('doi_subscribers', (v_x + 2)::int));
    -- a later withdrawal: the latest record decides, so the subscriber is gone again
    insert into app.consent_records (contact_id, purpose, status, method) values (v_ct, 'marketing', 'withdrawn', 'one_click_unsubscribe');
    -- a double opt-in never confirmed is no subscriber
    insert into app.crm_contacts (id, email, source, basis) values (v_ct2, 'gate2@grg-probe.no', 'manual', 'customer');
    insert into app.consent_records (contact_id, purpose, status, lawful_basis, method, doi_sent_at)
      values (v_ct2, 'marketing', 'granted', 'consent', 'double_opt_in', now());
    v_txt := concat_ws('|', v_txt, app.growth_gate_value('doi_subscribers') - v_x);
    -- no marketing contact at all: coverage has nothing to be a percentage of, so it is not measured
    update app.crm_contacts set basis = 'none' where product_id = 'orgpuls';
    v_txt := concat_ws('|', v_txt, coalesce(app.growth_gate_value('consent_coverage')::text, 'null'), app.growth_gate_state('consent_coverage', 100),
      app.growth_gate_state(null, null), app.growth_gate_state('trials_30d', 1000000));
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'the plan''s gates are read live: a marketing contact without a record leaves coverage unmet, none at all is unmeasured; a confirmed double opt-in counts until a later withdrawal, an unconfirmed one never; a gate with no measure is unmeasured',
      'expected', 'unmet|t|1|met|unmet|0|null|unmeasured|unmeasured|unmet', 'actual', v_txt,
      'pass', v_txt = 'unmet|t|1|met|unmet|0|null|unmeasured|unmeasured|unmet');

    -- 16 ------------------------------------------------------------- each funnel measure, on events built for it
    insert into app.organizations (id, name, org_number, employee_count, created_at, registry_fetched_at) values
      (v_a, 'Trakt A AS', '999001425', 12, '2020-03-02 10:00+01', '2020-03-02 10:05+01'),
      (v_b, 'Trakt B AS', '999001426', 12, '2020-03-02 11:00+01', null),
      (v_c, 'Trakt C AS', '999001427', 12, '2019-01-01 10:00+01', '2019-01-01 10:05+01');
    insert into app.growth_events (name, occurred_at, org_id, props, source) values
      -- Value: A sent a survey and reached the threshold; B only sent
      ('survey.sent', '2020-03-04 09:00+01', v_a, '{}', 'backfill'),
      ('survey.threshold_reached', '2020-03-08 09:00+01', v_a, '{}', 'backfill'),
      ('survey.sent', '2020-03-04 09:00+01', v_b, '{}', 'backfill'),
      -- Activated: A both within 14 days of signup; B the second 23 days after
      ('results.viewed', '2020-03-05 09:00+01', v_a, '{}', 'backfill'),
      ('action_item.created', '2020-03-10 09:00+01', v_a, '{}', 'backfill'),
      ('results.viewed', '2020-03-05 09:00+01', v_b, '{}', 'backfill'),
      ('action_item.created', '2020-03-25 09:00+01', v_b, '{}', 'backfill'),
      -- Retained: A plans a survey after its first was sent; B plans before it has sent one; C more than six months after
      ('survey.scheduled', '2020-03-20 09:00+01', v_a, '{}', 'backfill'),
      ('survey.scheduled', '2020-03-03 09:00+01', v_b, '{}', 'backfill'),
      ('survey.sent', '2019-01-10 09:00+01', v_c, '{}', 'backfill'),
      ('survey.scheduled', '2020-03-15 09:00+01', v_c, '{}', 'backfill'),
      -- Expansion: A moves up from Small to Usual, B down from Usual to Small
      ('subscription.started', '2020-03-06 09:00+01', v_a, '{"plan": "small"}', 'backfill'),
      ('subscription.tier_changed', '2020-03-20 09:00+01', v_a, '{"plan": "usual"}', 'backfill'),
      ('subscription.started', '2020-03-06 09:00+01', v_b, '{"plan": "usual"}', 'backfill'),
      ('subscription.tier_changed', '2020-03-20 09:00+01', v_b, '{"plan": "small"}', 'backfill');
    -- Setup: A's list reaches five one addition at a time, inside the month; B's fifth arrives in April
    insert into app.employees (org_id, full_name, created_at) values (v_a, 'Probe En', '2020-03-03 10:00+01'), (v_a, 'Probe To', '2020-03-03 10:00+01');
    insert into app.employees (org_id, full_name, created_at) values (v_a, 'Probe Tre', '2020-03-04 10:00+01');
    insert into app.employees (org_id, full_name, created_at) values (v_a, 'Probe Fire', '2020-03-05 10:00+01');
    insert into app.employees (org_id, full_name, created_at) values (v_a, 'Probe Fem', '2020-03-06 10:00+01');
    insert into app.employees (org_id, full_name, created_at) values (v_b, 'Probe En', '2020-03-03 10:00+01'), (v_b, 'Probe To', '2020-03-03 10:00+01'),
      (v_b, 'Probe Tre', '2020-03-03 10:00+01'), (v_b, 'Probe Fire', '2020-03-03 10:00+01');
    insert into app.employees (org_id, full_name, created_at) values (v_b, 'Probe Fem', '2020-04-02 10:00+01');
    -- Visitors: one visitor's views 20 minutes apart are one session, 35 minutes apart a second; another visitor one
    insert into app.web_events (at, day, visitor, kind, path) values
      ('2020-03-10 10:00+01', '2020-03-10', repeat('a', 32), 'view', '/'),
      ('2020-03-10 10:20+01', '2020-03-10', repeat('a', 32), 'view', '/priser'),
      ('2020-03-10 10:55+01', '2020-03-10', repeat('a', 32), 'view', '/'),
      ('2020-03-10 11:00+01', '2020-03-10', repeat('b', 32), 'view', '/');
    select concat_ws('|',
      app.growth_funnel_count('web_sessions', '{}', w_from, w_to),
      (select app.growth_funnel_count(f.measure, f.events, w_from, w_to) from app.growth_funnel_stages f where f.key = 'signup'),
      app.growth_funnel_count('any', '{org.created}', w_from, w_to),
      (select app.growth_funnel_count(f.measure, f.events, w_from, w_to) from app.growth_funnel_stages f where f.key = 'setup'),
      (select app.growth_funnel_count(f.measure, f.events, w_from, w_to) from app.growth_funnel_stages f where f.key = 'value'),
      app.growth_funnel_count('all', '{results.viewed,action_item.created}', w_from, w_to),
      (select app.growth_funnel_count(f.measure, f.events, w_from, w_to) from app.growth_funnel_stages f where f.key = 'activated'),
      (select app.growth_funnel_count(f.measure, f.events, w_from, w_to) from app.growth_funnel_stages f where f.key = 'retained'),
      (select app.growth_funnel_count(f.measure, f.events, w_from, w_to) from app.growth_funnel_stages f where f.key = 'expansion'),
      app.growth_funnel_count('any', '{subscription.tier_changed}', w_from, w_to),
      coalesce((select app.growth_funnel_count(f.measure, f.events, w_from, w_to) from app.growth_funnel_stages f where f.key = 'pql')::text, 'null'),
      app.growth_trials(w_from, w_to))
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'each funnel measure on built events: sessions split at 30 minutes; Signup needs the Brønnøysund lookup; Setup is the fifth employee however added; Value needs both events; Activated within 14 days; Retained after a first send and within six months; Expansion only upward; PQL none',
      'expected', '3|1|2|1|1|2|1|1|1|2|null|2', 'actual', v_txt, 'pass', v_txt = '3|1|2|1|1|2|1|1|1|2|null|2');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 13 --------------------------------------------------------------- honest as seeded
  select concat_ws('|',
    (select count(*) from app.growth_rules where (impl_kind = 'none') <> (impl_ref is null)),
    (select count(*) from app.growth_funnel_stages f, unnest(f.events) e where not exists (select 1 from app.event_catalogue c where c.name = e)),
    (select count(*) from app.growth_items i where i.owner is not null and not app.growth_owner_ok(i.owner)),
    (select count(*) from (select href from app.growth_items union all select href from app.growth_coverage) h where h.href is not null and h.href !~ '^/admin(/[a-z0-9_-]+)*$'),
    (select count(*) from app.growth_funnel_stages where measure = 'none'),
    (select count(*) from app.growth_lead_sources where cardinality(channels) = 0))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'the registry names what implements each rule or none, funnel events are catalogue events, owners are Growth admins, addresses are admin routes; one stage and three sources are marked as having no source',
    'expected', '0|0|0|0|1|3', 'actual', v_txt, 'pass', v_txt = '0|0|0|0|1|3');

  -- 14 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@grg-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_demo, v_a, v_b, v_c)
    union all select id::text from app.crm_contacts where id in (v_ct, v_ct2)
    union all select id::text from app.web_events where day = '2020-03-10'
    union all select key from app.growth_funnel_stages where key = 'probe'
    union all select id::text from app.admin_audit where admin_id in (v_mkt, v_ana, v_sup, v_off)) x;
  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._grg
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._grg order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._grg;
  if v_failed is not null then raise exception 'growth registry invariants failed: %', v_failed; end if;
  if v_count <> 16 then raise exception 'growth registry invariants: expected 16 rows, got %', v_count; end if;
end $$;
