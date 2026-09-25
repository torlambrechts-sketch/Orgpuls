-- 0049_platform_admin.sql — Orgpuls' internal back-office: who may use it, what they may
-- see, and a record of everything they do. D-90, X-058. Specification: "Orgpuls — Platform
-- Admin Specification", phase 1.
--
-- The design constraints come before the features:
--
--   * Admin identities are separate from customer identities. A user is either a platform
--     admin (app.platform_admins) or a member of customer organisations, never both, in
--     either order (two triggers). No customer role can become an admin role.
--   * The admin role is only honoured on a session that has passed TOTP (aal2), checked in
--     the database (app.admin_role), not only in the app: a stolen password is not enough.
--   * Admins read customer data only through the SECURITY DEFINER functions below. None of
--     them touches app.responses, app.answers, app.extra_answers or app.response_comments,
--     and none returns a respondent: employees appear as counts, delivery as counts. The
--     customer tables keep RLS on with no admin policy; this is a named path, not a bypass.
--   * Every call that reads customer-scoped data, and every write, adds a row to
--     app.admin_audit, which nobody can change or delete.
--   * Every admin table carries product_id, as the admin is meant to be shared by products
--     on this stack.

-- ---------------------------------------------------------------- roles
create type app.platform_role as enum ('super_admin', 'support', 'finance', 'analyst');

create table app.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role app.platform_role not null,
  product_id text not null default 'orgpuls',
  mfa_enforced boolean not null default true,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index platform_admins_created_by on app.platform_admins (created_by);
alter table app.platform_admins enable row level security;
-- no policy and no grant: read and written only through the functions below

-- An admin is never a customer member, and a customer member is never an admin.
create function app.admin_not_member() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if exists (select 1 from app.memberships m where m.user_id = new.user_id) then
    raise exception 'a customer user cannot be a platform admin; use a separate admin account';
  end if;
  return new;
end $fn$;
create trigger platform_admins_separate before insert or update of user_id on app.platform_admins
  for each row execute function app.admin_not_member();

create function app.member_not_admin() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if exists (select 1 from app.platform_admins a where a.user_id = new.user_id) then
    raise exception 'a platform admin cannot be a member of a customer organisation';
  end if;
  return new;
end $fn$;
create trigger memberships_not_admin before insert or update of user_id on app.memberships
  for each row execute function app.member_not_admin();

-- The caller's admin role, or null. Null unless the account is an active admin AND the
-- session has passed a second factor (aal2) where MFA is enforced.
create function app.admin_role() returns app.platform_role
  language sql stable security definer set search_path = ''
as $fn$
  select a.role
  from app.platform_admins a
  where a.user_id = auth.uid()
    and a.active
    and (not a.mfa_enforced or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$fn$;

create function app.is_platform_admin(p_roles app.platform_role[]) returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select coalesce(app.admin_role() = any (p_roles), false) $fn$;

-- ---------------------------------------------------------------- audit
create table app.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  product_id text not null default 'orgpuls',
  -- who, copied rather than referenced, so the record outlives the account
  admin_id uuid,
  admin_email text,
  admin_role app.platform_role,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  -- what, copied rather than referenced, so the record outlives the organisation
  org_id uuid,
  org_name text,
  target_type text,
  target_id text,
  reason text check (reason is null or char_length(reason) <= 500),
  detail jsonb
);
create index admin_audit_org on app.admin_audit (org_id, at desc);
create index admin_audit_admin on app.admin_audit (admin_id, at desc);
create index admin_audit_at on app.admin_audit (at desc);
alter table app.admin_audit enable row level security;

-- Append-only. It references nothing, so there is no foreign-key maintenance to allow for.
create function app.admin_audit_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  raise exception 'the admin audit log is append-only';
end $fn$;
create trigger admin_audit_fixed before update or delete on app.admin_audit
  for each row execute function app.admin_audit_fixed();
create trigger admin_audit_no_truncate before truncate on app.admin_audit
  for each statement execute function app.admin_audit_fixed();

create function app.admin_log(
  p_action text, p_org uuid default null, p_target_type text default null, p_target_id text default null,
  p_reason text default null, p_detail jsonb default null
) returns void
  language sql volatile security definer set search_path = ''
