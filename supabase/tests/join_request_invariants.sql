-- join_request_invariants.sql — signing up with a company's name (0232, X-114, D-279), proved
-- against the live schema.
--
-- The sign-up no longer needs an organisation number, so the database recognises a company that is
-- already here by its number, its name or a colleague's work address, and then makes no second
-- organisation: it files a request for that organisation's daglig leder. What must hold:
--
--   * **A request lets nobody in.** The person who asks has no membership until the daglig leder
--     decides (30, 31), and only that organisation's daglig leder can read a request or decide it
--     (17..21, 24..25).
--   * **The match is the one promised.** Name without case, punctuation or legal form (5..8), a work
--     address only when confirmed and not at a free provider (12..14), a number that differs means a
--     different undertaking (15), never a demo organisation (16).
--   * **The daglig leder is told once,** members only, and a request that is no longer pending is
--     never told (34..37).
--
-- The suite makes its own throwaway accounts (a uuid and an address, no password, no identity) and
-- organisations, and assertion 40 proves they are all gone again.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/join_request_invariants.sql

create unlogged table if not exists public._jr(seq int, name text, expected text, actual text, pass bool);
truncate public._jr;

do $$
declare
  -- the existing organisation, its daglig leder and an avdelingsleder
  u_lead   uuid := '00000000-0000-4000-8000-0000000a7001';
  u_dept   uuid := '00000000-0000-4000-8000-0000000a7002';
  -- people who sign up
  u_name   uuid := '00000000-0000-4000-8000-0000000a7003';  -- by name
  u_domain uuid := '00000000-0000-4000-8000-0000000a7004';  -- by a confirmed work address
  u_unconf uuid := '00000000-0000-4000-8000-0000000a7005';  -- an unconfirmed work address
  u_free   uuid := '00000000-0000-4000-8000-0000000a7006';  -- a free provider
  u_number uuid := '00000000-0000-4000-8000-0000000a7007';  -- by the organisation number
  u_other  uuid := '00000000-0000-4000-8000-0000000a7008';  -- the same name, another number
  u_demo   uuid := '00000000-0000-4000-8000-0000000a7009';  -- a demo organisation's name
  u_amb    uuid := '00000000-0000-4000-8000-0000000a700a';  -- a name two organisations answer to
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
  v_users_req uuid[];
