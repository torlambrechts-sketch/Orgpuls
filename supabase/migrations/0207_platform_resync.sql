-- 0207_platform_resync.sql — the platform can ask Orgpuls to tell it everything again (X-106).
--
-- 0205's events describe what changes; an organisation that existed before the platform was connected,
-- or a platform database rebuilt from scratch, has heard none of it. orgs.resync queues, for one
-- organisation or every one, what the triggers would have said: org.created, its billing, its active
-- members and today's usage. It goes through app.platform_emit like every other event, so the kinds'
-- field lists and the demo rule hold, and the platform's projections are upserts, so a resync changes
-- nothing that is already right.

create function app.op_platform_resync(p_org uuid default null) returns int
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare r record; n int := 0;
begin
  if app.admin_role() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for r in select o.* from app.organizations o where (p_org is null or o.id = p_org) and not app.is_demo(o.id) order by o.created_at loop
    perform app.platform_emit('org.created', r.id, jsonb_build_object(
      'name', r.name, 'org_number', r.org_number, 'employee_count', r.employee_count,
      'industry', r.industry_key, 'created_at', r.created_at));
    n := n + 1;
    perform app.platform_emit('billing.changed', b.org_id, jsonb_build_object(
      'plan', b.plan, 'billing_interval', b.billing_interval, 'trial_started_at', b.trial_started_at,
      'trial_ends_at', b.trial_ends_at, 'confirmed_at', b.confirmed_at, 'free_from', b.free_from,
      'cancelled_at', b.cancelled_at, 'cancel_effective_at', b.cancel_effective_at, 'deletion_due_at', b.deletion_due_at))
    from app.billing b where b.org_id = r.id;
    n := n + (select count(*) from app.billing b where b.org_id = r.id);
    perform app.platform_emit('member.joined', m.org_id, jsonb_build_object(
      'user_id', m.user_id, 'role', m.role, 'email', u.email::text, 'name', p.full_name))
    from app.memberships m join auth.users u on u.id = m.user_id left join app.profiles p on p.id = m.user_id
    where m.org_id = r.id and m.active;
    n := n + (select count(*) from app.memberships m join auth.users u on u.id = m.user_id where m.org_id = r.id and m.active);
    perform app.platform_emit('usage.daily', r.id, jsonb_build_object(
      'employees', (select count(*) from app.employees e where e.org_id = r.id and e.active),
      'members', (select count(*) from app.memberships m where m.org_id = r.id and m.active),
      'rounds_planned', (select count(*) from app.rounds x where x.org_id = r.id and x.status = 'planlagt'),
      'rounds_open', (select count(*) from app.rounds x where x.org_id = r.id and x.status = 'apen'),
      'rounds_closed', (select count(*) from app.rounds x where x.org_id = r.id and x.status = 'lukket'),
      'last_round_closed_at', (select max(x.closes_at) from app.rounds x where x.org_id = r.id and x.status = 'lukket'),
      'last_sign_in_at', (select max(u.last_sign_in_at) from app.memberships m join auth.users u on u.id = m.user_id
                          where m.org_id = r.id and m.active)));
    n := n + 1;
  end loop;
  return n;
end $fn$;
revoke all on function app.op_platform_resync(uuid) from public, anon, authenticated, service_role;
comment on function app.op_platform_resync(uuid) is
  'orgs.resync (0207): queue org.created, billing.changed, member.joined and usage.daily for one organisation or all; returns how many events.';

insert into app.platform_command_map (command, scope, fn, note) values
  ('orgs.resync', 'orgs:read', 'app.op_platform_resync(uuid)', 'tell the platform again what it should know about one organisation, or all');