as $fn$
  insert into app.admin_audit (admin_id, admin_email, admin_role, action, org_id, org_name, target_type, target_id, reason, detail)
  select auth.uid(), (select u.email::text from auth.users u where u.id = auth.uid()), app.admin_role(),
         p_action, p_org, (select o.name from app.organizations o where o.id = p_org), p_target_type, p_target_id,
         nullif(btrim(coalesce(p_reason, '')), ''), p_detail
$fn$;

-- ---------------------------------------------------------------- notes (a small CRM)
create table app.admin_org_notes (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'orgpuls',
  org_id uuid not null references app.organizations (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_email text,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index admin_org_notes_org on app.admin_org_notes (org_id, created_at desc);
create index admin_org_notes_author on app.admin_org_notes (author_id);
alter table app.admin_org_notes enable row level security;

-- ---------------------------------------------------------------- product events
-- The activation funnel's steps that no table records: a leader looking at results. Users
-- only — the respondent flow never writes here. One row per user, event and day.
create table app.product_events (
  id bigint generated always as identity primary key,
  product_id text not null default 'orgpuls',
  at timestamptz not null default now(),
  day date not null default (now() at time zone 'Europe/Oslo')::date,
  org_id uuid not null references app.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  role app.org_role,
  name text not null check (name in ('results_viewed', 'report_viewed', 'comments_viewed', 'measures_viewed'))
);
create unique index product_events_once on app.product_events (user_id, name, day);
create index product_events_org on app.product_events (org_id, name, at);
alter table app.product_events enable row level security;

create function public.track_product_event(p_name text) returns void
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_role app.org_role;
begin
  if auth.uid() is null or p_name not in ('results_viewed', 'report_viewed', 'comments_viewed', 'measures_viewed') then
    return;
  end if;
  select m.org_id, m.role into v_org, v_role
  from app.memberships m where m.user_id = auth.uid() and m.active
  order by m.created_at limit 1;
  if v_org is null then return; end if;
  insert into app.product_events (org_id, user_id, role, name) values (v_org, auth.uid(), v_role, p_name)
  on conflict (user_id, name, day) do nothing;
end $fn$;

-- ---------------------------------------------------------------- helpers
create function app.org_status(p_org uuid) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select case
    when b.confirmed_at is not null then 'active'
    when b.trial_ends_at > now() then 'trial'
    else 'expired'
  end
  from app.billing b where b.org_id = p_org
$fn$;

-- The list price per plan, until the plan catalogue (phase 2) holds prices as rows.
create function app.plan_monthly_nok(p_plan text) returns int
  language sql immutable set search_path = ''
as $fn$ select case p_plan when 'small' then 265 when 'usual' then 565 else null end $fn$;

-- ---------------------------------------------------------------- who am I
create function public.admin_whoami() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'is_admin', a.user_id is not null and a.active,
    'role', a.role,
    'mfa_enforced', coalesce(a.mfa_enforced, true),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'email', (select u.email::text from auth.users u where u.id = auth.uid())
  )
  from (select 1) one
  left join app.platform_admins a on a.user_id = auth.uid()
$fn$;

create function public.admin_record_login() returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if app.admin_role() is null then return; end if;
  perform app.admin_log('admin.login');
end $fn$;

-- ---------------------------------------------------------------- organisations
create function public.admin_org_list(p_search text default null, p_status text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_rows jsonb;
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('orgs.list', null, null, null, null,
    jsonb_strip_nulls(jsonb_build_object('search', v_q, 'status', p_status)));

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') into v_rows
  from (
    select o.id, o.name, o.org_number, o.employee_count, o.created_at,
           app.org_status(o.id) as status,
           b.plan, b.trial_ends_at, b.confirmed_at,
           case when b.confirmed_at is not null then app.plan_monthly_nok(b.plan) end as mrr,
           (select count(*) from app.employees e where e.org_id = o.id and e.active) as registered,
           (select count(*) from app.memberships m where m.org_id = o.id and m.active) as users,
           (select max(i.sent_at) from app.invitations i where i.org_id = o.id) as last_sent,
           last.invited as last_invited, last.answered as last_answered
    from app.organizations o
    join app.billing b on b.org_id = o.id
    left join lateral (
      select count(*) as invited, count(i.responded_at) as answered
      from app.invitations i
      where i.round_id = (select r.id from app.rounds r where r.org_id = o.id and r.status = 'lukket'
                          order by r.closes_at desc nulls last limit 1)
    ) last on true
    where (v_q is null
           or o.name ilike '%' || v_q || '%'
           or o.org_number = regexp_replace(v_q, '\s', '', 'g')
           or exists (select 1 from app.memberships m join auth.users u on u.id = m.user_id
                      where m.org_id = o.id and u.email ilike '%' || v_q || '%'))
      and (p_status is null or app.org_status(o.id) = p_status)
  ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end $fn$;

create function public.admin_org_detail(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_role app.platform_role := app.admin_role();
  v_support boolean;
  v_out jsonb;
begin
  if v_role is null or v_role = 'analyst' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.organizations where id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_support := v_role in ('super_admin', 'support');
  perform app.admin_log('org.view', p_org, 'organization', p_org::text);

  select jsonb_build_object(
    'ok', true,
    'org', jsonb_build_object(
      'id', o.id, 'name', o.name, 'org_number', o.org_number, 'employee_count', o.employee_count,
      'threshold', o.threshold, 'created_at', o.created_at, 'status', app.org_status(o.id),
      'registry_address', o.registry_address, 'registry_municipality', o.registry_municipality,
      'registry_nace_code', o.registry_nace_code, 'registry_nace_label', o.registry_nace_label,
      'registry_form_label', o.registry_form_label, 'registry_employees', o.registry_employees,
      'registry_fetched_at', o.registry_fetched_at, 'mail_enabled', o.mail_enabled, 'sms_enabled', o.sms_enabled),
    'billing', (select jsonb_build_object(
      'plan', b.plan, 'trial_started_at', b.trial_started_at, 'trial_ends_at', b.trial_ends_at,
      'trial_extended_at', b.trial_extended_at, 'invoice_email', b.invoice_email, 'invoice_ref', b.invoice_ref,
      'ehf', b.ehf, 'confirmed_at', b.confirmed_at, 'mrr',
      case when b.confirmed_at is not null then app.plan_monthly_nok(b.plan) end)
      from app.billing b where b.org_id = o.id),
    'dpa', (select jsonb_build_object('version', s.version, 'signed_at', s.signed_at, 'signer_name', s.signer_name,
                                      'signer_title', s.signer_title)
            from app.dpa_signatures s where s.org_id = o.id order by s.signed_at desc limit 1),
    'structure', jsonb_build_object(
      'groups', (select count(*) from app.groups g where g.org_id = o.id),
      'employees', (select count(*) from app.employees e where e.org_id = o.id and e.active),
      'with_phone', (select count(*) from app.employees e where e.org_id = o.id and e.active and e.phone is not null),
      'locations', (select count(*) from app.locations l where l.org_id = o.id)),
    'users', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'name', p.full_name, 'email', u.email, 'role', m.role, 'active', m.active,
        'joined_at', m.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'mfa_factors', (select count(*) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))
        order by m.created_at), '[]')
      from app.memberships m join app.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
      where m.org_id = o.id) end,
    -- surveys as metadata: counts and dates, never a person, never an answer
    'rounds', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', ms.kind, 'year', ms.year, 'status', r.status, 'opens_at', r.opens_at, 'closes_at', r.closes_at,
        'invited', inv.invited, 'answered', inv.answered,
        'groups_below_threshold', inv.groups_below,
        'reminders_sent', (select count(*) from app.outbox x where x.round_id = r.id and x.kind = 'paminnelse' and x.sent_at is not null),
        'notices_sent', (select count(*) from app.outbox x where x.round_id = r.id and x.sent_at is not null),
        'notices_failed', (select count(*) from app.outbox x where x.round_id = r.id and x.failed_at is not null),
        'notices_pending', (select count(*) from app.outbox x where x.round_id = r.id and x.sent_at is null and x.failed_at is null))
        order by r.opens_at desc nulls last), '[]')
      from app.rounds r
      join app.measurements ms on ms.id = r.measurement_id
      left join lateral (
        select sum(g.invited)::int as invited, sum(g.answered)::int as answered,
               count(*) filter (where g.answered > 0 and g.answered < o.threshold)::int as groups_below
        from (select e.group_id, count(*) as invited, count(i.responded_at) as answered
              from app.invitations i join app.employees e on e.id = i.employee_id
              where i.round_id = r.id group by e.group_id) g
      ) inv on true
      where r.org_id = o.id) end,
    'measures', (select jsonb_build_object(
      'total', count(*),
      'open', count(*) filter (where m.step not in ('gjennomfort', 'effekt_malt', 'lukket')),
      'closed', count(*) filter (where m.step = 'lukket'),
      'overdue', count(*) filter (where m.due_date < current_date and m.step not in ('gjennomfort', 'effekt_malt', 'lukket')))
      from app.measures m where m.org_id = o.id),
    'timeline', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object('at', t.at, 'event', t.event) order by t.at), '[]')
      from (
        select o.created_at as at, 'signed_up' as event
        union all select min(e.created_at), 'employees_added' from app.employees e where e.org_id = o.id having min(e.created_at) is not null
        union all select min(ms.created_at), 'first_survey_planned' from app.measurements ms where ms.org_id = o.id having min(ms.created_at) is not null
        union all select min(i.sent_at), 'first_survey_sent' from app.invitations i where i.org_id = o.id having min(i.sent_at) is not null
        union all select min(pe.at), 'results_viewed' from app.product_events pe where pe.org_id = o.id and pe.name = 'results_viewed' having min(pe.at) is not null
        union all select min(m.created_at), 'first_measure' from app.measures m where m.org_id = o.id having min(m.created_at) is not null
        union all select s.signed_at, 'dpa_signed' from app.dpa_signatures s where s.org_id = o.id
        union all select b.trial_extended_at, 'trial_extended' from app.billing b where b.org_id = o.id and b.trial_extended_at is not null
        union all select b.confirmed_at, 'plan_confirmed' from app.billing b where b.org_id = o.id and b.confirmed_at is not null
      ) t) end,
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'author_email', n.author_email,
                                                           'created_at', n.created_at) order by n.created_at desc), '[]')
              from app.admin_org_notes n where n.org_id = o.id)
  ) into v_out
  from app.organizations o where o.id = p_org;

  return v_out;
