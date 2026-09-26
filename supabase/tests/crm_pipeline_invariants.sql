-- crm_pipeline_invariants.sql — companies, lists, templates, A/B tests and the web archive (0056, D-103).
--
--   * the new tables have RLS on, no policy and no client privilege (1)
--   * the public side and the admin side are callable by whom they should be (2)
--   * still: nothing touches the employee, invitation or answer tables (3)
--   * the six templates are valid content (4)
--   * only a company's role address may be mailed without consent; an enkeltpersonforetak's
--     never; a known org.nr is not imported twice (5, 6)
--   * a prospect that signs up is linked, and its stage then follows its plan (7)
--   * a first call moves a new prospect to contacted; tasks come and go (8)
--   * a signup joins the chosen public lists only, confirmed by the mailed token (9)
--   * a list campaign reaches subscribed members only (10)
--   * an A/B test holds most of the audience back, then sends the winner (11)
--   * one-click leaves the mail's list only; the preference centre sets lists, or leaves all
--     and suppresses (12, 13)
--   * a click is kept as path and utm_content, never with its query (14)
--   * only a published campaign that has gone out is on the web (15)
--   * roles: support no, analyst reads, marketing writes (16)
--   * nothing written here survives (17)
--   * a contact can belong to a company; one contact leaves one list with a reason; the
--     register picker learns which org.nr are known (18, 0058)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_pipeline_invariants.sql

