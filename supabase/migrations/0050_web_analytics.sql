-- 0050_web_analytics.sql — the public site's own analytics, and where each signup came from (D-91, X-059).
--
-- The admin specification asks for web analytics that run from first visit to paying
-- customer, built in-house and cookieless. Three parts:
--
--   * **app.web_events** — one row per page view or "Kom i gang" click on the public site.
--     A row holds a path, the referring host, the campaign's utm tags and a visitor hash.
--     It never holds an IP address, a user agent, a cookie or an account.
--   * **The visitor hash** is sha256 of today's salt with the IP and user agent, cut to 128
--     bits. The salt is random, made on the day's first view and deleted the next day, so a
--     hash cannot be recomputed later or joined across days. "Visitors" is therefore a
--     count per day, never across a period, and nothing here can follow a person.
--   * **app.org_attribution** — the first and last touch a new organisation's signup
--     carried: the landing page, the referring host and the utm tags from the signup tab.
--     It describes the company's arrival, never a respondent's.
--
-- Nothing here touches the respondent's side. The beacon is mounted only on the public site,
-- and track_web_event refuses /s, /bli-med, /auth and /admin as well.
--
-- web_events, web_salts and org_attribution have RLS with no policy and no grant, like the
-- answer tables: no client role reads them. The admin reads them through the audited
-- functions below.
--
-- Also here: admin_funnel's median hours to the first send counted sends from before signup,
-- which imported organisations have (D-90). It now counts only sends after signup.

-- ---------------------------------------------------------------- tables
create table app.web_salts (
  day date primary key,
  salt text not null
);
alter table app.web_salts enable row level security;
revoke all on app.web_salts from public, anon, authenticated;

create table app.web_events (
  id bigint generated always as identity primary key,
  product_id text not null default 'orgpuls',
  at timestamptz not null default now(),
  day date not null default (now() at time zone 'Europe/Oslo')::date,
  visitor text not null check (visitor ~ '^[0-9a-f]{32}$'),
  kind text not null check (kind in ('view', 'cta')),
  path text not null check (path ~ '^/[a-z0-9/_-]{0,160}$'),
  referrer_host text check (referrer_host ~ '^[a-z0-9.-]{1,253}$'),
  utm_source text check (char_length(utm_source) between 1 and 80),
  utm_medium text check (char_length(utm_medium) between 1 and 80),
  utm_campaign text check (char_length(utm_campaign) between 1 and 80),
  label text check (label ~ '^[a-z0-9_-]{1,40}$')
);
create index web_events_day on app.web_events (day);
create index web_events_visitor on app.web_events (visitor, day, at);
alter table app.web_events enable row level security;
revoke all on app.web_events from public, anon, authenticated;

create table app.org_attribution (
  org_id uuid primary key references app.organizations (id) on delete cascade,
  first_landing text check (first_landing ~ '^/[a-z0-9/_-]{0,160}$'),
  first_referrer text check (first_referrer ~ '^[a-z0-9.-]{1,253}$'),
  first_source text check (char_length(first_source) between 1 and 80),
  first_medium text check (char_length(first_medium) between 1 and 80),
  first_campaign text check (char_length(first_campaign) between 1 and 80),
  last_source text check (char_length(last_source) between 1 and 80),
  last_medium text check (char_length(last_medium) between 1 and 80),
  last_campaign text check (char_length(last_campaign) between 1 and 80),
  channel text not null,
  recorded_at timestamptz not null default now()
);
alter table app.org_attribution enable row level security;
revoke all on app.org_attribution from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers
-- Where a visit came from, in the specification's words. Paid and e-mail are what a
-- campaign's tags say; social and organic search are recognised by the referring host.
create function app.web_channel(p_referrer text, p_source text, p_medium text) returns text
  language sql immutable set search_path = ''
as $fn$
  select case
    when p_medium ~* '^(cpc|ppc|paid|paid[_-]?social|paid[_-]?search|display|banner|cpm|cpv)$' then 'paid'
    when p_medium ~* '(e-?mail|newsletter|nyhetsbrev)' then 'email'
    when p_medium ~* 'social' or p_source ~* '^(facebook|fb|instagram|ig|linkedin|twitter|x|tiktok|youtube)$'
      or p_referrer ~ '(^|\.)(facebook|instagram|linkedin|lnkd|t|twitter|x|tiktok|youtube)\.(com|co|in)$' then 'social'
    when p_referrer ~ '(^|\.)(google|bing|duckduckgo|yahoo|ecosia|kvasir|startpage|qwant|yandex|baidu)\.[a-z.]+$' then 'organic'
    when p_source is not null then 'campaign'
    when p_referrer is not null then 'referral'
    else 'direct'
  end