end $fn$;

create function public.admin_extend_trial(p_org uuid, p_days int, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_end timestamptz;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_days is null or p_days not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_days');
  end if;
  update app.billing b
     set trial_ends_at = greatest(b.trial_ends_at, now()) + make_interval(days => p_days), updated_at = now()
   where b.org_id = p_org and b.confirmed_at is null
  returning b.trial_ends_at into v_end;
  if v_end is null then
    return jsonb_build_object('ok', false, 'error', 'not_in_trial');
  end if;
  perform app.admin_log('trial.extend', p_org, 'billing', p_org::text, p_reason,
    jsonb_build_object('days', p_days, 'trial_ends_at', v_end));
  return jsonb_build_object('ok', true, 'trial_ends_at', v_end);
end $fn$;

create function public.admin_note_add(p_org uuid, p_body text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_note');
  end if;
  insert into app.admin_org_notes (org_id, author_id, author_email, body)
  values (p_org, auth.uid(), (select u.email::text from auth.users u where u.id = auth.uid()), btrim(p_body))
  returning id into v_id;
  perform app.admin_log('note.add', p_org, 'note', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- ---------------------------------------------------------------- users
-- Users are people who sign in. Respondents are employees and never appear here.
create function public.admin_user_search(p_q text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_rows jsonb;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_q is null or char_length(v_q) < 2 then
    return jsonb_build_object('ok', true, 'rows', '[]'::jsonb);
  end if;
  perform app.admin_log('users.search', null, null, null, null, jsonb_build_object('q', v_q));

  select coalesce(jsonb_agg(x order by x.email), '[]') into v_rows
  from (
    select u.id as user_id, u.email::text as email, p.full_name as name, u.created_at, u.last_sign_in_at,
           (select count(*) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified') as mfa_factors,
           (select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'org_name', o.name, 'role', m.role,
                                                         'active', m.active, 'joined_at', m.created_at)), '[]')
            from app.memberships m join app.organizations o on o.id = m.org_id where m.user_id = u.id) as memberships,
           (select coalesce(jsonb_agg(jsonb_build_object('org_name', o.name, 'role', mi.role, 'created_at', mi.created_at,
                                                         'expires_at', mi.expires_at)), '[]')
            from app.member_invites mi join app.organizations o on o.id = mi.org_id
            where lower(mi.email) = lower(u.email::text) and mi.accepted_at is null) as pending_invites
    from auth.users u
    left join app.profiles p on p.id = u.id
    where (u.email ilike '%' || v_q || '%' or p.full_name ilike '%' || v_q || '%')
      and not exists (select 1 from app.platform_admins a where a.user_id = u.id)
    limit 50
  ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end $fn$;

-- ---------------------------------------------------------------- audit trail
create function public.admin_audit_list(p_org uuid default null, p_limit int default 200) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_role app.platform_role := app.admin_role();
  v_rows jsonb;
begin
  -- the whole trail is the super-admin's; support reads one organisation's
  if v_role is null or v_role in ('finance', 'analyst') or (v_role = 'support' and p_org is null) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'at', a.at, 'admin_email', a.admin_email, 'admin_role', a.admin_role, 'action', a.action,
    'org_id', a.org_id, 'org_name', a.org_name, 'target_type', a.target_type, 'target_id', a.target_id,
    'reason', a.reason, 'detail', a.detail) order by a.at desc, a.id desc), '[]') into v_rows
  from (select * from app.admin_audit a
        where p_org is null or a.org_id = p_org
        order by a.at desc, a.id desc
        limit least(greatest(coalesce(p_limit, 200), 1), 1000)) a;
  return jsonb_build_object('ok', true, 'rows', v_rows);