create unlogged table if not exists public._cpi(seq int, name text, expected text, actual text, pass bool);
truncate public._cpi;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_mkt     uuid := '00000000-0000-4000-8000-0000000c5301';
  v_ana     uuid := '00000000-0000-4000-8000-0000000c5302';
  v_sup     uuid := '00000000-0000-4000-8000-0000000c5303';
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_jobs    jsonb;
  v_txt     text;
  v_ok      boolean;
  v_cnt     int;
  v_id      uuid;
  v_list    uuid;
  v_camp    uuid;
  v_token   text;
  v_send    uuid;
  v_orgnr   text;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  -- 1 ------------------------------------------------------------------ RLS, no policy, no grant
  select bool_and(c.relrowsecurity) into v_ok from pg_class c
  where c.oid in ('app.crm_companies'::regclass, 'app.crm_activities'::regclass, 'app.crm_lists'::regclass,
                  'app.crm_list_members'::regclass, 'app.crm_templates'::regclass, 'app.crm_clicks'::regclass);
  v_ok := v_ok and not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'app'
      and g.table_name like 'crm\_%' and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename like 'crm\_%');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the new CRM tables have RLS on, no policy and no client privilege',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  -- 2 ------------------------------------------------------------------ who may call what
  v_txt := concat_ws(',',
    has_function_privilege('anon', 'public.crm_preferences(text)', 'execute'),
    has_function_privilege('anon', 'public.crm_set_preferences(text,text[],boolean)', 'execute'),
    has_function_privilege('anon', 'public.crm_archive_item(text)', 'execute'),
    has_function_privilege('anon', 'public.admin_crm_companies(text,text,uuid)', 'execute'),
    has_function_privilege('authenticated', 'public.record_crm_event(text,text,timestamptz,text)', 'execute'),
    has_function_privilege('authenticated', 'app.crm_log(uuid,uuid,text,text,date)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the preference centre and archive are public; the rest is not',
    'expected', 't,t,t,f,f,f', 'actual', v_txt, 'pass', v_txt = 't,t,t,f,f,f');

  -- 3 ------------------------------------------------------------------ respondents, still
  v_ok := not exists (
      select 1 from pg_constraint k
      where k.contype = 'f' and k.conrelid::regclass::text like 'app.crm\_%'
        and k.confrelid::regclass::text in ('app.employees', 'app.invitations', 'app.responses', 'app.answers', 'app.extra_answers', 'app.response_comments'))
    and not exists (
      select 1 from pg_proc p
      where (p.proname like 'crm\_%' or p.proname like 'admin\_crm\_%' or p.proname = 'record_crm_event')
        and p.prosrc ~* 'app\.(employees|invitations|responses|answers|extra_answers|response_comments)\M');
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no CRM table or function touches employees, invitations or answers',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  -- 4 ------------------------------------------------------------------ templates
  select count(*), bool_and(app.crm_blocks_ok(t.blocks)) into v_cnt, v_ok from app.crm_templates t;
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'six templates, every one valid content', 'expected', '6 valid',
    'actual', v_cnt || case when v_ok then ' valid' else ' invalid' end, 'pass', v_cnt = 6 and v_ok);

  -- 5 ------------------------------------------------------------------ role addresses
  v_txt := concat_ws(',', app.crm_role_address('post@firma.example'), app.crm_role_address('Firmapost@firma.example'),
    app.crm_role_address('kari.nordmann@firma.example'), app.crm_role_address('kari@firma.example'));
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a role address is recognised; a person''s is not', 'expected', 't,t,f,f',
    'actual', v_txt, 'pass', v_txt = 't,t,f,f');

  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@cpi-test.example'), (v_ana, 'analyst@cpi-test.example'), (v_sup, 'support@cpi-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst'), (v_sup, 'support');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);

    -- 6 ---------------------------------------------------------------- import from the register
    v_json := public.admin_crm_company_import(jsonb_build_array(
      jsonb_build_object('org_number', '999000001', 'name', 'Probe Bygg AS', 'form_code', 'AS', 'email', 'post@probe-bygg.example', 'employees', 40),
      jsonb_build_object('org_number', '999000002', 'name', 'Probe Kari Nordmann', 'form_code', 'ENK', 'email', 'post@probe-enk.example'),
      jsonb_build_object('org_number', '999000003', 'name', 'Probe Helse AS', 'form_code', 'AS', 'email', 'ola.hansen@probe-helse.example'),
      jsonb_build_object('org_number', '999000001', 'name', 'Probe Bygg AS', 'form_code', 'AS')), 'brreg');
    v_txt := concat_ws(',', v_json->>'added', v_json->>'known', v_json->>'business',
      (select string_agg(c.email || '=' || c.basis || '/' || app.crm_mailable(c)::text, ';' order by c.email)
       from app.crm_contacts c where c.email like '%@probe-%.example' and c.source = 'brreg'));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'only an AS''s role address may be mailed; a known org.nr is skipped',
      'expected', '3,1,1,ola.hansen@probe-helse.example=none/false;post@probe-bygg.example=business/true;post@probe-enk.example=none/false',
      'actual', v_txt,
      'pass', v_txt = '3,1,1,ola.hansen@probe-helse.example=none/false;post@probe-bygg.example=business/true;post@probe-enk.example=none/false');

    -- 7 ---------------------------------------------------------------- a prospect signs up
    select o.org_number into v_orgnr from app.organizations o where o.id = v_org;
    v_json := public.admin_crm_company_save(null, jsonb_build_object('name', 'Probe før registrering', 'org_number', v_orgnr));
    v_id := (v_json->>'id')::uuid;
    perform app.crm_sync();
    v_txt := (select coalesce(c.org_id::text = v_org::text, false)::text || ',' || c.stage from app.crm_companies c where c.id = v_id);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_company_save(v_id, '{"stage":"lost"}')->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a prospect that signs up is linked and its stage follows its plan',
      'expected', 'linked, trial or customer, stage_follows_plan', 'actual', v_txt,
      'pass', v_txt in ('true,trial,stage_follows_plan', 'true,customer,stage_follows_plan'));

    -- 8 ---------------------------------------------------------------- activities and tasks
    select id into v_id from app.crm_companies where org_number = '999000003';
    perform public.admin_crm_activity(v_id, null, 'call', 'Ringte daglig leder, ba om e-post', null);
    perform public.admin_crm_activity(v_id, null, 'task', 'Følg opp tilbudet', current_date);
    v_txt := (select stage from app.crm_companies where id = v_id);
    v_cnt := (select count(*) from jsonb_array_elements(public.admin_crm_tasks()->'rows') r where (r->>'company_id')::uuid = v_id);
    perform public.admin_crm_task_done((select a.id from app.crm_activities a where a.company_id = v_id and a.kind = 'task'));
    v_txt := v_txt || ',' || v_cnt || ',' || (select count(*) from jsonb_array_elements(public.admin_crm_tasks()->'rows') r where (r->>'company_id')::uuid = v_id);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a first call moves a new prospect to contacted; a task is open until done',
      'expected', 'contacted,1,0', 'actual', v_txt, 'pass', v_txt = 'contacted,1,0');
    perform set_config('request.jwt.claims', '', true);

    -- 9 ---------------------------------------------------------------- lists at signup
    insert into app.crm_lists (key, name_no, name_en, public) values ('probe-intern', 'Intern', 'Internal', false);
    perform public.crm_newsletter_signup('liste.leser@probe-cpi.example', 'Liste Leser', null, 'no', 'newsletter', null,
      array['produktnytt', 'arrangementer', 'probe-intern']);
    select string_agg(l.key || '=' || m.status, ',' order by l.key) into v_txt
    from app.crm_list_members m join app.crm_lists l on l.id = m.list_id join app.crm_contacts c on c.id = m.contact_id
    where c.email = 'liste.leser@probe-cpi.example';
    v_jobs := public.crm_mail_claim(50);
    select j->>'token', (j->>'id')::uuid into v_token, v_send from jsonb_array_elements(v_jobs) j where j->>'to_email' = 'liste.leser@probe-cpi.example';
    perform public.crm_mail_done(v_send, true, '<cpi-optin@relay.example>', null, false);
    perform public.crm_confirm(v_token);
    v_txt := v_txt || ' / ' || (select string_agg(l.key || '=' || m.status, ',' order by l.key)
      from app.crm_list_members m join app.crm_lists l on l.id = m.list_id join app.crm_contacts c on c.id = m.contact_id
      where c.email = 'liste.leser@probe-cpi.example');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a signup joins only the public lists chosen, confirmed by the mailed token',
      'expected', 'arrangementer=pending,produktnytt=pending / arrangementer=subscribed,produktnytt=subscribed', 'actual', v_txt,
      'pass', v_txt = 'arrangementer=pending,produktnytt=pending / arrangementer=subscribed,produktnytt=subscribed');

    -- 10, 11 ----------------------------------------------------------- a list campaign with an A/B test
    select id into v_list from app.crm_lists where key = 'produktnytt';
    insert into app.crm_contacts (email, source, basis, status, consent_at, consent_source)
    select 'ab' || g || '@probe-cpi.example', 'import', 'consent', 'active', now(), 'probe' from generate_series(1, 9) g;
    insert into app.crm_list_members (list_id, contact_id, status, source, subscribed_at)
    select v_list, c.id, 'subscribed', 'probe', now() from app.crm_contacts c where c.email like 'ab_@probe-cpi.example';
    -- consent, but not on the list; and on the list but still pending
    insert into app.crm_contacts (email, source, basis, status, consent_at, consent_source)
    values ('ikke.medlem@probe-cpi.example', 'import', 'consent', 'active', now(), 'probe'),
           ('venter@probe-cpi.example', 'import', 'consent', 'active', now(), 'probe');
    insert into app.crm_list_members (list_id, contact_id, status, source)
    select v_list, c.id, 'pending', 'probe' from app.crm_contacts c where c.email = 'venter@probe-cpi.example';

    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Probe produktnytt', 'template_key', 'produktnytt',
      'list_id', v_list, 'subject_b', 'Nytt: tiltak som følger opp seg selv', 'ab_percent', 20, 'ab_metric', 'open', 'ab_wait_hours', 1));
    v_camp := (v_json->>'id')::uuid;
    perform public.admin_crm_campaign_schedule(v_camp, now());
    perform set_config('request.jwt.claims', '', true);
    v_jobs := public.crm_mail_claim(50);
    select count(*) into v_cnt from app.crm_sends s where s.campaign_id = v_camp and s.kind = 'campaign';
    v_ok := not exists (select 1 from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id
                        where s.campaign_id = v_camp and c.email in ('ikke.medlem@probe-cpi.example', 'venter@probe-cpi.example'));
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'a list campaign reaches subscribed members only',
      'expected', '10 members, none else', 'actual', v_cnt || ' members, ' || case when v_ok then 'none else' else 'others too' end,
      'pass', v_cnt = 10 and v_ok);

    select concat_ws(',', count(*) filter (where status = 'sending' and variant = 'a'), count(*) filter (where status = 'sending' and variant = 'b'),
                     count(*) filter (where status = 'held'))
      into v_txt from app.crm_sends where campaign_id = v_camp;
    -- the test group goes out, and only variant B is opened
    perform public.crm_mail_done(s.id, true, '<cpi-ab-' || s.id || '@relay.example>', null, false) from app.crm_sends s
    where s.campaign_id = v_camp and s.status = 'sending';
    perform public.record_crm_event('opened', 'cpi-ab-' || s.id || '@relay.example', now()) from app.crm_sends s
    where s.campaign_id = v_camp and s.variant = 'b';
    update app.crm_campaigns set started_at = now() - interval '2 hours' where id = v_camp;
    v_jobs := public.crm_mail_claim(50);
    v_txt := v_txt || ' → ' || (select ab_winner from app.crm_campaigns where id = v_camp) || ','
      || (select count(*) from jsonb_array_elements(v_jobs) j where j->'campaign'->>'subject' = 'Nytt: tiltak som følger opp seg selv');
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'an A/B test sends 2 of 10 first, then the winner to the other 8',
      'expected', '1,1,8 → b,8', 'actual', v_txt, 'pass', v_txt = '1,1,8 → b,8');

    -- 12 --------------------------------------------------------------- one-click leaves the list
    select (j->>'id')::uuid, j->>'token' into v_send, v_token from jsonb_array_elements(v_jobs) j where j->>'to_email' like 'ab_@probe-cpi.example' limit 1;
    perform public.crm_mail_done(v_send, true, '<cpi-uns@relay.example>', null, false);
    v_json := public.crm_unsubscribe(v_token);
    select concat_ws(',', v_json->>'scope', m.status, c.status, app.crm_suppressed(c.email)::text) into v_txt
    from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id join app.crm_list_members m on m.contact_id = c.id and m.list_id = v_list
    where s.id = v_send;
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'one-click leaves the mail''s list only', 'expected', 'list,unsubscribed,active,false',
      'actual', v_txt, 'pass', v_txt = 'list,unsubscribed,active,false');

    -- 13 --------------------------------------------------------------- the preference centre
    v_json := public.crm_preferences(v_token);
    v_ok := v_json->>'ok' = 'true' and not (v_json::text ~ '@probe-cpi') and jsonb_array_length(v_json->'lists') = 4;
    perform public.crm_set_preferences(v_token, array['nyhetsbrev']);
    select string_agg(l.key || '=' || m.status, ',' order by l.key) into v_txt
    from app.crm_sends s join app.crm_list_members m on m.contact_id = s.contact_id join app.crm_lists l on l.id = m.list_id where s.id = v_send;
    perform public.crm_set_preferences(v_token, array[]::text[], true);
    v_txt := v_txt || ' / ' || (select c.status || ',' || app.crm_suppressed(c.email)::text from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id where s.id = v_send);
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'the preference centre shows lists without the address, sets them, or leaves all',
      'expected', 'no address: nyhetsbrev=subscribed,produktnytt=unsubscribed / unsubscribed,true',
      'actual', case when v_ok then 'no address: ' else 'address or lists wrong: ' end || v_txt,
      'pass', v_ok and v_txt = 'nyhetsbrev=subscribed,produktnytt=unsubscribed / unsubscribed,true');

    -- 14 --------------------------------------------------------------- clicks without queries
    select s.id into v_send from app.crm_sends s where s.campaign_id = v_camp and s.provider_id is not null and s.variant = 'b' limit 1;
    perform public.record_crm_event('click', (select btrim(provider_id, '<>') from app.crm_sends where id = v_send), now(),
      'https://www.orgpuls.com/plattform?utm_source=orgpuls&utm_content=b4-button&t=' || repeat('f', 64));
    select string_agg(k.url || '|' || k.content, ',') into v_txt from app.crm_clicks k where k.send_id = v_send;
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'a click is kept as path and utm_content only',
      'expected', 'https://www.orgpuls.com/plattform|b4-button', 'actual', coalesce(v_txt, 'none'),
      'pass', v_txt = 'https://www.orgpuls.com/plattform|b4-button');

    -- 15 --------------------------------------------------------------- the web archive
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Probe arkiv', 'template_key', 'nyhetsbrev',
      'list_id', v_list, 'publish_web', true, 'slug', 'probe-arkiv-utkast'));
    perform set_config('request.jwt.claims', '', true);
    update app.crm_campaigns set publish_web = true, slug = 'probe-arkiv-sendt' where id = v_camp;
    v_txt := concat_ws(',', coalesce(public.crm_archive_item('probe-arkiv-utkast')->>'slug', 'hidden'),
      coalesce(public.crm_archive_item('probe-arkiv-sendt')->>'slug', 'hidden'),
      (public.crm_archive_item('probe-arkiv-sendt')::text ~ '@probe-cpi')::text);
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'only a published campaign that has gone out is on the web, with no address',
      'expected', 'hidden,probe-arkiv-sendt,false', 'actual', v_txt, 'pass', v_txt = 'hidden,probe-arkiv-sendt,false');

    -- 16 --------------------------------------------------------------- roles
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := coalesce(public.admin_crm_companies()->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_companies()->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_company_save(null, '{"name":"Probe analytiker"}')->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal1'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_overview()->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_overview()->>'error', 'ok');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'support no; analyst reads only; marketing needs the second factor',
      'expected', 'not_allowed,ok,not_allowed,not_allowed,ok', 'actual', v_txt, 'pass', v_txt = 'not_allowed,ok,not_allowed,not_allowed,ok');

    -- 18 --------------------------------------------------------------- 0058
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    select id into v_id from app.crm_companies where org_number = '999000001';
    v_json := public.admin_crm_save_contact(null, jsonb_build_object('email', 'daglig.leder@probe-bygg.example', 'name', 'Probe Leder',
      'consent_source', 'Møtt på messe', 'company_id', v_id));
    v_txt := coalesce((select (c.company_id = v_id)::text from app.crm_contacts c where c.id = (v_json->>'id')::uuid), 'none');
    perform public.admin_crm_list_add(v_list, array[(v_json->>'id')::uuid], 'Muntlig samtykke på messe');
    v_txt := v_txt || ',' || coalesce(public.admin_crm_list_remove(v_list, (v_json->>'id')::uuid, 'x')->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_list_remove(v_list, (v_json->>'id')::uuid, 'Ba om å slippe produktnytt')->>'error', 'ok');
    v_txt := v_txt || ',' || (select m.status from app.crm_list_members m where m.list_id = v_list and m.contact_id = (v_json->>'id')::uuid)
      || ',' || (public.admin_crm_known_orgnrs(array['999000001', '123456789'])->'known')::text;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'a contact belongs to a company; leaving a list needs a reason; known org.nr are named',
      'expected', 'true,reason_required,ok,unsubscribed,["999000001"]', 'actual', v_txt,
      'pass', v_txt = 'true,reason_required,ok,unsubscribed,["999000001"]');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from app.crm_companies where name like 'Probe %';
  v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_cnt::text,
    'pass', v_cnt = 0 and not exists (select 1 from app.crm_contacts where email like '%@probe-%.example')
      and not exists (select 1 from auth.users where email like '%@cpi-test.example')
      and not exists (select 1 from app.crm_lists where key = 'probe-intern'));

  insert into public._cpi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cpi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cpi;
  if v_failed is not null then raise exception 'crm pipeline invariants failed: %', v_failed; end if;
  if v_count <> 18 then raise exception 'crm pipeline invariants: expected 18 rows, got %', v_count; end if;
end $$;

drop table public._cpi;
