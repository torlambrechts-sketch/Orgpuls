-- 0064_cancellation.sql — a customer's cancellation, and the deletion 30 days after it ends
-- (D-108).
--
-- The home page promises "Sier dere opp, sletter vi svarene etter 30 dager", and the data
-- processing agreement (§ 11) that Orgpuls deletes the customer's personal data within 30
-- days of the agreement ending. Until now nothing did. This does:
--
--   1. **Registering.** An admin records a cancellation from the customer's message
--      (admin_cancel_org): the day the agreement ends and why. The day after that date the
--      organisation is read-only, exactly as an unpaid one after its grace (0052): members can
--      sign in, read everything and download the report as PDF, but start nothing. Deletion
--      is due 30 days after the end. A cancellation can be withdrawn until it is carried out.
--   2. **Telling the customer.** Two service mails on the trial-mail stream (0060): one when
--      the cancellation is registered (the dates, and "download the report"), one seven days
--      before deletion. The app's banner says the same from the end date on.
--   3. **Deleting.** app.deletion_run() runs daily and deletes every organisation whose
--      deletion is due, through app.delete_organisation():
--        * rounds first, then the organisation. A group with answers cannot be deleted
--          while its answers exist (0042, responses.group_id has no cascade on purpose), and
--          inside one cascade PostgreSQL checks that before the answers are gone. Deleting
--          the rounds removes responses, answers and comments through their cascade, which
--          their append-only triggers allow because the response row is gone first;
--        * support tickets about the organisation: the privacy statement keeps them only
--          while the customer relationship lasts;
--        * sign-in accounts that belonged to this organisation only (never a platform
--          admin), with their identities and second factors;
--        * CRM contacts that exist only because of the customer relationship. A contact who
--          subscribed with their own consent stays; the company stays as a company from the
--          public register, marked lost.
--      What was deleted is written to app.deletion_log: the organisation number and name,
--      the dates, who ran it and how many rows of each kind. It holds no person's data and
--      is the record that the promise was kept.
--   4. **Deleting now.** A super-admin may delete a cancelled organisation before its date,
--      for an erasure request, by typing its organisation number (admin_delete_now).
--
-- All of it is SECURITY DEFINER and ungranted except the audited admin functions; no client
-- can delete an organisation.

-- ---------------------------------------------------------------- columns and the log
alter table app.billing
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users (id) on delete set null,
  add column cancel_effective_at timestamptz,
  add column deletion_due_at timestamptz,
  add constraint billing_cancel_whole check (
    (cancelled_at is null and cancel_effective_at is null and deletion_due_at is null)
    or (cancelled_at is not null and cancel_effective_at is not null and deletion_due_at = cancel_effective_at + interval '30 days'));
create index billing_cancelled_by on app.billing (cancelled_by);
create index billing_deletion_due on app.billing (deletion_due_at) where deletion_due_at is not null;

create table app.deletion_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,                -- no foreign key: the organisation is gone
  org_number text,
  org_name text not null,
  cancelled_at timestamptz,
  cancel_effective_at timestamptz,
  deletion_due_at timestamptz,
  deleted_at timestamptz not null default now(),
  run_by text not null check (run_by in ('schedule', 'admin')),
  admin_id uuid references auth.users (id) on delete set null,
  counts jsonb not null
);
create index deletion_log_admin on app.deletion_log (admin_id);
alter table app.deletion_log enable row level security;
revoke all on app.deletion_log from public, anon, authenticated;

-- ---------------------------------------------------------------- access
-- After the end date a cancelled organisation reads as read_only, whatever its plan.
create or replace function app.org_access(p_org uuid) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce((
    select case
      when b.cancel_effective_at is not null and now() >= b.cancel_effective_at then 'read_only'
      when b.confirmed_at is not null then 'active'
      when now() < b.trial_ends_at then 'trial'
      when now() < b.trial_ends_at + make_interval(days => app.grace_days()) then 'grace'
      else 'read_only'
    end
    from app.billing b where b.org_id = p_org), 'trial')
$fn$;

