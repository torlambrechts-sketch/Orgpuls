-- 0126 — Sentral › Admin (X-095 phase 10; D-170)
--
--   editor          what it may do: Content (cms_can_read / cms_can_write: pages, templates,
--                   landing pages, media, redirects, the site notice) and SEO (admin_seo). What it may
--                   not: every reader that admitted *any* admin role or denied only named roles — the
--                   organisation detail, the audit trail, the KPIs, the funnel, the trends, what needs
--                   attention and the web readers — now refuses it. Rewritten from each function's own
--                   definition, so no body is copied; a gate that is not found stops the migration.
--   allow_indexing  the design's «Allow search engines»: off, every public page says noindex and the
--                   sitemap is empty (the pages stay reachable, so a crawler reads the noindex). A
--                   super-admin's switch, audited; the public site reads it through site_indexing().
--   site settings   admin_site_settings(): the switches as they stand, for Admin › Site settings.

-- ---------------------------------------------------------------- Content and SEO admit the editor
create or replace function app.cms_can_write() returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select app.is_platform_admin(array['super_admin', 'marketing', 'editor']::app.platform_role[]) $fn$;
create or replace function app.cms_can_read() returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select app.is_platform_admin(array['super_admin', 'marketing', 'analyst', 'support', 'editor']::app.platform_role[]) $fn$;

-- SEO: admin_seo (0061) as it was, with the editor among its readers
create or replace function public.admin_seo(p_days int default 28) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_days int := least(greatest(coalesce(p_days, 28), 7), 180);
  v_to date := (now() at time zone 'Europe/Oslo')::date;
  v_from date;
  v_prev date;
  v jsonb;
begin
  if not app.is_platform_admin(array['super_admin', 'marketing', 'analyst', 'editor']::app.platform_role[]) then
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

-- ---------------------------------------------------------------- and nothing else
do $$
declare
  r record;
  v_def text;
begin
  for r in select * from (values
    ('public.admin_org_detail(uuid)', 'v_role is null or v_role = ''analyst''', 'v_role is null or v_role in (''analyst'', ''editor'')'),
    ('public.admin_audit_list(uuid,integer)', 'v_role in (''finance'', ''analyst'')', 'v_role in (''finance'', ''analyst'', ''editor'')'),
    ('public.admin_kpis()', 'if app.admin_role() is null then', 'if app.admin_role() is null or app.admin_role() = ''editor'' then'),
    ('public.admin_funnel(integer)', 'if app.admin_role() is null then', 'if app.admin_role() is null or app.admin_role() = ''editor'' then'),
    ('public.admin_trends(integer)', 'if app.admin_role() is null then', 'if app.admin_role() is null or app.admin_role() = ''editor'' then'),
    ('public.admin_web(integer)', 'if app.admin_role() is null then', 'if app.admin_role() is null or app.admin_role() = ''editor'' then'),
    ('public.admin_web_report(integer)', 'if app.admin_role() is null then', 'if app.admin_role() is null or app.admin_role() = ''editor'' then'),
    ('public.admin_attention()', 'if v_role is null then', 'if v_role is null or v_role = ''editor'' then')
  ) as t(fn, gate, closed) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.gate in v_def) = 0 then
      raise exception '0126: the gate of % was not found; read its definition and write this by hand', r.fn;
    end if;
    execute replace(v_def, r.gate, r.closed);
  end loop;
end $$;

-- ---------------------------------------------------------------- allow search engines
alter table app.platform_settings
  add column allow_indexing boolean not null default true,
  add column indexing_by uuid references auth.users (id) on delete set null,
  add column indexing_at timestamptz;
create index platform_settings_indexing_by_idx on app.platform_settings (indexing_by);

create function public.admin_site_indexing_set(p_on boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_on is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update app.platform_settings set allow_indexing = p_on, indexing_by = auth.uid(), indexing_at = now() where id;
  perform app.admin_log(case when p_on then 'site.indexing_on' else 'site.indexing_off' end, null, 'site', 'indexing', null, null);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_site_indexing_set(boolean) from public, anon;
grant execute on function public.admin_site_indexing_set(boolean) to authenticated;

-- what the public site reads: whether search engines may index it (true when the row is missing)
create function public.site_indexing() returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select coalesce((select s.allow_indexing from app.platform_settings s where s.id), true) $fn$;
revoke all on function public.site_indexing() from public;
grant execute on function public.site_indexing() to anon, authenticated;

-- ---------------------------------------------------------------- the switches, for Admin › Site settings
create function public.admin_site_settings() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return (select jsonb_build_object('ok', true,
    'allow_indexing', s.allow_indexing, 'indexing_at', s.indexing_at,
    'indexing_by', (select u.email from auth.users u where u.id = s.indexing_by),
    'auto_approve', s.auto_approve,
    'notice_on', s.notice_on,
    'admins', (select count(*) from app.platform_admins a where a.active),
    'admins_without_factor', (select count(*) from app.platform_admins a where a.active
                                and not exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified')))
    from app.platform_settings s where s.id);
end $fn$;
revoke all on function public.admin_site_settings() from public, anon;
grant execute on function public.admin_site_settings() to authenticated;