end $fn$;

-- ---------------------------------------------------------------- operations
-- The scheduler's runs and the notice queue. An error message from the mail provider can
-- quote the recipient's address, and a recipient is usually a respondent: addresses are
-- masked before an error leaves the database.
create function public.admin_ops() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('ops.view');
  return jsonb_build_object(
    'ok', true,
    'runs', (select coalesce(jsonb_agg(to_jsonb(j) order by j.ran_at desc), '[]')
             from (select ran_at, opened, closed, queued, planned, note from app.job_runs order by ran_at desc limit 50) j),
    'queue', (select coalesce(jsonb_agg(q), '[]') from (
                select x.kind, x.channel,
                       count(*) filter (where x.sent_at is not null) as sent,
                       count(*) filter (where x.failed_at is not null) as failed,
                       count(*) filter (where x.sent_at is null and x.failed_at is null and x.due_at <= now()) as due,
                       count(*) filter (where x.sent_at is null and x.failed_at is null and x.due_at > now()) as scheduled
                from app.outbox x where x.created_at > now() - interval '14 days'
                group by x.kind, x.channel order by x.kind, x.channel) q),
    'failures', (select coalesce(jsonb_agg(f order by f.due_at desc), '[]') from (
                   select o.id as org_id, o.name as org_name, x.kind, x.channel, x.due_at, x.attempts, x.failed_at,
                          regexp_replace(coalesce(x.last_error, ''), '[^\s@<>"'']+@[^\s@<>"'']+', '[address]', 'g') as error
                   from app.outbox x join app.organizations o on o.id = x.org_id
                   where x.failed_at is not null or (x.attempts > 0 and x.sent_at is null)
                   order by x.due_at desc limit 50) f)
  );
