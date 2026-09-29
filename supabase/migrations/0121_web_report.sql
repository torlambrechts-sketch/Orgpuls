-- 0121 — Analytics as the Sentral design draws it (X-095, phase 6): overview, pages, goals
--
-- The design's Analytics has three pages. Most of what they show the beacon (0050, 0054, 0059)
-- already counts; this adds what it did not, and one reader that gives the three pages their
-- figures without the per-visit detail admin_web returns.
--
--   device        the kind of device a view came from — desktop, mobile or tablet — read from the
--                 user agent at the moment it is hashed. The user agent itself is still not stored;
--                 the class is coarser than the network (0054) that already is. iPads that call
--                 themselves Macintosh count as desktops.
--   previous      the same figures for the period before, where the events are still kept (400 days)
--   on site       a visit's length: its first event to its last (a one-page visit is 0 s)
--   per page      views; unique visitors (a visitor is a hash per day, so per visitor and day); time
--                 on page, the time to the next view in the same visit, over the views that have
--                 one; exits, the views no other view followed in their visit; entries, the visits
--                 that began there; sign-ups, organisations whose first page it was
--   funnel        visitors → saw /priser → opened /registrer → organisations made (trials) →
--                 organisations that confirmed billing, in the period; demo sandboxes are not counted
--   goals         trials started, demo links asked for, list subscriptions confirmed and messages
--                 through the contact form, each against the period before. Demo requests are kept
--                 30 days (0094), so their count and comparison are given only where they reach.

alter table app.web_events add column device text check (device in ('desktop', 'mobile', 'tablet'));

create function app.web_device(p_ua text) returns text
  language sql immutable set search_path = ''
as $fn$
  select case
    when coalesce(btrim(p_ua), '') = '' then null
    when p_ua ~* '(ipad|tablet|kindle|silk/|playbook)' or (p_ua ~* 'android' and p_ua !~* 'mobile') then 'tablet'
    when p_ua ~* '(mobi|iphone|ipod|android|blackberry|opera mini|iemobile|windows phone)' then 'mobile'
    else 'desktop'
  end
$fn$;

-- ---------------------------------------------------------------- the beacon's write path, now with the device
create or replace function public.track_web_event(p_ip text, p_ua text, p_kind text, p_path text, p_referrer text, p_utm jsonb, p_label text,
                                                  p_geo jsonb default null)
  returns void
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_path text := app.web_path(p_path);
  v_visitor text;
  v_day date := (now() at time zone 'Europe/Oslo')::date;
  v_country text := upper(nullif(btrim(coalesce(p_geo ->> 'country', '')), ''));
  v_region text := nullif(btrim(coalesce(p_geo ->> 'region', '')), '');
  v_city text := nullif(left(btrim(regexp_replace(coalesce(p_geo ->> 'city', ''), '[[:cntrl:]<>"]', '', 'g')), 80), '');
begin
  if app.web_is_bot(p_ua) or v_path is null or p_kind not in ('view', 'cta') then
    return;
  end if;
  if p_label is not null and p_label !~ '^[a-z0-9_-]{1,40}$' then
    return;
  end if;
  if v_country !~ '^[A-Z]{2}$' then v_country := null; end if;
  if v_region !~ '^[A-Za-z0-9-]{1,10}$' then v_region := null; end if;
  v_visitor := app.web_visitor(left(p_ip, 64), left(p_ua, 400));
  if (select count(*) from app.web_events e where e.visitor = v_visitor and e.day = v_day) >= 300 then
    return;
  end if;
  insert into app.web_events (visitor, kind, path, referrer_host, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
                              label, country, region, city, network, device)
  values (v_visitor, p_kind, v_path, app.web_host(p_referrer),
          app.web_tag(p_utm ->> 'utm_source'), app.web_tag(p_utm ->> 'utm_medium'), app.web_tag(p_utm ->> 'utm_campaign'),
          app.web_tag(p_utm ->> 'utm_term'), app.web_tag(p_utm ->> 'utm_content'),
          p_label, v_country, v_region, v_city, app.web_network(left(p_ip, 64)), app.web_device(left(p_ua, 400)));
end $fn$;

-- ---------------------------------------------------------------- the three pages' reader
create function public.admin_web_report(p_days int default 14) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_days int := least(greatest(coalesce(p_days, 14), 1), 366);
  v_to date := (now() at time zone 'Europe/Oslo')::date;
  v_from date;
  v_pfrom date;
  v_start timestamptz;
  v_pstart timestamptz;
  v_web_prev boolean;
  v_demo_now boolean;
  v_demo_prev boolean;
  v jsonb;
