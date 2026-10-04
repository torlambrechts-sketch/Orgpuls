-- 0202_downgrade_to_free.sql — a paying customer may move to the free plan (D-226).
--
-- Before this, the only way out of a paid plan was cancelling, which ends in deletion (0064, 0066).
-- Since the free plan exists (0201, D-217), a daglig leder may instead choose it:
--
--   * public.downgrade_to_free: the paid period runs out first — a monthly plan to the end of the
--     month, a yearly one to the end of its paid year, counted as cancel_subscription counts — and
--     from the next day the organisation is on the free plan. Nothing is deleted. app.billing.free_from
--     holds that day.
--   * public.withdraw_downgrade: until that day the choice can be taken back.
--   * app.billing_downgrade_tick (hourly): once the day has come, the confirmation is cleared, so every
--     reader of confirmed_at (MRR, paying counts, the funnel) stops counting the organisation at once.
--     org_access reads free_from before confirmed_at, so access is right between the day and the tick.
--   * save_billing: confirming a plan again clears free_from, before or after the day.
--
-- Also here, the two follow-ups D-217 named:
--   * admin_org_detail names the billing interval, and its MRR counts a yearly invoice as a twelfth.
--     It is patched in place, as 0150 patched it: the hosted project carries a later version of it
--     (0196, not on main), and a definition written out here would overwrite that one.
--   * admin_kpis counts the organisations on the free plan.

alter table app.billing add column free_from timestamptz;
comment on column app.billing.free_from is
  'The day a paying customer''s chosen move to the free plan takes effect (0202): the day after the paid period. Set by downgrade_to_free, cleared by withdraw_downgrade or a new confirmation.';

-- ---------------------------------------------------------------- access
-- 0201's, with the chosen move to the free plan read before the confirmation.
create or replace function app.org_access(p_org uuid) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce((
    select case
      when b.cancel_effective_at is not null and now() >= b.cancel_effective_at then 'read_only'
      when b.free_from is not null and now() >= b.free_from then 'free'
      when b.confirmed_at is not null then 'active'
      when now() < b.trial_ends_at then 'trial'
      when now() < b.trial_ends_at + make_interval(days => app.grace_days()) then 'grace'
      else 'free'
    end
    from app.billing b where b.org_id = p_org), 'trial')
$fn$;

