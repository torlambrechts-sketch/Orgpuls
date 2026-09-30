-- growth_crm_invariants.sql — Sentral › Growth G3 (0143, D-184), proved against the live schema.
--
--   * the new tables are closed: RLS on, no policy, no grant to a client role or the service role, and
--     no foreign key to a respondent's table (1)
--   * the CRM's reads need the CRM's roles and the second factor; its writes the writers'; the edge
--     function's entry points are the service role's alone (2)
--   * every admin write is logged, and the suppressed address is in no log (3)
--   * a suppression is stored as the SHA-256 of the lower-cased address, and only so (4)
--   * a phone notice is a company's ledger record; an objection a withdrawal and a do-not-contact
--     entry that stops outreach waiting for it; append-only, gone only with its company (5, 6)
--   * the generic-address rule: post@, firmapost@ … yes; a named address never — in the function, in
--     the entity table, in the outreach table and in the ingest (7)
--   * the feed's derivations: a crossing of 5 or 30 (the higher when both), an employee count added
--     where there was none, a new company in a target industry; nothing on a first sight without a
--     count before; no sole proprietorship; once in 180 days (8)
--   * fit 0–50, part by part; outreach only at fit ≥ 30 (9)
--   * the 10 % holdout is a hash of the organisation number: stable, about a tenth, and exactly the
--     rows held out (10)
--   * dry run: queued, never assigned; switched off (audited) the queue is assigned as tasks (R11);
--     a task done is outreach made, reopened it is assigned again (11)
--   * HTTP 410: the entity, its triggers and outreach, its do-not-contact entry and the company the
--     engine made go; only a count of purges stays (12)
--   * a poll: once in 15 minutes; not without the vault; begin, busy, end and the feeds' place (13)
--   * working minutes and the one-hour SLA (14)
--   * lead scoring: fit + intent, the hand-raise the one sourced intent, routing ≥ 60 or a hand-raise
--     to a founder callback on the SLA, a trial by the PQL rule; routing makes each task once (15, 16)
--   * the task list: the SLA left, met or missed, and the counts on the head (17)
--   * partners: validated and unique codes; the referral code from the address to the organisation
--     and the partner's trials (18, 19)
--   * nothing written here survives (20)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/growth_crm_invariants.sql

create unlogged table if not exists public._gcrm(seq int, name text, expected text, actual text, pass bool);
truncate public._gcrm;