create or replace function public.org_access_state(p_org uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select case when app.is_org_member(p_org) then (
    select jsonb_build_object('access', app.org_access(p_org),
                              'trial_ends_at', b.trial_ends_at,
                              'read_only_from', b.trial_ends_at + make_interval(days => app.grace_days()),
                              'cancel_effective_at', b.cancel_effective_at,
                              'deletion_due_at', b.deletion_due_at)
    from app.billing b where b.org_id = p_org)
  end
$fn$;

-- ---------------------------------------------------------------- the two mails
alter table app.lifecycle_mail drop constraint lifecycle_mail_step_check;
alter table app.lifecycle_mail add constraint lifecycle_mail_step_check check (step in (
  'welcome', 'setup_help', 'first_sent', 'results_ready', 'trial_ending', 'trial_ended', 'read_only_soon',
  'cancelled', 'deletion_soon'));

-- The trial's steps stop once a cancellation is registered; the cancellation's own two follow it.
create or replace function app.lifecycle_due(p_org uuid, p_step text) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select case
    when p_step = 'cancelled' then b.cancelled_at is not null and b.cancelled_at > now() - interval '3 days'
    when p_step = 'deletion_soon' then b.deletion_due_at is not null
      and now() >= b.deletion_due_at - interval '7 days' and now() < b.deletion_due_at
    when b.cancelled_at is not null then false
    else case p_step
      when 'welcome' then o.created_at > now() - interval '3 days'
      when 'setup_help' then o.created_at <= now() - interval '48 hours' and o.created_at > now() - interval '10 days'
        and not exists (select 1 from app.employees e where e.org_id = o.id)
        and b.confirmed_at is null
      when 'first_sent' then exists (select 1 from app.invitations i where i.org_id = o.id and i.sent_at > now() - interval '7 days')
        and not app.org_unlocked(o.id)
      when 'results_ready' then app.org_unlocked(o.id)
      when 'trial_ending' then b.confirmed_at is null and now() >= b.trial_ends_at - interval '3 days' and now() < b.trial_ends_at
      when 'trial_ended' then b.confirmed_at is null and app.org_access(o.id) = 'grace'
        and now() < b.trial_ends_at + interval '7 days'
      when 'read_only_soon' then b.confirmed_at is null and app.org_access(o.id) = 'grace'
        and now() >= b.trial_ends_at + make_interval(days => app.grace_days() - 3)
      else false
    end
  end
  from app.organizations o join app.billing b on b.org_id = o.id
  where o.id = p_org
$fn$;

-- The trial's steps for organisations created since the sequence began; the cancellation's
-- for every organisation, since the promise is to every customer.
create or replace function app.lifecycle_plan() returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_count int;
  v_more int;
begin
  if not (select s.enabled from app.lifecycle_settings s) then
    return 0;
  end if;
  insert into app.lifecycle_mail (org_id, user_id, step)
  select o.id, m.user_id, s.step
  from app.organizations o
  join app.lifecycle_settings ls on o.created_at >= ls.started_at
  join app.memberships m on m.org_id = o.id and m.active and m.role = 'daglig_leder'
  join auth.users u on u.id = m.user_id
  cross join unnest(array['welcome', 'setup_help', 'first_sent', 'results_ready', 'trial_ending', 'trial_ended', 'read_only_soon']) as s(step)
  where o.mail_enabled
    and o.created_at > now() - interval '60 days'
    and u.email is not null and not app.reserved_address(u.email::text)
    and app.lifecycle_due(o.id, s.step)
  on conflict (org_id, user_id, step) do nothing;
  get diagnostics v_count = row_count;

  insert into app.lifecycle_mail (org_id, user_id, step)
  select o.id, m.user_id, s.step
  from app.organizations o
  join app.billing b on b.org_id = o.id and b.cancelled_at is not null
  join app.memberships m on m.org_id = o.id and m.active and m.role = 'daglig_leder'
  join auth.users u on u.id = m.user_id
  cross join unnest(array['cancelled', 'deletion_soon']) as s(step)
  where o.mail_enabled
    and u.email is not null and not app.reserved_address(u.email::text)
    and app.lifecycle_due(o.id, s.step)
  on conflict (org_id, user_id, step) do nothing;
  get diagnostics v_more = row_count;
  return v_count + v_more;
end $fn$;

create or replace function public.lifecycle_mail_claim(p_batch int default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v jsonb;
begin
  update app.lifecycle_mail lm set status = 'skipped', leased_until = null
  where lm.status = 'pending'
    and (not app.lifecycle_due(lm.org_id, lm.step)
         or not exists (select 1 from app.organizations o where o.id = lm.org_id and o.mail_enabled)
         or not exists (select 1 from app.memberships m where m.org_id = lm.org_id and m.user_id = lm.user_id
                        and m.active and m.role = 'daglig_leder'));

  with c as (
    select lm.id from app.lifecycle_mail lm
    where (lm.status = 'pending' or (lm.status = 'sending' and lm.leased_until < now())) and lm.attempts < 5
    order by lm.created_at limit least(greatest(coalesce(p_batch, 20), 1), 50)
    for update skip locked
  ), u as (
    update app.lifecycle_mail lm set status = 'sending', leased_until = now() + interval '2 minutes', attempts = lm.attempts + 1
    from c where lm.id = c.id returning lm.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'step', u.step,
    'to_email', lower(au.email::text), 'name', split_part(coalesce(p.full_name, ''), ' ', 1), 'lang', coalesce(p.lang, 'no'),
    'org', o.name, 'k', o.threshold,
    'trial_ends_at', b.trial_ends_at, 'read_only_from', b.trial_ends_at + make_interval(days => app.grace_days()),
    'cancel_effective_at', b.cancel_effective_at, 'deletion_due_at', b.deletion_due_at)), '[]') into v
  from u
  join app.organizations o on o.id = u.org_id
  join app.billing b on b.org_id = u.org_id
  join auth.users au on au.id = u.user_id
  left join app.profiles p on p.id = u.user_id;
  return v;
