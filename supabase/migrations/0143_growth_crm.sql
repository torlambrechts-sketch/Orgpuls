-- 0143_growth_crm.sql — Sentral › Growth G3: the CRM's revision-3 pages (D-184).
--
-- Phase G3 of docs/implementation/growth-admin.md. Five parts, each read by one admin page:
--
-- 1. **Task SLA** (Tasks). A task a rule or a Brønnøysund trigger makes carries its origin, the rule
--    (R2, R10, R11), what kind of work it is (call, email, letter) and, for a callback, a deadline one
--    working hour after the hand-raise (app.add_business_hours: weekdays 08–16 Oslo, public holidays
--    off). app.business_minutes counts the working minutes left, or by how much it was missed. A task
--    made by a rule or a trigger names what it is by a key (`auto:…`), which the admin words.
-- 2. **Lead scoring, fit × intent** (Lead scoring). Fit 0–50 from Brønnøysund (report § 7.3: target
--    industry 15, 5–100 employees 15, crossed 5 or 30 in 90 days 10, a new general manager in 180
--    days 5, active and not under liquidation 5). Intent 0–50 from first-party signals after consent
--    or signup; of the design's six, only the hand-raise has a source today (a demo request or a
--    sales question from the contact form, by the contact's address), and the others say so rather
--    than score. Routing: 60 or more, or a hand-raise, is a founder callback on the one-hour SLA; a
--    trial follows the PQL rule (activated, ≥ 50 % response by day 7, or a verneombud invited on the
--    26–100 tier), read from the org-level event stream. app.lead_route() makes those tasks, every
--    five minutes. The account health score (0060) is untouched: /admin/health still reads it.
-- 3. **Partners** (Partners). app.partners, and a referral code carried through the existing
--    attribution path: the site's beacon sends `ref` like a campaign tag, app.web_events keeps it,
--    and record_signup_source puts the partner on org_attribution when the code is a partner's.
--    Trials in 30 days per partner are counted from that.
-- 4. **Consent** (Consent). A phone notice is a ledger record on a CRM company (lawful basis
--    legit_interest_phone, purpose phone_outreach); an objection is a withdrawal and puts the
--    organisation number on the do-not-contact list. An admin suppression is hashed before it is
--    stored. The ledger can be exported (audited).
-- 5. **Brønnøysund triggers** (Brønnøysund triggers). The edge function orgpuls-brreg-triggers
--    polls Enhetsregisteret's update feed daily, re-fetches changed entities and hands them to
--    brreg_ingest (service role). The database raises threshold_5, threshold_30, company_new and
--    manager_changed, scores fit, and queues outreach with fit ≥ 30 (app.brreg_rules): a phone task, a
--    letter to the business address, or an email to a GENERIC address only (app.brreg_generic_email,
--    a CHECK on every row that holds one) that is not suppressed (app.crm_suppressed, checked when
--    raised and again when assigned, and an address suppressed later turns its outreach into a call
--    or a letter at once). 10 % are held out by a hash of the organisation number; the
--    do-not-contact list is honoured when raised and when assigned, and an objection stops outreach
--    already assigned and closes its task for good; an entity gone with HTTP 410 is purged, its
--    do-not-contact entry kept. **Dry run by
--    default**: tasks are queued, not assigned, until an admin switches it (audited). Role data: a
--    general manager's name only, only on phone and letter outreach; never a birth date. The
--    anonymity firewall's scope takes in these tables and partners (section 10).
--
-- Every new table has RLS on, no policy and no grant; reads and writes go through admin_* functions
-- (the CRM's roles, with the second factor), and every admin write is audited.

-- ============================================================ 1. working time and task SLA
-- Working minutes between two instants (Monday–Friday 08:00–16:00 Oslo, public holidays off, as
-- app.add_business_hours counts them); negative when p_to is before p_from.
create function app.business_minutes(p_from timestamptz, p_to timestamptz) returns int
  language plpgsql stable set search_path = ''
as $fn$
declare
  a timestamp;
  b timestamp;
  t timestamp;
  s timestamp;
  e timestamp;
  d date;
  v_sign int := 1;
  v_total numeric := 0;
begin
  if p_from is null or p_to is null then
    return null;
  end if;
  a := p_from at time zone 'Europe/Oslo';
  b := p_to at time zone 'Europe/Oslo';
  if b < a then
    t := a; a := b; b := t; v_sign := -1;
  end if;
  d := a::date;
  -- bounded: a year of days at most
  while d <= b::date and d <= a::date + 366 loop
    if extract(isodow from d) < 6 and not app.no_public_holiday(d) then
      s := greatest(a, d + time '08:00');
      e := least(b, d + time '16:00');
      if e > s then
        v_total := v_total + extract(epoch from e - s) / 60;
      end if;
    end if;
    d := d + 1;
  end loop;
  return v_sign * floor(v_total)::int;
end $fn$;
revoke all on function app.business_minutes(timestamptz, timestamptz) from public, anon, authenticated;

alter table app.crm_activities
  add column origin text check (origin in ('rule', 'trigger')),
  add column rule text check (rule ~ '^R[0-9]{1,2}$'),
  add column task_kind text check (task_kind in ('call', 'email', 'letter')),
  add column sla_due_at timestamptz,
  -- a task a rule or a trigger makes is a task, names its rule and its kind, and says what it is by a key
  add constraint crm_activities_auto check (origin is null or (kind = 'task' and rule is not null and task_kind is not null
                                                                and body ~ '^auto:[a-z0-9_]{2,40}$')),
  add constraint crm_activities_sla check (sla_due_at is null or origin = 'rule');
create index crm_activities_rule on app.crm_activities (contact_id, body, created_at desc) where origin = 'rule';

-- ============================================================ 2. Brønnøysund: the tables
-- One row: the engine's switch and its place in the two feeds.
create table app.brreg_settings (
  id boolean primary key default true check (id),
  dry_run boolean not null default true,
  feed_cursor bigint check (feed_cursor >= 0),
  roles_cursor bigint check (roles_cursor >= 0)
);
comment on table app.brreg_settings is
  'The Brønnøysund trigger engine (0143, D-184): dry run (tasks queued, not assigned) until an admin switches it, and the last update ids read from the entity and role feeds. Who switched it, and when, is the audit log''s (crm.brreg_dry_run).';
insert into app.brreg_settings (id) values (true);
alter table app.brreg_settings enable row level security;
revoke all on app.brreg_settings from public, anon, authenticated;

create table app.brreg_polls (
  id bigint generated always as identity primary key,
  source text not null check (source in ('cron', 'manual')),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'requested' check (status in ('requested', 'running', 'done', 'failed')),
  changes int check (changes >= 0),
  error text check (error ~ '^[a-z0-9_]{1,60}$')
);
comment on table app.brreg_polls is
  'Each poll of the Enhetsregisteret update feed (0143): who asked, when it ran, how many entities the feed flagged Ny or Endring, and a failure code. No entity data.';
create index brreg_polls_recent on app.brreg_polls (requested_at desc);
alter table app.brreg_polls enable row level security;
revoke all on app.brreg_polls from public, anon, authenticated;

-- The entities the engine has seen: organisations only. A sole proprietorship (ENK) is a person's
-- name and often a home address, and is never stored (D-184). An e-mail address is kept only when it
-- is a generic one (app.brreg_generic_email): a named address is dropped before it reaches the table.
create function app.brreg_generic_email(p_email text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select coalesce(lower(btrim(p_email)) ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
                  and split_part(lower(btrim(p_email)), '@', 1) = any (array[
                    'post', 'postmottak', 'postkasse', 'firmapost', 'firma', 'kontakt', 'kontor', 'info', 'epost', 'e-post',
                    'mail', 'office', 'admin', 'resepsjon', 'sentralbord', 'service', 'kundeservice', 'salg', 'ordre',
                    'regnskap', 'faktura', 'hr', 'personal', 'hms', 'contact', 'hello', 'hei']), false)
$fn$;
comment on function app.brreg_generic_email(text) is
  'True for a generic role address (post@, firmapost@, kontakt@, …): the only kind of address the Brønnøysund engine may keep or queue an email to. Never a named address (markedsføringsloven § 15).';
revoke all on function app.brreg_generic_email(text) from public, anon, authenticated;

create table app.brreg_entities (
  org_number text primary key check (org_number ~ '^[0-9]{9}$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  form_code text not null check (form_code ~ '^[A-ZÆØÅ]{2,6}$' and form_code <> 'ENK'),
  nace_code text check (nace_code ~ '^[0-9]{2}(\.[0-9]{1,3})?$'),
  employees int check (employees >= 0),
  municipality text check (char_length(municipality) <= 80),
  -- the business address a letter goes to (the task list shows it on a letter task)
  address text check (char_length(address) <= 300),
  phone text check (char_length(phone) <= 40),
  generic_email text check (generic_email is null or app.brreg_generic_email(generic_email)),
  active boolean not null,
  manager_changed_on date
);
comment on table app.brreg_entities is
  'Organisations seen in the Enhetsregisteret update feed (0143, NLOD 2.0): the facts fit, the triggers and outreach read. No sole proprietorships, no person, only a generic address. Purged when the register answers 410.';
alter table app.brreg_entities enable row level security;
revoke all on app.brreg_entities from public, anon, authenticated;

create table app.brreg_triggers (
  id uuid primary key default gen_random_uuid(),
  org_number text not null references app.brreg_entities (org_number) on delete cascade,
  kind text not null check (kind in ('threshold_5', 'threshold_30', 'company_new', 'manager_changed')),
  poll_id bigint references app.brreg_polls (id) on delete set null,
  raised_at timestamptz not null default now(),
  employees_from int check (employees_from >= 0),
  employees_to int check (employees_to >= 0),
  fit int not null check (fit between 0 and 50)
);
create index brreg_triggers_org on app.brreg_triggers (org_number, kind, raised_at desc);
create index brreg_triggers_poll on app.brreg_triggers (poll_id);
alter table app.brreg_triggers enable row level security;
revoke all on app.brreg_triggers from public, anon, authenticated;

-- The internal do-not-contact list: an organisation number, why, when and by whom.
create table app.brreg_dnc (
  org_number text primary key check (org_number ~ '^[0-9]{9}$'),
  reason text not null check (reason in ('objected', 'manual')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
alter table app.brreg_dnc enable row level security;
revoke all on app.brreg_dnc from public, anon, authenticated;

-- A purge leaves only that it happened: no organisation number, nothing that names what was removed.
create table app.brreg_purges (
  id bigint generated always as identity primary key,
  purged_at timestamptz not null default now()
);
alter table app.brreg_purges enable row level security;
revoke all on app.brreg_purges from public, anon, authenticated;

create table app.brreg_outreach (
  id uuid primary key default gen_random_uuid(),
  trigger_id uuid not null unique references app.brreg_triggers (id) on delete cascade,
  org_number text not null references app.brreg_entities (org_number) on delete cascade,
  channel text check (channel in ('phone', 'letter', 'email')),
  status text not null check (status in ('queued', 'assigned', 'sent', 'holdout', 'do_not_contact')),
  -- a generic address only, and only for an email; the rule is the table's own, not a caller's promise
  email text check (email is null or (channel = 'email' and app.brreg_generic_email(email))),
  -- the general manager's name (never a birth date), for a phone call or a letter only
  manager_name text check (manager_name is null or (channel in ('phone', 'letter') and char_length(btrim(manager_name)) between 2 and 120)),
  company_id uuid references app.crm_companies (id) on delete set null,
  activity_id uuid references app.crm_activities (id) on delete set null,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  sent_at timestamptz,
  check (channel is not null or status = 'do_not_contact'),
  check (status <> 'assigned' or activity_id is not null)
);
create index brreg_outreach_status on app.brreg_outreach (status, created_at desc);
create index brreg_outreach_activity on app.brreg_outreach (activity_id) where activity_id is not null;
create index brreg_outreach_company on app.brreg_outreach (company_id) where company_id is not null;
alter table app.brreg_outreach enable row level security;
revoke all on app.brreg_outreach from public, anon, authenticated;

-- ============================================================ 3. fit
-- The engine's rules, in one place: the employee counts the law draws (verneombud from 5, AMU from
-- 30), the report's target industries as NACE division ranges — construction (41–43), trade
-- (46–47), information and professional services (58–74), education (85), health and social work
-- (86–88) — and the fit a trigger needs before outreach. The ingest, fit and the raise read them
-- here, and «Edit triggers» shows them from here (admin_brreg_triggers), so the page cannot say
-- one thing while the engine does another.
create function app.brreg_rules() returns jsonb
  language sql immutable set search_path = ''
as $fn$
  select '{"thresholds": [5, 30], "industries": [[41, 43], [46, 47], [58, 74], [85, 85], [86, 88]], "fit_min": 30}'::jsonb
$fn$;
revoke all on function app.brreg_rules() from public, anon, authenticated;

create function app.fit_target_nace(p_nace text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select case when p_nace ~ '^[0-9]{2}'
              then exists (select 1 from jsonb_array_elements(app.brreg_rules()->'industries') r
                           where left(p_nace, 2)::int between (r->>0)::int and (r->>1)::int)
              else false end
$fn$;
revoke all on function app.fit_target_nace(text) from public, anon, authenticated;

-- Fit 0–50 from what Brønnøysund says of a company, part by part.
create function app.fit_score(p_nace text, p_employees int, p_crossed_at timestamptz, p_manager_on date, p_active boolean)
  returns jsonb
  language sql stable set search_path = ''
as $fn$
  with p(key, points, hit, ord) as (values
    ('industry', 15, coalesce(app.fit_target_nace(p_nace), false), 1),
    ('size', 15, coalesce(p_employees between 5 and 100, false), 2),
    ('crossed', 10, coalesce(p_crossed_at > now() - interval '90 days', false), 3),
    ('manager', 5, coalesce(p_manager_on > (now() at time zone 'Europe/Oslo')::date - 180, false), 4),
    ('active', 5, coalesce(p_active, false), 5))
  select jsonb_build_object('total', sum(case when p.hit then p.points else 0 end),
                            'parts', jsonb_agg(jsonb_build_object('key', p.key, 'points', p.points, 'on', p.hit) order by p.ord))
  from p
$fn$;
revoke all on function app.fit_score(text, int, timestamptz, date, boolean) from public, anon, authenticated;

-- ============================================================ 4. Brønnøysund: the engine
-- 10 % of organisations are held out, always the same ones: a hash of the number, never chance.
create function app.brreg_holdout(p_org text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select ('x' || left(md5('orgpuls-holdout:' || p_org), 7))::bit(28)::int % 10 = 0
$fn$;
revoke all on function app.brreg_holdout(text) from public, anon, authenticated;

-- The next working day in Oslo, as a date.
create function app.next_workday(p_from timestamptz default now()) returns date
  language plpgsql stable set search_path = ''
as $fn$
declare d date := (p_from at time zone 'Europe/Oslo')::date + 1;
begin
  while extract(isodow from d) >= 6 or app.no_public_holiday(d) loop
    d := d + 1;
  end loop;
  return d;
end $fn$;
revoke all on function app.next_workday(timestamptz) from public, anon, authenticated;

-- Assigning: the company in the CRM (found by its number, or made from the entity) and a task for a
-- person. Only when the engine is not in dry run. Checked again here, at the moment a person is given
-- the work: an organisation on the do-not-contact list is not contacted (the row stops), and an email
-- goes only to an address still not suppressed (else it is a call when there is a number, a letter
-- when not).
create function app.brreg_assign(p_outreach uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $fn$
declare
  o app.brreg_outreach;
  en app.brreg_entities;
  v_company uuid;
  v_task uuid;
begin
  select * into o from app.brreg_outreach x where x.id = p_outreach for update;
  if o.id is null or o.status <> 'queued' or o.channel is null then
    return false;
  end if;
  if exists (select 1 from app.brreg_dnc d where d.org_number = o.org_number) then
    update app.brreg_outreach set status = 'do_not_contact' where id = o.id;
    return false;
  end if;
  select * into en from app.brreg_entities e where e.org_number = o.org_number;
  if o.channel = 'email' and (o.email is null or app.crm_suppressed(o.email)) then
    o.channel := case when en.phone is not null then 'phone' else 'letter' end;
    update app.brreg_outreach set channel = o.channel, email = null where id = o.id;
  end if;
  select c.id into v_company from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = o.org_number;
  if v_company is null then
    insert into app.crm_companies (name, org_number, form_code, nace_code, employees, municipality, phone, source, stage)
    values (en.name, en.org_number, en.form_code, en.nace_code, en.employees, en.municipality, en.phone, 'brreg', 'new')
    returning id into v_company;
  end if;
  insert into app.crm_activities (company_id, kind, body, due_at, origin, rule, task_kind)
  values (v_company, 'task', 'auto:outreach_' || o.channel, app.next_workday(), 'trigger', 'R11',
          case o.channel when 'phone' then 'call' else o.channel end)
  returning id into v_task;
  update app.brreg_outreach set status = 'assigned', company_id = v_company, activity_id = v_task, assigned_at = now()
  where id = o.id;
  return true;
end $fn$;
revoke all on function app.brreg_assign(uuid) from public, anon, authenticated;

-- A trigger, once per organisation and kind in 180 days, with its fit; outreach when fit ≥ 30
-- (app.brreg_rules). The channel: an email only to a generic address that is not on the suppression
-- list (unsubscribed, bounced, complained or erased: app.crm_suppressed), else a call when the
-- register gives a number, else a letter.
create function app.brreg_raise(p_org text, p_kind text, p_poll bigint, p_from int, p_to int) returns uuid
  language plpgsql security definer set search_path = ''
as $fn$
declare
  en app.brreg_entities;
  v_fit jsonb;
  v_trigger uuid;
  v_email text;
  v_channel text;
  v_status text;
  v_out uuid;
begin
  if exists (select 1 from app.brreg_triggers t where t.org_number = p_org and t.kind = p_kind
             and t.raised_at > now() - interval '180 days') then
    return null;
  end if;
  select * into en from app.brreg_entities e where e.org_number = p_org;
  if en.org_number is null then
    return null;
  end if;
  v_fit := app.fit_score(en.nace_code, en.employees,
                         case when p_kind in ('threshold_5', 'threshold_30') then now()
                              else (select max(t.raised_at) from app.brreg_triggers t
                                    where t.org_number = p_org and t.kind in ('threshold_5', 'threshold_30')) end,
                         en.manager_changed_on, en.active);
  insert into app.brreg_triggers (org_number, kind, poll_id, employees_from, employees_to, fit)
  values (p_org, p_kind, p_poll, p_from, p_to, (v_fit->>'total')::int)
  returning id into v_trigger;
  if (v_fit->>'total')::int < (app.brreg_rules()->>'fit_min')::int then
    return v_trigger;
  end if;
  v_email := case when en.generic_email is not null and not app.crm_suppressed(en.generic_email) then en.generic_email end;
  v_channel := case when v_email is not null then 'email' when en.phone is not null then 'phone' else 'letter' end;
  v_status := case when exists (select 1 from app.brreg_dnc d where d.org_number = p_org) then 'do_not_contact'
                   when app.brreg_holdout(p_org) then 'holdout'
                   else 'queued' end;
  insert into app.brreg_outreach (trigger_id, org_number, channel, status, email)
  values (v_trigger, p_org, case when v_status = 'do_not_contact' then null else v_channel end, v_status,
          case when v_status <> 'do_not_contact' and v_channel = 'email' then v_email end)
  returning id into v_out;
  if v_status = 'queued' and not (select s.dry_run from app.brreg_settings s) then
    perform app.brreg_assign(v_out);
  end if;
  return v_trigger;
end $fn$;
revoke all on function app.brreg_raise(text, text, bigint, int, int) from public, anon, authenticated;

-- A task done is an outreach made (not a skip); reopened, it is assigned again — unless the
-- organisation has since objected. Outreach stopped by an objection (do_not_contact) is never moved.
create function app.brreg_outreach_done() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.done_at is not null and not new.skipped then
    update app.brreg_outreach set status = 'sent', sent_at = new.done_at where activity_id = new.id and status = 'assigned';
  elsif new.done_at is null then
    update app.brreg_outreach o set status = 'assigned', sent_at = null
    where o.activity_id = new.id and o.status = 'sent'
      and not exists (select 1 from app.brreg_dnc d where d.org_number = o.org_number);
  end if;
  return null;
end $fn$;
revoke all on function app.brreg_outreach_done() from public, anon, authenticated;
create trigger brreg_outreach_done after update of done_at on app.crm_activities
  for each row when (old.done_at is distinct from new.done_at) execute function app.brreg_outreach_done();

-- A task an objection closed stays closed: reopening it would put a company on the do-not-contact
-- list back in front of a person as work to do. Only a reopening is refused (done_at set → null);
-- the column is no foreign key, so no referential action ever takes this path.
create function app.brreg_task_stopped() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if exists (select 1 from app.brreg_outreach o where o.activity_id = new.id and o.status = 'do_not_contact') then
    raise exception 'this outreach was stopped by an objection; its task stays closed' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;
revoke all on function app.brreg_task_stopped() from public, anon, authenticated;
create trigger brreg_task_stopped before update of done_at on app.crm_activities
  for each row when (old.done_at is not null and new.done_at is null) execute function app.brreg_task_stopped();

-- An address suppressed after its email was queued or given to a person (unsubscribed, bounced,
-- complained, erased — however it reaches the list) is no longer an email target: as brreg_assign
-- does, the outreach becomes a call when the register gives a number, else a letter, and its open
-- task says so. So an address suppressed at any time before the send is never the one emailed.
create function app.brreg_suppression_reroute() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r record;
  v_channel text;
begin
  for r in select o.id, o.activity_id, e.phone
           from app.brreg_outreach o join app.brreg_entities e on e.org_number = o.org_number
           where o.channel = 'email' and o.status in ('queued', 'assigned') and o.email is not null
             and app.crm_hash(o.email) = new.email_hash
           for update of o loop
    v_channel := case when r.phone is not null then 'phone' else 'letter' end;
    update app.brreg_outreach set channel = v_channel, email = null where id = r.id;
    update app.crm_activities set body = 'auto:outreach_' || v_channel, task_kind = case v_channel when 'phone' then 'call' else v_channel end
    where id = r.activity_id and done_at is null;
  end loop;
  return null;
end $fn$;
revoke all on function app.brreg_suppression_reroute() from public, anon, authenticated;
create trigger brreg_suppression_reroute after insert or update of email_hash on app.crm_suppression
  for each row execute function app.brreg_suppression_reroute();

-- Purge: an entity the register removed for legal reasons (HTTP 410) leaves nothing here but a count
-- — and its place on the do-not-contact list. That entry is a nine-digit organisation number, not a
-- person, and it is what keeps an objection honoured: were the number to come back in the register,
-- brreg_raise and brreg_assign still find it on the list and contact nobody.
create function app.brreg_purge_org(p_org text) returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  delete from app.brreg_entities where org_number = p_org;            -- its triggers and outreach go with it
  -- a company the engine made (source brreg, not an account's) goes too, with its tasks and phone notices
  delete from app.crm_companies where product_id = 'orgpuls' and org_number = p_org and source = 'brreg' and org_id is null;
  insert into app.brreg_purges default values;
end $fn$;
revoke all on function app.brreg_purge_org(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the edge function's entry points
-- (service role only). A poll begins, ingests entities and roles, fills in names, and ends.
create function public.brreg_poll_begin(p_poll bigint default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id bigint := p_poll;
  s app.brreg_settings;
begin
  if exists (select 1 from app.brreg_polls p where p.status = 'running' and p.started_at > now() - interval '1 hour'
             and p.id is distinct from p_poll) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  if v_id is null or not exists (select 1 from app.brreg_polls p where p.id = v_id and p.status = 'requested') then
    insert into app.brreg_polls (source, status, started_at) values ('cron', 'running', now()) returning id into v_id;
  else
    update app.brreg_polls set status = 'running', started_at = now() where id = v_id;
  end if;
  select * into s from app.brreg_settings;
  return jsonb_build_object('ok', true, 'poll_id', v_id, 'feed_cursor', s.feed_cursor, 'roles_cursor', s.roles_cursor);
end $fn$;

-- Entities re-fetched after the feed flagged them. Each row: org_number, name, form_code, nace_code,
-- employees (null when the register has no count), employees_op ('add' when the count was added, so it
-- was none before), is_new (the feed said Ny), municipality, address, phone, email (generic only; any
-- other is dropped here as well as by the function), active.
create function public.brreg_ingest(p_poll bigint, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r jsonb;
  prev app.brreg_entities;
  v_org text;
  v_emp int;
  v_prev int;
  v_raised int := 0;
  v_seen int := 0;
  v_email text;
  -- the thresholds the law draws (app.brreg_rules): verneombud from 5, AMU from 30
  v_t5 constant int := (app.brreg_rules()->'thresholds'->>0)::int;
  v_t30 constant int := (app.brreg_rules()->'thresholds'->>1)::int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for r in select x from jsonb_array_elements(p_rows) x loop
    v_org := r->>'org_number';
    if coalesce(v_org, '') !~ '^[0-9]{9}$' or coalesce(r->>'form_code', 'ENK') = 'ENK'
       or r->>'form_code' !~ '^[A-ZÆØÅ]{2,6}$' or coalesce(btrim(r->>'name'), '') = '' then
      continue;
    end if;
    v_emp := case when r->>'employees' ~ '^[0-9]{1,7}$' then (r->>'employees')::int end;
    select * into prev from app.brreg_entities e where e.org_number = v_org;
    v_prev := case when prev.org_number is not null then prev.employees
                   when r->>'employees_op' = 'add' then 0 end;
    -- stored: an organisation with employees, or one seen before
    if prev.org_number is null and coalesce(v_emp, 0) < 1 and not coalesce((r->>'is_new')::boolean, false) then
      continue;
    end if;
    v_email := case when app.brreg_generic_email(r->>'email') then lower(btrim(r->>'email')) end;
    insert into app.brreg_entities as e (org_number, name, form_code, nace_code, employees, municipality, address, phone,
                                         generic_email, active)
    values (v_org, left(btrim(r->>'name'), 200), r->>'form_code',
            case when r->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then r->>'nace_code' end,
            v_emp, left(r->>'municipality', 80), left(r->>'address', 300), left(r->>'phone', 40), v_email,
            coalesce((r->>'active')::boolean, false))
    on conflict (org_number) do update set
      name = excluded.name, form_code = excluded.form_code, nace_code = excluded.nace_code,
      employees = excluded.employees, municipality = excluded.municipality, address = excluded.address, phone = excluded.phone,
      generic_email = excluded.generic_email, active = excluded.active;
    v_seen := v_seen + 1;
    -- a crossing of a threshold; one crossing both is the higher one
    if v_prev is not null and v_prev < v_t30 and coalesce(v_emp, 0) >= v_t30 then
      if app.brreg_raise(v_org, 'threshold_30', p_poll, v_prev, v_emp) is not null then v_raised := v_raised + 1; end if;
    elsif v_prev is not null and v_prev < v_t5 and coalesce(v_emp, 0) >= v_t5 then
      if app.brreg_raise(v_org, 'threshold_5', p_poll, v_prev, v_emp) is not null then v_raised := v_raised + 1; end if;
    end if;
    if coalesce((r->>'is_new')::boolean, false) and app.fit_target_nace(r->>'nace_code') and coalesce(v_emp, 0) >= v_t5 then
      if app.brreg_raise(v_org, 'company_new', p_poll, null, v_emp) is not null then v_raised := v_raised + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'seen', v_seen, 'raised', v_raised);
end $fn$;

-- Which of the organisations whose roles changed the engine follows (5 or more employees): the
-- function reads the roles API for these only.
create function public.brreg_role_candidates(p_orgs text[]) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('ok', true, 'orgs', coalesce(jsonb_agg(e.org_number), '[]'))
  from app.brreg_entities e
  where e.org_number = any (coalesce(p_orgs, '{}')) and coalesce(e.employees, 0) >= (app.brreg_rules()->'thresholds'->>0)::int
$fn$;

-- The daglig leder role group's last change, per organisation: a change within 7 days raises
-- manager_changed. No name and no birth date is passed here.
create function public.brreg_roles_ingest(p_poll bigint, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r jsonb;
  v_on date;
  v_raised int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for r in select x from jsonb_array_elements(p_rows) x loop
    if coalesce(r->>'org_number', '') !~ '^[0-9]{9}$' or coalesce(r->>'manager_changed_on', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      continue;
    end if;
    v_on := (r->>'manager_changed_on')::date;
    update app.brreg_entities set manager_changed_on = v_on where org_number = r->>'org_number';
    if found and v_on >= (now() at time zone 'Europe/Oslo')::date - 7 then
      if app.brreg_raise(r->>'org_number', 'manager_changed', p_poll, null,
                         (select e.employees from app.brreg_entities e where e.org_number = r->>'org_number')) is not null then
        v_raised := v_raised + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'raised', v_raised);
end $fn$;

-- The outreach rows that will be a call or a letter and have no name yet.
create function public.brreg_outreach_names_needed() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('ok', true, 'rows', coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'org_number', x.org_number)), '[]'))
  from (select o.id, o.org_number from app.brreg_outreach o
        where o.channel in ('phone', 'letter') and o.status in ('queued', 'assigned') and o.manager_name is null
        order by o.created_at limit 100) x
$fn$;

create function public.brreg_outreach_names(p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r jsonb;
  v_n int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for r in select x from jsonb_array_elements(p_rows) x loop
    if char_length(btrim(coalesce(r->>'name', ''))) between 2 and 120 and r->>'id' ~ '^[0-9a-f-]{36}$' then
      update app.brreg_outreach set manager_name = btrim(r->>'name')
      where id = (r->>'id')::uuid and channel in ('phone', 'letter') and manager_name is null;
      if found then v_n := v_n + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'named', v_n);
end $fn$;

create function public.brreg_purge(p_org text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if coalesce(p_org, '') !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.brreg_purge_org(p_org);
  return jsonb_build_object('ok', true);
end $fn$;

create function public.brreg_poll_end(p_poll bigint, p_changes int, p_feed_cursor bigint, p_roles_cursor bigint, p_error text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  update app.brreg_polls
  set status = case when p_error is null then 'done' else 'failed' end, finished_at = now(),
      changes = greatest(coalesce(p_changes, 0), 0),
      error = case when p_error ~ '^[a-z0-9_]{1,60}$' then p_error when p_error is not null then 'failed' end
  where id = p_poll and status = 'running';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_running');
  end if;
  update app.brreg_settings
  set feed_cursor = coalesce(greatest(p_feed_cursor, feed_cursor), p_feed_cursor, feed_cursor),
      roles_cursor = coalesce(greatest(p_roles_cursor, roles_cursor), p_roles_cursor, roles_cursor);
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- asking for a poll
-- The function is called like the dispatcher (its URL with the function's name, the dispatcher's
-- secret), from the vault. Without those secrets nothing is asked; a poll nobody answered within an
-- hour is marked failed, so a missing function shows as a failed poll, never as a run.
create function app.brreg_request(p_source text, p_by uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_url text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'orgpuls_dispatch_url');
  v_secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'orgpuls_dispatch_secret');
  v_id bigint;
begin
  update app.brreg_polls set status = 'failed', error = 'no_answer', finished_at = now()
  where status in ('requested', 'running') and requested_at < now() - interval '1 hour';
  if v_url is null or v_secret is null then
    return jsonb_build_object('ok', false, 'error', 'not_configured');
  end if;
  insert into app.brreg_polls (source, requested_by) values (p_source, p_by) returning id into v_id;
  perform net.http_post(
    url := replace(v_url, 'orgpuls-dispatch', 'orgpuls-brreg-triggers'),
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body := jsonb_build_object('poll_id', v_id),
    timeout_milliseconds := 300000);
  return jsonb_build_object('ok', true, 'poll_id', v_id);
end $fn$;
revoke all on function app.brreg_request(text, uuid) from public, anon, authenticated;

-- The daily job: not while a poll runs or one was just asked for. The lock serialises it with «Run
-- poll now», so two requests can never both pass the check and both call the register.
create function app.brreg_cron() returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  perform pg_advisory_xact_lock(hashtext('orgpuls:brreg_poll'));
  if exists (select 1 from app.brreg_polls p where p.requested_at > now() - interval '15 minutes'
             or (p.status = 'running' and p.started_at > now() - interval '1 hour')) then
    return;
  end if;
  perform app.brreg_request('cron', null);
end $fn$;
revoke all on function app.brreg_cron() from public, anon, authenticated;

-- Daily at 05:10 Oslo in summer (03:10 UTC). Harmless while the function is not deployed: without the
-- vault's secrets nothing is asked, and an unanswered request is only a failed poll row.
select cron.schedule('orgpuls-brreg-triggers', '10 3 * * *', $job$ select app.brreg_cron() $job$);

-- ============================================================ 5. lead scoring and routing
-- Intent 0–50: the design's six first-party signals. Only the hand-raise has a source in the schema
-- today; the others are listed with their points and `sourced` false, and score nothing.
create function app.intent_score(p_hand_raised boolean) returns jsonb
  language sql immutable set search_path = ''
as $fn$
  select jsonb_build_object('total', sum(case when p.hit then p.points else 0 end),
                            'parts', jsonb_agg(jsonb_build_object('key', p.key, 'points', p.points, 'on', p.hit, 'sourced', p.sourced) order by p.ord))
  from (values ('tool', 10, false, false, 1), ('pdf', 10, false, false, 2), ('pricing', 10, false, false, 3),
               ('industry_twice', 5, false, false, 4), ('webinar', 5, false, false, 5),
               ('hand_raise', 10, coalesce(p_hand_raised, false), true, 6)) p(key, points, hit, sourced, ord)
$fn$;
revoke all on function app.intent_score(boolean) from public, anon, authenticated;

create function app.lead_score(p_contact uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  c app.crm_contacts;
  co app.crm_companies;
  en app.brreg_entities;
  o app.organizations;
  v_org text;
  v_fit jsonb;
  v_hand timestamptz;
  v_intent jsonb;
  v_pql text;
  v_trial boolean;
  v_total int;
  v_route text;
begin
  select * into c from app.crm_contacts x where x.id = p_contact;
  if c.id is null then
    return null;
  end if;
  select * into co from app.crm_companies x where x.id = c.company_id;
  v_org := coalesce(co.org_number, c.org_number);
  select * into en from app.brreg_entities x where x.org_number = v_org;
  v_fit := app.fit_score(coalesce(en.nace_code, co.nace_code), coalesce(en.employees, co.employees),
                         (select max(t.raised_at) from app.brreg_triggers t where t.org_number = v_org and t.kind in ('threshold_5', 'threshold_30')),
                         en.manager_changed_on, en.active);
  -- a hand-raise: a demo request, or a sales question from the contact form, from this address in 90 days
  v_hand := greatest(
    (select max(d.at) from app.demo_requests d where d.email = c.email and d.at > now() - interval '90 days'),
    (select max(t.created_at) from app.tickets t
     where t.channel = 'contact_form' and t.category = 'sales' and lower(t.requester_email) = c.email
       and t.created_at > now() - interval '90 days'));
  v_intent := app.intent_score(v_hand is not null);
  v_trial := co.stage = 'trial';
  if v_trial and co.org_id is not null then
    select * into o from app.organizations x where x.id = co.org_id;
    v_pql := case
      when exists (select 1 from app.growth_events g where g.org_id = o.id and g.name = 'action_item.created') then 'activated'
      when exists (select 1 from app.growth_events g where g.org_id = o.id and g.name = 'survey.threshold_reached'
                   and g.props->>'response_rate_band' in ('50_74', '75_plus') and g.occurred_at <= o.created_at + interval '7 days') then 'response_day7'
      when o.employee_count between 26 and 100
           and exists (select 1 from app.growth_events g where g.org_id = o.id and g.name = 'stakeholder.invited'
                       and g.props->>'role' = 'verneombud') then 'verneombud_tier'
    end;
  end if;
  v_total := (v_fit->>'total')::int + (v_intent->>'total')::int;
  v_route := case when v_total >= 60 or v_hand is not null then 'founder'
                  when v_trial then case when v_pql is not null then 'pql' else 'trial' end
                  else 'nurture' end;
  return jsonb_build_object('fit', (v_fit->>'total')::int, 'fit_parts', v_fit->'parts',
                            'intent', (v_intent->>'total')::int, 'intent_parts', v_intent->'parts',
                            'total', v_total, 'hand_raised_at', v_hand, 'pql', v_pql, 'route', v_route,
                            'stage', case when v_trial then 'trial' else 'lead' end,
                            'nace', coalesce(en.nace_code, co.nace_code), 'employees', coalesce(en.employees, co.employees));
end $fn$;
revoke all on function app.lead_score(uuid) from public, anon, authenticated;

-- The contacts lead scoring ranks: those of a company in a working stage (open: new to trial).
create function app.lead_contacts() returns setof uuid
  language sql stable security definer set search_path = ''
as $fn$
  select c.id from app.crm_contacts c
  join app.crm_companies co on co.id = c.company_id
  join app.crm_stages s on s.key = co.stage
  where c.product_id = 'orgpuls' and s.kind = 'open' and s.archived_at is null
$fn$;
revoke all on function app.lead_contacts() from public, anon, authenticated;

-- Routing (R10 hand-raise, R2 score ≥ 60 or PQL): a founder task, once. A callback's deadline is one
-- working hour after the hand-raise (or now, for a score); a PQL task has none.
create function app.lead_route() returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r record;
  v_body text;
  v_rule text;
  v_from timestamptz;
  v_sla timestamptz;
  v_n int := 0;
begin
  for r in select c.id, c.company_id, s.v
           from app.crm_contacts c
           cross join lateral (select app.lead_score(c.id) as v offset 0) s
           where c.id in (select app.lead_contacts())
             and s.v->>'route' in ('founder', 'pql') loop
    if r.v->>'hand_raised_at' is not null then
      v_body := 'auto:callback_hand_raise'; v_rule := 'R10'; v_from := (r.v->>'hand_raised_at')::timestamptz;
    elsif r.v->>'route' = 'founder' then
      v_body := 'auto:callback_lead_score'; v_rule := 'R2'; v_from := now();
    else
      v_body := 'auto:pql_trial'; v_rule := 'R2'; v_from := now();
    end if;
    -- once: a callback once per contact after the hand-raise (or in 30 days for a score); a PQL once per
    -- company in 30 days, whichever of its people it names (a trial is the company's, not a person's)
    if exists (select 1 from app.crm_activities a where a.origin = 'rule' and a.body = v_body
               and case when v_body = 'auto:pql_trial' then a.company_id = r.company_id else a.contact_id = r.id end
               and a.created_at >= case when v_body = 'auto:callback_hand_raise' then v_from else now() - interval '30 days' end) then
      continue;
    end if;
    v_sla := case when v_body like 'auto:callback%' then app.add_business_hours(v_from, 1) end;
    insert into app.crm_activities (company_id, contact_id, kind, body, due_at, origin, rule, task_kind, sla_due_at)
    values (r.company_id, r.id, 'task', v_body, (coalesce(v_sla, now()) at time zone 'Europe/Oslo')::date, 'rule', v_rule, 'call', v_sla);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;
revoke all on function app.lead_route() from public, anon, authenticated;

select cron.schedule('orgpuls-lead-route', '*/5 * * * *', $job$ select app.lead_route() $job$);

-- ============================================================ 6. partners and the referral code
create table app.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  org_number text check (org_number ~ '^[0-9]{9}$'),
  kind text not null check (kind in ('accounting', 'bht', 'hms', 'bransje')),
  contact_name text check (char_length(btrim(contact_name)) between 2 and 120),
  referral_code text unique check (referral_code ~ '^[A-Z0-9]{2,20}$'),
  share_kind text check (share_kind in ('recurring', 'client_discount', 'affiliate', 'member_discount')),
  share_pct int check (share_pct between 1 and 50),
  status text not null default 'in_talks' check (status in ('in_talks', 'kit_sent', 'pilot_signed', 'member_offer_drafted', 'phase_2')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- a per cent exactly for the kinds that are one (a member discount is the body's own offer)
  check (case when share_kind in ('recurring', 'client_discount', 'affiliate') then share_pct is not null else share_pct is null end)
);
comment on table app.partners is
  'Partners (0143, D-184): accountants, BHT, HMS consultants and trade bodies, each with a referral code. Trials are attributed on the organisation (org_attribution.partner_id), never on a respondent.';
create unique index partners_org_number on app.partners (org_number) where org_number is not null;
alter table app.partners enable row level security;
revoke all on app.partners from public, anon, authenticated;

alter table app.web_events add column ref_code text check (ref_code ~ '^[A-Z0-9]{2,20}$');
alter table app.org_attribution add column partner_id uuid references app.partners (id) on delete set null;
create index org_attribution_partner on app.org_attribution (partner_id) where partner_id is not null;

-- the beacon (0050, 0054, 0059), now with `ref`: a partner's code from the address, as a tag
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
  v_ref text := upper(btrim(coalesce(p_utm ->> 'ref', '')));
begin
  if app.web_is_bot(p_ua) or v_path is null or p_kind not in ('view', 'cta') then
    return;
  end if;
  if p_label is not null and p_label !~ '^[a-z0-9_-]{1,40}$' then
    return;
  end if;
  if v_country !~ '^[A-Z]{2}$' then v_country := null; end if;
  if v_region !~ '^[A-Za-z0-9-]{1,10}$' then v_region := null; end if;
  if v_ref !~ '^[A-Z0-9]{2,20}$' then v_ref := null; end if;
  v_visitor := app.web_visitor(left(p_ip, 64), left(p_ua, 400));
  if (select count(*) from app.web_events e where e.visitor = v_visitor and e.day = v_day) >= 300 then
    return;
  end if;
  insert into app.web_events (visitor, kind, path, referrer_host, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
                              label, country, region, city, network, device, ref_code)
  values (v_visitor, p_kind, v_path, app.web_host(p_referrer),
          app.web_tag(p_utm ->> 'utm_source'), app.web_tag(p_utm ->> 'utm_medium'), app.web_tag(p_utm ->> 'utm_campaign'),
          app.web_tag(p_utm ->> 'utm_term'), app.web_tag(p_utm ->> 'utm_content'),
          p_label, v_country, v_region, v_city, app.web_network(left(p_ip, 64)), app.web_device(left(p_ua, 400)), v_ref);
end $fn$;

-- the signup's source (0059), now with the partner whose code the visitor carried today (the latest)
create or replace function public.record_signup_source(p_ip text, p_ua text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_visitor text;
  v_day date := (now() at time zone 'Europe/Oslo')::date;
  v_partner uuid;
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

  -- the partner: the latest referral code today that is a partner's (0143)
  select p.id into v_partner
  from app.web_events e join app.partners p on p.referral_code = e.ref_code
  where e.visitor = v_visitor and e.day = v_day and e.ref_code is not null
  order by e.at desc, e.id desc limit 1;

  insert into app.org_attribution (org_id, first_landing, first_referrer, first_source, first_medium, first_campaign,
                                   last_source, last_medium, last_campaign, channel, partner_id)
  values (v_org, f.path, f.referrer_host, f.utm_source, f.utm_medium, f.utm_campaign,
          l.utm_source, l.utm_medium, l.utm_campaign,
          app.web_channel(f.referrer_host, f.utm_source, f.utm_medium), v_partner)
  on conflict (org_id) do nothing;
  return jsonb_build_object('ok', true);
end $fn$;

-- ============================================================ 7. consent: phone notices
alter table app.consent_purposes drop constraint consent_purposes_key_check;
alter table app.consent_purposes add constraint consent_purposes_key_check
  check (key ~ '^(marketing|phone_outreach|list:[a-z0-9-]{2,40})$');
alter table app.consent_purposes drop constraint consent_purposes_check;
alter table app.consent_purposes add constraint consent_purposes_check check (key !~ '^(marketing|phone_outreach)$' or list_id is null);
insert into app.consent_purposes (key, list_id) values ('phone_outreach', null);

alter table app.consent_records alter column contact_id drop not null;
alter table app.consent_records add column company_id uuid references app.crm_companies (id) on delete cascade;
alter table app.consent_records drop constraint consent_records_method_check;
alter table app.consent_records add constraint consent_records_method_check
  check (method in ('migrated', 'double_opt_in', 'one_click_unsubscribe', 'preference_centre', 'provider_complaint', 'provider_bounce',
                    'provider_unsubscribe', 'admin', 'import', 'account_sync', 'demo_request', 'system', 'phone_notice'));
-- a record is a contact's, or — a phone notice — a company's; a phone notice is exactly that
alter table app.consent_records add constraint consent_records_subject check ((contact_id is null) <> (company_id is null));
alter table app.consent_records add constraint consent_records_phone check (
  (company_id is null and method <> 'phone_notice' and purpose <> 'phone_outreach')
  or (company_id is not null and method = 'phone_notice' and purpose = 'phone_outreach'
      and lawful_basis = 'legit_interest_phone' and status in ('notice_given', 'withdrawn')));
create index consent_records_company on app.consent_records (company_id, id desc) where company_id is not null;

-- 0141's guard, with the company: nobody changes a record; it goes only with its contact or company.
create or replace function app.consent_records_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' then
    if (new.id, new.contact_id, new.company_id, new.purpose, new.status, new.lawful_basis, new.method, new.doi_sent_at,
        new.doi_confirmed_at, new.created_at)
       is distinct from (old.id, old.contact_id, old.company_id, old.purpose, old.status, old.lawful_basis, old.method,
        old.doi_sent_at, old.doi_confirmed_at, old.created_at)
       or (new.created_by is distinct from old.created_by
           and (new.created_by is not null or exists (select 1 from auth.users u where u.id = old.created_by))) then
      raise exception 'consent_records is append-only: a change is a new record' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if exists (select 1 from app.crm_contacts c where c.id = old.contact_id)
     or exists (select 1 from app.crm_companies c where c.id = old.company_id) then
    raise exception 'consent_records is append-only: records go only with their contact or company' using errcode = 'check_violation';
  end if;
  return old;
end $fn$;

-- ============================================================ 8. the admin's reads and writes
-- ---------------------------------------------------------------- Consent
create function public.admin_consent() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.consent_view');
  return (
    with latest as (
      select distinct on (r.contact_id, r.purpose) r.contact_id, r.purpose, r.status, r.lawful_basis
      from app.consent_records r where r.contact_id is not null
      order by r.contact_id, r.purpose, r.id desc
    ), doi as (
      select distinct r.contact_id, r.purpose from app.consent_records r where r.doi_confirmed_at is not null
    )
    select jsonb_build_object('ok', true,
      'kpis', jsonb_build_object(
        'marketing', (select count(*) from latest l where l.purpose = 'marketing' and l.status = 'granted'),
        'contacts', (select count(*) from app.crm_contacts c where c.product_id = 'orgpuls'),
        'with_record', (select count(*) from app.crm_contacts c where c.product_id = 'orgpuls'
                        and exists (select 1 from app.consent_records r where r.contact_id = c.id)),
        'doi_confirmed', (select count(distinct d.contact_id) from doi d),
        'doi_pending', (select count(*) from app.crm_contacts c where c.product_id = 'orgpuls' and c.status = 'pending'),
        'withdrawn_30d', (select count(*) from app.consent_records r where r.status = 'withdrawn' and r.created_at > now() - interval '30 days'),
        'sunset', (select count(*) from latest l join app.crm_contacts c on c.id = l.contact_id
                   where l.purpose = 'marketing' and l.status = 'granted'
                     and coalesce(c.last_engaged_at, c.consent_at, c.created_at) < now() - interval '180 days')),
      'rows', (select coalesce(jsonb_agg(x.j order by x.id desc), '[]') from (
        select r.id, jsonb_build_object('id', r.id, 'at', r.created_at, 'contact_id', r.contact_id, 'company_id', r.company_id,
                 'who', coalesce(nullif(btrim(c.name), ''), c.email, co.name), 'purpose', r.purpose,
                 'list', (select l.name_en from app.consent_purposes p join app.crm_lists l on l.id = p.list_id where p.key = r.purpose),
                 'status', r.status, 'basis', r.lawful_basis, 'method', r.method,
                 'doi_sent_at', r.doi_sent_at, 'doi_confirmed_at', r.doi_confirmed_at) as j
        from app.consent_records r
        left join app.crm_contacts c on c.id = r.contact_id
        left join app.crm_companies co on co.id = r.company_id
        order by r.id desc limit 20) x),
      'purposes', (select coalesce(jsonb_agg(jsonb_build_object('key', p.key,
                     'list', (select l.name_en from app.crm_lists l where l.id = p.list_id),
                     'granted', (select count(*) from latest l where l.purpose = p.key and l.status = 'granted'),
                     'consent', (select count(*) from latest l where l.purpose = p.key and l.status = 'granted' and l.lawful_basis = 'consent'),
                     'doi', (select count(*) from latest l join doi d on d.contact_id = l.contact_id and d.purpose = l.purpose
                             where l.purpose = p.key and l.status = 'granted' and l.lawful_basis = 'consent'))
                   order by p.key <> 'marketing', p.key), '[]')
                   from app.consent_purposes p
                   where p.key <> 'phone_outreach' and (p.list_id is not null or p.key = 'marketing')),
      'suppression', jsonb_build_object(
        'count', (select count(*) from app.crm_suppression),
        'rows', (select coalesce(jsonb_agg(jsonb_build_object('head', left(s.email_hash, 4), 'tail', right(s.email_hash, 2),
                                                              'reason', s.reason, 'at', s.at) order by s.at desc), '[]')
                 from (select * from app.crm_suppression order by at desc limit 5) s))));
end $fn$;

-- The whole ledger for an audit (what Forbrukertilsynet asks for): who, what, on which basis, how,
-- and the double opt-in's times. Personal data: the CRM's writers only, and logged with its size.
create function public.admin_consent_export() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_rows jsonb;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'at', r.created_at, 'email', c.email, 'name', c.name,
                                               'company', co.name, 'org_number', co.org_number, 'purpose', r.purpose,
                                               'status', r.status, 'basis', r.lawful_basis, 'method', r.method,
                                               'doi_sent_at', r.doi_sent_at, 'doi_confirmed_at', r.doi_confirmed_at,
                                               'by', (select u.email::text from auth.users u where u.id = r.created_by))
                    order by r.id), '[]')
  into v_rows
  from app.consent_records r
  left join app.crm_contacts c on c.id = r.contact_id
  left join app.crm_companies co on co.id = r.company_id;
  perform app.admin_log('crm.consent_export', null, 'consent_ledger', null, null, jsonb_build_object('records', jsonb_array_length(v_rows)));
  return jsonb_build_object('ok', true, 'rows', v_rows);
end $fn$;

-- A suppression an admin adds: the address is hashed here and never stored; the log names the hash.
create function public.admin_crm_suppress(p_email text, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if coalesce(p_reason, '') not in ('unsubscribed', 'hard_bounce', 'spam', 'erased', 'manual') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_hash := app.crm_hash(v_email);
  insert into app.crm_suppression (email_hash, reason) values (v_hash, p_reason) on conflict (email_hash) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'already');
  end if;
  perform app.admin_log('crm.suppress', null, 'suppression', left(v_hash, 12), null, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $fn$;

-- The Art. 14 notice at a first call: a ledger record on the company. An objection is a withdrawal
-- and puts the number on the do-not-contact list; every outreach not yet made for it stops — queued,
-- or already assigned to a person, whose open task is closed as skipped in the same transaction.
create function public.admin_consent_phone_notice(p_org_number text, p_objected boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org text := regexp_replace(coalesce(p_org_number, ''), '\s', '', 'g');
  v_company uuid;
  en app.brreg_entities;
  v_stopped int := 0;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_org !~ '^[0-9]{9}$' or p_objected is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select c.id into v_company from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = v_org;
  if v_company is null then
    select * into en from app.brreg_entities e where e.org_number = v_org;
    if en.org_number is null then
      return jsonb_build_object('ok', false, 'error', 'unknown_company');
    end if;
    insert into app.crm_companies (name, org_number, form_code, nace_code, employees, municipality, phone, source, stage)
    values (en.name, en.org_number, en.form_code, en.nace_code, en.employees, en.municipality, en.phone, 'brreg', 'contacted')
    returning id into v_company;
  end if;
  insert into app.consent_records (company_id, purpose, status, lawful_basis, method, created_by)
  values (v_company, 'phone_outreach', case when p_objected then 'withdrawn' else 'notice_given' end, 'legit_interest_phone',
          'phone_notice', auth.uid());
  if p_objected then
    insert into app.brreg_dnc (org_number, reason, created_by) values (v_org, 'objected', auth.uid()) on conflict (org_number) do nothing;
    with stopped as (
      update app.brreg_outreach set status = 'do_not_contact'
      where org_number = v_org and status in ('queued', 'assigned')
      returning activity_id
    ), closed as (
      update app.crm_activities a set done_at = now(), skipped = true
      where a.id in (select s.activity_id from stopped s where s.activity_id is not null) and a.done_at is null
      returning a.id
    )
    select count(*) into v_stopped from stopped;
  end if;
  perform app.admin_log('crm.phone_notice', null, 'crm_company', v_company::text, null,
                        jsonb_build_object('objected', p_objected, 'stopped', v_stopped));
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- Brønnøysund triggers
create function public.admin_brreg_triggers() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  p app.brreg_polls;
  v_min int;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into p from app.brreg_polls x where x.status = 'done' order by x.finished_at desc limit 1;
  v_min := (app.brreg_rules()->>'fit_min')::int;
  return jsonb_build_object('ok', true,
    'dry_run', (select s.dry_run from app.brreg_settings s),
    -- the rules the engine applies, for «Edit triggers» (the thresholds, the industries, the fit minimum)
    'rules', app.brreg_rules(),
    'last', case when p.id is null then null else jsonb_build_object('id', p.id, 'finished_at', p.finished_at, 'changes', p.changes) end,
    'pending', exists (select 1 from app.brreg_polls x where x.status in ('requested', 'running') and x.requested_at > now() - interval '1 hour'),
    'kpis', jsonb_build_object(
      'raised', (select count(*) from app.brreg_triggers t where t.poll_id = p.id),
      'matched', (select count(*) from app.brreg_triggers t where t.poll_id = p.id and t.fit >= v_min),
      'queued', (select count(*) from app.brreg_outreach o where o.status in ('queued', 'assigned')),
      'held_out', (select count(*) from app.brreg_outreach o where o.status = 'holdout'),
      'dnc', (select count(*) from app.brreg_dnc),
      'purged', (select count(*) from app.brreg_purges x where x.purged_at is not null)),
    'types', (select jsonb_agg(jsonb_build_object('kind', k.kind,
                'n', (select count(*) from app.brreg_triggers t where t.poll_id = p.id and t.kind = k.kind),
                'fit', (select count(*) from app.brreg_triggers t where t.poll_id = p.id and t.kind = k.kind and t.fit >= v_min),
                'tasks', (select count(*) from app.brreg_triggers t join app.brreg_outreach o on o.trigger_id = t.id
                          where t.poll_id = p.id and t.kind = k.kind and o.status in ('queued', 'assigned', 'sent')),
                'hold', (select count(*) from app.brreg_triggers t join app.brreg_outreach o on o.trigger_id = t.id
                         where t.poll_id = p.id and t.kind = k.kind and o.status = 'holdout')) order by k.ord)
              from (values ('threshold_5', 1), ('threshold_30', 2), ('company_new', 3), ('manager_changed', 4)) k(kind, ord)),
    'queue', (select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]') from (
      select o.created_at, jsonb_build_object('id', o.id, 'org', e.name, 'org_number', e.org_number, 'kind', t.kind,
               'from', t.employees_from, 'to', t.employees_to, 'nace', e.nace_code, 'fit', t.fit, 'channel', o.channel,
               'email_local', split_part(o.email, '@', 1), 'status', o.status, 'company_id', o.company_id) as j
      from app.brreg_outreach o join app.brreg_triggers t on t.id = o.trigger_id join app.brreg_entities e on e.org_number = o.org_number
      order by o.created_at desc limit 25) x),
    'results', (select jsonb_agg(jsonb_build_object('channel', ch.channel,
                  'contacts', (select count(*) from app.brreg_outreach o where o.channel = ch.channel and o.status = 'sent'),
                  'trials', (select count(*) from app.brreg_outreach o where o.channel = ch.channel and o.status = 'sent'
                             and exists (select 1 from app.organizations g where g.org_number = o.org_number and g.created_at > o.sent_at
                                         and not app.is_demo(g.id)))) order by ch.ord)
                from (values ('phone', 1), ('letter', 2), ('email', 3)) ch(channel, ord)),
    'holdout', jsonb_build_object(
      'contacts', (select count(*) from app.brreg_outreach o where o.status = 'holdout'),
      'trials', (select count(*) from app.brreg_outreach o where o.status = 'holdout'
                 and exists (select 1 from app.organizations g where g.org_number = o.org_number and g.created_at > o.created_at
                             and not app.is_demo(g.id)))));
end $fn$;

create function public.admin_brreg_set_dry_run(p_on boolean, p_reason text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid;
  v_n int := 0;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_on is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if (select s.dry_run from app.brreg_settings s) = p_on then
    return jsonb_build_object('ok', false, 'error', 'unchanged');
  end if;
  update app.brreg_settings set dry_run = p_on;
  -- switched off: what is queued is assigned now
  if not p_on then
    for v_id in select o.id from app.brreg_outreach o where o.status = 'queued' order by o.created_at loop
      if app.brreg_assign(v_id) then v_n := v_n + 1; end if;
    end loop;
  end if;
  perform app.admin_log('crm.brreg_dry_run', null, 'brreg_settings', null, p_reason, jsonb_build_object('dry_run', p_on, 'assigned', v_n));
  return jsonb_build_object('ok', true, 'assigned', v_n);
end $fn$;

-- «Run poll now»: once in 15 minutes, and not while one is running. The check and the request are
-- one step under a transaction lock (the daily job takes the same one): two admins pressing at once
-- ask the register once.
create function public.admin_brreg_poll_now() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v jsonb;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform pg_advisory_xact_lock(hashtext('orgpuls:brreg_poll'));
  if exists (select 1 from app.brreg_polls p where p.requested_at > now() - interval '15 minutes'
             or (p.status = 'running' and p.started_at > now() - interval '1 hour')) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v := app.brreg_request('manual', auth.uid());
  if (v->>'ok')::boolean then
    perform app.admin_log('crm.brreg_poll', null, 'brreg_poll', v->>'poll_id');
  end if;
  return v;
end $fn$;

-- ---------------------------------------------------------------- Partners
create function public.admin_crm_partners() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    -- the one part of the kit the product holds: the referral code on the organisation at signup. It is
    -- a presence check, not a measure of use — Live while the path exists (the beacon keeps
    -- web_events.ref_code, the signup's source puts the partner on org_attribution.partner_id), so it
    -- reads Planned the day a migration takes the path away. No partner dashboard is built: the kit
    -- names it Planned, from the page, with the other parts not in the product.
    'kit', jsonb_build_object(
      'code', exists (select 1 from pg_attribute a where a.attrelid = 'app.web_events'::regclass and a.attname = 'ref_code' and not a.attisdropped)
              and exists (select 1 from pg_attribute a where a.attrelid = 'app.org_attribution'::regclass and a.attname = 'partner_id' and not a.attisdropped)
              and coalesce((select p.prosrc ~ 'partner_id' from pg_proc p where p.oid = to_regprocedure('public.record_signup_source(text,text)')), false)),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'org_number', p.org_number, 'kind', p.kind,
               'contact', p.contact_name, 'code', p.referral_code, 'share_kind', p.share_kind, 'share_pct', p.share_pct,
               'status', p.status, 'updated_at', p.updated_at,
               'trials_30', (select count(*) from app.org_attribution a join app.organizations o on o.id = a.org_id
                             where a.partner_id = p.id and o.created_at > now() - interval '30 days' and not app.is_demo(o.id)),
               'trials_7', (select count(*) from app.org_attribution a join app.organizations o on o.id = a.org_id
                            where a.partner_id = p.id and o.created_at > now() - interval '7 days' and not app.is_demo(o.id)))
             order by p.status <> 'pilot_signed', p.created_at), '[]')
             from app.partners p));
end $fn$;

create function public.admin_crm_partner_save(p_id uuid, p_name text, p_org_number text, p_kind text, p_contact text,
                                              p_code text, p_share_kind text, p_share_pct int, p_status text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid;
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_org text := nullif(regexp_replace(coalesce(p_org_number, ''), '\s', '', 'g'), '');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 200
     or coalesce(p_kind, '') not in ('accounting', 'bht', 'hms', 'bransje')
     or coalesce(p_status, '') not in ('in_talks', 'kit_sent', 'pilot_signed', 'member_offer_drafted', 'phase_2')
     or (v_org is not null and v_org !~ '^[0-9]{9}$')
     or (v_code is not null and v_code !~ '^[A-Z0-9]{2,20}$')
     or (p_share_kind is not null and p_share_kind not in ('recurring', 'client_discount', 'affiliate', 'member_discount'))
     or (p_share_pct is not null and (p_share_pct not between 1 and 50 or p_share_kind is null or p_share_kind = 'member_discount'))
     or (p_share_kind in ('recurring', 'client_discount', 'affiliate') and p_share_pct is null)
     or (nullif(btrim(coalesce(p_contact, '')), '') is not null and char_length(btrim(p_contact)) not between 2 and 120) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_code is not null and exists (select 1 from app.partners x where x.referral_code = v_code and x.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'code_taken');
  end if;
  if v_org is not null and exists (select 1 from app.partners x where x.org_number = v_org and x.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'org_taken');
  end if;
  if p_id is null then
    insert into app.partners (name, org_number, kind, contact_name, referral_code, share_kind, share_pct, status, created_by)
    values (btrim(p_name), v_org, p_kind, nullif(btrim(coalesce(p_contact, '')), ''), v_code, p_share_kind, p_share_pct, p_status, auth.uid())
    returning id into v_id;
  else
    update app.partners set name = btrim(p_name), org_number = v_org, kind = p_kind, contact_name = nullif(btrim(coalesce(p_contact, '')), ''),
      referral_code = v_code, share_kind = p_share_kind, share_pct = p_share_pct, status = p_status, updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  perform app.admin_log('crm.partner_save', null, 'partner', v_id::text, null,
                        jsonb_build_object('created', p_id is null, 'status', p_status, 'code', v_code));
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- ---------------------------------------------------------------- Lead scoring
create function public.admin_lead_scores() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    -- the rules as the database scores them, row or no row
    'fit_rules', app.fit_score(null, null, null, null, null)->'parts',
    -- the target industries fit scores (app.brreg_rules), for the card's «Target industry code (…)»
    'industries', app.brreg_rules()->'industries',
    'intent_rules', app.intent_score(false)->'parts',
    'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(nullif(btrim(c.name), ''), c.email),
             'company', co.name, 'company_id', co.id) || s.v
           order by (s.v->>'total')::int desc, c.name), '[]')
    from app.crm_contacts c
    join app.crm_companies co on co.id = c.company_id
    cross join lateral (select app.lead_score(c.id) as v offset 0) s
    where c.id in (select app.lead_contacts())));
end $fn$;

-- ---------------------------------------------------------------- Tasks: 0137's list, with the SLA and the origin
create or replace function public.admin_crm_task_list(p_view text default 'open') returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_view, '') not in ('open', 'done', 'all') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  return jsonb_build_object('ok', true,
    'counts', (select jsonb_build_object(
        'open', count(*) filter (where a.done_at is null),
        'done', count(*) filter (where a.done_at > now() - interval '90 days'),
        'all', count(*) filter (where a.done_at is null or a.done_at > now() - interval '90 days'),
        -- 0143: made by a journey, a rule or a trigger; and the open ones on a one-hour SLA
        'automated', count(*) filter (where (a.campaign_id is not null or a.origin is not null)
                                        and (a.done_at is null or a.done_at > now() - interval '90 days')),
        'sla_open', count(*) filter (where a.sla_due_at is not null and a.done_at is null))
      from app.crm_activities a where a.kind = 'task'),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'company_id', a.company_id, 'company', co.name,
        'contact', (select coalesce(nullif(btrim(c.name), ''), c.email) from app.crm_contacts c where c.id = a.contact_id),
        'body', a.body, 'due_at', a.due_at, 'done_at', a.done_at, 'created_at', a.created_at, 'admin_email', a.admin_email,
        'skipped', a.skipped, 'campaign_id', a.campaign_id, 'step_kind', st.step_kind,
        'journey', (select r.name from app.crm_campaigns r where r.id = app.crm_chain_root(st.id)),
        'origin', a.origin, 'rule', a.rule, 'task_kind', a.task_kind, 'sla_due_at', a.sla_due_at,
        'sla_left', case when a.sla_due_at is not null and a.done_at is null then app.business_minutes(now(), a.sla_due_at) end,
        'sla_met', case when a.sla_due_at is not null and a.done_at is not null then a.done_at <= a.sla_due_at end,
        'trigger', (select t.kind from app.brreg_outreach o join app.brreg_triggers t on t.id = o.trigger_id where o.activity_id = a.id),
        'manager', (select o.manager_name from app.brreg_outreach o where o.activity_id = a.id),
        -- where the outreach goes: a letter to the business address the register gives, an email to the
        -- generic address (never one on the suppression list: brreg_suppression_reroute makes such an
        -- outreach a call or a letter, and this reads the list again); and whether an objection stopped it
        'to', (select case o.channel when 'letter' then e.address
                                     when 'email' then case when not app.crm_suppressed(o.email) then o.email end end
               from app.brreg_outreach o join app.brreg_entities e on e.org_number = o.org_number where o.activity_id = a.id),
        'stopped', exists (select 1 from app.brreg_outreach o where o.activity_id = a.id and o.status = 'do_not_contact'))
        order by (a.done_at is not null), a.sla_due_at nulls last, a.due_at nulls last, a.done_at desc, a.created_at), '[]')
      from app.crm_activities a join app.crm_companies co on co.id = a.company_id
      left join app.crm_campaigns st on st.id = a.campaign_id
      where a.kind = 'task'
        and case p_view when 'open' then a.done_at is null
                        when 'done' then a.done_at > now() - interval '90 days'
                        else a.done_at is null or a.done_at > now() - interval '90 days' end));
