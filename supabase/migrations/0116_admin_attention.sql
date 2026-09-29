-- 0116 — «Needs attention» on Sentral's dashboard (X-095, phase 2)
--
-- What an admin should do next, from what the database already knows, each item for the roles
-- whose pages it leads to:
--   trials        a trial ending within 7 days that is not confirmed      (every admin role)
--   deletions     a cancelled organisation deleted within 14 days         (super_admin, support, finance)
--   tickets       an open ticket past its first-reply time                (super_admin, support)
--   failures      mail or SMS that failed in the last 24 hours            (super_admin, support)
--   tasks         a CRM task past its due time                            (CRM readers)
-- Demo sandboxes are left out. Nothing here names a respondent or holds an answer: organisations,
-- tickets and tasks are the admin's own records.

create function public.admin_attention() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_role app.platform_role := app.admin_role();
  v_support boolean;
  v_finance boolean;
begin
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  v_support := v_role in ('super_admin', 'support');
  v_finance := v_role in ('super_admin', 'support', 'finance');
  return jsonb_build_object('ok', true,
    'trials', (
      select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'ends_at', b.trial_ends_at,
               'employees', (select count(*) from app.employees e where e.org_id = o.id and e.active))
             order by b.trial_ends_at), '[]')
      from app.billing b join app.organizations o on o.id = b.org_id
      where not app.is_demo(o.id) and b.confirmed_at is null and b.cancelled_at is null
        and b.trial_ends_at > now() and b.trial_ends_at <= now() + interval '7 days'),
    'deletions', case when v_finance then (
      select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'due_at', b.deletion_due_at) order by b.deletion_due_at), '[]')
      from app.billing b join app.organizations o on o.id = b.org_id
      where not app.is_demo(o.id) and b.deletion_due_at is not null and b.deletion_due_at <= now() + interval '14 days') else '[]'::jsonb end,
    'tickets', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'org_name', coalesce(o.name, t.requester_org),
               'due_at', t.first_response_due) order by t.first_response_due), '[]')
      from app.tickets t left join app.organizations o on o.id = t.org_id
      where t.status not in ('resolved', 'closed') and t.first_responded_at is null and t.first_response_due < now()) else '[]'::jsonb end,
    'failures', case when v_support then (
      select count(*) from app.outbox x where x.failed_at > now() - interval '24 hours') else 0 end,
    'tasks', case when app.crm_can_read() then (
      select count(*) from app.crm_activities a where a.kind = 'task' and a.done_at is null and a.due_at < now()) else 0 end);
end $fn$;

revoke all on function public.admin_attention() from public, anon;
grant execute on function public.admin_attention() to authenticated;
