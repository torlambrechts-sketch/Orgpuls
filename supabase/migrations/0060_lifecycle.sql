-- 0060_lifecycle.sql — the trial's mail, sent by what the customer does, and an account
-- health score the admin can read the reasons of (D-105, X-063).
--
-- **Seven mails, each once per organisation and daglig leder, each only while it is true.**
--
--   welcome         at signup: one thing to do first, the employee list
--   setup_help      48 hours in and no employees yet: an offer of help
--   first_sent      the first invitations went out: how to reach five answers
--   results_ready   the first group passed the threshold: the report and the documentation
--   trial_ending    three days before the trial ends, unless a plan is confirmed
--   trial_ended     the trial ended and the grace period began, unless confirmed
--   read_only_soon  three days before read-only, unless confirmed
--
-- They are service mail about the trial the customer started, sent from the product's own
-- sender, not marketing: no consent list, no campaign. Replies go to support, and each mail
-- says so, since its purpose is to be answered when help is wanted.
--
-- app.lifecycle_plan() queues what has become true, every fifteen minutes. The claim checks
-- each row again and skips what is no longer true — a trial_ending for an organisation
-- that confirmed an hour ago is never sent. Organisations created before this migration get
-- none: they did not sign up to a sequence, and some were imported (D-90).
--
-- **Account health** (admin_account_health): 0–100 from activation (50), recent sign-in (25),
-- the last round's response rate (15) and size (10), with the reasons as words. A trial that
-- reached results, or sent a survey and is large enough, is marked a qualified trial: the
-- one sales should call. The score reads only counts the admin already sees, never an answer.
--
-- Also: record_signup_source(jsonb, jsonb), kept by 0059 while the old app was live, is dropped.

drop function if exists public.record_signup_source(jsonb, jsonb);

-- ---------------------------------------------------------------- tables
create table app.lifecycle_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  -- organisations created before this get no sequence
  started_at timestamptz not null default now()
);
insert into app.lifecycle_settings (id) values (true);
alter table app.lifecycle_settings enable row level security;
revoke all on app.lifecycle_settings from public, anon, authenticated;

create table app.lifecycle_mail (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  step text not null check (step in ('welcome', 'setup_help', 'first_sent', 'results_ready', 'trial_ending', 'trial_ended', 'read_only_soon')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  leased_until timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_id text,
  last_error text check (last_error ~ '^[a-z0-9_]{1,40}$'),
  unique (org_id, user_id, step)
);
create index lifecycle_mail_due on app.lifecycle_mail (created_at) where status in ('pending', 'sending');
create index lifecycle_mail_user on app.lifecycle_mail (user_id);
alter table app.lifecycle_mail enable row level security;
revoke all on app.lifecycle_mail from public, anon, authenticated;

-- ---------------------------------------------------------------- facts
-- A closed round where some group reached the threshold: the first result a customer can read.
create function app.org_unlocked(p_org uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1 from app.rounds r
    join app.invitations i on i.round_id = r.id and i.responded_at is not null
    join app.employees e on e.id = i.employee_id
    join app.organizations o on o.id = r.org_id
    where r.org_id = p_org and r.status = 'lukket'
    group by r.id, e.group_id, o.threshold having count(*) >= o.threshold)
$fn$;

-- Whether a step is true for an organisation now. The plan queues on it and the claim checks it again.
create function app.lifecycle_due(p_org uuid, p_step text) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select case p_step
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
  from app.organizations o join app.billing b on b.org_id = o.id
  where o.id = p_org
$fn$;

-- ---------------------------------------------------------------- the plan
create function app.lifecycle_plan() returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_count int;
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
  return v_count;
end $fn$;

select cron.schedule('orgpuls-lifecycle-plan', '*/15 * * * *', $job$select app.lifecycle_plan()$job$);

-- ---------------------------------------------------------------- the dispatcher's half
-- Rows due now, checked again: what is no longer true is skipped, not sent.
create function public.lifecycle_mail_claim(p_batch int default 20) returns jsonb
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
    'trial_ends_at', b.trial_ends_at, 'read_only_from', b.trial_ends_at + make_interval(days => app.grace_days()))), '[]') into v
  from u
  join app.organizations o on o.id = u.org_id
  join app.billing b on b.org_id = u.org_id
  join auth.users au on au.id = u.user_id
  left join app.profiles p on p.id = u.user_id;
  return v;
