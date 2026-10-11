-- join_request_invariants.sql — signing up with a company's name (0232, X-114, D-279), proved
-- against the live schema.
--
-- The sign-up no longer needs an organisation number, so the database recognises a company that is
-- already here by its number, its name or the daglig leder's work domain, and then makes no second
-- organisation: it files a request, which goes to that organisation's daglig leder once the person
-- says the company is theirs. What must hold:
--
--   * **A request lets nobody in.** The person who asks has no membership until the daglig leder
--     decides, and only that organisation's daglig leder can read a confirmed request or decide it.
--   * **Nothing is sent before the person confirms.** An unconfirmed request is read by nobody and
--     tells nobody.
--   * **The match is the one promised.** Name without case, punctuation or legal form; a typed number
--     by the number alone, its check digit valid, never outvoted by a name; a work address only when
--     confirmed, not at a free provider, and the daglig leder's domain, not any member's; never a demo.
--   * **The daglig leder is told once,** members only, a notice past the day's five waits its turn
--     rather than being dropped, and a request that is no longer pending is never told.
--   * **Writes to an organisation still work** for the roles that make them (the name index).
--
-- The suite makes its own throwaway accounts (a uuid and an address, no password, no identity) and
-- organisations, and the last assertion proves they are all gone again.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/join_request_invariants.sql

create unlogged table if not exists public._jr(seq int, name text, expected text, actual text, pass bool);
truncate public._jr;

do $$
declare
  -- the existing organisation, its daglig leder, an avdelingsleder, and a consultant who is a member
  u_lead   uuid := '00000000-0000-4000-8000-0000000a7001';
  u_dept   uuid := '00000000-0000-4000-8000-0000000a7002';
  u_cons   uuid := '00000000-0000-4000-8000-0000000a700b';
  -- people who sign up
  u_name   uuid := '00000000-0000-4000-8000-0000000a7003';  -- by name
  u_domain uuid := '00000000-0000-4000-8000-0000000a7004';  -- by the daglig leder's domain
  u_unconf uuid := '00000000-0000-4000-8000-0000000a7005';  -- an unconfirmed work address
  u_free   uuid := '00000000-0000-4000-8000-0000000a7006';  -- a free provider; their company has no number
  u_number uuid := '00000000-0000-4000-8000-0000000a7007';  -- by the organisation number
  u_other  uuid := '00000000-0000-4000-8000-0000000a7008';  -- the same name, another number
  u_demo   uuid := '00000000-0000-4000-8000-0000000a7009';  -- a demo organisation's name
  u_amb    uuid := '00000000-0000-4000-8000-0000000a700a';  -- a name two organisations answer to
  u_cons2  uuid := '00000000-0000-4000-8000-0000000a700c';  -- the consultant's colleague
  u_real   uuid := '00000000-0000-4000-8000-0000000a700d';  -- a company whose name somebody took first
  u_sep    uuid := '00000000-0000-4000-8000-0000000a700e';  -- another company, before confirming
  v_users  uuid[];
  v_org    uuid;
  v_demo   uuid;
  v_group  uuid;
  v_new    uuid[] := array[]::uuid[];
  v_json   jsonb;
  v_claim  jsonb;
  v_job    jsonb;
  v_req    uuid;
  v_n      int;
  v_txt    text;
  v_mine   uuid;
  v_ids    uuid[];
