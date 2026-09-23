-- 0028_members.sql — who may use the product, and how somebody new is let in.
--
-- Until now the only way a membership came into existence was `create_organisation` (0024)
-- for the person who signed up, and a direct INSERT that `membership_admin_insert` allowed
-- any daglig leder to make — for any `user_id`. Nothing in the product used that insert,
-- and it was dangerous: a daglig leder who learned somebody's user id could put them into
-- a second organisation, and a second active membership makes `getCurrentOrgId` refuse to
-- pick one, so that person could no longer use the product at all (review Q3). The Roller
-- tab printed the access matrix and nothing could grant a row of it (X-020).
--
-- This migration makes membership a thing that is *given by invitation and accepted by the
-- person it is for*, and edited only through functions that hold the rules:
--
-- 1. **No client writes to `app.memberships`.** The three admin policies go, and so does
--    the table grant. Every change is a SECURITY DEFINER function below, which is where the
--    rules live — the same shape as `create_organisation`, and for the same reason: a rule
--    that spans rows ("the last daglig leder") cannot be an RLS expression.
--
-- 2. **An invitation is a capability, stored as a digest.** 32 random bytes, returned once
--    as hex to the daglig leder who made it, stored only as SHA-256 — the respondent
--    token's rule (invariant 3). It names an e-mail address, a role and, for an
--    avdelingsleder, the department they lead. It expires after 14 days and is spent on
--    acceptance. Nothing sends it: there is no mail dispatcher (D-29), so the daglig leder
--    copies the link.
--
-- 3. **Only the invited address may accept.** The accepting account's e-mail must equal
--    the invitation's. This is defence in depth, not proof of mailbox ownership: hosted
--    Auth auto-confirms sign-ups, so the link itself is the secret that matters.
--
-- 4. **One organisation per account**, as 0024 enforces at sign-up: an account with an
--    active membership elsewhere cannot accept.
--
-- 5. **An organisation always keeps a daglig leder.** Demoting or deactivating the last
--    active one is refused, because nobody could then manage the organisation again.
--
-- The functions return `{ok, error}` verdicts, as `create_organisation` and the Samtaler
-- RPCs do, so the application reports a refusal instead of mistaking it for success.

-- ------------------------------------------------------------------ 1. memberships
drop policy membership_admin_insert on app.memberships;
drop policy membership_admin_update on app.memberships;
drop policy membership_admin_delete on app.memberships;
revoke insert, update, delete on app.memberships from authenticated;

-- ------------------------------------------------------------------ 2. invitations
create table app.member_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references app.organizations (id) on delete cascade,
  email       text not null
    check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 320),
  role        app.org_role not null,
  -- cascade, not set null: an invitation to lead a department that no longer exists has
  -- nothing left to offer, and a set-null would collide with the check below and make the
  -- department impossible to delete (CLAUDE.md, "referential maintenance")
  group_id    uuid references app.groups (id) on delete cascade,
  token_hash  bytea not null unique,
  created_by  uuid references app.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references app.profiles (id) on delete set null,
  check ((role = 'avdelingsleder') = (group_id is not null))
);

comment on table app.member_invites is
  'An offer of a membership, redeemable once by the named address. The token is stored only as its SHA-256 digest.';

-- one open invitation per address and organisation; a new one replaces it
create unique index member_invites_open on app.member_invites (org_id, email) where accepted_at is null;

alter table app.member_invites enable row level security;

create policy member_invite_read on app.member_invites for select to authenticated
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

-- the digest is not readable even by the daglig leder: nothing needs it but the functions
grant select (id, org_id, email, role, group_id, created_at, expires_at, accepted_at)
  on app.member_invites to authenticated;

-- ------------------------------------------------------------------ 3. functions

/*
 * The organisation's people with access, for the daglig leder who manages them. Names come
 * from profiles and addresses from Auth, neither of which a member can read about anybody
 * else directly — that is the reason this is a function.
 */
create function public.org_members(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  return jsonb_build_object('ok', true, 'members', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id,
             'name', p.full_name,
             'email', u.email,
             'role', m.role,
             'group_id', m.group_id,
             'active', m.active,
             'is_self', m.user_id = auth.uid())
           order by m.active desc, m.role, lower(coalesce(p.full_name, u.email)))
    from app.memberships m
    join app.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.org_id = p_org), '[]'::jsonb));
end $fn$;

