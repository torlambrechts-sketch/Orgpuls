-- 0029_member_lock.sql — an organisation whose membership nobody may change.
--
-- The demo organisation (Demobedriften AS, `scripts/seed/demo-org.mjs`) is signed into by
-- everybody given the demo credentials, as its one daglig leder. With 0028 any of them
-- could invite a second daglig leder — themselves — accept, and then deactivate the demo
-- account: the last-daglig-leder rule would no longer protect it, and every other
-- evaluator would be locked out.
--
-- So an organisation can be listed here, and a listed organisation issues no invitations.
-- Nothing else is needed: without an invitation nobody new can become a member, and the
-- last-daglig-leder rule already keeps the one there is.
--
-- The list is a table, not a column on `app.organizations`, because the daglig leder holds
-- a table-wide UPDATE grant there (0001) and could simply clear a column. This table has
-- RLS enabled, no policy and no grant: no client role can read or change it, the same
-- default-deny as the answer tables. Only the seed writes it.

create table app.member_locks (
  org_id uuid primary key references app.organizations (id) on delete cascade
);
alter table app.member_locks enable row level security;
revoke all on app.member_locks from anon, authenticated;

create or replace function public.invite_member(p_org uuid, p_email text, p_role text, p_group uuid default null)
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
  if exists (select 1 from app.member_locks l where l.org_id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'locked');
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

-- is this organisation's membership locked? For the daglig leder's own screen only.
create function public.members_locked(p_org uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select app.has_role(p_org, array['daglig_leder']::app.org_role[])
     and exists (select 1 from app.member_locks l where l.org_id = p_org)
$fn$;

revoke all on function public.members_locked(uuid) from public, anon;
grant execute on function public.members_locked(uuid) to authenticated;