do $$
declare
  v_mkt   uuid := '00000000-0000-4000-8000-0000000c3a01';
  v_ana   uuid := '00000000-0000-4000-8000-0000000c3a02';
  v_sup   uuid := '00000000-0000-4000-8000-0000000c3a03';
  v_dl    uuid := '00000000-0000-4000-8000-0000000c3a04';
  v_org   uuid := '00000000-0000-4000-8000-0000000c3a05';
  v_trial uuid := '00000000-0000-4000-8000-0000000c3a06';
  v_co    uuid;
  v_co2   uuid;
  v_ct    uuid;
  v_ct2   uuid;
  v_poll  bigint;
  v_json  jsonb;
  v_txt   text;
  v_cnt   int;
  v_task  uuid;
  v_vis   text;
  v_ua    constant text := 'Mozilla/5.0 (X11; Linux x86_64) gcrm-probe';
  v_rows  jsonb := '[]';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  -- 1 ------------------------------------------------------------------ closed tables
  select string_agg(c.relname, ',' order by c.relname) into v_txt
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relname in ('brreg_settings', 'brreg_polls', 'brreg_entities', 'brreg_triggers', 'brreg_dnc', 'brreg_purges',
                                            'brreg_outreach', 'partners')
    and (not c.relrowsecurity
         or exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename = c.relname)
         or exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'app' and g.table_name = c.relname
                    and g.grantee in ('anon', 'authenticated', 'service_role'))
         or exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f'
                    and k.confrelid in ('app.responses'::regclass, 'app.answers'::regclass, 'app.extra_answers'::regclass,
                                        'app.response_comments'::regclass, 'app.invitations'::regclass, 'app.employees'::regclass)));
  select count(*) into v_cnt from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relname in ('brreg_settings', 'brreg_polls', 'brreg_entities', 'brreg_triggers', 'brreg_dnc', 'brreg_purges',
                                            'brreg_outreach', 'partners');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the eight new tables are closed and reach no respondent',
    'expected', '8 tables, none open', 'actual', v_cnt || ' tables, ' || coalesce(v_txt, 'none open'),
    'pass', v_cnt = 8 and v_txt is null);

  begin
    insert into auth.users (id, email) values (v_mkt, 'mkt@gcrm-probe.example'), (v_ana, 'ana@gcrm-probe.example'),
      (v_sup, 'sup@gcrm-probe.example'), (v_dl, 'dl@gcrm-probe.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst'), (v_sup, 'support');
    delete from app.brreg_polls where requested_at > now() - interval '2 hours';  -- rolled back; the rate limit starts clean
    update app.brreg_settings set dry_run = true;

    -- 2 ---------------------------------------------------------------- roles
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := concat_ws(',',
      public.admin_consent()->>'ok', public.admin_brreg_triggers()->>'ok', public.admin_crm_partners()->>'ok', public.admin_lead_scores()->>'ok',
      public.admin_crm_suppress('x@gcrm-probe.example', 'manual')->>'error', public.admin_consent_phone_notice('999000143', false)->>'error',
      public.admin_brreg_set_dry_run(false)->>'error', public.admin_brreg_poll_now()->>'error', public.admin_consent_export()->>'error',
      public.admin_crm_partner_save(null, 'Probe AS', null, 'bht', null, null, null, null, 'in_talks')->>'error');
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := v_txt || '|' || concat_ws(',', public.admin_consent()->>'error', public.admin_brreg_triggers()->>'error',
                                       public.admin_crm_partners()->>'error', public.admin_lead_scores()->>'error');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal1'), true);
    v_txt := v_txt || '|' || concat_ws(',', public.admin_consent()->>'error', public.admin_crm_suppress('x@gcrm-probe.example', 'manual')->>'error');
    v_txt := v_txt || '|' || concat_ws(',',
      has_function_privilege('authenticated', 'public.brreg_ingest(bigint,jsonb)', 'execute'),
      has_function_privilege('authenticated', 'public.brreg_poll_begin(bigint)', 'execute'),
      has_function_privilege('authenticated', 'public.brreg_purge(text)', 'execute'),
      has_function_privilege('anon', 'public.admin_consent()', 'execute'),
      has_function_privilege('service_role', 'public.brreg_ingest(bigint,jsonb)', 'execute'),
      has_function_privilege('authenticated', 'app.lead_route()', 'execute'));
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'analysts read and cannot write; support and a single factor see nothing; the engine''s entry points are the service role''s',
      'expected', 'true,true,true,true,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed|not_allowed,not_allowed,not_allowed,not_allowed|not_allowed,not_allowed|f,f,f,f,t,f',
      'actual', v_txt,
      'pass', v_txt = 'true,true,true,true,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed|not_allowed,not_allowed,not_allowed,not_allowed|not_allowed,not_allowed|f,f,f,f,t,f');

    -- engine fixtures: three organisations the engine has seen, one in the CRM
    insert into app.brreg_entities (org_number, name, form_code, nace_code, employees, employees_prev, phone, generic_email, active)
    values ('999000141', 'Probe Bygg AS', 'AS', '41.200', 12, null, '+47 99 00 01 41', null, true),
           ('999000142', 'Probe Post AS', 'AS', '88.911', 40, null, null, 'post@probe-post.example', true),
           ('999000143', 'Probe Ring AS', 'AS', '86.230', 20, null, '+47 99 00 01 43', null, true);
    insert into app.crm_companies (name, org_number, source, stage) values ('Probe Ring AS', '999000143', 'brreg', 'new') returning id into v_co;

    -- 3, 4 --------------------------------------------------------------- suppression, logged by hash
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := concat_ws(',',
      public.admin_crm_suppress('  Ola.Nordmann@GCRM-Probe.example ', 'spam')->>'ok',
      public.admin_crm_suppress('ola.nordmann@gcrm-probe.example', 'manual')->>'error',
      public.admin_crm_suppress('not an address', 'manual')->>'error',
      public.admin_crm_suppress('b@gcrm-probe.example', 'blocked')->>'error');
    v_txt := v_txt || ',' || (select s.reason from app.crm_suppression s where s.email_hash = encode(sha256(convert_to('ola.nordmann@gcrm-probe.example', 'UTF8')), 'hex'));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a suppression is the SHA-256 of the lower-cased, trimmed address, once; a bad address or reason is refused',
      'expected', 'true,already,invalid_email,invalid,spam', 'actual', v_txt, 'pass', v_txt = 'true,already,invalid_email,invalid,spam');

    -- 5, 6 --------------------------------------------------------------- phone notices
    v_txt := concat_ws(',',
      public.admin_consent_phone_notice('999 000 143', false)->>'ok',
      public.admin_consent_phone_notice('999000199', false)->>'error');
    perform public.admin_consent_phone_notice('999000142', true);  -- not in the CRM: the company is made from the entity
    select string_agg(concat_ws('/', co.org_number, r.purpose, r.status, r.lawful_basis, r.method, (r.contact_id is null)::text, (r.created_by = v_mkt)::text), ';' order by co.org_number)
      into v_txt from app.consent_records r join app.crm_companies co on co.id = r.company_id where co.org_number in ('999000142', '999000143');
    v_txt := v_txt || ',' || (select d.reason from app.brreg_dnc d where d.org_number = '999000142') || ','
      || (select co.source || '/' || co.stage from app.crm_companies co where co.org_number = '999000142');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a phone notice is the company''s record; an objection withdraws and goes on the do-not-contact list; an unknown number is refused',
      'expected', '999000142/phone_outreach/withdrawn/legit_interest_phone/phone_notice/true/true;999000143/phone_outreach/notice_given/legit_interest_phone/phone_notice/true/true,objected,brreg/contacted',
      'actual', v_txt,
      'pass', v_txt = '999000142/phone_outreach/withdrawn/legit_interest_phone/phone_notice/true/true;999000143/phone_outreach/notice_given/legit_interest_phone/phone_notice/true/true,objected,brreg/contacted');

    v_txt := '';
    begin
      update app.consent_records set status = 'withdrawn' where company_id = v_co;
      v_txt := 'updated';
    exception when check_violation then v_txt := 'update refused';
    end;
    begin
      delete from app.consent_records where company_id = v_co;
      v_txt := v_txt || ',deleted';
    exception when check_violation then v_txt := v_txt || ',delete refused';
    end;
    begin
      insert into app.consent_records (company_id, purpose, status, lawful_basis, method) values (v_co, 'marketing', 'granted', 'consent', 'admin');
      v_txt := v_txt || ',marketing on a company';
    exception when check_violation then v_txt := v_txt || ',only a phone notice';
    end;
    delete from app.crm_companies where id = v_co;
    v_txt := v_txt || ',' || (select count(*) from app.consent_records where company_id = v_co);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a company''s record is append-only, only a phone notice, and goes with its company',
      'expected', 'update refused,delete refused,only a phone notice,0', 'actual', v_txt, 'pass', v_txt = 'update refused,delete refused,only a phone notice,0');

    -- 3 ------------------------------------------------------------------ every write logged, no address in the log
    perform public.admin_brreg_set_dry_run(false, 'probe');
    perform public.admin_brreg_set_dry_run(true, 'probe');
    perform public.admin_crm_partner_save(null, 'Probe Regnskap AS', '999000144', 'accounting', 'Mona Probe', 'probegc', 'recurring', 20, 'pilot_signed');
    perform public.admin_consent_export();
    perform public.admin_consent();
    select string_agg(a.action || ':' || n, ',' order by a.action) into v_txt
    from (select action, count(*) as n from app.admin_audit where admin_id = v_mkt group by action) a;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'each write is logged (and the ledger''s view and export); no address reaches the log',
      'expected', 'crm.brreg_dry_run:2,crm.consent_export:1,crm.consent_view:1,crm.partner_save:1,crm.phone_notice:2,crm.suppress:1 / no @',
      'actual', v_txt || ' / ' || case when exists (select 1 from app.admin_audit a where a.admin_id = v_mkt
                                                    and (coalesce(a.target_id, '') || coalesce(a.detail::text, '') || coalesce(a.reason, '')) like '%@%') then 'an @' else 'no @' end,
      'pass', v_txt = 'crm.brreg_dry_run:2,crm.consent_export:1,crm.consent_view:1,crm.partner_save:1,crm.phone_notice:2,crm.suppress:1'
              and not exists (select 1 from app.admin_audit a where a.admin_id = v_mkt
                              and (coalesce(a.target_id, '') || coalesce(a.detail::text, '') || coalesce(a.reason, '')) like '%@%'));

    -- 7 ------------------------------------------------------------------ the generic-address rule
    v_txt := concat_ws(',', app.brreg_generic_email('post@firma.no'), app.brreg_generic_email('FirmaPost@firma.no'),
      app.brreg_generic_email('kontakt@x.no'), app.brreg_generic_email('ola.nordmann@firma.no'), app.brreg_generic_email('fornavn@firma.no'),
      app.brreg_generic_email('post.ola@firma.no'), app.brreg_generic_email('post@'), coalesce(app.brreg_generic_email(null)::text, 'null'));
    begin
      insert into app.brreg_entities (org_number, name, form_code, generic_email, active) values ('999000145', 'Named AS', 'AS', 'ola@probe.example', true);
      v_txt := v_txt || ',entity kept a name';
    exception when check_violation then v_txt := v_txt || ',entity refused';
    end;
    perform set_config('request.jwt.claims', '', true);
    v_poll := (public.brreg_poll_begin(null)->>'poll_id')::bigint;
    perform public.brreg_ingest(v_poll, jsonb_build_array(jsonb_build_object('org_number', '999000146', 'name', 'Navn AS', 'form_code', 'AS',
      'nace_code', '62.010', 'employees', 9, 'email', 'kari.nordmann@navn.example', 'active', true)));
    v_txt := v_txt || ',' || coalesce((select coalesce(generic_email, 'dropped') from app.brreg_entities where org_number = '999000146'), 'none');
    begin
      insert into app.brreg_triggers (org_number, kind, fit) values ('999000146', 'company_new', 40) returning id into v_task;
      insert into app.brreg_outreach (trigger_id, org_number, channel, status, email) values (v_task, '999000146', 'email', 'queued', 'kari.nordmann@navn.example');
      v_txt := v_txt || ',outreach took a name';
    exception when check_violation then v_txt := v_txt || ',outreach refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a generic address only: the rule, the entity, the ingest and the outreach all refuse a named one',
      'expected', 't,t,t,f,f,f,f,false,entity refused,dropped,outreach refused', 'actual', v_txt,
      'pass', v_txt = 't,t,t,f,f,f,f,false,entity refused,dropped,outreach refused');

    -- 8 ------------------------------------------------------------------ the feed's derivations
    insert into app.brreg_entities (org_number, name, form_code, nace_code, employees, active) values
      ('999000151', 'Tre Til Seks AS', 'AS', '41.200', 3, true),
      ('999000152', 'Tjueåtte AS', 'AS', '41.200', 28, true),
      ('999000153', 'Tre Til Tretti AS', 'AS', '41.200', 3, true);
    perform public.brreg_ingest(v_poll, jsonb_build_array(
      jsonb_build_object('org_number', '999000151', 'name', 'Tre Til Seks AS', 'form_code', 'AS', 'nace_code', '41.200', 'employees', 6, 'active', true),
      jsonb_build_object('org_number', '999000152', 'name', 'Tjueåtte AS', 'form_code', 'AS', 'nace_code', '41.200', 'employees', 31, 'active', true),
      jsonb_build_object('org_number', '999000153', 'name', 'Tre Til Tretti AS', 'form_code', 'AS', 'nace_code', '41.200', 'employees', 31, 'active', true),
      jsonb_build_object('org_number', '999000154', 'name', 'Lagt Til AS', 'form_code', 'AS', 'nace_code', '41.200', 'employees', 6, 'employees_op', 'add', 'active', true),
      jsonb_build_object('org_number', '999000155', 'name', 'Førstegang AS', 'form_code', 'AS', 'nace_code', '41.200', 'employees', 6, 'employees_op', 'replace', 'active', true),
      jsonb_build_object('org_number', '999000156', 'name', 'Ny Bygg AS', 'form_code', 'AS', 'nace_code', '43.210', 'employees', 7, 'is_new', true, 'active', true),
      jsonb_build_object('org_number', '999000157', 'name', 'Ny Kafe AS', 'form_code', 'AS', 'nace_code', '56.101', 'employees', 7, 'is_new', true, 'active', true),
      jsonb_build_object('org_number', '999000158', 'name', 'Ola Enkelt', 'form_code', 'ENK', 'nace_code', '41.200', 'employees', 9, 'is_new', true, 'active', true)));
    -- the same crossing again the next day raises nothing new
    update app.brreg_entities set employees = 3 where org_number = '999000151';
    perform public.brreg_ingest(v_poll, jsonb_build_array(
      jsonb_build_object('org_number', '999000151', 'name', 'Tre Til Seks AS', 'form_code', 'AS', 'nace_code', '41.200', 'employees', 6, 'active', true)));
    select string_agg(t.org_number || ':' || t.kind || ':' || coalesce(t.employees_from::text, '-') || '>' || t.employees_to, ',' order by t.org_number, t.kind)
      into v_txt from app.brreg_triggers t where t.org_number between '999000151' and '999000158';
    v_txt := v_txt || ',' || (select count(*) from app.brreg_entities where org_number = '999000158');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'crossings of 5 and 30 (the higher when both), an added count, a new target company; no first sight, no ENK, once in 180 days',
      'expected', '999000151:threshold_5:3>6,999000152:threshold_30:28>31,999000153:threshold_30:3>31,999000154:threshold_5:0>6,999000156:company_new:->7,0',
      'actual', v_txt,
      'pass', v_txt = '999000151:threshold_5:3>6,999000152:threshold_30:28>31,999000153:threshold_30:3>31,999000154:threshold_5:0>6,999000156:company_new:->7,0');

    -- 9 ------------------------------------------------------------------ fit
    v_txt := concat_ws(',',
      app.fit_score('88.911', 32, now(), null, true)->>'total',
      app.fit_score('56.101', 6, now() - interval '100 days', null, true)->>'total',
      app.fit_score('62.010', 50, now(), (now() at time zone 'Europe/Oslo')::date - 10, true)->>'total',
      app.fit_score(null, null, null, null, null)->>'total',
      app.fit_score('75.000', 101, null, null, false)->>'total',
      (select string_agg(p->>'key' || '=' || (p->>'points'), ' ' order by ord) from jsonb_array_elements(app.fit_score(null, null, null, null, null)->'parts') with ordinality x(p, ord)));
    v_txt := v_txt || ',' || (select count(*) from app.brreg_triggers t left join app.brreg_outreach o on o.trigger_id = t.id
                              where t.org_number between '999000151' and '999000158' and (t.fit >= 30) <> (o.id is not null));
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'fit 0–50 part by part (report § 7.3); outreach exactly at fit ≥ 30',
      'expected', '45,20,50,0,0,industry=15 size=15 crossed=10 manager=5 active=5,0', 'actual', v_txt,
      'pass', v_txt = '45,20,50,0,0,industry=15 size=15 crossed=10 manager=5 active=5,0');

    -- 10 ----------------------------------------------------------------- the holdout
    select count(*) filter (where app.brreg_holdout(lpad(g::text, 9, '8'))) into v_cnt from generate_series(1, 2000) g;
    v_txt := concat_ws(',', (v_cnt between 150 and 250)::text,
      (app.brreg_holdout('931204118') = app.brreg_holdout('931204118'))::text,
      (select count(*) from app.brreg_outreach o where (o.status = 'holdout') <> (app.brreg_holdout(o.org_number) and o.status <> 'do_not_contact'
                                                                                  and not exists (select 1 from app.brreg_dnc d where d.org_number = o.org_number)))::text);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the holdout is a hash of the number: stable, about 10 %, and exactly the rows held out',
      'expected', 'true,true,0', 'actual', v_txt || ' (' || v_cnt || ' of 2000)', 'pass', v_txt = 'true,true,0');

    -- 11 ----------------------------------------------------------------- dry run, assigning, done
    select count(*) into v_cnt from app.brreg_outreach o where o.status = 'queued' and o.org_number like '9990001%' and o.activity_id is not null;
    v_txt := v_cnt::text;
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_brreg_set_dry_run(false, 'probe go-live');
    select o.activity_id into v_task from app.brreg_outreach o where o.org_number = '999000152';
    v_txt := v_txt || ',' || coalesce(v_json->>'assigned', '?') || ',' ||
      (select count(*) from app.brreg_outreach o where o.org_number like '9990001%' and o.status = 'queued') || ',' ||
      (select concat_ws('/', a.kind, a.origin, a.rule, a.task_kind, a.body, co.source, co.org_number) from app.crm_activities a join app.crm_companies co on co.id = a.company_id where a.id = v_task);
    update app.crm_activities set done_at = now() where id = v_task;
    v_txt := v_txt || ',' || (select status from app.brreg_outreach where activity_id = v_task);
    update app.crm_activities set done_at = null where id = v_task;
    v_txt := v_txt || ',' || (select status from app.brreg_outreach where activity_id = v_task);
    perform public.admin_brreg_set_dry_run(true, 'probe back');
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'dry run assigns nothing; switched off the queue becomes tasks (R11); done is sent, reopened assigned',
      'expected', '0,' || (select count(*) from app.brreg_outreach o where o.org_number like '9990001%' and o.status in ('assigned', 'sent')) || ',0,task/trigger/R11/letter/auto:outreach_letter/brreg/999000152,sent,assigned',
      'actual', v_txt,
      'pass', v_txt = '0,' || (select count(*) from app.brreg_outreach o where o.org_number like '9990001%' and o.status in ('assigned', 'sent')) || ',0,task/trigger/R11/letter/auto:outreach_letter/brreg/999000152,sent,assigned');

    -- 12 ----------------------------------------------------------------- HTTP 410
    select count(*) into v_cnt from app.brreg_purges;
    insert into app.brreg_dnc (org_number, reason) values ('999000152', 'manual');
    perform set_config('request.jwt.claims', '', true);
    perform public.brreg_purge('999000152');
    v_txt := concat_ws(',',
      (select count(*) from app.brreg_entities where org_number = '999000152'),
      (select count(*) from app.brreg_triggers where org_number = '999000152'),
      (select count(*) from app.brreg_outreach where org_number = '999000152'),
      (select count(*) from app.brreg_dnc where org_number = '999000152'),
      (select count(*) from app.crm_companies where org_number = '999000152'),
      (select count(*) from app.crm_activities where id = v_task),
      (select count(*) from app.brreg_purges) - v_cnt,
      (select string_agg(column_name, '/' order by ordinal_position) from information_schema.columns where table_schema = 'app' and table_name = 'brreg_purges'));
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a 410 purges the entity, its triggers, outreach, list entry, company and task; only a count stays',
      'expected', '0,0,0,0,0,0,1,id/purged_at', 'actual', v_txt, 'pass', v_txt = '0,0,0,0,0,0,1,id/purged_at');

    -- 13 ----------------------------------------------------------------- polls
    perform public.brreg_poll_end(v_poll, 12, 25281792, 4677262, null);
    v_txt := concat_ws(',', (select status || '/' || changes from app.brreg_polls where id = v_poll),
      (select feed_cursor || '/' || roles_cursor from app.brreg_settings));
    v_poll := (public.brreg_poll_begin(null)->>'poll_id')::bigint;
    v_txt := v_txt || ',' || coalesce(public.brreg_poll_begin(null)->>'error', 'ok');
    perform public.brreg_poll_end(v_poll, 0, 25281700, null, 'feed_503');
    v_txt := v_txt || ',' || (select status || '/' || error from app.brreg_polls where id = v_poll) || ',' || (select feed_cursor from app.brreg_settings);
    delete from app.brreg_polls where requested_at > now() - interval '2 hours';
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_brreg_poll_now()->>'error', 'ok');
    perform vault.create_secret('https://probe.invalid/functions/v1/orgpuls-dispatch', 'orgpuls_dispatch_url');
    perform vault.create_secret('probe-secret', 'orgpuls_dispatch_secret');
    v_json := public.admin_brreg_poll_now();
    v_txt := v_txt || ',' || coalesce(v_json->>'ok', 'x') || ',' || coalesce(public.admin_brreg_poll_now()->>'error', 'ok') || ','
      || (select source || '/' || status || '/' || (requested_by = v_mkt) from app.brreg_polls where id = (v_json->>'poll_id')::bigint) || ','
      || (select count(*) from app.admin_audit where admin_id = v_mkt and action = 'crm.brreg_poll');
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'a poll ends with its count and the feeds'' place; one at a time; a failure keeps the place; poll now needs the vault, once in 15 minutes, logged',
      'expected', 'done/12,25281792/4677262,busy,failed/feed_503,25281792,not_configured,true,rate_limited,manual/requested/true,1', 'actual', v_txt,
      'pass', v_txt = 'done/12,25281792/4677262,busy,failed/feed_503,25281792,not_configured,true,rate_limited,manual/requested/true,1');

    -- 14 ----------------------------------------------------------------- working minutes, the SLA
    v_txt := concat_ws(',',
      app.business_minutes('2026-10-02 15:30+02', '2026-10-05 08:30+02'),
      app.business_minutes('2026-05-15 15:00+02', '2026-05-18 09:00+02'),
      app.business_minutes('2026-10-05 09:00+02', '2026-10-05 08:40+02'),
      app.business_minutes('2026-10-03 10:00+02', '2026-10-03 12:00+02'),
      to_char(app.add_business_hours('2026-10-02 15:30+02', 1) at time zone 'Europe/Oslo', 'Dy HH24:MI'));
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'working minutes skip nights, weekends and 17 May; the SLA is one working hour',
      'expected', '60,120,-20,0,Mon 08:30', 'actual', v_txt, 'pass', v_txt = '60,120,-20,0,Mon 08:30');

    -- 15, 16 -------------------------------------------------------------- lead scoring and routing
    insert into app.crm_companies (name, org_number, nace_code, employees, source, stage) values ('Probe Bygg AS', '999000141', '41.200', 12, 'brreg', 'engaged') returning id into v_co;
    insert into app.brreg_triggers (org_number, kind, fit, raised_at) values ('999000141', 'threshold_5', 45, now() - interval '10 days');
    insert into app.crm_contacts (email, name, source, basis, status, company_id) values ('leder@probe-bygg.example', 'Leder Probe', 'manual', 'none', 'active', v_co) returning id into v_ct;
    insert into app.organizations (id, name, org_number, employee_count) values (v_trial, 'Probe Prøve AS', '999000147', 40);
    insert into app.crm_companies (name, org_number, employees, source, stage, org_id) values ('Probe Prøve AS', '999000147', 40, 'signup', 'trial', v_trial) returning id into v_co2;
    insert into app.crm_contacts (email, name, source, basis, status, company_id) values ('dl@probe-prove.example', 'Dagny Probe', 'user', 'none', 'active', v_co2) returning id into v_ct2;
    insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key) values ('action_item.created', now(), v_trial, '{"measure_kind":"standard"}', 'trigger', 'gcrm-probe');
    v_json := app.lead_score(v_ct);
    v_txt := concat_ws(',', v_json->>'fit', v_json->>'intent', v_json->>'total', v_json->>'route', v_json->>'stage',
      (select count(*) from jsonb_array_elements(v_json->'intent_parts') p where not (p->>'sourced')::boolean));
    insert into app.demo_requests (at, email, domain, network, consent, lang) values (now() - interval '30 minutes', 'leder@probe-bygg.example', 'probe-bygg.example', md5('gcrm'), false, 'no');
    v_json := app.lead_score(v_ct);
    v_txt := v_txt || '|' || concat_ws(',', v_json->>'fit', v_json->>'intent', v_json->>'total', v_json->>'route');
    v_json := app.lead_score(v_ct2);
    v_txt := v_txt || '|' || concat_ws(',', v_json->>'stage', v_json->>'pql', v_json->>'route');
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'fit + intent; five intent signals unsourced; a hand-raise routes to the founder; a trial by the PQL rule',
      'expected', '45,0,45,nurture,lead,5|45,10,55,founder|trial,activated,pql', 'actual', v_txt,
      'pass', v_txt = '45,0,45,nurture,lead,5|45,10,55,founder|trial,activated,pql');

    -- a second person at the trial: its PQL is the company's, made once
    insert into app.crm_contacts (email, name, source, basis, status, company_id) values ('vo@probe-prove.example', 'Vera Probe', 'user', 'none', 'active', v_co2);
    v_cnt := app.lead_route();
    v_txt := concat_ws(',',
      (select string_agg(concat_ws('/', a.rule, a.body, a.task_kind, (a.sla_due_at is not null)::text), ';' order by a.rule)
       from app.crm_activities a where a.contact_id in (v_ct, v_ct2) and a.origin = 'rule'),
      (select (a.sla_due_at = app.add_business_hours(now() - interval '30 minutes', 1))::text from app.crm_activities a where a.contact_id = v_ct and a.origin = 'rule'),
      app.lead_route()::text);
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'routing makes a callback on the SLA from the hand-raise (R10) and one PQL task per trial company (R2), each once',
      'expected', 'R10/auto:callback_hand_raise/call/true;R2/auto:pql_trial/call/false,true,0', 'actual', v_txt,
      'pass', v_txt = 'R10/auto:callback_hand_raise/call/true;R2/auto:pql_trial/call/false,true,0');

    -- 17 ----------------------------------------------------------------- the task list
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_json := public.admin_crm_task_list('open');
    select concat_ws('/', r->>'origin', r->>'rule', ((r->>'sla_left')::int between 1 and 60)::text, coalesce(r->>'sla_met', 'null'))
      into v_txt from jsonb_array_elements(v_json->'rows') r where r->>'body' = 'auto:callback_hand_raise' and (r->>'contact') = 'Leder Probe';
    update app.crm_activities set done_at = sla_due_at - interval '1 minute' where contact_id = v_ct and origin = 'rule';
    v_json := public.admin_crm_task_list('done');
    v_txt := v_txt || ',' || (select r->>'sla_met' from jsonb_array_elements(v_json->'rows') r where r->>'contact' = 'Leder Probe') || ','
      || ((v_json->'counts'->>'automated')::int >= 2)::text || ',' || ((v_json->'counts'->>'sla_open')::int >= 0)::text;
    v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'a callback shows the working minutes left, then whether it was met; the head counts what rules made',
      'expected', 'rule/R10/true/null,true,true,true', 'actual', v_txt, 'pass', v_txt = 'rule/R10/true/null,true,true,true');

    -- 18, 19 -------------------------------------------------------------- partners and the referral code
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := concat_ws(',',
      public.admin_crm_partner_save(null, 'Probe Andre AS', null, 'bht', null, 'PROBEGC', null, null, 'in_talks')->>'error',
      public.admin_crm_partner_save(null, 'Probe Tredje AS', null, 'bht', null, 'bad code!', null, null, 'in_talks')->>'error',
      public.admin_crm_partner_save(null, 'Probe Fjerde AS', null, 'kurs', null, null, null, null, 'in_talks')->>'error',
      public.admin_crm_partner_save(null, 'Probe Femte AS', null, 'bransje', null, null, 'member_discount', 10, 'in_talks')->>'error',
      (select referral_code || '/' || share_kind || '/' || share_pct from app.partners where name = 'Probe Regnskap AS'));
    v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'a partner''s code is unique and upper-cased; a bad code, kind or share is refused',
      'expected', 'code_taken,invalid,invalid,invalid,PROBEGC/recurring/20', 'actual', v_txt,
      'pass', v_txt = 'code_taken,invalid,invalid,invalid,PROBEGC/recurring/20');

    perform set_config('request.jwt.claims', '', true);
    perform public.track_web_event('192.0.2.143', v_ua, 'view', '/gcrm-probe', null, '{"ref":" probegc "}', null);
    perform public.track_web_event('192.0.2.143', v_ua, 'view', '/gcrm-probe/registrer', null, '{"ref":"not a code!"}', null);
    v_vis := app.web_visitor('192.0.2.143', v_ua);
    v_txt := (select string_agg(coalesce(ref_code, '-'), ',' order by id) from app.web_events where visitor = v_vis and path like '/gcrm-probe%');
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Probe Henvist AS', '999000148', 12);
    insert into app.profiles (id, full_name) values (v_dl, 'Dina Probe') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder');
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal1'), true);
    perform public.record_signup_source('192.0.2.143', v_ua);
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_json := public.admin_crm_partners();
    v_txt := v_txt || ',' || coalesce((select p.name from app.org_attribution a join app.partners p on p.id = a.partner_id where a.org_id = v_org), 'none') || ','
      || (select concat_ws('/', r->>'trials_30', r->>'trials_7') from jsonb_array_elements(v_json->'rows') r where r->>'code' = 'PROBEGC');
    v_rows := v_rows || jsonb_build_object('seq', 19, 'name', '?ref= travels as a tag to the organisation at signup and counts as the partner''s trial',
      'expected', 'PROBEGC,-,Probe Regnskap AS,1/1', 'actual', v_txt, 'pass', v_txt = 'PROBEGC,-,Probe Regnskap AS,1/1');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 20 ------------------------------------------------------------------ nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@gcrm-probe.example'
    union all select org_number from app.brreg_entities where org_number like '999000%'
    union all select id::text from app.partners where name like 'Probe %'
    union all select id::text from app.organizations where id in (v_org, v_trial)
    union all select email from app.crm_contacts where email like '%@probe-%.example'
    union all select id::text from app.web_events where path like '/gcrm-probe%'
    union all select name from vault.secrets where name in ('orgpuls_dispatch_url', 'orgpuls_dispatch_secret') and secret is not null
                                                and created_at > now() - interval '1 minute') x;
  v_rows := v_rows || jsonb_build_object('seq', 20, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._gcrm
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._gcrm order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._gcrm;
  if v_failed is not null then raise exception 'growth crm invariants failed: %', v_failed; end if;
  if v_count <> 20 then raise exception 'growth crm invariants: expected 20 rows, got %', v_count; end if;
end $$;
