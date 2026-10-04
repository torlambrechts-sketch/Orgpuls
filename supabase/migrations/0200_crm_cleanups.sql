-- 0200 — Phase A clean-ups, the database part (WP-0.8; D-215)
--
-- DEC-31: the campaign, list, segment, sender and template readers return what the caller's permission set allows in
-- the campaigns area (`may`, as the companies and contacts readers have since 0196), so their pages leave out what the
-- database would refuse instead of offering it by role. The senders reader also says whether the caller holds the
-- CRM's settings, which a sender is.
--
-- The campaigns reader returns the product's own lifecycle mails as well: whether the sequence is on
-- (app.lifecycle_settings) and how many of each step it sent in the last 30 days (app.lifecycle_mail), so the
-- campaigns page's lifecycle rows show that, not a «Built in» no data ever said (06-QUESTIONS § E; CLAUDE.md, «Never
-- fabricate data in the UI»). Counts only: no organisation or person is named.
--
-- No table, column or function is added; six readers gain keys, in place.

-- ------------------------------------------------------------------------------------------ the existing calls
CREATE OR REPLACE FUNCTION public.admin_crm_campaigns()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.campaigns');
  return jsonb_build_object('ok', true,
    -- 0200: what the caller's permission set allows in the campaigns area (DEC-31), and the product's own lifecycle
    -- mails: whether the sequence is on, and what each step sent in the last 30 days
    'may', app.crm_may('campaigns'),
    'lifecycle', jsonb_build_object('enabled', (select s.enabled from app.lifecycle_settings s),
      'sent_30d', (select coalesce(jsonb_object_agg(x.step, x.n), '{}') from (select m.step, count(*) as n from app.lifecycle_mail m
                   where m.status = 'sent' and m.sent_at > now() - interval '30 days' group by m.step) x)),
    'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'name', c.name, 'kind', c.kind, 'status', c.status,
      'subject', c.subject, 'segment', g.name, 'list', l.name_no, 'ab', btrim(c.subject_b) <> '', 'ab_winner', c.ab_winner,
      'scheduled_at', c.scheduled_at, 'finished_at', c.finished_at, 'audience', c.audience, 'utm_campaign', c.utm_campaign,
      'publish_web', c.publish_web, 'slug', c.slug, 'stats', app.crm_campaign_stats(c.id), 'step_kind', c.step_kind,
      'signups', (select count(*) from app.org_attribution a where c.utm_campaign in (a.first_campaign, a.last_campaign)))
      order by c.created_at desc), '[]')
    from app.crm_campaigns c left join app.crm_segments g on g.id = c.segment_id left join app.crm_lists l on l.id = c.list_id));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_campaigns;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.campaign', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true,
    -- 0200: what the caller's permission set allows in the campaigns area (DEC-31)
    'may', app.crm_may('campaigns'),
    'campaign', to_jsonb(v_c) - 'product_id' - 'created_by',
    'stats', app.crm_campaign_stats(p_id),
    'variants', (select coalesce(jsonb_agg(v order by v.variant), '[]') from (
        select s.variant, count(*) filter (where s.status = 'sent') as sent,
               count(*) filter (where s.opened_at is not null) as opened, count(*) filter (where s.clicked_at is not null) as clicked
        from app.crm_sends s where s.campaign_id = p_id and s.kind = 'campaign' and s.variant is not null group by s.variant) v),
    'links', (select coalesce(jsonb_agg(l order by l.unique_clicks desc), '[]') from (
        select k.url, k.content, count(distinct k.send_id) as unique_clicks, sum(k.clicks) as clicks
        from app.crm_clicks k join app.crm_sends s on s.id = k.send_id where s.campaign_id = p_id group by k.url, k.content limit 50) l),
    'timeline', (select coalesce(jsonb_agg(t order by t.hour), '[]') from (
        select h.hour,
               (select count(*) from app.crm_sends s where s.campaign_id = p_id and s.opened_at >= v_c.started_at + make_interval(hours => h.hour)
                  and s.opened_at < v_c.started_at + make_interval(hours => h.hour + 1)) as opened,
               (select count(*) from app.crm_sends s where s.campaign_id = p_id and s.clicked_at >= v_c.started_at + make_interval(hours => h.hour)
                  and s.clicked_at < v_c.started_at + make_interval(hours => h.hour + 1)) as clicked
        from generate_series(0, 71) h(hour) where v_c.started_at is not null) t),
    'benchmark', (select jsonb_build_object(
        'campaigns', count(distinct c.id),
        'open_rate', round(avg((s.opened_at is not null)::int) * 100, 1),
        'click_rate', round(avg((s.clicked_at is not null)::int) * 100, 1),
        'unsubscribe_rate', round(avg((s.unsubscribed_at is not null)::int) * 100, 2))
      from (select id from app.crm_campaigns where status = 'sent' and id <> p_id order by finished_at desc limit 10) c
      join app.crm_sends s on s.campaign_id = c.id and s.kind = 'campaign' and s.status = 'sent'),
    'web', jsonb_build_object(
      'sessions', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.utm_campaign = v_c.utm_campaign),
      'views', (select count(*) from app.web_events e where e.utm_campaign = v_c.utm_campaign and e.kind = 'view'),
      'signups', (select count(*) from app.org_attribution a where v_c.utm_campaign in (a.first_campaign, a.last_campaign)),
      'paid', (select count(*) from app.org_attribution a join app.billing b on b.org_id = a.org_id
               where v_c.utm_campaign in (a.first_campaign, a.last_campaign) and b.confirmed_at is not null)),
    'tests', (select count(*) from app.crm_sends s where s.campaign_id = p_id and s.kind = 'test'),
    'list', (select jsonb_build_object('id', l.id, 'name', l.name_no) from app.crm_lists l where l.id = v_c.list_id));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_lists()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.lists');
  return jsonb_build_object('ok', true,
    -- 0200: what the caller's permission set allows in the campaigns area (DEC-31)
    'may', app.crm_may('campaigns'),
    'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'key', l.key, 'name_no', l.name_no, 'name_en', l.name_en,
      'description_no', l.description_no, 'description_en', l.description_en, 'public', l.public, 'archived', l.archived_at is not null,
      'subscribed', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.status = 'subscribed'),
      'pending', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.status = 'pending'),
      'unsubscribed', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.status = 'unsubscribed'),
      'joined_30d', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.subscribed_at > now() - interval '30 days'),
      'left_30d', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.unsubscribed_at > now() - interval '30 days'),
      'campaigns', (select count(*) from app.crm_campaigns c where c.list_id = l.id and c.status in ('sending', 'sent')),
      'open_rate', (select round(avg((s.opened_at is not null)::int) * 100, 1) from app.crm_sends s join app.crm_campaigns c on c.id = s.campaign_id
                    where c.list_id = l.id and s.kind = 'campaign' and s.status = 'sent'),
      'click_rate', (select round(avg((s.clicked_at is not null)::int) * 100, 1) from app.crm_sends s join app.crm_campaigns c on c.id = s.campaign_id
                     where c.list_id = l.id and s.kind = 'campaign' and s.status = 'sent')) order by l.sort, l.name_no), '[]')
    from app.crm_lists l));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_segments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.segments');
  return jsonb_build_object('ok', true,
    -- 0200: what the caller's permission set allows in the campaigns area (DEC-31)
    'may', app.crm_may('campaigns'),
    'rows', (
    -- 0197: a condition on a field hidden from the viewer is not shown; the segment says it holds one
    select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'filter', app.crm_filter_out(g.filter),
      'hidden_conditions', not app.crm_conditions_visible('contact', g.filter -> 'custom'), 'updated_at', g.updated_at,
      'total', (select count(*) from app.crm_segment_contacts(g.filter)),
      'mailable', (select count(*) from app.crm_segment_contacts(g.filter) c where app.crm_mailable(c))) order by g.name), '[]')
    from app.crm_segments g));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_templates()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.templates');
  return jsonb_build_object('ok', true,
    -- 0200: what the caller's permission set allows in the campaigns area (DEC-31)
    'may', app.crm_may('campaigns'),
    'rows', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort), '[]') from app.crm_templates t));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_senders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.senders');
  return jsonb_build_object('ok', true,
    -- 0200: what the caller's permission set allows in the campaigns area (DEC-31); a sender is one of the CRM's settings
    'may', app.crm_may('campaigns'),
    'may_settings', app.crm_can('global.settings'),
    'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'reply_to', p.reply_to,
             'signature', p.signature, 'archived', p.archived_at is not null,
             'campaigns', (select count(*) from app.crm_campaigns c where c.sender_id = p.id)) order by p.archived_at nulls first, p.name), '[]')
    from app.crm_senders p));
end $function$;
