-- crm_invariants.sql — the marketing CRM (0055, D-101).
--
--   * the CRM's tables have RLS on, no policy and no client privilege (1)
--   * anyone may sign up, confirm or unsubscribe; only the admin reads; only the service role
--     sends or records events (2)
--   * respondents are never contacts: nothing references or reads the employee, invitation or
--     answer tables, and the sync takes only account holders (3, 4)
--   * an account's basis follows its organisation's plan; consent is never downgraded (5)
--   * the existing-customer exception is off until turned on (6)
--   * the newsletter signup is double opt-in: pending until the mailed token is used (7, 8)
--   * an import row without a consent source is refused (9)
--   * a segment filter of unknown keys is refused; a valid one selects (10)
--   * a campaign needs a segment; starting it queues only mailable contacts, and the address
--     is gone once sent (11, 12)
--   * one-click unsubscribe works on the mail's token, which is kept only as a hash (13)
--   * opens and clicks are kept for CRM sends only; a hard bounce suppresses (14, 15)
--   * roles: support no, analyst reads, marketing writes only with a second factor, audited (16)
--   * nothing written here survives (17)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_invariants.sql

create unlogged table if not exists public._crm(seq int, name text, expected text, actual text, pass bool);
truncate public._crm;

do $$
declare
  v_org      uuid := '00000000-0000-4000-8000-000000000001';
  v_mkt      uuid := '00000000-0000-4000-8000-0000000c4301';
  v_ana      uuid := '00000000-0000-4000-8000-0000000c4302';
  v_sup      uuid := '00000000-0000-4000-8000-0000000c4303';
  v_dl       uuid;
  v_rows     jsonb := '[]';
  v_json     jsonb;
  v_jobs     jsonb;
  v_txt      text;
  v_ok       boolean;
  v_cnt      int;
  v_id       uuid;
  v_seg      uuid;
  v_camp     uuid;
  v_token    text;
  v_send     uuid;
  v_before   int;
  claims     constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  -- 1 ------------------------------------------------------------------ RLS, no policy, no grant
  select bool_and(c.relrowsecurity) into v_ok from pg_class c
  where c.oid in ('app.crm_contacts'::regclass, 'app.crm_suppression'::regclass, 'app.crm_segments'::regclass,
                  'app.crm_campaigns'::regclass, 'app.crm_sends'::regclass, 'app.crm_settings'::regclass);
  v_ok := v_ok and not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'app'
      and g.table_name like 'crm\_%' and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename like 'crm\_%');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'CRM tables have RLS on, no policy and no client privilege', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  -- 2 ------------------------------------------------------------------ who may call what
  v_txt := concat_ws(',',
    has_function_privilege('anon', 'public.crm_newsletter_signup(text,text,text,text,text,text,text[])', 'execute'),
    has_function_privilege('anon', 'public.crm_confirm(text)', 'execute'),
    has_function_privilege('anon', 'public.crm_unsubscribe(text,text)', 'execute'),
    has_function_privilege('anon', 'public.admin_crm_contacts(text,text,int)', 'execute'),
    has_function_privilege('authenticated', 'public.crm_mail_claim(int)', 'execute'),
    has_function_privilege('authenticated', 'public.record_crm_event(text,text,timestamptz,text)', 'execute'),
    has_function_privilege('authenticated', 'app.crm_sync()', 'execute'),
    has_function_privilege('service_role', 'public.crm_mail_claim(int)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'anyone signs up or unsubscribes; only the service role sends',
    'expected', 't,t,t,f,f,f,f,t', 'actual', v_txt, 'pass', v_txt = 't,t,t,f,f,f,f,t');

  -- 3 ------------------------------------------------------------------ respondents are never contacts
  v_ok := not exists (
      select 1 from pg_constraint k
      where k.contype = 'f' and k.conrelid::regclass::text like 'app.crm\_%'
        and k.confrelid::regclass::text in ('app.employees', 'app.invitations', 'app.responses', 'app.answers', 'app.extra_answers', 'app.response_comments'))
    and not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (p.proname like 'crm\_%' or p.proname like 'admin\_crm\_%' or p.proname = 'record_crm_event')
        and p.prosrc ~* 'app\.(employees|invitations|responses|answers|extra_answers|response_comments)\M');
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no CRM table or function touches employees, invitations or answers',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  begin
    perform app.crm_sync();
    -- 4: every synced contact is an account holder with a membership
    select count(*) into v_cnt from app.crm_contacts c
    where c.source = 'user' and (c.user_id is null or not exists (select 1 from app.memberships m where m.user_id = c.user_id));
    v_before := (select count(*) from app.crm_contacts where source = 'user');
    v_ok := v_cnt = 0 and v_before = (select count(distinct m.user_id) from app.memberships m join auth.users u on u.id = m.user_id
                                        where u.email is not null)
      and not exists (select 1 from app.crm_contacts c where c.source = 'user' and c.email in (
            select lower(e.email) from app.employees e where e.email is not null
            except select lower(u.email) from auth.users u join app.memberships m on m.user_id = u.id));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the sync takes account holders only, never a registered employee',
      'expected', 'true', 'actual', v_ok::text || ' (' || v_before || ' accounts)', 'pass', v_ok);

    -- 5 ---------------------------------------------------------------- basis follows the plan
    update app.billing set plan = 'small', invoice_email = 'faktura@probe.example', confirmed_at = now() where org_id = v_org;
    perform app.crm_sync();
    v_txt := (select basis from app.crm_contacts where user_id = v_dl);
    update app.crm_contacts set basis = 'consent', consent_at = now(), consent_source = 'probe consent' where user_id = v_dl;
    update app.billing set confirmed_at = null where org_id = v_org;
    perform app.crm_sync();
    v_txt := v_txt || ',' || (select basis from app.crm_contacts where user_id = v_dl);
    update app.crm_contacts set basis = 'none', consent_at = null, consent_source = null where user_id = v_dl;
    perform app.crm_sync();
    v_txt := v_txt || ',' || (select basis from app.crm_contacts where user_id = v_dl);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a paying customer''s basis is customer; consent is never downgraded',
      'expected', 'customer,consent,none', 'actual', v_txt, 'pass', v_txt = 'customer,consent,none');

    -- 6 ---------------------------------------------------------------- the exception is off
    update app.billing set confirmed_at = now() where org_id = v_org;
    perform app.crm_sync();
    update app.crm_contacts set last_engaged_at = now() where user_id = v_dl;
    v_txt := (select app.crm_mailable(c)::text from app.crm_contacts c where c.user_id = v_dl);
    update app.crm_settings set customer_exception = true;
    v_txt := v_txt || ',' || (select app.crm_mailable(c)::text from app.crm_contacts c where c.user_id = v_dl);
    update app.crm_settings set customer_exception = false;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a customer without consent is mailable only with the exception on',
      'expected', 'false,true', 'actual', v_txt, 'pass', v_txt = 'false,true');

    -- 7, 8 ------------------------------------------------------------- double opt-in
    v_json := public.crm_newsletter_signup('Ny.Leser@Probe-CRM.example', 'Ny Leser', 'Probe AS', 'no', 'newsletter', null);
    perform public.crm_newsletter_signup('ny.leser@probe-crm.example', 'Ny Leser', 'Probe AS', 'no', 'newsletter', null);
    select count(*) into v_cnt from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id
    where c.email = 'ny.leser@probe-crm.example' and s.kind = 'optin';
    v_txt := (select c.status || '/' || c.basis || '/' || app.crm_mailable(c)::text from app.crm_contacts c where c.email = 'ny.leser@probe-crm.example');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a signup is pending, not mailable, and mailed once',
      'expected', 'ok: pending/none/false, 1 confirmation', 'actual', coalesce(v_json->>'ok', '?') || ': ' || v_txt || ', ' || v_cnt || ' confirmation',
      'pass', v_json->>'ok' = 'true' and v_txt = 'pending/none/false' and v_cnt = 1);

    v_jobs := public.crm_mail_claim(50);
    select j->>'token', (j->>'id')::uuid into v_token, v_send from jsonb_array_elements(v_jobs) j
    where j->>'kind' = 'optin' and j->>'to_email' = 'ny.leser@probe-crm.example';
    perform public.crm_mail_done(v_send, true, '<probe-crm-optin@relay.example>', null, false);
    v_txt := coalesce(public.crm_confirm(repeat('0', 64))->>'error', 'ok');
    v_json := public.crm_confirm(v_token);
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok') || ',' ||
      (select c.status || '/' || c.basis || '/' || coalesce(c.consent_source, '-') || '/' || app.crm_mailable(c)::text
       from app.crm_contacts c where c.email = 'ny.leser@probe-crm.example')
      || ',' || coalesce((select to_email from app.crm_sends where id = v_send), 'cleared');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'only the mailed token confirms; consent gets its date and source',
      'expected', 'expired,ok,active/consent/double opt-in (newsletter)/true,cleared', 'actual', v_txt,
      'pass', v_txt = 'expired,ok,active/consent/double opt-in (newsletter)/true,cleared');

    -- 9 ---------------------------------------------------------------- import
    insert into auth.users (id, email) values (v_mkt, 'marketing@crm-test.example'), (v_ana, 'analyst@crm-test.example'), (v_sup, 'support@crm-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst'), (v_sup, 'support');
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash('sperret@probe-crm.example'), 'unsubscribed');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_crm_import(jsonb_build_array(
      jsonb_build_object('email', 'uten.samtykke@probe-crm.example', 'name', 'Uten'),
      jsonb_build_object('email', 'messe@probe-crm.example', 'name', 'Messe', 'consent_source', 'Arendalsuka 2026, påmeldingsskjema',
                         'consent_at', '2026-08-14', 'role', 'hr', 'tags', 'messe;hr'),
      jsonb_build_object('email', 'sperret@probe-crm.example', 'consent_source', 'gammel liste'),
      jsonb_build_object('email', 'ikke-en-adresse', 'consent_source', 'x liste')));
    v_txt := concat_ws(',', v_json->>'inserted', v_json->>'suppressed', (select string_agg(r->>'reason', '+' order by (r->>'row')::int) from jsonb_array_elements(v_json->'rejected') r),
      (select c.basis || '/' || c.role || '/' || array_to_string(c.tags, ';') from app.crm_contacts c where c.email = 'messe@probe-crm.example'),
      (select app.crm_mailable(c)::text from app.crm_contacts c where c.email = 'sperret@probe-crm.example'));
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'an import row needs a consent source; a suppressed address stays suppressed',
      'expected', '2,1,consent_required+invalid_email,consent/hr/hr;messe,false', 'actual', v_txt,
      'pass', v_txt = '2,1,consent_required+invalid_email,consent/hr/hr;messe,false');

    -- 10 --------------------------------------------------------------- segments
    v_txt := coalesce(public.admin_crm_segment_save(null, 'Probe ugyldig', '{"sql":"drop table x"}')->>'error', 'ok');
    v_json := public.admin_crm_segment_save(null, 'Probe HR fra messe', '{"types":["prospect"],"tags":["messe"]}');
    v_seg := (v_json->>'id')::uuid;
    v_json := public.admin_crm_segment_preview('{"types":["prospect"],"tags":["messe"]}');
    v_txt := v_txt || ',' || coalesce(v_json->>'total', '?') || '/' || coalesce(v_json->>'mailable', '?');
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'an unknown filter key is refused; a valid filter selects',
      'expected', 'invalid_filter,1/1', 'actual', v_txt, 'pass', v_txt = 'invalid_filter,1/1');

    -- 11, 12 ----------------------------------------------------------- a campaign
    insert into app.crm_contacts (email, source, basis, status, consent_at, consent_source, tags)
    values ('avmeldt@probe-crm.example', 'import', 'consent', 'unsubscribed', now(), 'probe liste', '{messe}');
    v_json := public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Probe høstbrev', 'subject', 'Nytt fra Orgpuls',
      'blocks', jsonb_build_array(jsonb_build_object('type', 'heading', 'text', 'Hei'), jsonb_build_object('type', 'text', 'text', 'Nyheter.'),
                                  jsonb_build_object('type', 'button', 'text', 'Les mer', 'url', 'https://www.orgpuls.com/lovkrav'))));
    v_camp := (v_json->>'id')::uuid;
    v_txt := coalesce(public.admin_crm_campaign_schedule(v_camp, now())->>'error', 'ok');
    perform public.admin_crm_campaign_save(v_camp, jsonb_build_object('name', 'Probe høstbrev', 'segment_id', v_seg));
    v_txt := v_txt || ',' || coalesce(public.admin_crm_campaign_schedule(v_camp, now())->>'error', 'ok')
      || ',' || (select utm_campaign from app.crm_campaigns where id = v_camp);
    perform set_config('request.jwt.claims', '', true);
    v_jobs := public.crm_mail_claim(50);
    select count(*) into v_cnt from app.crm_sends s where s.campaign_id = v_camp and s.kind = 'campaign';
    v_txt := v_txt || ',' || v_cnt || ',' || coalesce((select string_agg(j->>'to_email', ';') from jsonb_array_elements(v_jobs) j
                                                         where j->'campaign'->>'utm_campaign' = 'probe-hostbrev'), '-');
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'a campaign needs a segment; starting it queues only mailable contacts',
      'expected', 'no_segment,ok,probe-hostbrev,1,messe@probe-crm.example', 'actual', v_txt,
      'pass', v_txt = 'no_segment,ok,probe-hostbrev,1,messe@probe-crm.example');

    select j->>'token', (j->>'id')::uuid into v_token, v_send from jsonb_array_elements(v_jobs) j where j->>'to_email' = 'messe@probe-crm.example';
    perform public.crm_mail_done(v_send, true, '<probe-crm-1@relay.example>', null, false);
    v_txt := (select coalesce(s.to_email, 'cleared') || ',' || s.status from app.crm_sends s where s.id = v_send);
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'the address is cleared once the provider has the mail',
      'expected', 'cleared,sent', 'actual', v_txt, 'pass', v_txt = 'cleared,sent');

    -- 14, 15 ----------------------------------------------------------- events
    -- each call its own statement: a statement's subqueries do not see what its own calls wrote
    v_txt := public.record_crm_event('opened', 'probe-crm-1@relay.example', now())->>'matched';
    v_txt := v_txt || ',' || (public.record_crm_event('click', '<probe-crm-1@relay.example>', now())->>'matched');
    v_txt := v_txt || ',' || (public.record_crm_event('opened', 'probe-crm-transactional@relay.example', now())->>'matched');
    v_txt := concat_ws(',', v_txt,
      (select (s.opened_at is not null and s.clicked_at is not null)::text from app.crm_sends s where s.id = v_send),
      (select (c.last_engaged_at > now() - interval '1 minute')::text from app.crm_contacts c where c.email = 'messe@probe-crm.example'));
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'opens and clicks are kept for CRM sends only',
      'expected', 'true,true,false,true,true', 'actual', v_txt, 'pass', v_txt = 'true,true,false,true,true');

    -- 13 --------------------------------------------------------------- one-click unsubscribe
    v_ok := not exists (select 1 from app.crm_sends s where s.unsub_hash = v_token)
      and exists (select 1 from app.crm_sends s where s.id = v_send and s.unsub_hash = app.crm_token_hash(v_token));
    v_json := public.crm_unsubscribe(v_token);
    v_txt := coalesce(v_json->>'ok', '?') || ',' || (select c.status from app.crm_contacts c where c.email = 'messe@probe-crm.example')
      || ',' || app.crm_suppressed('Messe@Probe-CRM.example')::text || ',' || coalesce(public.crm_unsubscribe(repeat('a', 64))->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'the mail''s token unsubscribes at once; only its hash is kept',
      'expected', 'hash only: true,unsubscribed,true,invalid', 'actual', 'hash only: ' || v_txt,
      'pass', v_ok and v_txt = 'true,unsubscribed,true,invalid');

    -- 15 hard bounce
    update app.crm_contacts set status = 'active' where email = 'messe@probe-crm.example';
    delete from app.crm_suppression where email_hash = app.crm_hash('messe@probe-crm.example');
    perform public.record_crm_event('hard_bounce', 'probe-crm-1@relay.example', now());
    v_txt := (select s.delivery::text from app.crm_sends s where s.id = v_send) || ',' || app.crm_suppressed('messe@probe-crm.example')::text;
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'a hard bounce marks the send and suppresses the address',
      'expected', 'hard_bounce,true', 'actual', v_txt, 'pass', v_txt = 'hard_bounce,true');

    -- 16 --------------------------------------------------------------- roles
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := coalesce(public.admin_crm_contacts(null, null, 5)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_contacts(null, null, 5)->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_segment_delete(v_seg)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal1'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_campaigns()->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_campaigns()->>'error', 'ok');
    v_ok := exists (select 1 from app.admin_audit a where a.admin_id = v_mkt and a.action = 'crm.import')
      and exists (select 1 from app.admin_audit a where a.admin_id = v_mkt and a.action = 'crm.campaign_schedule');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'support no; analyst reads only; marketing needs the second factor; audited',
      'expected', 'not_allowed,ok,not_allowed,not_allowed,ok audited', 'actual', v_txt || case when v_ok then ' audited' else ' not audited' end,
      'pass', v_txt = 'not_allowed,ok,not_allowed,not_allowed,ok' and v_ok);

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from app.crm_contacts where email like '%@probe-crm.example';
  v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'every probe row was rolled back', 'expected', '0',
    'actual', v_cnt::text,
    'pass', v_cnt = 0 and not exists (select 1 from auth.users where email like '%@crm-test.example')
      and not exists (select 1 from app.crm_campaigns where name like 'Probe %')
      and (select customer_exception from app.crm_settings) = false);

  insert into public._crm
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._crm order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._crm;
  if v_failed is not null then raise exception 'crm invariants failed: %', v_failed; end if;
  if v_count <> 17 then raise exception 'crm invariants: expected 17 rows, got %', v_count; end if;
end $$;

drop table public._crm;
