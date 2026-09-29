-- crm_journeys_invariants.sql — the follow-up chains read as journeys (0120, X-095), proved against
-- the live schema.
--
--   * a chain aimed at a stage is a journey: two mails, active while its follow-up sends itself (1)
--   * reached, moved forward, answered, still waiting and completed are counted from the sends (2)
--   * a campaign on its own, aimed at no stage, is not a journey; anon may not ask (3)
--   * tasks: open ones by due date, done ones kept, counted per view (5)
--   * the health reader says which rows are demo sandboxes, so lead scoring leaves them out (6)
--   * nothing written here survives (4)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_journeys_invariants.sql

create unlogged table if not exists public._jrn(seq int, name text, expected text, actual text, pass bool);
truncate public._jrn;

do $$
declare
  v_mkt uuid := '00000000-0000-4000-8000-0000000a7401';
  v_a uuid; v_b uuid; v_c uuid;
  v_camp uuid; v_follow uuid; v_lone uuid;
  v_row jsonb;
  v_txt text;
  v_rows jsonb := '[]';
begin
  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@jrn-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing');
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_mkt), true);

    insert into app.crm_companies (name, source, stage) values ('Reise A AS', 'manual', 'contacted') returning id into v_a;
    insert into app.crm_companies (name, source, stage) values ('Reise B AS', 'manual', 'contacted') returning id into v_b;
    insert into app.crm_companies (name, source, stage) values ('Reise C AS', 'manual', 'contacted') returning id into v_c;
    insert into app.crm_contacts (email, name, source, basis, status, consent_at, consent_source, company_id, lang) values
      ('a@a-jrn.example', 'A', 'manual', 'consent', 'active', now(), 'probe', v_a, 'no'),
      ('b@b-jrn.example', 'B', 'manual', 'consent', 'active', now(), 'probe', v_b, 'no'),
      ('c@c-jrn.example', 'C', 'manual', 'consent', 'active', now(), 'probe', v_c, 'no');

    v_camp := (public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Reise første', 'template_key', 'forste-kontakt', 'lang', 'no'))->>'id')::uuid;
    update app.crm_campaigns set status = 'sent', stage_target = 'contacted', started_at = now() - interval '9 days', finished_at = now() - interval '9 days' where id = v_camp;
    insert into app.crm_sends (kind, campaign_id, contact_id, status, sent_at, delivery)
    select 'campaign', v_camp, c.id, 'sent', now() - interval '8 days', 'delivered' from app.crm_contacts c where c.email like '%-jrn.example';
    v_follow := (public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Reise oppfølging', 'template_key', 'forste-kontakt', 'lang', 'no'))->>'id')::uuid;
    perform public.admin_crm_campaign_pipeline(v_follow, jsonb_build_object('follows_id', v_camp, 'follow_days', 7, 'follow_when', 'no_reply'));
    update app.crm_campaigns set follow_auto = true, status = 'sending', started_at = now() where id = v_follow;
    v_lone := (public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Reise alene', 'template_key', 'forste-kontakt', 'lang', 'no'))->>'id')::uuid;

    -- A moves forward, B answers
    update app.crm_companies set stage = 'engaged', stage_changed_at = now() where id = v_a;
    insert into app.crm_activities (company_id, kind, body) values (v_b, 'reply', 'Svar');

    -- 1 -------------------------------------------------------------- the journey
    select x into v_row from jsonb_array_elements(public.admin_crm_journeys()->'rows') x where x->>'id' = v_camp::text;
    v_txt := coalesce(v_row->>'status', 'none') || ',' || coalesce(v_row->>'mails', '?') || ',' || coalesce(v_row->>'stage_target', '?');
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a chain aimed at a stage is a journey, active while its follow-up sends itself',
      'expected', 'active,2,contacted', 'actual', v_txt, 'pass', v_txt = 'active,2,contacted');

    -- 2 -------------------------------------------------------------- the counts
    v_txt := concat_ws(',', v_row->>'reached', v_row->>'moved', v_row->>'replied', v_row->>'in_journey', v_row->>'completed');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'reached, moved forward, answered, waiting (C only) and completed',
      'expected', '3,1,1,1,0', 'actual', v_txt, 'pass', v_txt = '3,1,1,1,0');

    -- 3 -------------------------------------------------------------- not a journey; anon
    v_txt := (select count(*) from jsonb_array_elements(public.admin_crm_journeys()->'rows') x where x->>'id' in (v_lone::text, v_follow::text))::text
          || ',' || has_function_privilege('anon', 'public.admin_crm_journeys()', 'execute')::text;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a lone campaign and a follow-up are not journeys of their own; anon may not ask',
      'expected', '0,false', 'actual', v_txt, 'pass', v_txt = '0,false');

    -- 5 -------------------------------------------------------------- tasks
    insert into app.crm_activities (company_id, kind, body, due_at) values (v_a, 'task', 'Reise ring A', current_date + 1);
    insert into app.crm_activities (company_id, kind, body, due_at, done_at) values (v_b, 'task', 'Reise ring B', current_date - 2, now() - interval '1 day');
    v_txt := (select string_agg(x->>'body', ',' order by x->>'body') from jsonb_array_elements(public.admin_crm_task_list('open')->'rows') x where x->>'body' like 'Reise%')
          || '|' || (select string_agg(x->>'body', ',' order by x->>'body') from jsonb_array_elements(public.admin_crm_task_list('done')->'rows') x where x->>'body' like 'Reise%')
          || '|' || coalesce(public.admin_crm_task_list('later')->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'open and done tasks by view; an unknown view is refused',
      'expected', 'Reise ring A|Reise ring B|invalid', 'actual', v_txt, 'pass', v_txt = 'Reise ring A|Reise ring B|invalid');

    -- 6 -------------------------------------------------------------- demos in account health
    v_txt := ((select count(*) from jsonb_array_elements(public.admin_account_health()->'rows') x where (x->>'demo')::boolean)
              = (select count(*) from app.demo_orgs d join app.organizations o on o.id = d.org_id))::text
          || ',' || (select bool_and(x ? 'demo') from jsonb_array_elements(public.admin_account_health()->'rows') x)::text;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'account health flags exactly the demo sandboxes',
      'expected', 'true,true', 'actual', v_txt, 'pass', v_txt = 'true,true');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 4 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id from app.crm_companies where name like 'Reise % AS'
    union all select id from app.crm_campaigns where name like 'Reise %'
    union all select id from auth.users where email like '%@jrn-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._jrn
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._jrn order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._jrn;
  if v_failed is not null then raise exception 'crm journeys invariants failed: %', v_failed; end if;
  if v_count <> 6 then raise exception 'crm journeys invariants: expected 6 rows, got %', v_count; end if;
end $$;
