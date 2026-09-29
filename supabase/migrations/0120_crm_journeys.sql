-- 0120 — Journeys: the CRM's follow-up chains read as the design's journeys (X-095, CRM II)
--
-- The design's journey enrols contacts on a stage, sends them a chain of mails with waits between,
-- and ends when a goal is met. Orgpuls has that already (0093, 0111): a first campaign aimed at a
-- stage, follow-ups that send themselves N days later to those who have not answered, clicked or
-- opened, and exits for a reply, an unsubscribe, a bounce, and a company that moved on. This reads
-- each chain as a journey; it adds no engine and stores nothing.
--
--   journey      a first campaign (follows no other) aimed at a stage, or followed by others
--   status       active while any mail in it is scheduled or sending; draft while its first is;
--                done when all went; cancelled when its first was
--   reached      contacts its first mail reached
--   in_journey   contacts an automatic follow-up is still waiting to reach (0111's audience)
--   completed    contacts its last mail reached
--   moved        companies it reached whose stage is now further on than where the chain put them
--                (the stage the first mail moved them to, else the stage it was aimed at): the goal
--   replied      companies it reached that answered after the first mail

create function public.admin_crm_journeys() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    with recursive roots as (
      select r.* from app.crm_campaigns r
      where r.follows_id is null
        and (r.stage_target is not null or exists (select 1 from app.crm_campaigns f where f.follows_id = r.id))
    ), chain as (
      select r.id as root, r.id, 1 as step from roots r
      union all
      select chain.root, c.id, chain.step + 1 from app.crm_campaigns c join chain on c.follows_id = chain.id where chain.step < 20
    ), steps as (
      select ch.root, ch.step, c.* from chain ch join app.crm_campaigns c on c.id = ch.id
    ), per as (
      select r.id, r.number, r.name, r.status as first_status, r.stage_target, r.stage_on_send, r.created_at,
        (select count(*) from steps s where s.root = r.id) as mails,
        (select bool_or(s.status in ('scheduled', 'sending')) from steps s where s.root = r.id) as running,
        (select bool_and(s.status in ('sent', 'cancelled')) from steps s where s.root = r.id) as finished,
        (select s.id from steps s where s.root = r.id order by s.step desc limit 1) as last_id,
        (select min(x.sent_at) from app.crm_sends x where x.campaign_id = r.id and x.kind = 'campaign' and x.status = 'sent') as first_sent
      from roots r
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'number', p.number, 'name', p.name,
      'status', case when p.first_status = 'cancelled' then 'cancelled'
                     when p.running then 'active'
                     when p.first_status = 'draft' then 'draft'
                     when p.finished then 'done' else 'active' end,
      'stage_target', p.stage_target, 'stage_on_send', p.stage_on_send, 'mails', p.mails,
      'reached', (select count(distinct x.contact_id) from app.crm_sends x where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'),
      'in_journey', (select coalesce(sum((select count(*) from app.crm_follow_audience(s2) a
                                           where not exists (select 1 from app.crm_sends x where x.campaign_id = s2.id and x.contact_id = a.contact_id))), 0)
                     from app.crm_campaigns s2 join steps s on s.id = s2.id
                     where s.root = p.id and s2.follow_auto and s2.status in ('scheduled', 'sending')),
      'completed', (select count(distinct x.contact_id) from app.crm_sends x where x.campaign_id = p.last_id and x.kind = 'campaign' and x.status = 'sent'),
      'moved', (select count(distinct co.id) from app.crm_sends x
                join app.crm_contacts c on c.id = x.contact_id join app.crm_companies co on co.id = c.company_id
                join app.crm_stages now_s on now_s.key = co.stage
                join app.crm_stages from_s on from_s.key = coalesce(p.stage_on_send, p.stage_target)
                where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'
                  and now_s.kind in ('open', 'won') and now_s.sort > from_s.sort),
      'replied', (select count(distinct co.id) from app.crm_sends x
                  join app.crm_contacts c on c.id = x.contact_id join app.crm_companies co on co.id = c.company_id
                  where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'
                    and exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= x.sent_at)),
      'first_sent', p.first_sent, 'created_at', p.created_at
    ) order by p.created_at desc), '[]') from per p));
end $fn$;

revoke all on function public.admin_crm_journeys() from public, anon;
grant execute on function public.admin_crm_journeys() to authenticated;