end $fn$;

create function public.admin_email_log(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('email_log.view', p_org);
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(l order by l.day desc, l.kind), '[]') from (
      select (x.due_at at time zone 'Europe/Oslo')::date as day, x.kind, x.channel, coalesce(x.audience::text, 'employee') as audience,
             count(*) as total,
             count(*) filter (where x.sent_at is not null) as sent,
             count(*) filter (where x.failed_at is not null) as failed,
             count(*) filter (where x.sent_at is null and x.failed_at is null) as pending
      from app.outbox x where x.org_id = p_org
      group by 1, 2, 3, 4) l));
end $fn$;

-- ---------------------------------------------------------------- the business
create function public.admin_kpis() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if app.admin_role() is null then
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
      'mrr', coalesce(sum(app.plan_monthly_nok(b.plan)) filter (where b.confirmed_at is not null), 0),
      'arr', coalesce(sum(app.plan_monthly_nok(b.plan)) filter (where b.confirmed_at is not null), 0) * 12,
      -- of the trials that have run their course (confirmed, or ended), the share confirmed
      'conversion', round(100.0 * count(*) filter (where b.confirmed_at is not null)
                          / nullif(count(*) filter (where b.confirmed_at is not null or b.trial_ends_at <= now()), 0), 1))
    from app.billing b join app.organizations o on o.id = b.org_id
  );
