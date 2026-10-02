-- entra_token_hook_invariants.sql — the Microsoft sign-in rules at token issuance (migration 0156).
--
-- Supabase Auth calls public.entra_access_token_hook(event) before it signs any access token, with
-- {user_id, claims, authentication_method}. The suite calls it the same way, with events built as
-- Supabase Auth builds them, against identities written as Supabase Auth writes them (see
-- entra_signin_invariants.sql). Asserted:
--
--   * untouched: a password, OTP, Google and refresh issuance of an account with no Microsoft
--     identity comes back as exactly its own claims (1-3); a password issuance of an account with a
--     refused Microsoft identity is not looked at (4); a Google sign-in of an account whose
--     Microsoft identity was last used long ago is not judged as Microsoft (5)
--   * the rules at sign-in ('oauth'): the bound tenant with the bound object id passes (6); another
--     tenant (7), a personal account (8), a first binding without xms_edov (9), another object id
--     (10), a platform admin (11), two Microsoft identities (12) are refused; an account Microsoft
--     made passes without xms_edov (13); with no membership yet, the signup/invitation path passes
--     for an account Microsoft made (14) and a stranger linked to an existing account does not (15)
--   * a returning sign-in is recognised: Supabase Auth moves updated_at, not last_sign_in_at, on
--     every sign-in through an existing identity, and both the hook and the callback's check now
--     judge it (16-17)
--   * refresh ('token_refresh'): a session the callback recorded is judged again — it goes on while
--     the rules hold (18), and after the organisation unbinds its tenant (19); it stops when the
--     organisation binds another tenant (20) or the binding no longer matches (21); a session the
--     callback never recorded is not judged by the time window, so a password session of an
--     account a stranger just tried to use is not cut (22)
--   * one refusal: every refusal is the same 403 and the same message (23)
--   * faults: a fault inside the rules refuses a Microsoft account and leaves every other account
--     alone (24-25); an event that cannot be read at all is refused on 'oauth' and let through on
--     a refresh (26)
--   * grants: only supabase_auth_admin executes the hook; no client role, nor service_role (27);
--     the helpers are not executable by a client (28); supabase_auth_admin is given no read of the
--     tables the hook consults — the function is SECURITY DEFINER with a fixed search_path and
--     is STABLE (29)
--   * nothing is left behind: the suite runs in a transaction that is rolled back (30)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/entra_token_hook_invariants.sql

begin;

create temp table _th(seq int, name text, expected text, actual text, pass bool) on commit drop;

do $$
declare
  v_org_a  uuid := '00000000-0000-4000-8000-0000000eb0a1';  -- bound to T1
  v_org_b  uuid := '00000000-0000-4000-8000-0000000eb0b1';  -- not bound
  v_pw     uuid := '00000000-0000-4000-8000-0000000eb001';  -- member of A, password only
  v_ok     uuid := '00000000-0000-4000-8000-0000000eb002';  -- member of A, Microsoft (T1, O1), bound
  v_frgn   uuid := '00000000-0000-4000-8000-0000000eb003';  -- member of A, password + Microsoft in T2
  v_pers   uuid := '00000000-0000-4000-8000-0000000eb004';  -- member of B, a personal Microsoft account
  v_noedov uuid := '00000000-0000-4000-8000-0000000eb005';  -- member of B, password + Microsoft, no xms_edov
  v_msmade uuid := '00000000-0000-4000-8000-0000000eb006';  -- member of B, made by Microsoft, no xms_edov
  v_adm    uuid := '00000000-0000-4000-8000-0000000eb007';  -- platform admin with a Microsoft identity
  v_new    uuid := '00000000-0000-4000-8000-0000000eb008';  -- no membership yet, made by Microsoft
  v_link   uuid := '00000000-0000-4000-8000-0000000eb009';  -- no membership, password + linked Microsoft, no xms_edov
  v_old    uuid := '00000000-0000-4000-8000-0000000eb00a';  -- member of A, password + Microsoft in T2 used a day ago
  v_two    uuid := '00000000-0000-4000-8000-0000000eb00b';  -- member of B, two Microsoft identities
  v_t1     text := '11111111-1111-4111-8111-1111111111b1';
  v_t2     text := '22222222-2222-4222-8222-2222222222b2';
  v_t3     text := '33333333-3333-4333-8333-3333333333b3';
  v_o1     text := 'bbbbbbbb-0000-4000-8000-000000000001';
  v_ev     jsonb;
  v_out    jsonb;
  v_json   jsonb;
  v_refusals jsonb := '[]';
  v_n      int;
  u        record;
