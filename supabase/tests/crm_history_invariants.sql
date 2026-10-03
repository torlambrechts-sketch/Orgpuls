-- crm_history_invariants.sql — the CRM's record history (0194, D-209), proved against the live schema.
--
--   * structure: the outbox, the catalogue and the changelog exist with RLS on, no policy, no client grant;
--     every CRM table carries version, created_by and updated_by (1)
--   * an edit through the admin's form writes one changelog line per changed field — field, old, new, who,
--     source 'user' — an updated event naming the fields, a stage_changed event, and the audit row; the
--     version moves and updated_by is the admin (2)
--   * a register import is 'import', the account sync 'sync', a change with no session 'automation' (3)
--   * bookkeeping (an engagement stamp) writes no line and does not move the version (4)
--   * a form opened at an older version is refused as stale, for a company and a contact; the current one saves (5)
--   * change, changelog and event are one transaction: rolled back together (6)
--   * the changelog is append-only while its record exists; erasing a contact removes its history and leaves
--     an event that names no value (7, 8)
--   * a completed task emits activity.completed (9)
--   * the history reader: an analyst reads it, support and anon may not, each read is audited, and it pages (10)
--   * nothing written here survives (11)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_history_invariants.sql

create unlogged table if not exists public._chi(seq int, name text, expected text, actual text, pass bool);
truncate public._chi;

do $$
declare
  v_mkt   uuid := '00000000-0000-4000-8000-0000000c8201';
  v_ana   uuid := '00000000-0000-4000-8000-0000000c8202';
  v_sup   uuid := '00000000-0000-4000-8000-0000000c8203';
  claims  text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  v_rows  jsonb := '[]';
  v_json  jsonb;
  v_txt   text;
  v_ok    boolean;
  v_co    uuid;
  v_ct    uuid;
  v_task  uuid;
  v_ver   int;
  v_n     int;
