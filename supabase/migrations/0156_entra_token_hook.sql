-- 0156 — The Microsoft sign-in rules, enforced where Supabase Auth issues a token (D-204).
--
-- 0155 enforces the rules in public.entra_sign_in_check, which /auth/callback runs after the
-- OAuth code exchange. A client that performs the exchange itself (POST /auth/v1/token with
-- grant_type=pkce), takes the implicit flow's tokens from the redirect, or posts a Microsoft ID
-- token to grant_type=id_token never reaches that callback, and so held a session the rules would
-- have refused — most dangerously one on an account Supabase Auth linked by e-mail address
-- (0155's head: an Entra e-mail claim is not verified unless xms_edov says so).
--
-- This migration closes that at token issuance with a Custom Access Token hook,
-- public.entra_access_token_hook(event). Supabase Auth calls it, as supabase_auth_admin and in
-- the transaction that issues the token, before every access token it signs; an answer of
-- {"error": {"http_code": 403, ...}} refuses the token and rolls the new session back
-- (supabase/auth v2.197.0: internal/tokens/service.go GenerateAccessToken, IssueRefreshToken;
-- internal/hooks/hookspgfunc). The owner switches it on in the dashboard *before* the azure
-- provider (docs/integrations/entra-signin.md); supabase/config.toml switches it on locally.
--
-- What is gated, and why exactly that:
--   * authentication_method 'oauth' — every sign-in through an identity provider: the PKCE
--     exchange (the flow state records 'oauth', external.go), the implicit flow and the id_token
--     grant (token_oidc.go). The same rules as the callback decide, from the same function
--     (app.entra_rules below), so the two cannot drift. A Google sign-in is 'oauth' too; the
--     rules answer "not a Microsoft sign-in" for it exactly as they do in the callback.
--   * authentication_method 'token_refresh' — only for a session the callback recorded as a
--     Microsoft one (app.entra_sessions). The rules are evaluated again for it, as of now: a
--     member whose organisation has since bound a different tenant, whose Microsoft binding no
--     longer matches, or who has become a platform admin, gets no new access token, so the
--     session ends when its current one expires (an hour by default). An organisation that
--     *unbinds* its tenant relaxes rule 2 and nothing else, so its members' sessions go on: they
--     are still the Microsoft person their membership was bound to (rule 3), which unbinding does
--     not touch.
--     A refresh is never classified by the time-window test that classifies a sign-in: a refused
--     Microsoft attempt bumps the identity's timestamp, and a password session refreshed within
--     ten minutes of it would then be judged as Microsoft and cut — a way for a stranger who
--     linked an identity to someone's address to sign that person out. Sessions that bypassed the
--     callback are not in app.entra_sessions; they passed these rules at issuance (above).
--   * anything else — password, OTP, magic link, recovery, invite, TOTP, SAML, anonymous, … — is
--     returned unchanged without reading a row. So is every issuance for an account that has no
--     Microsoft identity at all.
-- One difference from the callback, and only because the hook cannot let a sign-in through and
-- check again after the membership is made: the callback lets "no membership yet" through on its
-- signup and invitation paths (create_organisation / accept_invite come next, then the rules run
-- again and bind). The hook lets it through only when a first binding would be allowed — xms_edov
-- true, or the Microsoft identity is the account's only identity — the precondition the
-- callback's second run applies anyway. A stranger linked to an existing account without xms_edov
-- therefore gets no token even on an account that has no membership.
--
-- Failure: a hook that raises an error makes Supabase Auth refuse the token (500). For an
-- account with a Microsoft identity that is the right answer (fail closed), for everyone else it
-- would be an outage, so the hook catches its own faults: an account with a Microsoft identity
-- is refused, any other account is let through untouched. Every refusal carries one message, so
-- the answer never says whether an account exists, and only the rule's code is logged.
--
-- **A correction to 0155's notion of "this session came through Microsoft".** app.entra_identity
-- read auth.identities.last_sign_in_at, which Supabase Auth sets when it *creates* an identity
-- but writes back unchanged on every later sign-in through it (external.go, AccountExists:
-- UpdateOnly(identity, "identity_data", "last_sign_in_at") with the loaded value). What it does
-- move on every sign-in is updated_at (pop's Update sets it; storage/dial.go never excludes it).
-- So from the second Microsoft sign-in of an identity, the callback saw "not Microsoft" and ran no
-- rule at all, and «Koble til Microsoft 365» found no Microsoft session. The test is now
-- greatest(last_sign_in_at, updated_at); nothing else in Supabase Auth updates an azure identity's
-- row. The rules themselves are unchanged and still read tenant and object id from
-- custom_claims, never an address, a UPN or user_metadata.

-- ---------------------------------------------------------------- whose identity, for any account

/*
 * 0155's app.entra_identity, for a given account and session rather than the caller's: the hook
 * has no request.jwt.claims, only the user id and the claims it is about to sign.
 */
create function app.entra_identity_of(p_uid uuid, p_session uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_n       int;
  v_data    jsonb;
  v_tid     text;
  v_oid     text;
  v_iss     text;
  v_edov    jsonb;
  v_since   timestamptz;
  v_session boolean;
  v_uuid    constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_uid is null then return jsonb_build_object('n', 0, 'session', false); end if;

  select coalesce((select s.created_at from auth.sessions s where s.id = p_session and s.user_id = p_uid), now())
    - interval '10 minutes' into v_since;
  -- updated_at is the one column Supabase Auth moves on every sign-in through an identity (see head)
  select count(*), coalesce(bool_or(greatest(i.last_sign_in_at, i.updated_at) >= v_since), false)
    into v_n, v_session
  from auth.identities i where i.user_id = p_uid and i.provider = 'azure';
  if v_n <> 1 then return jsonb_build_object('n', v_n, 'session', v_session); end if;

  select i.identity_data into v_data from auth.identities i where i.user_id = p_uid and i.provider = 'azure';
  v_tid := lower(coalesce(v_data #>> '{custom_claims,tid}', v_data ->> 'tid'));
  v_oid := lower(coalesce(v_data #>> '{custom_claims,oid}', v_data ->> 'oid'));
  v_iss := lower(v_data ->> 'iss');
  v_edov := coalesce(v_data #> '{custom_claims,xms_edov}', v_data -> 'xms_edov');

  if v_tid !~ v_uuid then v_tid := null; end if;
  if v_oid !~ v_uuid then v_oid := null; end if;
  -- the tenant in the claims must be the tenant that issued the token
  if v_tid is not null and v_iss is not null and v_iss <> 'https://login.microsoftonline.com/' || v_tid || '/v2.0' then
    v_tid := null;
  end if;

  return jsonb_build_object(
    'n', 1,
    'session', v_session,
    'tid', v_tid,
    'oid', v_oid,
    -- Microsoft sends it as true, "1" or "true" (oidc.go handles the same three)
    'edov', coalesce(v_edov = 'true'::jsonb or v_edov = '"1"'::jsonb or v_edov = '"true"'::jsonb or v_edov = '1'::jsonb, false),
    'only', not exists (select 1 from auth.identities i where i.user_id = p_uid and i.provider <> 'azure'));
end $fn$;
revoke all on function app.entra_identity_of(uuid, uuid) from public, anon, authenticated, service_role;

-- the caller's, as before: entra_session_identity and entra_status read it
create or replace function app.entra_identity() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select app.entra_identity_of(auth.uid(), app.jwt_session_id())
$fn$;
revoke all on function app.entra_identity() from public, anon, authenticated;

-- ---------------------------------------------------------------- the rules, read-only, in one place

/*
 * The sign-in rules of 0155 (numbered as there), deciding and writing nothing. Called by
 * entra_sign_in_check (which then binds) and by the token hook (which only decides).
 *   p_microsoft  null: decide from the identity whether this is a Microsoft sign-in (a sign-in);
 *                true: the session is known to be a Microsoft one (a refresh of a recorded one).
 * Answers {ok, microsoft, error?, tid?, oid?, first_ok?}; first_ok, on no_membership only, says
 * whether a first binding would be allowed (rule 3's precondition).
 */
create function app.entra_rules(p_uid uuid, p_session uuid, p_microsoft boolean default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_id    jsonb;
  v_tid   text;
  v_oid   text;
  v_ms    record;
  v_bound text;
  v_have  app.member_identities%rowtype;
begin
  if p_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  v_id := app.entra_identity_of(p_uid, p_session);
  if not coalesce(p_microsoft, (v_id ->> 'session')::boolean, false) then
    -- not a Microsoft sign-in: none of this applies
    return jsonb_build_object('ok', true, 'microsoft', false);
  end if;

  -- 4. platform admins sign in with a password and a second factor only (D-90)
  if exists (select 1 from app.platform_admins a where a.user_id = p_uid and a.active) then
    return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'platform_admin');
  end if;
  if (v_id ->> 'n')::int <> 1 then
    return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'identity_ambiguous');
  end if;
  v_tid := v_id ->> 'tid';
  v_oid := v_id ->> 'oid';
  if v_tid is null or v_oid is null then
    return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'identity_incomplete');
  end if;
  -- a personal Microsoft account (the consumer tenant); the organizations endpoint never issues one
  if v_tid = '9188040d-6c67-4c5b-b112-36a304b66dad' then
    return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'personal_account');
  end if;

  -- 1. no organisation, no session
  if not exists (select 1 from app.memberships m where m.user_id = p_uid and m.active) then
    return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'no_membership',
      'first_ok', (v_id ->> 'edov')::boolean or (v_id ->> 'only')::boolean);
  end if;

  -- every active membership must pass
  for v_ms in select m.id, m.org_id from app.memberships m where m.user_id = p_uid and m.active loop
    -- 2. the organisation's tenant
    v_bound := null;
    select t.tenant_id into v_bound from app.entra_tenants t where t.org_id = v_ms.org_id;
    if v_bound is not null and v_bound <> v_tid then
      return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'tenant_mismatch');
    end if;
    -- 3. the membership's Microsoft person
    select * into v_have from app.member_identities mi where mi.membership_id = v_ms.id;
    if found then
      if v_have.tenant_id <> v_tid or v_have.object_id <> v_oid then
        return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'identity_mismatch');
      end if;
    elsif not ((v_id ->> 'edov')::boolean or (v_id ->> 'only')::boolean) then
      -- a first binding needs Microsoft's word that the address is the account's own (0155's head)
      return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'email_unverified');
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'microsoft', true, 'tid', v_tid, 'oid', v_oid);
end $fn$;
revoke all on function app.entra_rules(uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- the callback's check, on the shared rules
-- Same signature, grants and answers as 0155; the deciding moved to app.entra_rules, the binding
-- and the session record stay here.
create or replace function public.entra_sign_in_check() returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_sid   uuid := app.jwt_session_id();
  v_r     jsonb;
  v_tid   text;
  v_oid   text;
  v_new   int := 0;
begin
  v_r := app.entra_rules(v_uid, v_sid);
  if not (v_r ->> 'ok')::boolean then return v_r - 'first_ok'; end if;
  if not (v_r ->> 'microsoft')::boolean then return jsonb_build_object('ok', true, 'microsoft', false); end if;
  v_tid := v_r ->> 'tid';
  v_oid := v_r ->> 'oid';

  begin
    insert into app.member_identities (membership_id, org_id, user_id, tenant_id, object_id)
    select m.id, m.org_id, v_uid, v_tid, v_oid
    from app.memberships m where m.user_id = v_uid and m.active
    on conflict (membership_id) do nothing;
    get diagnostics v_new = row_count;
  exception when unique_violation then
    -- the same Microsoft person is already another member of this organisation
    return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'identity_mismatch');
  end;
  -- a concurrent first sign-in may have bound a different person between the check and the insert
  if exists (
    select 1 from app.member_identities mi join app.memberships m on m.id = mi.membership_id
    where m.user_id = v_uid and m.active and (mi.tenant_id <> v_tid or mi.object_id <> v_oid)
  ) then
    return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'identity_mismatch');
  end if;

  if v_sid is not null then
    delete from app.entra_sessions s
    where s.user_id = v_uid and s.session_id <> v_sid
      and not exists (select 1 from auth.sessions a where a.id = s.session_id);
    insert into app.entra_sessions (session_id, user_id, tenant_id, object_id)
    values (v_sid, v_uid, v_tid, v_oid)
    on conflict (session_id) do update
      set tenant_id = excluded.tenant_id, object_id = excluded.object_id, created_at = now()
      where app.entra_sessions.user_id = excluded.user_id;
  end if;

  return jsonb_build_object('ok', true, 'microsoft', true, 'bound_now', v_new > 0);