begin
  insert into app.organizations (id, name, org_number) values
    (v_org_a, 'Entra hook test A AS', '999999813'), (v_org_b, 'Entra hook test B AS', '999999814');
  insert into auth.users (id, email)
  select x.id, 'hook' || right(x.id::text, 3) || '@entra-hook-test.example'
  from unnest(array[v_pw, v_ok, v_frgn, v_pers, v_noedov, v_msmade, v_adm, v_new, v_link, v_old, v_two]) x(id);
  insert into app.profiles (id) select x from unnest(array[v_pw, v_ok, v_frgn, v_pers, v_noedov, v_msmade, v_adm, v_new, v_link, v_old, v_two]) x
  on conflict do nothing;
  insert into app.memberships (org_id, user_id, role) values
    (v_org_a, v_pw, 'daglig_leder'), (v_org_a, v_ok, 'verneombud'), (v_org_a, v_frgn, 'verneombud'),
    (v_org_b, v_pers, 'daglig_leder'), (v_org_b, v_noedov, 'verneombud'), (v_org_b, v_msmade, 'verneombud'),
    (v_org_a, v_old, 'avdelingsleder'), (v_org_b, v_two, 'avdelingsleder');
  insert into app.platform_admins (user_id, role) values (v_adm, 'support');
  insert into app.entra_tenants (org_id, tenant_id) values (v_org_a, v_t1);
  insert into app.member_identities (membership_id, org_id, user_id, tenant_id, object_id)
  select m.id, m.org_id, v_ok, v_t1, v_o1 from app.memberships m where m.user_id = v_ok;

  -- the Microsoft identities, as Supabase Auth writes them; a sign-in just now unless said otherwise
  for u in select * from (values
      (v_ok,     v_t1, v_o1, 'true'::jsonb, now() - interval '30 days', now()),
      (v_frgn,   v_t2, 'bbbbbbbb-0000-4000-8000-000000000003', 'true'::jsonb, now(), now()),
      (v_pers,   '9188040d-6c67-4c5b-b112-36a304b66dad', 'bbbbbbbb-0000-4000-8000-000000000004', 'true'::jsonb, now(), now()),
      (v_noedov, v_t1, 'bbbbbbbb-0000-4000-8000-000000000005', null::jsonb, now(), now()),
      (v_msmade, v_t3, 'bbbbbbbb-0000-4000-8000-000000000006', null::jsonb, now(), now()),
      (v_adm,    v_t1, 'bbbbbbbb-0000-4000-8000-000000000007', 'true'::jsonb, now(), now()),
      (v_new,    v_t3, 'bbbbbbbb-0000-4000-8000-000000000008', null::jsonb, now(), now()),
      (v_link,   v_t2, 'bbbbbbbb-0000-4000-8000-000000000009', null::jsonb, now(), now()),
      -- last used a day ago: last_sign_in_at and updated_at both old
      (v_old,    v_t2, 'bbbbbbbb-0000-4000-8000-00000000000a', 'true'::jsonb, now() - interval '1 day', now() - interval '1 day'),
      (v_two,    v_t3, 'bbbbbbbb-0000-4000-8000-00000000000b', 'true'::jsonb, now(), now())) v(uid, tid, oid, edov, signed, updated)
  loop
    insert into auth.identities (provider_id, user_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values ('sub-' || u.oid, u.uid, 'azure',
      jsonb_build_object('iss', 'https://login.microsoftonline.com/' || u.tid || '/v2.0', 'sub', 'sub-' || u.oid,
        'email', 'hook' || right(u.uid::text, 3) || '@entra-hook-test.example',
        'custom_claims', jsonb_strip_nulls(jsonb_build_object('tid', u.tid, 'oid', u.oid, 'xms_edov', u.edov))),
      u.signed, u.signed, u.updated);
  end loop;
  insert into auth.identities (provider_id, user_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values ('sub-second-b', v_two, 'azure', jsonb_build_object('iss', 'https://login.microsoftonline.com/' || v_t3 || '/v2.0',
    'custom_claims', jsonb_build_object('tid', v_t3, 'oid', 'bbbbbbbb-0000-4000-8000-0000000000bb')), now(), now(), now());
  -- every account but the two Microsoft made also has an e-mail identity
  insert into auth.identities (provider_id, user_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select x::text, x, 'email', jsonb_build_object('sub', x::text), now() - interval '40 days', now() - interval '40 days', now() - interval '40 days'
  from unnest(array[v_pw, v_ok, v_frgn, v_pers, v_noedov, v_adm, v_link, v_old, v_two]) x;
  -- one session per account, made just now (the session the token is being issued for)
  insert into auth.sessions (id, user_id, created_at, updated_at)
  select ('00000000-0000-4000-9000-' || right(x::text, 12))::uuid, x, now(), now()
  from unnest(array[v_pw, v_ok, v_frgn, v_pers, v_noedov, v_msmade, v_adm, v_new, v_link, v_old, v_two]) x;

  -- an event as Supabase Auth sends it
  create temp table _ev(uid uuid, method text, ev jsonb) on commit drop;
  insert into _ev
  select x, m, jsonb_build_object(
      'metadata', jsonb_build_object('uuid', gen_random_uuid(), 'name', 'customize-access-token'),
      'user_id', x,
      'authentication_method', m,
      'claims', jsonb_build_object(
        'iss', 'http://127.0.0.1:54321/auth/v1', 'aud', 'authenticated', 'sub', x,
        'exp', 1915690221, 'iat', 1915686621, 'email', '', 'phone', '',
        'app_metadata', jsonb_build_object('provider', 'email'), 'user_metadata', '{}'::jsonb,
        'role', 'authenticated', 'aal', 'aal1',
        'amr', jsonb_build_array(jsonb_build_object('method', case when m = 'token_refresh' then 'oauth' else m end, 'timestamp', 1915686621)),
        'session_id', '00000000-0000-4000-9000-' || right(x::text, 12), 'is_anonymous', false))
  from unnest(array[v_pw, v_ok, v_frgn, v_pers, v_noedov, v_msmade, v_adm, v_new, v_link, v_old, v_two]) x,
       unnest(array['password', 'otp', 'oauth', 'token_refresh', 'magiclink']) m;

  -- 1..3 -------------------------------------------------------------- no Microsoft identity: untouched
  for u in select * from _ev where uid = v_pw order by method loop
    v_out := public.entra_access_token_hook(u.ev);
    insert into _th values (case u.method when 'oauth' then 2 when 'token_refresh' then 3 else 1 end,
      'an account with no Microsoft identity gets its own claims back (' || u.method || ')', 'claims',
      case when v_out = jsonb_build_object('claims', u.ev -> 'claims') then 'claims' else left(v_out::text, 60) end,
      v_out = jsonb_build_object('claims', u.ev -> 'claims'));
  end loop;

  -- 4 ----------------------------------------------------------------- not a sign-in through a provider
  for u in select * from _ev where uid in (v_frgn, v_link, v_adm) and method in ('password', 'otp', 'magiclink') loop
    v_out := public.entra_access_token_hook(u.ev);
    insert into _th values (4, 'an issuance by ' || u.method || ' is not looked at, even for an account with a refused Microsoft identity',
      'claims', case when v_out ? 'claims' then 'claims' else left(v_out::text, 60) end,
      v_out = jsonb_build_object('claims', u.ev -> 'claims'));
  end loop;

  -- 5 ----------------------------------------------------------------- a Google sign-in is not a Microsoft one
  select ev into v_ev from _ev where uid = v_old and method = 'oauth';
  v_out := public.entra_access_token_hook(v_ev);
  insert into _th values (5, 'a provider sign-in of an account whose Microsoft identity was last used a day ago is not judged as Microsoft',
    'claims', case when v_out ? 'claims' then 'claims' else v_out #>> '{error,message}' end, v_out ? 'claims');

  -- 6..15 ------------------------------------------------------------- the rules at sign-in
  for u in select * from (values
      (6,  v_ok,     true,  'the bound tenant with the bound object id is let through'),
      (7,  v_frgn,   false, 'a tenant other than the organisation''s bound one is refused'),
      (8,  v_pers,   false, 'a personal Microsoft account is refused'),
      (9,  v_noedov, false, 'a first binding of an identity linked to an existing account without xms_edov is refused'),
      (11, v_adm,    false, 'a platform admin is refused on the Microsoft path'),
      (12, v_two,    false, 'an account with two Microsoft identities is refused'),
      (13, v_msmade, true,  'an account Microsoft made is let through without xms_edov'),
      (14, v_new,    true,  'no membership yet: an account Microsoft made goes on to signup or its invitation'),
      (15, v_link,   false, 'no membership: a stranger linked to an existing account without xms_edov is refused')) v(seq, uid, allowed, name)
  loop
    select ev into v_ev from _ev e where e.uid = u.uid and e.method = 'oauth';
    v_out := public.entra_access_token_hook(v_ev);
    if not u.allowed then v_refusals := v_refusals || jsonb_build_array(v_out); end if;
    insert into _th values (u.seq, u.name, case when u.allowed then 'claims' else 'refused' end,
      case when v_out = jsonb_build_object('claims', v_ev -> 'claims') then 'claims'
           when v_out #>> '{error,http_code}' = '403' then 'refused' else left(v_out::text, 60) end,
      case when u.allowed then v_out = jsonb_build_object('claims', v_ev -> 'claims')
           else v_out #>> '{error,http_code}' = '403' and not v_out ? 'claims' end);
  end loop;

  -- 10 ---------------------------------------------------------------- another object id
  update auth.identities set identity_data = jsonb_set(identity_data, '{custom_claims,oid}', '"bbbbbbbb-0000-4000-8000-0000000000ff"')
  where user_id = v_ok and provider = 'azure';
  select ev into v_ev from _ev where uid = v_ok and method = 'oauth';
  v_out := public.entra_access_token_hook(v_ev);
  v_refusals := v_refusals || jsonb_build_array(v_out);
  insert into _th values (10, 'a different object id for a bound membership is refused', 'refused',
    coalesce(v_out #>> '{error,http_code}', 'claims'), v_out #>> '{error,http_code}' = '403');
  update auth.identities set identity_data = jsonb_set(identity_data, '{custom_claims,oid}', to_jsonb(v_o1))
  where user_id = v_ok and provider = 'azure';

  -- 16..17 ------------------------------------------------------------ a returning sign-in is recognised
  -- the foreign identity signs in again: Supabase Auth leaves last_sign_in_at as it was and moves updated_at
  update auth.identities set last_sign_in_at = now() - interval '1 day', updated_at = now()
  where user_id = v_old and provider = 'azure';
  select ev into v_ev from _ev where uid = v_old and method = 'oauth';
  v_out := public.entra_access_token_hook(v_ev);
  v_refusals := v_refusals || jsonb_build_array(v_out);
  insert into _th values (16, 'a returning Microsoft sign-in (old last_sign_in_at, fresh updated_at) is judged, and refused here', 'refused',
    coalesce(v_out #>> '{error,http_code}', 'claims'), v_out #>> '{error,http_code}' = '403');
  perform set_config('request.jwt.claims', json_build_object('sub', v_old, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_old::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  insert into _th values (17, 'and the callback''s check judges it too (it saw "not Microsoft" before 0156)', 'tenant_mismatch',
    coalesce(v_json->>'error', 'ok/' || (v_json->>'microsoft')), v_json->>'error' = 'tenant_mismatch');

  -- 18..21 ------------------------------------------------------------ refresh of a session the callback recorded
  perform set_config('request.jwt.claims', json_build_object('sub', v_ok, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_ok::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  if v_json->>'ok' <> 'true' or not exists (select 1 from app.entra_sessions where user_id = v_ok) then
    raise exception 'entra hook invariants: the bound member''s sign-in was not accepted and recorded: %', v_json;
  end if;
  -- an hour later: the identity has not been used since
  update auth.identities set last_sign_in_at = now() - interval '2 hours', updated_at = now() - interval '2 hours'
  where user_id = v_ok and provider = 'azure';
  select ev into v_ev from _ev where uid = v_ok and method = 'token_refresh';
  v_out := public.entra_access_token_hook(v_ev);
  insert into _th values (18, 'a recorded Microsoft session is renewed while the rules hold', 'claims',
    case when v_out = jsonb_build_object('claims', v_ev -> 'claims') then 'claims' else left(v_out::text, 60) end,
    v_out = jsonb_build_object('claims', v_ev -> 'claims'));

  delete from app.entra_tenants where org_id = v_org_a;
  v_out := public.entra_access_token_hook(v_ev);
  insert into _th values (19, 'the organisation unbinds its tenant: the member is still its bound person, the session goes on', 'claims',
    case when v_out ? 'claims' then 'claims' else v_out #>> '{error,message}' end, v_out ? 'claims');

  insert into app.entra_tenants (org_id, tenant_id) values (v_org_a, v_t2);
  v_out := public.entra_access_token_hook(v_ev);
  v_refusals := v_refusals || jsonb_build_array(v_out);
  insert into _th values (20, 'the organisation binds another tenant: the session is not renewed', 'refused',
    coalesce(v_out #>> '{error,http_code}', 'claims'), v_out #>> '{error,http_code}' = '403');
  update app.entra_tenants set tenant_id = v_t1 where org_id = v_org_a;

  update app.member_identities set object_id = 'bbbbbbbb-0000-4000-8000-0000000000ee' where user_id = v_ok;
  v_out := public.entra_access_token_hook(v_ev);
  v_refusals := v_refusals || jsonb_build_array(v_out);
  insert into _th values (21, 'the membership''s binding no longer matches the identity: the session is not renewed', 'refused',
    coalesce(v_out #>> '{error,http_code}', 'claims'), v_out #>> '{error,http_code}' = '403');
  update app.member_identities set object_id = v_o1 where user_id = v_ok;

  -- 22 ---------------------------------------------------------------- refresh is never judged by the time window
  select ev into v_ev from _ev where uid = v_frgn and method = 'token_refresh';
  v_out := public.entra_access_token_hook(v_ev);
  insert into _th values (22, 'a password session of an account whose Microsoft identity was just refused keeps refreshing', 'claims',
    case when v_out ? 'claims' then 'claims' else v_out #>> '{error,message}' end,
    v_out = jsonb_build_object('claims', v_ev -> 'claims'));

  -- 23 ---------------------------------------------------------------- one refusal, whatever the rule
  select count(distinct r) into v_n from jsonb_array_elements(v_refusals) r;
  insert into _th values (23, 'every refusal is the same 403 with the same message (' || jsonb_array_length(v_refusals) || ' refusals)', '1',
    v_n::text, v_n = 1 and jsonb_array_length(v_refusals) >= 10
      and (v_refusals -> 0) = '{"error": {"http_code": 403, "message": "Sign-in refused"}}'::jsonb);

  -- 24..25 ------------------------------------------------------------ a fault inside the rules
  alter function app.entra_rules(uuid, uuid, boolean) rename to entra_rules_gone_for_test;
  select ev into v_ev from _ev where uid = v_ok and method = 'oauth';
  update auth.identities set updated_at = now() where user_id = v_ok and provider = 'azure';
  v_out := public.entra_access_token_hook(v_ev);
  insert into _th values (24, 'a fault while judging a Microsoft account refuses it (closed)', 'refused',
    coalesce(v_out #>> '{error,http_code}', 'claims'), v_out #>> '{error,http_code}' = '403');
  for u in select * from _ev where uid = v_pw and method in ('oauth', 'token_refresh', 'password') loop
    v_out := public.entra_access_token_hook(u.ev);
    insert into _th values (25, 'and leaves an account without one alone (' || u.method || ')', 'claims',
      case when v_out ? 'claims' then 'claims' else v_out #>> '{error,message}' end,
      v_out = jsonb_build_object('claims', u.ev -> 'claims'));
  end loop;
  alter function app.entra_rules_gone_for_test(uuid, uuid, boolean) rename to entra_rules;

  -- 26 ---------------------------------------------------------------- an event that cannot be read
  v_out := public.entra_access_token_hook('{"user_id": "not-a-uuid", "authentication_method": "oauth", "claims": {"sub": "x"}}');
  insert into _th values (26, 'an unreadable sign-in event is refused', 'refused',
    coalesce(v_out #>> '{error,http_code}', 'claims'), v_out #>> '{error,http_code}' = '403');
  v_out := public.entra_access_token_hook('{"user_id": "not-a-uuid", "authentication_method": "token_refresh", "claims": {"sub": "x"}}');
  insert into _th values (26, 'an unreadable refresh event is let through (a refresh is of a session already judged)', 'claims',
    case when v_out ? 'claims' then 'claims' else v_out::text end, v_out = '{"claims": {"sub": "x"}}'::jsonb);

  -- 27..29 ------------------------------------------------------------ who may call it, and with what
  select count(*) into v_n from unnest(array['anon', 'authenticated', 'service_role']) r
  where has_function_privilege(r, 'public.entra_access_token_hook(jsonb)', 'execute');
  insert into _th values (27, 'no client role, nor service_role, executes the hook', '0', v_n::text, v_n = 0);
  select count(*) into v_n from pg_proc p, aclexplode(p.proacl) a
  where p.oid = 'public.entra_access_token_hook(jsonb)'::regprocedure and a.grantee = 0;
  insert into _th values (27, 'nor PUBLIC', '0', v_n::text, v_n = 0);
  insert into _th values (27, 'supabase_auth_admin executes it', 'true',
    has_function_privilege('supabase_auth_admin', 'public.entra_access_token_hook(jsonb)', 'execute')::text,
    has_function_privilege('supabase_auth_admin', 'public.entra_access_token_hook(jsonb)', 'execute'));

  select count(*) into v_n from unnest(array['app.entra_identity_of(uuid,uuid)', 'app.entra_rules(uuid,uuid,boolean)', 'app.entra_identity()']) f,
       unnest(array['anon', 'authenticated', 'service_role']) r
  where has_function_privilege(r, f::regprocedure, 'execute');
  insert into _th values (28, 'the shared helpers are executable by no client role', '0', v_n::text, v_n = 0);

  select count(*) into v_n
  from unnest(array['app.entra_tenants', 'app.entra_sessions', 'app.member_identities', 'app.memberships', 'app.platform_admins']) t
  where has_table_privilege('supabase_auth_admin', t, 'select');
  insert into _th values (29, 'supabase_auth_admin is given no read of the tables the hook consults', '0', v_n::text, v_n = 0);
  select count(*) into v_n from pg_proc p
  where p.oid = 'public.entra_access_token_hook(jsonb)'::regprocedure
    and p.prosecdef and p.provolatile = 's' and p.proconfig @> array['search_path=""'];
  insert into _th values (29, 'the hook is SECURITY DEFINER, STABLE, with an empty search_path', '1', v_n::text, v_n = 1);
end $$;

select seq, name, expected, actual, pass from _th order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from _th where not pass;
  if v_failed is not null then
    raise exception 'entra token hook invariants failed: %', v_failed;
  end if;
  if (select count(*) from _th) < 40 then
    raise exception 'entra token hook invariants: only % assertions ran', (select count(*) from _th);
  end if;
end $$;

rollback;

-- 30 ------------------------------------------------------------------ nothing left behind
do $$
declare v_left int;
begin
  select (select count(*) from auth.users where email like '%@entra-hook-test.example')
       + (select count(*) from app.organizations where org_number in ('999999813', '999999814'))
       + (select count(*) from app.entra_tenants where tenant_id in ('11111111-1111-4111-8111-1111111111b1', '22222222-2222-4222-8222-2222222222b2', '33333333-3333-4333-8333-3333333333b3'))
    into v_left;
  if v_left <> 0 then
    raise exception 'entra token hook invariants: % throwaway rows were left behind', v_left;
  end if;
end $$;