create function public.invite_member(p_org uuid, p_email text, p_role text, p_group uuid default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user  uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role  app.org_role;
  v_group uuid := p_group;
  v_token text;
  v_exp   timestamptz := now() + interval '14 days';
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if p_role is null or p_role not in ('daglig_leder', 'avdelingsleder', 'verneombud') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  v_role := p_role::app.org_role;

  if v_role = 'avdelingsleder' then
    if v_group is null or not exists (
      select 1 from app.groups g where g.id = v_group and g.org_id = p_org
    ) then
      return jsonb_build_object('ok', false, 'error', 'invalid_group');
    end if;
  else
    v_group := null;
  end if;

  if exists (
    select 1 from app.memberships m join auth.users u on u.id = m.user_id
    where m.org_id = p_org and m.active and lower(u.email) = v_email
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;

  -- a new invitation replaces an open one: the old link stops working
  delete from app.member_invites i
  where i.org_id = p_org and i.email = v_email and i.accepted_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into app.member_invites (org_id, email, role, group_id, token_hash, created_by, expires_at)
  values (p_org, v_email, v_role, v_group, extensions.digest(v_token, 'sha256'), v_user, v_exp);

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_exp);
end $fn$;

create function public.revoke_invite(p_invite uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_org uuid;
begin
  select i.org_id into v_org from app.member_invites i where i.id = p_invite and i.accepted_at is null;
  -- one answer for "no such invitation" and "not yours", so ids cannot be probed
  if v_org is null or not app.has_role(v_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  delete from app.member_invites i where i.id = p_invite;
  return jsonb_build_object('ok', true);
end $fn$;

/*
 * What an invitation offers, for the page its link opens. The token is the capability, so
 * a holder may see the organisation's name, the role, and the address it is for — which
 * they need, to know which account to use. Nothing else.
 */
create function public.invite_preview(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare r record;
begin
  select i.email, i.role, i.expires_at, i.accepted_at, o.name as org_name, g.name as group_name
  into r
  from app.member_invites i
  join app.organizations o on o.id = i.org_id
  left join app.groups g on g.id = i.group_id
  where i.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'org_name', r.org_name,
    'role', r.role,
    'group_name', r.group_name,
    'email', r.email,
    'state', case when r.accepted_at is not null then 'accepted'
                  when r.expires_at <= now() then 'expired'
                  else 'open' end);
end $fn$;

create function public.accept_invite(p_token text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user  uuid := auth.uid();
  v_email text;
  r       app.member_invites%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select * into r from app.member_invites i
  where i.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;
  if r.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  if v_email is distinct from r.email then
    return jsonb_build_object('ok', false, 'error', 'wrong_account');
  end if;

  if exists (
    select 1 from app.memberships m
    where m.user_id = v_user and m.active and m.org_id <> r.org_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'other_organisation');
  end if;

  insert into app.profiles (id) values (v_user) on conflict (id) do nothing;

  insert into app.memberships (org_id, user_id, role, active, group_id)
  values (r.org_id, v_user, r.role, true, r.group_id)
  on conflict (org_id, user_id) do update set
    role = excluded.role, group_id = excluded.group_id, active = true;

  update app.member_invites set accepted_at = now(), accepted_by = v_user where id = r.id;

  return jsonb_build_object('ok', true);
end $fn$;

/*
 * Change a membership: its role, the department an avdelingsleder leads, or whether it is
 * active. Deactivating rather than deleting keeps the record that somebody had access.
 */
create function public.set_member(p_membership uuid, p_role text, p_group uuid, p_active boolean)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  m       app.memberships%rowtype;
  v_role  app.org_role;
  v_group uuid := p_group;
begin
  select * into m from app.memberships where id = p_membership for update;
  if not found or not app.has_role(m.org_id, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_role is null or p_role not in ('daglig_leder', 'avdelingsleder', 'verneombud') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  v_role := p_role::app.org_role;

  if v_role = 'avdelingsleder' then
    if v_group is null or not exists (
      select 1 from app.groups g where g.id = v_group and g.org_id = m.org_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'invalid_group');
    end if;
  else
    v_group := null;
  end if;

  if m.role = 'daglig_leder' and m.active
     and (v_role <> 'daglig_leder' or not coalesce(p_active, true))
     and not exists (
       select 1 from app.memberships o
       where o.org_id = m.org_id and o.id <> m.id and o.active and o.role = 'daglig_leder'
     ) then
    return jsonb_build_object('ok', false, 'error', 'last_daglig_leder');
  end if;

  update app.memberships
  set role = v_role, group_id = v_group, active = coalesce(p_active, true)
  where id = m.id;

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.org_members(uuid) from public, anon;
revoke all on function public.invite_member(uuid, text, text, uuid) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
revoke all on function public.set_member(uuid, text, uuid, boolean) from public, anon;
revoke all on function public.invite_preview(text) from public;

grant execute on function public.org_members(uuid) to authenticated;
grant execute on function public.invite_member(uuid, text, text, uuid) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.set_member(uuid, text, uuid, boolean) to authenticated;
-- the invitation page is opened before the invitee has an account
grant execute on function public.invite_preview(text) to anon, authenticated;
