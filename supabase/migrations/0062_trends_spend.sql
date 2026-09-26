-- 0062_trends_spend.sql — the dashboard's numbers over time, and what a customer costs
-- to win by channel (D-107, X-063).
--
-- * **app.kpi_daily** — one row a day with the dashboard's own figures (admin_kpis'
--   definitions): MRR, paying, trials, grace, read-only, signups, the site's visitors and
--   sessions. Captured every evening and on demand. Nothing is backfilled: a past day's MRR
--   cannot be read from a table that keeps only the current plan, and an invented history
--   would look the same as a real one. The weekly series below is computed from tables that
--   do keep their history (organizations.created_at, billing.confirmed_at, web_events).
-- * **app.marketing_spend** — what a month cost on a channel (and optionally one campaign),
--   entered by an admin. With the first-touch channel of each paid organisation (0050,
--   0059), cost per signup and per paying customer by channel and month.
--
-- Both tables have RLS on and no grant; the admin reads and writes through audited functions.

create table app.kpi_daily (
  day date primary key,
  mrr int not null,
  paying int not null,
  trials int not null,
  grace int not null,
  read_only int not null,
  signups int not null,
  visitors int not null,
  sessions int not null,
  captured_at timestamptz not null default now()
);
alter table app.kpi_daily enable row level security;
revoke all on app.kpi_daily from public, anon, authenticated;

create table app.marketing_spend (
  id uuid primary key default gen_random_uuid(),
  month date not null check (month = date_trunc('month', month)::date),
  channel text not null check (channel in ('paid', 'social', 'email', 'organic', 'referral', 'campaign', 'ai', 'direct', 'other')),
  campaign text check (campaign is null or char_length(btrim(campaign)) between 1 and 80),
  amount_nok int not null check (amount_nok between 0 and 100000000),
  note text check (note is null or char_length(note) <= 200),
  entered_by uuid references auth.users (id) on delete set null,
  entered_at timestamptz not null default now()
);
create index marketing_spend_month on app.marketing_spend (month);
create index marketing_spend_entered_by on app.marketing_spend (entered_by);
alter table app.marketing_spend enable row level security;
revoke all on app.marketing_spend from public, anon, authenticated;

-- ---------------------------------------------------------------- capture
create function app.kpi_capture(p_day date default null) returns void
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Europe/Oslo')::date);
begin
  insert into app.kpi_daily (day, mrr, paying, trials, grace, read_only, signups, visitors, sessions)
  select v_day,
         coalesce(sum(app.plan_monthly_nok(b.plan)) filter (where b.confirmed_at is not null), 0),
         count(*) filter (where b.confirmed_at is not null and b.plan in ('small', 'usual')),
         count(*) filter (where app.org_access(o.id) = 'trial'),
         count(*) filter (where app.org_access(o.id) = 'grace'),
         count(*) filter (where app.org_access(o.id) = 'read_only'),
         count(*) filter (where (o.created_at at time zone 'Europe/Oslo')::date = v_day),
         (select count(distinct e.visitor) from app.web_events e where e.day = v_day),
         (select count(*) from (
            select e.visitor, e.at, lag(e.at) over (partition by e.visitor order by e.at, e.id) as prev
            from app.web_events e where e.day = v_day) x
          where x.prev is null or x.at - x.prev > interval '30 minutes')
  from app.billing b join app.organizations o on o.id = b.org_id
  on conflict (day) do update set
    mrr = excluded.mrr, paying = excluded.paying, trials = excluded.trials, grace = excluded.grace,
    read_only = excluded.read_only, signups = excluded.signups, visitors = excluded.visitors,
    sessions = excluded.sessions, captured_at = now();
end $fn$;

-- every evening, just before midnight in Oslo (21:55 UTC in summer, 22:55 in winter)
select cron.schedule('orgpuls-kpi-capture', '55 21,22 * * *', $job$select app.kpi_capture()$job$);
select app.kpi_capture();

-- ---------------------------------------------------------------- the dashboard's trends
create function public.admin_trends(p_weeks int default 26) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_weeks int := least(greatest(coalesce(p_weeks, 26), 4), 104);
  v_from date := (date_trunc('week', now() at time zone 'Europe/Oslo') - make_interval(weeks => least(greatest(coalesce(p_weeks, 26), 4), 104) - 1))::date;