begin
  -- 1 ---------------------------------------------------------------- structure
  v_ok := (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('app.crm_events'::regclass, 'app.crm_changes'::regclass, 'app.crm_event_types'::regclass))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('crm_events', 'crm_changes', 'crm_event_types'))
    and not exists (select 1 from unnest(array['app.crm_events', 'app.crm_changes', 'app.crm_event_types']) t(n), unnest(array['anon', 'authenticated']) r(n2)
                    where has_table_privilege(r.n2, t.n, 'select,insert,update,delete'))
    and (select count(*) from information_schema.columns where table_schema = 'app'
         and table_name in ('crm_companies', 'crm_contacts', 'crm_activities') and column_name in ('version', 'updated_by')) = 6
    and (select count(*) from information_schema.columns where table_schema = 'app'
         and table_name in ('crm_companies', 'crm_contacts') and column_name = 'created_by') = 2;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'outbox, catalogue and changelog closed to clients; the standard columns on every CRM table',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@hist-test.example'), (v_ana, 'analyst@hist-test.example'), (v_sup, 'support@hist-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst'), (v_sup, 'support');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);

    -- 2 -------------------------------------------------------------- an edit through the form
    v_co := (public.admin_crm_company_save(null, jsonb_build_object('name', 'Historikk AS', 'org_number', '999820001'))->>'id')::uuid;
    v_txt := (select c.version || '/' || (c.created_by = v_mkt)::text from app.crm_companies c where c.id = v_co);
    v_json := public.admin_crm_company_save(v_co, jsonb_build_object('name', 'Historikk Bygg AS', 'next_step', 'Ring daglig leder', 'stage', 'contacted', 'version', 1));
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok');
    v_txt := v_txt || ',' || (select string_agg(x.field || ':' || coalesce(x.old_value #>> '{}', '-') || '>' || coalesce(x.new_value #>> '{}', '-') || ':' || x.source || ':' || (x.actor = v_mkt)::text, ';' order by x.field)
                              from app.crm_changes x where x.entity = 'company' and x.record_id = v_co);
    v_txt := v_txt || ',' || (select string_agg(e.name || '[' || array_to_string(e.fields, '+') || ']', ';' order by e.id) from app.crm_events e where e.record_id = v_co);
    v_txt := v_txt || ',' || (select c.version || '/' || (c.updated_by = v_mkt)::text from app.crm_companies c where c.id = v_co)
      || ',' || (select count(*) from app.admin_audit a where a.admin_id = v_mkt and a.action = 'crm.company_update' and a.target_id = v_co::text);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'an edit writes one line per field with old, new, who and source, the events and the audit row; the version moves',
      'expected', '1/true,ok,name:Historikk AS>Historikk Bygg AS:user:true;next_step:->Ring daglig leder:user:true;stage:new>contacted:user:true,company.added[];company.updated[name+next_step+stage];company.stage_changed[stage],2/true,1',
      'actual', v_txt,
      'pass', v_txt = '1/true,ok,name:Historikk AS>Historikk Bygg AS:user:true;next_step:->Ring daglig leder:user:true;stage:new>contacted:user:true,company.added[];company.updated[name+next_step+stage];company.stage_changed[stage],2/true,1');

    -- 3 -------------------------------------------------------------- sources
    perform public.admin_crm_company_import('[{"org_number":"999820001","name":"Historikk Bygg AS","manager_name":"Kari Historikk","manager_role":"DAGL"}]', 'brreg', null);
    v_txt := (select string_agg(distinct x.source, '+') from app.crm_changes x where x.record_id = v_co and x.field = 'manager_name');
    perform set_config('app.consent_via', '', true);
    perform set_config('request.jwt.claims', '', true);
    update app.crm_companies set phone = '+47 400 00 000' where id = v_co;
    v_txt := v_txt || ',' || (select x.source from app.crm_changes x where x.record_id = v_co and x.field = 'phone');
    perform set_config('app.consent_via', 'account_sync', true);
    update app.crm_companies set employees = 12 where id = v_co;
    perform set_config('app.consent_via', '', true);
    v_txt := v_txt || ',' || (select x.source from app.crm_changes x where x.record_id = v_co and x.field = 'employees');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a register import is import, a change without a session automation, the account sync sync',
      'expected', 'import,automation,sync', 'actual', v_txt, 'pass', v_txt = 'import,automation,sync');

    -- 4 -------------------------------------------------------------- bookkeeping is not a change
    v_ct := (public.admin_crm_save_contact(null, jsonb_build_object('email', 'person@hist-test.example', 'name', 'Per Historikk'))->>'id')::uuid;
    select version into v_ver from app.crm_contacts where id = v_ct;
    update app.crm_contacts set last_engaged_at = now() where id = v_ct;
    v_txt := (select count(*) from app.crm_changes x where x.record_id = v_ct) || ',' || (select version - v_ver from app.crm_contacts where id = v_ct);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'an engagement stamp writes no line and leaves the version',
      'expected', '0,0', 'actual', v_txt, 'pass', v_txt = '0,0');

    -- 5 -------------------------------------------------------------- lost updates
    v_txt := coalesce(public.admin_crm_company_save(v_co, jsonb_build_object('next_step', 'Gammelt skjema', 'version', 1))->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_save_contact(v_ct, jsonb_build_object('name', 'Gammelt', 'version', v_ver + 5))->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_save_contact(v_ct, jsonb_build_object('name', 'Per H.', 'version', v_ver))->>'error', 'ok');
    v_txt := v_txt || ',' || (select c.name from app.crm_contacts c where c.id = v_ct);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a form opened at an older version is refused as stale; the current version saves',
      'expected', 'stale,stale,ok,Per H.', 'actual', v_txt, 'pass', v_txt = 'stale,stale,ok,Per H.');

    -- 6 -------------------------------------------------------------- one transaction
    select count(*) into v_n from app.crm_changes where record_id = v_co;
    begin
      update app.crm_companies set website = 'https://historikk.example' where id = v_co;
      raise exception 'undo';
    exception when others then
      if sqlerrm <> 'undo' then raise; end if;
    end;
    v_txt := ((select count(*) from app.crm_changes where record_id = v_co) - v_n) || ','
      || (select count(*) from app.crm_events where record_id = v_co and 'website' = any (fields));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a change rolled back takes its changelog line and event with it',
      'expected', '0,0', 'actual', v_txt, 'pass', v_txt = '0,0');

    -- 7, 8 ----------------------------------------------------------- append-only, and erasure
    begin
      update app.crm_changes set new_value = '"x"' where record_id = v_co;
      v_txt := 'updated';
    exception when others then
      v_txt := 'refused';
    end;
    begin
      delete from app.crm_changes where record_id = v_co;
      v_txt := v_txt || ',deleted';
    exception when others then
      v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'while its record exists a changelog line is neither changed nor removed',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    perform public.admin_crm_contact_action(v_ct, 'erase', null);
    v_txt := (select count(*) from app.crm_changes where record_id = v_ct) || ','
      || (select string_agg(e.name || '[' || array_to_string(e.fields, '+') || ']', ';' order by e.id) from app.crm_events e where e.record_id = v_ct);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'erasing a contact removes its history; its events name no value',
      'expected', '0,contact.added[];contact.updated[name];contact.purged[]', 'actual', v_txt,
      'pass', v_txt = '0,contact.added[];contact.updated[name];contact.purged[]');

    -- 9 -------------------------------------------------------------- a completed task
    perform public.admin_crm_activity(v_co, null, 'task', 'Følg opp tilbud', current_date + 2);
    select id into v_task from app.crm_activities where company_id = v_co and kind = 'task' order by created_at desc limit 1;
    perform public.admin_crm_task_done(v_task);
    v_txt := (select string_agg(e.name, ';' order by e.id) from app.crm_events e where e.record_id = v_task);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a task marked done emits activity.completed',
      'expected', 'activity.added;activity.updated;activity.completed', 'actual', v_txt, 'pass', v_txt = 'activity.added;activity.updated;activity.completed');

    -- 10 ------------------------------------------------------------- the reader
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_json := public.admin_crm_history('company', v_co, null);
    v_txt := coalesce(v_json->>'error', 'ok') || ',' || jsonb_array_length(v_json->'changes') || ',' || (v_json->>'more')
      || ',' || (v_json->>'created_by') || ',' || (select string_agg(e->>'name', ';' order by e->>'name') from jsonb_array_elements(v_json->'events') e)
      || ',' || coalesce(public.admin_crm_history('company', v_co, ((v_json->'changes'->0->>'id')::bigint))->>'error', 'paged');
    v_ok := exists (select 1 from app.admin_audit a where a.admin_id = v_ana and a.action = 'crm.history' and a.target_id = v_co::text);
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_history('company', v_co, null)->>'error', 'ok')
      || ',' || has_function_privilege('anon', 'public.admin_crm_history(text,uuid,bigint)', 'execute')::text;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'an analyst reads the history (paged, audited); support and anon may not',
      'expected', 'ok,7,false,marketing@hist-test.example,company.added;company.stage_changed,paged,not_allowed,false audited',
      'actual', v_txt || case when v_ok then ' audited' else ' not audited' end,
      'pass', v_txt = 'ok,7,false,marketing@hist-test.example,company.added;company.stage_changed,paged,not_allowed,false' and v_ok);

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 11 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.crm_companies where org_number = '999820001'
    union all select email from app.crm_contacts where email like '%@hist-test.example'
    union all select email from auth.users where email like '%@hist-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._chi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._chi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._chi;
  if v_failed is not null then raise exception 'crm history invariants failed: %', v_failed; end if;
  if v_count <> 11 then raise exception 'crm history invariants: expected 11 rows, got %', v_count; end if;
end $$;
