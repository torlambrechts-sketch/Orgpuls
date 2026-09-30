-- growth_registry_invariants.sql — Sentral › Growth G2: the report's registry, the funnel and the lead
-- math (0142, D-183), proved against the live schema.
--
--   * every G2 table: RLS on, no policy, no grant to anon, authenticated or service_role; the public
--     functions are for signed-in callers only, never anon (1)
--   * the reads: the Growth roles with a second factor only (support refused, aal1 refused); each of
--     the seven views answers, an unknown view is refused, and every read is audited (2)
--   * the writes and the exports refuse support and a missing second factor, and change nothing (3)
--   * a board item's status and owner: the change is audited with what it was and what it became; an
--     owner outside the Growth roles, an inactive one and «live» are refused; no change, no audit (4)
--   * «Live» is derived, never stored: the column refuses it, an item with a live check that holds is
--     live and falls back to its stored status without one (5)
--   * a rule is live only while what implements it exists and is enabled: a missing function, a
--     disabled trigger, the lifecycle switched off, and «none» are off (6)
--   * the plan: no start date → no week and every block planned; week 4 → done, in progress, next,
--     planned and the current block's first gate; past the end → all done; a start that is not a
--     Monday is refused (7)
--   * the funnel counts this month from the stream; PQL has no count; a stage naming an event the
--     catalogue does not have is refused; the lead math's «now» is null for a source without a
--     channel and counts the month's trials by first touch, never a demo (8)
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
    (select count(*) from pg_proc p where p.pronamespace = 'app'::regnamespace and p.proname ~ '^growth_(live|impl_live|funnel_count|lead_now|plan_week|item_json|plan_json|admin|owner_ok)$'
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
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'an item''s status and owner change once, audited with from and to; «live», a support or inactive owner and an unknown item are refused',
      'expected', 'true|false|invalid_status|invalid_owner|invalid_owner|not_found|planned|t|1|t', 'actual', v_txt,
      'pass', v_txt = 'true|false|invalid_status|invalid_owner|invalid_owner|not_found|planned|t|1|t');

    -- 5 -------------------------------------------------------------- «live» is derived
    begin
      update app.growth_items set status = 'live' where key = 'deliv';
      v_txt := 'stored';
    exception when check_violation then v_txt := 'refused';
    end;
    update app.growth_items set live_check = 'event_stream' where key = 'deliv';
    v_txt := concat_ws('|', v_txt,
      (select app.growth_item_json(i)->>'status' from app.growth_items i where i.key = 'deliv') = case when exists (select 1 from app.growth_events) then 'live' else 'building' end);
    update app.growth_items set live_check = null where key = 'deliv';
    v_txt := concat_ws('|', v_txt,
      (select app.growth_item_json(i)->>'status' from app.growth_items i where i.key = 'deliv'),
      (select bool_and((app.growth_item_json(i)->>'status' = 'live') = (i.live_check is not null and app.growth_live(i.live_check))) from app.growth_items i),
      app.growth_live('year_wheel') = app.growth_impl_live('cron', 'orgpuls-wheel'),
      app.growth_live('nonsense'));
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', '«live» is never stored; an item is live exactly while its live check holds, and shows its stored status otherwise',
      'expected', 'refused|t|building|t|t|f', 'actual', v_txt, 'pass', v_txt = 'refused|t|building|t|t|f');

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
    update app.growth_settings set plan_start = null;
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_growth_view('plan');
    v_txt := concat_ws('|', coalesce(v_json #>> '{plan,week}', 'null'), v_json #>> '{plan,weeks}',
      (select string_agg(DISTINCT b->>'status', ',') from jsonb_array_elements(v_json->'blocks') b));
    update app.growth_settings set plan_start = date_trunc('week', now() at time zone 'Europe/Oslo')::date - 21;
    v_json := public.admin_growth_view('plan');
    v_txt := concat_ws('|', v_txt, v_json #>> '{plan,week}',
      (select string_agg(b->>'status', ',' order by (b->>'from')::int) from jsonb_array_elements(v_json->'blocks') b),
      v_json #>> '{plan,gate}', public.admin_growth_view('board') #>> '{plan,week}');
    update app.growth_settings set plan_start = date_trunc('week', now() at time zone 'Europe/Oslo')::date - 7 * 20;
    v_json := public.admin_growth_view('plan');
    perform set_config('request.jwt.claims', '', true);
    v_txt := concat_ws('|', v_txt, (select string_agg(DISTINCT b->>'status', ',') from jsonb_array_elements(v_json->'blocks') b));
    begin
      update app.growth_settings set plan_start = date_trunc('week', now())::date + 2;
      v_txt := v_txt || '|stored';
    exception when check_violation then v_txt := v_txt || '|refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the plan: no start, no week, all planned; week 4 is done, in progress, next, planned with its first gate; past the end all done; a start that is not a Monday refused',
      'expected', 'null|13|planned|4|done,in_progress,next,planned,planned,planned|Activation baseline measured|4|done|refused', 'actual', v_txt,
      'pass', v_txt = 'null|13|planned|4|done,in_progress,next,planned,planned,planned|Activation baseline measured|4|done|refused');

    -- 8 -------------------------------------------------------------- the funnel and the lead math
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_growth_view('funnel');
    v_n := (select (s->>'n')::bigint from jsonb_array_elements(v_json->'stages') s where s->>'key' = 'signup');
    v_txt := concat_ws('|', (select coalesce(s->>'n', 'null') from jsonb_array_elements(v_json->'stages') s where s->>'key' = 'pql'),
      (select string_agg(coalesce(l->>'now', 'null'), ',' order by l->>'key') from jsonb_array_elements(v_json->'lead') l where l->>'key' in ('loop', 'partners', 'brreg')));
    perform set_config('request.jwt.claims', '', true);
    select app.growth_lead_now(array['organic', 'ai'], v_from, v_to) into v_n;
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Trakt AS', '999001421', 12), (v_demo, 'Demo Trakt AS', '999001422', 12);
    insert into app.demo_orgs (org_id, kind) values (v_demo, 'sandbox');
    insert into app.org_attribution (org_id, channel) values (v_org, 'organic'), (v_demo, 'organic');
    v_txt := concat_ws('|', v_txt, app.growth_lead_now(array['organic', 'ai'], v_from, v_to) - v_n,
      app.growth_funnel_count('any', array['org.created'], v_from, v_to)
        = (select count(distinct g.org_id) from app.growth_events g where g.name = 'org.created' and g.occurred_at >= v_from and g.occurred_at < v_to),
      exists (select 1 from app.growth_events g where g.org_id = v_org and g.name = 'org.created'),
      exists (select 1 from app.growth_events g where g.org_id = v_demo));
    begin
      insert into app.growth_funnel_stages (key, sort, stage, event_label, events, definition, measure)
      values ('probe', 99, 'Probe', 'x', '{survey.exported}', 'x', 'any');
      v_txt := v_txt || '|stored';
    exception when check_violation then v_txt := v_txt || '|refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'the funnel counts the month from the stream, PQL has no count, an unknown event is refused; «now» is null without a channel and counts a trial by first touch, never a demo',
      'expected', 'null|null,null,null|1|t|t|f|refused', 'actual', v_txt, 'pass', v_txt = 'null|null,null,null|1|t|t|f|refused');

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
    union all select id::text from app.organizations where id in (v_org, v_demo)
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
  if v_count <> 14 then raise exception 'growth registry invariants: expected 14 rows, got %', v_count; end if;
end $$;
