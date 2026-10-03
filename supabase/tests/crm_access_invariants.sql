-- crm_access_invariants.sql — CRM access (0196, D-211): permission sets, visibility groups, teams, audit
-- completeness, the editor grant and marketing's reach, proved against the live schema.
--
--   * structure: the new tables closed to clients, the calls closed to anon and the helpers to every client,
--     the catalogue, the built-in sets and the rules in place (1)
--   * Q2: every platform role can be granted, the editor included (2)
--   * DEC-12: marketing reads neither an organisation's page nor the audit trail; support reads one
--     organisation's trail; finance keeps the organisation's page (3)
--   * the role's set by default: marketing writes as before, the analyst reads reports and writes nothing,
--     support has no CRM action (4)
--   * a custom set narrows: an action missing from the set is refused in the database and flagged false for
--     the screen; a bulk change needs bulk edit; a report needs its report action (5)
--   * the role stays the coarse gate: the admin set does not let an analyst write (6)
--   * visibility: owner, group, group and sub-groups, everyone — on the page, the list, the figures, the
--     tasks, the history, the consent ledger and every write; the admin set and the system see everything;
--     a new company takes the rule's default; changing visibility needs its action (7, 8)
--   * groups: no cycles, no deleting a group with sub-groups; teams: members are staff (9)
--   * every admin reader writes an audit row or is a reviewed exception, and every audited admin call is
--     volatile; every CRM write checks a set (10)
--   * the firewall, followed through helpers: no function a CRM call reaches reads an answer table (11)
--   * nothing written here survives (12)
--   * no route skips visibility: every function reading companies or activities applies it or is reviewed, a
--     helper that trusts its caller is called only by calls that filter, and no reviewed helper is a client's (13)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_access_invariants.sql

create unlogged table if not exists public._cai(seq int, name text, expected text, actual text, pass bool);
truncate public._cai;