begin
  if app.admin_role() is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  v_from := v_to - (v_days - 1);
  v_pfrom := v_from - v_days;
  v_start := v_from::timestamp at time zone 'Europe/Oslo';
  v_pstart := v_pfrom::timestamp at time zone 'Europe/Oslo';
  v_web_prev := v_pfrom >= v_to - 400;
  v_demo_now := v_start >= now() - interval '30 days';
  v_demo_prev := v_pstart >= now() - interval '30 days';

  with ev as (
    select e.*, case when lag(e.at) over w is null or e.at - lag(e.at) over w > interval '30 minutes' then 1 else 0 end as starts
    from app.web_events e where e.day >= v_from
    window w as (partition by e.visitor, e.day order by e.at, e.id)
  ), numbered as (
    select ev.*, sum(ev.starts) over (partition by ev.visitor, ev.day order by ev.at, ev.id) as sn from ev
  ), sess as (
    select n.visitor, n.day, n.sn, extract(epoch from max(n.at) - min(n.at)) as seconds,
           (array_agg(n.path order by n.at, n.id) filter (where n.kind = 'view'))[1] as landing
    from numbered n group by n.visitor, n.day, n.sn
  ), vw as (
    select n.visitor, n.day, n.path, n.at,
           lead(n.at) over (partition by n.visitor, n.day, n.sn order by n.at, n.id) as next_at
    from numbered n where n.kind = 'view'
  ), orgs as (
    select o.id, o.created_at, a.first_landing
    from app.organizations o left join app.org_attribution a on a.org_id = o.id
    where o.created_at >= v_pstart and not app.is_demo(o.id)
  ), paid as (
    select b.org_id, b.confirmed_at from app.billing b
    where b.confirmed_at >= v_pstart and not app.is_demo(b.org_id)
  ), prev as (
    select count(distinct (e.visitor, e.day)) as visitors from app.web_events e where e.day >= v_pfrom and e.day < v_from
  )
  select jsonb_build_object(
    'ok', true,
    'days', v_days,
    'from', v_from,
    'to', v_to,
    'avg_seconds', (select coalesce(round(avg(sess.seconds)), 0) from sess),
    'previous', case when v_web_prev then (select jsonb_build_object('visitors', prev.visitors) from prev) end,
    'devices', (select coalesce(jsonb_agg(d order by d.visitors desc, d.device), '[]') from (
        select e.device, count(distinct (e.visitor, e.day)) as visitors
        from app.web_events e where e.day >= v_from and e.device is not null group by e.device) d),
    'pages_total', (select count(distinct vw.path) from vw),
    'views_total', (select count(*) from vw),
    'pages', (select coalesce(jsonb_agg(p order by p.views desc, p.path), '[]') from (
        select vw.path, count(*) as views, count(distinct (vw.visitor, vw.day)) as uniq,
               round(avg(extract(epoch from vw.next_at - vw.at)) filter (where vw.next_at is not null)) as seconds,
               count(*) filter (where vw.next_at is null) as exits,
               (select count(*) from sess where sess.landing = vw.path) as entries,
               (select count(*) from orgs where orgs.first_landing = vw.path and orgs.created_at >= v_start) as signups
        from vw group by vw.path order by count(*) desc, vw.path limit 50) p),
    'funnel', jsonb_build_object(
        'visitors', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.day >= v_from),
        'pricing', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.day >= v_from and e.kind = 'view' and e.path = '/priser'),
        'signup', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.day >= v_from and e.kind = 'view' and e.path = '/registrer'),
        'trials', (select count(*) from orgs where orgs.created_at >= v_start),
        'customers', (select count(*) from paid where paid.confirmed_at >= v_start)),
    'goals', jsonb_build_object(
        'trials', jsonb_build_object(
            'n', (select count(*) from orgs where orgs.created_at >= v_start),
            'prev', (select count(*) from orgs where orgs.created_at < v_start)),
        'demos', jsonb_build_object(
            'n', case when v_demo_now then (select count(*) from app.demo_requests r where r.at >= v_start) end,
            'prev', case when v_demo_prev then (select count(*) from app.demo_requests r where r.at >= v_pstart and r.at < v_start) end),
        'newsletter', jsonb_build_object(
            'n', (select count(distinct m.contact_id) from app.crm_list_members m where m.subscribed_at >= v_start),
            'prev', (select count(distinct m.contact_id) from app.crm_list_members m where m.subscribed_at >= v_pstart and m.subscribed_at < v_start)),
        'contact', jsonb_build_object(
            'n', (select count(*) from app.tickets t where t.channel = 'contact_form' and t.created_at >= v_start),
            'prev', (select count(*) from app.tickets t where t.channel = 'contact_form' and t.created_at >= v_pstart and t.created_at < v_start)))
  ) into v;
  return v;
end $fn$;

revoke all on function public.admin_web_report(int) from public, anon;
grant execute on function public.admin_web_report(int) to authenticated;
revoke all on function app.web_device(text) from public, anon, authenticated;