end $fn$;

-- The activation funnel per signup month: how many organisations reached each step, and the
-- median hours from signup to the first survey sent (the "20 minutes" on the site).
create function public.admin_funnel(p_months int default 12) returns jsonb
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
             round((percentile_cont(0.5) within group (order by extract(epoch from s.first_sent - s.created_at) / 3600.0)
                    filter (where s.first_sent is not null))::numeric, 1) as median_hours_to_first_send
      from (
        select o.id, o.created_at,
               (select min(e.created_at) from app.employees e where e.org_id = o.id) as first_employee,
               (select min(ms.created_at) from app.measurements ms where ms.org_id = o.id) as first_planned,
               (select min(i.sent_at) from app.invitations i where i.org_id = o.id) as first_sent,
               -- unlocked: a closed round in which some group reached the threshold
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

-- ---------------------------------------------------------------- admin accounts
create function public.admin_list_admins() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('admins.list');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'email', u.email, 'role', a.role, 'active', a.active, 'mfa_enforced', a.mfa_enforced,
      'created_at', a.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'mfa_factors', (select count(*) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))
      order by a.created_at), '[]')
    from app.platform_admins a join auth.users u on u.id = a.user_id));
end $fn$;

-- Grants, changes or revokes an admin role for an existing account, by e-mail. The account
-- must not belong to any customer organisation (the trigger says so if it does).
create function public.admin_set_admin(p_email text, p_role text, p_active boolean, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_role is null or p_role not in ('super_admin', 'support', 'finance', 'analyst') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_such_account');
  end if;
  if v_user = auth.uid() and (not coalesce(p_active, true) or p_role <> 'super_admin') then
    return jsonb_build_object('ok', false, 'error', 'not_yourself');
  end if;
  if exists (select 1 from app.memberships m where m.user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'customer_account');
  end if;
  insert into app.platform_admins (user_id, role, active, created_by)
  values (v_user, p_role::app.platform_role, coalesce(p_active, true), auth.uid())
  on conflict (user_id) do update set role = excluded.role, active = excluded.active;
  perform app.admin_log('admins.set', null, 'admin', v_user::text, p_reason,
    jsonb_build_object('email', lower(btrim(p_email)), 'role', p_role, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_whoami()', 'public.admin_record_login()', 'public.admin_org_list(text,text)',
    'public.admin_org_detail(uuid)', 'public.admin_extend_trial(uuid,int,text)', 'public.admin_note_add(uuid,text)',
    'public.admin_user_search(text)', 'public.admin_audit_list(uuid,int)', 'public.admin_ops()',
    'public.admin_email_log(uuid)', 'public.admin_kpis()', 'public.admin_funnel(int)', 'public.admin_list_admins()',
    'public.admin_set_admin(text,text,boolean,text)', 'public.track_product_event(text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'app.admin_not_member()', 'app.member_not_admin()', 'app.admin_role()', 'app.is_platform_admin(app.platform_role[])',
    'app.admin_audit_fixed()', 'app.admin_log(text,uuid,text,text,text,jsonb)', 'app.org_status(uuid)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
