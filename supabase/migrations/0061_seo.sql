-- 0061_seo.sql — search data in the admin (D-106, X-063).
--
-- * **app.seo_search** — Google Search Console's performance rows, one per day, page, query,
--   country and device, synced daily by the orgpuls-seo function (edge, service role). Search
--   Console keeps sixteen months; this keeps them as long as the admin wants them. A query is
--   what someone typed into Google, aggregated and thresholded by Google before it gets here.
-- * **app.seo_runs** — each sync and each IndexNow submission: when, whether it worked, how
--   many rows or URLs, and an error code. The admin's status line reads it.
-- * **admin_seo(p_days)** — the page: content performance from the site's own analytics
--   (entries, change against the previous period, signups, activated, paid, by landing page),
--   Search Console by page and by query when it is connected, pages whose traffic is decaying,
--   queries answered by more than one page, and visits from AI assistants.
--
-- Nothing here is about a customer or a respondent; the tables have RLS on and no grant, like
-- the web analytics (0050), and are read through the audited function.

create table app.seo_search (
  day date not null,
  page text not null check (page ~ '^/[^\s]*$' and char_length(page) <= 300),
  query text not null check (char_length(query) <= 200),
  country text not null check (country ~ '^[a-z]{3}$'),
  device text not null check (device in ('DESKTOP', 'MOBILE', 'TABLET')),
  clicks int not null check (clicks >= 0),
  impressions int not null check (impressions >= 0),
  position numeric(6, 2) not null check (position >= 0),
  primary key (day, page, query, country, device)
);
create index seo_search_page on app.seo_search (page, day);
alter table app.seo_search enable row level security;
revoke all on app.seo_search from public, anon, authenticated;

create table app.seo_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('gsc', 'indexnow')),
  ok boolean not null,
  count int not null default 0,
  error text check (error ~ '^[a-z0-9_]{1,40}$')
);
create index seo_runs_kind on app.seo_runs (kind, at desc);
alter table app.seo_runs enable row level security;
revoke all on app.seo_runs from public, anon, authenticated;

-- ---------------------------------------------------------------- the function's half
create function public.seo_search_upsert(p_rows jsonb) returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v int;
begin
  insert into app.seo_search (day, page, query, country, device, clicks, impressions, position)
  select (r->>'day')::date, r->>'page', left(coalesce(r->>'query', ''), 200), lower(r->>'country'), upper(r->>'device'),
         (r->>'clicks')::int, (r->>'impressions')::int, round((r->>'position')::numeric, 2)
  from jsonb_array_elements(coalesce(p_rows, '[]')) r
  where r->>'page' ~ '^/[^\s]*$' and char_length(r->>'page') <= 300 and lower(r->>'country') ~ '^[a-z]{3}$' and upper(r->>'device') in ('DESKTOP', 'MOBILE', 'TABLET')
  on conflict (day, page, query, country, device) do update
    set clicks = excluded.clicks, impressions = excluded.impressions, position = excluded.position;
  get diagnostics v = row_count;
  return v;
end $fn$;

create function public.seo_run_record(p_kind text, p_ok boolean, p_count int, p_error text default null) returns void
  language sql security definer set search_path = ''
as $fn$
  insert into app.seo_runs (kind, ok, count, error)
  values (p_kind, p_ok, greatest(coalesce(p_count, 0), 0),
          case when p_ok then null else left(regexp_replace(lower(coalesce(p_error, 'unknown')), '[^a-z0-9_]', '_', 'g'), 40) end)
$fn$;

-- ---------------------------------------------------------------- the admin's page
create function public.admin_seo(p_days int default 28) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_days int := least(greatest(coalesce(p_days, 28), 7), 180);
  v_to date := (now() at time zone 'Europe/Oslo')::date;
  v_from date;
  v_prev date;
  v jsonb;
