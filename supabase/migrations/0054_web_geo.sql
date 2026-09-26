-- 0054_web_geo.sql — where the site's visitors are: country, region, city and network (D-100).
--
-- The owner asked for source, location, time, country and IP address on the web analytics.
-- Source (referring host, utm tags, channel) and time (`at`) were stored already (0050).
-- This adds, per event:
--
--   * country, region and city, as Vercel's edge reads them from the request's address
--     (x-vercel-ip-country, -country-region, -city). Nothing is looked up by us.
--   * **network**: the IP address cut to its network — an IPv4 address to /24
--     (203.0.113.0/24), an IPv6 address to /48. It is not the address.
--
-- Why not the whole address: the signed databehandleravtale, vedlegg 1, says the site
-- statistics "sier ikke hvem som besøker", and the visitor hash (0050) was built so
-- that nothing can follow a person. A full address is personal data that identifies a
-- household or an office. A /24 or /48 identifies a network, as Google Analytics'
-- IP anonymisation does. Storing the full address would need new privacy wording first.
--
-- admin_web gains countries, the top cities, and the latest 100 visits one by one, each
-- with its time, source, landing page, country, city and network.

alter table app.web_events
  add column country text check (country ~ '^[A-Z]{2}$'),
  add column region text check (region ~ '^[A-Za-z0-9-]{1,10}$'),
  add column city text check (char_length(city) between 1 and 80),
  add column network text check (network ~ '^[0-9a-f.:]{3,45}/(24|48)$');

-- The network an address belongs to, or null when it is not an address.
create function app.web_network(p_ip text) returns text
  language plpgsql immutable set search_path = ''
as $fn$
declare
  v inet;
begin
  begin
    v := host(btrim(p_ip)::inet)::inet;
  exception when others then
    return null;
  end;
  if family(v) = 4 then
    return host(network(set_masklen(v, 24))) || '/24';
  end if;
  return host(network(set_masklen(v, 48))) || '/48';
end $fn$;

-- The beacon's write path, with the edge's location and the network. The address itself is
-- still only an input to the day's visitor hash, and is not stored.
drop function public.track_web_event(text, text, text, text, text, jsonb, text);
create function public.track_web_event(p_ip text, p_ua text, p_kind text, p_path text, p_referrer text, p_utm jsonb, p_label text,
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
  insert into app.web_events (visitor, kind, path, referrer_host, utm_source, utm_medium, utm_campaign, label, country, region, city, network)
  values (v_visitor, p_kind, v_path, app.web_host(p_referrer),
          app.web_tag(p_utm ->> 'utm_source'), app.web_tag(p_utm ->> 'utm_medium'), app.web_tag(p_utm ->> 'utm_campaign'),
          p_label, v_country, v_region, v_city, app.web_network(left(p_ip, 64)));
end $fn$;

create or replace function public.admin_web(p_days int default 30) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 366);
  v_from date := (now() at time zone 'Europe/Oslo')::date - (least(greatest(coalesce(p_days, 30), 1), 366) - 1);
  v jsonb;
