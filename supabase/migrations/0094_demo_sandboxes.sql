-- 0094_demo_sandboxes.sql — a demo of the whole product, one copy per visitor (D-143).
--
-- The shared demo login (Demobedriften AS, demo@orgpuls.com) put every evaluator in one
-- organisation: whatever one wrote, the next read, and resetting it for one reset it for all.
-- Here a visitor proves an address (a login link), and gets an organisation of their own: a
-- copy of the template, with fresh ids, in which they are daglig leder.
--
--   * The copy is made inside the database by app.demo_build, from app.demo_copy_plan: every
--     table that holds an organisation's data says whether a copy takes it. A new table that
--     says nothing fails demo_invariants.sql, so the plan cannot fall behind the schema.
--   * A sandbox is rebuilt on the first login after 24 hours, or when its owner asks, and
--     deleted with its login after 14 days without one (app.demo_expire, daily).
--   * Nothing leaves a demo organisation: its outbox takes no rows, its mail and SMS stay off,
--     no QR code, invitation or DPA signature can be made, and its name and org.nr cannot be
--     changed, so a printed report — stamped DEMO by the app — cannot pass as a real one.
--   * Requests are limited per network (the analytics' daily hash, never the address), per
--     e-mail domain and per day. The address and the consent box are kept 30 days, and become
--     a CRM contact once the address is proved — mailable only if the box was ticked.
--
-- No answer table gains a policy or a column; the copy reads and writes them as the owner,
-- like every other SECURITY DEFINER function, and a copied response carries what the
-- template's did: a group and an hour.

-- ---------------------------------------------------------------- tables
create table app.demo_orgs (
  org_id     uuid primary key references app.organizations (id) on delete cascade,
  kind       text not null check (kind in ('template', 'sandbox')),
  created_at timestamptz not null default now()
);
comment on table app.demo_orgs is
  'Demo organisations (0094, D-143): the template the copies are made from, and the copies. Guards read it through app.is_demo.';

create table app.demo_settings (
  id              boolean primary key default true check (id),
  enabled         boolean not null default true,
  reset_hours     int not null default 24 check (reset_hours between 1 and 168),
  idle_days       int not null default 14 check (idle_days between 1 and 90),
  per_network_day int not null default 5 check (per_network_day between 1 and 100),
  per_domain_day  int not null default 20 check (per_domain_day between 1 and 1000),
  per_day         int not null default 300 check (per_day between 1 and 10000)
);
insert into app.demo_settings default values;

create table app.demo_sandboxes (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  org_id       uuid not null unique references app.organizations (id) on delete cascade,
  created_at   timestamptz not null default now(),
  reset_at     timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resets       int not null default 0
);

create table app.demo_requests (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  email   text not null check (email ~ '^[^@\s]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}$'),
  domain  text not null check (domain ~ '^[a-z0-9.-]{1,253}\.[a-z]{2,63}$'),
  network text not null check (network ~ '^[0-9a-f]{32}$'),
  consent boolean not null default false,
  lang    text not null default 'no' check (lang in ('no', 'en'))
);
create index demo_requests_email on app.demo_requests (email, at);

-- a copy's id map: the template's id → the copy's, for one build, emptied when it is done
create table app.demo_id_map (
  build uuid not null,
  old   uuid not null,
  new   uuid not null,
  primary key (build, old)
);
create index demo_requests_at on app.demo_requests (at);

-- which tables a copy takes, in which order, and how a row is known to be the template's:
-- by its org_id, or by the column (`via`) that points at a row already copied
create table app.demo_copy_plan (
  table_name text primary key,
  step       int,
  mode       text not null check (mode in ('copy', 'skip')),
  via        text,
  note       text not null,
  check ((mode = 'copy') = (step is not null))
);

alter table app.demo_orgs enable row level security;
alter table app.demo_settings enable row level security;
alter table app.demo_sandboxes enable row level security;
alter table app.demo_requests enable row level security;
alter table app.demo_copy_plan enable row level security;
alter table app.demo_id_map enable row level security;
revoke all on app.demo_orgs, app.demo_settings, app.demo_sandboxes, app.demo_requests, app.demo_copy_plan, app.demo_id_map
  from public, anon, authenticated;

insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  -- the organisation's own register
  ('groups',                      10, 'copy', null, 'departments'),
  ('locations',                   11, 'copy', null, 'locations'),
  ('employees',                   12, 'copy', null, 'the fictional people'),
  ('org_questions',               13, 'copy', null, 'its own questions'),
  ('survey_defaults',             14, 'copy', null, 'standard settings, before the rounds they shape'),
  ('org_modules',                 15, 'copy', null, 'industry modules chosen, before the rounds they add to'),
  ('org_module_items_off',        16, 'copy', null, 'module statements switched off'),
  ('locale_pilots',               17, 'copy', null, 'languages piloted'),
  ('setup_progress',              18, 'copy', null, 'the setup checklist'),
  ('year_wheels',                 19, 'copy', null, 'the year wheel'),
  ('wheel_notifications',         20, 'copy', 'wheel_id', 'the wheel''s notification ladder'),
  -- rounds, and what is fixed about each before anybody answers
  ('measurements',                30, 'copy', null, 'measurements'),
  ('rounds',                      31, 'copy', null, 'rounds: inserted open, then set to their state (demo_build)'),
  ('round_factors',               32, 'copy', 'round_id', 'factors asked'),
  ('round_extra_questions',       33, 'copy', 'round_id', 'screening asked'),
  ('round_org_questions',         34, 'copy', 'round_id', 'own questions asked'),
  ('round_groups',                35, 'copy', 'round_id', 'audience'),
  ('round_modules',               36, 'copy', 'round_id', 'module statements asked'),
  ('round_translations',          37, 'copy', 'round_id', 'pinned wording'),
  ('round_consultations',         38, 'copy', 'round_id', 'consultations held'),
  ('round_information',           39, 'copy', null, 'information given'),
  ('round_starts',                40, 'copy', null, 'who started a round: the visitor'),
  ('invitations',                 41, 'copy', null, 'participation counts; each gets a new random token hash nobody holds'),
  -- answers: a group and an hour, and the answers under them
  ('responses',                   50, 'copy', null, 'responses'),
  ('answers',                     51, 'copy', 'response_id', 'index answers'),
  ('not_relevant_answers',        52, 'copy', 'response_id', '«ikke relevant»'),
  ('extra_answers',               53, 'copy', 'response_id', 'screening answers'),
  ('module_answers',              54, 'copy', 'response_id', 'module answers'),
  ('module_segment_answers',      55, 'copy', 'response_id', 'module segment answers'),
  ('module_not_relevant_answers', 56, 'copy', 'response_id', 'module «ikke relevant»'),
  ('org_count_answers',           57, 'copy', 'round_id', 'count answers'),
  ('response_comments',           58, 'copy', 'response_id', 'comments, all written for the template'),
  ('comment_threads',             59, 'copy', null, 'conversations; each gets a new random key hash'),
  ('thread_messages',             60, 'copy', 'thread_id', 'conversation messages'),
  ('contact_requests',            61, 'copy', 'thread_id', 'contact requests'),
  -- what was done about it
  ('measures',                    70, 'copy', null, 'measures'),
  ('measure_groups',              71, 'copy', 'measure_id', 'measures'' departments'),
  ('risk_assessments',            72, 'copy', null, 'risk assessments'),
  ('risk_factor_assessments',     73, 'copy', 'assessment_id', 'per factor'),
  ('trainings',                   74, 'copy', null, 'trainings'),
  -- made new for the copy, or never copied
  ('organizations',             null, 'skip', null, 'the copy''s own row is made by demo_build'),
  ('memberships',               null, 'skip', null, 'the visitor alone, as daglig leder'),
  ('member_locks',              null, 'skip', null, 'set by demo_build: nobody is invited into a sandbox'),
  ('member_invites',            null, 'skip', null, 'nobody is invited into a sandbox'),
  ('billing',                   null, 'skip', null, 'made by the organisation''s own trigger'),
  ('dpa_signatures',            null, 'skip', null, 'a sandbox signs nothing'),
  ('entry_codes',               null, 'skip', null, 'a sandbox has no QR code'),
  ('outbox',                    null, 'skip', null, 'nothing is sent from a sandbox'),
  ('mail_events',               null, 'skip', null, 'nothing is sent from a sandbox'),
  ('address_problems',          null, 'skip', null, 'nothing is sent from a sandbox'),
  ('lifecycle_mail',            null, 'skip', null, 'no lifecycle mail to a sandbox'),
  ('admin_audit',               null, 'skip', null, 'the platform''s own record'),
  ('admin_org_notes',           null, 'skip', null, 'the platform''s own record'),
  ('tickets',                   null, 'skip', null, 'the platform''s own record'),
  ('ticket_links',              null, 'skip', null, 'the platform''s own record'),
  ('deletion_log',              null, 'skip', null, 'the platform''s own record'),
  ('product_events',            null, 'skip', null, 'the platform''s own record'),
  ('org_attribution',           null, 'skip', null, 'the platform''s own record'),
  ('crm_companies',             null, 'skip', null, 'the platform''s own record'),
  ('crm_contacts',              null, 'skip', null, 'the platform''s own record'),
  ('module_pilots',             null, 'skip', null, 'a pilot is granted by the platform, not copied'),
  ('survey_defaults_log',       null, 'skip', null, 'history of the template''s settings'),
  ('org_module_items_log',      null, 'skip', null, 'history of the template''s choices'),
  ('demo_orgs',                 null, 'skip', null, 'set by demo_build'),
  ('demo_sandboxes',            null, 'skip', null, 'set by demo_build'),
  ('demo_id_map',               null, 'skip', null, 'the copy''s own working table');

-- ---------------------------------------------------------------- is it a demo?
create function app.is_demo(p_org uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select exists (select 1 from app.demo_orgs d where d.org_id = p_org) $fn$;
revoke all on function app.is_demo(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- the copy
-- One table: every column, with org_id the copy's, a user the visitor, a hash new, and every
-- other uuid the copy's own where the id map knows it (a module or a factor is shared, and
-- stays). Identity columns are left to their defaults.
create function app.demo_copy_table(p_table text, p_template uuid, p_org uuid, p_owner uuid, p_build uuid) returns bigint
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_plan  app.demo_copy_plan;
  v_rel   regclass := ('app.' || quote_ident(p_table))::regclass;
  v_cols  text;
  v_exprs text;
  v_where text;
  v_n     bigint;
begin
  select * into v_plan from app.demo_copy_plan where table_name = p_table and mode = 'copy';
  if not found then
    raise exception 'demo: % is not in the copy plan', p_table;
  end if;
  v_where := case when v_plan.via is null then 'x.org_id = $3'
                  else format('x.%I in (select m.old from app.demo_id_map m where m.build = $4)', v_plan.via) end;

  -- an id of this table's own is given a new value before any row points at it
  if exists (select 1 from pg_attribute a join pg_index i on i.indrelid = a.attrelid and i.indisprimary
             where a.attrelid = v_rel and a.attname = 'id' and i.indkey[0] = a.attnum and i.indnatts = 1
               and a.atttypid = 'uuid'::regtype) then
    execute format('insert into app.demo_id_map (build, old, new) select $4, x.id, gen_random_uuid() from app.%I x where %s',
                   p_table, v_where) using p_org, p_owner, p_template, p_build;
  end if;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(case
           -- every round goes in open: the triggers that fill a planned round from the
           -- organisation's defaults and modules (round_apply_defaults, round_default_modules)
           -- then stay out of it, and the round takes its own state once its rows are copied
           when p_table = 'rounds' and a.attname = 'status' then $$'apen'::app.round_status$$
           when p_table = 'rounds' and a.attname = 'frozen_at' then 'null'
           when p_table in ('invitations', 'comment_threads') and a.attname in ('token_hash', 'key_hash') then
             'extensions.digest(extensions.gen_random_bytes(32), ''sha256'')'
           when a.attname = 'org_id' then '$1'
           when a.atttypid = 'uuid'::regtype and fk.target in ('auth.users', 'app.profiles') then
             format('case when x.%I is null then null else $2 end', a.attname)
           when a.atttypid = 'uuid'::regtype then
             format('coalesce((select m.new from app.demo_id_map m where m.build = $4 and m.old = x.%1$I), x.%1$I)', a.attname)
           when a.atttypid = 'uuid[]'::regtype then
             format('case when x.%1$I is null then null else coalesce((select array_agg(coalesce(m.new, u.e) order by u.o) '
                    'from unnest(x.%1$I) with ordinality u(e, o) left join app.demo_id_map m on m.build = $4 and m.old = u.e), ''{}'') end',
                    a.attname)
           else format('x.%I', a.attname) end, ', ' order by a.attnum)
    into v_cols, v_exprs
  from pg_attribute a
  left join lateral (
    select k.confrelid::regclass::text as target from pg_constraint k
    where k.conrelid = a.attrelid and k.contype = 'f' and k.conkey = array[a.attnum]
    limit 1) fk on true
  where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
    and a.attidentity = '' and a.attgenerated = '';

  -- a round opened here pins today's wording, which the template's own then meets
  execute format('insert into app.%I (%s) select %s from app.%I x where %s%s',
                 p_table, v_cols, v_exprs, p_table, v_where,
                 case when p_table = 'round_translations' then ' on conflict do nothing' else '' end)
    using p_org, p_owner, p_template, p_build;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke all on function app.demo_copy_table(text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- A new sandbox for a visitor, copied from the template: returns its id.
create function app.demo_build(p_owner uuid) returns uuid
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_template uuid;
  v_org      uuid := gen_random_uuid();
  v_build    uuid := gen_random_uuid();
  v_step     record;
begin
  select d.org_id into v_template from app.demo_orgs d where d.kind = 'template' order by d.created_at limit 1;
  if v_template is null then
    raise exception 'demo: no template organisation' using errcode = 'no_data_found';
  end if;

  insert into app.demo_id_map (build, old, new) values (v_build, v_template, v_org);

  -- the organisation: the template's, with the switches that let anything out turned off, and
  -- no org.nr: it is unique, and a sandbox is no registered undertaking
  insert into app.organizations
  select (jsonb_populate_record(o, jsonb_build_object('id', v_org, 'org_number', null,
                                                      'mail_enabled', false, 'sms_enabled', false))).*
  from app.organizations o where o.id = v_template;
  insert into app.demo_orgs (org_id, kind) values (v_org, 'sandbox');
  -- no billing row: access reads as a trial (app.org_access), and everything that counts
  -- customers — KPIs, account health, the admin's list — joins billing, so never sees it
  delete from app.billing where org_id = v_org;

  insert into app.profiles (id, full_name) values (p_owner, 'Demobruker') on conflict (id) do nothing;
  insert into app.memberships (org_id, user_id, role, active) values (v_org, p_owner, 'daglig_leder', true);
  insert into app.member_locks (org_id) values (v_org);

  for v_step in select table_name from app.demo_copy_plan where mode = 'copy' order by step loop
    perform app.demo_copy_table(v_step.table_name, v_template, v_org, p_owner, v_build);
    -- rounds went in open, so their modules could be added and no default was applied to them;
    -- once everything fixed at opening is copied, and before anybody has answered, each takes
    -- its own state
    if v_step.table_name = 'round_translations' then
      update app.rounds n
      set status = t.status, frozen_at = t.frozen_at, opens_at = t.opens_at, closes_at = t.closes_at
      from app.rounds t join app.demo_id_map m on m.build = v_build and m.old = t.id
      where n.id = m.new and t.org_id = v_template;
    end if;
  end loop;
  delete from app.demo_id_map where build = v_build;
  return v_org;
end $fn$;
revoke all on function app.demo_build(uuid) from public, anon, authenticated;

-- the shared demo organisation, where it exists, is the template
insert into app.demo_orgs (org_id, kind)
select o.id, 'template' from app.organizations o where o.id = 'de000000-0000-4000-8000-000000000001'
on conflict do nothing;

-- A sandbox, gone: in the order the generator deletes (scripts/seed/demo-org.mjs), because a
-- response points at its group without a cascade, so the rounds and their responses must go
-- before the groups do. The answer tables' triggers permit a delete once the parent is gone.
create function app.demo_drop(p_org uuid) returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.demo_orgs d where d.org_id = p_org and d.kind = 'sandbox') then
    raise exception 'demo: % is not a sandbox', p_org using errcode = 'insufficient_privilege';
  end if;
  delete from app.trainings        where org_id = p_org;
  delete from app.locations        where org_id = p_org;
  delete from app.comment_threads  where org_id = p_org;
  delete from app.risk_assessments where org_id = p_org;
  delete from app.measures         where org_id = p_org;
  delete from app.org_questions    where org_id = p_org;
  delete from app.measurements     where org_id = p_org;
  delete from app.employees        where org_id = p_org;
  delete from app.groups           where org_id = p_org;
  delete from app.organizations    where id = p_org;
end $fn$;
revoke all on function app.demo_drop(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- nothing leaves a demo
-- A daglig leder may update their organisation's row directly (0001's org_update), so the lock
-- is a trigger: a demo's name, org.nr and send switches stay as they were made.
create function app.demo_org_locked() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if app.is_demo(old.id)
     and (new.name, new.org_number, new.mail_enabled, new.sms_enabled)
         is distinct from (old.name, old.org_number, old.mail_enabled, old.sms_enabled) then
    raise exception 'demo_locked' using errcode = 'insufficient_privilege',
      detail = 'A demo organisation''s name, org.nr and sending cannot be changed.';
  end if;
  return new;
end $fn$;
create trigger organizations_demo_locked before update on app.organizations
  for each row execute function app.demo_org_locked();

-- what a demo may not make at all: a QR code, a DPA signature, an invitation, a billing row.
-- The template has no members, so only the platform reaches it: its billing is the admin's
-- (a cancellation, a deletion), and only a copy's is refused.
create function app.demo_refuse() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if exists (select 1 from app.demo_orgs d
             where d.org_id = new.org_id and (d.kind = 'sandbox' or tg_table_name <> 'billing')) then
    raise exception 'demo_locked' using errcode = 'insufficient_privilege',
      detail = format('%s is not available in a demo organisation.', tg_table_name);
  end if;
  return new;
end $fn$;
create trigger entry_codes_demo before insert or update on app.entry_codes
  for each row execute function app.demo_refuse();
create trigger dpa_signatures_demo before insert on app.dpa_signatures
  for each row execute function app.demo_refuse();
create trigger member_invites_demo before insert on app.member_invites
  for each row execute function app.demo_refuse();
create trigger billing_demo before insert or update on app.billing
  for each row execute function app.demo_refuse();

-- the outbox takes nothing from a demo: the year wheel and the reminders queue into it for
-- every organisation, and a demo's rows are dropped here rather than failed there
create function app.demo_outbox_drop() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if app.is_demo(new.org_id) then
    return null;
  end if;
  return new;
end $fn$;
create trigger outbox_demo before insert on app.outbox
  for each row execute function app.demo_outbox_drop();

-- ---------------------------------------------------------------- nobody counts a demo
-- Signups, the funnel, acquisition and the CRM's sync read organisations directly; each is
-- 0050's, 0062's, 0063's and 0056's definition with the demo left out, and nothing else changed.
create or replace function public.admin_funnel(p_months int default 12) returns jsonb
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
             -- only sends after signup: an imported organisation's history is not a time to first send
             round((percentile_cont(0.5) within group (order by extract(epoch from s.first_sent - s.created_at) / 3600.0)
                    filter (where s.first_sent >= s.created_at))::numeric, 1) as median_hours_to_first_send
      from (
        select o.id, o.created_at,
               (select min(e.created_at) from app.employees e where e.org_id = o.id) as first_employee,
               (select min(ms.created_at) from app.measurements ms where ms.org_id = o.id) as first_planned,
               (select min(i.sent_at) from app.invitations i where i.org_id = o.id) as first_sent,
               exists (select 1 from app.rounds r
                       join app.invitations i on i.round_id = r.id and i.responded_at is not null
                       join app.employees e on e.id = i.employee_id
                       where r.org_id = o.id and r.status = 'lukket'
                       group by r.id, e.group_id having count(*) >= o.threshold) as unlocked,
               exists (select 1 from app.product_events pe where pe.org_id = o.id and pe.name = 'results_viewed') as viewed,
               (select min(m.created_at) from app.measures m where m.org_id = o.id) as first_measure,
               exists (select 1 from app.billing b where b.org_id = o.id and b.confirmed_at is not null) as confirmed
        from app.organizations o
        where not app.is_demo(o.id) and o.created_at >= date_trunc('month', now()) - make_interval(months => greatest(coalesce(p_months, 12), 1) - 1)
      ) s
      group by 1) c));