-- ---------------------------------------------------------------- tasks, open and done
-- The design's Tasks page: open tasks by due date, those done in the last 90 days, with the company,
-- the contact they are about, who made them and when they were done. 0056's admin_crm_tasks keeps
-- serving the CRM overview's due list.
create function public.admin_crm_task_list(p_view text default 'open') returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_view, '') not in ('open', 'done', 'all') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  return jsonb_build_object('ok', true,
    'counts', (select jsonb_build_object(
        'open', count(*) filter (where a.done_at is null),
        'done', count(*) filter (where a.done_at > now() - interval '90 days'),
        'all', count(*) filter (where a.done_at is null or a.done_at > now() - interval '90 days'))
      from app.crm_activities a where a.kind = 'task'),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'company_id', a.company_id, 'company', co.name,
        'contact', (select coalesce(nullif(btrim(c.name), ''), c.email) from app.crm_contacts c where c.id = a.contact_id),
        'body', a.body, 'due_at', a.due_at, 'done_at', a.done_at, 'created_at', a.created_at, 'admin_email', a.admin_email)
        order by (a.done_at is not null), a.due_at nulls last, a.done_at desc, a.created_at), '[]')
      from app.crm_activities a join app.crm_companies co on co.id = a.company_id
      where a.kind = 'task'
        and case p_view when 'open' then a.done_at is null
                        when 'done' then a.done_at > now() - interval '90 days'
                        else a.done_at is null or a.done_at > now() - interval '90 days' end));
end $fn$;

revoke all on function public.admin_crm_task_list(text) from public, anon;
grant execute on function public.admin_crm_task_list(text) to authenticated;

-- ---------------------------------------------------------------- account health says which rows are demos
-- Lead scoring ranks trials; a demo sandbox (0094) is a trial by its access but never a lead. The
-- health reader now says which rows are demos, so the pages that rank leads can leave them out.
CREATE OR REPLACE FUNCTION public.admin_account_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('health.view');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.score desc, s.created_at desc), '[]') from (
      select f.*,
             f.activation_points + f.recency_points + f.response_points + f.size_points as score,
             (f.access in ('trial', 'grace') and (f.unlocked or (f.sent and coalesce(f.employees, 0) >= 10))) as qualified
      from (
        select a.*,
               10 * ((a.employees_uploaded)::int + (a.scheduled)::int + (a.sent)::int + (a.unlocked)::int + (a.measure)::int) as activation_points,
               case when a.last_sign_in > now() - interval '7 days' then 25
                    when a.last_sign_in > now() - interval '30 days' then 10 else 0 end as recency_points,
               case when a.last_invited > 0 and a.last_answered::numeric / a.last_invited >= 0.6 then 15
                    when a.last_invited > 0 and a.last_answered::numeric / a.last_invited >= 0.4 then 8 else 0 end as response_points,
               case when coalesce(a.employees, 0) >= 20 then 10 when coalesce(a.employees, 0) >= 10 then 5 else 0 end as size_points
        from (
          select o.id, o.name, o.created_at, app.org_access(o.id) as access, b.trial_ends_at, app.is_demo(o.id) as demo,
                 greatest(o.employee_count, o.registry_employees) as employees,
                 exists (select 1 from app.employees e where e.org_id = o.id) as employees_uploaded,
                 exists (select 1 from app.measurements ms where ms.org_id = o.id) as scheduled,
                 exists (select 1 from app.invitations i where i.org_id = o.id and i.sent_at is not null) as sent,
                 app.org_unlocked(o.id) as unlocked,
                 exists (select 1 from app.measures me where me.org_id = o.id) as measure,
                 (select max(u.last_sign_in_at) from app.memberships m join auth.users u on u.id = m.user_id
                  where m.org_id = o.id and m.active) as last_sign_in,
                 last.invited as last_invited, last.answered as last_answered
          from app.organizations o
          join app.billing b on b.org_id = o.id
          left join lateral (
            select count(*) as invited, count(i.responded_at) as answered
            from app.invitations i
            where i.round_id = (select r.id from app.rounds r where r.org_id = o.id and r.status = 'lukket'
                                order by r.closes_at desc nulls last limit 1)
          ) last on true
        ) a
      ) f
    ) s));
end $function$;
