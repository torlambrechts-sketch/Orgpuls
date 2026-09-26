-- 0059_attribution_server.sql — signup attribution read on the server, AI assistants as a
-- channel, the two utm tags that were dropped, "how did you hear of us", and A/B tests
-- decided on clicks (D-104, X-063).
--
-- **Attribution without storage on the device.** The site kept the visit's first page and
-- campaign tags in sessionStorage so the signup form could send them (D-91). Since 1 January
-- 2025 ekomlov § 3-15 asks consent for storing anything on the user's device, not only
-- cookies, and analytics is not one of the exemptions. The tags are already in
-- app.web_events, under today's visitor hash, so the server can read them there instead:
-- record_signup_source now takes the signup request's IP address and user agent, computes
-- the same hash the beacon did, and takes
--   * first touch — the visitor's first event today: its page, referring host and tags;
--   * last touch  — the tags of the latest event that carried any, in the latest session.
-- Neither the address nor the user agent is stored; they are inputs to the hash, as before.
-- A visit that began yesterday, changed network or sent no beacon (Global Privacy Control)
-- is recorded as direct, which is what it looks like to the server.
--
-- **AI assistants** (chatgpt.com, perplexity.ai, Copilot, Gemini, Claude …) are a channel of
-- their own. They are checked before organic search: gemini.google.com would otherwise read
-- as Google.
--
-- **utm_term and utm_content** are stored on the event. The beacon always sent them.
--
-- **org_attribution.heard** — the answer to "Hvordan hørte du om oss?" on the signup's last
-- step: one of a fixed list, never free text.
--
-- **A/B tests default to clicks.** Apple Mail Privacy Protection loads every image, so opens
-- say little about a subject line; the proxy's opens are excluded (0056) but the rest are
-- still a weak signal. Existing campaigns keep what they were saved with.

-- ---------------------------------------------------------------- columns
alter table app.web_events
  add column utm_term text check (char_length(utm_term) between 1 and 80),
  add column utm_content text check (char_length(utm_content) between 1 and 80);

alter table app.org_attribution
  add column heard text check (heard in ('search', 'ai', 'linkedin', 'colleague', 'bht', 'event', 'newsletter', 'other'));

alter table app.crm_campaigns alter column ab_metric set default 'click';

-- ---------------------------------------------------------------- channels
create or replace function app.web_channel(p_referrer text, p_source text, p_medium text) returns text
  language sql immutable set search_path = ''
as $fn$
  select case
    when p_medium ~* '^(cpc|ppc|paid|paid[_-]?social|paid[_-]?search|display|banner|cpm|cpv)$' then 'paid'
    when p_medium ~* '(e-?mail|newsletter|nyhetsbrev)' then 'email'
    when p_source ~* '^(chatgpt(\.com)?|openai|perplexity(\.ai)?|copilot|gemini|claude(\.ai)?)$'
      or p_referrer ~ '(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|claude\.ai|you\.com|phind\.com)$' then 'ai'
    when p_medium ~* 'social' or p_source ~* '^(facebook|fb|instagram|ig|linkedin|twitter|x|tiktok|youtube)$'
      or p_referrer ~ '(^|\.)(facebook|instagram|linkedin|lnkd|t|twitter|x|tiktok|youtube)\.(com|co|in)$' then 'social'
    when p_referrer ~ '(^|\.)(google|bing|duckduckgo|yahoo|ecosia|kvasir|startpage|qwant|yandex|baidu)\.[a-z.]+$' then 'organic'
    when p_source is not null then 'campaign'
    when p_referrer is not null then 'referral'
    else 'direct'
  end
$fn$;

-- ---------------------------------------------------------------- the beacon's write path
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
                              label, country, region, city, network)
  values (v_visitor, p_kind, v_path, app.web_host(p_referrer),
          app.web_tag(p_utm ->> 'utm_source'), app.web_tag(p_utm ->> 'utm_medium'), app.web_tag(p_utm ->> 'utm_campaign'),
          app.web_tag(p_utm ->> 'utm_term'), app.web_tag(p_utm ->> 'utm_content'),
          p_label, v_country, v_region, v_city, app.web_network(left(p_ip, 64)));
end $fn$;

