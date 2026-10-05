-- 0206_admin_leaves.sql — admin, CRM, CMS, growth, support tickets and site analytics leave Orgpuls
-- (X-104, D-230, docs/platform/PLAN.md § 4).
--
-- Tor, 2026-10-05: «Gjør det som er mest naturlig — du kan slette admin og bygge APIet.» and, of the data,
-- «ingen av dataene er brukt … ingenting er gjort så slett». 0205 built the API the platform steers Orgpuls
-- through; this removes what the platform takes over, with its data, and nothing is exported.
--
-- What stays, and why:
--   * the operations the platform calls (app.platform_command_map): moved out of the exposed schema to
--     app.op_*, executable by nobody but their owner, so platform_command is the only way in;
--   * app.admin_role(), app.is_platform_admin() and app.admin_log(), which those operations call: they now
--     answer for a verified platform command only (the transaction's app.platform_actor) and for nobody
--     signed in, and the log is app.platform_commands;
--   * the product's own touchpoints with the outside — the contact form, Hjelp, the sign-up's «hvordan
--     hørte du om oss», the demo — keep their functions and become platform events;
--   * the trial's service mail (lifecycle_*), the demo's request log (demo_requests) and its daily key,
--     renamed from web_salts to demo_salts since nothing else used it.
--
-- Order: cron jobs, the triggers on product tables, the operations' move, the tables (with what depends on
-- them), the remaining functions by name, the types, then the functions kept and changed. A function body
-- is not tracked by PostgreSQL, so platform_split_invariants.sql proves that no function left names a
-- table or function removed here.