do $$
declare
  v_su   uuid := '00000000-0000-4000-8000-0000000ca601';
  v_m1   uuid := '00000000-0000-4000-8000-0000000ca602';
  v_m2   uuid := '00000000-0000-4000-8000-0000000ca603';
  v_m3   uuid := '00000000-0000-4000-8000-0000000ca604';
  v_m4   uuid := '00000000-0000-4000-8000-0000000ca605';
  v_ana  uuid := '00000000-0000-4000-8000-0000000ca606';
  v_sup  uuid := '00000000-0000-4000-8000-0000000ca607';
  v_fin  uuid := '00000000-0000-4000-8000-0000000ca608';
  v_new  uuid := '00000000-0000-4000-8000-0000000ca609';
  claims text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  -- admin readers that write no audit row, and why (0196 review): none returns customer, person or CRM data
  v_unaudited text[] := array[
    'admin_whoami()',                           -- the caller's own identity, read on every admin page
    'admin_auto_approve()',                     -- a switch's state, shown on every admin page
    'admin_site_notice()',                      -- the site's notice: public content
    'admin_site_settings()',                    -- the site's settings: configuration
    'admin_cms_page(uuid)',                     -- a page of the public site
    'admin_cms_pages()',                        -- the public site's pages
    'admin_cms_preview_token(uuid)',            -- a short-lived preview link for a page; its edits are audited
    'admin_cms_redirects()',                    -- the site's redirects
    'admin_cms_templates()',                    -- the site's templates
    'admin_media()',                            -- the site's images
    'admin_legal_approvals()',                  -- the legal texts' approvals: content governance
    'admin_legal_reviews()',                    -- the legal texts' reviews: content governance
    'admin_legal_sources()',                    -- the legal texts
    'admin_locale_pilots()',                    -- which languages are piloted: configuration
    'admin_message_overrides(text)',            -- the product's words
    'admin_modules()',                          -- the survey modules: content
    'admin_translation_history(text,text)',     -- the product's words
    'admin_translation_sources()',              -- the product's words
    'admin_translations(text)'                  -- the product's words
  ];
  -- calls a client makes that read companies or activities without applying visibility, and why (0196 review)
  v_unfiltered_calls text[] := array[
    'public.admin_consent_phone_notice',   -- a privacy action: an objection taken by phone is honoured whoever takes the call; returns nothing
    'public.admin_crm_journeys',           -- campaign outcomes as counts over the recipients, who are contacts (not owned); names no company
    'public.admin_crm_sequence',           -- the same, per step
    'public.admin_crm_known_orgnrs',       -- which of the org numbers the caller typed are in the CRM, so an import never duplicates a hidden company
    'public.admin_crm_stage_save',         -- a settings write: a stage that holds any company, seen or not, is in use
    'public.admin_crm_field_save'          -- 0197: names the record table only so a field's key never shadows one of its columns
  ];
  -- helpers no client may call: jobs, triggers and the send loop (no viewer), or helpers whose callers filter
  v_unfiltered_helpers text[] := array[
    'app.brreg_assign', 'app.brreg_purge_org', 'app.brreg_suppression_reroute', 'app.consent_records_guard', 'app.crm_advance',
    'app.crm_changes_guard', 'app.crm_follow_audience', 'app.crm_follow_done', 'app.crm_purge_due', 'app.crm_segment_contacts',
    'app.crm_stage_changes_guard', 'app.crm_step_tasks', 'app.crm_sync', 'app.delete_organisation', 'app.lead_contacts',
    'app.lead_route', 'app.lead_score', 'public.crm_mail_claim',
    -- 0197: whether any record holds a field's value or option (a yes or no for the registry), and the formula recompute
    'app.crm_field_in_use', 'app.crm_options_in_use', 'app.crm_formulas_recompute',
    -- given what their callers may see (the second check holds them to it)
    'app.crm_company_json', 'app.crm_log', 'app.crm_purge', 'app.crm_record_label', 'app.crm_soft_delete', 'app.crm_undelete'
  ];
  v_rows jsonb := '[]';
  v_json jsonb;
  v_txt  text;
  v_ok   boolean;
  v_org  uuid := (select o.id from app.organizations o order by o.created_at limit 1);
  v_ga   uuid;
  v_ga1  uuid;
  v_ga1a uuid;
  v_gb   uuid;
  v_set  uuid;
  v_co   uuid;
  v_co2  uuid;
  v_co3  uuid;
  v_ct   uuid;
  v_task uuid;
  v_team uuid;
  v_cr   bigint;
