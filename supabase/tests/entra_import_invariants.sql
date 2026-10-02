-- entra_import_invariants.sql — the Entra ID import (0165, D-202), proved against the live schema.
--
--   * the five tables are closed to every client (RLS on, no policy, no grant); the run's RPCs are
--     the service role's alone, the daglig leder's are authenticated's and check the role; the
--     guard trigger is in place and no client may call a helper (1)
--   * choosing groups: only the organisation's daglig leder; a group of the same name is reused,
--     a new one created (2)
--   * a first run links the CSV-imported person by e-mail (any case) instead of adding a second,
--     adds the others in the group ranked first, and refuses an address someone already has (3)
--   * while a round is open a move is deferred and the employee's group_id is unchanged; a
--     deactivation is at once and leaves the person's unused invitation exactly as it was (4)
--   * after the round closes, the next run applies the deferred move first (5)
--   * a rename in the directory renames the Orgpuls group and keeps the old name (6)
--   * a deselected group is unmapped, its Orgpuls group stays; its people are deactivated, not
--     deleted; no employee or group row is ever removed by a run (7)
--   * clients cannot read delta links or call the run's RPCs; the status RPC carries no link; another
--     organisation's daglig leder and the other roles are refused everything (8)
--   * a synced person's name and e-mail are locked to a client; a group set by hand pins it, the
--     sync leaves it, «Følg Entra» lets go (9)
--   * a stale run cannot apply; nothing in the run's functions reads or writes answers, responses,
--     invitations or token hashes (10)
--   * disconnecting releases the synced people as ordinary ones, and an organisation with an import
--     can still be deleted (the release trigger stands aside for referential maintenance) (11)
--   * nothing written here survives (12)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/entra_import_invariants.sql

create unlogged table if not exists public._eii(seq int, name text, expected text, actual text, pass bool);
truncate public._eii;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000e201';
  v_org2   uuid := '00000000-0000-4000-8000-00000000e202';
  v_dl     uuid := '00000000-0000-4000-8000-0000000e2011';
  v_vo     uuid := '00000000-0000-4000-8000-0000000e2012';
  v_al     uuid := '00000000-0000-4000-8000-0000000e2013';
  v_dl2    uuid := '00000000-0000-4000-8000-0000000e2014';
  v_tenant text := '11111111-2222-4333-8444-5555555e2001';
  g1       text := 'aaaaaaaa-0000-4000-8000-00000000e201';   -- «Drift» in the directory
  g2       text := 'aaaaaaaa-0000-4000-8000-00000000e202';   -- «Prosjekt»
  u1       text := 'bbbbbbbb-0000-4000-8000-00000000e201';   -- Kari, already in the register from a CSV
  u2       text := 'bbbbbbbb-0000-4000-8000-00000000e202';   -- Ola, in both groups
  u3       text := 'bbbbbbbb-0000-4000-8000-00000000e203';   -- Per, Prosjekt only
  u4       text := 'bbbbbbbb-0000-4000-8000-00000000e204';   -- an address someone in the register has
  v_drift  uuid;
  v_prosj  uuid;
  v_kari   uuid;
  v_run    uuid;
  v_meas   uuid;
  v_round  uuid;
  v_inv    uuid;
  v_hash   bytea;
  v_emp0   int;
  v_grp0   int;
  v_n      int;
  v_who    uuid;
  v_r      jsonb;
  v_txt    text;
  v_rows   jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated"}';