end $fn$;

-- ---------------------------------------------------------------- the hook

create function public.entra_access_token_hook(event jsonb) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_method text := event ->> 'authentication_method';
  v_uid    uuid;
  v_sid    uuid;
  v_r      jsonb;
  -- one answer for every refusal: it must not tell anyone whether an account exists
  c_refuse constant jsonb := '{"error": {"http_code": 403, "message": "Sign-in refused"}}'::jsonb;
begin
  -- a password, OTP, magic link, TOTP, … issuance is none of this hook's business (see head)
  if v_method is distinct from 'oauth' and v_method is distinct from 'token_refresh' then
    return jsonb_build_object('claims', event -> 'claims');
  end if;

  begin
    v_uid := (event ->> 'user_id')::uuid;
    -- an account without a Microsoft identity: nothing to check, ever
    if not exists (select 1 from auth.identities i where i.user_id = v_uid and i.provider = 'azure') then
      return jsonb_build_object('claims', event -> 'claims');
    end if;
    if (event #>> '{claims,session_id}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_sid := (event #>> '{claims,session_id}')::uuid;
    end if;

    if v_method = 'token_refresh' then
      -- only a session the callback accepted as Microsoft's is judged again; never by time window
      if v_sid is null or not exists (
        select 1 from app.entra_sessions s where s.session_id = v_sid and s.user_id = v_uid
      ) then
        return jsonb_build_object('claims', event -> 'claims');
      end if;
      v_r := app.entra_rules(v_uid, v_sid, true);
    else
      v_r := app.entra_rules(v_uid, v_sid);
    end if;

    if (v_r ->> 'ok')::boolean
       or (v_r ->> 'error' = 'no_membership' and coalesce((v_r ->> 'first_ok')::boolean, false)) then
      return jsonb_build_object('claims', event -> 'claims');
    end if;
    raise log 'entra token hook: % refused (%)', v_method, coalesce(v_r ->> 'error', 'unknown');
    return c_refuse;
  exception when others then
    -- a fault of this function: closed for a Microsoft account, open for everyone else
    begin
      if exists (select 1 from auth.identities i where i.user_id = (event ->> 'user_id')::uuid and i.provider = 'azure') then
        raise log 'entra token hook: % refused (fault)', v_method;
        return c_refuse;
      end if;
    exception when others then
      -- cannot even tell: a new sign-in through a provider is refused, a refresh goes on
      raise log 'entra token hook: % fault', v_method;
      if v_method = 'oauth' then return c_refuse; end if;
    end;
    return jsonb_build_object('claims', event -> 'claims');
  end;
end $fn$;
comment on function public.entra_access_token_hook(jsonb) is
  'Supabase Auth Custom Access Token hook (0156, D-204): the Microsoft sign-in rules at token issuance. Executable by supabase_auth_admin only.';

-- Supabase Auth calls it as supabase_auth_admin; no client may. The function is SECURITY DEFINER,
-- so supabase_auth_admin needs no read of its own on app.* or on the tables it consults.
revoke all on function public.entra_access_token_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.entra_access_token_hook(jsonb) to supabase_auth_admin;