end $fn$;

create or replace function public.admin_trends(p_weeks int default 26) returns jsonb
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
                 where date_trunc('week', o.created_at at time zone 'Europe/Oslo') = wk.week
                   and not app.is_demo(o.id)) as signups,
               (select count(*) from app.billing b
                 where b.confirmed_at is not null and date_trunc('week', b.confirmed_at at time zone 'Europe/Oslo') = wk.week) as converted,
               (select count(distinct (e.visitor, e.day)) from app.web_events e
                 where e.day >= wk.week::date and e.day < (wk.week + interval '7 days')::date) as visitors
        from generate_series(v_from::timestamp, date_trunc('week', now() at time zone 'Europe/Oslo'), interval '7 days') wk(week)) w));
end $fn$;

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
          where o.created_at >= v_from and not app.is_demo(o.id)
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

create or replace function app.crm_sync() returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into app.crm_companies (org_number, name, form_code, nace_code, nace_label, employees, municipality, municipality_no, source, stage, org_id)
  select o.org_number, left(o.name, 200), left(o.registry_form_code, 10),
         case when o.registry_nace_code ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then o.registry_nace_code end, left(o.registry_nace_label, 200),
         o.employee_count, left(o.registry_municipality, 80),
         case when o.registry_municipality_no ~ '^[0-9]{4}$' then o.registry_municipality_no end,
         'signup', case when app.org_access(o.id) = 'active' then 'customer' else 'trial' end, o.id
  from app.organizations o
  where o.org_number ~ '^[0-9]{9}$' and not app.is_demo(o.id)
  on conflict (product_id, org_number) where org_number is not null do update set
    org_id = excluded.org_id,
    stage = excluded.stage,
    stage_changed_at = case when app.crm_companies.stage is distinct from excluded.stage then now() else app.crm_companies.stage_changed_at end,
    employees = coalesce(excluded.employees, app.crm_companies.employees),
    updated_at = now()
  where app.crm_companies.org_id is distinct from excluded.org_id or app.crm_companies.stage is distinct from excluded.stage;

  insert into app.crm_contacts (email, name, user_id, org_id, role, source, basis, lang)
  select lower(btrim(u.email)), nullif(left(btrim(coalesce(p.full_name, '')), 120), ''), u.id, m.org_id,
         case m.role::text when 'daglig_leder' then 'daglig_leder' when 'avdelingsleder' then 'leder' when 'verneombud' then 'verneombud' end,
         'user', 'none', case when p.lang = 'en' then 'en' else 'no' end
  from auth.users u
  join lateral (select m.org_id, m.role from app.memberships m where m.user_id = u.id and not app.is_demo(m.org_id)
                order by m.active desc, m.created_at limit 1) m on true
  left join app.profiles p on p.id = u.id
  where u.email is not null and lower(btrim(u.email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  on conflict (product_id, email) do update set
    user_id = excluded.user_id,
    org_id = excluded.org_id,
    name = coalesce(app.crm_contacts.name, excluded.name),
    role = coalesce(app.crm_contacts.role, excluded.role),
    updated_at = now()
  where app.crm_contacts.user_id is distinct from excluded.user_id or app.crm_contacts.org_id is distinct from excluded.org_id
     or (app.crm_contacts.name is null and excluded.name is not null) or (app.crm_contacts.role is null and excluded.role is not null);

  update app.crm_contacts c set company_id = co.id, updated_at = now()
  from app.crm_companies co
  where co.org_id = c.org_id and c.org_id is not null and c.company_id is distinct from co.id;

  update app.crm_contacts c set basis = x.basis, updated_at = now()
  from (select c2.id, case when app.crm_type(c2.user_id, c2.org_id, c2.source) = 'customer' then 'customer' else 'none' end as basis
        from app.crm_contacts c2 where c2.basis <> 'consent' and c2.user_id is not null) x
  where c.id = x.id and c.basis is distinct from x.basis;
end $fn$;

-- ---------------------------------------------------------------- the CRM takes a demo lead
alter table app.crm_contacts drop constraint crm_contacts_source_check;
alter table app.crm_contacts add constraint crm_contacts_source_check check (source in (
  'user', 'newsletter', 'contact_form', 'import', 'manual', 'event', 'brreg', 'demo'));

-- ---------------------------------------------------------------- the visitor's side
-- Addresses nobody keeps: a login link to one proves nothing.
create function app.demo_throwaway(p_domain text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select p_domain = any (array['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com',
    'grr.la', '10minutemail.com', 'yopmail.com', 'yopmail.net', 'trashmail.com', 'temp-mail.org', 'tempmail.com',
    'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'mintemail.com', 'mohmal.com',
    'emailondeck.com', 'fakeinbox.com', 'spamgourmet.com', 'mailnesia.com', 'tempr.email', 'discard.email'])
$fn$;

-- Free mailboxes are shared by millions: the per-domain limit would lock everybody out.
create function app.demo_free_mail(p_domain text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select p_domain = any (array['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.no', 'outlook.com', 'live.com',
    'live.no', 'msn.com', 'yahoo.com', 'yahoo.no', 'icloud.com', 'me.com', 'online.no', 'proton.me', 'protonmail.com'])
$fn$;

-- A request for a login link. The app sends the link only on {ok: true}. p_ip is hashed with
-- the analytics' salt of the day (app.web_visitor) and never stored.
create function public.demo_request(p_email text, p_ip text, p_consent boolean, p_lang text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  s        app.demo_settings;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_domain text;
  v_net    text;
  v_day    timestamptz := date_trunc('day', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
begin
  select * into s from app.demo_settings;
  if not s.enabled then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if v_email !~ '^[^@\s]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_domain := split_part(v_email, '@', 2);
  if app.demo_throwaway(v_domain) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_net := app.web_visitor(p_ip, 'demo');

  -- three links a day to one address, so nobody can fill a stranger's inbox with them
  if (select count(*) from app.demo_requests r where r.email = v_email and r.at >= v_day) >= 3
     or (select count(*) from app.demo_requests r where r.network = v_net and r.at >= v_day) >= s.per_network_day
     or (not app.demo_free_mail(v_domain)
         and (select count(*) from app.demo_requests r where r.domain = v_domain and r.at >= v_day) >= s.per_domain_day)
     or (select count(*) from app.demo_requests r where r.at >= v_day) >= s.per_day then
    return jsonb_build_object('ok', false, 'error', 'limited');
  end if;

  insert into app.demo_requests (email, domain, network, consent, lang)
  values (v_email, v_domain, v_net, coalesce(p_consent, false), case when p_lang = 'en' then 'en' else 'no' end);
  return jsonb_build_object('ok', true);
end $fn$;

-- The signed-in user's real organisation, if any: a demo copy is not one.
create function app.demo_real_member(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from app.memberships m where m.user_id = p_user and m.active and not app.is_demo(m.org_id))
$fn$;

-- After a login link (/auth/confirm): does this user belong in the demo?
create function public.demo_pending() returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select auth.uid() is not null
     and not app.demo_real_member(auth.uid())
     and not exists (select 1 from app.platform_admins pa where pa.user_id = auth.uid())
     and (exists (select 1 from app.demo_sandboxes d where d.user_id = auth.uid())
          or exists (select 1 from app.demo_requests r join auth.users u on lower(u.email) = r.email
                     where u.id = auth.uid() and r.at > now() - interval '2 days'))
$fn$;

-- The address is proved: its request becomes a CRM contact. Mailable only if the box was ticked;
-- a contact that already exists keeps what it had, and only ever gains consent.
create function app.demo_lead(p_user uuid) returns void
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
  insert into app.crm_contacts (email, source, basis, status, consent_at, consent_source, tags, lang)
  values (v_email, 'demo', case when r.consent then 'consent' else 'none' end, 'active',
          case when r.consent then r.at end, case when r.consent then 'demo request (box ticked, address proved)' end,
          array['demo'], r.lang)
  on conflict (product_id, email) do update set
    tags = case when 'demo' = any (app.crm_contacts.tags) or cardinality(app.crm_contacts.tags) >= 20
                then app.crm_contacts.tags else app.crm_contacts.tags || 'demo'::text end,
    basis = case when r.consent and app.crm_contacts.basis in ('none', 'business') then 'consent' else app.crm_contacts.basis end,
    consent_at = case when r.consent and app.crm_contacts.basis in ('none', 'business') then r.at else app.crm_contacts.consent_at end,
    consent_source = case when r.consent and app.crm_contacts.basis in ('none', 'business')
                          then 'demo request (box ticked, address proved)' else app.crm_contacts.consent_source end,
    updated_at = now();
end $fn$;

-- Into the demo: a new copy the first time, a fresh one after reset_hours, else the same.
create function public.demo_enter() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  s     app.demo_settings;
  v_uid uuid := auth.uid();
  d     app.demo_sandboxes;
  v_org uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if app.demo_real_member(v_uid) then
    return jsonb_build_object('ok', true, 'state', 'member');
  end if;
  if exists (select 1 from app.platform_admins pa where pa.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into s from app.demo_settings;
  select * into d from app.demo_sandboxes where user_id = v_uid for update;
  if d.user_id is null then
    if not s.enabled then
      return jsonb_build_object('ok', false, 'error', 'closed');
    end if;
    v_org := app.demo_build(v_uid);
    insert into app.demo_sandboxes (user_id, org_id) values (v_uid, v_org);
    perform app.demo_lead(v_uid);
    return jsonb_build_object('ok', true, 'state', 'created');
  end if;
  -- the new copy first, then the old one: the sandbox row follows its organisation out
  if d.reset_at < now() - make_interval(hours => s.reset_hours) then
    v_org := app.demo_build(v_uid);
    update app.demo_sandboxes set org_id = v_org, reset_at = now(), last_seen_at = now(), resets = resets + 1
    where user_id = v_uid;
    perform app.demo_drop(d.org_id);
    return jsonb_build_object('ok', true, 'state', 'reset');
  end if;
  update app.demo_sandboxes set last_seen_at = now() where user_id = v_uid;
  return jsonb_build_object('ok', true, 'state', 'continued');
end $fn$;

-- «Tilbakestill demo»: a fresh copy now.
create function public.demo_reset() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  d     app.demo_sandboxes;
  v_org uuid;
begin
  select * into d from app.demo_sandboxes where user_id = auth.uid() for update;
  if d.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_org := app.demo_build(d.user_id);
  update app.demo_sandboxes set org_id = v_org, reset_at = now(), last_seen_at = now(), resets = resets + 1
  where user_id = d.user_id;
  perform app.demo_drop(d.org_id);
  return jsonb_build_object('ok', true);
end $fn$;

-- A demo login's account, gone with its copy: used when the visitor leaves for a real account,
-- which create_organisation will not make for somebody who is already a member of something.
create function app.demo_forget(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org uuid;
begin
  select d.org_id into v_org from app.demo_sandboxes d where d.user_id = p_user;
  if v_org is not null then
    perform app.demo_drop(v_org);
  end if;
  delete from app.demo_sandboxes where user_id = p_user;
  if not exists (select 1 from app.memberships m where m.user_id = p_user)
     and not exists (select 1 from app.platform_admins pa where pa.user_id = p_user) then
    delete from auth.mfa_factors where user_id = p_user;
    delete from auth.identities where user_id = p_user;
    delete from auth.users where id = p_user;
  end if;
end $fn$;

create function public.demo_leave() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.demo_sandboxes d where d.user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.demo_forget(auth.uid());
  return jsonb_build_object('ok', true);
end $fn$;

-- For the banner: is the caller's organisation a demo copy, and when is it made fresh?
create function public.demo_state() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce((
    select jsonb_build_object('demo', true, 'reset_at', d.reset_at,
                              'fresh_after', d.reset_at + make_interval(hours => s.reset_hours),
                              'expires_at', d.last_seen_at + make_interval(days => s.idle_days))
    from app.demo_sandboxes d cross join app.demo_settings s
    where d.user_id = auth.uid()), jsonb_build_object('demo', false))
$fn$;

-- ---------------------------------------------------------------- daily: what is no longer used
create function app.demo_expire() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  s        app.demo_settings;
  r        record;
  v_boxes  int := 0;
  v_idle   int := 0;
  v_req    int;
begin
  select * into s from app.demo_settings;
  for r in select d.user_id from app.demo_sandboxes d
           where d.last_seen_at < now() - make_interval(days => s.idle_days) loop
    perform app.demo_forget(r.user_id);
    v_boxes := v_boxes + 1;
  end loop;
  -- a link asked for and never used leaves a login behind; after two days it goes
  for r in select u.id from auth.users u
           where u.created_at < now() - interval '2 days'
             and exists (select 1 from app.demo_requests q where q.email = lower(u.email))
             and not exists (select 1 from app.memberships m where m.user_id = u.id)
             and not exists (select 1 from app.demo_sandboxes d where d.user_id = u.id)
             and not exists (select 1 from app.platform_admins pa where pa.user_id = u.id) loop
    perform app.demo_forget(r.id);
    v_idle := v_idle + 1;
  end loop;
  delete from app.demo_requests where at < now() - interval '30 days';
  get diagnostics v_req = row_count;
  return jsonb_build_object('sandboxes', v_boxes, 'unused_logins', v_idle, 'requests', v_req);
end $fn$;

select cron.schedule('orgpuls-demo-expire', '20 3 * * *', $job$select app.demo_expire()$job$);

revoke all on function app.demo_org_locked(), app.demo_refuse(), app.demo_outbox_drop(), app.demo_throwaway(text),
  app.demo_free_mail(text), app.demo_real_member(uuid), app.demo_lead(uuid), app.demo_forget(uuid), app.demo_expire()
  from public, anon, authenticated;
revoke all on function public.demo_request(text, text, boolean, text), public.demo_pending(), public.demo_enter(),
  public.demo_reset(), public.demo_leave(), public.demo_state() from public, anon, authenticated;
grant execute on function public.demo_request(text, text, boolean, text) to anon, authenticated;
grant execute on function public.demo_pending(), public.demo_enter(), public.demo_reset(), public.demo_leave(),
  public.demo_state() to authenticated;

-- ---------------------------------------------------------------- the shared login, retired
-- Everybody with the shared demo password could change the template every copy is made from.
-- The template keeps its data and loses its members; the visitor gets a copy of their own.
delete from app.memberships m using app.demo_orgs d where d.org_id = m.org_id and d.kind = 'template';
