-- 0118 — Customers: an account owner per organisation, and the list the design draws (X-095, phase 3)
--
-- The design gives every customer an owner: the person on the Orgpuls team who looks after it. It
-- is an internal fact, so it is kept apart from app.organizations, which the customer's own members
-- read: app.account_owners has RLS on, no policy and no client privilege, and is reached only
-- through the admin functions below.
--
--   admin_set_account_owner(org, owner)  super-admin and support; the owner is an active platform
--                                        admin, or null to clear; written to the audit log
--   admin_org_owner(org)                 the owner, and whom it may be set to (for those who may)
--   admin_org_list(search, status)       as 0049, plus owner, the primary contact's name and the
--                                        cancellation dates, so the list can say Cancelling and Churned

create table app.account_owners (
  org_id  uuid primary key references app.organizations(id) on delete cascade,
  user_id uuid not null references app.platform_admins(user_id) on delete cascade,
  set_by  uuid,
  set_at  timestamptz not null default now()
);
alter table app.account_owners enable row level security;
revoke all on app.account_owners from public, anon, authenticated;
create index account_owners_user on app.account_owners (user_id);

create function public.admin_set_account_owner(p_org uuid, p_owner uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_email text;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.organizations where id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_owner is null then
    delete from app.account_owners where org_id = p_org;
  else
    select u.email::text into v_email
    from app.platform_admins a join auth.users u on u.id = a.user_id
    where a.user_id = p_owner and a.active;
    if v_email is null then
      return jsonb_build_object('ok', false, 'error', 'not_admin');
    end if;
    insert into app.account_owners (org_id, user_id, set_by) values (p_org, p_owner, auth.uid())
    on conflict (org_id) do update set user_id = excluded.user_id, set_by = excluded.set_by, set_at = now();
  end if;
  perform app.admin_log('org.owner', p_org, 'organization', p_org::text, null, jsonb_build_object('owner', v_email));
  return jsonb_build_object('ok', true);
end $fn$;

create function public.admin_org_owner(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_role app.platform_role := app.admin_role();
begin
  if v_role is null or v_role not in ('super_admin', 'support', 'finance') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'owner', (select jsonb_build_object('id', o.user_id, 'email', u.email, 'set_at', o.set_at)
              from app.account_owners o join auth.users u on u.id = o.user_id where o.org_id = p_org),
    'can_set', v_role in ('super_admin', 'support'),
    'candidates', case when v_role in ('super_admin', 'support') then (
      select coalesce(jsonb_agg(jsonb_build_object('id', a.user_id, 'email', u.email, 'role', a.role) order by u.email), '[]')
      from app.platform_admins a join auth.users u on u.id = a.user_id where a.active) else '[]'::jsonb end);
end $fn$;

create or replace function public.admin_org_list(p_search text default null, p_status text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_rows jsonb;
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('orgs.list', null, null, null, null,
    jsonb_strip_nulls(jsonb_build_object('search', v_q, 'status', p_status)));

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') into v_rows
  from (
    select o.id, o.name, o.org_number, o.employee_count, o.created_at,
           app.org_status(o.id) as status,
           b.plan, b.trial_ends_at, b.confirmed_at,
           case when b.confirmed_at is not null then app.plan_monthly_nok(b.plan) end as mrr,
           b.cancelled_at, b.cancel_effective_at,
           (select count(*) from app.employees e where e.org_id = o.id and e.active) as registered,
           (select count(*) from app.memberships m where m.org_id = o.id and m.active) as users,
           (select max(i.sent_at) from app.invitations i where i.org_id = o.id) as last_sent,
           last.invited as last_invited, last.answered as last_answered,
           ow.user_id as owner_id, ou.email::text as owner_email,
           (select nullif(btrim(p.full_name), '') from app.memberships m join app.profiles p on p.id = m.user_id
            where m.org_id = o.id and m.active and m.role = 'daglig_leder' order by m.created_at limit 1) as contact_name,
           app.is_demo(o.id) as demo
    from app.organizations o
    join app.billing b on b.org_id = o.id
    left join app.account_owners ow on ow.org_id = o.id
    left join auth.users ou on ou.id = ow.user_id
    left join lateral (
      select count(*) as invited, count(i.responded_at) as answered
      from app.invitations i
      where i.round_id = (select r.id from app.rounds r where r.org_id = o.id and r.status = 'lukket'
                          order by r.closes_at desc nulls last limit 1)
    ) last on true
    where (v_q is null
           or o.name ilike '%' || v_q || '%'
           or o.org_number = regexp_replace(v_q, '\s', '', 'g')
           or exists (select 1 from app.memberships m join auth.users u on u.id = m.user_id
                      where m.org_id = o.id and u.email ilike '%' || v_q || '%'))
      and (p_status is null or app.org_status(o.id) = p_status)
  ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end $fn$;

revoke all on function public.admin_set_account_owner(uuid, uuid) from public, anon;
revoke all on function public.admin_org_owner(uuid) from public, anon;
grant execute on function public.admin_set_account_owner(uuid, uuid) to authenticated;
grant execute on function public.admin_org_owner(uuid) to authenticated;

-- a demo sandbox is not a customer: it has no owner, and nothing of the template's is copied
insert into app.demo_copy_plan (table_name, step, mode, via, note)
values ('account_owners', null, 'skip', null, 'an internal fact about a customer; a sandbox has no owner');
