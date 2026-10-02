-- entra_signin_invariants.sql — «Fortsett med Microsoft» and the tenant binding (migration 0155).
--
-- A Microsoft sign-in is simulated the way Supabase Auth records one: an auth.identities row
-- with provider 'azure' whose identity_data carries `iss` at the top level and `tid`, `oid`
-- and `xms_edov` under `custom_claims` (supabase/auth, provider/oidc.go, parseAzureIDToken),
-- an auth.sessions row, and the access token's claims (sub, role, session_id) in
-- request.jwt.claims. Asserted:
--
--   * the sign-in rules: a session that did not come through Microsoft is untouched (1); no
--     membership is refused (2); a platform admin is refused (3); two azure identities, a
--     personal account and a tenant that disagrees with the issuer are refused (4-6); the first
--     sign-in binds (tenant, object id) (7-8) — but only on Microsoft's word that the address is
--     the account's own, or when Microsoft made the account (9-10); a different object id in the
--     same tenant is refused (11); a tenant other than the bound one is refused (25)
--   * binding: refused for a non-daglig leder (12), without a Microsoft session (13), on a
--     tenant other than the caller's own identity's (14), on a reused nonce (15), an expired
--     nonce (16), another person's nonce (17), a refused consent (18), a caller no longer daglig
--     leder (19); bound on the caller's own tenant (20); a tenant bound elsewhere is refused at
--     start and at completion (21-22); an organisation binds one tenant (23); unbinding keeps
--     the history (24, 26)
--   * RLS: another organisation's member reads nothing of the binding (27); a member reads their
--     own Microsoft binding and nobody else's (28); no client role writes any of the tables or
--     reads the nonces and sessions (29-30); no anonymous caller executes the RPCs (31); a
--     non-member gets no status (32)
--   * nothing is left behind: the suite runs in a transaction that is rolled back (33)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/entra_signin_invariants.sql

begin;

create temp table _ei(seq int, name text, expected text, actual text, pass bool) on commit drop;

do $$
declare
  v_org_a uuid := '00000000-0000-4000-8000-0000000ea0a1';
  v_org_b uuid := '00000000-0000-4000-8000-0000000ea0b1';
  v_dl_a  uuid := '00000000-0000-4000-8000-0000000ea001';  -- daglig leder of A, Microsoft (T1, O1)
  v_vo_a  uuid := '00000000-0000-4000-8000-0000000ea002';  -- verneombud of A, password + Microsoft, no xms_edov
  v_ms_a  uuid := '00000000-0000-4000-8000-0000000ea003';  -- verneombud of A, made by Microsoft (T1)
  v_x_a   uuid := '00000000-0000-4000-8000-0000000ea004';  -- verneombud of A, Microsoft in tenant T2
  v_dl_b  uuid := '00000000-0000-4000-8000-0000000ea005';  -- daglig leder of B, Microsoft in T1 too
  v_lone  uuid := '00000000-0000-4000-8000-0000000ea006';  -- no organisation
  v_adm   uuid := '00000000-0000-4000-8000-0000000ea007';  -- a platform admin
  v_pw    uuid := '00000000-0000-4000-8000-0000000ea008';  -- daglig leder of B, password only
  v_t1    text := '11111111-1111-4111-8111-111111111111';
  v_t2    text := '22222222-2222-4222-8222-222222222222';
  v_o1    text := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_o2    text := 'aaaaaaaa-0000-4000-8000-000000000002';
  v_json  jsonb;
  v_nonce text;
  v_nb    text;
  v_n     int;
  v_msg   text;
  u       record;
