-- crm_stages_invariants.sql — the pipeline's stages as data, moved by campaigns (0093, D-142).
--
--   * the new tables have RLS on, no policy and no client privilege (1)
--   * the stages are seeded, the plan's two managed; a company's stage must be one of them (2)
--   * a stage can be added; one in use cannot be archived; a managed one keeps its kind (3)
--   * a campaign aimed at a stage reaches its companies' contacts, as a person, and a mail that
--     has gone moves its company on; one that failed does not (4)
--   * an answer logged by a person moves a company forward, never back (5)
--   * a follow-up reaches only those the first mail reached, the days ago, who have not moved (6)
--   * «next stage» for many at once; a company that follows its plan is left alone (7)
--   * an open or a click moves no one (8)
--   * roles: an analyst reads, and cannot move (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_stages_invariants.sql

create unlogged table if not exists public._cst(seq int, name text, expected text, actual text, pass bool);
truncate public._cst;

do $$
declare
  v_fix    uuid := '00000000-0000-4000-8000-000000000001';
  v_mkt    uuid := '00000000-0000-4000-8000-0000000c6301';
  v_ana    uuid := '00000000-0000-4000-8000-0000000c6302';
  v_a      uuid;
  v_b      uuid;
  v_c      uuid;
  v_plan   uuid;
  v_camp   uuid;
  v_follow uuid;
  v_sender uuid;
  v_json   jsonb;
  v_jobs   jsonb;
  v_txt    text;
  v_ok     boolean;
  v_rows   jsonb := '[]';
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  -- 1 ---------------------------------------------------------------- RLS
  select bool_and(c.relrowsecurity) into v_ok from pg_class c where c.oid in ('app.crm_stages'::regclass, 'app.crm_senders'::regclass);
  v_ok := v_ok and not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'app'
      and g.table_name in ('crm_stages', 'crm_senders') and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('crm_stages', 'crm_senders'))
    and not has_function_privilege('anon', 'public.admin_crm_stage_move(uuid[],text)', 'execute')
    and not has_function_privilege('authenticated', 'app.crm_advance(uuid,text,text)', 'execute');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'stages and senders: RLS on, no policy, no client privilege',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  -- 2 ---------------------------------------------------------------- the stages
  select string_agg(s.key || case when s.managed then '*' else '' end, ',' order by s.sort) into v_txt from app.crm_stages s;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'nine stages in order, trial and customer follow the plan',
    'expected', 'new,contacted,engaged,meeting,trial*,customer*,nurture,lost,not_relevant', 'actual', v_txt,
    'pass', v_txt = 'new,contacted,engaged,meeting,trial*,customer*,nurture,lost,not_relevant');

  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@cst-test.example'), (v_ana, 'analyst@cst-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst');

    begin
      insert into app.crm_companies (name, source, stage) values ('Probe Ukjent AS', 'manual', 'nope');
      v_txt := 'written';
    exception when foreign_key_violation then v_txt := 'refused';
    end;

    -- 3 -------------------------------------------------------------- managing stages
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    v_txt := concat_ws(',', v_txt,
      coalesce(public.admin_crm_stage_save('demo', '{"name":"Demo booked","sort":"35","kind":"open"}')->>'error', 'ok'),
      coalesce(public.admin_crm_stage_save('engaged', '{"name":"Engaged","sort":"30","kind":"open","archived":true}')->>'error', 'ok'),
      coalesce(public.admin_crm_stage_save('customer', '{"name":"Customer","sort":"60","kind":"open"}')->>'error', 'ok'),
      coalesce(public.admin_crm_stage_save('Bad Key', '{"name":"X","sort":"1","kind":"open"}')->>'error', 'ok'));
    v_rows := v_rows || jsonb_build_object('seq', 3,
      'name', 'unknown stage refused; a new one added; the answer stage cannot be archived; a managed one keeps its kind',
      'expected', 'refused,ok,in_use,managed,invalid_key', 'actual', v_txt, 'pass', v_txt = 'refused,ok,in_use,managed,invalid_key');

    -- 4 -------------------------------------------------------------- a campaign aimed at a stage
    insert into app.crm_companies (name, source, stage) values ('Probe A AS', 'manual', 'new') returning id into v_a;
    insert into app.crm_companies (name, source, stage) values ('Probe B AS', 'manual', 'new') returning id into v_b;
    insert into app.crm_companies (name, source, stage) values ('Probe C AS', 'manual', 'new') returning id into v_c;
    insert into app.crm_contacts (email, name, source, basis, status, consent_at, consent_source, company_id, lang) values
      ('kari@a-cst.example', 'Kari A', 'manual', 'consent', 'active', now(), 'probe', v_a, 'no'),
      ('per@b-cst.example', 'Per B', 'manual', 'consent', 'active', now(), 'probe', v_b, 'no'),
      ('ola@c-cst.example', 'Ola C', 'manual', 'consent', 'active', now(), 'probe', v_c, 'no');
    perform app.crm_sync();
    select id into v_plan from app.crm_companies where org_id = v_fix;

    v_json := public.admin_crm_sender_save(null, '{"name":"Tor Lambrechts","email":"probe.stages@nyheter.orgpuls.com","reply_to":"tor@orgpuls.no","signature":"Tor, Orgpuls"}');
    v_sender := (v_json->>'id')::uuid;
    v_json := public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Probe første kontakt', 'template_key', 'forste-kontakt', 'lang', 'no'));
    v_camp := (v_json->>'id')::uuid;
    v_txt := coalesce(public.admin_crm_campaign_pipeline(v_camp, jsonb_build_object(
      'stage_target', 'new', 'stage_on_send', 'contacted', 'sender_id', v_sender))->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.admin_crm_campaign_pipeline(v_camp, '{"stage_on_send":"trial"}')->>'error', 'ok');
    perform public.admin_crm_campaign_pipeline(v_camp, jsonb_build_object('stage_target', 'new', 'stage_on_send', 'contacted', 'sender_id', v_sender));
    perform public.admin_crm_campaign_schedule(v_camp, now());
    perform set_config('request.jwt.claims', '', true);
    v_jobs := public.crm_mail_claim(50);
    select v_txt || '|' || count(*) filter (where j->>'to_email' like '%-cst.example') || '|'
           || max(j->'sender'->>'email') filter (where j->>'to_email' like '%-cst.example') || '|'
           || max(j->'campaign'->>'signature') filter (where j->>'to_email' like '%-cst.example')
      into v_txt from jsonb_array_elements(v_jobs) j;
    perform public.crm_mail_done((j->>'id')::uuid, j->>'to_email' <> 'ola@c-cst.example', '<cst-' || (j->>'id') || '@relay.example>',
                                 case when j->>'to_email' = 'ola@c-cst.example' then 'invalid_email' end, j->>'to_email' = 'ola@c-cst.example')
    from jsonb_array_elements(v_jobs) j where j->>'to_email' like '%-cst.example';
    select v_txt || '|' || string_agg(co.stage, ',' order by co.name) into v_txt from app.crm_companies co where co.id in (v_a, v_b, v_c);
    v_txt := v_txt || '|' || (select count(*) from app.crm_activities a where a.company_id = v_a and a.kind = 'stage'
                                and a.body = 'new → contacted: kampanje «Probe første kontakt»');
    v_rows := v_rows || jsonb_build_object('seq', 4,
      'name', 'a stage''s contacts, as Tor; a managed stage refused as target; sent moves on, failed does not; logged',
      'expected', 'ok,invalid_stage|3|probe.stages@nyheter.orgpuls.com|Tor, Orgpuls|contacted,contacted,new|1', 'actual', v_txt,
      'pass', v_txt = 'ok,invalid_stage|3|probe.stages@nyheter.orgpuls.com|Tor, Orgpuls|contacted,contacted,new|1');

    -- 5 -------------------------------------------------------------- an answer
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    perform public.admin_crm_activity(v_a, null, 'reply', 'Svarte: interessert, ring meg neste uke');
    perform public.admin_crm_stage_move(array[v_c], 'meeting');
    perform public.admin_crm_activity(v_c, null, 'reply', 'Takk for sist');
    select string_agg(co.stage, ',' order by co.name) into v_txt from app.crm_companies co where co.id in (v_a, v_c);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'an answer moves contacted to engaged, and leaves meeting where it is',
      'expected', 'engaged,meeting', 'actual', v_txt, 'pass', v_txt = 'engaged,meeting');

    -- 6 -------------------------------------------------------------- a follow-up
    v_json := public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Probe oppfølging', 'template_key', 'forste-kontakt', 'lang', 'no'));
    v_follow := (v_json->>'id')::uuid;
    perform public.admin_crm_campaign_pipeline(v_follow, jsonb_build_object('follows_id', v_camp, 'follow_days', 3, 'sender_id', v_sender,
                                                                            'stage_on_send', 'nurture'));
    update app.crm_sends set sent_at = now() - interval '4 days' where campaign_id = v_camp and status = 'sent';
    perform public.admin_crm_campaign_schedule(v_follow, now());
    perform set_config('request.jwt.claims', '', true);
    v_jobs := public.crm_mail_claim(50);
    select string_agg(j->>'to_email', ',' order by j->>'to_email') into v_txt
    from jsonb_array_elements(v_jobs) j where j->>'to_email' like '%-cst.example';
    perform public.crm_mail_done((j->>'id')::uuid, true, '<cst-f-' || (j->>'id') || '@relay.example>', null, false)
    from jsonb_array_elements(v_jobs) j where j->>'to_email' like '%-cst.example';
    v_txt := v_txt || '|' || (select stage from app.crm_companies where id = v_b);
    v_rows := v_rows || jsonb_build_object('seq', 6,
      'name', 'the follow-up reaches only B (A answered, C''s mail failed), and parks B in nurture',
      'expected', 'per@b-cst.example|nurture', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = 'per@b-cst.example|nurture');

    -- 7 -------------------------------------------------------------- next stage, many at once
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    v_json := public.admin_crm_stage_move(array_remove(array[v_a, v_plan], null));
    select concat_ws('|', v_json->>'moved', v_json->>'skipped', (select stage from app.crm_companies where id = v_a),
                     public.admin_crm_stage_move(array[v_a], 'trial')->>'error')
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 7,
      'name', 'engaged → the added «demo»; the plan''s company is left; trial cannot be set by hand',
      'expected', case when v_plan is null then '1|0|demo|invalid_stage' else '1|1|demo|invalid_stage' end, 'actual', v_txt,
      'pass', v_txt = case when v_plan is null then '1|0|demo|invalid_stage' else '1|1|demo|invalid_stage' end);

    -- 8 -------------------------------------------------------------- opens and clicks move no one
    update app.crm_companies set stage = 'contacted' where id = v_b;
    perform set_config('request.jwt.claims', '', true);
    perform public.record_crm_event('opened', s.provider_id, now()) from app.crm_sends s where s.campaign_id = v_camp and s.to_email is null
      and s.contact_id = (select id from app.crm_contacts where email = 'per@b-cst.example');
    perform public.record_crm_event('click', s.provider_id, now(), 'https://orgpuls.no/priser') from app.crm_sends s where s.campaign_id = v_camp
      and s.contact_id = (select id from app.crm_contacts where email = 'per@b-cst.example');
    select stage || '|' || (select count(*) from app.crm_sends s where s.campaign_id = v_camp and s.clicked_at is not null) into v_txt
    from app.crm_companies where id = v_b;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'an open and a click are recorded, and B stays contacted',
      'expected', 'contacted|1', 'actual', v_txt, 'pass', v_txt = 'contacted|1');

    -- 9 -------------------------------------------------------------- roles
    perform set_config('request.jwt.claims', format(claims, v_ana), true);
    v_txt := concat_ws(',', (public.admin_crm_stages()->>'ok'), public.admin_crm_stage_move(array[v_b])->>'error',
                       public.admin_crm_sender_save(null, '{"name":"X","email":"probe.x@nyheter.orgpuls.com","reply_to":"x@orgpuls.no"}')->>'error');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'an analyst reads the stages, and cannot move or add senders',
      'expected', 'true,not_allowed,not_allowed', 'actual', v_txt, 'pass', v_txt = 'true,not_allowed,not_allowed');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 10 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.crm_companies where name like 'Probe % AS'
    union all select key from app.crm_stages where key = 'demo'
    union all select id::text from app.crm_senders where email = 'probe.stages@nyheter.orgpuls.com'
    union all select id::text from auth.users where id in (v_mkt, v_ana)) x;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._cst
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cst order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cst;
  if v_failed is not null then raise exception 'crm stage invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'crm stage invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._cst;