end $fn$;

-- ---------------------------------------------------------------- a trigger that blocked maintenance
-- A measure's effect round is checked against its organisation (0023). The check ran on every
-- update, so when the round a measure was raised from was deleted, PostgreSQL's own
-- ON DELETE SET NULL re-checked the effect round, already gone in the same deletion, and
-- refused. The rule is about what a person sets: check it when the effect round is set or
-- changed, not when the database maintains another column (CLAUDE.md).
create or replace function app.measure_effect_round_ok() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare v_org uuid;
begin
  if new.effect_round_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.effect_round_id is not distinct from old.effect_round_id then
    return new;
  end if;

  if new.effect_round_id = new.round_id then
    raise exception 'a measure cannot be evaluated by the round it was raised from';
  end if;

  select r.org_id into v_org from app.rounds r where r.id = new.effect_round_id;
  if v_org is distinct from new.org_id then
    raise exception 'round % is not in organisation %', new.effect_round_id, new.org_id;
  end if;

  return new;
end $fn$;

-- ---------------------------------------------------------------- deleting
create function app.delete_organisation(p_org uuid, p_run_by text, p_admin uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  o app.organizations;
  b app.billing;
  v_users uuid[];
  v_gone uuid[];
  v_counts jsonb;
  v_n int;
begin
  select * into o from app.organizations where id = p_org;
  if not found then
    return null;
  end if;
  select * into b from app.billing where org_id = p_org;
  select coalesce(array_agg(distinct m.user_id), '{}') into v_users from app.memberships m where m.org_id = p_org;

  v_counts := jsonb_build_object(
    'employees', (select count(*) from app.employees e where e.org_id = p_org),
    'groups', (select count(*) from app.groups g where g.org_id = p_org),
    'rounds', (select count(*) from app.rounds r where r.org_id = p_org),
    'responses', (select count(*) from app.responses r where r.org_id = p_org),
    'measures', (select count(*) from app.measures m where m.org_id = p_org),
    'members', cardinality(v_users),
    'tickets', (select count(*) from app.tickets t where t.org_id = p_org));

  -- CRM: people known only through the customer relationship go; the company stays, lost
  delete from app.crm_contacts c where c.org_id = p_org and c.basis <> 'consent';
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('crm_contacts', v_n);
  update app.crm_companies set stage = 'lost', stage_changed_at = now(), updated_at = now()
  where org_id = p_org and stage in ('trial', 'customer');

  -- support history is kept only while the customer relationship lasts
  delete from app.tickets where org_id = p_org;

  -- rounds before the organisation: a group cannot go while its answers exist (0042)
  delete from app.rounds where org_id = p_org;
  delete from app.organizations where id = p_org;

  -- sign-in accounts that belonged here only, never a platform admin's
  select coalesce(array_agg(x.u), '{}') into v_gone
  from unnest(v_users) x(u)
  where not exists (select 1 from app.memberships m where m.user_id = x.u)
    and not exists (select 1 from app.platform_admins pa where pa.user_id = x.u);
  delete from auth.mfa_factors where user_id = any(v_gone);
  delete from auth.identities where user_id = any(v_gone);
  delete from auth.users where id = any(v_gone);
  v_counts := v_counts || jsonb_build_object('accounts', cardinality(v_gone));

  insert into app.deletion_log (org_id, org_number, org_name, cancelled_at, cancel_effective_at, deletion_due_at, run_by, admin_id, counts)
  values (p_org, o.org_number, o.name, b.cancelled_at, b.cancel_effective_at, b.deletion_due_at, p_run_by, p_admin, v_counts);
  return v_counts;
end $fn$;

create function app.deletion_run() returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r record;
  v int := 0;
begin
  for r in select b.org_id from app.billing b where b.deletion_due_at is not null and b.deletion_due_at <= now() order by b.deletion_due_at
  loop
    perform app.delete_organisation(r.org_id, 'schedule');
    v := v + 1;
  end loop;
  return v;
end $fn$;

select cron.schedule('orgpuls-deletion', '40 2 * * *', $job$select app.deletion_run()$job$);

-- ---------------------------------------------------------------- the admin's side
-- p_ends: the last day of the agreement (Oslo). It ends at midnight after it; deletion 30 days on.
create function public.admin_cancel_org(p_org uuid, p_ends date, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_end timestamptz;
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_ends is null or p_ends < v_today or p_ends > v_today + 366 then
    return jsonb_build_object('ok', false, 'error', 'invalid_date');
  end if;
  if not exists (select 1 from app.billing b where b.org_id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if exists (select 1 from app.billing b where b.org_id = p_org and b.cancelled_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'already_cancelled');
  end if;
  v_end := ((p_ends + 1)::timestamp at time zone 'Europe/Oslo');
  update app.billing set cancelled_at = now(), cancelled_by = auth.uid(), cancel_effective_at = v_end,
                         deletion_due_at = v_end + interval '30 days', updated_at = now()
  where org_id = p_org;
  perform app.admin_log('org.cancel', p_org, 'billing', p_org::text, left(btrim(p_reason), 500),
    jsonb_build_object('ends', p_ends, 'deletion_due', v_end + interval '30 days'));
  perform app.lifecycle_plan();
  return jsonb_build_object('ok', true, 'effective_at', v_end, 'deletion_due_at', v_end + interval '30 days');
end $fn$;

create function public.admin_cancel_withdraw(p_org uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  update app.billing set cancelled_at = null, cancelled_by = null, cancel_effective_at = null, deletion_due_at = null, updated_at = now()
  where org_id = p_org and cancelled_at is not null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_cancelled');
  end if;
  perform app.admin_log('org.cancel_withdraw', p_org, 'billing', p_org::text, left(btrim(p_reason), 500), '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $fn$;

-- Before its date, for an erasure request: a super-admin, a cancelled organisation, its number typed.
create function public.admin_delete_now(p_org uuid, p_confirm text, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  o app.organizations;
  v jsonb;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into o from app.organizations where id = p_org;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from app.billing b where b.org_id = p_org and b.cancelled_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'not_cancelled');
  end if;
  if regexp_replace(coalesce(p_confirm, ''), '\s', '', 'g') is distinct from coalesce(o.org_number, o.name) then
    return jsonb_build_object('ok', false, 'error', 'confirm_mismatch');
  end if;
  -- logged before, so the audit names the organisation while it still exists
  perform app.admin_log('org.delete_now', p_org, 'organizations', p_org::text, left(btrim(p_reason), 500), '{}'::jsonb);
  v := app.delete_organisation(p_org, 'admin', auth.uid());
  return jsonb_build_object('ok', true, 'counts', v);
end $fn$;

create function public.admin_org_cancellation(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'row', (
    select jsonb_build_object('cancelled_at', b.cancelled_at, 'cancelled_by', u.email, 'effective_at', b.cancel_effective_at,
                              'deletion_due_at', b.deletion_due_at, 'org_number', o.org_number)
    from app.billing b join app.organizations o on o.id = b.org_id left join auth.users u on u.id = b.cancelled_by
    where b.org_id = p_org));
end $fn$;

-- Every cancellation not yet carried out, and every deletion carried out.
create function public.admin_deletions() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('deletions.view');
  return jsonb_build_object('ok', true,
    'pending', (select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'org_number', o.org_number,
                  'cancelled_at', b.cancelled_at, 'effective_at', b.cancel_effective_at, 'deletion_due_at', b.deletion_due_at)
                  order by b.deletion_due_at), '[]')
                from app.billing b join app.organizations o on o.id = b.org_id where b.cancelled_at is not null),
    'done', (select coalesce(jsonb_agg(jsonb_build_object('org_number', d.org_number, 'name', d.org_name,
               'cancelled_at', d.cancelled_at, 'deletion_due_at', d.deletion_due_at, 'deleted_at', d.deleted_at,
               'run_by', d.run_by, 'admin', u.email, 'counts', d.counts) order by d.deleted_at desc), '[]')
             from (select * from app.deletion_log order by deleted_at desc limit 200) d left join auth.users u on u.id = d.admin_id));
end $fn$;

-- ---------------------------------------------------------------- grants
revoke all on function app.delete_organisation(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app.deletion_run() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.admin_cancel_org(uuid,date,text)', 'public.admin_cancel_withdraw(uuid,text)',
                           'public.admin_delete_now(uuid,text,text)', 'public.admin_org_cancellation(uuid)', 'public.admin_deletions()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