begin
  v_users := array[u_lead, u_dept, u_cons, u_name, u_domain, u_unconf, u_free, u_number, u_other, u_demo, u_amb,
                   u_cons2, u_real, u_sep];

  -- 1..4 -------------------------------------------------------------- the surface
  insert into public._jr
  select 1, 'the five functions are executable by a signed-in caller only', '5',
         count(*)::text, count(*) = 5
  from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee = 'authenticated'
    and routine_name in ('signup_organisation', 'decide_join_request', 'my_join_request', 'signup_separately', 'confirm_join_request')
    and not exists (select 1 from information_schema.role_routine_grants g
                    where g.routine_schema = 'public' and g.routine_name = role_routine_grants.routine_name
                      and g.grantee in ('anon', 'PUBLIC'));

  insert into public._jr
  select 2, 'each, and the trigger that withdraws requests, is security definer with an empty search path', '6',
         count(*)::text, count(*) = 6
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where ((n.nspname = 'public' and p.proname in ('signup_organisation', 'decide_join_request', 'my_join_request',
                                                 'signup_separately', 'confirm_join_request'))
         or (n.nspname = 'app' and p.proname = 'join_requests_withdraw'))
    and p.prosecdef and 'search_path=""' = any(coalesce(p.proconfig, array['none']));

  insert into public._jr
  select 3, 'requests: RLS on, and no client may write them', 'rls|0',
         case when c.relrowsecurity then 'rls' else 'NO RLS' end || '|' ||
         (select count(*) from information_schema.role_table_grants g
          where g.table_schema = 'app' and g.table_name = 'join_requests'
            and g.grantee in ('anon', 'authenticated') and g.privilege_type <> 'SELECT')::text,
         c.relrowsecurity and not exists (select 1 from information_schema.role_table_grants g
          where g.table_schema = 'app' and g.table_name = 'join_requests'
            and g.grantee in ('anon', 'authenticated') and g.privilege_type <> 'SELECT')
  from pg_class c where c.oid = 'app.join_requests'::regclass;

  insert into public._jr
  select 4, 'the only policy reads, for the daglig leder', 'SELECT',
         coalesce(string_agg(cmd, ','), 'none'), coalesce(string_agg(cmd, ','), '') = 'SELECT'
  from pg_policies where schemaname = 'app' and tablename = 'join_requests';

  -- 5..8 ------------------------------------------------------- how a name is read
  insert into public._jr values (5, 'case, spacing and the legal form do not count', 'nordvik anlegg',
    coalesce(app.org_name_key('  NORDVIK   Anlegg AS '), 'null'), app.org_name_key('  NORDVIK   Anlegg AS ') = 'nordvik anlegg');
  insert into public._jr values (6, 'A/S, a hyphen and a full stop read as the same name', 'nordvik anlegg',
    coalesce(app.org_name_key('Nordvik-Anlegg A/S.'), 'null'), app.org_name_key('Nordvik-Anlegg A/S.') = 'nordvik anlegg');
  insert into public._jr values (7, 'Norwegian letters are letters', 'ørsta bygg og sønn',
    coalesce(app.org_name_key('Ørsta Bygg & Sønn AS'), 'null'), app.org_name_key('Ørsta Bygg & Sønn AS') = 'ørsta bygg og sønn'
      or app.org_name_key('Ørsta Bygg & Sønn AS') = 'ørsta bygg sønn');
  insert into public._jr values (8, 'a British company and a Swedish one', 'brackenmoor civils|norrvik anläggning',
    coalesce(app.org_name_key('Brackenmoor Civils Ltd.'), 'null') || '|' || coalesce(app.org_name_key('Norrvik Anläggning AB'), 'null'),
    app.org_name_key('Brackenmoor Civils Ltd.') = 'brackenmoor civils' and app.org_name_key('Norrvik Anläggning AB') = 'norrvik anläggning');

  -- the existing organisation: a daglig leder, an avdelingsleder, a consultant, a department. Their addresses
  -- are under subdomains of orgpuls.com, which receive no mail, because the dispatcher (rightly) skips the
  -- reserved .example names and the dispatcher check needs a recipient; nothing is sent, the claim is undone
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e,
         case when c then now() end, now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (u_lead, 'leder@invariant-sammen.orgpuls.com', true),
               (u_dept, 'avdeling@invariant-sammen.orgpuls.com', true),
               (u_cons, 'konsulent@radgiver-invariant.orgpuls.com', true),
               (u_name, 'navn@annet-firma.example', true),
               (u_domain, 'kollega@invariant-sammen.orgpuls.com', true),
               (u_unconf, 'ubekreftet@invariant-sammen.orgpuls.com', false),
               (u_free, 'privat.person@gmail.com', true),
               (u_number, 'nummer@tredje-firma.example', true),
               (u_other, 'annen@fjerde-firma.example', true),
               (u_demo, 'demo.navn@femte-firma.example', true),
               (u_amb, 'tvetydig@sjette-firma.example', true),
               (u_cons2, 'kollega@radgiver-invariant.orgpuls.com', true),
               (u_real, 'hr@ekte-firma.example', true),
               (u_sep, 'egen@syvende-firma.example', true)) x(u, e, c);
  insert into app.profiles (id, full_name) values (u_lead, 'Leder Invariant'), (u_dept, 'Avdeling Invariant'), (u_cons, 'Konsulent Invariant');

  insert into app.organizations (name, org_number, employee_count, threshold, market)
  values ('Invariant Sammen AS', '999999115', 20, app.k_min(), 'no') returning id into v_org;
  insert into app.groups (org_id, name) values (v_org, 'Drift') returning id into v_group;
  insert into app.memberships (org_id, user_id, role, active) values (v_org, u_lead, 'daglig_leder', true);
  insert into app.memberships (org_id, user_id, role, active, group_id) values (v_org, u_dept, 'avdelingsleder', true, v_group);
  insert into app.memberships (org_id, user_id, role, active) values (v_org, u_cons, 'verneombud', true);

  -- a demo organisation with a name somebody could type
  insert into app.organizations (name, employee_count, threshold, market)
  values ('Invariant Demo AS', 5, app.k_min(), 'no') returning id into v_demo;
  insert into app.demo_orgs (org_id, kind) values (v_demo, 'sandbox');

  -- 9..12 ------------------------------------------------------------ the refusals
  perform set_config('request.jwt.claims', '', true);
  v_json := public.signup_organisation('Hvem Som Helst AS', 5, 'Ingen');
  insert into public._jr values (9, 'no session, no organisation and no request', 'not_signed_in',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'not_signed_in');

  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Noe Nytt AS', 5, 'Leder Invariant');
  insert into public._jr values (10, 'a member asks for nothing and makes nothing', 'already_a_member',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'already_a_member');

  perform set_config('request.jwt.claims', json_build_object('sub', u_name, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Feil Nummer AS', 5, 'Navn', 'no', '12345');
  insert into public._jr values (11, 'a typed number is still held to the market''s rule', 'invalid_org_number',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'invalid_org_number');

  v_json := public.signup_organisation('Feil Nummer AS', 5, 'Navn', 'no', '999999995');
  insert into public._jr values (12, 'a Norwegian number with a wrong check digit is refused, not routed', 'invalid_org_number|0',
    coalesce(v_json->>'error', v_json::text) || '|' || (select count(*) from app.join_requests where user_id = u_name)::text,
    v_json->>'error' = 'invalid_org_number' and not exists (select 1 from app.join_requests where user_id = u_name));

  -- 13..16 ------------------------------------------- found, and nothing sent before they confirm
  v_json := public.signup_organisation('invariant sammen', 5, 'Navn Navnesen');
  insert into public._jr values (13, 'the same name, typed loosely, finds the company, makes none, and waits on the person',
    'requested|Invariant Sammen AS|name|unconfirmed',
    coalesce(v_json->>'outcome', v_json::text) || '|' || coalesce(v_json->>'company', '') || '|' ||
      coalesce((select matched_by || '|' || status from app.join_requests where user_id = u_name and org_id = v_org), 'none'),
    v_json->>'outcome' = 'requested' and v_json->>'company' = 'Invariant Sammen AS'
      and exists (select 1 from app.join_requests where user_id = u_name and org_id = v_org and matched_by = 'name' and status = 'unconfirmed'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.join_requests where org_id = v_org;
  reset role;
  insert into public._jr values (14, 'unconfirmed, the daglig leder reads nothing and nobody is told', '0|0',
    v_n::text || '|' || (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang')::text,
    v_n = 0 and not exists (select 1 from app.outbox where org_id = v_org and kind = 'tilgang'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_name, 'role', 'authenticated')::text, true);
  v_json := public.confirm_join_request();
  insert into public._jr values (15, 'confirmed, it waits on the daglig leder, who is told now', 'Invariant Sammen AS|pending|1|now',
    coalesce(v_json->>'company', v_json::text) || '|' ||
      coalesce((select status from app.join_requests where user_id = u_name), 'none') || '|' ||
      (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang')::text || '|' ||
      case when (select max(due_at) from app.outbox where org_id = v_org and kind = 'tilgang') <= now() then 'now' else 'later' end,
    v_json->>'company' = 'Invariant Sammen AS'
      and (select status from app.join_requests where user_id = u_name) = 'pending'
      and (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang') = 1
      and (select max(due_at) from app.outbox where org_id = v_org and kind = 'tilgang') <= now());

  perform set_config('request.jwt.claims', json_build_object('sub', u_domain, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Et Helt Annet Navn AS', 5, 'Kollega Kollegasen');
  insert into public._jr values (16, 'a confirmed address at the daglig leder''s domain finds the company under another name',
    'requested|domain', coalesce(v_json->>'outcome', v_json::text) || '|' ||
      coalesce((select matched_by from app.join_requests where user_id = u_domain and org_id = v_org), 'none'),
    v_json->>'outcome' = 'requested' and exists (select 1 from app.join_requests where user_id = u_domain and org_id = v_org and matched_by = 'domain'));
  v_json := public.confirm_join_request();

  -- 17..22 ------------------------------------------------------------- what is not a match
  perform set_config('request.jwt.claims', json_build_object('sub', u_unconf, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Ubekreftet Firma AS', 5, 'Ubekreftet');
  v_txt := coalesce(v_json->>'outcome', v_json::text);
  select array_append(v_new, (select org_id from app.memberships where user_id = u_unconf)) into v_new;
  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Privat Firma AS', 5, 'Privat');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_free)) into v_new;
  insert into public._jr values (17, 'an unconfirmed address or a free provider proves nothing: a new organisation',
    'created|created', v_txt || '|' || coalesce(v_json->>'outcome', v_json::text),
    v_txt = 'created' and v_json->>'outcome' = 'created'
      and exists (select 1 from app.memberships m where m.user_id = u_free and m.role = 'daglig_leder')
      and not exists (select 1 from app.join_requests where user_id in (u_unconf, u_free)));

  perform set_config('request.jwt.claims', json_build_object('sub', u_cons2, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Rådgiver Invariant AS', 5, 'Rådgiverkollega');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_cons2)) into v_new;
  insert into public._jr values (18, 'a consultant member''s domain routes nobody: only the daglig leder''s counts', 'created|0',
    coalesce(v_json->>'outcome', v_json::text) || '|' || (select count(*) from app.join_requests where user_id = u_cons2)::text,
    v_json->>'outcome' = 'created' and not exists (select 1 from app.join_requests where user_id = u_cons2));

  perform set_config('request.jwt.claims', json_build_object('sub', u_real, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Privat Firma AS', 5, 'Kari Ekte', 'no', '999999131');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_real)) into v_new;
  insert into public._jr values (19, 'a typed number is never outvoted by a name somebody registered first without one', 'created|0|999999131',
    coalesce(v_json->>'outcome', v_json::text) || '|' || (select count(*) from app.join_requests where user_id = u_real)::text || '|' ||
      coalesce((select o.org_number from app.memberships m join app.organizations o on o.id = m.org_id where m.user_id = u_real), 'none'),
    v_json->>'outcome' = 'created' and not exists (select 1 from app.join_requests where user_id = u_real)
      and exists (select 1 from app.memberships m join app.organizations o on o.id = m.org_id where m.user_id = u_real and o.org_number = '999999131'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Invariant Sammen AS', 5, 'Annen', 'no', '999999123');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_other)) into v_new;
  insert into public._jr values (20, 'the same name with another number is another undertaking', 'created|999999123',
    coalesce(v_json->>'outcome', v_json::text) || '|' ||
      coalesce((select o.org_number from app.memberships m join app.organizations o on o.id = m.org_id where m.user_id = u_other), 'none'),
    v_json->>'outcome' = 'created'
      and exists (select 1 from app.memberships m join app.organizations o on o.id = m.org_id
                  where m.user_id = u_other and o.org_number = '999999123'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_demo, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Invariant Demo AS', 5, 'Demo Navn');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_demo)) into v_new;
  insert into public._jr values (21, 'a demo organisation is never found', 'created',
    coalesce(v_json->>'outcome', v_json::text),
    v_json->>'outcome' = 'created' and not exists (select 1 from app.join_requests where org_id = v_demo));

  perform set_config('request.jwt.claims', json_build_object('sub', u_amb, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Invariant Sammen AS', 5, 'Tvetydig');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_amb)) into v_new;
  insert into public._jr values (22, 'a name two organisations answer to finds neither: nobody''s request goes to the wrong one',
    'created|0', coalesce(v_json->>'outcome', v_json::text) || '|' ||
      (select count(*) from app.join_requests where user_id = u_amb)::text,
    v_json->>'outcome' = 'created' and not exists (select 1 from app.join_requests where user_id = u_amb));

  -- 23..24 ---------------------------------------------------- the number, and one request at a time
  perform set_config('request.jwt.claims', json_build_object('sub', u_number, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Noe Helt Eget', 5, 'Nummer Nummersen', 'no', '999999115');
  insert into public._jr values (23, 'the number finds the undertaking whatever it is called', 'requested|org_number',
    coalesce(v_json->>'outcome', v_json::text) || '|' ||
      coalesce((select matched_by from app.join_requests where user_id = u_number and org_id = v_org), 'none'),
    v_json->>'outcome' = 'requested' and exists (select 1 from app.join_requests where user_id = u_number and org_id = v_org and matched_by = 'org_number'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_name, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Noe Annet AS', 5, 'Navn Navnesen');
  insert into public._jr values (24, 'an account waiting on one company asks no other: the same request, no second', 'Invariant Sammen AS|1|1',
    coalesce(v_json->>'company', v_json::text) || '|' ||
      (select count(*) from app.join_requests where user_id = u_name)::text || '|' ||
      (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang' and join_request_id in
         (select id from app.join_requests where user_id = u_name))::text,
    v_json->>'company' = 'Invariant Sammen AS' and (select count(*) from app.join_requests where user_id = u_name) = 1
      and not exists (select 1 from app.memberships where user_id = u_name));

  -- 25..29 ------------------------------------------------------------- who can read a request
  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.join_requests where org_id = v_org;
  reset role;
  insert into public._jr values (25, 'the daglig leder reads the confirmed requests, not the unconfirmed one', '2', v_n::text, v_n = 2);

  perform set_config('request.jwt.claims', json_build_object('sub', u_dept, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.join_requests;
  reset role;
  insert into public._jr values (26, 'an avdelingsleder reads none', '0', v_n::text, v_n = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', u_name, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.join_requests;
  reset role;
  insert into public._jr values (27, 'the person who asked reads none, not even their own', '0', v_n::text, v_n = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.join_requests;
  reset role;
  insert into public._jr values (28, 'another organisation''s daglig leder reads none', '0', v_n::text, v_n = 0);

  -- the daglig leder judges a request by its name and address; the account behind it is not theirs to read
  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    select count(user_id) into v_n from app.join_requests;
    reset role;
    insert into public._jr values (29, 'the account behind a request is not readable', 'denied', 'READ', false);
  exception when insufficient_privilege then
    reset role;
    insert into public._jr values (29, 'the account behind a request is not readable', 'denied', 'denied', true);
  end;

  -- 30..31 -------------------------------------------------------------- the person waiting
  perform set_config('request.jwt.claims', json_build_object('sub', u_name, 'role', 'authenticated')::text, true);
  v_json := public.my_join_request();
  insert into public._jr values (30, 'the person waiting sees the company, the state and what they typed', 'Invariant Sammen AS|pending|invariant sammen|true',
    coalesce(v_json->>'company', 'null') || '|' || coalesce(v_json->>'status', 'null') || '|' ||
      coalesce(v_json->>'typed', 'null') || '|' || coalesce(v_json->>'separable', 'null'),
    v_json->>'company' = 'Invariant Sammen AS' and v_json->>'status' = 'pending'
      and v_json->>'typed' = 'invariant sammen' and (v_json->>'separable')::bool);

  perform set_config('request.jwt.claims', json_build_object('sub', u_number, 'role', 'authenticated')::text, true);
  v_json := public.my_join_request();
  insert into public._jr values (31, 'found by the number: unconfirmed, and not to be called another company', 'unconfirmed|false',
    coalesce(v_json->>'status', 'null') || '|' || coalesce(v_json->>'separable', 'null'),
    v_json->>'status' = 'unconfirmed' and not (v_json->>'separable')::bool);

  -- 32..38 ---------------------------------------------------------------- deciding
  select id into v_req from app.join_requests where user_id = u_name and org_id = v_org;

  perform set_config('request.jwt.claims', json_build_object('sub', u_dept, 'role', 'authenticated')::text, true);
  v_json := public.decide_join_request(v_req, true, 'verneombud');
  insert into public._jr values (32, 'an avdelingsleder cannot let anybody in', 'not_allowed',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'not_allowed');

  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  v_json := public.decide_join_request(v_req, true, 'verneombud');
  insert into public._jr values (33, 'nor can another organisation''s daglig leder', 'not_allowed',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'not_allowed');

  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  v_json := public.decide_join_request((select id from app.join_requests where user_id = u_number), true, 'verneombud');
  insert into public._jr values (34, 'a request the person has not confirmed cannot be decided', 'not_allowed|unconfirmed',
    coalesce(v_json->>'error', v_json::text) || '|' || coalesce((select status from app.join_requests where user_id = u_number), 'none'),
    v_json->>'error' = 'not_allowed' and (select status from app.join_requests where user_id = u_number) = 'unconfirmed');

  v_json := public.decide_join_request(v_req, true, 'avdelingsleder', null);
  insert into public._jr values (35, 'an avdelingsleder needs a department, as an invitation does', 'invalid_group',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'invalid_group');

  v_json := public.decide_join_request(v_req, true, 'eier');
  insert into public._jr values (36, 'and a role must be one of the three', 'invalid_role',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'invalid_role');

  insert into public._jr values (37, 'until decided, the person who asked is in no organisation', '0',
    (select count(*) from app.memberships where user_id = u_name)::text,
    not exists (select 1 from app.memberships where user_id = u_name));

  insert into app.join_requests (org_id, user_id, email, full_name, matched_by, company_name, market, status)
  values (v_org, u_free, 'privat.person@gmail.com', 'Privat', 'name', 'Invariant Sammen', 'no', 'pending') returning id into v_txt;
  v_json := public.decide_join_request(v_txt::uuid, true, 'verneombud');
  insert into public._jr values (38, 'somebody in another organisation cannot be let in here', 'other_organisation',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'other_organisation');
  delete from app.join_requests where id = v_txt::uuid;

  -- 39..43 ------------------------------------------------------------ telling the daglig leder
  insert into public._jr values (39, 'each confirmed request is one notice, to the daglig leder', '2|daglig_leder',
    (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang')::text || '|' ||
      coalesce((select string_agg(distinct audience::text, ',') from app.outbox where org_id = v_org and kind = 'tilgang'), 'none'),
    (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang') = 2
      and not exists (select 1 from app.outbox where org_id = v_org and kind = 'tilgang' and audience <> 'daglig_leder'));

  -- the register's record of a daglig leder, with an address, is not a member and must not be told
  insert into app.employees (org_id, full_name, email, duty_role, group_id)
  values (v_org, 'Registrert Leder', 'registeret@invariant-sammen.orgpuls.com', 'daglig_leder', v_group);

  -- the claim as the dispatcher sees it, rolled back: our notices first, the request of u_domain declined
  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  v_json := public.decide_join_request((select id from app.join_requests where user_id = u_domain and org_id = v_org), false);
  perform set_config('request.jwt.claims', '', true);
  update app.organizations set mail_enabled = true where id = v_org;
  update app.outbox set due_at = '2000-01-01' where org_id = v_org and kind = 'tilgang';
  begin
    v_claim := public.dispatch_claim(100);
    raise exception using errcode = 'P0001', message = 'undo the claim';
  exception when sqlstate 'P0001' then null;
  end;
  select j into v_job from jsonb_array_elements(coalesce(v_claim, '[]'::jsonb)) j
  where j->>'kind' = 'tilgang' and j->'request'->>'email' = 'navn@annet-firma.example';
  insert into public._jr values (40, 'the notice says who asks: their name and address', 'Navn Navnesen|navn@annet-firma.example',
    coalesce(v_job->'request'->>'name', 'none') || '|' || coalesce(v_job->'request'->>'email', 'none'),
    v_job->'request'->>'name' = 'Navn Navnesen' and v_job->'request'->>'email' = 'navn@annet-firma.example');
  insert into public._jr values (41, 'it goes to the daglig leder who can sign in, not to the register''s record',
    'leder@invariant-sammen.orgpuls.com',
    coalesce((select string_agg(r->>'email', ',') from jsonb_array_elements(v_job->'recipients') r), 'none'),
    (select string_agg(r->>'email', ',') from jsonb_array_elements(v_job->'recipients') r) = 'leder@invariant-sammen.orgpuls.com');
  insert into public._jr values (42, 'a declined request is never told', '0',
    (select count(*) from jsonb_array_elements(coalesce(v_claim, '[]'::jsonb)) j
     where j->>'kind' = 'tilgang' and j->'request'->>'email' = 'kollega@invariant-sammen.orgpuls.com')::text,
    not exists (select 1 from jsonb_array_elements(coalesce(v_claim, '[]'::jsonb)) j
                where j->>'kind' = 'tilgang' and j->'request'->>'email' = 'kollega@invariant-sammen.orgpuls.com'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_domain, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Et Helt Annet Navn AS', 5, 'Kollega Kollegasen');
  insert into public._jr values (43, 'declined is kept, so asking again files nothing new', 'dismissed|requested|2',
    coalesce((select status from app.join_requests where user_id = u_domain and org_id = v_org), 'none') || '|' ||
      coalesce(v_json->>'outcome', v_json::text) || '|' ||
      (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang')::text,
    (select status from app.join_requests where user_id = u_domain and org_id = v_org) = 'dismissed'
      and v_json->>'outcome' = 'requested'
      and (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang') = 2);

  -- 44 ---------------------------------------- past the day's five, a notice waits its turn
  insert into app.outbox (org_id, kind, audience, join_request_id, due_at)
  select v_org, 'tilgang', 'daglig_leder', v_req, now() from generate_series(1, 5);
  perform set_config('request.jwt.claims', json_build_object('sub', u_number, 'role', 'authenticated')::text, true);
  v_json := public.confirm_join_request();
  insert into public._jr values (44, 'past five notices in a day, the next is kept for tomorrow, not dropped', 'pending|1|tomorrow',
    coalesce((select status from app.join_requests where user_id = u_number), 'none') || '|' ||
      (select count(*) from app.outbox x join app.join_requests jr on jr.id = x.join_request_id where jr.user_id = u_number)::text || '|' ||
      case when (select min(x.due_at) from app.outbox x join app.join_requests jr on jr.id = x.join_request_id where jr.user_id = u_number)
                >= now() + interval '23 hours' then 'tomorrow' else 'today' end,
    (select status from app.join_requests where user_id = u_number) = 'pending'
      and (select count(*) from app.outbox x join app.join_requests jr on jr.id = x.join_request_id where jr.user_id = u_number) = 1
      and (select min(x.due_at) from app.outbox x join app.join_requests jr on jr.id = x.join_request_id where jr.user_id = u_number)
          >= now() + interval '23 hours');

  -- 45..48 ------------------------------------------------------------- let in
  v_json := public.signup_separately();
  insert into public._jr values (45, 'found by the number, the person may not call it another company', 'same_number',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'same_number');

  -- an invitation first: membership withdraws the request, and its notice
  select array_agg(id) into v_ids from app.join_requests where user_id = u_number;
  insert into app.memberships (org_id, user_id, role, active) values (v_org, u_number, 'verneombud', true);
  insert into public._jr values (46, 'let in another way, the request and its notice are withdrawn', '0|0',
    (select count(*) from app.join_requests where user_id = u_number)::text || '|' ||
      (select count(*) from app.outbox where join_request_id = any(coalesce(v_ids, array[]::uuid[])))::text,
    not exists (select 1 from app.join_requests where user_id = u_number)
      and not exists (select 1 from app.outbox where join_request_id = any(coalesce(v_ids, array[]::uuid[]))));

  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  v_json := public.decide_join_request(v_req, true, 'avdelingsleder', v_group);
  insert into public._jr values (47, 'let in, they are a member with the role and department chosen', 'true|avdelingsleder|dept',
    coalesce(v_json->>'ok', v_json::text) || '|' ||
      coalesce((select role::text from app.memberships where user_id = u_name and org_id = v_org and active), 'none') || '|' ||
      case when (select group_id from app.memberships where user_id = u_name and org_id = v_org) = v_group then 'dept' else 'none' end,
    coalesce((v_json->>'ok')::bool, false)
      and exists (select 1 from app.memberships where user_id = u_name and org_id = v_org and active
                  and role = 'avdelingsleder' and group_id = v_group));
  insert into public._jr values (48, 'and the request and its notices are gone: the membership is the record', '0|0',
    (select count(*) from app.join_requests where id = v_req)::text || '|' ||
      (select count(*) from app.outbox where join_request_id = v_req)::text,
    not exists (select 1 from app.join_requests where id = v_req) and not exists (select 1 from app.outbox where join_request_id = v_req));

  -- 49 ----------------------------------------- a request from somebody already here changes nothing
  insert into app.join_requests (org_id, user_id, email, full_name, matched_by, company_name, market, status)
  values (v_org, u_dept, 'avdeling@invariant-sammen.orgpuls.com', 'Avdeling', 'domain', 'Invariant Sammen', 'no', 'pending')
  returning id into v_txt;
  v_json := public.decide_join_request(v_txt::uuid, true, 'daglig_leder');
  insert into public._jr values (49, 'a member''s stale request is withdrawn and their role stays as it was', 'true|avdelingsleder|0',
    coalesce(v_json->>'ok', v_json::text) || '|' ||
      coalesce((select role::text from app.memberships where user_id = u_dept and org_id = v_org), 'none') || '|' ||
      (select count(*) from app.join_requests where id = v_txt::uuid)::text,
    coalesce((v_json->>'ok')::bool, false)
      and (select role from app.memberships where user_id = u_dept and org_id = v_org) = 'avdelingsleder'
      and not exists (select 1 from app.join_requests where id = v_txt::uuid));

  -- 50..54 ------------------------------------------------------ «we are another company»
  -- u_domain was declined: they may make their own, from what they typed, and are let into nothing else
  perform set_config('request.jwt.claims', json_build_object('sub', u_domain, 'role', 'authenticated')::text, true);
  v_json := public.my_join_request();
  insert into public._jr values (50, 'a declined request is shown to the person who asked as declined', 'dismissed|true',
    coalesce(v_json->>'status', 'null') || '|' || coalesce(v_json->>'separable', 'null'),
    v_json->>'status' = 'dismissed' and (v_json->>'separable')::bool);
  select array_agg(x.id) into v_ids from app.join_requests x where x.user_id = u_domain;
  v_json := public.signup_separately();
  select m.org_id into v_mine from app.memberships m where m.user_id = u_domain and m.active;
  v_new := v_new || v_mine;
  insert into public._jr values (51, 'another company: their own organisation, named as they typed it, they its daglig leder',
    'created|Et Helt Annet Navn AS|daglig_leder|own',
    coalesce(v_json->>'outcome', v_json::text) || '|' ||
      coalesce((select name from app.organizations where id = v_mine), 'none') || '|' ||
      coalesce((select role::text from app.memberships where user_id = u_domain and org_id = v_mine), 'none') || '|' ||
      case when v_mine = v_org then 'THE ORGANISATION FOUND' else 'own' end,
    v_json->>'outcome' = 'created' and v_mine is not null and v_mine <> v_org
      and (select name from app.organizations where id = v_mine) = 'Et Helt Annet Navn AS'
      and not exists (select 1 from app.memberships where user_id = u_domain and org_id = v_org));
  insert into public._jr values (52, 'and what they had asked is withdrawn, its notices with it', '0|0',
    (select count(*) from app.join_requests where user_id = u_domain)::text || '|' ||
      (select count(*) from app.outbox where join_request_id = any(coalesce(v_ids, array[]::uuid[])))::text,
    not exists (select 1 from app.join_requests where user_id = u_domain)
      and not exists (select 1 from app.outbox where join_request_id = any(coalesce(v_ids, array[]::uuid[]))));
  v_json := public.signup_separately();
  insert into public._jr values (53, 'a member cannot do it again', 'already_a_member',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'already_a_member');

  -- before confirming: nothing was sent, and their own is made all the same
  perform set_config('request.jwt.claims', json_build_object('sub', u_sep, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Rådgiver Invariant', 5, 'Egen Egensen');
  v_txt := coalesce(v_json->>'outcome', v_json::text) || ':' ||
           coalesce((select status from app.join_requests where user_id = u_sep), 'none');
  v_json := public.signup_separately();
  select array_append(v_new, (select org_id from app.memberships where user_id = u_sep)) into v_new;
  insert into public._jr values (54, 'found and unconfirmed, «another company» makes their own and tells nobody', 'requested:unconfirmed|created|0',
    v_txt || '|' || coalesce(v_json->>'outcome', v_json::text) || '|' ||
      (select count(*) from app.outbox x where x.kind = 'tilgang' and x.org_id = (select m.org_id from app.memberships m where m.user_id = u_cons2))::text,
    v_txt = 'requested:unconfirmed' and v_json->>'outcome' = 'created'
      and not exists (select 1 from app.join_requests where user_id = u_sep)
      and not exists (select 1 from app.outbox x where x.kind = 'tilgang' and x.org_id = (select m.org_id from app.memberships m where m.user_id = u_cons2)));

  -- 55..57 ----------------------------------------------------------------- the rest
  -- the name index: the daglig leder can still rename the organisation (Oppsett, the register fetch)
  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    update app.organizations set name = 'Invariant Sammen Omdøpt AS' where id = v_org;
    reset role;
    insert into public._jr values (55, 'the daglig leder can rename the organisation under the name index', 'renamed',
      coalesce((select name from app.organizations where id = v_org), 'none'),
      (select name from app.organizations where id = v_org) = 'Invariant Sammen Omdøpt AS');
  exception when insufficient_privilege then
    reset role;
    insert into public._jr values (55, 'the daglig leder can rename the organisation under the name index', 'renamed', 'DENIED: ' || sqlerrm, false);
  end;
  perform set_config('request.jwt.claims', '', true);

  insert into public._jr values (56, 'requests are forgotten after thirty days by a daily job', 'scheduled',
    case when exists (select 1 from cron.job where jobname = 'orgpuls-join-requests-purge'
                        and command like '%join_requests%30 days%') then 'scheduled' else 'MISSING' end,
    exists (select 1 from cron.job where jobname = 'orgpuls-join-requests-purge' and command like '%join_requests%30 days%'));

  insert into public._jr values (57, 'an organisation made without a number carries none', '0',
    (select count(*) from app.organizations o where o.id = any(v_new) and o.org_number is not null
       and o.org_number not in ('999999123', '999999131'))::text,
    not exists (select 1 from app.organizations o where o.id = any(v_new) and o.org_number is not null
                  and o.org_number not in ('999999123', '999999131')));

  -- 58 --------------------------------------------------------------------- cleanup
  -- every organisation a throwaway account belongs to, whatever path made it, then the accounts
  delete from app.organizations o
  where o.id = any(v_new || array[v_org, v_demo])
     or o.id in (select m.org_id from app.memberships m where m.user_id = any(v_users));
  delete from auth.users where id = any(v_users);
  select (select count(*) from app.organizations where id = any(v_new || array[v_org, v_demo]))
       + (select count(*) from app.organizations o where o.name in ('Et Helt Annet Navn AS', 'Ubekreftet Firma AS',
            'Privat Firma AS', 'Invariant Demo AS', 'Invariant Sammen AS', 'Invariant Sammen Omdøpt AS', 'Noe Helt Eget',
            'Noe Annet AS', 'Rådgiver Invariant AS', 'Rådgiver Invariant')
            and not exists (select 1 from app.memberships m where m.org_id = o.id))
       + (select count(*) from auth.users where id = any(v_users))
       + (select count(*) from app.profiles where id = any(v_users))
       + (select count(*) from app.join_requests where user_id = any(v_users))
    into v_n;
  insert into public._jr values (58, 'every throwaway account, organisation and request is gone', '0', v_n::text, v_n = 0);
end $$;

select seq, name, expected, actual, pass from public._jr order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._jr where not pass;
  if v_failed is not null then
    raise exception 'join request invariants failed: %', v_failed;
  end if;
end $$;

drop table public._jr;