-- ---------------------------------------------------------------- signup attribution
-- The new organisation's daglig leder, within the hour the organisation was made. The IP
-- address and user agent are the signup request's; the touch is read from today's events.
-- The old (jsonb, jsonb) form stays until the app that calls it is gone from production;
-- 0060 drops it.
create function public.record_signup_source(p_ip text, p_ua text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_visitor text;
  v_day date := (now() at time zone 'Europe/Oslo')::date;
  f record;
  l record;
begin
  select m.org_id into v_org
  from app.memberships m join app.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.active and m.role = 'daglig_leder' and o.created_at > now() - interval '1 hour'
  limit 1;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  v_visitor := app.web_visitor(left(coalesce(p_ip, ''), 64), left(coalesce(p_ua, ''), 400));

  -- first touch: the visitor's first event today
  select e.path, e.referrer_host, e.utm_source, e.utm_medium, e.utm_campaign into f
  from app.web_events e where e.visitor = v_visitor and e.day = v_day
  order by e.at, e.id limit 1;

  -- last touch: the latest tags in the latest session (no gap over 30 minutes)
  with ev as (
    select e.*, case when lag(e.at) over w is null or e.at - lag(e.at) over w > interval '30 minutes' then 1 else 0 end as starts
    from app.web_events e where e.visitor = v_visitor and e.day = v_day
    window w as (order by e.at, e.id)
  ), n as (
    select ev.*, sum(ev.starts) over (order by ev.at, ev.id) as sn from ev
  )
  select n.utm_source, n.utm_medium, n.utm_campaign into l
  from n
  where n.sn = (select max(sn) from n) and coalesce(n.utm_source, n.utm_medium, n.utm_campaign) is not null
  order by n.at desc, n.id desc limit 1;

  insert into app.org_attribution (org_id, first_landing, first_referrer, first_source, first_medium, first_campaign,
                                   last_source, last_medium, last_campaign, channel)
  values (v_org, f.path, f.referrer_host, f.utm_source, f.utm_medium, f.utm_campaign,
          l.utm_source, l.utm_medium, l.utm_campaign,
          app.web_channel(f.referrer_host, f.utm_source, f.utm_medium))
  on conflict (org_id) do nothing;
  return jsonb_build_object('ok', true);
end $fn$;

-- "Hvordan hørte du om oss?", answered on the signup's last step, within a day of signing up.
-- It may be changed in that day; the row is made if the visit left none.
create function public.record_signup_heard(p_heard text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org uuid;
begin
  if p_heard is null or p_heard not in ('search', 'ai', 'linkedin', 'colleague', 'bht', 'event', 'newsletter', 'other') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select m.org_id into v_org
  from app.memberships m join app.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.active and m.role = 'daglig_leder' and o.created_at > now() - interval '1 day'
  order by o.created_at desc
  limit 1;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  insert into app.org_attribution (org_id, channel, heard) values (v_org, 'direct', p_heard)
  on conflict (org_id) do update set heard = excluded.heard;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.record_signup_source(text, text) from public, anon;
grant execute on function public.record_signup_source(text, text) to authenticated;
revoke all on function public.record_signup_heard(text) from public, anon;
grant execute on function public.record_signup_heard(text) to authenticated;

-- ---------------------------------------------------------------- admin read: adds "heard"
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
    select o.id, o.created_at, coalesce(a.channel, 'unknown') as channel, a.first_landing, a.first_campaign, a.heard,
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
    -- what the new organisation said when asked how it heard of Orgpuls (0059)
    'heard', (select coalesce(jsonb_agg(h order by h.signups desc, h.heard), '[]') from (
        select coalesce(orgs.heard, 'unanswered') as heard, count(*) as signups,
               count(*) filter (where orgs.activated) as activated, count(*) filter (where orgs.paid) as paid
        from orgs group by coalesce(orgs.heard, 'unanswered')) h),
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

-- ---------------------------------------------------------------- A/B: a campaign saved without a metric is decided on clicks
create or replace function public.admin_crm_campaign_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
  v_status text;
  v_utm text := lower(btrim(coalesce(p->>'utm_campaign', '')));
  v_slug text := nullif(lower(btrim(coalesce(p->>'slug', ''))), '');
  v_t app.crm_templates;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if nullif(p->>'template_key', '') is not null then
    select * into v_t from app.crm_templates t where t.key = p->>'template_key';
    if v_t.key is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_template');
    end if;
  end if;
  if coalesce(p->>'kind', v_t.kind, 'newsletter') not in ('newsletter', 'campaign', 'promotion', 'announcement') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if v_utm = '' then
    v_utm := left(trim(both '-' from regexp_replace(translate(replace(lower(p->>'name'), 'æ', 'ae'), 'øå', 'oa'), '[^a-z0-9]+', '-', 'g')), 60);
  end if;
  if v_utm !~ '^[a-z0-9_-]{1,60}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_utm');
  end if;
  if char_length(coalesce(p->>'subject', '')) > 150 or char_length(coalesce(p->>'subject_b', '')) > 150
     or char_length(coalesce(p->>'preheader', '')) > 200 or char_length(coalesce(p->>'web_description', '')) > 200
     or char_length(coalesce(p->>'signature', '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if p ? 'blocks' and jsonb_array_length(coalesce(p->'blocks', '[]')) > 0 and not app.crm_blocks_ok(p->'blocks') then
    return jsonb_build_object('ok', false, 'error', 'invalid_blocks');
  end if;
  if nullif(p->>'segment_id', '') is not null and not exists (select 1 from app.crm_segments g where g.id = (p->>'segment_id')::uuid) then
    return jsonb_build_object('ok', false, 'error', 'invalid_segment');
  end if;
  if nullif(p->>'list_id', '') is not null and not exists (select 1 from app.crm_lists l where l.id = (p->>'list_id')::uuid and l.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_list');
  end if;
  if coalesce(p->>'style', 'branded') not in ('branded', 'letter') or coalesce(p->>'ab_metric', 'click') not in ('open', 'click')
     or coalesce(p->>'ab_percent', '20') !~ '^[0-9]{2}$' or (coalesce(p->>'ab_percent', '20'))::int not between 10 and 50
     or coalesce(p->>'ab_wait_hours', '4') !~ '^[0-9]{1,2}$' or (coalesce(p->>'ab_wait_hours', '4'))::int not between 1 and 48 then
    return jsonb_build_object('ok', false, 'error', 'invalid_ab');
  end if;
  if v_slug is not null and (v_slug !~ '^[a-z0-9-]{3,80}$'
      or exists (select 1 from app.crm_campaigns c where c.product_id = 'orgpuls' and c.slug = v_slug and c.id is distinct from p_id)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_slug');
  end if;

  if v_id is null then
    insert into app.crm_campaigns (name, kind, lang, subject, preheader, blocks, segment_id, list_id, utm_campaign, template_key, style, signature,
                                   subject_b, ab_percent, ab_metric, ab_wait_hours, publish_web, slug, web_description, created_by)
    values (btrim(p->>'name'), coalesce(p->>'kind', v_t.kind, 'newsletter'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            coalesce(p->>'subject', v_t.subject, ''), coalesce(p->>'preheader', v_t.preheader, ''), coalesce(p->'blocks', v_t.blocks, '[]'),
            nullif(p->>'segment_id', '')::uuid, nullif(p->>'list_id', '')::uuid, v_utm, v_t.key, coalesce(p->>'style', v_t.style, 'branded'),
            coalesce(p->>'signature', ''), coalesce(p->>'subject_b', ''), coalesce((p->>'ab_percent')::int, 20),
            coalesce(p->>'ab_metric', 'click'), coalesce((p->>'ab_wait_hours')::int, 4), coalesce((p->>'publish_web')::boolean, false),
            v_slug, coalesce(p->>'web_description', ''), auth.uid())
    returning id into v_id;
  else
    select status into v_status from app.crm_campaigns where id = v_id;
    if v_status is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_status <> 'draft' then
      return jsonb_build_object('ok', false, 'error', 'not_draft');
    end if;
    update app.crm_campaigns set name = btrim(p->>'name'), kind = coalesce(p->>'kind', kind),
      lang = case when p->>'lang' in ('no', 'en') then p->>'lang' else lang end,
      subject = coalesce(p->>'subject', subject), preheader = coalesce(p->>'preheader', preheader),
      blocks = coalesce(p->'blocks', blocks), segment_id = case when p ? 'segment_id' then nullif(p->>'segment_id', '')::uuid else segment_id end,
      list_id = case when p ? 'list_id' then nullif(p->>'list_id', '')::uuid else list_id end,
      utm_campaign = v_utm, style = coalesce(p->>'style', style), signature = coalesce(p->>'signature', signature),
      subject_b = coalesce(p->>'subject_b', subject_b), ab_percent = coalesce((p->>'ab_percent')::int, ab_percent),
      ab_metric = coalesce(p->>'ab_metric', ab_metric), ab_wait_hours = coalesce((p->>'ab_wait_hours')::int, ab_wait_hours),
      publish_web = coalesce((p->>'publish_web')::boolean, publish_web),
      slug = case when p ? 'slug' then v_slug else slug end, web_description = coalesce(p->>'web_description', web_description),
      updated_at = now()
    where id = v_id;
  end if;
  perform app.admin_log('crm.campaign_save', null, 'crm_campaign', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;
