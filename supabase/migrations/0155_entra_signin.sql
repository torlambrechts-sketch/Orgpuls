-- 0155 — «Fortsett med Microsoft» and the organisation's Microsoft 365 tenant (D-201).
--
-- Leaders sign in with Supabase Auth's `azure` provider against the multitenant endpoint
-- (https://login.microsoftonline.com/organizations). What Supabase stores for such a sign-in is
-- an `auth.identities` row with provider 'azure'. Its identity_data is the ID token's claims as
-- supabase/auth builds them (internal/api/provider/oidc.go, parseAzureIDToken, read at commit
-- ce9a8ee of 2026-09-22): `iss`, `sub`, `provider_id` (= sub), `name`, `preferred_username`
-- and `email` at the top level, and every other claim — `tid`, `oid`, `xms_edov` among them —
-- under `custom_claims`. The row is rewritten on every sign-in (external.go, AccountExists).
-- app.entra_identity reads `custom_claims.tid` / `custom_claims.oid` and, defensively, the
-- same keys at the top level, and refuses a `tid` that disagrees with `iss`.
--
-- Nothing here authorises on an e-mail address, a UPN or user_metadata (the nOAuth class of
-- bug): user_metadata is writable by its user, and the e-mail claim of a multitenant app is
-- whatever the other tenant's administrator typed. The identity row is written by Supabase
-- Auth alone, and the two values that name a Microsoft person — tenant id and object id — are
-- the only ones used.
--
-- **One caveat this migration can only narrow.** Supabase Auth links a new Microsoft identity
-- to an existing account whose address matches when it considers the address verified, and for
-- Azure that is "an e-mail is present and xms_edov is absent or true" (oidc.go,
-- AzureIDTokenClaims.IsEmailVerified). Without the optional claim xms_edov configured on the app
-- registration, any tenant could therefore present an address it does not own and be linked to
-- an Orgpuls account. So the *first* Microsoft sign-in of a membership binds only when Microsoft
-- says the domain owner verified the address (xms_edov true), or when the Microsoft identity is
-- the account's only identity (the account was made by that sign-in, so nothing was linked to
-- it). After that, the membership is bound to (tenant id, object id) and nothing else will do.
--
-- The rules (public.entra_sign_in_check), called by /auth/callback after every OAuth sign-in
-- and by /bli-med after an invitation is accepted:
--   1. a Microsoft sign-in with no active membership is refused (the callback's signup flow
--      creates the organisation first, as for Google, D-102);
--   2. if the organisation has bound a tenant, the sign-in's tenant must be that tenant;
--   3. the first Microsoft sign-in of a member binds (tenant, object id) to the membership;
--      every later one must present the same pair — a recycled mailbox with a new object id
--      does not inherit a leader;
--   4. a platform admin is refused (admins sign in with a password and TOTP only, D-90).
-- A sign-in that did not come through Microsoft is answered {ok, microsoft: false} and nothing
-- is checked: the callback calls this for every provider, so a query parameter cannot route a
-- Microsoft sign-in around it.
--
-- Binding the tenant («Koble til Microsoft 365», Oppsett › Integrasjoner): a daglig leder
-- whose *current session* came through Microsoft starts it (a single-use nonce, stored as its
-- SHA-256, 15 minutes, bound to user, organisation, session and the caller's own tenant); the
-- admin-consent redirect comes back to /integrasjoner/entra/callback, and the binding is made
-- only if Microsoft granted consent and the tenant it reports is the caller's own identity's
-- tenant — Microsoft's own guidance is never to authorise on the `tenant` parameter alone. One
-- tenant per organisation and one organisation per tenant, both by unique constraints.
--
-- Nothing here reads or writes responses, answers, invitations or tokens of respondents. No
-- function raises or returns a name, an address or an id of anyone: refusals are codes.

-- ---------------------------------------------------------------- the tenant an organisation bound
create table app.entra_tenants (
  org_id    uuid primary key references app.organizations (id) on delete cascade,
  tenant_id text not null unique
            check (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  bound_by  uuid references auth.users (id) on delete set null,
  bound_at  timestamptz not null default now()
);
comment on table app.entra_tenants is
  'The Microsoft 365 (Entra ID) tenant an organisation bound by admin consent (0155). Unique both ways.';

alter table app.entra_tenants enable row level security;
-- members see whether, and to which tenant, their organisation is bound; writes are RPCs only
create policy entra_tenants_read on app.entra_tenants
  for select to authenticated using (app.is_org_member(org_id));
revoke all on app.entra_tenants from public, anon, authenticated;
grant select on app.entra_tenants to authenticated;

-- ---------------------------------------------------------------- who bound and unbound, kept
-- `_log`, not `_events`: a table named `*_events` is in the growth firewall's scope (0141), which
-- holds that analytics tables have no client grant; this is an audit trail the daglig leder reads.
create table app.entra_tenant_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references app.organizations (id) on delete cascade,
  tenant_id   text not null,
  event       text not null check (event in ('bound', 'unbound')),
  actor       uuid references auth.users (id) on delete set null,
  happened_at timestamptz not null default now()
);
create index entra_tenant_log_org_idx on app.entra_tenant_log (org_id, happened_at desc);

alter table app.entra_tenant_log enable row level security;
create policy entra_tenant_log_read on app.entra_tenant_log
  for select to authenticated using (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
revoke all on app.entra_tenant_log from public, anon, authenticated;
grant select on app.entra_tenant_log to authenticated;

-- ---------------------------------------------------------------- a membership's Microsoft person
-- Not columns on app.memberships: every member reads that table's rows for the organisation,
-- and nobody needs another member's object id. A member reads their own row only.
create table app.member_identities (
  membership_id uuid primary key references app.memberships (id) on delete cascade,
  org_id        uuid not null references app.organizations (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  tenant_id     text not null
                check (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  object_id     text not null
                check (object_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  bound_at      timestamptz not null default now(),
  -- one Microsoft person is one member of an organisation
  unique (org_id, tenant_id, object_id)
);
create index member_identities_user_idx on app.member_identities (user_id);

alter table app.member_identities enable row level security;
create policy member_identities_own on app.member_identities
  for select to authenticated using (user_id = auth.uid());
revoke all on app.member_identities from public, anon, authenticated;
grant select on app.member_identities to authenticated;

-- ---------------------------------------------------------------- consent nonces (no client policy)
create table app.entra_bind_nonces (
  nonce_sha256 text primary key check (nonce_sha256 ~ '^[0-9a-f]{64}$'),
  org_id       uuid not null references app.organizations (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  session_id   uuid not null,
  tenant_id    text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz
);
alter table app.entra_bind_nonces enable row level security;
revoke all on app.entra_bind_nonces from public, anon, authenticated;

-- ---------------------------------------------------------------- sessions that came through Microsoft
-- Supabase records no provider on a session. entra_sign_in_check writes the session here when it
-- has accepted a Microsoft sign-in, and «Koble til Microsoft 365» asks for such a session.
create table app.entra_sessions (
  session_id uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  tenant_id  text not null,
  object_id  text not null,
  created_at timestamptz not null default now()
);
create index entra_sessions_user_idx on app.entra_sessions (user_id);
alter table app.entra_sessions enable row level security;
revoke all on app.entra_sessions from public, anon, authenticated;

-- a demo copy carries none of it: a tenant and a person's object id belong to the real organisation
insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('entra_tenants', null, 'skip', null, 'a Microsoft tenant binding belongs to the real organisation (0155)'),
  ('entra_tenant_log', null, 'skip', null, 'the binding''s history belongs to the real organisation (0155)'),
  ('member_identities', null, 'skip', null, 'a member''s Microsoft object id is that person''s, not the demo''s (0155)'),
  ('entra_bind_nonces', null, 'skip', null, 'single-use consent nonces (0155)');

-- ---------------------------------------------------------------- helpers (no client may call them)

/* The current session's id, from the access token, or null. */
create function app.jwt_session_id() returns uuid
  language sql stable set search_path = ''
as $fn$
  select case when (auth.jwt() ->> 'session_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (auth.jwt() ->> 'session_id')::uuid end
$fn$;
revoke all on function app.jwt_session_id() from public, anon, authenticated;

/*
 * The caller's Microsoft identity, read from auth.identities and nowhere else:
 *   n        how many azure identities the account has (anything but 1 is refused)
 *   tid/oid  tenant and object id, lower case, or absent when unreadable
 *   edov     Microsoft's xms_edov: the domain owner verified the e-mail address
 *   only     the azure identity is the account's only identity
 *   session  the current session came through Microsoft: an azure identity's last sign-in
 *            falls within ten minutes before the session was created (Supabase updates the
 *            identity when Microsoft answers, and creates the session at the code exchange)
 */
create function app.entra_identity() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
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
  if v_uid is null then return jsonb_build_object('n', 0, 'session', false); end if;

  select coalesce((select s.created_at from auth.sessions s where s.id = app.jwt_session_id() and s.user_id = v_uid), now())
    - interval '10 minutes' into v_since;
  select count(*), coalesce(bool_or(i.last_sign_in_at >= v_since), false)
    into v_n, v_session
  from auth.identities i where i.user_id = v_uid and i.provider = 'azure';
  if v_n <> 1 then return jsonb_build_object('n', v_n, 'session', v_session); end if;

  select i.identity_data into v_data from auth.identities i where i.user_id = v_uid and i.provider = 'azure';
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
    'only', not exists (select 1 from auth.identities i where i.user_id = v_uid and i.provider <> 'azure'));
end $fn$;
revoke all on function app.entra_identity() from public, anon, authenticated;

/*
 * The caller's Microsoft identity if the *current session* is one entra_sign_in_check accepted
 * for that same identity; null otherwise. What «currently signed in with Microsoft» means here.
 */
create function app.entra_session_identity() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_id  jsonb := app.entra_identity();
  v_sid uuid := app.jwt_session_id();
begin
  if v_sid is null or (v_id ->> 'n')::int <> 1 or v_id ->> 'tid' is null or v_id ->> 'oid' is null then
    return null;
  end if;
  if not exists (
    select 1 from app.entra_sessions s
    where s.session_id = v_sid and s.user_id = auth.uid()
      and s.tenant_id = v_id ->> 'tid' and s.object_id = v_id ->> 'oid'
  ) then
    return null;
  end if;
  return v_id;
end $fn$;
revoke all on function app.entra_session_identity() from public, anon, authenticated;

-- ---------------------------------------------------------------- the sign-in rules

create function public.entra_sign_in_check() returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_id    jsonb;
  v_tid   text;
  v_oid   text;
  v_sid   uuid := app.jwt_session_id();
  v_ms    record;
  v_bound text;
  v_have  app.member_identities%rowtype;
  v_new   int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  v_id := app.entra_identity();
  if not (v_id ->> 'session')::boolean then
    -- not a Microsoft sign-in: none of this applies
    return jsonb_build_object('ok', true, 'microsoft', false);
  end if;

  -- 4. platform admins sign in with a password and a second factor only (D-90)
  if exists (select 1 from app.platform_admins a where a.user_id = v_uid and a.active) then
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
  if not exists (select 1 from app.memberships m where m.user_id = v_uid and m.active) then
    return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'no_membership');
  end if;

  -- every active membership must pass before anything is bound
  for v_ms in select m.id, m.org_id from app.memberships m where m.user_id = v_uid and m.active loop
    -- 2. the organisation's tenant
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
      -- a first binding needs Microsoft's word that the address is the account's own (see head)
      return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'email_unverified');
    end if;
  end loop;

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
revoke all on function public.entra_sign_in_check() from public, anon;
grant execute on function public.entra_sign_in_check() to authenticated;

-- ---------------------------------------------------------------- what the Integrasjoner screens show

create function public.entra_status(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_t    app.entra_tenants%rowtype;
  v_ms   jsonb := app.entra_session_identity();
  v_dl   boolean := app.has_role(p_org, array['daglig_leder']::app.org_role[]);
  v_last jsonb;
begin
  if not app.is_org_member(p_org) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into v_t from app.entra_tenants t where t.org_id = p_org;
  if v_dl then
    select jsonb_build_object('event', e.event, 'happened_at', e.happened_at) into v_last
    from app.entra_tenant_log e where e.org_id = p_org order by e.happened_at desc, e.id desc limit 1;
  end if;
  return jsonb_build_object(
    'ok', true,
    'bound', v_t.org_id is not null,
    'tenant_id', v_t.tenant_id,
    'bound_at', v_t.bound_at,
    'daglig_leder', v_dl,
    'microsoft', v_ms is not null,
    'own_tenant', v_ms ->> 'tid',
    'me_bound_at', (select mi.bound_at from app.member_identities mi join app.memberships m on m.id = mi.membership_id
                    where m.org_id = p_org and m.user_id = auth.uid() and m.active),
    'last_event', v_last);
end $fn$;
revoke all on function public.entra_status(uuid) from public, anon;
grant execute on function public.entra_status(uuid) to authenticated;

-- ---------------------------------------------------------------- binding the tenant

create function public.entra_bind_start(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_ms    jsonb;
  v_nonce text;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  v_ms := app.entra_session_identity();
  if v_ms is null then return jsonb_build_object('ok', false, 'error', 'not_microsoft'); end if;
  if exists (select 1 from app.entra_tenants t where t.org_id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'already_bound');
  end if;
  if exists (select 1 from app.entra_tenants t where t.tenant_id = v_ms ->> 'tid') then
    return jsonb_build_object('ok', false, 'error', 'tenant_taken');
  end if;

  -- one outstanding nonce per person and organisation; spent and stale ones go
  delete from app.entra_bind_nonces n
  where (n.org_id = p_org and n.user_id = auth.uid()) or n.expires_at < now() - interval '1 day';

  v_nonce := encode(extensions.gen_random_bytes(32), 'hex');
  insert into app.entra_bind_nonces (nonce_sha256, org_id, user_id, session_id, tenant_id, expires_at)
  values (encode(extensions.digest(v_nonce, 'sha256'), 'hex'), p_org, auth.uid(), app.jwt_session_id(),
          v_ms ->> 'tid', now() + interval '15 minutes');
  -- the plaintext leaves once, as the consent request's state; only its digest is kept
  return jsonb_build_object('ok', true, 'nonce', v_nonce, 'tenant', v_ms ->> 'tid');
end $fn$;
revoke all on function public.entra_bind_start(uuid) from public, anon;
grant execute on function public.entra_bind_start(uuid) to authenticated;

/*
 * Microsoft's admin-consent answer, as the callback received it: `state`, `tenant`,
 * `admin_consent` and `error` (its description is never passed in). The nonce is spent on the
 * first call whatever the outcome.
 */
create function public.entra_bind_complete(p_state text, p_tenant text, p_admin_consent text, p_error text)
  returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n      app.entra_bind_nonces%rowtype;
  v_ms     jsonb;
  v_tenant text := lower(btrim(coalesce(p_tenant, '')));
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if coalesce(p_state, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'nonce_invalid'); end if;

  select * into v_n from app.entra_bind_nonces n
  where n.nonce_sha256 = encode(extensions.digest(p_state, 'sha256'), 'hex') and n.user_id = auth.uid()
  for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'nonce_invalid'); end if;
  if v_n.used_at is not null then return jsonb_build_object('ok', false, 'error', 'nonce_used'); end if;
  if v_n.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'nonce_expired'); end if;
  update app.entra_bind_nonces set used_at = now() where nonce_sha256 = v_n.nonce_sha256;

  if not app.has_role(v_n.org_id, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  v_ms := app.entra_session_identity();
  if v_ms is null or v_n.session_id is distinct from app.jwt_session_id() then
    return jsonb_build_object('ok', false, 'error', 'not_microsoft');
  end if;
  if p_error is not null or lower(coalesce(p_admin_consent, '')) <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'consent_refused');
  end if;
  -- never the tenant parameter alone: it must be the tenant of the caller's own Microsoft identity
  if v_tenant <> (v_ms ->> 'tid') or v_tenant <> v_n.tenant_id then
    return jsonb_build_object('ok', false, 'error', 'tenant_mismatch');
  end if;
  if exists (select 1 from app.entra_tenants t where t.org_id = v_n.org_id) then
    return jsonb_build_object('ok', false, 'error', 'already_bound');
  end if;
  if exists (select 1 from app.entra_tenants t where t.tenant_id = v_tenant) then
    return jsonb_build_object('ok', false, 'error', 'tenant_taken');
  end if;

  begin
    insert into app.entra_tenants (org_id, tenant_id, bound_by) values (v_n.org_id, v_tenant, auth.uid());
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'tenant_taken');
  end;
  insert into app.entra_tenant_log (org_id, tenant_id, event, actor) values (v_n.org_id, v_tenant, 'bound', auth.uid());
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.entra_bind_complete(text, text, text, text) from public, anon;
grant execute on function public.entra_bind_complete(text, text, text, text) to authenticated;

create function public.entra_unbind(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_tenant text;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  delete from app.entra_tenants t where t.org_id = p_org returning t.tenant_id into v_tenant;
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'not_bound'); end if;
  insert into app.entra_tenant_log (org_id, tenant_id, event, actor) values (p_org, v_tenant, 'unbound', auth.uid());
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.entra_unbind(uuid) from public, anon;
grant execute on function public.entra_unbind(uuid) to authenticated;
