-- 0063_acquisition_unknown.sql — an organisation with no recorded source is "not recorded" on
-- the cost page, as it is on the web page (0050), not "direct" (D-107). 0062 counted it as
-- direct, which put signups the site never saw arrive into a channel.

create or replace function public.admin_acquisition(p_months int default 12) returns jsonb
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
                 coalesce(a.channel, 'unknown') as channel,
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