begin
  if not app.is_platform_admin(array['super_admin', 'marketing', 'analyst']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('seo.view', null, null, null, null, jsonb_build_object('days', v_days));
  v_from := v_to - (v_days - 1);
  v_prev := v_from - v_days;

  with ev as (
    select e.*, case when lag(e.at) over w is null or e.at - lag(e.at) over w > interval '30 minutes' then 1 else 0 end as starts
    from app.web_events e where e.day >= v_prev
    window w as (partition by e.visitor, e.day order by e.at, e.id)
  ), n as (
    select ev.*, sum(ev.starts) over (partition by ev.visitor, ev.day order by ev.at, ev.id) as sn from ev
  ), sess as (
    select n.day, (array_agg(n.path order by n.at, n.id) filter (where n.kind = 'view'))[1] as landing,
           (array_agg(n.referrer_host order by n.at, n.id))[1] as referrer_host,
           (array_agg(n.utm_source order by n.at, n.id))[1] as utm_source,
           (array_agg(n.utm_medium order by n.at, n.id))[1] as utm_medium,
           count(*) filter (where n.kind = 'view') as views
    from n group by n.visitor, n.day, n.sn
  ), s as (
    select sess.*, app.web_channel(sess.referrer_host, sess.utm_source, sess.utm_medium) as channel from sess where sess.landing is not null
  ), orgs as (
    select a.first_landing, a.channel,
           exists (select 1 from app.invitations i where i.org_id = o.id and i.sent_at is not null) as activated,
           exists (select 1 from app.billing b where b.org_id = o.id and b.confirmed_at is not null) as paid
    from app.organizations o join app.org_attribution a on a.org_id = o.id
    where (o.created_at at time zone 'Europe/Oslo')::date >= v_from
  ), g as (
    select q.page,
           sum(q.clicks) filter (where q.day >= v_from) as clicks,
           sum(q.impressions) filter (where q.day >= v_from) as impressions,
           round(sum(q.position * q.impressions) filter (where q.day >= v_from) / nullif(sum(q.impressions) filter (where q.day >= v_from), 0), 1) as position,
           sum(q.clicks) filter (where q.day < v_from) as clicks_prev
    from app.seo_search q where q.day >= v_prev group by q.page
  ), pages as (
    select k.page,
           count(s.*) filter (where s.day >= v_from) as entries,
           count(s.*) filter (where s.day < v_from) as entries_prev,
           count(s.*) filter (where s.day >= v_from and s.channel = 'organic') as organic,
           (select count(*) from orgs where orgs.first_landing = k.page) as signups,
           (select count(*) from orgs where orgs.first_landing = k.page and orgs.activated) as activated,
           (select count(*) from orgs where orgs.first_landing = k.page and orgs.paid) as paid
    from (select s.landing as page from s union select g.page from g) k
    left join s on s.landing = k.page
    group by k.page
  )
  select jsonb_build_object(
    'ok', true,
    'days', v_days,
    'status', jsonb_build_object(
      'gsc', (select to_jsonb(r) - 'id' from app.seo_runs r where r.kind = 'gsc' order by r.at desc limit 1),
      'gsc_last_ok', (select max(r.at) from app.seo_runs r where r.kind = 'gsc' and r.ok),
      'indexnow', (select to_jsonb(r) - 'id' from app.seo_runs r where r.kind = 'indexnow' order by r.at desc limit 1),
      'rows', (select count(*) from app.seo_search),
      'latest_day', (select max(q.day) from app.seo_search q)),
    'pages', (select coalesce(jsonb_agg(x order by x.entries desc, x.clicks desc nulls last, x.page), '[]') from (
        select p.*, g.clicks, g.impressions, g.position, g.clicks_prev
        from pages p left join g on g.page = p.page
        where p.entries + p.entries_prev + coalesce(g.impressions, 0) > 0
        order by p.entries desc, g.clicks desc nulls last limit 60) x),
    -- a page that brought at least ten entries (or ten search clicks) before and 30 % fewer now
    'decaying', (select coalesce(jsonb_agg(x order by x.lost desc), '[]') from (
        select p.page, p.entries, p.entries_prev, g.clicks, g.clicks_prev,
               greatest(p.entries_prev - p.entries, coalesce(g.clicks_prev, 0) - coalesce(g.clicks, 0)) as lost
        from pages p left join g on g.page = p.page
        where (p.entries_prev >= 10 and p.entries <= p.entries_prev * 0.7)
           or (coalesce(g.clicks_prev, 0) >= 10 and coalesce(g.clicks, 0) <= g.clicks_prev * 0.7)) x),
    'queries', (select coalesce(jsonb_agg(x order by x.clicks desc, x.impressions desc), '[]') from (
        select q.query, sum(q.clicks) as clicks, sum(q.impressions) as impressions,
               round(sum(q.position * q.impressions) / nullif(sum(q.impressions), 0), 1) as position,
               count(distinct q.page) as pages,
               (array_agg(q.page order by q.clicks desc, q.impressions desc))[1] as top_page
        from app.seo_search q where q.day >= v_from and q.query <> ''
        group by q.query order by sum(q.clicks) desc, sum(q.impressions) desc limit 50) x),
    -- two or more of our pages each with a real share of one query's impressions
    'cannibal', (select coalesce(jsonb_agg(x order by x.impressions desc), '[]') from (
        select c.query, sum(c.impr) as impressions, jsonb_agg(jsonb_build_object('page', c.page, 'impressions', c.impr, 'position', c.pos) order by c.impr desc) as pages
        from (select q.query, q.page, sum(q.impressions) as impr,
                     round(sum(q.position * q.impressions) / nullif(sum(q.impressions), 0), 1) as pos
              from app.seo_search q where q.day >= v_from and q.query <> '' group by q.query, q.page) c
        where c.impr >= 10
        group by c.query having count(*) >= 2 order by sum(c.impr) desc limit 20) x),
    'ai', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
        select coalesce(s.referrer_host, s.utm_source, 'unknown') as source, count(*) as sessions
        from s where s.day >= v_from and s.channel = 'ai' group by 1) x),
    'ai_signups', (select count(*) from orgs where orgs.channel = 'ai')
  ) into v;
  return v;
end $fn$;

-- ---------------------------------------------------------------- the schedule
-- Daily at 05:23 Oslo-ish (03:23 UTC): the orgpuls-seo function, called like the dispatcher,
-- with the dispatcher's secret; its URL is the dispatcher's with the function's name.
select cron.schedule('orgpuls-seo', '23 3 * * *', $job$
  select net.http_post(
           url := replace(s.url, 'orgpuls-dispatch', 'orgpuls-seo'),
           headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', s.secret),
           body := '{}'::jsonb,
           timeout_milliseconds := 55000)
  from (select
          (select decrypted_secret from vault.decrypted_secrets where name = 'orgpuls_dispatch_url') as url,
          (select decrypted_secret from vault.decrypted_secrets where name = 'orgpuls_dispatch_secret') as secret) s
  where s.url is not null and s.secret is not null
$job$);

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array['public.seo_search_upsert(jsonb)', 'public.seo_run_record(text,boolean,int,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  revoke all on function public.admin_seo(int) from public, anon;
  grant execute on function public.admin_seo(int) to authenticated;
end $$;