end $fn$;

-- 0137's «Mark done» and «Reopen», with one refusal: a task an objection closed is not reopened
-- (app.brreg_task_stopped holds the same rule for any other writer).
create or replace function public.admin_crm_task_done(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if exists (select 1 from app.crm_activities a join app.brreg_outreach o on o.activity_id = a.id
             where a.id = p_id and a.done_at is not null and o.status = 'do_not_contact') then
    return jsonb_build_object('ok', false, 'error', 'stopped');
  end if;
  -- 0137: reopening a task also takes back a skip
  update app.crm_activities set done_at = case when done_at is null then now() end, skipped = false where id = p_id and kind = 'task';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.task_done', null, 'crm_activity', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;

-- ============================================================ 9. grants
do $$
declare f text;
begin
  -- the edge function's (service role only)
  foreach f in array array['public.brreg_poll_begin(bigint)', 'public.brreg_ingest(bigint,jsonb)', 'public.brreg_role_candidates(text[])',
                           'public.brreg_roles_ingest(bigint,jsonb)', 'public.brreg_outreach_names_needed()',
                           'public.brreg_outreach_names(jsonb)', 'public.brreg_purge(text)',
                           'public.brreg_poll_end(bigint,int,bigint,bigint,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- the admin's (each checks the role and the second factor itself)
  foreach f in array array['public.admin_consent()', 'public.admin_consent_export()', 'public.admin_crm_suppress(text,text)',
                           'public.admin_consent_phone_notice(text,boolean)', 'public.admin_brreg_triggers()',
                           'public.admin_brreg_set_dry_run(boolean,text)', 'public.admin_brreg_poll_now()',
                           'public.admin_crm_partners()', 'public.admin_crm_partner_save(uuid,text,text,text,text,text,text,int,text)',
                           'public.admin_lead_scores()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ============================================================ 10. the anonymity firewall covers these tables
-- 0141's app.growth_firewall(), unchanged but for its scope: rule 1 (no foreign key to or from a
-- respondent's table) now reads the Brønnøysund tables and partners too, and rule 7 (closed to every
-- client: RLS, no policy, no grant) lists the eight tables 0143 makes. The Event catalogue page and CI
-- read it live, so a future link or grant on one of them fails there, not only in this phase's tests.
create or replace function app.growth_firewall() returns table (seq int, rule text, pass boolean, evidence jsonb)
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  -- where a respondent, their answers, their conversation or their invitation live
  v_resp constant text[] := array['responses', 'answers', 'extra_answers', 'response_comments', 'invitations', 'employees',
                                  'module_answers', 'module_segment_answers', 'module_not_relevant_answers', 'not_relevant_answers',
                                  'org_question_answers', 'org_count_answers', 'comment_threads', 'thread_messages', 'contact_requests'];
  v_answer constant text[] := array['responses', 'answers', 'extra_answers', 'response_comments', 'module_answers',
                                    'module_segment_answers', 'module_not_relevant_answers', 'not_relevant_answers',
                                    'org_question_answers', 'org_count_answers', 'comment_threads', 'thread_messages'];
  -- the answer tables' own guards (immutability, one answer per kind): the only functions a trigger on
  -- an answer table may run. Anything else — however it is named, however many calls away the growth
  -- stream is — fails rule 6 until someone has looked at it and added it here.
  v_guards constant text[] := array['forbid_answer_change', 'forbid_extra_answer_change', 'forbid_module_answer_change',
                                    'forbid_comment_change', 'check_extra_answer', 'not_relevant_exclusive',
                                    'org_question_answer_fixed', 'org_question_answer_kind'];
  -- the platform's own roles, which hold every table by design (Postgres' read-all and write-all
  -- roles, Supabase's read-only and replication users): no client, API key or product path reaches
  -- them. Any other role that can touch an answer table fails rule 3, whatever it is called.
  v_platform constant text[] := array['pg_read_all_data', 'pg_write_all_data', 'supabase_read_only_user', 'supabase_etl_admin'];
  -- the growth, CRM, event and consent tables, and the CRM's Brønnøysund engine and partners (0143)
  v_scope constant text := '^(crm_|growth_|consent_|event_|brreg_)|_events$|^partners$';
  v_own constant text[] := array['event_catalogue', 'growth_events', 'consent_records', 'consent_purposes',
                                 'brreg_settings', 'brreg_polls', 'brreg_entities', 'brreg_triggers', 'brreg_dnc', 'brreg_purges',
                                 'brreg_outreach', 'partners'];
  -- the tables a respondent's submission writes: the answer tables, invitations (submit_response
  -- stamps responded_at in the respondent's own transaction), and whatever else submit_response's
  -- source writes, read from it so that a table added to the write path is covered with it
  v_write text[];
  v_n bigint;
  v_m bigint;
  v_names jsonb;
begin
  -- 1 no foreign key between a growth, CRM, event or consent table and a respondent table, in either
  --   direction: from the growth side it reads a respondent; from the respondent side it ties an
  --   answer to an event or a contact
  select count(*) into v_m from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('app', 'public') and c.relkind in ('r', 'p') and c.relname ~ v_scope;
  select count(*), coalesce(jsonb_agg(s.relname || '.' || con.conname order by s.relname, con.conname), '[]') into v_n, v_names
  from pg_constraint con
  join pg_class s on s.oid = con.conrelid join pg_namespace sn on sn.oid = s.relnamespace
  join pg_class t on t.oid = con.confrelid join pg_namespace tn on tn.oid = t.relnamespace
  where con.contype = 'f'
    and ((sn.nspname in ('app', 'public') and s.relname ~ v_scope and tn.nspname = 'app' and t.relname = any (v_resp))
      or (sn.nspname = 'app' and s.relname = any (v_resp) and tn.nspname in ('app', 'public') and t.relname ~ v_scope));
  seq := 1; rule := 'no_link_to_respondents'; pass := v_n = 0;
  evidence := jsonb_build_object('tables', v_m, 'links', v_n, 'names', v_names);
  return next;

  -- 2 no catalogue entry allows a prop that could carry a respondent
  select count(*), coalesce(sum(cardinality(e.allowed_props)), 0) into v_m, v_n from app.event_catalogue e;
  select coalesce(jsonb_agg(e.name || ' ' || x order by e.name, x), '[]') into v_names
  from app.event_catalogue e cross join lateral unnest(e.allowed_props) x where app.growth_prop_forbidden(x);
  seq := 2; rule := 'catalogue_has_no_respondent_props'; pass := jsonb_array_length(v_names) = 0;
  evidence := jsonb_build_object('events', v_m, 'props', v_n, 'flagged', jsonb_array_length(v_names), 'names', v_names);
  return next;

  -- 3 no role but a superuser, the table's owner and the platform's own holds any privilege on an
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
  seq := 3; rule := 'no_role_reads_answers'; pass := jsonb_array_length(v_names) = 0;
  evidence := jsonb_build_object('roles', v_n, 'tables', cardinality(v_answer), 'held', jsonb_array_length(v_names), 'names', v_names);
  return next;

  -- 4 no contact shares an address with an employee — active or not — unless that address is an
  --   account's in an organisation: a count, never an address
  select count(distinct c.id) into v_n
  from app.crm_contacts c join app.employees e on lower(btrim(e.email)) = c.email
  where not exists (select 1 from auth.users u join app.memberships m on m.user_id = u.id and m.active
                    where lower(btrim(u.email)) = c.email);
  seq := 4; rule := 'no_employee_is_a_contact'; pass := v_n = 0;
  evidence := jsonb_build_object('contacts', v_n);
  return next;

  -- 5 no event's key or props hold a respondent's, an invitation's or an employee's id, an
  --   invitation's token hash (hex), or an employee's address
  select count(distinct x.id) into v_n
  from (select g.id, vals.v from app.growth_events g
        cross join lateral (select unnest(string_to_array(coalesce(g.dedupe_key, ''), ':')) as v
                            union all select p.value #>> '{}' from jsonb_each(g.props) p) vals) x
  where (x.v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and (exists (select 1 from app.employees e where e.id = x.v::uuid)
              or exists (select 1 from app.invitations i where i.id = x.v::uuid)
              or exists (select 1 from app.responses r where r.id = x.v::uuid)))
     or (x.v ~ '^([0-9a-f]{2})+$' and exists (select 1 from app.invitations i where i.token_hash = decode(x.v, 'hex')))
     or exists (select 1 from app.employees e where lower(btrim(e.email)) = x.v);
  select count(*) into v_m from app.growth_events;
  seq := 5; rule := 'no_event_names_a_respondent'; pass := v_n = 0;
  evidence := jsonb_build_object('events', v_m, 'flagged', v_n);
  return next;

  -- 6 nothing is attached to the tables a respondent's submission writes but their own guards: a
  --   trigger whose function is not one of them (or one of them that reaches growth, consent or the
  --   CRM), any rewrite rule, any policy, and any constraint, column default or index that calls a
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
           p.proname = any (v_guards) and pn.nspname = 'app' and p.prosrc !~* '(growth|consent|crm)' as guard
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
  seq := 6; rule := 'nothing_attached_to_answers'; pass := jsonb_array_length(v_names) = 0;
  evidence := jsonb_build_object('tables', cardinality(v_write), 'guards', v_n, 'other', jsonb_array_length(v_names), 'names', v_names);
  return next;

  -- 7 the growth tables are closed to clients: row level security, no policy, and no grant to a
  --   client or the service role, on the table or any column
  select coalesce(jsonb_agg(t order by t), '[]') into v_names
  from unnest(v_own) t
  where to_regclass('app.' || t) is null
     or not (select c.relrowsecurity from pg_class c where c.oid = ('app.' || t)::regclass)
     or exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename = t)
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r
                where has_table_privilege(r, ('app.' || t)::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                   or has_any_column_privilege(r, ('app.' || t)::regclass, 'SELECT,INSERT,UPDATE,REFERENCES'));
  seq := 7; rule := 'growth_tables_closed'; pass := jsonb_array_length(v_names) = 0;
  evidence := jsonb_build_object('tables', cardinality(v_own), 'open', jsonb_array_length(v_names), 'names', v_names);
  return next;
end $fn$;
revoke all on function app.growth_firewall() from public, anon, authenticated;
