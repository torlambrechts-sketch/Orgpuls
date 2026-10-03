-- crm_restore_invariants.sql — soft delete, the restore list and the purge (0195, D-210), proved against the
-- live schema.
--
--   * structure: the flag on every CRM record table, the approval table closed to clients, the calls closed
--     to anon and the engine to every client, both rules and the job in place (1)
--   * every function that reads a CRM record table leaves a deleted row out, or is on the reviewed list
--     below with its reason; a new reader that does neither fails here (2)
--   * a deleted company leaves the lists, the counts, the pipeline and its own page; its live activities go
--     with it; the event, the audit row and the version: one event, no changelog line, no version (3)
--   * a deleted contact is never mailed, is in no segment and no list, keeps its address (adding it again or
--     importing it points to the restore list) (4)
--   * a restore brings back the record with its links: memberships, consent records, the company link, the
--     activities that went with the company, mailability (5)
--   * an activity that went with its company is not listed or restored on its own; one deleted on its own
--     waits for its company (6)
--   * the job removes what is older than the window and nothing younger; unlimited keeps everything; a
--     purged company takes its activities and unlinks its contacts, and its history goes with it (7)
--   * second-admin approval on: a bulk delete waits, its requester cannot approve it, another admin can; a
--     single delete is immediate (8)
--   * the preview names and counts; who may delete, read the list and delete permanently (9)
--   * a person proving their address again (double opt-in) brings a deleted contact back (10)
--   * typed reasons on: a delete without one is refused (11)
--   * nothing written here survives (12)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_restore_invariants.sql

create unlogged table if not exists public._cri(seq int, name text, expected text, actual text, pass bool);
truncate public._cri;

do $$
declare
  v_mkt   uuid := '00000000-0000-4000-8000-0000000c9501';
  v_mkt2  uuid := '00000000-0000-4000-8000-0000000c9502';
  v_ana   uuid := '00000000-0000-4000-8000-0000000c9503';
  v_sup   uuid := '00000000-0000-4000-8000-0000000c9504';
  v_su    uuid := '00000000-0000-4000-8000-0000000c9505';
  claims  text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  -- every function that reads app.crm_companies, app.crm_contacts or app.crm_activities without naming
  -- deleted_at, and why that is right (0195 review)
  v_reviewed text[] := array[
    'admin_consent()',                              -- the consent ledger: evidence outlives a deletion
    'admin_consent_export()',                       -- the same ledger, exported
    'admin_consent_phone_notice(text,boolean)',     -- an objection is recorded against the company, deleted or not
    'admin_crm_contact_action(uuid,text,text)',     -- unsubscribing and erasure are never blocked by the restore list
    'admin_crm_history(text,uuid,bigint)',          -- a deleted record's history stays readable until the purge
    'admin_crm_journeys()',                         -- figures of what was sent: history, not the current list
    'admin_crm_known_orgnrs(text[])',               -- a deleted company still holds its number: the picker marks it known
    'admin_crm_sequence(uuid)',                     -- figures of what was sent
    'admin_crm_stage_save(text,jsonb)',             -- a deleted company keeps its stage, so the stage stays in use
    'admin_lead_scores()',                          -- its rows come from app.lead_contacts(), which filters
    'app.brreg_purge_org(text)',                    -- the register's purge removes a deleted company as well
    'app.brreg_suppression_reroute()',              -- reroutes by address, deleted or not
    'app.consent_derive(uuid,text)',                -- consent bookkeeping follows every contact
    'app.consent_on_suppression()',                 -- the same
    'app.consent_records_guard()',                  -- existence, not visibility
    'app.consent_sync(uuid)',                       -- consent bookkeeping
    'app.crm_advance(uuid,text,text)',              -- the plan moves a company's stage, deleted or not
    'app.crm_changes_guard()',                      -- existence, not visibility
    'app.crm_follow_done(app.crm_campaigns)',       -- whether a step has finished: history
    'app.crm_log(uuid,uuid,text,text,date)',        -- writes for a caller that has checked
    'app.crm_record_label(text,uuid)',              -- names a deleted record for the restore list
    'app.crm_stage_changes_guard()',                -- existence, not visibility
    'app.crm_sync()',                               -- the account sync keeps a deleted contact current, and deleted
    'app.delete_organisation(uuid,text,uuid)',      -- an organisation's deletion removes deleted contacts too
    'app.growth_doi(text)',                         -- a growth figure over what the database holds
    'app.growth_firewall()',                        -- the firewall counts every held row: deleted is still held
    'app.growth_gate_value(text)',                  -- a growth figure over what the database holds
    'app.lead_route()',                             -- its rows come from app.lead_contacts(), which filters
    'app.lead_score(uuid)',                         -- scores a contact it is given
    'crm_mail_done(uuid,boolean,text,text,boolean)',-- the result of a send already claimed
    'crm_newsletter_signup(text,text,text,text,text,text,text[])', -- the opt-in mail goes; confirming brings the contact back
    'crm_preferences(text)',                        -- the recipient's own link always works
    'crm_set_preferences(text,text[],boolean)',     -- the same
    'crm_unsubscribe(text,text)',                   -- the same
    'record_crm_event(text,text,timestamp with time zone,text)'  -- engagement is recorded, deleted or not
  ];
  v_rows  jsonb := '[]';
  v_json  jsonb;
  v_txt   text;
  v_ok    boolean;
  v_list  uuid := (select l.id from app.crm_lists l where l.key = 'nyhetsbrev');
  v_co    uuid;
  v_co2   uuid;
  v_ct    uuid;
  v_ct2   uuid;
  v_task  uuid;
  v_note  uuid;
  v_req   uuid;
  v_n     int;