end $fn$;

create function public.lifecycle_mail_done(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null, p_permanent boolean default false)
  returns void
  language sql security definer set search_path = ''
as $fn$
  update app.lifecycle_mail set
    status = case when p_ok then 'sent' when p_permanent or attempts >= 5 then 'failed' else 'pending' end,
    provider_id = case when p_ok then left(p_provider_id, 200) else provider_id end,
    sent_at = case when p_ok then now() else sent_at end,
    last_error = case when p_ok then null else left(regexp_replace(lower(coalesce(p_error, 'unknown')), '[^a-z0-9_]', '_', 'g'), 40) end,
    leased_until = null
  where id = p_id
$fn$;

-- ---------------------------------------------------------------- admin reads
-- One organisation's trial mail: which went, which were skipped.
create function public.admin_org_lifecycle(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('lifecycle.view', p_org);
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('step', lm.step, 'status', lm.status, 'created_at', lm.created_at,
                                                 'sent_at', lm.sent_at, 'last_error', lm.last_error) order by lm.created_at), '[]')
    from app.lifecycle_mail lm where lm.org_id = p_org));
end $fn$;

-- Every organisation in trial, grace or read-only, and every paying one, scored with reasons.
create function public.admin_account_health() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('health.view');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.score desc, s.created_at desc), '[]') from (
      select f.*,
             f.activation_points + f.recency_points + f.response_points + f.size_points as score,
             (f.access in ('trial', 'grace') and (f.unlocked or (f.sent and coalesce(f.employees, 0) >= 10))) as qualified
      from (
        select a.*,
               10 * ((a.employees_uploaded)::int + (a.scheduled)::int + (a.sent)::int + (a.unlocked)::int + (a.measure)::int) as activation_points,
               case when a.last_sign_in > now() - interval '7 days' then 25
                    when a.last_sign_in > now() - interval '30 days' then 10 else 0 end as recency_points,
               case when a.last_invited > 0 and a.last_answered::numeric / a.last_invited >= 0.6 then 15
                    when a.last_invited > 0 and a.last_answered::numeric / a.last_invited >= 0.4 then 8 else 0 end as response_points,
               case when coalesce(a.employees, 0) >= 20 then 10 when coalesce(a.employees, 0) >= 10 then 5 else 0 end as size_points
        from (
          select o.id, o.name, o.created_at, app.org_access(o.id) as access, b.trial_ends_at,
                 greatest(o.employee_count, o.registry_employees) as employees,
                 exists (select 1 from app.employees e where e.org_id = o.id) as employees_uploaded,
                 exists (select 1 from app.measurements ms where ms.org_id = o.id) as scheduled,
                 exists (select 1 from app.invitations i where i.org_id = o.id and i.sent_at is not null) as sent,
                 app.org_unlocked(o.id) as unlocked,
                 exists (select 1 from app.measures me where me.org_id = o.id) as measure,
                 (select max(u.last_sign_in_at) from app.memberships m join auth.users u on u.id = m.user_id
                  where m.org_id = o.id and m.active) as last_sign_in,
                 last.invited as last_invited, last.answered as last_answered
          from app.organizations o
          join app.billing b on b.org_id = o.id
          left join lateral (
            select count(*) as invited, count(i.responded_at) as answered
            from app.invitations i
            where i.round_id = (select r.id from app.rounds r where r.org_id = o.id and r.status = 'lukket'
                                order by r.closes_at desc nulls last limit 1)
          ) last on true
        ) a
      ) f
    ) s));
end $fn$;

-- ---------------------------------------------------------------- grants
revoke all on function app.org_unlocked(uuid) from public, anon, authenticated;
revoke all on function app.lifecycle_due(uuid, text) from public, anon, authenticated;
revoke all on function app.lifecycle_plan() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.lifecycle_mail_claim(int)', 'public.lifecycle_mail_done(uuid,boolean,text,text,boolean)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.admin_org_lifecycle(uuid)', 'public.admin_account_health()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