begin
  if app.admin_role() is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('trends.view', null, null, null, null, jsonb_build_object('weeks', v_weeks));
  return jsonb_build_object(
    'ok', true,
    'daily', (select coalesce(jsonb_agg(to_jsonb(k) - 'captured_at' order by k.day), '[]')
              from app.kpi_daily k where k.day > (now() at time zone 'Europe/Oslo')::date - 400),
    'weekly', (select coalesce(jsonb_agg(w order by w.week), '[]') from (
        select wk.week::date as week,
               (select count(*) from app.organizations o
                 where date_trunc('week', o.created_at at time zone 'Europe/Oslo') = wk.week) as signups,
               (select count(*) from app.billing b
                 where b.confirmed_at is not null and date_trunc('week', b.confirmed_at at time zone 'Europe/Oslo') = wk.week) as converted,
               (select count(distinct (e.visitor, e.day)) from app.web_events e
                 where e.day >= wk.week::date and e.day < (wk.week + interval '7 days')::date) as visitors
        from generate_series(v_from::timestamp, date_trunc('week', now() at time zone 'Europe/Oslo'), interval '7 days') wk(week)) w));
end $fn$;

-- ---------------------------------------------------------------- spend and cost per customer
create function public.admin_spend_add(p_month date, p_channel text, p_campaign text, p_amount int, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if not app.is_platform_admin(array['super_admin', 'finance', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_month is null or p_channel is null or p_amount is null or p_amount < 0 or p_amount > 100000000
     or p_channel not in ('paid', 'social', 'email', 'organic', 'referral', 'campaign', 'ai', 'direct', 'other') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into app.marketing_spend (month, channel, campaign, amount_nok, note, entered_by)
  values (date_trunc('month', p_month)::date, p_channel, nullif(left(btrim(coalesce(p_campaign, '')), 80), ''),
          p_amount, nullif(left(btrim(coalesce(p_note, '')), 200), ''), auth.uid())
  returning id into v_id;
  perform app.admin_log('spend.add', null, null, null, null,
    jsonb_build_object('month', date_trunc('month', p_month)::date, 'channel', p_channel, 'amount', p_amount));
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

create function public.admin_spend_delete(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'finance', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  delete from app.marketing_spend where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('spend.delete', null, null, null, null, jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end $fn$;

-- Per month and channel: what was spent, and the signups and paying customers whose first
-- touch was that channel, signed up in that month. Cost per customer where both exist.
create function public.admin_acquisition(p_months int default 12) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_from date := (date_trunc('month', now() at time zone 'Europe/Oslo') - make_interval(months => least(greatest(coalesce(p_months, 12), 1), 36) - 1))::date;
begin
  if not app.is_platform_admin(array['super_admin', 'finance', 'marketing', 'analyst']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('acquisition.view');
  return jsonb_build_object(
    'ok', true,
    'rows', (select coalesce(jsonb_agg(r order by r.month desc, r.spend desc nulls last, r.channel), '[]') from (
        with orgs as (
          select date_trunc('month', o.created_at at time zone 'Europe/Oslo')::date as month,
                 coalesce(a.channel, 'direct') as channel,
                 exists (select 1 from app.billing b where b.org_id = o.id and b.confirmed_at is not null) as paid
          from app.organizations o left join app.org_attribution a on a.org_id = o.id
          where o.created_at >= v_from
        ), spend as (
          select s.month, s.channel, sum(s.amount_nok) as spend from app.marketing_spend s where s.month >= v_from group by 1, 2
        ), keys as (
          select month, channel from orgs union select month, channel from spend
        )
        select k.month, k.channel, sp.spend,
               (select count(*) from orgs where orgs.month = k.month and orgs.channel = k.channel) as signups,
               (select count(*) from orgs where orgs.month = k.month and orgs.channel = k.channel and orgs.paid) as paid
        from keys k left join spend sp on sp.month = k.month and sp.channel = k.channel) r),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'month', s.month, 'channel', s.channel, 'campaign', s.campaign,
                                                             'amount_nok', s.amount_nok, 'note', s.note, 'entered_at', s.entered_at,
                                                             'entered_by', u.email) order by s.month desc, s.entered_at desc), '[]')
                from app.marketing_spend s left join auth.users u on u.id = s.entered_by where s.month >= v_from));
end $fn$;

-- ---------------------------------------------------------------- grants
revoke all on function app.kpi_capture(date) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.admin_trends(int)', 'public.admin_spend_add(date,text,text,int,text)',
                           'public.admin_spend_delete(uuid)', 'public.admin_acquisition(int)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