begin
  -- 1 ---------------------------------------------------------------- the catalogue
  select concat_ws('|',
    (select string_agg(c.relname || ':' || c.relrowsecurity::text, ',' order by c.relname) from pg_class c
      where c.relnamespace = 'app'::regnamespace and c.relname in ('entra_sync', 'entra_group_map', 'entra_members', 'entra_skips', 'entra_deferred')),
    (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relnamespace = 'app'::regnamespace and c.relname like 'entra\_%' and c.relname not in ('entra_tenants', 'entra_tenant_log', 'entra_bind_nonces', 'entra_sessions')),
    (select count(*) from information_schema.role_table_grants
      where table_schema = 'app' and table_name in ('entra_sync', 'entra_group_map', 'entra_members', 'entra_skips', 'entra_deferred')
        and grantee in ('anon', 'authenticated')),
    (select string_agg(x.f || '=' || has_function_privilege('authenticated', x.f, 'execute')::text || '/' || has_function_privilege('service_role', x.f, 'execute')::text, ',' order by x.f)
      from unnest(array['public.entra_sync_apply(uuid,uuid,jsonb)', 'public.entra_sync_begin(uuid)', 'public.entra_sync_due(uuid)',
                        'public.entra_sync_fail(uuid,uuid,text)']) x(f)),
    (select string_agg(has_function_privilege('anon', x.f, 'execute')::text || '/' || has_function_privilege('authenticated', x.f, 'execute')::text, ',' order by x.f)
      from unnest(array['public.entra_disconnect(uuid)', 'public.entra_follow_directory(uuid,uuid)', 'public.entra_group_search_target(uuid)',
                        'public.entra_select_groups(uuid,jsonb)', 'public.entra_sync_now(uuid)', 'public.entra_sync_settings(uuid,text,boolean)',
                        'public.entra_sync_status(uuid)']) x(f)),
    (select count(*) from pg_trigger where tgrelid = 'app.employees'::regclass and tgname = 'employees_entra_guard'),
    (select bool_or(has_function_privilege('authenticated', x.f, 'execute')) from unnest(array['app.entra_place(uuid,text)',
       'app.entra_apply_deferred(uuid)', 'app.entra_request(uuid)', 'app.entra_desired_group(uuid,text)', 'app.employees_entra_guard()',
       'app.entra_sync_released()', 'app.entra_sync_cron()']) x(f))::text)
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'tables closed to clients; run RPCs service-only; leader RPCs authenticated, not anon; guard in place; helpers no client''s',
    'expected', 'entra_deferred:true,entra_group_map:true,entra_members:true,entra_skips:true,entra_sync:true|0|0|public.entra_sync_apply(uuid,uuid,jsonb)=false/true,public.entra_sync_begin(uuid)=false/true,public.entra_sync_due(uuid)=false/true,public.entra_sync_fail(uuid,uuid,text)=false/true|false/true,false/true,false/true,false/true,false/true,false/true,false/true|1|false',
    'actual', v_txt,
    'pass', v_txt = 'entra_deferred:true,entra_group_map:true,entra_members:true,entra_skips:true,entra_sync:true|0|0|public.entra_sync_apply(uuid,uuid,jsonb)=false/true,public.entra_sync_begin(uuid)=false/true,public.entra_sync_due(uuid)=false/true,public.entra_sync_fail(uuid,uuid,text)=false/true|false/true,false/true,false/true,false/true,false/true,false/true,false/true|1|false');

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Katalog AS', '999000921', 10), (v_org2, 'Annen Katalog AS', '999000922', 3);
    insert into auth.users (id, email) values
      (v_dl, 'dl@eii-probe.no'), (v_vo, 'vo@eii-probe.no'), (v_al, 'al@eii-probe.no'), (v_dl2, 'dl2@eii-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina'), (v_vo, 'Vera'), (v_al, 'Arne'), (v_dl2, 'Dag');
    insert into app.groups (org_id, name, sort_order) values (v_org, 'Drift', 1) returning id into v_drift;
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud'),
      (v_org2, v_dl2, 'daglig_leder');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_drift);
    insert into app.entra_tenants (org_id, tenant_id) values (v_org, v_tenant);
    -- from a CSV paste, before the directory was connected; and one whose address a directory person also has
    insert into app.employees (org_id, full_name, email, group_id) values (v_org, 'Kari Nordmann', 'kari@katalog.no', v_drift)
      returning id into v_kari;
    insert into app.employees (org_id, full_name, email, group_id) values (v_org, 'Delt Adresse', 'post@katalog.no', v_drift);

    -- 2 -------------------------------------------------------------- choosing the groups
    set local role authenticated;
    v_txt := '';
    foreach v_who in array array[v_vo, v_al, v_dl2] loop
      perform set_config('request.jwt.claims', format(claims, v_who), true);
      v_txt := v_txt || (public.entra_select_groups(v_org, jsonb_build_array(jsonb_build_object('id', g1, 'name', 'Drift'))) ->> 'error') || ',';
    end loop;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_r := public.entra_select_groups(v_org, jsonb_build_array(jsonb_build_object('id', g1, 'name', 'drift'), jsonb_build_object('id', g2, 'name', 'Prosjekt')));
    v_r := public.entra_sync_settings(v_org, 'nightly', false);
    reset role;
    select id into v_prosj from app.groups where org_id = v_org and name = 'Prosjekt';
    v_txt := v_txt || concat_ws(',',
      (select string_agg(m.entra_group_id || '>' || case m.group_id when v_drift then 'Drift' when v_prosj then 'Prosjekt' else '?' end || '#' || m.priority, ';' order by m.priority)
        from app.entra_group_map m where m.org_id = v_org),
      (select count(*) from app.groups where org_id = v_org));
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'only the daglig leder chooses; «drift» reuses Drift, Prosjekt is created, the order is the priority',
      'expected', format('not_allowed,not_allowed,not_allowed,%s>Drift#0;%s>Prosjekt#1,2', g1, g2), 'actual', v_txt,
      'pass', v_txt = format('not_allowed,not_allowed,not_allowed,%s>Drift#0;%s>Prosjekt#1,2', g1, g2));

    select count(*) into v_emp0 from app.employees where org_id = v_org;
    select count(*) into v_grp0 from app.groups where org_id = v_org;

    -- 3 -------------------------------------------------------------- the first run
    set local role service_role;
    v_r := public.entra_sync_begin(v_org);
    v_run := (v_r->>'run_id')::uuid;
    v_txt := concat_ws(',', v_r->>'ok', v_r->>'full', v_r->>'round_open', jsonb_array_length(v_r->'employees'));
    v_r := public.entra_sync_apply(v_org, v_run, jsonb_build_object(
      'members', jsonb_build_object('replace', jsonb_build_object(g1, jsonb_build_array(u1, u2, u4), g2, jsonb_build_array(u2, u3))),
      'people', jsonb_build_array(
        jsonb_build_object('objectId', u1, 'op', 'link', 'employeeId', v_kari, 'email', 'KARI@katalog.no', 'fullName', 'Kari Nordmann', 'language', 'en'),
        jsonb_build_object('objectId', u2, 'op', 'add', 'fullName', 'Ola Hansen', 'email', 'ola@katalog.no', 'phone', '+4791234567'),
        jsonb_build_object('objectId', u3, 'op', 'add', 'fullName', 'Per Berg', 'email', 'per@katalog.no'),
        jsonb_build_object('objectId', u4, 'op', 'add', 'fullName', 'Felles Postkasse', 'email', 'POST@katalog.no')),
      'place', jsonb_build_array(u1),
      'conflicts', jsonb_build_array(jsonb_build_object('objectId', u2)),
      'links', jsonb_build_object('users', 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=x', 'groups', jsonb_build_array('https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=y'), 'full', true)));
    reset role;
    v_txt := v_txt || '|' || concat_ws(',',
      v_r->'counts'->>'added', v_r->'counts'->>'linked', v_r->'counts'->>'conflicts',
      (select count(*) from app.employees where org_id = v_org and lower(email) = 'kari@katalog.no'),
      (select source || ':' || (entra_object_id = u1)::text || ':' || email || ':' || language from app.employees where id = v_kari),
      (select g.name || ':' || coalesce(e.phone, '-') from app.employees e join app.groups g on g.id = e.group_id where e.entra_object_id = u2),
      (select g.name from app.employees e join app.groups g on g.id = e.group_id where e.entra_object_id = u3),
      (select count(*) from app.employees where org_id = v_org and lower(email) = 'post@katalog.no'),
      (select reason from app.entra_skips where org_id = v_org and object_id = u4),
      (select run_status from app.entra_sync where org_id = v_org));
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'first run: Kari linked by e-mail, not duplicated; Ola (two groups) in the first-ranked; a taken address refused',
      'expected', 'true,true,false,2|2,1,1,1,entra:true:KARI@katalog.no:en,Drift:-,Prosjekt,1,email_taken,done', 'actual', v_txt,
      'pass', v_txt = 'true,true,false,2|2,1,1,1,entra:true:KARI@katalog.no:en,Drift:-,Prosjekt,1,email_taken,done');

    -- 4 -------------------------------------------------------------- a round opens: moves wait, leaving is at once
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '6 days') returning id into v_round;
    v_hash := extensions.digest('eii-probe-token-per', 'sha256');
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_org, v_round, e.id, v_hash, now() + interval '6 days' from app.employees e where e.entra_object_id = u3
    returning id into v_inv;
    set local role service_role;
    v_r := public.entra_sync_begin(v_org);
    v_run := (v_r->>'run_id')::uuid;
    v_txt := v_r->>'round_open';
    -- Ola leaves Drift (Prosjekt is all he has now); Per leaves Prosjekt (no group left)
    v_r := public.entra_sync_apply(v_org, v_run, jsonb_build_object(
      'members', jsonb_build_object('remove', jsonb_build_array(jsonb_build_array(g1, u2), jsonb_build_array(g2, u3))),
      'place', jsonb_build_array(u2),
      'deactivate', jsonb_build_array(jsonb_build_object('objectId', u3, 'reason', 'left_groups')),
      'links', jsonb_build_object('users', 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=x2', 'groups', jsonb_build_array(), 'full', false)));
    reset role;
    v_txt := v_txt || '|' || concat_ws(',',
      v_r->'counts'->>'deferred', v_r->'counts'->>'moved', v_r->'counts'->>'deactivated',
      (select g.name from app.employees e join app.groups g on g.id = e.group_id where e.entra_object_id = u2),
      (select g.name from app.entra_deferred d join app.groups g on g.id = d.group_id join app.employees e on e.id = d.employee_id where e.entra_object_id = u2),
      (select e.active::text || ':' || g.name from app.employees e join app.groups g on g.id = e.group_id where e.entra_object_id = u3),
      (select (i.responded_at is null and i.token_hash = v_hash and i.employee_id is not null and i.expires_at > now())::text from app.invitations i where i.id = v_inv));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'round open: Ola''s move is deferred and his group_id unchanged; Per is deactivated at once, his group and invitation untouched',
      'expected', 'true|1,0,1,Drift,Prosjekt,false:Prosjekt,true', 'actual', v_txt,
      'pass', v_txt = 'true|1,0,1,Drift,Prosjekt,false:Prosjekt,true');

    -- 5 -------------------------------------------------------------- the round closes: the next run moves him first
    update app.rounds set status = 'lukket', closes_at = now() where id = v_round;
    set local role service_role;
    v_r := public.entra_sync_begin(v_org);
    v_run := (v_r->>'run_id')::uuid;
    reset role;
    v_txt := concat_ws(',', v_r->>'round_open', jsonb_array_length(v_r->'deferred'),
      (select g.name from app.employees e join app.groups g on g.id = e.group_id where e.entra_object_id = u2));
    set local role service_role;
    v_r := public.entra_sync_apply(v_org, v_run, jsonb_build_object('links', jsonb_build_object('users', 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=x3', 'full', false)));
    reset role;
    v_txt := v_txt || '|' || concat_ws(',', v_r->'counts'->>'applied_deferred', (select count(*) from app.entra_deferred where org_id = v_org));
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'after the round closed, the next run''s begin applies the deferred move',
      'expected', 'false,0,Prosjekt|1,0', 'actual', v_txt, 'pass', v_txt = 'false,0,Prosjekt|1,0');

    -- 6 -------------------------------------------------------------- a rename in the directory
    set local role service_role;
    v_r := public.entra_sync_begin(v_org);
    v_run := (v_r->>'run_id')::uuid;
    v_r := public.entra_sync_apply(v_org, v_run, jsonb_build_object('groups', jsonb_build_array(jsonb_build_object('id', g1, 'name', 'Drift  Nord')),
      'links', jsonb_build_object('users', 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=x4', 'full', false)));
    reset role;
    v_txt := concat_ws(',', v_r->'counts'->>'renamed', (select name || ':' || array_to_string(former_names, '/') from app.groups where id = v_drift),
      (select entra_name from app.entra_group_map where org_id = v_org and entra_group_id = g1));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a renamed Entra group renames its Orgpuls group, which keeps the old name for masking',
      'expected', '1,Drift Nord:Drift,Drift  Nord', 'actual', v_txt, 'pass', v_txt = '1,Drift Nord:Drift,Drift  Nord');

    -- 7 -------------------------------------------------------------- deselecting: unmapped, nothing deleted
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_r := public.entra_select_groups(v_org, jsonb_build_array(jsonb_build_object('id', g1, 'name', 'Drift Nord')));
    reset role;
    set local role service_role;
    v_r := public.entra_sync_begin(v_org);
    v_run := (v_r->>'run_id')::uuid;
    v_txt := v_r->>'full';
    v_r := public.entra_sync_apply(v_org, v_run, jsonb_build_object('members', jsonb_build_object('replace', jsonb_build_object(g1, jsonb_build_array(u1))),
      'links', jsonb_build_object('users', 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=x5', 'full', true)));
    reset role;
    v_txt := v_txt || '|' || concat_ws(',',
      (select count(*) from app.entra_group_map where org_id = v_org),
      (select count(*) from app.groups where id = v_prosj),
      (select e.active::text from app.employees e where e.entra_object_id = u2),
      (select count(*) from app.employees where org_id = v_org) >= v_emp0 + 2,
      (select count(*) from app.groups where org_id = v_org) = v_grp0,
      (select count(*) from app.entra_members where org_id = v_org and entra_group_id = g2));
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a deselected group is unmapped and stays; its people are deactivated, never deleted',
      'expected', 'true|1,1,false,t,t,0', 'actual', v_txt, 'pass', v_txt = 'true|1,1,false,t,t,0');

    -- 8 -------------------------------------------------------------- what a client can reach
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := '';
    begin
      perform 1 from app.entra_sync;
      v_txt := 'read';
    exception when insufficient_privilege then v_txt := '42501';
    end;
    begin
      perform 1 from app.entra_members;
      v_txt := v_txt || ',read';
    exception when insufficient_privilege then v_txt := v_txt || ',42501';
    end;
    begin
      perform public.entra_sync_begin(v_org);
      v_txt := v_txt || ',called';
    exception when insufficient_privilege then v_txt := v_txt || ',42501';
    end;
    begin
      perform public.entra_sync_apply(v_org, v_run, '{}');
      v_txt := v_txt || ',called';
    exception when insufficient_privilege then v_txt := v_txt || ',42501';
    end;
    v_r := public.entra_sync_status(v_org);
    v_txt := v_txt || ',' || (v_r->>'ok') || ',' || (position('graph.microsoft.com' in v_r::text) = 0)::text || ',' || (v_r->>'synced');
    foreach v_who in array array[v_vo, v_al, v_dl2] loop
      perform set_config('request.jwt.claims', format(claims, v_who), true);
      v_txt := v_txt || ',' || concat_ws('/', public.entra_sync_status(v_org)->>'error', public.entra_sync_now(v_org)->>'error',
        public.entra_disconnect(v_org)->>'error', public.entra_sync_settings(v_org, 'manual', true)->>'error',
        public.entra_follow_directory(v_org, v_kari)->>'error', public.entra_group_search_target(v_org)->>'error');
    end loop;
    reset role;
    set local role anon;
    begin
      perform public.entra_sync_status(v_org);
      v_txt := v_txt || ',anon-called';
    exception when insufficient_privilege then v_txt := v_txt || ',anon-42501';
    end;
    reset role;
    v_txt := v_txt || ',' || (select mode || ':' || include_phone::text from app.entra_sync where org_id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'no client reads the tables or calls the run; status has no link; other roles and organisations are refused; anon nothing',
      'expected', '42501,42501,42501,42501,true,true,1,not_allowed/not_allowed/not_allowed/not_allowed/not_allowed/not_allowed,not_allowed/not_allowed/not_allowed/not_allowed/not_allowed/not_allowed,not_allowed/not_allowed/not_allowed/not_allowed/not_allowed/not_allowed,anon-42501,nightly:false',
      'actual', v_txt,
      'pass', v_txt = '42501,42501,42501,42501,true,true,1,not_allowed/not_allowed/not_allowed/not_allowed/not_allowed/not_allowed,not_allowed/not_allowed/not_allowed/not_allowed/not_allowed/not_allowed,not_allowed/not_allowed/not_allowed/not_allowed/not_allowed/not_allowed,anon-42501,nightly:false');

    -- 9 -------------------------------------------------------------- Ansatte: name and e-mail locked, group pinned by hand
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := '';
    begin
      update app.employees set full_name = 'Kari Endret' where id = v_kari;
      v_txt := 'renamed';
    exception when insufficient_privilege then v_txt := '42501';
    end;
    begin
      update app.employees set email = 'annen@katalog.no' where id = v_kari;
      v_txt := v_txt || ',changed';
    exception when insufficient_privilege then v_txt := v_txt || ',42501';
    end;
    update app.employees set entra_object_id = null, source = 'manual' where id = v_kari;   -- ignored
    update app.employees set group_id = v_prosj, phone = '+4798765432' where id = v_kari;  -- allowed, and pins
    insert into app.employees (org_id, full_name, email, source, entra_object_id, entra_group_pinned)
    values (v_org, 'Manuell Person', 'manuell@katalog.no', 'entra', u4, true);                -- the Entra columns are reset
    reset role;
    v_txt := v_txt || ',' || (select concat_ws(':', source, entra_object_id = u1, entra_group_pinned, group_id = v_prosj, phone) from app.employees where id = v_kari)
                   || ',' || (select concat_ws(':', source, coalesce(entra_object_id, '-'), entra_group_pinned) from app.employees where email = 'manuell@katalog.no' and org_id = v_org);
    set local role service_role;
    v_r := public.entra_sync_begin(v_org);
    v_run := (v_r->>'run_id')::uuid;
    v_r := public.entra_sync_apply(v_org, v_run, jsonb_build_object('place', jsonb_build_array(u1),
      'links', jsonb_build_object('users', 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=x6', 'full', false)));
    reset role;
    v_txt := v_txt || ',' || (select (group_id = v_prosj)::text from app.employees where id = v_kari);
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := v_txt || ',' || (public.entra_follow_directory(v_org, v_kari)->>'placed');
    reset role;
    v_txt := v_txt || ',' || (select (group_id = v_drift)::text || ':' || entra_group_pinned::text from app.employees where id = v_kari);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a client cannot change a synced name or e-mail or the Entra columns; a group by hand pins it; «Følg Entra» lets go',
      'expected', '42501,42501,entra:t:t:t:+4798765432,manual:-:f,true,moved,true:false', 'actual', v_txt,
      'pass', v_txt = '42501,42501,entra:t:t:t:+4798765432,manual:-:f,true,moved,true:false');

    -- 10 ------------------------------------------------------------- a stale run; nothing about answers
    set local role service_role;
    v_r := public.entra_sync_apply(v_org, v_run, '{}');
    v_txt := v_r->>'error';
    v_r := public.entra_sync_begin(v_org);
    v_txt := v_txt || ',' || (public.entra_sync_begin(v_org)->>'error');
    v_txt := v_txt || ',' || (public.entra_sync_fail(v_org, (v_r->>'run_id')::uuid, 'Not A Code')->>'ok');
    reset role;
    v_txt := v_txt || ',' || (select run_status || ':' || run_error from app.entra_sync where org_id = v_org)
      || ',' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname in ('app', 'public') and (p.proname like 'entra\_sync%' or p.proname in ('entra_place', 'entra_apply_deferred',
                   'entra_desired_group', 'entra_select_groups', 'entra_follow_directory', 'entra_disconnect', 'employees_entra_guard'))
                   and p.prosrc ~* '(app\.(responses|answers|extra_answers|response_comments|invitations)\M|token_hash|responded_at)');
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'a finished run cannot apply again; one run at a time; failure codes are shaped; no run function touches answers or invitations',
      'expected', 'not_running,busy,true,failed:failed,0', 'actual', v_txt, 'pass', v_txt = 'not_running,busy,true,failed:failed,0');

    -- 11 ------------------------------------------------------------- disconnecting, and deleting the organisation
    select count(*) into v_n from app.employees where org_id = v_org;
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := public.entra_disconnect(v_org)->>'ok';
    update app.employees set full_name = 'Kari N. Nordmann' where id = v_kari;   -- an ordinary person again
    reset role;
    v_txt := v_txt || ',' || concat_ws(',',
      (select count(*) from app.entra_sync where org_id = v_org),
      (select count(*) from app.employees where org_id = v_org and (source = 'entra' or entra_object_id is not null)),
      (select count(*) from app.employees where org_id = v_org) = v_n,
      (select full_name from app.employees where id = v_kari),
      (select count(*) from app.entra_tenants where org_id = v_org));
    -- a fresh import, then the organisation goes: cascades through the tenant, the sync and the people
    set local role authenticated;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_r := public.entra_select_groups(v_org, jsonb_build_array(jsonb_build_object('id', g1, 'name', 'Drift Nord')));
    reset role;
    update app.employees set source = 'entra', entra_object_id = u1 where id = v_kari;
    -- in one statement, invitations and all: the organisation's rounds go first (0190, D-206)
    delete from app.organizations where id = v_org;
    v_txt := v_txt || ',' || (select count(*) from app.employees where org_id = v_org) || ',' || (select count(*) from app.entra_sync where org_id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'disconnecting releases the synced people as ordinary ones; deleting the organisation still cascades',
      'expected', 'true,0,0,t,Kari N. Nordmann,1,0,0', 'actual', v_txt, 'pass', v_txt = 'true,0,0,t,Kari N. Nordmann,1,0,0');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 12 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email ilike '%@eii-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_org2)
    union all select org_id::text from app.entra_sync where org_id in (v_org, v_org2)
    union all select org_id::text from app.entra_tenants where org_id in (v_org, v_org2)
    union all select id::text from app.employees where org_id in (v_org, v_org2)) x;
  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._eii
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._eii order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._eii;
  if v_failed is not null then raise exception 'entra import invariants failed: %', v_failed; end if;
  if v_count <> 12 then raise exception 'entra import invariants: expected 12 rows, got %', v_count; end if;
end $$;