begin
  -- 1 ---------------------------------------------------------------- structure
  v_ok := (select count(*) from information_schema.columns where table_schema = 'app'
           and table_name in ('crm_companies', 'crm_contacts', 'crm_activities') and column_name in ('deleted_at', 'deleted_by', 'deleted_source')) = 9
    and (select c.relrowsecurity from pg_class c where c.oid = 'app.crm_delete_requests'::regclass)
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename = 'crm_delete_requests')
    and not has_table_privilege('authenticated', 'app.crm_delete_requests', 'select,insert,update,delete')
    and not exists (select 1 from unnest(array['public.admin_crm_delete(text,uuid[],text)', 'public.admin_crm_delete_preview(text,uuid[])',
                      'public.admin_crm_delete_decide(uuid,boolean,text)', 'public.admin_crm_trash(text)', 'public.admin_crm_restore(text,uuid[],text)',
                      'public.admin_crm_purge_now(text,uuid[],text)']) f where has_function_privilege('anon', f, 'execute'))
    and not exists (select 1 from unnest(array['app.crm_soft_delete(text,uuid[],uuid)', 'app.crm_undelete(text,uuid[])', 'app.crm_purge(text,uuid[])',
                      'app.crm_purge_due()', 'app.crm_record_label(text,uuid)']) f
                    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute'))
    and app.crm_choice('delete_approval') = 'off' and app.crm_limit('restore_window_days') = 30
    and exists (select 1 from cron.job j where j.jobname = 'orgpuls-crm-purge' and j.command like '%app.crm_purge_due()%');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the flag on every record table; approvals, calls and engine closed; the rules and the job in place',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  -- 2 ---------------------------------------------------------------- every reader reviewed
  select string_agg(f, ', ' order by f) into v_txt from (
    select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public') and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ 'app\.crm_(companies|contacts|activities)\M'
      and pg_get_functiondef(p.oid) !~ 'deleted_at'
    except select unnest(v_reviewed)) x;
  v_txt := coalesce(v_txt, '') || '|' || coalesce((select string_agg(r, ', ') from unnest(v_reviewed) r
    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname in ('app', 'public') and p.oid::regprocedure::text = r)), '');
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'every reader of a record table filters deleted_at or is on the reviewed list (and the list names no missing function)',
    'expected', '|', 'actual', v_txt, 'pass', v_txt = '|');

  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@restore-test.example'), (v_mkt2, 'marketing2@restore-test.example'),
      (v_ana, 'analyst@restore-test.example'), (v_sup, 'support@restore-test.example'), (v_su, 'super@restore-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_mkt2, 'marketing'), (v_ana, 'analyst'), (v_sup, 'support'), (v_su, 'super_admin');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);

    v_co := (public.admin_crm_company_save(null, jsonb_build_object('name', 'Gjenoppretting AS', 'org_number', '999950001'))->>'id')::uuid;
    v_co2 := (public.admin_crm_company_save(null, jsonb_build_object('name', 'Gjenoppretting To AS', 'org_number', '999950002'))->>'id')::uuid;
    v_ct := (public.admin_crm_save_contact(null, jsonb_build_object('email', 'kari@restore-test.example', 'name', 'Kari',
              'consent_source', 'messe 2026', 'company_id', v_co))->>'id')::uuid;
    v_ct2 := (public.admin_crm_save_contact(null, jsonb_build_object('email', 'ola@restore-test.example', 'name', 'Ola',
              'consent_source', 'messe 2026', 'company_id', v_co2))->>'id')::uuid;
    perform public.admin_crm_list_add(v_list, array[v_ct], 'messe 2026');
    perform public.admin_crm_activity(v_co, v_ct, 'task', 'Ring Kari', current_date);
    perform public.admin_crm_activity(v_co, null, 'note', 'Møtt på messen', null);
    v_task := (select a.id from app.crm_activities a where a.company_id = v_co and a.kind = 'task');
    v_note := (select a.id from app.crm_activities a where a.company_id = v_co and a.kind = 'note');

    -- 3 -------------------------------------------------------------- a deleted company
    v_json := public.admin_crm_delete('company', array[v_co], null);
    v_txt := coalesce(v_json->>'deleted', v_json->>'error')
      || ',' || (select count(*) from jsonb_array_elements(public.admin_crm_companies(null, null, null)->'rows') r where (r->>'id')::uuid = v_co)
      || ',' || (public.admin_crm_company(v_co)->>'error')
      || ',' || (select count(*) from jsonb_array_elements(public.admin_crm_tasks()->'rows') r where (r->>'id')::uuid = v_task)
      || ',' || (select count(*) from app.crm_activities a where a.deleted_with = v_co)
      || ',' || (select c.version || '/' || c.deleted_source || '/' || (c.deleted_by = v_mkt)::text from app.crm_companies c where c.id = v_co)
      || ',' || (select count(*) from app.crm_changes x where x.record_id = v_co and x.field like 'deleted%')
      || ',' || (select string_agg(e.name, ';' order by e.id) from app.crm_events e where e.record_id = v_co and e.name like 'company.%' and e.name <> 'company.added')
      || ',' || (select count(*) from app.admin_audit l where l.admin_id = v_mkt and l.action = 'crm.delete' and l.target_id = v_co::text)
      || ',' || coalesce(app.crm_contact_json((select c from app.crm_contacts c where c.id = v_ct))->>'company_id', 'none')
      || ',' || (public.admin_crm_company_save(null, jsonb_build_object('name', 'Ny', 'org_number', '999950001'))->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a deleted company leaves the list, its page and the tasks; its activities go with it; one event, no line, no version',
      'expected', '1,0,deleted,0,3,1/user/true,0,company.deleted,1,' || v_co || ',exists_deleted', 'actual', v_txt,
      'pass', v_txt = '1,0,deleted,0,3,1/user/true,0,company.deleted,1,' || v_co || ',exists_deleted');

    -- 4 -------------------------------------------------------------- a deleted contact
    perform public.admin_crm_delete('contact', array[v_ct], null);
    v_txt := app.crm_mailable((select c from app.crm_contacts c where c.id = v_ct))::text
      || ',' || app.crm_on_list((select c from app.crm_contacts c where c.id = v_ct), v_list)::text
      || ',' || (select count(*) from app.crm_segment_contacts('{"types":[]}'::jsonb) x where x.id = v_ct)
      || ',' || (select count(*) from jsonb_array_elements(public.admin_crm_contacts(null, null, null)->'rows') r where (r->>'id')::uuid = v_ct)
      || ',' || (public.admin_crm_contact(v_ct)->>'error')
      || ',' || (public.admin_crm_save_contact(null, jsonb_build_object('email', 'kari@restore-test.example', 'consent_source', 'messe 2026'))->>'error')
      || ',' || (public.admin_crm_import(jsonb_build_array(jsonb_build_object('email', 'kari@restore-test.example', 'consent_source', 'messe 2026')))->'rejected'->0->>'reason')
      || ',' || (public.admin_crm_save_contact(v_ct, jsonb_build_object('name', 'Kari N'))->>'error')
      || ',' || (public.admin_crm_list_add(v_list, array[v_ct], 'messe 2026')->>'added');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a deleted contact is never mailed, in no segment, list or page; its address points to the restore list',
      'expected', 'false,false,0,0,deleted,exists_deleted,deleted,deleted,0', 'actual', v_txt,
      'pass', v_txt = 'false,false,0,0,deleted,exists_deleted,deleted,deleted,0');

    -- 5 -------------------------------------------------------------- a restore, links intact
    v_n := (select count(*) from app.consent_records r where r.contact_id = v_ct);
    v_json := public.admin_crm_restore('company', array[v_co], null);
    v_txt := (v_json->>'restored') || ',' || (select count(*) from app.crm_activities a where a.company_id = v_co and a.deleted_at is null);
    v_json := public.admin_crm_restore('contact', array[v_ct], null);
    v_txt := v_txt || ',' || (v_json->>'restored')
      || ',' || (select m.status from app.crm_list_members m where m.contact_id = v_ct and m.list_id = v_list)
      || ',' || ((select count(*) from app.consent_records r where r.contact_id = v_ct) = v_n)::text
      || ',' || ((select c.company_id from app.crm_contacts c where c.id = v_ct) = v_co)::text
      || ',' || app.crm_mailable((select c from app.crm_contacts c where c.id = v_ct))::text
      || ',' || (select string_agg(e.name, ';' order by e.id) from app.crm_events e where e.record_id = v_ct and e.name in ('contact.deleted', 'contact.restored'))
      || ',' || (public.admin_crm_company(v_co)->>'ok');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a restore returns the record with its memberships, consent records, company link and activities',
      'expected', '1,3,1,subscribed,true,true,true,contact.deleted;contact.restored,true', 'actual', v_txt,
      'pass', v_txt = '1,3,1,subscribed,true,true,true,contact.deleted;contact.restored,true');

    -- 6 -------------------------------------------------------------- activities and their company
    perform public.admin_crm_delete('activity', array[v_note], null);
    perform public.admin_crm_delete('company', array[v_co], null);
    v_json := public.admin_crm_trash(null);
    v_txt := (select string_agg(r->>'entity' || ':' || (r->>'restorable') || ':' || (r->>'with_activities'), ';' order by r->>'entity')
              from jsonb_array_elements(v_json->'rows') r where (r->>'id')::uuid in (v_co, v_note, v_task))
      || ',' || (public.admin_crm_restore('activity', array[v_task], null)->>'error')
      || ',' || (public.admin_crm_restore('activity', array[v_note], null)->>'error');
    perform public.admin_crm_restore('company', array[v_co], null);
    v_txt := v_txt || ',' || (select string_agg(a.kind || ':' || (a.deleted_at is null)::text, ';' order by a.kind) from app.crm_activities a where a.company_id = v_co)
      || ',' || (public.admin_crm_restore('activity', array[v_note], null)->>'restored');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'an activity that went with its company comes back only with it; one deleted on its own waits for the company',
      'expected', 'activity:false:0;company:true:2,company_deleted,company_deleted,note:false;stage:true;task:true,1', 'actual', v_txt,
      'pass', v_txt = 'activity:false:0;company:true:2,company_deleted,company_deleted,note:false;stage:true;task:true,1');

    -- 7 -------------------------------------------------------------- the job
    perform public.admin_crm_company_save(v_co2, jsonb_build_object('next_step', 'Følg opp'));
    perform public.admin_crm_activity(v_co2, v_ct2, 'task', 'Ring Ola', current_date);
    perform public.admin_crm_delete('company', array[v_co2], null);
    perform public.admin_crm_delete('contact', array[v_ct], null);
    -- the company has waited past the window, the contact not
    update app.crm_companies set deleted_at = now() - interval '31 days' where id = v_co2;
    update app.crm_activities set deleted_at = now() - interval '31 days' where deleted_with = v_co2;
    insert into app.crm_setting_values (key, value) values ('restore_window_days', 'null');
    v_json := app.crm_purge_due();
    v_txt := coalesce(v_json->>'window', 'unlimited') || ':' || (select count(*) from app.crm_companies c where c.id = v_co2);
    delete from app.crm_setting_values where key = 'restore_window_days';
    v_json := app.crm_purge_due();
    v_txt := v_txt || ',' || (v_json->>'companies') || ',' || (select count(*) from app.crm_companies c where c.id = v_co2)
      || ',' || (select count(*) from app.crm_activities a where a.company_id = v_co2)
      || ',' || coalesce((select c.company_id::text from app.crm_contacts c where c.id = v_ct2), 'unlinked')
      || ',' || (select count(*) from app.crm_changes x where x.record_id = v_co2)
      || ',' || (select string_agg(e.name || '/' || e.source, ';' order by e.id) from app.crm_events e where e.record_id = v_co2 and e.name = 'company.purged')
      || ',' || (select count(*) from app.crm_contacts c where c.id = v_ct);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the job removes what is past the window and nothing younger; unlimited keeps all; activities and history go, contacts are unlinked',
      'expected', 'unlimited:1,1,0,0,unlinked,0,company.purged/automation,1', 'actual', v_txt,
      'pass', v_txt = 'unlimited:1,1,0,0,unlinked,0,company.purged/automation,1');
    perform public.admin_crm_restore('contact', array[v_ct], null);

    -- 8 -------------------------------------------------------------- second-admin approval
    insert into app.crm_setting_values (key, value) values ('delete_approval', '"on"');
    v_json := public.admin_crm_delete('contact', array[v_ct, v_ct2], 'dubletter fra messen');
    v_req := (v_json->>'request')::uuid;
    v_txt := (v_json->>'pending') || ',' || (select count(*) from app.crm_contacts c where c.id in (v_ct, v_ct2) and c.deleted_at is not null)
      || ',' || (public.admin_crm_delete_decide(v_req, true, null)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_mkt2, 'aal2'), true);
    v_txt := v_txt || ',' || (select count(*) from jsonb_array_elements(public.admin_crm_trash(null)->'requests') q where (q->>'id')::uuid = v_req and not (q->>'mine')::boolean)
      || ',' || (public.admin_crm_delete_decide(v_req, true, null)->>'deleted');
    -- read in statements of their own: a subquery does not see what a call in the same statement wrote
    v_txt := v_txt || ',' || (select count(*) from app.crm_contacts c where c.id in (v_ct, v_ct2) and c.deleted_by = v_mkt)
      || ',' || (select q.status || '/' || (q.decided_by = v_mkt2)::text from app.crm_delete_requests q where q.id = v_req)
      || ',' || (public.admin_crm_delete_decide(v_req, false, null)->>'error');
    perform public.admin_crm_restore('contact', array[v_ct, v_ct2], null);
    v_txt := v_txt || ',' || (public.admin_crm_delete('contact', array[v_ct2], null)->>'deleted');
    perform public.admin_crm_restore('contact', array[v_ct2], null);
    delete from app.crm_setting_values where key = 'delete_approval';
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'approval on: a bulk delete waits, not for its requester, until another admin approves; a single delete is immediate',
      'expected', 'true,0,own_request,1,2,2,approved/true,not_found,1', 'actual', v_txt,
      'pass', v_txt = 'true,0,own_request,1,2,2,approved/true,not_found,1');

    -- 9 -------------------------------------------------------------- the preview and who may
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_crm_delete_preview('company', array[v_co, '00000000-0000-4000-8000-00000000dead'::uuid]);
    v_txt := (v_json->>'count') || ',' || (v_json->>'missing') || ',' || (v_json->'names'->0->>'name')
      || ',' || (v_json->'effects'->>'activities') || ',' || (v_json->'effects'->>'open_tasks') || ',' || (v_json->'effects'->>'contacts')
      || ',' || (v_json->>'approval');
    v_json := public.admin_crm_delete_preview('contact', array[v_ct]);
    v_txt := v_txt || ',' || (v_json->'effects'->>'lists') || ',' || (v_json->'names'->0->>'detail');
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := v_txt || ',' || (public.admin_crm_delete('contact', array[v_ct], null)->>'error') || ',' || (public.admin_crm_trash(null)->>'ok')
      || ',' || (public.admin_crm_trash(null)->>'may_write');
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := v_txt || ',' || (public.admin_crm_trash(null)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    perform public.admin_crm_delete('activity', array[v_task], null);
    v_txt := v_txt || ',' || (public.admin_crm_purge_now('activity', array[v_task], null)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal1'), true);
    v_txt := v_txt || ',' || (public.admin_crm_purge_now('activity', array[v_task], null)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_txt := v_txt || ',' || (public.admin_crm_purge_now('activity', array[v_task], null)->>'purged');
    v_txt := v_txt || ',' || (select count(*) from app.crm_activities a where a.id = v_task)
      || ',' || (select count(*) from app.admin_audit l where l.admin_id = v_su and l.action = 'crm.purge');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the preview names and counts; an analyst reads the list but may not delete; support may not read; only a super-admin deletes permanently',
      'expected', '1,1,Gjenoppretting AS,3,1,1,false,1,kari@restore-test.example,not_allowed,true,false,not_allowed,not_allowed,not_allowed,1,0,1', 'actual', v_txt,
      'pass', v_txt = '1,1,Gjenoppretting AS,3,1,1,false,1,kari@restore-test.example,not_allowed,true,false,not_allowed,not_allowed,not_allowed,1,0,1');

    -- 10 ------------------------------------------------------------- the person's own proof
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    perform public.admin_crm_delete('contact', array[v_ct], null);
    update app.crm_contacts set optin_hash = app.crm_token_hash(repeat('ab', 32)), optin_sent_at = now() where id = v_ct;
    perform set_config('request.jwt.claims', '', true);
    v_txt := (public.crm_confirm(repeat('ab', 32))->>'ok');
    v_txt := v_txt || ',' || (select (c.deleted_at is null)::text from app.crm_contacts c where c.id = v_ct)
      || ',' || (select e.source from app.crm_events e where e.record_id = v_ct and e.name = 'contact.restored' order by e.id desc limit 1);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'confirming a double opt-in brings a deleted contact back',
      'expected', 'true,true,automation', 'actual', v_txt, 'pass', v_txt = 'true,true,automation');

    -- 11 ------------------------------------------------------------- typed reasons
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    insert into app.crm_setting_values (key, value) values ('typed_reason', '"on"');
    v_txt := (public.admin_crm_delete('contact', array[v_ct], null)->>'error') || ',' || (public.admin_crm_restore('contact', array[v_ct], 'x')->>'error')
      || ',' || (public.admin_crm_delete('contact', array[v_ct], 'en dublett')->>'deleted');
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'typed reasons on: a delete or a restore without one is refused',
      'expected', 'reason_required,reason_required,1', 'actual', v_txt, 'pass', v_txt = 'reason_required,reason_required,1');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 12 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.crm_companies where org_number in ('999950001', '999950002')
    union all select email from app.crm_contacts where email like '%@restore-test.example'
    union all select email from auth.users where email like '%@restore-test.example'
    union all select id::text from app.crm_delete_requests where reason = 'dubletter fra messen') x;
  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._cri
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cri order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cri;
  if v_failed is not null then raise exception 'crm restore invariants failed: %', v_failed; end if;
  if v_count <> 12 then raise exception 'crm restore invariants: expected 12 rows, got %', v_count; end if;
end $$;