begin
  v_users := array[u_lead, u_dept, u_name, u_domain, u_unconf, u_free, u_number, u_other, u_demo, u_amb];

  -- 1..4 -------------------------------------------------------------- the surface
  insert into public._jr
  select 1, 'the four functions are executable by a signed-in caller only', '4',
         count(*)::text, count(*) = 4
  from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee = 'authenticated'
    and routine_name in ('signup_organisation', 'decide_join_request', 'my_join_request', 'signup_separately')
    and not exists (select 1 from information_schema.role_routine_grants g
                    where g.routine_schema = 'public' and g.routine_name = role_routine_grants.routine_name
                      and g.grantee in ('anon', 'PUBLIC'));

  insert into public._jr
  select 2, 'each is security definer with an empty search path', '4',
         count(*)::text, count(*) = 4
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('signup_organisation', 'decide_join_request', 'my_join_request', 'signup_separately')
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

  -- the existing organisation: a daglig leder, an avdelingsleder, a department. Their addresses are under
  -- a subdomain of orgpuls.com, which receives no mail, because the dispatcher (rightly) skips the
  -- reserved .example names and assertion 35 needs a recipient; nothing is sent, the claim is undone
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e,
         case when c then now() end, now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (u_lead, 'leder@invariant-sammen.orgpuls.com', true),
               (u_dept, 'avdeling@invariant-sammen.orgpuls.com', true),
               (u_name, 'navn@annet-firma.example', true),
               (u_domain, 'kollega@invariant-sammen.orgpuls.com', true),
               (u_unconf, 'ubekreftet@invariant-sammen.orgpuls.com', false),
               (u_free, 'privat.person@gmail.com', true),
               (u_number, 'nummer@tredje-firma.example', true),
               (u_other, 'annen@fjerde-firma.example', true),
               (u_demo, 'demo.navn@femte-firma.example', true),
               (u_amb, 'tvetydig@sjette-firma.example', true)) x(u, e, c);
  insert into app.profiles (id, full_name) values (u_lead, 'Leder Invariant'), (u_dept, 'Avdeling Invariant');

  insert into app.organizations (name, org_number, employee_count, threshold, market)
  values ('Invariant Sammen AS', '999999996', 20, app.k_min(), 'no') returning id into v_org;
  insert into app.groups (org_id, name) values (v_org, 'Drift') returning id into v_group;
  insert into app.memberships (org_id, user_id, role, active) values (v_org, u_lead, 'daglig_leder', true);
  insert into app.memberships (org_id, user_id, role, active, group_id) values (v_org, u_dept, 'avdelingsleder', true, v_group);

  -- a demo organisation with a name somebody could type
  insert into app.organizations (name, employee_count, threshold, market)
  values ('Invariant Demo AS', 5, app.k_min(), 'no') returning id into v_demo;
  insert into app.demo_orgs (org_id, kind) values (v_demo, 'sandbox');

  -- 9..11 ------------------------------------------------------------ the refusals
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

  -- 12..16 -------------------------------------------------------------- the matching
  v_json := public.signup_organisation('invariant sammen', 5, 'Navn Navnesen');
  insert into public._jr values (12, 'the same name, typed loosely, finds the company and makes none',
    'requested|Invariant Sammen AS|name',
    coalesce(v_json->>'outcome', v_json::text) || '|' || coalesce(v_json->>'company', '') || '|' ||
      coalesce((select matched_by from app.join_requests where user_id = u_name and org_id = v_org), 'none'),
    v_json->>'outcome' = 'requested' and v_json->>'company' = 'Invariant Sammen AS'
      and exists (select 1 from app.join_requests where user_id = u_name and org_id = v_org and matched_by = 'name'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_domain, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Et Helt Annet Navn AS', 5, 'Kollega Kollegasen');
  insert into public._jr values (13, 'a confirmed address at the company''s domain finds it under another name',
    'requested|domain', coalesce(v_json->>'outcome', v_json::text) || '|' ||
      coalesce((select matched_by from app.join_requests where user_id = u_domain and org_id = v_org), 'none'),
    v_json->>'outcome' = 'requested' and exists (select 1 from app.join_requests where user_id = u_domain and org_id = v_org and matched_by = 'domain'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_unconf, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Ubekreftet Firma AS', 5, 'Ubekreftet');
  v_txt := coalesce(v_json->>'outcome', v_json::text);
  select array_append(v_new, (select org_id from app.memberships where user_id = u_unconf)) into v_new;
  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Privat Firma AS', 5, 'Privat');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_free)) into v_new;
  insert into public._jr values (14, 'an unconfirmed address or a free provider proves nothing: a new organisation',
    'created|created', v_txt || '|' || coalesce(v_json->>'outcome', v_json::text),
    v_txt = 'created' and v_json->>'outcome' = 'created'
      and exists (select 1 from app.memberships m where m.user_id = u_free and m.role = 'daglig_leder')
      and not exists (select 1 from app.join_requests where user_id in (u_unconf, u_free)));

  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Invariant Sammen AS', 5, 'Annen', 'no', '999999995');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_other)) into v_new;
  insert into public._jr values (15, 'the same name with another number is another undertaking', 'created|999999995',
    coalesce(v_json->>'outcome', v_json::text) || '|' ||
      coalesce((select o.org_number from app.memberships m join app.organizations o on o.id = m.org_id where m.user_id = u_other), 'none'),
    v_json->>'outcome' = 'created'
      and exists (select 1 from app.memberships m join app.organizations o on o.id = m.org_id
                  where m.user_id = u_other and o.org_number = '999999995'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_demo, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Invariant Demo AS', 5, 'Demo Navn');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_demo)) into v_new;
  insert into public._jr values (16, 'a demo organisation is never found', 'created',
    coalesce(v_json->>'outcome', v_json::text),
    v_json->>'outcome' = 'created' and not exists (select 1 from app.join_requests where org_id = v_demo));

  perform set_config('request.jwt.claims', json_build_object('sub', u_amb, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Invariant Sammen AS', 5, 'Tvetydig');
  select array_append(v_new, (select org_id from app.memberships where user_id = u_amb)) into v_new;
  insert into public._jr values (41, 'a name two organisations answer to finds neither: nobody''s request goes to the wrong one',
    'created|0', coalesce(v_json->>'outcome', v_json::text) || '|' ||
      (select count(*) from app.join_requests where user_id = u_amb)::text,
    v_json->>'outcome' = 'created' and not exists (select 1 from app.join_requests where user_id = u_amb));

  perform set_config('request.jwt.claims', json_build_object('sub', u_number, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Noe Helt Eget', 5, 'Nummer Nummersen', 'no', '999999996');
  insert into public._jr values (17, 'the number finds the undertaking whatever it is called', 'requested|org_number',
    coalesce(v_json->>'outcome', v_json::text) || '|' ||
      coalesce((select matched_by from app.join_requests where user_id = u_number and org_id = v_org), 'none'),
    v_json->>'outcome' = 'requested' and exists (select 1 from app.join_requests where user_id = u_number and org_id = v_org and matched_by = 'org_number'));

  -- 18..22 ------------------------------------------------------------- who can read a request
  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.join_requests where org_id = v_org;
  reset role;
  insert into public._jr values (18, 'the daglig leder reads their organisation''s requests', '3', v_n::text, v_n = 3);

  perform set_config('request.jwt.claims', json_build_object('sub', u_dept, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.join_requests;
  reset role;
  insert into public._jr values (19, 'an avdelingsleder reads none', '0', v_n::text, v_n = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', u_name, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.join_requests;
  reset role;
  insert into public._jr values (20, 'the person who asked reads none, not even their own', '0', v_n::text, v_n = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.join_requests;
  reset role;
  insert into public._jr values (21, 'another organisation''s daglig leder reads none', '0', v_n::text, v_n = 0);

  -- the daglig leder judges a request by its name and address; the account behind it is not theirs to read
  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    select count(user_id) into v_n from app.join_requests;
    reset role;
    insert into public._jr values (22, 'the account behind a request is not readable', 'denied', 'READ', false);
  exception when insufficient_privilege then
    reset role;
    insert into public._jr values (22, 'the account behind a request is not readable', 'denied', 'denied', true);
  end;

  -- 23 -------------------------------------------------------------- the person waiting
  perform set_config('request.jwt.claims', json_build_object('sub', u_name, 'role', 'authenticated')::text, true);
  v_json := public.my_join_request();
  insert into public._jr values (23, 'the person waiting sees the company they asked to join', 'Invariant Sammen AS|pending|invariant sammen|true',
    coalesce(v_json->>'company', 'null') || '|' || coalesce(v_json->>'status', 'null') || '|' ||
      coalesce(v_json->>'typed', 'null') || '|' || coalesce(v_json->>'separable', 'null'),
    v_json->>'company' = 'Invariant Sammen AS' and v_json->>'status' = 'pending'
      and v_json->>'typed' = 'invariant sammen' and (v_json->>'separable')::bool);

  -- 24..31 ---------------------------------------------------------------- deciding
  select id into v_req from app.join_requests where user_id = u_name and org_id = v_org;

  perform set_config('request.jwt.claims', json_build_object('sub', u_dept, 'role', 'authenticated')::text, true);
  v_json := public.decide_join_request(v_req, true, 'verneombud');
  insert into public._jr values (24, 'an avdelingsleder cannot let anybody in', 'not_allowed',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'not_allowed');

  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  v_json := public.decide_join_request(v_req, true, 'verneombud');
  insert into public._jr values (25, 'nor can another organisation''s daglig leder', 'not_allowed',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'not_allowed');

  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  v_json := public.decide_join_request(v_req, true, 'avdelingsleder', null);
  insert into public._jr values (26, 'an avdelingsleder needs a department, as an invitation does', 'invalid_group',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'invalid_group');

  v_json := public.decide_join_request(v_req, true, 'eier');
  insert into public._jr values (27, 'and a role must be one of the three', 'invalid_role',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'invalid_role');

  insert into public._jr values (28, 'until decided, the person who asked is in no organisation', '0',
    (select count(*) from app.memberships where user_id = u_name)::text,
    not exists (select 1 from app.memberships where user_id = u_name));

  -- the decision as it lands: let in, after the dispatcher check below has seen the request
  -- 29 ---------------------------------------------------------- one person, one organisation
  insert into app.join_requests (org_id, user_id, email, full_name, matched_by, company_name, market)
  values (v_org, u_free, 'privat.person@gmail.com', 'Privat', 'name', 'Invariant Sammen', 'no') returning id into v_txt;
  v_json := public.decide_join_request(v_txt::uuid, true, 'verneombud');
  insert into public._jr values (29, 'somebody in another organisation cannot be let in here', 'other_organisation',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'other_organisation');
  delete from app.join_requests where id = v_txt::uuid;

  -- 32..36 ------------------------------------------------------------ telling the daglig leder
  insert into public._jr values (32, 'each new request is one notice, to the daglig leder', '3|daglig_leder',
    (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang')::text || '|' ||
      coalesce((select string_agg(distinct audience::text, ',') from app.outbox where org_id = v_org and kind = 'tilgang'), 'none'),
    (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang') = 3
      and not exists (select 1 from app.outbox where org_id = v_org and kind = 'tilgang' and audience <> 'daglig_leder'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_name, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Hva Som Helst', 5, 'Navn Navnesen', 'no', '999999996');
  insert into public._jr values (33, 'asking again is the same request and no second notice', 'requested|1|3',
    coalesce(v_json->>'outcome', v_json::text) || '|' ||
      (select count(*) from app.join_requests where user_id = u_name)::text || '|' ||
      (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang')::text,
    v_json->>'outcome' = 'requested' and (select count(*) from app.join_requests where user_id = u_name) = 1
      and (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang') = 3);

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
  insert into public._jr values (34, 'the notice says who asks: their name and address', 'Navn Navnesen|navn@annet-firma.example',
    coalesce(v_job->'request'->>'name', 'none') || '|' || coalesce(v_job->'request'->>'email', 'none'),
    v_job->'request'->>'name' = 'Navn Navnesen' and v_job->'request'->>'email' = 'navn@annet-firma.example');
  insert into public._jr values (35, 'it goes to the daglig leder who can sign in, not to the register''s record',
    'leder@invariant-sammen.orgpuls.com',
    coalesce((select string_agg(r->>'email', ',') from jsonb_array_elements(v_job->'recipients') r), 'none'),
    (select string_agg(r->>'email', ',') from jsonb_array_elements(v_job->'recipients') r) = 'leder@invariant-sammen.orgpuls.com');
  insert into public._jr values (36, 'a declined request is never told', '0',
    (select count(*) from jsonb_array_elements(coalesce(v_claim, '[]'::jsonb)) j
     where j->>'kind' = 'tilgang' and j->'request'->>'email' = 'kollega@invariant-sammen.orgpuls.com')::text,
    not exists (select 1 from jsonb_array_elements(coalesce(v_claim, '[]'::jsonb)) j
                where j->>'kind' = 'tilgang' and j->'request'->>'email' = 'kollega@invariant-sammen.orgpuls.com'));

  perform set_config('request.jwt.claims', json_build_object('sub', u_domain, 'role', 'authenticated')::text, true);
  v_json := public.signup_organisation('Et Helt Annet Navn AS', 5, 'Kollega Kollegasen');
  insert into public._jr values (37, 'declined is kept, so asking again files nothing new', 'dismissed|requested|3',
    coalesce((select status from app.join_requests where user_id = u_domain and org_id = v_org), 'none') || '|' ||
      coalesce(v_json->>'outcome', v_json::text) || '|' ||
      (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang')::text,
    (select status from app.join_requests where user_id = u_domain and org_id = v_org) = 'dismissed'
      and v_json->>'outcome' = 'requested'
      and (select count(*) from app.outbox where org_id = v_org and kind = 'tilgang') = 3);

  -- 30..31 ------------------------------------------------------------- let in
  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  v_json := public.decide_join_request(v_req, true, 'avdelingsleder', v_group);
  insert into public._jr values (30, 'let in, they are a member with the role and department chosen', 'true|avdelingsleder|dept',
    coalesce(v_json->>'ok', v_json::text) || '|' ||
      coalesce((select role::text from app.memberships where user_id = u_name and org_id = v_org and active), 'none') || '|' ||
      case when (select group_id from app.memberships where user_id = u_name and org_id = v_org) = v_group then 'dept' else 'none' end,
    coalesce((v_json->>'ok')::bool, false)
      and exists (select 1 from app.memberships where user_id = u_name and org_id = v_org and active
                  and role = 'avdelingsleder' and group_id = v_group));
  insert into public._jr values (31, 'and the request and its notice are gone: the membership is the record', '0|0',
    (select count(*) from app.join_requests where id = v_req)::text || '|' ||
      (select count(*) from app.outbox where join_request_id = v_req)::text,
    not exists (select 1 from app.join_requests where id = v_req) and not exists (select 1 from app.outbox where join_request_id = v_req));

  -- 38 --------------------------------------------------------------- a number signed up as new
  insert into public._jr values (38, 'an organisation made without a number carries none', '0',
    (select count(*) from app.organizations o where o.id = any(v_new) and o.org_number is not null
       and o.org_number <> '999999995')::text,
    not exists (select 1 from app.organizations o where o.id = any(v_new) and o.org_number is not null and o.org_number <> '999999995'));

  -- 39 ------------------------------------------------------------- the five-a-day cap
  perform set_config('request.jwt.claims', '', true);
  insert into public._jr
  select 39, 'no more than five notices a day for one organisation', 'cap 5',
         case when pg_get_functiondef('public.signup_organisation(text,integer,text,text,text)'::regprocedure) ~ '< 5' then 'cap 5' else 'NO CAP' end,
         pg_get_functiondef('public.signup_organisation(text,integer,text,text,text)'::regprocedure) ~ '< 5';

  -- 42..46 ------------------------------------------------------ «we are another company»
  -- u_number was found by the number: that is the same undertaking, and no way round it
  perform set_config('request.jwt.claims', json_build_object('sub', u_number, 'role', 'authenticated')::text, true);
  v_json := public.my_join_request();
  insert into public._jr values (42, 'found by the number, the person may not say it is another company', 'false|same_number',
    coalesce(v_json->>'separable', 'null') || '|' || coalesce(public.signup_separately()->>'error', 'none'),
    not (v_json->>'separable')::bool and public.signup_separately()->>'error' = 'same_number');

  -- u_domain was declined: they may make their own, from what they typed, and are let into nothing else
  perform set_config('request.jwt.claims', json_build_object('sub', u_domain, 'role', 'authenticated')::text, true);
  v_json := public.my_join_request();
  insert into public._jr values (43, 'a declined request is shown to the person who asked as declined', 'dismissed|true',
    coalesce(v_json->>'status', 'null') || '|' || coalesce(v_json->>'separable', 'null'),
    v_json->>'status' = 'dismissed' and (v_json->>'separable')::bool);
  select array_agg(x.id) into v_users_req from app.join_requests x where x.user_id = u_domain;
  v_json := public.signup_separately();
  select m.org_id into v_mine from app.memberships m where m.user_id = u_domain and m.active;
  v_new := v_new || v_mine;
  insert into public._jr values (44, 'another company: their own organisation, named as they typed it, they its daglig leder',
    'created|Et Helt Annet Navn AS|daglig_leder|own',
    coalesce(v_json->>'outcome', v_json::text) || '|' ||
      coalesce((select name from app.organizations where id = v_mine), 'none') || '|' ||
      coalesce((select role::text from app.memberships where user_id = u_domain and org_id = v_mine), 'none') || '|' ||
      case when v_mine = v_org then 'THE ORGANISATION FOUND' else 'own' end,
    v_json->>'outcome' = 'created' and v_mine is not null and v_mine <> v_org
      and (select name from app.organizations where id = v_mine) = 'Et Helt Annet Navn AS'
      and not exists (select 1 from app.memberships where user_id = u_domain and org_id = v_org));
  insert into public._jr values (45, 'and what they had asked is withdrawn, its notices with it', '0|0',
    (select count(*) from app.join_requests where user_id = u_domain)::text || '|' ||
      (select count(*) from app.outbox where join_request_id = any(coalesce(v_users_req, array[]::uuid[])))::text,
    not exists (select 1 from app.join_requests where user_id = u_domain)
      and not exists (select 1 from app.outbox where join_request_id = any(coalesce(v_users_req, array[]::uuid[]))));
  v_json := public.signup_separately();
  insert into public._jr values (46, 'a member cannot do it again', 'already_a_member',
    coalesce(v_json->>'error', v_json::text), v_json->>'error' = 'already_a_member');

  -- 40 --------------------------------------------------------------------- cleanup
  -- every organisation a throwaway account belongs to, whatever path made it, then the accounts
  delete from app.organizations o
  where o.id = any(v_new || array[v_org, v_demo])
     or o.id in (select m.org_id from app.memberships m where m.user_id = any(v_users));
  delete from auth.users where id = any(v_users);
  select (select count(*) from app.organizations where id = any(v_new || array[v_org, v_demo]))
       + (select count(*) from app.organizations o where o.name in ('Et Helt Annet Navn AS', 'Ubekreftet Firma AS',
            'Privat Firma AS', 'Invariant Demo AS', 'Invariant Sammen AS', 'Noe Helt Eget', 'Hva Som Helst')
            and not exists (select 1 from app.memberships m where m.org_id = o.id))
       + (select count(*) from auth.users where id = any(v_users))
       + (select count(*) from app.profiles where id = any(v_users))
       + (select count(*) from app.join_requests where user_id = any(v_users))
    into v_n;
  insert into public._jr values (40, 'every throwaway account, organisation and request is gone', '0', v_n::text, v_n = 0);
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