-- free_from is the day the free plan began or begins: a chosen move, or the trial's end and grace
create or replace function public.org_access_state(p_org uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select case when app.is_org_member(p_org) then (
    select jsonb_build_object('access', app.org_access(p_org),
                              'trial_ends_at', b.trial_ends_at,
                              'free_from', coalesce(b.free_from, b.trial_ends_at + make_interval(days => app.grace_days())),
                              'read_only_from', b.trial_ends_at + make_interval(days => app.grace_days()),
                              'cancel_effective_at', b.cancel_effective_at,
                              'deletion_due_at', b.deletion_due_at)
    from app.billing b where b.org_id = p_org)
  end
$fn$;

-- ---------------------------------------------------------------- the paid period
-- The last paid day today, in Oslo's calendar: the end of the month, or for a yearly plan the day
-- before the next anniversary of its start. cancel_subscription (0201) counts the same way.
create function app.paid_last_day(p_org uuid) returns date
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  b app.billing;
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_start date;
begin
  select * into b from app.billing where org_id = p_org;
  if not found or b.confirmed_at is null then
    return null;
  end if;
  if b.billing_interval = 'year' then
    v_start := (greatest(b.trial_ends_at, b.confirmed_at) at time zone 'Europe/Oslo')::date;
    if v_today < v_start then
      -- nothing paid yet: the free plan can begin the day the first period would have
      return v_start - 1;
    end if;
    return (v_start + make_interval(years => extract(year from age(v_today, v_start))::int + 1) - interval '1 day')::date;
  end if;
  -- chosen before the trial is over: nothing has been invoiced, so the free plan begins when it ends
  if v_today < (b.trial_ends_at at time zone 'Europe/Oslo')::date then
    return (b.trial_ends_at at time zone 'Europe/Oslo')::date - 1;
  end if;
  return (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
end $fn$;

-- ---------------------------------------------------------------- choosing the free plan
create function public.downgrade_to_free(p_org uuid, p_confirm boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  b app.billing;
  v_last date;
  v_from timestamptz;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_confirm is not true then
    return jsonb_build_object('ok', false, 'error', 'confirm_required');
  end if;
  select * into b from app.billing where org_id = p_org for update;
  if not found or b.confirmed_at is null or app.org_access(p_org) <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_subscribed');
  end if;
  if b.cancelled_at is not null then
    return jsonb_build_object('ok', false, 'error', 'cancelled');
  end if;
  if b.free_from is not null then
    return jsonb_build_object('ok', false, 'error', 'already_chosen');
  end if;

  v_last := app.paid_last_day(p_org);
  v_from := ((v_last + 1)::timestamp at time zone 'Europe/Oslo');
  update app.billing set free_from = v_from, updated_at = now() where org_id = p_org;
  return jsonb_build_object('ok', true, 'last_day', v_last, 'free_from', v_from);
end $fn$;

create function public.withdraw_downgrade(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update app.billing set free_from = null, updated_at = now()
  where org_id = p_org and free_from is not null and now() < free_from;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_chosen');
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

-- once the day has come, the subscription is no longer confirmed: MRR and paying counts follow
create function app.billing_downgrade_tick() returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  update app.billing
     set confirmed_at = null, confirmed_by = null, updated_at = now()
   where free_from is not null and now() >= free_from and confirmed_at is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

select cron.schedule('orgpuls-billing-downgrade', '5 * * * *', $cron$select app.billing_downgrade_tick()$cron$);

-- ---------------------------------------------------------------- save_billing
-- 0201's, but a confirmation also clears a chosen move to the free plan: before the day it is taken
-- back, after it the organisation is a paying customer again from today.
create or replace function public.save_billing(
  p_org uuid,
  p_plan text,
  p_invoice_email text,
  p_invoice_ref text,
  p_ehf boolean,
  p_confirm boolean,
  p_interval text default 'month'
) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_employees int;
  v_org_number text;
  v_email text := lower(btrim(coalesce(p_invoice_email, '')));
  v_ref text := nullif(btrim(coalesce(p_invoice_ref, '')), '');
  v_interval text := coalesce(p_interval, 'month');
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  select o.employee_count, o.org_number into v_employees, v_org_number
  from app.organizations o where o.id = p_org;

  if p_plan is null or p_plan not in ('small', 'usual', 'group') then
    return jsonb_build_object('ok', false, 'error', 'invalid_plan');
  end if;
  if v_interval not in ('month', 'year') then
    return jsonb_build_object('ok', false, 'error', 'invalid_interval');
  end if;
  if (p_plan = 'small' and v_employees > 25) or (p_plan = 'usual' and v_employees > 100) then
    return jsonb_build_object('ok', false, 'error', 'plan_too_small');
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if v_ref is not null and char_length(v_ref) > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_ref');
  end if;
  -- EHF is addressed by organisation number; without one there is nowhere to send it
  if coalesce(p_ehf, false) and v_org_number is null then
    return jsonb_build_object('ok', false, 'error', 'ehf_needs_orgnr');
  end if;

  update app.billing b
     set plan = p_plan,
         billing_interval = v_interval,
         invoice_email = v_email,
         invoice_ref = v_ref,
         ehf = coalesce(p_ehf, false),
         -- 0202: confirming again after the move to the free plan took effect starts a new subscription
         confirmed_at = case when coalesce(p_confirm, false) and (b.confirmed_at is null or (b.free_from is not null and now() >= b.free_from))
                             then now() else b.confirmed_at end,
         confirmed_by = case when coalesce(p_confirm, false) and (b.confirmed_at is null or (b.free_from is not null and now() >= b.free_from))
                             then auth.uid() else b.confirmed_by end,
         free_from = case when coalesce(p_confirm, false) then null else b.free_from end,
         updated_at = now()
   where b.org_id = p_org;

  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- the admin
-- admin_org_detail, patched in place (see the header): the interval, and MRR as a twelfth of a year
do $$
declare
  r record;
  v_def text;
begin
  for r in select * from (values
    ('public.admin_org_detail(uuid)', '''plan'', b.plan, ''trial_started_at''', '''plan'', b.plan, ''billing_interval'', b.billing_interval, ''free_from'', b.free_from, ''trial_started_at'''),
    ('public.admin_org_detail(uuid)', 'app.plan_monthly_nok(b.plan)', 'app.plan_mrr_nok(b.plan, b.billing_interval)')
  ) as t(fn, old_text, new_text) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in v_def) = 0 then
      raise exception '0202: % does not hold «%»; read its definition and write this by hand', r.fn, r.old_text;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end $$;

-- admin_kpis (0201's) with the organisations on the free plan
create or replace function public.admin_kpis() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if app.admin_role() is null or app.admin_role() = 'editor' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('kpis.view');
  return (
    select jsonb_build_object(
      'ok', true,
      'orgs', count(*),
      'paying', count(*) filter (where b.confirmed_at is not null and b.plan in ('small', 'usual')),
      'offers_requested', count(*) filter (where b.confirmed_at is not null and b.plan = 'group'),
      'trials_active', count(*) filter (where b.confirmed_at is null and b.trial_ends_at > now()),
      'trials_expiring_7d', count(*) filter (where b.confirmed_at is null and b.trial_ends_at between now() and now() + interval '7 days'),
      'trials_expired', count(*) filter (where b.confirmed_at is null and b.trial_ends_at <= now()),
      -- 0202: on the free plan now, after the trial or by choice (a demo sandbox is not counted)
      'free_plan', count(*) filter (where app.org_access(o.id) = 'free' and not app.is_demo(o.id)),
      'mrr', coalesce(sum(app.plan_mrr_nok(b.plan, b.billing_interval)) filter (where b.confirmed_at is not null), 0),
      'arr', coalesce(sum(app.plan_mrr_nok(b.plan, b.billing_interval)) filter (where b.confirmed_at is not null), 0) * 12,
      -- of the trials that have run their course (confirmed, or ended), the share confirmed
      'conversion', round(100.0 * count(*) filter (where b.confirmed_at is not null)
                          / nullif(count(*) filter (where b.confirmed_at is not null or b.trial_ends_at <= now()), 0), 1))
    from app.billing b join app.organizations o on o.id = b.org_id
  );
end $fn$;

-- ---------------------------------------------------------------- grants
revoke all on function app.paid_last_day(uuid) from public, anon, authenticated;
revoke all on function app.billing_downgrade_tick() from public, anon, authenticated;
revoke all on function public.downgrade_to_free(uuid, boolean) from public, anon;
grant execute on function public.downgrade_to_free(uuid, boolean) to authenticated;
revoke all on function public.withdraw_downgrade(uuid) from public, anon;
grant execute on function public.withdraw_downgrade(uuid) to authenticated;
