-- crm_deals_invariants.sql — pipelines and deals, and the data move (0203, WP-1.1, D-227).
--
--   * the new tables have RLS on, no policy and no client privilege; the new calls are a signed-in staff member's (1)
--   * the move: one primary deal per company, as many as there are companies, each with the company's stage, value
--     and owner; every stage history row of a company points at its deal (2)
--   * the win rate is unchanged on the migrated history: the figures read from deals equal the same figures computed
--     from companies, as 0137 did, stage by stage, open, won this quarter and closed (3)
--   * a deal with a title only is valid: it opens in the pipeline's first open stage, without a company, recorded (4)
--   * a deal's stage belongs to its pipeline: refused through the call, and the table refuses it too (5)
--   * removing a stage moves its deals to the stage chosen, each recorded as a move; without one, or to a stage of
--     another pipeline, nothing moves; a managed stage is not removed (6)
--   * the mirror: moving a company moves its primary deal and the other way round, one history row per move;
--     a primary deal keeps its company and its NOK (7)
--   * status follows the stage: won sets status and closed_at, and says so in an event; reopening clears them (8)
--   * a read-only set may read deals but not add one (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_deals_invariants.sql

create unlogged table if not exists public._cdi(seq int, name text, expected text, actual text, pass bool);
truncate public._cdi;

do $$
declare
  v_su     uuid := '00000000-0000-4000-8000-0000000c0d01';
  v_ro     uuid := '00000000-0000-4000-8000-0000000c0d02';
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
  v_rows   jsonb := '[]';
  v_json   jsonb;
  v_txt    text;
  v_exp    text;
  v_ok     boolean;
  v_co     uuid;
  v_deal   uuid;
  v_deal2  uuid;
  v_pl     uuid;
  v_n      int;
  v_set    uuid;
begin
  -- 1 -------------------------------------------------------------------- closed tables, staff calls
  select bool_and(c.relrowsecurity) into v_ok from pg_class c
  where c.oid in ('app.crm_pipelines'::regclass, 'app.crm_deals'::regclass);
  v_ok := v_ok and not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'app'
      and g.table_name in ('crm_pipelines', 'crm_deals') and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('crm_pipelines', 'crm_deals'));
  v_txt := concat_ws(',', v_ok,
    has_function_privilege('anon', 'public.admin_crm_deal_save(uuid,jsonb)', 'execute'),
    has_function_privilege('anon', 'public.admin_crm_deals(uuid,text,text,uuid)', 'execute'),
    has_function_privilege('anon', 'public.admin_crm_stage_delete(text,text)', 'execute'),
    has_function_privilege('anon', 'public.admin_crm_pipeline_save(uuid,jsonb)', 'execute'),
    has_function_privilege('authenticated', 'app.crm_deal_set_stage(uuid,text,text)', 'execute'),
    has_function_privilege('authenticated', 'app.crm_deal_json(app.crm_deals)', 'execute'),
    has_function_privilege('authenticated', 'public.admin_crm_deal_save(uuid,jsonb)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'pipelines and deals: RLS on, no policy, no grant; the calls are staff''s, the helpers nobody''s',
    'expected', 't,f,f,f,f,f,f,t', 'actual', v_txt,
    'pass', v_txt = 't,f,f,f,f,f,f,t');

  -- 2 -------------------------------------------------------------------- the move
  select concat_ws(',',
    (select count(*) from app.crm_companies) = (select count(*) from app.crm_deals d where d.company_primary),
    not exists (select 1 from app.crm_companies c where (select count(*) from app.crm_deals d where d.company_id = c.id and d.company_primary) <> 1),
    not exists (select 1 from app.crm_companies c join app.crm_deals d on d.company_id = c.id and d.company_primary
                where (d.stage, round(d.value)::int, d.owner_id, d.lost_text) is distinct from (c.stage, c.value_nok, c.owner_id, c.lost_reason)),
    not exists (select 1 from app.crm_stage_changes h where h.company_id is not null and h.deal_id is null),
    not exists (select 1 from app.crm_stage_changes h join app.crm_deals d on d.id = h.deal_id where h.company_id is distinct from d.company_id))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'one primary deal per company, holding its stage, value, owner and lost text; the history points at it',
    'expected', 't,t,t,t,t', 'actual', v_txt, 'pass', v_txt = 't,t,t,t,t');

  begin
    insert into auth.users (id, email) values (v_su, 'super@cdi-test.example'), (v_ro, 'ro@cdi-test.example');
    insert into app.platform_admins (user_id, role) values (v_su, 'super_admin'), (v_ro, 'marketing');
    perform set_config('request.jwt.claims', format(claims, v_su), true);

    -- 3 ------------------------------------------------------------------ the win rate, unchanged
    -- what 0137 computed from companies (with 0195's and 0196's filters), against what the summary reads from deals
    v_json := public.admin_crm_pipeline_summary(null);
    select concat_ws('|',
      (select string_agg(s.key || ':' || (select count(*) from app.crm_companies c where c.stage = s.key and c.deleted_at is null
                                            and app.crm_visible(c.owner_id, c.visibility))
                       || ':' || (select coalesce(sum(c.value_nok), 0) from app.crm_companies c where c.stage = s.key and c.deleted_at is null
                                            and app.crm_visible(c.owner_id, c.visibility)), ',' order by s.sort, s.key)
       from app.crm_stages s where s.pipeline_id = app.crm_default_pipeline()),
      (select jsonb_build_object('won', count(*) filter (where x.to_kind = 'won'), 'lost', count(*) filter (where x.to_kind = 'lost'))::text
       from (select distinct on (h.company_id) h.company_id, h.to_kind
             from app.crm_stage_changes h
             join app.crm_companies hc on hc.id = h.company_id and hc.deleted_at is null and app.crm_visible(hc.owner_id, hc.visibility)
             where h.changed_at >= (v_json->>'since')::timestamptz and h.to_kind in ('won', 'lost') and h.from_kind in ('open', 'parked')
             order by h.company_id, h.changed_at desc, h.id desc) x))
    into v_exp;
    select concat_ws('|',
      (select string_agg((x->>'key') || ':' || (x->>'count') || ':' || (x->>'value'), ',' order by ord)
       from jsonb_array_elements(v_json->'stages') with ordinality as t(x, ord)),
      (v_json->'closed')::text)
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the pipeline figures and the win rate read from deals equal 0137''s, read from companies',
      'expected', v_exp, 'actual', v_txt, 'pass', v_txt = v_exp and (v_json->>'ok')::boolean);

    -- 4 ------------------------------------------------------------------ a title is enough
    v_json := public.admin_crm_deal_save(null, '{"title":"Probe Bare tittel"}');
    v_deal := (v_json->>'id')::uuid;
    select concat_ws(',', v_json->>'ok', d.company_id is null, d.stage, d.status, d.currency, d.owner_id = v_su,
      (select count(*) from app.crm_stage_changes h where h.deal_id = d.id and h.from_stage is null and h.to_stage = d.stage),
      (select count(*) from app.crm_events e where e.record_id = d.id and e.name = 'deal.added'),
      public.admin_crm_deal_save(null, '{"title":"  "}')->>'error')
    into v_txt from app.crm_deals d where d.id = v_deal;
    v_exp := concat_ws(',', 'true', 't',
      (select s.key from app.crm_stages s where s.pipeline_id = app.crm_default_pipeline() and s.kind = 'open' and not s.managed
       and s.archived_at is null order by s.sort limit 1), 'open', 'NOK', 't', '1', '1', 'invalid');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a deal with only a title is valid: first open stage, no company, the caller owns it, recorded; a blank title is not',
      'expected', v_exp, 'actual', v_txt, 'pass', v_txt = v_exp);

    -- 5 ------------------------------------------------------------------ the stage belongs to the pipeline
    v_pl := (public.admin_crm_pipeline_save(null, '{"key":"probe_partner","name":"Probe Partner","sort":"20"}')->>'id')::uuid;
    perform public.admin_crm_stage_save('probe_p_first', jsonb_build_object('name', 'Probe første', 'sort', '10', 'kind', 'open', 'pipeline', v_pl));
    -- each call its own statement: a statement's subqueries see the data as it was when the statement began
    v_txt := public.admin_crm_deal_save(null, jsonb_build_object('title', 'Probe Feil steg', 'pipeline', v_pl, 'stage', 'contacted'))->>'error';
    v_txt := concat_ws(',', v_txt, public.admin_crm_deal_save(null, jsonb_build_object('title', 'Probe Riktig', 'pipeline', v_pl))->>'ok');
    v_txt := concat_ws(',', v_txt, (select d.stage from app.crm_deals d where d.title = 'Probe Riktig'));
    begin
      insert into app.crm_deals (title, pipeline_id, stage) values ('Probe Rå', v_pl, 'contacted');
      v_txt := v_txt || ',inserted';
    exception when foreign_key_violation then
      v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a deal''s stage is one of its pipeline''s: the call and the table both refuse another',
      'expected', 'invalid_stage,true,probe_p_first,refused', 'actual', v_txt, 'pass', v_txt = 'invalid_stage,true,probe_p_first,refused');

    -- 6 ------------------------------------------------------------------ removing a stage
    perform public.admin_crm_stage_save('probe_gone', '{"name":"Probe borte","sort":"35","kind":"open"}');
    v_deal2 := (public.admin_crm_deal_save(null, '{"title":"Probe Flyttes","stage":"probe_gone"}')->>'id')::uuid;
    v_txt := concat_ws(',',
      public.admin_crm_stage_delete('probe_gone', null)->>'error',
      public.admin_crm_stage_delete('probe_gone', 'probe_p_first')->>'error',
      public.admin_crm_stage_delete('trial', 'contacted')->>'error',
      public.admin_crm_stage_delete('probe_gone', 'contacted')->>'moved');
    v_txt := concat_ws(',', v_txt,
      (select d.stage from app.crm_deals d where d.id = v_deal2),
      exists (select 1 from app.crm_stages s where s.key = 'probe_gone'),
      (select count(*) from app.crm_stage_changes h where h.deal_id = v_deal2 and h.from_stage = 'probe_gone' and h.to_stage = 'contacted'),
      (select count(*) from app.crm_stage_changes h where h.deal_id = v_deal2 and h.to_stage = 'probe_gone' and h.left_at is not null));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a stage is removed only with a target in its pipeline; its deals move there, recorded; a managed stage stays',
      'expected', 'invalid_stage,invalid_stage,in_use,1,contacted,f,1,1', 'actual', v_txt,
      'pass', v_txt = 'invalid_stage,invalid_stage,in_use,1,contacted,f,1,1');

    -- 7 ------------------------------------------------------------------ the mirror
    v_co := (public.admin_crm_company_save(null, '{"name":"Probe Speil AS","value_nok":"12000","stage":"new"}')->>'id')::uuid;
    select d.id into v_deal2 from app.crm_deals d where d.company_id = v_co and d.company_primary;
    perform public.admin_crm_stage_move(array[v_co], 'contacted');
    v_txt := concat_ws(',', (select d.stage || '/' || trim_scale(d.value) from app.crm_deals d where d.id = v_deal2));
    perform public.admin_crm_deal_save(v_deal2, '{"title":"Probe Speil AS","stage":"engaged","value":"15000"}');
    v_txt := concat_ws(',', v_txt,
      (select c.stage || '/' || c.value_nok from app.crm_companies c where c.id = v_co),
      (select string_agg(coalesce(h.from_stage, '-') || '>' || h.to_stage, ' ' order by h.id) from app.crm_stage_changes h where h.company_id = v_co));
    v_txt := concat_ws(',', v_txt,
      public.admin_crm_deal_save(v_deal2, '{"title":"Probe Speil AS","currency":"EUR"}')->>'error',
      public.admin_crm_deal_save(v_deal2, '{"title":"Probe Speil AS","company_id":""}')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a company and its primary deal move and change together, one history row a move; the primary deal keeps company and NOK',
      'expected', 'contacted/12000,engaged/15000,->new new>contacted contacted>engaged,primary,primary', 'actual', v_txt,
      'pass', v_txt = 'contacted/12000,engaged/15000,->new new>contacted contacted>engaged,primary,primary');

    -- 8 ------------------------------------------------------------------ status follows the stage
    perform public.admin_crm_deal_save(v_deal, '{"title":"Probe Bare tittel","stage":"customer"}');   -- managed: refused
    v_txt := (select d.status from app.crm_deals d where d.id = v_deal);
    perform public.admin_crm_stage_save('probe_won', '{"name":"Probe vunnet","sort":"65","kind":"won"}');
    perform public.admin_crm_deal_save(v_deal, '{"title":"Probe Bare tittel","stage":"probe_won"}');
    v_txt := concat_ws(',', v_txt, (select d.status || '/' || (d.closed_at is not null) from app.crm_deals d where d.id = v_deal),
      (select count(*) from app.crm_events e where e.record_id = v_deal and e.name in ('deal.won', 'deal.stage_changed')));
    perform public.admin_crm_deal_save(v_deal, '{"title":"Probe Bare tittel","stage":"contacted"}');
    v_txt := concat_ws(',', v_txt, (select d.status || '/' || (d.closed_at is not null) from app.crm_deals d where d.id = v_deal));
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'won sets the status and when, with deal.won and deal.stage_changed; reopening clears both; a managed stage is refused',
      'expected', 'open,won/true,2,open/false', 'actual', v_txt, 'pass', v_txt = 'open,won/true,2,open/false');

    -- 9 ------------------------------------------------------------------ a read-only set
    select s.id into v_set from app.crm_permission_sets s where s.name = 'Read only';
    insert into app.crm_staff_access (user_id, set_id) values (v_ro, v_set)
      on conflict (user_id) do update set set_id = excluded.set_id;
    perform set_config('request.jwt.claims', format(claims, v_ro), true);
    v_txt := concat_ws(',', public.admin_crm_deals(null, 'all', 'Probe')->>'ok',
      public.admin_crm_deal_save(null, '{"title":"Probe Lesetilgang"}')->>'error',
      public.admin_crm_stage_delete('contacted', 'new')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a read-only set reads deals, adds none and removes no stage',
      'expected', 'true,not_allowed,not_allowed', 'actual', v_txt, 'pass', v_txt = 'true,not_allowed,not_allowed');
    perform set_config('request.jwt.claims', '', true);

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 10 ------------------------------------------------------------------- nothing survives
  v_ok := not exists (select 1 from app.crm_deals where title like 'Probe %')
    and not exists (select 1 from app.crm_pipelines where key like 'probe\_%')
    and not exists (select 1 from app.crm_stages where key like 'probe\_%')
    and not exists (select 1 from auth.users where email like '%@cdi-test.example');
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  insert into public._cdi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cdi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cdi;
  if v_failed is not null then raise exception 'crm deals invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'crm deals invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._cdi;