-- ---------------------------------------------------------------------------
-- 1. cron
do $$
declare j text;
begin
  foreach j in array array['orgpuls-brreg-triggers', 'orgpuls-crm-dispatch', 'orgpuls-crm-purge', 'orgpuls-kpi-capture',
                           'orgpuls-lead-route', 'orgpuls-seo', 'orgpuls-web-retention'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;
-- the wheel's tick stays; growth's goes
select cron.schedule('orgpuls-wheel', '0 * * * *', $c$select app.wheel_tick()$c$);

-- ---------------------------------------------------------------------------
-- 2. triggers on tables that stay
drop trigger if exists memberships_not_admin on app.memberships;
drop trigger if exists growth_forget_demo on app.demo_orgs;
drop trigger if exists growth_org_created on app.organizations;
drop trigger if exists growth_org_verified on app.organizations;
drop trigger if exists growth_user_signed_up on app.memberships;
drop trigger if exists growth_employees_imported on app.employees;
drop trigger if exists growth_survey_created on app.measurements;
drop trigger if exists growth_survey_scheduled on app.rounds;
drop trigger if exists growth_action_item on app.measures;
drop trigger if exists growth_stakeholder_invited on app.member_invites;
drop trigger if exists growth_billing on app.billing;
drop trigger if exists growth_demo_request on app.demo_requests;

-- ---------------------------------------------------------------------------
-- 3. the platform's operations: public.admin_<x> becomes app.op_<x>, reachable through platform_command only
do $$
declare
  r      record;
  v_name text;
  v_args text;
begin
  for r in select m.command, m.fn from app.platform_command_map m where m.fn like 'public.admin\_%' loop
    v_name := 'op_' || substring(split_part(r.fn, '(', 1) from '^public\.admin_(.*)$');
    v_args := substr(r.fn, strpos(r.fn, '('));
    if to_regprocedure(r.fn) is null then
      raise exception '0206: % names no function', r.fn;
    end if;
    execute format('alter function %s set schema app', r.fn);
    execute format('alter function app.%I%s rename to %I', 'admin_' || substring(v_name from 4), v_args, v_name);
    execute format('revoke all on function app.%I%s from public, anon, authenticated, service_role', v_name, v_args);
    update app.platform_command_map set fn = 'app.' || v_name || v_args where command = r.command;
  end loop;
end $$;

-- the site notice's two operations asked the CMS's own role checks, which go
do $$
declare
  v_def text;
  f     text;
begin
  foreach f in array array['app.op_site_notice()', 'app.op_site_notice_set(boolean,text,text)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if v_def !~ 'app\.cms_can_(read|write)\(\)' then
      raise exception '0206: % no longer reads the CMS role check', f;
    end if;
    v_def := replace(v_def, 'app.cms_can_read()', $r$app.is_platform_admin(array['super_admin']::app.platform_role[])$r$);
    v_def := replace(v_def, 'app.cms_can_write()', $r$app.is_platform_admin(array['super_admin']::app.platform_role[])$r$);
    execute v_def;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. tables
alter table app.web_salts rename to demo_salts;
comment on table app.demo_salts is
  'The day''s key for the demo''s network code (0206; web_salts until then): one row, replaced each day.';

alter table app.mail_events drop constraint if exists mail_events_ticket_mail_id_fkey;
drop index if exists app.mail_events_ticket_mail;
alter table app.mail_events drop column if exists ticket_mail_id;

do $$
declare t text;
begin
  foreach t in array array[
    -- admin
    'platform_admins', 'admin_audit', 'admin_org_notes', 'account_owners', 'partners', 'canned_replies',
    -- support
    'tickets', 'ticket_csat', 'ticket_events', 'ticket_links', 'ticket_mail', 'ticket_mentions', 'ticket_messages', 'csat_misses',
    -- CMS
    'cms_media', 'cms_page_locales', 'cms_pages', 'cms_previews', 'cms_redirects', 'cms_revisions', 'cms_templates',
    -- consent and mail for marketing
    'consent_purposes', 'consent_records', 'mail_templates', 'mail_auth_checks', 'mail_auth_runs', 'mail_streams', 'marketing_spend',
    -- prospects
    'brreg_dnc', 'brreg_entities', 'brreg_outreach', 'brreg_polls', 'brreg_purges', 'brreg_settings', 'brreg_triggers',
    -- growth and analytics
    'event_catalogue', 'product_events', 'kpi_daily', 'org_attribution', 'web_events', 'seo_runs', 'seo_search',
    'growth_assumptions', 'growth_benchmarks', 'growth_coverage', 'growth_cuts', 'growth_decisions', 'growth_events',
    'growth_experiments', 'growth_funnel_stages', 'growth_guardrails', 'growth_items', 'growth_krav_rule_versions',
    'growth_krav_rules', 'growth_lead_sources', 'growth_magnets', 'growth_plan_blocks', 'growth_plan_gates',
    'growth_recommendations', 'growth_risks', 'growth_rules', 'growth_settings', 'growth_tiers'] loop
    execute format('drop table if exists app.%I cascade', t);
  end loop;
  -- every CRM table, including those the unmerged CRM branch applied to the hosted project
  for t in select c.relname from pg_class c where c.relnamespace = 'app'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
           and c.relname like 'crm\_%' loop
    execute format('drop table if exists app.%I cascade', t);
  end loop;
end $$;

-- the demo's copy plan named some of them, to skip them
delete from app.demo_copy_plan p
where not exists (select 1 from pg_class c where c.relnamespace = 'app'::regnamespace and c.relname = p.table_name);

-- ---------------------------------------------------------------------------
-- 5. functions, by name: every reader and writer of what went, the admin screens' RPCs, and the
--    analytics and CRM entry points. The operations moved in step 3 no longer match; the three kept
--    helpers are named.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public') and p.prokind in ('f', 'p')
      and (p.proname ~ ('^(admin_|crm_|growth_|ticket|cms_|web_|seo_|brreg_|kpi_|consent_|track_|csat|health_score$|'
                        || 'mail_sent_7d$|record_crm|lead_|account_owner|partner|magnet|mail_auth|marketing|canned|'
                        || 'product_event|attribution|newsletter|unsubscribe|event_catalogue|media_)')
           or p.proname in ('approve_item_translations', 'approve_ui_translation', 'record_signup_source', 'member_not_admin',
                            -- prospects' fit, tickets' business hours, the health score's parts, deliverability, KPIs
                            'fit_score', 'fit_target_nace', 'next_workday', 'add_business_hours', 'business_minutes',
                            'intent_score', 'health_parts', 'mail_template_count', 'mail_stream_domain', 'org_status', 'no_public_holiday'))
      and p.oid::regprocedure::text not in ('app.admin_role()', 'app.admin_log(text,uuid,text,text,text,jsonb)')
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. types used by nothing now
drop type if exists app.growth_pii;
drop type if exists app.mail_auth_level;
drop type if exists app.ticket_category;
drop type if exists app.ticket_impact;
drop type if exists app.ticket_priority;
drop type if exists app.ticket_queue;
drop type if exists app.ticket_status;
drop type if exists app.ticket_type;
do $$
declare r record;
begin
  for r in select t.oid::regtype as ty from pg_type t where t.typnamespace = 'app'::regnamespace and t.typtype = 'e'
           and t.typname ~ '^(crm_|cms_|consent_|brreg_|growth_)' loop
    execute format('drop type if exists %s', r.ty);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. the admin role answers for a verified platform command only
create or replace function app.admin_role() returns app.platform_role
  language sql stable security definer set search_path = ''
as $fn$
  select case when coalesce(current_setting('app.platform_actor', true), '') <> '' then 'super_admin'::app.platform_role end
$fn$;

create or replace function app.admin_log(p_action text, p_org uuid default null, p_target_type text default null,
                                         p_target_id text default null, p_reason text default null, p_detail jsonb default null)
  returns void language plpgsql security definer set search_path = ''
as $fn$
begin
  -- every operation runs inside a platform command, which app.platform_commands already records
  return;
end $fn$;
comment on function app.admin_log(text, uuid, text, text, text, jsonb) is
  'Kept for the operations that call it (0206): a platform command is recorded in app.platform_commands.';

-- ---------------------------------------------------------------------------
-- 8. the product functions that read what went

-- a person's sign-in accounts go with their last organisation; there are no admin accounts to spare now
create or replace function app.org_departing_accounts(p_org uuid) returns uuid[]
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(array_agg(distinct m.user_id), '{}')
  from app.memberships m
  where m.org_id = p_org
    and not exists (select 1 from app.memberships o where o.user_id = m.user_id and o.org_id <> p_org)
$fn$;

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('app.org_row_counts(uuid)'::regprocedure);
  if strpos(v_def, $a$c.relname not in ('deletion_log', 'admin_audit', 'crm_companies', 'platform_events')$a$) = 0
     or strpos(v_def, 'crm_contacts') = 0 then
    raise exception '0206: org_row_counts has changed';
  end if;
  v_def := replace(v_def, $a$c.relname not in ('deletion_log', 'admin_audit', 'crm_companies', 'platform_events')$a$,
                          $a$c.relname not in ('deletion_log', 'platform_events')$a$);
  v_def := replace(v_def, $a$
    -- a contact who subscribed with their own consent stays (0064)
    v_pred := v_pred || case when r.relname = 'crm_contacts'
                             then format('org_id = %L and basis <> %L', p_org, 'consent')
                             else format('org_id = %L', p_org) end;$a$, $a$
    v_pred := v_pred || format('org_id = %L', p_org);$a$);
  if strpos(v_def, 'crm_') > 0 then
    raise exception '0206: org_row_counts still names the CRM';
  end if;
  execute v_def;
end $$;

create or replace function app.delete_organisation(p_org uuid, p_run_by text, p_admin uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  o app.organizations;
  b app.billing;
  v_users uuid[];
  v_gone uuid[];
  v_counts jsonb;
  v_tables jsonb;
begin
  select * into o from app.organizations where id = p_org;
  if not found then
    return null;
  end if;
  select * into b from app.billing where org_id = p_org;
  -- only a cancelled organisation, and the schedule only once its deletion is due
  if b.cancelled_at is null then
    raise exception 'delete_organisation: % has no cancellation', p_org using errcode = 'insufficient_privilege';
  end if;
  if p_run_by = 'schedule' and (b.deletion_due_at is null or b.deletion_due_at > now()) then
    raise exception 'delete_organisation: % is not due until %', p_org, b.deletion_due_at using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(distinct m.user_id), '{}') into v_users from app.memberships m where m.org_id = p_org;
  v_gone := app.org_departing_accounts(p_org);
  v_tables := app.org_row_counts(p_org);

  v_counts := jsonb_build_object(
    'employees', (select count(*) from app.employees e where e.org_id = p_org),
    'groups', (select count(*) from app.groups g where g.org_id = p_org),
    'rounds', (select count(*) from app.rounds r where r.org_id = p_org),
    'responses', (select count(*) from app.responses r where r.org_id = p_org),
    'measures', (select count(*) from app.measures m where m.org_id = p_org),
    'members', cardinality(v_users));

  -- rounds before the organisation: a group cannot go while its answers exist (0042)
  delete from app.rounds where org_id = p_org;
  delete from app.organizations where id = p_org;

  -- sign-in accounts that belonged here only, and what Auth logged about them (read before the
  -- accounts go: the log is matched by address as well as by id)
  delete from auth.audit_log_entries a where app.audit_entry_of(a.payload, v_gone);
  delete from auth.mfa_factors where user_id = any(v_gone);
  delete from auth.identities where user_id = any(v_gone);
  delete from auth.users where id = any(v_gone);
  v_counts := v_counts || jsonb_build_object('accounts', cardinality(v_gone));

  insert into app.deletion_log (org_id, org_number, org_name, cancelled_at, cancel_effective_at, deletion_due_at, run_by, admin_id, counts, tables)
  values (p_org, o.org_number, o.name, b.cancelled_at, b.cancel_effective_at, b.deletion_due_at, p_run_by, p_admin, v_counts, v_tables);
  return v_counts;
end $fn$;

-- Microsoft sign-in: rule 4 (no platform admin through Microsoft) has nobody left to refuse
do $$
declare
  v_def text := pg_get_functiondef('app.entra_rules(uuid,uuid,boolean)'::regprocedure);
  v_old text := $a$
  -- 4. platform admins sign in with a password and a second factor only (D-90)
  if exists (select 1 from app.platform_admins a where a.user_id = p_uid and a.active) then
    return jsonb_build_object('ok', false, 'microsoft', true, 'error', 'platform_admin');
  end if;$a$;
begin
  if strpos(v_def, v_old) = 0 then
    raise exception '0206: entra_rules has changed';
  end if;
  execute replace(v_def, v_old, '');
end $$;

-- the demo: admins were never allowed one; there are none now
do $$
declare
  f     text;
  v_def text;
  v_n   int;
begin
  foreach f in array array['app.demo_expire()', 'app.demo_forget(uuid)', 'public.demo_enter()', 'public.demo_pending()'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    v_n := length(v_def);
    v_def := replace(v_def, $a$
             and not exists (select 1 from app.platform_admins pa where pa.user_id = u.id) loop$a$, ' loop');
    v_def := replace(v_def, $a$
     and not exists (select 1 from app.platform_admins pa where pa.user_id = p_user) then$a$, ' then');
    v_def := replace(v_def, $a$
  if exists (select 1 from app.platform_admins pa where pa.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;$a$, '');
    v_def := replace(v_def, $a$
     and not exists (select 1 from app.platform_admins pa where pa.user_id = auth.uid())$a$, '');
    if length(v_def) = v_n or strpos(v_def, 'platform_admins') > 0 then
      raise exception '0206: % has changed', f;
    end if;
    execute v_def;
  end loop;
end $$;

-- the demo request's network code: the same daily key, under the demo's own name
create function app.demo_network_key(p_ip text) returns text
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_day date := (now() at time zone 'Europe/Oslo')::date;
  v_salt text;
begin
  delete from app.demo_salts where day < v_day;
  insert into app.demo_salts (day, salt)
  values (v_day, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'))
  on conflict (day) do nothing;
  select s.salt into v_salt from app.demo_salts s where s.day = v_day;
  return left(encode(sha256(convert_to(v_salt || '|' || coalesce(p_ip, '') || '|demo', 'UTF8')), 'hex'), 32);
end $fn$;
revoke all on function app.demo_network_key(text) from public, anon, authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.demo_request(text,text,text,text,text,boolean,text)'::regprocedure);
begin
  if strpos(v_def, $a$app.web_visitor(p_ip, 'demo')$a$) = 0 then
    raise exception '0206: demo_request has changed';
  end if;
  v_def := replace(v_def, $a$app.web_visitor(p_ip, 'demo')$a$, 'app.demo_network_key(p_ip)');
  v_def := replace(v_def, '-- who is asking: the three things a CRM contact holds, checked as the contact checks them',
                          '-- who is asking: the three things the platform''s contact holds');
  execute v_def;
end $$;

-- the person who opened their demo link: the platform's lead, with the box they ticked
create or replace function app.demo_lead(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_email text;
  r       app.demo_requests;
begin
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = p_user;
  select * into r from app.demo_requests q where q.email = v_email order by q.at desc limit 1;
  if v_email is null or r.id is null then
    return;
  end if;
  perform app.platform_emit('demo.requested', null, jsonb_build_object(
    'email', v_email, 'name', r.name, 'company', r.company, 'role', r.role, 'consent', r.consent, 'lang', r.lang));
end $fn$;

-- «Hvordan hørte du om oss?»: to the platform, for the organisation just made
create or replace function public.record_signup_heard(p_heard text) returns jsonb
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
  perform app.platform_emit('org.attribution', v_org, jsonb_build_object('heard', p_heard));
  return jsonb_build_object('ok', true);
end $fn$;

-- the site's contact form: to the platform. The limits read what was sent in the last hour.
create index if not exists platform_events_kind_at on app.platform_events (kind, created_at);

create or replace function public.submit_contact(p_topic integer, p_name text, p_email text, p_org text, p_message text,
                                                 p_trap text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_body text := btrim(coalesce(p_message, ''));
  v_topic int := coalesce(p_topic, 0);
  v_topics text[] := array['product', 'pricing', 'first_send', 'privacy'];
begin
  if coalesce(p_trap, '') <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if v_name = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_topic not between 0 and 3 then v_topic := 0; end if;
  if char_length(v_body) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if (select count(*) from app.platform_events e
      where e.kind = 'contact.submitted' and e.created_at > now() - interval '1 hour' and e.payload ->> 'email' = v_email) >= 3
     or (select count(*) from app.platform_events e
         where e.kind = 'contact.submitted' and e.created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  perform app.platform_emit('contact.submitted', null, jsonb_build_object(
    'topic', v_topics[v_topic + 1], 'name', v_name, 'email', v_email,
    'organisation', nullif(left(btrim(coalesce(p_org, '')), 200), ''), 'message', nullif(v_body, '')));
  return jsonb_build_object('ok', true);
end $fn$;

-- Hjelp: to the platform, with the member's organisation and role from the session. A demo
-- organisation is nobody's customer, so its requests go without one.
create or replace function public.submit_help_request(p_category text, p_subject text, p_body text, p_page text, p_browser text)
  returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_email text;
  v_name text;
  v_subject text := left(btrim(coalesce(p_subject, '')), 200);
  v_body text := btrim(coalesce(p_body, ''));
begin
  select m.org_id, m.role::text into v_org, v_role from app.memberships m where m.user_id = v_uid and m.active limit 1;
  if v_uid is null or v_org is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_body = '' or char_length(v_body) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_category is null or p_category not in ('getting_started', 'survey_delivery', 'results_anonymity', 'tiltak', 'billing',
                                              'bug', 'feature_request', 'personvern') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if (select count(*) from app.platform_events e
      where e.kind = 'support.requested' and e.created_at > now() - interval '1 hour' and e.payload ->> 'user_id' = v_uid::text) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select p.full_name into v_name from app.profiles p where p.id = v_uid;
  perform app.platform_emit('support.requested', case when app.is_demo(v_org) then null else v_org end, jsonb_build_object(
    'category', p_category, 'subject', coalesce(nullif(v_subject, ''), left(v_body, 80)), 'body', v_body,
    'page', nullif(left(regexp_replace(coalesce(p_page, ''), '[?#].*$', ''), 160), ''),
    'browser', nullif(left(coalesce(p_browser, ''), 200), ''),
    'role', v_role, 'user_id', v_uid, 'email', v_email, 'name', v_name));
  return jsonb_build_object('ok', true);
end $fn$;

-- Brevo's delivery events: the product's own mail only
create or replace function public.record_mail_event(p_event text, p_message_id text, p_at timestamptz, p_reason text default null)
  returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id   text := btrim(coalesce(p_message_id, ''), '<> ');
  v_out  app.outbox;
  v_rcpt app.outbox_recipients;
  v_ev   app.mail_delivery;
  v_row  bigint;
  v_roll app.mail_delivery;
  v_rat  timestamptz;
begin
  if v_id = '' or p_at is null or p_event not in ('delivered', 'soft_bounce', 'hard_bounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed', 'error') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_ev := p_event::app.mail_delivery;
  select * into v_out from app.outbox o where btrim(o.provider_id, '<> ') = v_id limit 1;
  if v_out.id is null then
    -- 0134: one person's message of a notice to several
    select * into v_rcpt from app.outbox_recipients r where r.provider_id = v_id limit 1;
    if v_rcpt.id is not null then
      select * into v_out from app.outbox o where o.id = v_rcpt.outbox_id;
    end if;
  end if;

  insert into app.mail_events (at, event, message_id, outbox_id, org_id, reason)
  values (p_at, p_event, left(v_id, 200), v_out.id, v_out.org_id,
          nullif(left(regexp_replace(coalesce(p_reason, ''), '[^\s@<>"'']+@[^\s@<>"'']+', '[address]', 'g'), 200), ''))
  on conflict (message_id, event, at) do nothing
  returning id into v_row;
  if v_row is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if v_rcpt.id is not null then
    -- that person's state: the latest event wins, an older one arriving late does not overwrite it
    update app.outbox_recipients set delivery = v_ev, delivery_at = p_at
    where id = v_rcpt.id and (delivery_at is null or delivery_at <= p_at);
    -- the notice's: the worst of its recipients' latest states, at the latest of their times
    select r.delivery into v_roll from app.outbox_recipients r
    where r.outbox_id = v_out.id and r.delivery is not null
    order by case when r.delivery = 'delivered' then 3 when r.delivery in ('soft_bounce', 'deferred') then 2 else 1 end,
             r.delivery_at desc
    limit 1;
    select max(r.delivery_at) into v_rat from app.outbox_recipients r where r.outbox_id = v_out.id;
    update app.outbox set delivery = v_roll, delivery_at = v_rat where id = v_out.id;
  elsif v_out.id is not null then
    update app.outbox set delivery = v_ev, delivery_at = p_at
    where id = v_out.id and (delivery_at is null or delivery_at <= p_at);
    if v_out.employee_id is not null and v_ev in ('hard_bounce', 'invalid', 'blocked', 'spam', 'unsubscribed') then
      insert into app.address_problems (employee_id, channel, org_id, problem, at)
      values (v_out.employee_id, coalesce(v_out.channel, 'email'), v_out.org_id, v_ev, p_at)
      on conflict (employee_id, channel) do update set problem = excluded.problem, at = excluded.at;
    elsif v_out.employee_id is not null and v_ev = 'delivered' then
      delete from app.address_problems where employee_id = v_out.employee_id and channel = coalesce(v_out.channel, 'email');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'matched', v_out.id is not null);
end $fn$;

-- ---------------------------------------------------------------------------
-- 9. the events those touchpoints send
update app.platform_event_kinds set fields = array['heard'],
  note = 'how the person who signed up says they heard of Orgpuls'
where kind = 'org.attribution';
update app.platform_event_kinds set fields = array['category', 'subject', 'body', 'page', 'browser', 'role', 'user_id', 'email', 'name'],
  note = 'a customer user asked for help from Hjelp: their own words, not a respondent''s; no organisation for a demo'
where kind = 'support.requested';
update app.platform_event_kinds set fields = array['email', 'name', 'company', 'role', 'consent', 'lang'],
  note = 'somebody opened the demo they asked for: the address is proved; consent is the box they ticked'
where kind = 'demo.requested';
update app.platform_event_kinds set note = 'the public site''s contact form; topic is product, pricing, first_send or privacy'
where kind = 'contact.submitted';

-- what a person wrote waits for the platform until it is delivered; everything else is kept 30 days
create or replace function public.platform_events_claim(p_batch int default 50) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_url text; v_rows jsonb;
begin
  delete from app.platform_events e
  where e.created_at < now() - interval '30 days'
    and (e.delivered_at is not null or e.kind not in ('contact.submitted', 'support.requested', 'demo.requested'));
  select i.webhook_url into v_url from app.platform_installation i where i.enabled and i.webhook_url is not null;
  if v_url is null then
    return jsonb_build_object('url', null, 'events', '[]'::jsonb);
  end if;
  with picked as (
    select e.id from app.platform_events e
    where e.delivered_at is null and (e.claimed_at is null or e.claimed_at < now() - interval '10 minutes')
      and e.attempts < 20
    order by e.id
    limit greatest(1, least(coalesce(p_batch, 50), 200))
    for update skip locked)
  , claimed as (
    update app.platform_events e set claimed_at = now(), attempts = e.attempts + 1
    from picked where e.id = picked.id
    returning e.id, e.kind, e.org_id, e.payload, e.created_at)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'org_id', c.org_id,
                                               'payload', c.payload, 'created_at', c.created_at) order by c.id), '[]'::jsonb)
  into v_rows from claimed c;
  return jsonb_build_object('url', v_url, 'secret', app.platform_secret('webhook'), 'events', v_rows);
end $fn$;
revoke all on function public.platform_events_claim(int) from public, anon, authenticated;
grant execute on function public.platform_events_claim(int) to service_role;

-- ---------------------------------------------------------------------------
-- 10. the platform's view of an organisation carries what the admin's customer page showed: the company's
--     Brønnøysund facts and its occupational health service, as the organisation entered them
create or replace function app.op_org_get(p_org uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'id', o.id, 'name', o.name, 'org_number', o.org_number, 'employee_count', o.employee_count,
    'industry', o.industry_key, 'created_at', o.created_at, 'mail_enabled', o.mail_enabled, 'sms_enabled', o.sms_enabled,
    'bht_name', o.bht_name,
    'registry', jsonb_build_object('fetched_at', o.registry_fetched_at, 'employees', o.registry_employees,
                                   'nace_label', o.registry_nace_label, 'form_code', o.registry_form_code,
                                   'form_label', o.registry_form_label, 'address', o.registry_address,
                                   'municipality', o.registry_municipality, 'municipality_no', o.registry_municipality_no,
                                   'registered_on', o.registry_registered_on, 'vat', o.registry_vat),
    'access', app.org_access(o.id),
    'billing', (select to_jsonb(b) - 'invoice_ref' from app.billing b where b.org_id = o.id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'active', m.active,
                       'email', u.email, 'name', p.full_name, 'last_sign_in_at', u.last_sign_in_at) order by m.created_at), '[]'::jsonb)
                from app.memberships m join auth.users u on u.id = m.user_id left join app.profiles p on p.id = m.user_id
                where m.org_id = o.id),
    'employees', (select count(*) from app.employees e where e.org_id = o.id and e.active),
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'opens_at', r.opens_at,
                       'closes_at', r.closes_at) order by r.opens_at nulls last), '[]'::jsonb)
               from app.rounds r where r.org_id = o.id))
  from app.organizations o where o.id = p_org