begin
  if app.admin_role() is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('web.view', null, null, null, null, jsonb_build_object('days', v_days));

  with ev as (
    select e.*, case when lag(e.at) over w is null or e.at - lag(e.at) over w > interval '30 minutes' then 1 else 0 end as starts
    from app.web_events e where e.day >= v_from
    window w as (partition by e.visitor, e.day order by e.at, e.id)
  ), numbered as (
    select ev.*, sum(ev.starts) over (partition by ev.visitor, ev.day order by ev.at, ev.id) as sn from ev
  ), sess as (
    select n.visitor, n.day, n.sn, min(n.at) as started_at,
           (array_agg(n.path order by n.at, n.id) filter (where n.kind = 'view'))[1] as landing,
           (array_agg(n.referrer_host order by n.at, n.id))[1] as referrer_host,
           (array_agg(n.utm_source order by n.at, n.id))[1] as utm_source,
           (array_agg(n.utm_medium order by n.at, n.id))[1] as utm_medium,
           (array_agg(n.utm_campaign order by n.at, n.id))[1] as utm_campaign,
           (array_agg(n.country order by n.at, n.id))[1] as country,
           (array_agg(n.region order by n.at, n.id))[1] as region,
           (array_agg(n.city order by n.at, n.id))[1] as city,
           (array_agg(n.network order by n.at, n.id))[1] as network,
           count(*) filter (where n.kind = 'view') as views,
           bool_or(n.kind = 'view' and n.path in ('/priser', '/plattform')) as saw_offer,
           bool_or(n.kind = 'cta') as clicked,
           bool_or(n.kind = 'view' and n.path = '/registrer') as reached_signup
    from numbered n group by n.visitor, n.day, n.sn
  ), s as (
    select sess.*, app.web_channel(sess.referrer_host, sess.utm_source, sess.utm_medium) as channel from sess
  ), orgs as (
    select o.id, o.created_at, coalesce(a.channel, 'unknown') as channel, a.first_landing, a.first_campaign,
           exists (select 1 from app.invitations i where i.org_id = o.id and i.sent_at is not null) as activated,
           exists (select 1 from app.billing b where b.org_id = o.id and b.confirmed_at is not null) as paid
    from app.organizations o left join app.org_attribution a on a.org_id = o.id
    where (o.created_at at time zone 'Europe/Oslo')::date >= v_from
  )
  select jsonb_build_object(
    'ok', true,
    'days', v_days,
    'totals', (select jsonb_build_object(
        'visitors', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.day >= v_from),
        'sessions', count(*),
        'views', coalesce(sum(s.views), 0),
        'bounced', count(*) filter (where s.views <= 1 and not s.clicked),
        'signups', (select count(*) from orgs))
      from s),
    'daily', (select coalesce(jsonb_agg(d order by d.day), '[]') from (
        select s.day, count(distinct s.visitor) as visitors, count(*) as sessions, sum(s.views) as views
        from s group by s.day) d),
    'channels', (select coalesce(jsonb_agg(c order by c.sessions desc, c.channel), '[]') from (
        select k.channel,
               coalesce((select count(*) from s where s.channel = k.channel), 0) as sessions,
               coalesce((select count(*) from orgs where orgs.channel = k.channel), 0) as signups,
               coalesce((select count(*) from orgs where orgs.channel = k.channel and orgs.activated), 0) as activated,
               coalesce((select count(*) from orgs where orgs.channel = k.channel and orgs.paid), 0) as paid
        from (select s.channel from s union select orgs.channel from orgs) k) c),
    'landing', (select coalesce(jsonb_agg(l order by l.sessions desc, l.path), '[]') from (
        select s.landing as path, count(*) as sessions, count(*) filter (where s.views <= 1 and not s.clicked) as bounced,
               (select count(*) from orgs where orgs.first_landing = s.landing) as signups
        from s where s.landing is not null group by s.landing order by count(*) desc limit 20) l),
    'pages', (select coalesce(jsonb_agg(p order by p.views desc, p.path), '[]') from (
        select e.path, count(*) as views from app.web_events e where e.day >= v_from and e.kind = 'view'
        group by e.path order by count(*) desc limit 20) p),
    'campaigns', (select coalesce(jsonb_agg(c order by c.sessions desc, c.campaign), '[]') from (
        select k.campaign,
               coalesce((select count(*) from s where s.utm_campaign = k.campaign), 0) as sessions,
               coalesce((select count(*) from orgs where orgs.first_campaign = k.campaign), 0) as signups,
               coalesce((select count(*) from orgs where orgs.first_campaign = k.campaign and orgs.paid), 0) as paid
        from (select s.utm_campaign as campaign from s where s.utm_campaign is not null
              union select orgs.first_campaign from orgs where orgs.first_campaign is not null) k
        limit 30) c),
    -- where visits came from: the country, and the city the network reports (0054, D-100)
    'countries', (select coalesce(jsonb_agg(c order by c.sessions desc, c.country), '[]') from (
        select coalesce(s.country, '??') as country, count(*) as sessions, count(distinct (s.visitor, s.day)) as visitors
        from s group by coalesce(s.country, '??') order by count(*) desc limit 30) c),
    'cities', (select coalesce(jsonb_agg(c order by c.sessions desc, c.city), '[]') from (
        select s.country, s.region, s.city, count(*) as sessions
        from s where s.city is not null group by s.country, s.region, s.city order by count(*) desc limit 20) c),
    -- the latest visits one by one: when, from where, through what, and what they did
    'recent', (select coalesce(jsonb_agg(r order by r.started_at desc), '[]') from (
        select s.started_at, s.channel, s.referrer_host, s.utm_source, s.utm_medium, s.utm_campaign, s.landing,
               s.views, s.clicked, s.reached_signup, s.country, s.region, s.city, s.network
        from s order by s.started_at desc limit 100) r),
    'funnel', (select jsonb_build_object(
        'sessions', count(*),
        'saw_offer', count(*) filter (where s.saw_offer),
        'clicked', count(*) filter (where s.clicked),
        'reached_signup', count(*) filter (where s.reached_signup),
        'created', (select count(*) from orgs))
      from s)
  ) into v;
  return v;
end $fn$;

revoke all on function public.track_web_event(text, text, text, text, text, jsonb, text, jsonb) from public;
grant execute on function public.track_web_event(text, text, text, text, text, jsonb, text, jsonb) to anon, authenticated;
revoke all on function app.web_network(text) from public, anon, authenticated;