$fn$;

-- A crawler, a monitor, a script or a preview fetcher: nothing a person reads with.
create function app.web_is_bot(p_ua text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select p_ua is null or char_length(p_ua) < 12
      or p_ua ~* '(bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python|axios|node-fetch|undici|go-http|java/|okhttp|monitor|pingdom|uptime|scan|httpclient|phantom|selenium|playwright|puppeteer)'
$fn$;

-- A utm tag: one line, printable, at most 80 characters, or nothing.
create function app.web_tag(p text) returns text
  language sql immutable set search_path = ''
as $fn$
  select nullif(left(regexp_replace(btrim(coalesce(p, '')), '[[:cntrl:]]', '', 'g'), 80), '')
$fn$;

-- A referring host, lower-cased, or nothing when it is Orgpuls itself or not a host.
create function app.web_host(p text) returns text
  language sql immutable set search_path = ''
as $fn$
  select case
    when p is null then null
    when lower(p) !~ '^[a-z0-9.-]{1,253}$' then null
    when lower(p) ~ '(^|\.)orgpuls\.(com|no)$' or lower(p) in ('localhost', '127.0.0.1') then null
    else lower(p)
  end
$fn$;

-- A public path, normalised, or nothing when it is not one this may record.
create function app.web_path(p text) returns text
  language sql immutable set search_path = ''
as $fn$
  with n as (select lower(coalesce(nullif(rtrim(split_part(split_part(coalesce(p, ''), '?', 1), '#', 1), '/'), ''), '/')) as v)
  select case
    when n.v !~ '^/[a-z0-9/_-]{0,160}$' then null
    when n.v ~ '^/(s|bli-med|auth|admin|api)(/|$)' then null
    else n.v
  end from n
$fn$;

-- Today's visitor hash. The salt is made on first use and yesterday's is deleted with it.
create function app.web_visitor(p_ip text, p_ua text) returns text
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_day date := (now() at time zone 'Europe/Oslo')::date;
  v_salt text;
begin
  delete from app.web_salts where day < v_day;
  insert into app.web_salts (day, salt)
  values (v_day, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'))
  on conflict (day) do nothing;
  select s.salt into v_salt from app.web_salts s where s.day = v_day;
  return left(encode(sha256(convert_to(v_salt || '|' || coalesce(p_ip, '') || '|' || coalesce(p_ua, ''), 'UTF8')), 'hex'), 32);
end $fn$;

-- ---------------------------------------------------------------- the beacon's write path
-- Called by the site's own route (app/api/wv), which passes the IP and user agent of the
-- request; neither is stored. Anything it cannot use is dropped silently: a beacon has no
-- one to report an error to. At most 300 events per visitor and day.
create function public.track_web_event(p_ip text, p_ua text, p_kind text, p_path text, p_referrer text, p_utm jsonb, p_label text)
  returns void
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_path text := app.web_path(p_path);
  v_visitor text;
  v_day date := (now() at time zone 'Europe/Oslo')::date;
begin
  if app.web_is_bot(p_ua) or v_path is null or p_kind not in ('view', 'cta') then
    return;
  end if;
  if p_label is not null and p_label !~ '^[a-z0-9_-]{1,40}$' then
    return;
  end if;
  v_visitor := app.web_visitor(left(p_ip, 64), left(p_ua, 400));
  if (select count(*) from app.web_events e where e.visitor = v_visitor and e.day = v_day) >= 300 then
    return;
  end if;
  insert into app.web_events (visitor, kind, path, referrer_host, utm_source, utm_medium, utm_campaign, label)
  values (v_visitor, p_kind, v_path, app.web_host(p_referrer),
          app.web_tag(p_utm ->> 'utm_source'), app.web_tag(p_utm ->> 'utm_medium'), app.web_tag(p_utm ->> 'utm_campaign'),
          p_label);
end $fn$;

-- ---------------------------------------------------------------- signup attribution
-- The new organisation's daglig leder records where the signup came from, once, within the
-- hour the organisation was created. p_first is the tab's first page: landing path, referring
-- host and tags. p_last is the tags the signup itself carried.
create function public.record_signup_source(p_first jsonb, p_last jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_landing text := app.web_path(p_first ->> 'landing');
  v_referrer text := app.web_host(p_first ->> 'referrer');
  v_source text := app.web_tag(p_first ->> 'utm_source');
  v_medium text := app.web_tag(p_first ->> 'utm_medium');
begin
  select m.org_id into v_org
  from app.memberships m join app.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.active and m.role = 'daglig_leder' and o.created_at > now() - interval '1 hour'
  limit 1;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  insert into app.org_attribution (org_id, first_landing, first_referrer, first_source, first_medium, first_campaign,
                                   last_source, last_medium, last_campaign, channel)
  values (v_org, v_landing, v_referrer, v_source, v_medium, app.web_tag(p_first ->> 'utm_campaign'),
          app.web_tag(p_last ->> 'utm_source'), app.web_tag(p_last ->> 'utm_medium'), app.web_tag(p_last ->> 'utm_campaign'),
          app.web_channel(v_referrer, v_source, v_medium))
  on conflict (org_id) do nothing;
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- admin reads
-- The public site over the last p_days (1..366): traffic per day, sources, landing pages,
-- pages, campaigns and the site's funnel. Sessions are a visitor's views on one day with no
-- gap over 30 minutes. Visitors are counted per day and summed, as the hash allows no more.
create function public.admin_web(p_days int default 30) returns jsonb
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
    select n.visitor, n.day, n.sn,
           (array_agg(n.path order by n.at, n.id) filter (where n.kind = 'view'))[1] as landing,
           (array_agg(n.referrer_host order by n.at, n.id))[1] as referrer_host,
           (array_agg(n.utm_source order by n.at, n.id))[1] as utm_source,
           (array_agg(n.utm_medium order by n.at, n.id))[1] as utm_medium,
           (array_agg(n.utm_campaign order by n.at, n.id))[1] as utm_campaign,
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

-- One organisation's arrival, for its admin page.
create function public.admin_org_attribution(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('attribution.view', p_org);
  return jsonb_build_object('ok', true, 'row', (
    select to_jsonb(a) - 'org_id' from app.org_attribution a where a.org_id = p_org));
end $fn$;

-- ---------------------------------------------------------------- the funnel, corrected
create or replace function public.admin_funnel(p_months int default 12) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if app.admin_role() is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('funnel.view');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(c order by c.cohort desc), '[]') from (
      select to_char(date_trunc('month', s.created_at at time zone 'Europe/Oslo'), 'YYYY-MM') as cohort,
             count(*) as created,
             count(*) filter (where s.first_employee is not null) as employees_uploaded,
             count(*) filter (where s.first_planned is not null) as survey_scheduled,
             count(*) filter (where s.first_sent is not null) as survey_sent,
             count(*) filter (where s.unlocked) as result_unlocked,
             count(*) filter (where s.viewed) as results_viewed,
             count(*) filter (where s.first_measure is not null) as measure_created,
             count(*) filter (where s.confirmed) as converted,
             -- only sends after signup: an imported organisation's history is not a time to first send
             round((percentile_cont(0.5) within group (order by extract(epoch from s.first_sent - s.created_at) / 3600.0)
                    filter (where s.first_sent >= s.created_at))::numeric, 1) as median_hours_to_first_send
      from (
        select o.id, o.created_at,
               (select min(e.created_at) from app.employees e where e.org_id = o.id) as first_employee,
               (select min(ms.created_at) from app.measurements ms where ms.org_id = o.id) as first_planned,
               (select min(i.sent_at) from app.invitations i where i.org_id = o.id) as first_sent,
               exists (select 1 from app.rounds r
                       join app.invitations i on i.round_id = r.id and i.responded_at is not null
                       join app.employees e on e.id = i.employee_id
                       where r.org_id = o.id and r.status = 'lukket'
                       group by r.id, e.group_id having count(*) >= o.threshold) as unlocked,
               exists (select 1 from app.product_events pe where pe.org_id = o.id and pe.name = 'results_viewed') as viewed,
               (select min(m.created_at) from app.measures m where m.org_id = o.id) as first_measure,
               exists (select 1 from app.billing b where b.org_id = o.id and b.confirmed_at is not null) as confirmed
        from app.organizations o
        where o.created_at >= date_trunc('month', now()) - make_interval(months => greatest(coalesce(p_months, 12), 1) - 1)
      ) s
      group by 1) c));
end $fn$;

-- ---------------------------------------------------------------- retention
-- Raw events are kept for 13 months, enough for a year-on-year comparison.
select cron.schedule('orgpuls-web-retention', '17 3 * * *',
  $job$delete from app.web_events where day < (now() at time zone 'Europe/Oslo')::date - 400$job$);

-- ---------------------------------------------------------------- grants
revoke all on function app.web_visitor(text, text) from public, anon, authenticated;
revoke all on function public.track_web_event(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.track_web_event(text, text, text, text, text, jsonb, text) to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.record_signup_source(jsonb,jsonb)', 'public.admin_web(int)', 'public.admin_org_attribution(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