begin
  insert into app.organizations (id, name, org_number) values
    (v_org_a, 'Entra test A AS', '999999811'), (v_org_b, 'Entra test B AS', '999999812');
  insert into auth.users (id, email)
  select x.id, 'entra' || right(x.id::text, 3) || '@entra-test.example'
  from unnest(array[v_dl_a, v_vo_a, v_ms_a, v_x_a, v_dl_b, v_lone, v_adm, v_pw]) x(id);
  insert into app.profiles (id) select x from unnest(array[v_dl_a, v_vo_a, v_ms_a, v_x_a, v_dl_b, v_lone, v_adm, v_pw]) x
  on conflict do nothing;
  insert into app.memberships (org_id, user_id, role) values
    (v_org_a, v_dl_a, 'daglig_leder'), (v_org_a, v_vo_a, 'verneombud'), (v_org_a, v_ms_a, 'verneombud'),
    (v_org_a, v_x_a, 'verneombud'), (v_org_b, v_dl_b, 'daglig_leder'), (v_org_b, v_pw, 'daglig_leder');
  insert into app.platform_admins (user_id, role) values (v_adm, 'support');

  -- the identities, as Supabase Auth writes them; every account but v_ms_a also has an e-mail one
  for u in select * from (values
      (v_dl_a, v_t1, v_o1, 'true'::jsonb),
      (v_vo_a, v_t1, 'aaaaaaaa-0000-4000-8000-000000000003', null::jsonb),
      (v_ms_a, v_t1, 'aaaaaaaa-0000-4000-8000-000000000004', null::jsonb),
      (v_x_a,  v_t2, 'aaaaaaaa-0000-4000-8000-000000000005', '"1"'::jsonb),
      (v_dl_b, v_t1, 'aaaaaaaa-0000-4000-8000-000000000006', 'true'::jsonb),
      (v_lone, v_t1, 'aaaaaaaa-0000-4000-8000-000000000007', 'true'::jsonb),
      (v_adm,  v_t1, 'aaaaaaaa-0000-4000-8000-000000000008', 'true'::jsonb)) v(uid, tid, oid, edov)
  loop
    insert into auth.identities (provider_id, user_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values ('sub-' || u.oid, u.uid, 'azure',
      jsonb_build_object('iss', 'https://login.microsoftonline.com/' || u.tid || '/v2.0', 'sub', 'sub-' || u.oid,
        'email', 'entra' || right(u.uid::text, 3) || '@entra-test.example',
        'custom_claims', jsonb_strip_nulls(jsonb_build_object('tid', u.tid, 'oid', u.oid, 'xms_edov', u.edov))),
      now(), now(), now());
    insert into auth.sessions (id, user_id, created_at, updated_at)
    values (('00000000-0000-4000-9000-' || right(u.uid::text, 12))::uuid, u.uid, now(), now());
  end loop;
  insert into auth.identities (provider_id, user_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select x::text, x, 'email', jsonb_build_object('sub', x::text), now() - interval '1 day', now(), now()
  from unnest(array[v_dl_a, v_vo_a, v_x_a, v_dl_b, v_lone, v_adm, v_pw]) x;
  insert into auth.sessions (id, user_id, created_at, updated_at)
  values (('00000000-0000-4000-9000-' || right(v_pw::text, 12))::uuid, v_pw, now(), now());

  -- 1 ---------------------------------------------------------------- not a Microsoft sign-in
  perform set_config('request.jwt.claims', json_build_object('sub', v_pw, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_pw::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  insert into _ei values (1, 'a sign-in that did not come through Microsoft is not checked', 'ok/false',
    (v_json->>'ok') || '/' || (v_json->>'microsoft'), v_json->>'ok' = 'true' and v_json->>'microsoft' = 'false');

  -- 2 ---------------------------------------------------------------- no membership
  perform set_config('request.jwt.claims', json_build_object('sub', v_lone, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_lone::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  insert into _ei values (2, 'a Microsoft sign-in with no membership is refused', 'no_membership',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'no_membership');

  -- 3 ---------------------------------------------------------------- platform admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_adm::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  insert into _ei values (3, 'a platform admin is refused on the Microsoft path', 'platform_admin',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'platform_admin');

  -- 4..6 -------------------------------------------------------------- identities that cannot be trusted
  perform set_config('request.jwt.claims', json_build_object('sub', v_lone, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_lone::text, 12))::text, true);
  insert into auth.identities (provider_id, user_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values ('sub-second', v_lone, 'azure', '{"custom_claims":{"tid":"11111111-1111-4111-8111-111111111111"}}', now(), now(), now());
  v_json := public.entra_sign_in_check();
  insert into _ei values (4, 'an account with two Microsoft identities is refused', 'identity_ambiguous',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'identity_ambiguous');
  delete from auth.identities where provider_id = 'sub-second';

  update auth.identities set identity_data = jsonb_build_object('iss', 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0',
    'custom_claims', jsonb_build_object('tid', '9188040d-6c67-4c5b-b112-36a304b66dad', 'oid', v_o2))
  where user_id = v_lone and provider = 'azure';
  v_json := public.entra_sign_in_check();
  insert into _ei values (5, 'a personal Microsoft account is refused', 'personal_account',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'personal_account');

  update auth.identities set identity_data = jsonb_build_object('iss', 'https://login.microsoftonline.com/' || v_t2 || '/v2.0',
    'custom_claims', jsonb_build_object('tid', v_t1, 'oid', v_o2))
  where user_id = v_lone and provider = 'azure';
  v_json := public.entra_sign_in_check();
  insert into _ei values (6, 'a tenant id that is not the issuer''s is refused', 'identity_incomplete',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'identity_incomplete');

  -- 7..8 -------------------------------------------------------------- the first sign-in binds
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_dl_a::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  insert into _ei values (7, 'the first Microsoft sign-in of a member is accepted and binds', 'ok/true',
    coalesce(v_json->>'error', 'ok') || '/' || coalesce(v_json->>'bound_now', '-'),
    v_json->>'ok' = 'true' and v_json->>'bound_now' = 'true');
  select count(*) into v_n from app.member_identities mi join app.memberships m on m.id = mi.membership_id
  where m.user_id = v_dl_a and mi.tenant_id = v_t1 and mi.object_id = v_o1;
  insert into _ei values (8, 'the binding holds the tenant and object id from custom_claims', '1', v_n::text, v_n = 1);

  -- 9..10 ------------------------------------------------------------- a first binding needs xms_edov
  perform set_config('request.jwt.claims', json_build_object('sub', v_vo_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_vo_a::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  select count(*) into v_n from app.member_identities where user_id = v_vo_a;
  insert into _ei values (9, 'an identity linked to an existing account without xms_edov does not bind', 'email_unverified/0',
    coalesce(v_json->>'error', 'ok') || '/' || v_n, v_json->>'error' = 'email_unverified' and v_n = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ms_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_ms_a::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  insert into _ei values (10, 'an account Microsoft made binds without xms_edov', 'ok',
    coalesce(v_json->>'error', 'ok'), v_json->>'ok' = 'true');

  -- 11 ---------------------------------------------------------------- a recycled mailbox
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_dl_a::text, 12))::text, true);
  update auth.identities set identity_data = jsonb_set(identity_data, '{custom_claims,oid}', to_jsonb(v_o2))
  where user_id = v_dl_a and provider = 'azure';
  v_json := public.entra_sign_in_check();
  insert into _ei values (11, 'a different object id in the same tenant is refused for a bound membership', 'identity_mismatch',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'identity_mismatch');
  update auth.identities set identity_data = jsonb_set(identity_data, '{custom_claims,oid}', to_jsonb(v_o1))
  where user_id = v_dl_a and provider = 'azure';
  v_json := public.entra_sign_in_check();
  if v_json->>'ok' <> 'true' then raise exception 'entra invariants: the daglig leder''s own sign-in was refused: %', v_json; end if;

  -- 12 ---------------------------------------------------------------- only a daglig leder starts
  perform set_config('request.jwt.claims', json_build_object('sub', v_ms_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_ms_a::text, 12))::text, true);
  v_json := public.entra_bind_start(v_org_a);
  insert into _ei values (12, 'a verneombud signed in with Microsoft cannot start the binding', 'not_allowed',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'not_allowed');

  -- 13 ---------------------------------------------------------------- only from a Microsoft session
  perform set_config('request.jwt.claims', json_build_object('sub', v_pw, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_pw::text, 12))::text, true);
  v_json := public.entra_bind_start(v_org_b);
  insert into _ei values (13, 'a daglig leder signed in with a password cannot start the binding', 'not_microsoft',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'not_microsoft');

  -- dlB signs in with Microsoft (same tenant T1) and starts first: completed after A has bound (22)
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_b, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_dl_b::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  v_json := public.entra_bind_start(v_org_b);
  v_nb := v_json->>'nonce';
  if v_nb is null then raise exception 'entra invariants: B could not start: %', v_json; end if;

  -- 14..15 ------------------------------------------------------------ the caller's own tenant, once
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_dl_a::text, 12))::text, true);
  v_json := public.entra_bind_start(v_org_a);
  v_nonce := v_json->>'nonce';
  insert into _ei values (14, 'the start names the caller''s own tenant, and the digest alone is stored',
    v_t1 || '/1/0', coalesce(v_json->>'tenant', v_json->>'error') || '/'
      || (select count(*) from app.entra_bind_nonces where nonce_sha256 = encode(extensions.digest(v_nonce, 'sha256'), 'hex')) || '/'
      || (select count(*) from app.entra_bind_nonces where nonce_sha256 = v_nonce),
    v_json->>'tenant' = v_t1
      and exists (select 1 from app.entra_bind_nonces where nonce_sha256 = encode(extensions.digest(v_nonce, 'sha256'), 'hex'))
      and not exists (select 1 from app.entra_bind_nonces where nonce_sha256 = v_nonce));
  v_json := public.entra_bind_complete(v_nonce, v_t2, 'True', null);
  insert into _ei values (14, 'a consent for a tenant that is not the caller''s own identity''s is refused', 'tenant_mismatch',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'tenant_mismatch');
  v_json := public.entra_bind_complete(v_nonce, v_t1, 'True', null);
  insert into _ei values (15, 'a nonce is single-use, whatever the first use came to', 'nonce_used',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'nonce_used');

  -- 16 ---------------------------------------------------------------- expired
  v_nonce := public.entra_bind_start(v_org_a)->>'nonce';
  update app.entra_bind_nonces set expires_at = now() - interval '1 second'
  where nonce_sha256 = encode(extensions.digest(v_nonce, 'sha256'), 'hex');
  v_json := public.entra_bind_complete(v_nonce, v_t1, 'True', null);
  insert into _ei values (16, 'an expired nonce is refused', 'nonce_expired',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'nonce_expired');

  -- 17 ---------------------------------------------------------------- somebody else's nonce
  v_nonce := public.entra_bind_start(v_org_a)->>'nonce';
  perform set_config('request.jwt.claims', json_build_object('sub', v_ms_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_ms_a::text, 12))::text, true);
  v_json := public.entra_bind_complete(v_nonce, v_t1, 'True', null);
  insert into _ei values (17, 'another member cannot complete a daglig leder''s nonce', 'nonce_invalid',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'nonce_invalid');

  -- 18 ---------------------------------------------------------------- consent refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_dl_a::text, 12))::text, true);
  v_nonce := public.entra_bind_start(v_org_a)->>'nonce';
  v_json := public.entra_bind_complete(v_nonce, v_t1, 'False', null);
  insert into _ei values (18, 'admin_consent other than True is refused', 'consent_refused',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'consent_refused');
  v_nonce := public.entra_bind_start(v_org_a)->>'nonce';
  v_json := public.entra_bind_complete(v_nonce, v_t1, 'True', 'access_denied');
  insert into _ei values (18, 'an error from Microsoft is refused even beside admin_consent=True', 'consent_refused',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'consent_refused');

  -- 19 ---------------------------------------------------------------- no longer daglig leder
  v_nonce := public.entra_bind_start(v_org_a)->>'nonce';
  update app.memberships set role = 'verneombud' where user_id = v_dl_a and org_id = v_org_a;
  v_json := public.entra_bind_complete(v_nonce, v_t1, 'True', null);
  insert into _ei values (19, 'a caller who is no longer daglig leder cannot complete', 'not_allowed',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'not_allowed');
  update app.memberships set role = 'daglig_leder' where user_id = v_dl_a and org_id = v_org_a;

  -- 20 ---------------------------------------------------------------- bound
  v_nonce := public.entra_bind_start(v_org_a)->>'nonce';
  v_json := public.entra_bind_complete(v_nonce, upper(v_t1), 'True', null);
  insert into _ei values (20, 'the daglig leder''s own tenant, consented, is bound with its history', 'ok/1/1',
    coalesce(v_json->>'error', 'ok') || '/'
      || (select count(*) from app.entra_tenants where org_id = v_org_a and tenant_id = v_t1 and bound_by = v_dl_a) || '/'
      || (select count(*) from app.entra_tenant_log where org_id = v_org_a and event = 'bound' and actor = v_dl_a),
    v_json->>'ok' = 'true'
      and exists (select 1 from app.entra_tenants where org_id = v_org_a and tenant_id = v_t1 and bound_by = v_dl_a)
      and exists (select 1 from app.entra_tenant_log where org_id = v_org_a and event = 'bound'));

  -- 23 ---------------------------------------------------------------- one tenant per organisation
  v_json := public.entra_bind_start(v_org_a);
  insert into _ei values (23, 'a bound organisation cannot start another binding', 'already_bound',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'already_bound');

  -- 21..22 ------------------------------------------------------------ one organisation per tenant
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_b, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_dl_b::text, 12))::text, true);
  v_json := public.entra_bind_complete(v_nb, v_t1, 'True', null);
  insert into _ei values (22, 'a tenant bound to another organisation is refused at completion', 'tenant_taken',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'tenant_taken');
  v_json := public.entra_bind_start(v_org_b);
  insert into _ei values (21, 'and at the start', 'tenant_taken',
    coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'tenant_taken');
  begin
    insert into app.entra_tenants (org_id, tenant_id) values (v_org_b, v_t1);
    insert into _ei values (21, 'the unique constraint holds beneath the functions', 'refused', 'ACCEPTED', false);
  exception when unique_violation then
    insert into _ei values (21, 'the unique constraint holds beneath the functions', 'refused', 'refused', true);
  end;

  -- 25 ---------------------------------------------------------------- the bound tenant only
  perform set_config('request.jwt.claims', json_build_object('sub', v_x_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_x_a::text, 12))::text, true);
  v_json := public.entra_sign_in_check();
  select count(*) into v_n from app.member_identities where user_id = v_x_a;
  insert into _ei values (25, 'a sign-in from another tenant than the bound one is refused and binds nothing', 'tenant_mismatch/0',
    coalesce(v_json->>'error', 'ok') || '/' || v_n, v_json->>'error' = 'tenant_mismatch' and v_n = 0);

  -- 27..28 ------------------------------------------------------------ RLS
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.entra_tenants where org_id = v_org_a;
  reset role;
  insert into _ei values (27, 'another organisation''s member cannot read the binding', '0', v_n::text, v_n = 0);
  set local role authenticated;
  select count(*) into v_n from app.member_identities where org_id = v_org_a;
  reset role;
  insert into _ei values (27, 'nor its members'' Microsoft ids', '0', v_n::text, v_n = 0);
  set local role authenticated;
  select count(*) into v_n from app.entra_tenant_log where org_id = v_org_a;
  reset role;
  insert into _ei values (27, 'nor its history', '0', v_n::text, v_n = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ms_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from app.entra_tenants where org_id = v_org_a;
  reset role;
  insert into _ei values (28, 'a member reads their own organisation''s binding', '1', v_n::text, v_n = 1);
  set local role authenticated;
  select count(*) filter (where user_id = v_ms_a) * 10 + count(*) filter (where user_id <> v_ms_a) into v_n from app.member_identities;
  reset role;
  insert into _ei values (28, 'and their own Microsoft binding, and nobody else''s', '10', v_n::text, v_n = 10);

  -- 29..30 ------------------------------------------------------------ no direct writes, no reads of the secrets
  select count(*) into v_n
  from unnest(array['app.entra_tenants', 'app.entra_tenant_log', 'app.member_identities', 'app.entra_bind_nonces', 'app.entra_sessions']) t,
       unnest(array['anon', 'authenticated']) r,
       unnest(array['insert', 'update', 'delete']) p
  where has_table_privilege(r, t, p);
  insert into _ei values (29, 'no client role may insert, update or delete any of the five tables', '0', v_n::text, v_n = 0);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_a, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    insert into app.member_identities (membership_id, org_id, user_id, tenant_id, object_id)
    select m.id, m.org_id, v_dl_a, v_t1, v_o2 from app.memberships m where m.user_id = v_vo_a;
    reset role;
    insert into _ei values (29, 'a daglig leder cannot bind a member''s Microsoft id directly', 'refused', 'ACCEPTED', false);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    insert into _ei values (29, 'a daglig leder cannot bind a member''s Microsoft id directly', 'refused', left(v_msg, 40), true);
  end;
  begin
    set local role authenticated;
    update app.entra_tenants set tenant_id = v_t2 where org_id = v_org_a;
    reset role;
    insert into _ei values (29, 'nor change the bound tenant directly', 'refused', 'ACCEPTED', false);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    insert into _ei values (29, 'nor change the bound tenant directly', 'refused', left(v_msg, 40), true);
  end;
  select count(*) into v_n
  from unnest(array['app.entra_bind_nonces', 'app.entra_sessions']) t, unnest(array['anon', 'authenticated']) r
  where has_table_privilege(r, t, 'select');
  insert into _ei values (30, 'no client role reads the nonces or the Microsoft sessions', '0', v_n::text, v_n = 0);

  -- 31 ---------------------------------------------------------------- not anonymous
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'entra\_%' and has_function_privilege('anon', p.oid, 'execute');
  insert into _ei values (31, 'no Entra RPC is executable anonymously', '0', v_n::text, v_n = 0);
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.proname in ('entra_identity', 'entra_session_identity', 'jwt_session_id')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  insert into _ei values (31, 'nor any of its helpers by a client at all', '0', v_n::text, v_n = 0);

  -- 32 ---------------------------------------------------------------- status for members only
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_b, 'role', 'authenticated')::text, true);
  v_json := public.entra_status(v_org_a);
  insert into _ei values (32, 'a non-member gets no status', 'not_allowed', coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'not_allowed');
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_a, 'role', 'authenticated',
    'session_id', '00000000-0000-4000-9000-' || right(v_dl_a::text, 12))::text, true);
  v_json := public.entra_status(v_org_a);
  insert into _ei values (32, 'the daglig leder''s status is the real one', 'true/true/' || v_t1,
    (v_json->>'bound') || '/' || (v_json->>'microsoft') || '/' || coalesce(v_json->>'tenant_id', '-'),
    v_json->>'bound' = 'true' and v_json->>'microsoft' = 'true' and v_json->>'tenant_id' = v_t1);

  -- 24, 26 ------------------------------------------------------------ unbinding
  perform set_config('request.jwt.claims', json_build_object('sub', v_ms_a, 'role', 'authenticated')::text, true);
  v_json := public.entra_unbind(v_org_a);
  insert into _ei values (24, 'a verneombud cannot unbind', 'not_allowed', coalesce(v_json->>'error', 'ok'), v_json->>'error' = 'not_allowed');
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl_a, 'role', 'authenticated')::text, true);
  v_json := public.entra_unbind(v_org_a);
  insert into _ei values (26, 'the daglig leder unbinds; who and when is kept', 'ok/0/1',
    coalesce(v_json->>'error', 'ok') || '/' || (select count(*) from app.entra_tenants where org_id = v_org_a) || '/'
      || (select count(*) from app.entra_tenant_log where org_id = v_org_a and event = 'unbound' and actor = v_dl_a),
    v_json->>'ok' = 'true' and not exists (select 1 from app.entra_tenants where org_id = v_org_a)
      and exists (select 1 from app.entra_tenant_log where org_id = v_org_a and event = 'unbound' and actor = v_dl_a));
end $$;

select seq, name, expected, actual, pass from _ei order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from _ei where not pass;
  if v_failed is not null then
    raise exception 'entra sign-in invariants failed: %', v_failed;
  end if;
end $$;

rollback;

-- 33 ------------------------------------------------------------------ nothing left behind
do $$
declare v_left int;
begin
  select (select count(*) from auth.users where email like '%@entra-test.example')
       + (select count(*) from app.organizations where org_number in ('999999811', '999999812'))
       + (select count(*) from app.entra_tenants where tenant_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'))
    into v_left;
  if v_left <> 0 then
    raise exception 'entra sign-in invariants: % throwaway rows were left behind', v_left;
  end if;
end $$;