$fn$;
revoke all on function app.op_org_get(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. the anonymity firewall's two rules about the answer tables outlive the growth stream they were
--     written against (0141, 0143): no role reads an answer table, and nothing but the tables' own guards
--     is attached to what a submission writes. app.growth_firewall() went with growth; these are its rules 3
--     and 6, unchanged but for the stream a guard may not reach, which is now the platform's.
create function app.anonymity_firewall() returns table (seq int, rule text, pass boolean, evidence jsonb)
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_answer constant text[] := array['responses', 'answers', 'extra_answers', 'response_comments', 'module_answers',
                                    'module_segment_answers', 'module_not_relevant_answers', 'not_relevant_answers',
                                    'org_question_answers', 'org_count_answers', 'comment_threads', 'thread_messages'];
  -- the answer tables' own guards (immutability, one answer per kind): the only functions a trigger on
  -- an answer table may run
  v_guards constant text[] := array['forbid_answer_change', 'forbid_extra_answer_change', 'forbid_module_answer_change',
                                    'forbid_comment_change', 'check_extra_answer', 'not_relevant_exclusive',
                                    'org_question_answer_fixed', 'org_question_answer_kind'];
  -- the platform's own roles, which hold every table by design: no client, API key or product path reaches them
  v_platform constant text[] := array['pg_read_all_data', 'pg_write_all_data', 'supabase_read_only_user', 'supabase_etl_admin'];
  v_write text[];
  v_n bigint;
  v_names jsonb;
begin
  -- 1 no role but a superuser, the table's owner and the platform's own holds any privilege on an
  --   answer table: on the table, on any of its columns (a column grant reads the rows as well, and the
  --   service role bypasses RLS), or through a role it is a member of
  select coalesce(jsonb_agg(r.rolname || ' on ' || t.relname order by r.rolname, t.relname), '[]') into v_names
  from pg_roles r cross join pg_class t
  where t.relnamespace = 'app'::regnamespace and t.relname = any (v_answer)
    and not r.rolsuper and r.oid <> t.relowner and not (r.rolname = any (v_platform))
    and (has_table_privilege(r.oid, t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         or has_any_column_privilege(r.oid, t.oid, 'SELECT,INSERT,UPDATE,REFERENCES'));
  select count(*) into v_n from pg_roles r
  where not r.rolsuper and not (r.rolname = any (v_platform))
    and not exists (select 1 from pg_class t where t.relnamespace = 'app'::regnamespace and t.relname = any (v_answer) and t.relowner = r.oid);
  seq := 1; rule := 'no_role_reads_answers'; pass := jsonb_array_length(v_names) = 0;
  evidence := jsonb_build_object('roles', v_n, 'tables', cardinality(v_answer), 'held', jsonb_array_length(v_names), 'names', v_names);
  return next;

  -- 2 nothing is attached to the tables a respondent's submission writes but their own guards: a
  --   trigger whose function is not one of them (or one of them that reaches the platform's event stream), any rewrite rule, any policy, and any constraint, column default or index that calls a
  --   function outside pg_catalog — each runs, or could run, inside the respondent's transaction
  select array_agg(distinct x.w order by x.w) into v_write
  from (select unnest(v_answer || array['invitations']) as w
        union
        select lower(m[1]) from pg_proc p cross join lateral regexp_matches(p.prosrc, '(?:insert\s+into|update|delete\s+from)\s+app\.([a-z_0-9]+)', 'gi') m
        where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_response') x
  where to_regclass('app.' || x.w) is not null;
  with t as (select c.oid, c.relname from pg_class c where c.relnamespace = 'app'::regnamespace and c.relname = any (v_write)),
  att as (
    select 'app.' || t.relname || '.' || tg.tgname as name,
           p.proname = any (v_guards) and pn.nspname = 'app' and p.prosrc !~* 'platform_(emit|events)' as guard
    from t join pg_trigger tg on tg.tgrelid = t.oid and not tg.tgisinternal
    join pg_proc p on p.oid = tg.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
    union all
    select 'app.' || t.relname || '.' || r.rulename, false from t join pg_rewrite r on r.ev_class = t.oid
    union all
    select 'app.' || t.relname || '.' || po.polname, false from t join pg_policy po on po.polrelid = t.oid
    union all
    -- a constraint, a column default or an index (its expression or predicate) that calls a function
    -- outside pg_catalog
    select distinct 'app.' || t.relname || '.' || coalesce(con.conname, a.attname, ic.relname), false
    from pg_depend d
    join pg_proc p on p.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass and p.pronamespace <> 'pg_catalog'::regnamespace
    left join pg_constraint con on d.classid = 'pg_constraint'::regclass and con.oid = d.objid
    left join pg_attrdef ad on d.classid = 'pg_attrdef'::regclass and ad.oid = d.objid
    left join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
    left join pg_index ix on d.classid = 'pg_class'::regclass and ix.indexrelid = d.objid
    left join pg_class ic on ic.oid = ix.indexrelid
    join t on t.oid = coalesce(con.conrelid, ad.adrelid, ix.indrelid))
  select count(*) filter (where att.guard), coalesce(jsonb_agg(att.name order by att.name) filter (where not att.guard), '[]')
    into v_n, v_names
  from att;
  seq := 2; rule := 'nothing_attached_to_answers'; pass := jsonb_array_length(v_names) = 0;
  evidence := jsonb_build_object('tables', cardinality(v_write), 'guards', v_n, 'other', jsonb_array_length(v_names), 'names', v_names);
  return next;

end $fn$;
revoke all on function app.anonymity_firewall() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. a demo copy is nobody's customer (0205's own rule): demo_build makes the organisation before it marks
--     it as a demo, and demo_drop unmarks it before the organisation goes, so the triggers saw an ordinary
--     organisation both times and queued org.created, billing.changed and org.deleted for it. Each now takes
--     back what it caused, and what is already queued for a demo copy is taken back here.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('app.demo_build(uuid)'::regprocedure);
  if strpos(v_def, E'  delete from app.demo_id_map where build = v_build;\n  return v_org;') = 0 then
    raise exception '0206: demo_build has changed';
  end if;
  execute replace(v_def, E'  delete from app.demo_id_map where build = v_build;\n  return v_org;',
                  E'  delete from app.demo_id_map where build = v_build;\n  -- the triggers fired before the copy was marked as a demo\n  delete from app.platform_events where org_id = v_org;\n  return v_org;');

  v_def := (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = 'app.demo_drop(uuid)'::regprocedure);
  if strpos(v_def, E'  delete from app.organizations    where id = p_org;\nend') = 0 then
    raise exception '0206: demo_drop has changed';
  end if;
  execute replace(v_def, E'  delete from app.organizations    where id = p_org;\nend',
                  E'  delete from app.organizations    where id = p_org;\n  -- its org.deleted: the copy was unmarked before it went\n  delete from app.platform_events where org_id = p_org;\nend');
end $$;

delete from app.platform_events e
where e.org_id in (select d.org_id from app.demo_orgs d)
   or (e.kind = 'org.deleted' and not exists (select 1 from app.deletion_log l where l.org_id = e.org_id));