begin
  -- 1 ---------------------------------------------------------------- structure
  v_ok := (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('app.crm_permission_actions'::regclass, 'app.crm_permission_sets'::regclass,
             'app.crm_staff_access'::regclass, 'app.crm_visibility_groups'::regclass, 'app.crm_teams'::regclass, 'app.crm_team_members'::regclass))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('crm_permission_actions', 'crm_permission_sets',
                      'crm_staff_access', 'crm_visibility_groups', 'crm_teams', 'crm_team_members'))
    and not exists (select 1 from unnest(array['app.crm_permission_actions', 'app.crm_permission_sets', 'app.crm_staff_access', 'app.crm_visibility_groups',
                      'app.crm_teams', 'app.crm_team_members']) t, unnest(array['anon', 'authenticated']) r where has_table_privilege(r, t, 'select,insert,update,delete'))
    and not exists (select 1 from unnest(array['public.admin_crm_access()', 'public.admin_crm_set_save(uuid,text,text[],text)', 'public.admin_crm_set_delete(uuid,text)',
                      'public.admin_crm_staff_access(uuid,uuid,uuid,text)', 'public.admin_crm_group_save(uuid,text,uuid,text)', 'public.admin_crm_group_delete(uuid,text)',
                      'public.admin_crm_team_save(uuid,text,uuid,uuid[],text)', 'public.admin_crm_team_delete(uuid,text)']) f where has_function_privilege('anon', f, 'execute'))
    and not exists (select 1 from unnest(array['app.crm_set_of(uuid)', 'app.crm_can(text)', 'app.crm_may(text)', 'app.crm_group_of(uuid)', 'app.crm_visible(uuid,text)',
                      'app.crm_visible_company(uuid)', 'app.crm_visible_ids(text,uuid[])', 'app.crm_default_visibility()']) f
                    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute'))
    and (select count(*) from app.crm_permission_actions) = 20
    and (select string_agg(s.key || ':' || s.kind || ':' || cardinality(s.actions), ',' order by s.key) from app.crm_permission_sets s where s.builtin)
        = 'admin:admin:0,read_only:regular:2,regular:regular:20'
    and app.crm_choice('default_visibility_company') = 'everyone' and app.crm_limit('limit_permission_sets') is null
    and app.crm_limit('limit_visibility_groups') is null
    and (select count(*) from app.crm_companies c where c.visibility <> 'everyone') = 0;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'access tables closed to clients; calls closed to anon, helpers to every client; catalogue, built-in sets and rules in place',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  begin
    insert into auth.users (id, email) values
      (v_su, 'super@access-test.example'), (v_m1, 'm1@access-test.example'), (v_m2, 'm2@access-test.example'), (v_m3, 'm3@access-test.example'),
      (v_m4, 'm4@access-test.example'), (v_ana, 'analyst@access-test.example'), (v_sup, 'support@access-test.example'), (v_fin, 'finance@access-test.example'),
      (v_new, 'new@access-test.example');
    insert into app.platform_admins (user_id, role) values (v_su, 'super_admin'), (v_m1, 'marketing'), (v_m2, 'marketing'), (v_m3, 'marketing'),
      (v_m4, 'marketing'), (v_ana, 'analyst'), (v_sup, 'support'), (v_fin, 'finance');

    -- 2 -------------------------------------------------------------- Q2: every role can be granted
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    select string_agg(r::text || '=' || coalesce(public.admin_set_admin('new@access-test.example', r::text, true, 'role test grant')->>'error', 'ok'), ',' order by r)
      into v_txt from unnest(enum_range(null::app.platform_role)) r;
    v_txt := v_txt || ',' || (select a.role::text from app.platform_admins a where a.user_id = v_new);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'every platform role can be granted, the editor included',
      'expected', 'super_admin=ok,support=ok,finance=ok,analyst=ok,marketing=ok,editor=ok,editor', 'actual', v_txt,
      'pass', v_txt = 'super_admin=ok,support=ok,finance=ok,analyst=ok,marketing=ok,editor=ok,editor');

    -- 3 -------------------------------------------------------------- DEC-12: marketing keeps the CRM
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    v_txt := coalesce(public.admin_org_detail(v_org)->>'error', 'ok') || ',' || coalesce(public.admin_audit_list(null, 10)->>'error', 'ok')
      || ',' || coalesce(public.admin_audit_list(v_org, 10)->>'error', 'ok') || ',' || coalesce(public.admin_crm_companies(null, null, null)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_audit_list(v_org, 10)->>'error', 'ok') || ',' || coalesce(public.admin_audit_list(null, 10)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_fin, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_org_detail(v_org)->>'error', 'ok') || ',' || coalesce(public.admin_audit_list(v_org, 10)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'marketing reads neither an organisation nor the audit trail; support one trail; finance the organisation',
      'expected', 'not_allowed,not_allowed,not_allowed,ok,ok,not_allowed,ok,not_allowed', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,not_allowed,not_allowed,ok,ok,not_allowed,ok,not_allowed');

    -- 4 -------------------------------------------------------------- the role's set by default
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    v_co := (public.admin_crm_company_save(null, jsonb_build_object('name', 'Tilgang AS', 'org_number', '999960001'))->>'id')::uuid;
    v_txt := (app.crm_set_of(v_m1)).key || ':' || app.crm_can('deals.edit')::text || ':' || (v_co is not null)::text
      || ':' || (public.admin_crm_companies(null, null, null)->'may'->>'bulk_edit');
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := v_txt || ',' || (app.crm_set_of(v_ana)).key || ':' || app.crm_can('deals.reports')::text || ':' || app.crm_can('deals.edit')::text
      || ':' || coalesce(public.admin_crm_pipeline_summary(null)->>'error', 'ok')
      || ':' || coalesce(public.admin_crm_company_save(v_co, jsonb_build_object('name', 'X'))->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce((app.crm_set_of(v_sup)).key, 'none') || ':' || app.crm_can('deals.reports')::text;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'marketing works under Regular, the analyst under Read only, support under none',
      'expected', 'regular:true:true:true,read_only:true:false:ok:not_allowed,none:false', 'actual', v_txt,
      'pass', v_txt = 'regular:true:true:true,read_only:true:false:ok:not_allowed,none:false');

    -- 5 -------------------------------------------------------------- a custom set narrows
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_set := (public.admin_crm_set_save(null, 'Contacts only', array['contacts.create', 'contacts.edit', 'deals.edit'], null)->>'id')::uuid;
    perform public.admin_crm_staff_access(v_m1, v_set, null, null);
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    v_co2 := (public.admin_crm_company_save(null, jsonb_build_object('name', 'Tilgang To AS', 'org_number', '999960002'))->>'id')::uuid;
    v_txt := coalesce(v_co2::text, 'refused')
      || ',' || coalesce(public.admin_crm_company_save(v_co, jsonb_build_object('next_step', 'Ring'))->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_save_contact(null, jsonb_build_object('email', 'kari@access-test.example', 'name', 'Kari'))->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_stage_move(array[v_co], 'contacted')->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_co2 := (public.admin_crm_company_save(null, jsonb_build_object('name', 'Tilgang To AS', 'org_number', '999960002'))->>'id')::uuid;
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_stage_move(array[v_co, v_co2], 'engaged')->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_delete('company', array[v_co], null)->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_pipeline_summary(null)->>'error', 'ok')
      || ',' || (public.admin_crm_companies(null, null, null)->'may'->>'create') || ':' || (public.admin_crm_company(v_co)->'may'->>'edit')
      || ',' || coalesce(public.admin_crm_import(jsonb_build_array(jsonb_build_object('email', 'ola@access-test.example')))->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a custom set refuses what it lacks, in the database and on the screen; bulk needs bulk edit; reports their action',
      'expected', 'refused,ok,ok,ok,not_allowed,not_allowed,not_allowed,false:true,not_allowed', 'actual', v_txt,
      'pass', v_txt = 'refused,ok,ok,ok,not_allowed,not_allowed,not_allowed,false:true,not_allowed');

    -- 6 -------------------------------------------------------------- the role stays the coarse gate
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    perform public.admin_crm_staff_access(v_ana, (select s.id from app.crm_permission_sets s where s.key = 'admin'), null, null);
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := (app.crm_set_of(v_ana)).key || ',' || app.crm_can('deals.edit')::text
      || ',' || coalesce(public.admin_crm_company_save(v_co, jsonb_build_object('next_step', 'Y'))->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal1'), true);
    v_txt := v_txt || ',' || app.crm_can('contacts.edit')::text;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the admin set does not let an analyst write; without the second factor no set counts',
      'expected', 'admin,false,not_allowed,false', 'actual', v_txt, 'pass', v_txt = 'admin,false,not_allowed,false');

    -- 7 -------------------------------------------------------------- visibility
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    perform public.admin_crm_staff_access(v_m1, null, null, null);
    v_ga := (public.admin_crm_group_save(null, 'Salg', null, null)->>'id')::uuid;
    v_ga1 := (public.admin_crm_group_save(null, 'Salg Vest', v_ga, null)->>'id')::uuid;
    v_ga1a := (public.admin_crm_group_save(null, 'Salg Bergen', v_ga1, null)->>'id')::uuid;
    v_gb := (public.admin_crm_group_save(null, 'Marked', null, null)->>'id')::uuid;
    perform public.admin_crm_staff_access(v_m1, null, v_ga1, null);   -- the owner
    perform public.admin_crm_staff_access(v_m2, null, v_ga, null);    -- the owner's parent group
    perform public.admin_crm_staff_access(v_m3, null, v_gb, null);    -- another group
    perform public.admin_crm_staff_access(v_m4, null, v_ga1a, null);  -- the owner's sub-group
    update app.crm_companies set owner_id = v_m1, visibility = 'owner' where id = v_co;
    update app.crm_contacts set company_id = v_co where email = 'kari@access-test.example';
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    perform public.admin_crm_activity(v_co, null, 'task', 'Ring tilbake', current_date);
    v_task := (select a.id from app.crm_activities a where a.company_id = v_co and a.kind = 'task');
    -- who sees a company only its owner may see
    select string_agg(x, ',' order by x) into v_txt from (
      select u.n || '=' || coalesce(public.admin_crm_company(v_co)->>'error', 'ok') as x
      from (values ('m1', v_m1), ('m2', v_m2), ('m3', v_m3), ('m4', v_m4), ('su', v_su)) u(n, id)
      where set_config('request.jwt.claims', format(claims, u.id, 'aal2'), true) is not null) z;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'owner only: the owner and the admin set see the company, nobody else',
      'expected', 'm1=ok,m2=not_found,m3=not_found,m4=not_found,su=ok', 'actual', v_txt,
      'pass', v_txt = 'm1=ok,m2=not_found,m3=not_found,m4=not_found,su=ok');

    -- 8 -------------------------------------------------------------- group, group and sub-groups, every route
    update app.crm_companies set visibility = 'group_tree' where id = v_co;
    select string_agg(x, ',' order by x) into v_txt from (
      select u.n || '=' || coalesce(public.admin_crm_company(v_co)->>'error', 'ok') as x
      from (values ('m2', v_m2), ('m3', v_m3), ('m4', v_m4)) u(n, id)
      where set_config('request.jwt.claims', format(claims, u.id, 'aal2'), true) is not null) z;
    update app.crm_companies set visibility = 'group' where id = v_co;
    v_txt := v_txt || '|' || (select string_agg(x, ',' order by x) from (
      select u.n || '=' || coalesce(public.admin_crm_company(v_co)->>'error', 'ok') as x
      from (values ('m2', v_m2), ('m4', v_m4)) u(n, id)
      where set_config('request.jwt.claims', format(claims, u.id, 'aal2'), true) is not null) z);
    -- every route for someone outside: list, figures, tasks, history, the writes, and the consent ledger, which
    -- keeps a company's phone objection but does not name a company the reader cannot see
    insert into app.consent_records (company_id, purpose, status, lawful_basis, method)
    values (v_co, 'phone_outreach', 'withdrawn', 'legit_interest_phone', 'phone_notice') returning id into v_cr;
    perform set_config('request.jwt.claims', format(claims, v_m3, 'aal2'), true);
    v_txt := v_txt || '|' || (select count(*) from jsonb_array_elements(public.admin_crm_companies(null, null, null)->'rows') r where (r->>'id')::uuid = v_co)
      || ',' || (select count(*) from jsonb_array_elements(public.admin_crm_tasks()->'rows') r where (r->>'id')::uuid = v_task)
      || ',' || (select count(*) from jsonb_array_elements(public.admin_crm_task_list('open')->'rows') r where (r->>'id')::uuid = v_task)
      || ',' || coalesce(public.admin_crm_history('company', v_co, null)->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_company_save(v_co, jsonb_build_object('next_step', 'Z'))->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_activity(v_co, null, 'note', 'Hei', null)->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_task_done(v_task)->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_stage_move(array[v_co], 'meeting')->>'skipped', 'null')
      || ',' || coalesce(public.admin_crm_delete('company', array[v_co], null)->>'error', 'ok')
      || ',' || coalesce(app.crm_contact_json((select c from app.crm_contacts c where c.email = 'kari@access-test.example'))->>'company', 'none')
      || ',' || (select coalesce(r->>'who', 'unnamed') || '/' || coalesce(r->>'company_id', 'unlinked') from jsonb_array_elements(public.admin_consent()->'rows') r where (r->>'id')::bigint = v_cr)
      || ',' || (select coalesce(r->>'company', 'unnamed') || '/' || coalesce(r->>'org_number', 'none') from jsonb_array_elements(public.admin_consent_export()->'rows') r where (r->>'id')::bigint = v_cr);
    -- the system's own jobs see it; the rule's default for a new company; changing visibility needs its action
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || '|' || app.crm_visible_company(v_co)::text;
    insert into app.crm_setting_values (key, value) values ('default_visibility_company', '"owner"');
    perform set_config('request.jwt.claims', format(claims, v_m3, 'aal2'), true);
    -- (a statement of its own: a read in the same statement would not see the row the call wrote)
    v_co3 := (public.admin_crm_company_save(null, jsonb_build_object('name', 'Synlighet AS'))->>'id')::uuid;
    v_txt := v_txt || ',' || coalesce((select c.visibility from app.crm_companies c where c.id = v_co3), 'null');
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    perform public.admin_crm_staff_access(v_m3, v_set, v_gb, null);
    perform set_config('request.jwt.claims', format(claims, v_m3, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_company_save(v_co3, jsonb_build_object('visibility', 'everyone'))->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'group and sub-groups, group, and every route for an outsider; the system sees all; the default; changing it needs its action',
      'expected', 'm2=not_found,m3=not_found,m4=ok|m2=not_found,m4=not_found|0,0,0,not_found,not_found,not_found,not_found,1,not_found,none,unnamed/unlinked,unnamed/none|true,owner,not_allowed',
      'actual', v_txt,
      'pass', v_txt = 'm2=not_found,m3=not_found,m4=ok|m2=not_found,m4=not_found|0,0,0,not_found,not_found,not_found,not_found,1,not_found,none,unnamed/unlinked,unnamed/none|true,owner,not_allowed');
    delete from app.crm_setting_values where key = 'default_visibility_company';

    -- 9 -------------------------------------------------------------- groups and teams
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    -- each read in a statement of its own, after the call that changed what it reads
    v_txt := (public.admin_crm_group_save(v_ga, 'Salg', v_ga1a, null)->>'error') || ',' || (public.admin_crm_group_delete(v_ga, null)->>'error')
      || ',' || (public.admin_crm_group_delete(v_ga1a, null)->>'ok');
    v_txt := v_txt || ',' || coalesce((select a.group_id::text from app.crm_staff_access a where a.user_id = v_m4), 'none');
    v_team := (public.admin_crm_team_save(null, 'Salg Vest', v_m1, array[v_m1, v_m2], null)->>'id')::uuid;
    v_txt := v_txt || ',' || (select count(*) from app.crm_team_members m where m.team_id = v_team)
      || ',' || (public.admin_crm_team_save(v_team, 'Salg Vest', v_m1, array[v_m2], null)->>'ok');
    v_txt := v_txt || ':' || (select count(*) from app.crm_team_members m where m.team_id = v_team)
      || ',' || (public.admin_crm_team_save(null, 'Feil', null, array['00000000-0000-4000-8000-00000000beef'::uuid], null)->>'error')
      || ',' || (public.admin_crm_team_delete(v_team, null)->>'ok');
    v_txt := v_txt || ':' || (select count(*) from app.crm_team_members m where m.team_id = v_team)
      || ',' || jsonb_array_length(public.admin_crm_access()->'groups');
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    v_txt := v_txt || ',' || (public.admin_crm_access()->>'error') || ',' || (public.admin_crm_set_save(null, 'Mine', array['deals.edit'], null)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'no cycle, no deleting a group with sub-groups; teams hold staff; managing access is the super-admin''s',
      'expected', 'cycle,has_children,true,none,2,true:1,invalid,true:0,3,not_allowed,not_allowed', 'actual', v_txt,
      'pass', v_txt = 'cycle,has_children,true,none,2,true:1,invalid,true:0,3,not_allowed,not_allowed');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 10 --------------------------------------------------------------- audited readers, volatile, writes through a set
  select coalesce(string_agg(f, ', ' order by f), '') into v_txt from (
    select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'admin\_%' and pg_get_functiondef(p.oid) !~ 'admin_log\('
    except select unnest(v_unaudited)) x;
  v_txt := v_txt || '|' || coalesce((select string_agg(p.oid::regprocedure::text, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'admin\_%' and p.provolatile <> 'v' and pg_get_functiondef(p.oid) ~ 'admin_log\('), '')
    || '|' || coalesce((select string_agg(p.oid::regprocedure::text, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public') and p.prokind = 'f' and pg_get_functiondef(p.oid) ~ 'app\.crm_can_write\(\)'
      and p.oid not in ('app.crm_can_write()'::regprocedure, 'app.crm_can(text)'::regprocedure)), '')
    || '|' || coalesce((select string_agg(r, ', ') from unnest(v_unaudited) r
    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.oid::regprocedure::text = r)), '');
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every admin reader audits or is reviewed; audited calls are volatile; every CRM write checks a set; the list names no missing function',
    'expected', '|||', 'actual', v_txt, 'pass', v_txt = '|||');

  -- 11 --------------------------------------------------------------- the firewall, through helpers
  with recursive fns as (
    select n.nspname || '.' || p.proname as name, pg_get_functiondef(p.oid) as d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('app', 'public') and p.prokind = 'f'),
  calls as (select f.name as caller, m[1] || '.' || m[2] as callee from fns f, regexp_matches(f.d, '(app|public)\.([a-z_0-9]+)\(', 'g') m),
  reach as (
    select f.name from fns f where f.name ~ '^public\.admin_(crm|lead|consent|brreg)'
    union
    select c.callee from reach r join calls c on c.caller = r.name)
  select coalesce(string_agg(r.name, ', ' order by r.name), '') || '|' || (select count(*) from reach)::text into v_txt
  from reach r join fns f on f.name = r.name where f.d ~ 'app\.(responses|answers|extra_answers|response_comments)\M';
  v_ok := split_part(v_txt, '|', 1) = '' and split_part(v_txt, '|', 2)::int > 100;
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'no function a CRM call reaches, through any helper, reads an answer table',
    'expected', 'none, over more than 100 functions', 'actual', v_txt, 'pass', v_ok);

  -- 13 --------------------------------------------------------------- no route skips visibility
  select coalesce(string_agg(f, ', ' order by f), '') into v_txt from (
    select n.nspname || '.' || p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public') and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ 'app\.crm_(companies|activities)\M' and pg_get_functiondef(p.oid) !~ 'app\.crm_visible'
    except select unnest(v_unfiltered_calls || v_unfiltered_helpers)) x;
  v_txt := v_txt || '|' || coalesce((select string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public') and p.prokind = 'f'
      and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
      and pg_get_functiondef(p.oid) ~ 'app\.(crm_company_json|crm_log|crm_purge|crm_record_label|crm_soft_delete|crm_undelete)\('
      and pg_get_functiondef(p.oid) !~ 'app\.crm_visible'), '')
    || '|' || coalesce((select string_agg(distinct n.nspname || '.' || p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname || '.' || p.proname = any (v_unfiltered_helpers)
      and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))), '')
    || '|' || coalesce((select string_agg(r, ', ') from unnest(v_unfiltered_calls || v_unfiltered_helpers) r
    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || '.' || p.proname = r)), '');
  v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'every reader of companies or activities applies visibility or is reviewed; trusting helpers are called by filtering calls only; no reviewed helper is a client''s; the lists name no missing function',
    'expected', '|||', 'actual', v_txt, 'pass', v_txt = '|||');

  -- 12 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.crm_companies where org_number in ('999960001', '999960002') or name in ('Synlighet AS', 'Tilgang To AS')
    union all select email from app.crm_contacts where email like '%@access-test.example'
    union all select email from auth.users where email like '%@access-test.example'
    union all select id::text from app.crm_visibility_groups where name in ('Salg', 'Salg Vest', 'Salg Bergen', 'Marked')
    union all select id::text from app.crm_permission_sets where name = 'Contacts only'
    union all select id::text from app.crm_teams where name in ('Salg Vest', 'Feil')) x;
  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._cai
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cai order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cai;
  if v_failed is not null then raise exception 'crm access invariants failed: %', v_failed; end if;
  if v_count <> 13 then raise exception 'crm access invariants: expected 13 rows, got %', v_count; end if;
end $$;
