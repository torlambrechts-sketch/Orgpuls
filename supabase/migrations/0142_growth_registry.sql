-- 0142_growth_registry.sql — Sentral › Growth G2: the report's registry, the funnel and the lead math
-- (docs/implementation/growth-admin.md § 2 and § 5, D-183).
--
-- The report's content is data, not code: the tiers and board items, the 90-day plan and its gates,
-- the automation rules R1–R12, the experiments, the guardrails, risks and open decisions, the funnel's
-- stages, the lead sources, the planning assumptions and labelled benchmarks, the coverage review, the
-- recommendations and the cuts. Each is a seeded row with the report's text, and with the status that
-- is TRUE for Orgpuls today — never the design's sample status.
--
-- 1. **A status that can be derived is derived.**
--      * A board item is «Live» only when its live check holds (app.growth_live: the consent ledger has
--        records, the event stream has events, the year wheel's hourly job is active). The stored
--        status cannot say «live»: it holds building, planned or deferred, what the team says of an
--        item nothing in the database can prove.
--      * A rule is live only when what implements it exists and is enabled (app.growth_impl_live: a
--        function, a trigger, a scheduled job, a lifecycle mail); a rule nothing implements is off.
--      * A plan block's status comes from the plan's start date (app.growth_settings.plan_start) and
--        the calendar: before a start date is set every block is planned, and the current week is
--        «not started», never an invented «4 of 13».
--      * The funnel's counts come from the event stream (0141) and web analytics (0050), this month;
--        a stage with no source (PQL: there is no PQL flag) has no count. The lead math's «now» is the
--        month's trials by first-touch channel (0059's org_attribution), only for a source whose
--        channel the attribution can name; the others have none.
-- 2. **Every write is audited and role-checked.** The Growth section's roles (super_admin, analyst,
--    marketing) with a second factor, as admin_growth_events (0141). Status and owner of a board item,
--    the status of an experiment, a decision recorded; each writes app.admin_audit with what changed.
--    The CSV exports are reads that are audited as exports.
-- 3. **Closed to clients.** Every table here has RLS, no policy and no grant to anon, authenticated or
--    service_role; the pages read through public.admin_growth_view(), which answers only the roles
--    above and logs each read.

-- ============================================================ 1. settings and the live checks
create table app.growth_settings (
  id boolean primary key default true check (id),
  -- the Monday the 90-day plan starts; null: the plan has not started
  plan_start date check (plan_start is null or extract(isodow from plan_start) = 1)
);
insert into app.growth_settings (id) values (true);

-- What a board item's «Live» is checked against: something in use in the database, not a word typed.
create function app.growth_live(p_check text) returns boolean
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  return case p_check
    -- the consent ledger (0141) holds records: every marketing path writes one
    when 'consent_ledger' then exists (select 1 from app.consent_records)
    -- the event stream (0141) is being written
    when 'event_stream' then exists (select 1 from app.growth_events)
    -- the year wheel's reminders: the hourly job that queues them is scheduled and active
    when 'year_wheel' then app.growth_impl_live('cron', 'orgpuls-wheel')
    else false
  end;
end $fn$;

-- What implements a rule, and whether it is live: it exists and is enabled.
create function app.growth_impl_live(p_kind text, p_ref text) returns boolean
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_on boolean := false;
begin
  if p_kind = 'function' then
    return exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                   where n.nspname || '.' || p.proname = p_ref);
  elsif p_kind = 'trigger' then
    return exists (select 1 from pg_catalog.pg_trigger t where t.tgname = p_ref and not t.tgisinternal and t.tgenabled <> 'D');
  elsif p_kind in ('cron', 'lifecycle') then
    -- pg_cron is an extension: a database without it schedules nothing, so nothing is live
    if to_regclass('cron.job') is null then
      return false;
    end if;
    execute 'select exists (select 1 from cron.job where jobname = $1 and active)'
      into v_on using case p_kind when 'cron' then p_ref else 'orgpuls-lifecycle-plan' end;
    if p_kind = 'lifecycle' then
      -- a lifecycle mail: the sequence is switched on, the job that plans it runs, and the step exists
      v_on := v_on and coalesce((select s.enabled from app.lifecycle_settings s), false)
              and exists (select 1 from pg_catalog.pg_constraint c
                          where c.conrelid = 'app.lifecycle_mail'::regclass and c.conname = 'lifecycle_mail_step_check'
                            and pg_catalog.pg_get_constraintdef(c.oid) like '%''' || p_ref || '''%');
    end if;
    return v_on;
  end if;
  return false;
end $fn$;
revoke all on function app.growth_live(text) from public, anon, authenticated;
revoke all on function app.growth_impl_live(text, text) from public, anon, authenticated;

-- ============================================================ 2. the board
create table app.growth_tiers (
  key text primary key check (key ~ '^[a-z0-9_]{1,20}$'),
  sort int not null unique check (sort > 0),
  name text not null check (char_length(name) between 1 and 80),
  why text not null check (char_length(why) between 1 and 200)
);

create table app.growth_items (
  key text primary key check (key ~ '^[a-z0-9_]{1,30}$'),
  tier text not null references app.growth_tiers(key),
  sort int not null check (sort > 0),
  -- where the reviews rank it, as the report prints it («Review 2 · #1»)
  rank_label text not null check (char_length(rank_label) between 1 and 80),
  name text not null check (char_length(name) between 1 and 160),
  why text not null check (char_length(why) between 1 and 200),
  build text not null check (char_length(build) between 1 and 1000),
  kpi text not null check (char_length(kpi) between 1 and 300),
  guardrail text not null check (char_length(guardrail) between 1 and 300),
  effort text not null check (char_length(effort) between 1 and 10),
  impact text not null check (char_length(impact) between 1 and 40),
  -- the report's urgency × ease, where it scores one
  score text check (char_length(score) between 1 and 40),
  -- what the team says of it; «live» is never stored, it is derived from live_check
  status text not null check (status in ('building', 'planned', 'deferred')),
  live_check text check (live_check in ('consent_ledger', 'event_stream', 'year_wheel')),
  -- where it lives in the admin
  href text check (href ~ '^/admin(/[a-z0-9_-]+)*$'),
  -- an admin who owns it; none until someone is named
  owner uuid references app.platform_admins(user_id) on delete set null,
  unique (tier, sort)
);
create index growth_items_owner on app.growth_items (owner);

-- ============================================================ 3. the 90-day plan
create table app.growth_plan_blocks (
  key text primary key check (key ~ '^w[0-9]{2}_[0-9]{2}$'),
  week_from int not null unique check (week_from between 1 and 52),
  week_to int not null check (week_to between 1 and 52),
  foundation text not null check (char_length(foundation) between 1 and 600),
  lead text not null check (char_length(lead) between 1 and 600),
  check (week_to >= week_from)
);

create table app.growth_plan_gates (
  block text not null references app.growth_plan_blocks(key) on delete cascade,
  sort int not null check (sort > 0),
  gate text not null check (char_length(gate) between 1 and 200),
  primary key (block, sort)
);

-- A block's status from the calendar: done once its weeks are past, in progress in them, next when it
-- follows the current block, planned otherwise — and planned throughout before the plan starts.
create function app.growth_plan_status(p_from int, p_to int, p_week int) returns text
  language sql stable set search_path = ''
as $fn$
  select case
    when p_week is null or p_week < 1 then 'planned'
    when p_to < p_week then 'done'
    when p_from <= p_week then 'in_progress'
    when p_from = (select min(b.week_from) from app.growth_plan_blocks b where b.week_from > p_week) then 'next'
    else 'planned'
  end
$fn$;
revoke all on function app.growth_plan_status(int, int, int) from public, anon, authenticated;

-- The plan's current week (1-based) from its start date, in Oslo; null before a start date is set.
create function app.growth_plan_week() returns int
  language sql stable security definer set search_path = ''
as $fn$
  select case when s.plan_start is null then null
              else ((now() at time zone 'Europe/Oslo')::date - s.plan_start) / 7 + 1 end
  from app.growth_settings s
$fn$;
revoke all on function app.growth_plan_week() from public, anon, authenticated;

-- ============================================================ 4. rules and experiments
create table app.growth_rules (
  key text primary key check (key ~ '^R[0-9]{1,2}$'),
  sort int not null unique check (sort > 0),
  name text not null check (char_length(name) between 1 and 80),
  trigger_desc text not null check (char_length(trigger_desc) between 1 and 200),
  condition_desc text not null check (char_length(condition_desc) between 1 and 200),
  action_desc text not null check (char_length(action_desc) between 1 and 200),
  stream text not null check (stream in ('service', 'marketing', 'internal', 'system', 'service_internal')),
  -- what implements it in Orgpuls; 'none' until something does
  impl_kind text not null default 'none' check (impl_kind in ('none', 'function', 'trigger', 'cron', 'lifecycle')),
  impl_ref text check (impl_ref ~ '^[a-z0-9_.-]{1,80}$'),
  check ((impl_kind = 'none') = (impl_ref is null))
);

create table app.growth_experiments (
  key text primary key check (key ~ '^E[0-9]{1,2}$'),
  sort int not null unique check (sort > 0),
  hypothesis text not null check (char_length(hypothesis) between 1 and 300),
  metric text not null check (char_length(metric) between 1 and 80),
  impact smallint not null check (impact between 1 and 5),
  confidence smallint not null check (confidence between 1 and 5),
  ease smallint not null check (ease between 1 and 5),
  status text not null default 'queued' check (status in ('queued', 'running', 'done'))
);

-- ============================================================ 5. guardrails, risks, decisions
create table app.growth_guardrails (
  sort int primary key check (sort > 0),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 400)
);

create table app.growth_risks (
  sort int primary key check (sort > 0),
  risk text not null check (char_length(risk) between 1 and 200),
  likelihood text not null check (likelihood in ('high', 'medium', 'low_medium', 'low', 'low_severe')),
  mitigation text not null check (char_length(mitigation) between 1 and 300)
);

create table app.growth_decisions (
  sort int primary key check (sort > 0),
  question text not null check (char_length(question) between 1 and 200),
  -- what applies until it is decided
  default_value text not null check (char_length(default_value) between 1 and 300),
  decided_value text check (char_length(decided_value) between 1 and 300),
  -- who decided it, in words (counsel, the founder): the admin who recorded it is in app.admin_audit
  decided_by text check (char_length(decided_by) between 1 and 120),
  decided_at timestamptz,
  check ((decided_value is null) = (decided_at is null) and (decided_value is null) = (decided_by is null))
);

-- ============================================================ 6. the funnel and the lead math
create table app.growth_funnel_stages (
  key text primary key check (key ~ '^[a-z_]{1,20}$'),
  sort int not null unique check (sort > 0),
  stage text not null check (char_length(stage) between 1 and 40),
  -- the events as the report names them, shown beside the stage
  event_label text not null check (char_length(event_label) between 1 and 80),
  -- the catalogue events the count reads (a trigger holds them to the catalogue)
  events text[] not null default '{}',
  definition text not null check (char_length(definition) between 1 and 200),
  -- how the stage is counted this month (app.growth_funnel_count)
  measure text not null check (measure in ('web_sessions', 'any', 'all', 'all_14d', 'setup', 'second_cycle', 'none')),
  check ((measure in ('web_sessions', 'none')) = (cardinality(events) = 0))
);

create function app.growth_funnel_events_known() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if exists (select 1 from unnest(new.events) e where not exists (select 1 from app.event_catalogue c where c.name = e)) then
    raise exception 'growth_funnel_stages: % names an event the catalogue does not have', new.key using errcode = '23514';
  end if;
  return new;
end $fn$;
create trigger growth_funnel_events_known before insert or update of events on app.growth_funnel_stages
  for each row execute function app.growth_funnel_events_known();

create table app.growth_lead_sources (
  key text primary key check (key ~ '^[a-z_]{1,20}$'),
  sort int not null unique check (sort > 0),
  source text not null check (char_length(source) between 1 and 80),
  base int not null check (base >= 0),
  stretch int not null check (stretch >= base),
  needs text not null check (char_length(needs) between 1 and 200),
  -- the first-touch channels (app.web_channel, 0059) that are this source; none: «now» is unknown
  channels text[] not null default '{}'
    check (channels <@ array['paid', 'email', 'ai', 'social', 'organic', 'campaign', 'referral', 'direct']::text[])
);

create table app.growth_assumptions (
  sort int primary key check (sort > 0),
  body text not null check (char_length(body) between 1 and 200)
);

create table app.growth_benchmarks (
  sort int primary key check (sort > 0),
  metric text not null check (char_length(metric) between 1 and 80),
  value text not null check (char_length(value) between 1 and 120),
  source text not null check (char_length(source) between 1 and 120)
);

-- One stage's count for a month, or null where nothing in the schema can count it.
create function app.growth_funnel_count(p_measure text, p_events text[], p_from timestamptz, p_to timestamptz) returns bigint
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_n bigint;
  v_day_from date := (p_from at time zone 'Europe/Oslo')::date;
  v_day_to date := (p_to at time zone 'Europe/Oslo')::date;
begin
  if p_measure = 'web_sessions' then
    -- a session as the site's analytics counts one (0050): a visitor's views on a day, 30 minutes apart
    select count(*) into v_n
    from (select e.at - lag(e.at) over (partition by e.visitor, e.day order by e.at, e.id) as gap
          from app.web_events e where e.day >= v_day_from and e.day < v_day_to) s
    where s.gap is null or s.gap > interval '30 minutes';
  elsif p_measure = 'any' then
    select count(distinct g.org_id) into v_n from app.growth_events g
    where g.name = any (p_events) and g.org_id is not null and g.occurred_at >= p_from and g.occurred_at < p_to;
  elsif p_measure = 'setup' then
    -- an employee list of five or more: a band, never a count (0141)
    select count(distinct g.org_id) into v_n from app.growth_events g
    where g.name = any (p_events) and g.org_id is not null and g.occurred_at >= p_from and g.occurred_at < p_to
      and coalesce(g.props ->> 'employee_count_band', 'under_5') <> 'under_5';
  elsif p_measure in ('all', 'all_14d') then
    -- every event has happened, the last of them this month (and, for activation, within 14 days of signup)
    select count(*) into v_n from (
      select g.org_id, max(f.first_at) as reached
      from (select distinct g.org_id from app.growth_events g where g.name = any (p_events) and g.org_id is not null) g
      cross join lateral (select e, (select min(x.occurred_at) from app.growth_events x where x.org_id = g.org_id and x.name = e) as first_at
                          from unnest(p_events) e) f
      group by g.org_id
      having bool_and(f.first_at is not null)) r
    where r.reached >= p_from and r.reached < p_to
      and (p_measure = 'all'
           or r.reached <= (select min(c.occurred_at) from app.growth_events c where c.org_id = r.org_id and c.name = 'org.created')
                            + interval '14 days');
  elsif p_measure = 'second_cycle' then
    -- a survey planned this month by an organisation that has already sent one
    select count(distinct g.org_id) into v_n from app.growth_events g
    where g.name = any (p_events) and g.org_id is not null and g.occurred_at >= p_from and g.occurred_at < p_to
      and exists (select 1 from app.growth_events s where s.org_id = g.org_id and s.name = 'survey.sent' and s.occurred_at < g.occurred_at);
  else
    return null;
  end if;
  return v_n;
end $fn$;
revoke all on function app.growth_funnel_count(text, text[], timestamptz, timestamptz) from public, anon, authenticated;

-- The month's trials whose first touch is one of a source's channels; null when the source names none.
create function app.growth_lead_now(p_channels text[], p_from timestamptz, p_to timestamptz) returns bigint
  language sql stable security definer set search_path = ''
as $fn$
  select case when cardinality(p_channels) = 0 then null else
    (select count(*) from app.organizations o join app.org_attribution a on a.org_id = o.id
     where o.created_at >= p_from and o.created_at < p_to and a.channel = any (p_channels) and not app.is_demo(o.id)) end
$fn$;
revoke all on function app.growth_lead_now(text[], timestamptz, timestamptz) from public, anon, authenticated;

-- ============================================================ 7. coverage
create table app.growth_coverage (
  sort int primary key check (sort > 0),
  feature text not null check (char_length(feature) between 1 and 200),
  status text not null check (status in ('built', 'partial', 'missing', 'skipped')),
  note text not null default '' check (char_length(note) <= 300),
  href text check (href ~ '^/admin(/[a-z0-9_-]+)*$')
);

create table app.growth_recommendations (
  sort int primary key check (sort > 0),
  priority text not null check (priority in ('now', 'next', 'later')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 400)
);

create table app.growth_cuts (
  sort int primary key check (sort > 0),
  body text not null check (char_length(body) between 1 and 200)
);

-- ============================================================ 8. closed to clients
do $$
declare t text;
begin
  foreach t in array array['growth_settings', 'growth_tiers', 'growth_items', 'growth_plan_blocks', 'growth_plan_gates', 'growth_rules',
                           'growth_experiments', 'growth_guardrails', 'growth_risks', 'growth_decisions', 'growth_funnel_stages',
                           'growth_lead_sources', 'growth_assumptions', 'growth_benchmarks', 'growth_coverage',
                           'growth_recommendations', 'growth_cuts'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('revoke all on app.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

-- ============================================================ 9. the seed: the report's text, Orgpuls' true status
insert into app.growth_tiers (key, sort, name, why) values
  ('t0', 1, 'Tier 0 · Prerequisites', 'Legal basis and plumbing for every send'),
  ('t1', 2, 'Tier 1 · Lead engine core', 'The product and the org.nr do the prospecting'),
  ('t2', 3, 'Tier 2 · Scale and retain', 'Lawful reach and retention at low ACV'),
  ('t3', 4, 'Tier 3 · Supporting', 'Brand, links and small intent capture'),
  ('td', 5, 'Deferred', 'Cannot pay back at the current budget');

insert into app.growth_items (key, tier, sort, rank_label, name, why, status, live_check, effort, impact, kpi, score, href, build, guardrail) values
  ('consent', 't0', 1, 'Review 1 · #1', 'Consent ledger + double opt-in + preference centre + suppression', 'Legal basis for every marketing send',
   'building', 'consent_ledger', 'M', '2 weeks', '100 % of marketing contacts have a consent record', null, '/admin/crm/consent',
   'Append-only consent records with purpose, channel, lawful basis, wording version and double opt-in timestamps. Suppressions by email hash. Preference centre with one-click unsubscribe honoured within 2 days.',
   'Asking for consent by email is itself marketing — never cold-email to ask for opt-in.'),
  ('deliv', 't0', 2, 'Review 1 · #3', 'Deliverability baseline', 'Protects survey invitations and marketing',
   'building', null, 'S', '2 weeks', 'DMARC aligned on both streams · spam rate < 0,1 %', null, '/admin/deliverability',
   'SPF, DKIM 2048 and aligned DMARC on varsel.<domain> (transactional) and nyhet.<domain> (marketing). RFC 8058 one-click unsubscribe. Google Postmaster and the Yahoo feedback loop.',
   'Never send bulk mail from the transactional stream.'),
  ('events', 't0', 3, 'Review 1 · #2', 'Event catalogue v1 + trial-activation journey', 'Converts every lead the engine produces',
   'building', 'event_stream', 'M', '2–4 weeks', 'Activation rate · trial → paid at day 30', null, '/admin/growth/events',
   'About 20 org-level events drive the S0–S7 state machine. 10 % holdout on marketing journeys, never on service messages.',
   'Only aggregate survey events — never respondent identifiers.'),
  ('signup', 't1', 1, 'Review 2 · #1', 'Org.nr-first signup + landing-page system', 'Multiplies all other sources',
   'planned', null, 'M', '2–4 weeks', 'Visitor → trial per page · 5 % by month 6 (median 3,8 %)', 'U5 × E5 = 25', '/admin/cms/landing',
   'One field first: company name or org.nr with Brønnøysund suggestions, then email. Industry, size and address fill in automatically. One landing page per industry, mobile first, 250–725 words, one CTA «Start gratis», social proof from the same industry above the fold.',
   'No card and no phone number at signup.'),
  ('loop', 't1', 2, 'Review 2 · #2', '«Laget med Orgpuls» thank-you link + results poster', 'Grows with every customer at zero marginal cost',
   'planned', null, 'S', '1–3 months', 'Clicks per 1 000 responses · trials from the link', 'U5 × E4 = 20', '/admin/growth/funnel',
   'A discreet line on every survey thank-you page and on the employee results poster (aggregate results, groups of 5 or more).',
   'Campaign tag only — no cookie, pixel, respondent ID or survey ID. Respondents are never asked for an email.'),
  ('tools', 't1', 3, 'Review 2 · #3 · Review 1 · #5', 'Free tools: Krav-sjekk, Risiko-sjekk, absence calculator', 'Best list builder; creates lawful consent',
   'building', null, 'M', '1–2 months', 'Completions · consent rate 15 % · trial within 90 days', 'U4 × E5 = 20', '/admin/cms/magnets',
   'Org.nr in, «which HMS duties apply» out: verneombud from 5, AMU from 30, BHT industries, § 4-3 mapping. Summary free; PDF and templates after consent and double opt-in. Rules stored as versioned data with a last-checked date.',
   'Legal review; marked as guidance, not legal advice.'),
  ('seo', 't1', 4, 'Review 2 · #4 · Review 1 · #4', 'Programmatic SEO/GEO + § 4-3 hub + industry pages', 'Largest volume, 4–9 months lag',
   'building', null, 'M–L', '4–9 months', 'Indexed pages · non-branded clicks · AI citations (50 prompts monthly)', 'U3 × E5 = 15', '/admin/seo',
   'Page families: industry × topic, question bank, templates, requirements by size, the § 4-3 pillar with clusters. GEO pattern on every page: two-sentence answer first, Norwegian statistics with sources, a quotation, a table, named author.',
   'Each page must add data, a template or a question set — noindex until it does.'),
  ('nurture', 't1', 5, 'Review 2 · #5', 'Email capture + nurture', 'Highest-converting traffic source (16,9 % median)',
   'building', null, 'M', '1–2 months', 'Consented subscribers · click → trial', 'U4 × E4 = 16', '/admin/crm/journeys',
   'Capture on tools, templates and the monthly newsletter. Industry nurture D0–D16, then the newsletter. Exit on user.signed_up. Company name and industry in subject lines (test E5).',
   'Consent record, double opt-in, one-click unsubscribe.'),
  ('brreg', 't2', 1, 'Review 2 · #6 · Review 1 · #13', 'Brønnøysund trigger engine', 'Timely, lawful outreach; replaces generic outbound pilots',
   'building', null, 'M', '2 months', 'Trials per 100 contacts by trigger type · 10 % holdout', 'U3 × E4 = 12', '/admin/crm/triggers',
   'Daily poll of the update feed. Triggers: 5 employees (verneombud), 30 (AMU), new company in a target industry, new general manager. Actions: phone task with script, letter with QR to the Krav-sjekk, email to a generic address only.',
   'No email to named addresses without consent. Internal do-not-contact list. GDPR notice on calls. Purge HTTP 410 entities.'),
  ('partners', 't2', 2, 'Review 2 · #7 · Review 1 · #7', 'Partner programme and co-marketing', 'Trusted reach at low ACV',
   'building', null, 'M', '3–6 months', 'Active partners · 1,5 trials per partner a month', 'U3 × E4 = 12', '/admin/crm/partners',
   'Co-branded page per partner (/partner/[code]), partner kit, referral code stored on the company at signup, partner dashboard. Accountants: 20 % recurring or a client discount. BHT: the approved-BHT register as the list.',
   'Attribution on the organisation number, never on respondents.'),
  ('speed', 't2', 3, 'Review 2 · #8 · Review 1 · #9', 'Speed-to-lead + PQL task', 'Converts hand-raisers — 7× within the hour',
   'building', null, 'S', '2 weeks', 'Median response < 60 min, weekdays 08–16', 'U5 × E3 = 15', '/admin/crm/tasks',
   'Instant useful auto-reply, then a founder callback within one hour as a task with an SLA timer. The PQL flag creates the same task.',
   'A PQL triggers a founder task, not an automated sales cadence.'),
  ('referral', 't2', 4, 'Review 2 · #9 · Review 1 · #10', 'Referral + verneombud sharing', 'Cheap, loyal customers (+16 % value)',
   'planned', null, 'S', '2–4 months', 'Referral trials per 100 active customers', 'U4 × E3 = 12', '/admin/crm/journeys',
   'One month free for both sides, shown after first results and in the NPS promoter flow. Verneombud get a share link in the product only.',
   'Reward still open: one month free or a donation (E10).'),
  ('arshjul', 't2', 5, 'Review 1 · #6', 'Årshjul / survey-cycle reminders', 'Retention at low ACV',
   'building', 'year_wheel', 'S', '1–2 months', 'Second cycle scheduled within 6 months', null, '/admin/crm/journeys',
   'Cycle −30 days «Neste kartlegging nærmer seg» with pre-filled scheduling, quarterly pulse suggestion, tier notice 30 days ahead.',
   'Service stream — no promotion, no consent needed.'),
  ('news', 't3', 1, 'Review 2 · #10', 'News-jacking + Arbeidsmiljøindeks', 'Links and brand',
   'planned', null, 'S–M', '1–6 months', 'Referring domains · branded search', 'U3 × E3 = 9', '/admin/cms',
   'A response page within 48 hours of an Arbeidstilsynet announcement. A twice-yearly aggregate index with a minimum company count per cell.',
   'Aggregates across many companies; written method.'),
  ('linkedin', 't3', 2, 'Review 2 · #11 · Review 1 · #8', 'Founder-led LinkedIn', 'Free reach, E-E-A-T',
   'planned', null, 'S', '1–3 months', 'Tool-link clicks per post', 'U4 × E2 = 8', '/admin/growth/plan',
   '2–3 posts a week: document carousels, short takes on Arbeidstilsynet guidance, aggregate insights, each ending with a tool link.',
   'Do not pitch in DMs — selling via DM is marketing to a natural person.'),
  ('ads', 't3', 3, 'Review 2 · #12 · Review 1 · #11', 'Google Ads, exact match', 'Small, controllable intent capture',
   'planned', null, 'S', 'Immediate', 'Cost per activated trial', 'U4 × E2 = 8', '/admin/web/goals',
   'About 1 000 kr a month on high-intent Norwegian terms, negatives for jobs and students. Conversion is org.created, sent server-side.',
   'Judge on cost per activated trial, not clicks.'),
  ('webinars', 't3', 4, 'Review 2 · #13 · Review 1 · #12', 'Partner webinars', 'List and partner trust',
   'planned', null, 'S', '2–3 months', 'Consented subscribers per webinar', 'U3 × E2 = 6', '/admin/crm/partners',
   'First webinar in weeks 11–13, after the partner pages exist.',
   'Consent and double opt-in at registration.'),
  ('reviews', 't3', 5, 'Review 1 · #16 · #14', 'Review programme · Tripletex integration', 'Social proof; phase-2 distribution',
   'planned', null, 'S', 'Q2', 'Reviews a month · marketplace trials', null, '/admin/crm/journeys',
   'Promoters get a review ask in the NPS flow (Google Business Profile, Trustpilot). Tripletex listing in phase 2 (approval 2–4 weeks).',
   'G2/Capterra only for the English push.'),
  ('lipaid', 'td', 1, 'Review 2 · #14 · Review 1 · #15', 'LinkedIn paid', 'CPL $202–376 cannot pay back at 265–565 kr a month',
   'deferred', null, '—', '—', '—', 'U3 × E1 = 3', null,
   'Later: boost the founder’s best post as a Thought Leader Ad to company-list audiences.',
   'Insight Tag only after marketing consent (ekomloven § 3-15).');

insert into app.growth_plan_blocks (key, week_from, week_to, foundation, lead) values
  ('w01_02', 1, 2, 'Event catalogue v1 (about 20 events); consent ledger + double opt-in; sending provider with 2 streams and 2 subdomains; DMARC from p=none to quarantine',
   'Org.nr-first signup with Brønnøysund name search; landing-page template with 5 industry variants; «Laget med Orgpuls» on thank-you pages (campaign tag only); newsletter form with double opt-in; Norwegian keyword map; rewrite pricing/trial page; start founder LinkedIn cadence'),
  ('w03_04', 3, 4, 'Journey engine MVP (triggers, waits, branch-on-event, exit-on-goal, 10 % holdout); trial journey v1 (7 messages)',
   'Krav-sjekk v1 (summary free, PDF after consent); § 4-3 pillar page + 2 industry pages; 10 question-bank pages with the GEO pattern; 2 SEO pages a week from here'),
  ('w05_06', 5, 6, 'Segment builder v1 (Brønnøysund attributes + events)',
   'Risiko-sjekk + absence calculator on the shared tool flow; 5 industry nurture sequences; instant auto-reply + founder callback task (1-hour SLA); Google Ads exact-match test'),
  ('w07_08', 7, 8, 'PQL flag + task queue; trial-end / win-back journey; årshjul reminders; tier notices',
   'Brønnøysund trigger engine (daily poll, 5 and 30 employee thresholds, new companies, new managers); phone script, letter template, generic-address email; referral codes; remaining 3 industry pages; recruit 5 pilot partners'),
  ('w09_10', 9, 10, 'Partner codes + attribution (UTM + ref code on org) + partner dashboard v0',
   'Partner pages (/partner/[code]) and partner kit; news-jacking page template; GEO pass on all pages'),
  ('w11_13', 11, 13, 'NPS + review requests; monthly newsletter; cookieless funnel reports; holdout readout',
   'Employee results poster (groups of 5 or more); first partner webinar; PR pitch to trade media; 90-day review');

insert into app.growth_plan_gates (block, sort, gate) values
  ('w01_02', 1, 'DMARC aligned on both streams'), ('w01_02', 2, '100 % of marketing contacts have a consent record'),
  ('w01_02', 3, 'Signup completion measured'), ('w01_02', 4, 'No survey ID or cookie leaves the survey page'),
  ('w03_04', 1, 'Activation baseline measured'), ('w03_04', 2, 'Journey sends > 95 % delivered'), ('w03_04', 3, '≥ 300 tool completions and 15 % consent rate'),
  ('w05_06', 1, '≥ 150 double-opt-in subscribers'), ('w05_06', 2, 'Risiko-sjekk → trial ≥ 5 %'), ('w05_06', 3, 'Median response to hand-raisers < 60 min on weekdays'),
  ('w07_08', 1, 'Trial → paid tracked per cohort'), ('w07_08', 2, 'First 100 trigger contacts logged with 10 % holdout'),
  ('w09_10', 1, '5 signed partner pilots'), ('w09_10', 2, '≥ 1 partner-sourced trial a week'),
  ('w11_13', 1, '60+ trials a month'), ('w11_13', 2, 'CAC per source known'), ('w11_13', 3, 'Holdout readout (directional)');

-- What implements each rule in Orgpuls today. Nothing else does: R2–R4, R6–R8 and R10–R12 wait for a
-- PQL flag, marketing consent under § 15, the sunset, the hand-raise task, Brønnøysund (G3) and the
-- tools (G4), and are off until something named here implements them.
insert into app.growth_rules (key, sort, name, trigger_desc, condition_desc, action_desc, stream, impl_kind, impl_ref) values
  ('R1', 1, 'Stalled setup', '48 h in S1', 'Not unsubscribed from tips', 'Email + in-app card', 'service', 'lifecycle', 'setup_help'),
  ('R2', 2, 'PQL', 'action_item.created OR response rate ≥ 50 % by day 7', 'Trial', 'Founder task with context', 'internal', 'none', null),
  ('R3', 3, 'Trial extension', 'Trial day 12', 'State < S3', 'Offer a 7-day extension', 'service', 'none', null),
  ('R4', 4, 'Upgrade offer', 'Trial day 13', 'Activated, marketing consent', 'Offer + social proof', 'marketing', 'none', null),
  ('R5', 5, 'Årshjul', 'Cycle −30 d', 'Paid', 'Schedule prompt', 'service', 'cron', 'orgpuls-wheel'),
  ('R6', 6, 'Tier change', 'Employees > 25', 'Paid, ≤ 25 tier', 'Notice 30 days ahead', 'service', 'none', null),
  ('R7', 7, 'Win-back', 'Trial expired', 'Consent', '3-step sequence', 'marketing', 'none', null),
  ('R8', 8, 'Sunset', '180 d no click or login', 'Marketing contact', 'Re-permission, then suppress', 'marketing', 'none', null),
  ('R9', 9, 'Complaint / bounce', 'Provider webhook', 'Any', 'Suppress globally + log', 'system', 'function', 'public.record_crm_event'),
  ('R10', 10, 'Hand-raise', 'lead.hand_raised', 'Any', 'Instant auto-reply + founder task, 1-hour SLA', 'service_internal', 'none', null),
  ('R11', 11, 'Trigger outreach', 'brreg.threshold_crossed', 'Fit score ≥ 30, not on the do-not-contact list', 'Phone task or letter; generic email only', 'internal', 'none', null),
  ('R12', 12, 'Tool follow-up', 'lead.tool_report_requested', 'Double opt-in confirmed', 'Start nurture journey 3', 'marketing', 'none', null);

-- No experiment runs in Orgpuls today: every one is queued.
insert into app.growth_experiments (key, sort, hypothesis, metric, impact, confidence, ease, status) values
  ('E1', 1, 'Asking for the organisation number before the email raises signup completion', 'Visitor → trial', 5, 5, 4, 'queued'),
  ('E2', 2, 'An industry-specific headline beats a generic one', 'Visitor → trial', 4, 4, 5, 'queued'),
  ('E3', 3, '«Kartlegg arbeidsmiljøet gratis» beats «Laget med Orgpuls» as the thank-you link text', 'Clicks per 1 000 responses', 3, 5, 5, 'queued'),
  ('E4', 4, 'Showing the full Krav-sjekk result, with the PDF optional, beats gating the result', 'Trials within 30 days', 4, 4, 4, 'queued'),
  ('E5', 5, 'The company name in the subject line raises clicks (Sahni et al. replication)', 'Click → trial', 4, 3, 4, 'queued'),
  ('E6', 6, 'Plain-text founder emails beat designed emails in nurture', 'Click → trial', 3, 4, 4, 'queued'),
  ('E7', 7, 'A callback within 1 hour beats one the next day for hand-raisers', 'Trial → activation', 5, 3, 3, 'queued'),
  ('E8', 8, 'A letter to companies that just crossed 5 employees beats the holdout', 'Trials per 100 companies', 3, 3, 4, 'queued'),
  ('E9', 9, 'A GEO rewrite on 10 pages beats 10 control pages', 'AI citations and clicks', 4, 3, 3, 'queued'),
  ('E10', 10, '«1 month free for both» beats a charity donation as the referral reward', 'Referral trials', 3, 3, 3, 'queued');

insert into app.growth_guardrails (sort, title, body) values
  (1, 'Anonymity', 'Nothing on the thank-you page or results poster identifies a respondent, a survey or a group smaller than 5. Respondents never become leads or CRM contacts.'),
  (2, 'Consent · markedsføringsloven § 15', 'No marketing email to named personal addresses without prior consent. Generic addresses and phone calls are allowed, with a do-not-contact list and a GDPR notice.'),
  (3, 'Honest compliance claims', 'The 2026 § 4-3 change is a clarification — «Loven er presisert». The Krav-sjekk is guidance, not legal advice.'),
  (4, 'Cookies · ekomloven § 3-15', 'No ad tags without consent. The site is cookieless by default.');

insert into app.growth_risks (sort, risk, likelihood, mitigation) values
  (1, 'Trial emails misclassified under § 15(3)', 'medium', 'Service/marketing split + consent checkbox; written legal opinion'),
  (2, 'Anonymity breach through analytics, CRM coupling or the survey loop', 'low_severe', 'Separate schema, no grants, CI checks, audits; campaign tag only on survey pages'),
  (3, 'Overclaiming the 2026 law change', 'medium', 'Copy guideline «presisering, ikke nye krav»; cite Arbeidstilsynet'),
  (4, 'A paying customer objects to «Laget med Orgpuls»', 'medium', 'Small, neutral line; removal policy decided before launch'),
  (5, 'Wrong rule in the Krav-sjekk', 'medium', 'Legal review; versioned rules; «sist kontrollert» date per rule'),
  (6, 'Thin programmatic pages hurt the site', 'medium', 'Data, template or question set on every page; noindex until ready'),
  (7, 'Trigger outreach feels intrusive', 'low_medium', 'Helpful letter with the Krav-sjekk; 10 % holdout'),
  (8, 'Over-building the CRM instead of shipping journeys', 'medium', 'Narrow MVP scope; ship journeys by week 4'),
  (9, 'Partners stall without enablement', 'medium', 'Partner kit, pages and dashboard before recruiting at scale'),
  (10, 'Sending-provider data residency', 'medium', 'DPA + sub-processor list; prefer Brevo or Mailjet'),
  (11, 'AI Overviews erode SEO traffic', 'high', 'GEO pattern; track branded search and trials'),
  (12, 'Small samples mislead experiments', 'high', 'Big changes, whole weeks, one metric; cohorts over 90 days'),
  (13, 'The index exposes a customer’s data', 'low', 'Aggregates across many companies; minimum count per cell; written method');

insert into app.growth_decisions (sort, question, default_value) values
  (1, 'Does § 15(3) cover trial users?', 'Consent checkbox and service/marketing split until counsel answers'),
  (2, 'Legitimate-interest assessment for phone and letter prospecting from Brønnøysund roles', 'Notice script + reservation list; assessment written before week 7'),
  (3, 'Can paying customers remove «Laget med Orgpuls», and from which plan?', 'Shown on all plans'),
  (4, 'Legal sign-off on the Krav-sjekk rules and wording', 'Approved with a «guidance, not legal advice» note; rules v3'),
  (5, 'Budget for printed letters to trigger companies', 'Up to 200 a month in the test'),
  (6, 'Referral reward', 'One month free for both — or a donation (E10)'),
  (7, 'Partner revenue share', '20 % recurring or a client discount'),
  (8, 'Publish the Arbeidsmiljøindeks, and its minimum company count per cell?', 'Undecided; method written first'),
  (9, 'Sending provider after DPA review', 'Brevo (EU); Mailjet as alternative'),
  (10, 'European expansion (orgpace.com)', 'Locale and legal-basis fields now; no paid English channels before Norwegian retention is proven');

insert into app.growth_funnel_stages (key, sort, stage, event_label, events, definition, measure) values
  ('visitors', 1, 'Visitors', 'web analytics · sessions', '{}', 'Relevant visits to landing, tool and SEO pages', 'web_sessions'),
  ('signup', 2, 'Signup', 'org.created', '{org.created}', 'Organisation number entered and Brønnøysund lookup succeeded', 'any'),
  ('setup', 3, 'Setup', 'employees.imported', '{employees.imported}', 'Employee list added with ≥ 5 recipients', 'setup'),
  ('value', 4, 'Value', 'survey.sent · survey.threshold_reached', '{survey.sent,survey.threshold_reached}', 'First survey sent and the anonymity minimum reached', 'all'),
  ('activated', 5, 'Activated', 'results.viewed + action_item.created', '{results.viewed,action_item.created}', 'Within 14 days of signup · validate against 90-day retention once 100+ cohorts exist', 'all_14d'),
  ('pql', 6, 'PQL', 'flag → founder task', '{}', 'Activated, or ≥ 50 % response by trial day 7, or 26–100 tier with a verneombud invited', 'none'),
  ('paid', 7, 'Paid', 'subscription.started', '{subscription.started}', 'Trial → paid · planning assumption 12,5 %', 'any'),
  ('retained', 8, 'Retained', 'survey.scheduled', '{survey.scheduled}', 'Second survey cycle scheduled within 6 months', 'second_cycle'),
  ('expansion', 9, 'Expansion', 'subscription.tier_changed', '{subscription.tier_changed}', 'Tier upgrade when the employee count crosses 25', 'any');

-- «now» is known only where the site's attribution names the source: search and AI answers for SEO/GEO,
-- a mail for the nurture, paid media for the ads. The product loop, partners and Brønnøysund have no
-- channel of their own yet (no «Laget med» link, no partner code, no poll), so their «now» is unknown.
insert into app.growth_lead_sources (key, sort, source, base, stretch, needs, channels) values
  ('seo', 1, 'SEO/GEO landing pages', 45, 110, '1 500–3 700 relevant visits a month at 3 %', '{organic,ai}'),
  ('tools', 2, 'Free tools → email nurture', 25, 60, '1 700–4 000 tool users a month · 15 % consent · 10 % of subscribers start a trial', '{email}'),
  ('loop', 3, 'Product loop (thank-you link, poster, referrals)', 20, 50, '150–300 surveys a month, each reaching 5–100 employees', '{}'),
  ('partners', 4, 'Partners (BHT, accountants, HMS consultants)', 15, 40, '10–25 active partners at 1,5 trials each a month', '{}'),
  ('brreg', 5, 'Brønnøysund triggers (phone, letter, generic email)', 10, 25, '300–600 contacts a month at 3–4 %', '{}'),
  ('ads', 6, 'Google Ads (exact match)', 5, 15, 'About 1 000 kr a month, more in stretch', '{paid}');

insert into app.growth_assumptions (sort, body) values
  (1, 'Visitor → trial: 3 % blended'), (2, 'Tool user → consented email: 15 %'), (3, 'Subscriber → trial within 90 days: 10 %'),
  (4, 'Trial → paid: 12,5 %'), (5, 'Pool: about 67 900 Norwegian companies with 5–100 employees'),
  (6, 'Target: 120 (base) to 300 (stretch) trials a month by month 12 → 15–38 new customers a month'),
  (7, 'Replace with Orgpuls cohorts after 90 days');

insert into app.growth_benchmarks (sort, metric, value, source) values
  (1, 'Free-to-paid, all models', 'Median 8 % · card-required trials about 30 %', 'ChartMogul / Growth Unhinged / ProductLed 2026 · vendor'),
  (2, 'No-card trial → paid', '8,9 % vs 18,2 % — plan with 10–15 %, aim for 20 %', 'ChartMogul vs First Page Sage · sources conflict'),
  (3, 'Visitor → trial', 'Opt-in 7,8 % vs opt-out 2,4 %', 'First Page Sage · agency data'),
  (4, 'SaaS landing pages', 'Median 3,8 % · top quartile 11,6 % · email traffic 16,9 %', 'Unbounce, 41 000 pages · vendor'),
  (5, 'Trial length', '14 days for 62 % of products', 'ChartMogul 2026'),
  (6, 'Activation rate', 'Median 30 %, average 36 %', 'Lenny’s Newsletter · self-reported'),
  (7, 'Monthly logo churn, B2B SMB', '2,5–5 % good · < 1,5 % great', 'Practitioner consensus');

-- Where each feature of the report stands in Orgpuls today, with this branch (G0–G2). G3 and G4 are
-- built in parallel: their rows read «missing» or «partial» here, and G5 re-derives the review from
-- what shipped.
insert into app.growth_coverage (sort, feature, status, note, href) values
  (1, 'Consent ledger (append-only), double opt-in, preference centre, suppression', 'partial', 'Ledger, double opt-in, preference centre and suppression hashes exist; no wording version per record, and the Consent page is phase G3', '/admin/crm/consent'),
  (2, 'Deliverability: two streams on subdomains, SPF/DKIM/DMARC, RFC 8058, Postmaster, hygiene', 'partial', 'One-click unsubscribe and bounce and complaint suppression exist; the two subdomains wait, and the page is phase G4', '/admin/deliverability'),
  (3, 'Template registry with service/marketing classification', 'missing', 'Phase G4', '/admin/deliverability'),
  (4, 'Event catalogue v1 with PII level per event', 'built', '', '/admin/growth/events'),
  (5, 'Trial-activation state machine S0–S7 with branches and 10 % holdout', 'partial', 'Lifecycle mails on the trial clock; no state machine, branches or holdout', '/admin/crm/journeys'),
  (6, 'Journeys 2–4: paid onboarding & årshjul, lead nurture D0–D16, advocacy/NPS; win-back', 'partial', 'Follow-up chains read as journeys; the new sends wait for marketing consent and decision 1', '/admin/crm/journeys'),
  (7, 'Automation rule catalogue R1–R12 with streams', 'built', 'Each rule shows whether what implements it is live', '/admin/growth/rules'),
  (8, 'Lead scoring fit × intent; routing ≥ 60 or hand-raise → founder task', 'partial', 'Account health scores trials; fit × intent and routing are phase G3', '/admin/crm/scoring'),
  (9, 'PQL flag and speed-to-lead task with 1-hour SLA', 'partial', 'Tasks exist; no PQL flag, and the SLA is phase G3', '/admin/crm/tasks'),
  (10, 'Brønnøysund trigger engine: daily poll, 4 triggers, phone/letter/generic email, holdout, do-not-contact, 410 purge', 'missing', 'Phase G3', '/admin/crm/triggers'),
  (11, 'Partner programme: codes on the company, /partner/[code] pages, kit, dashboard, revenue share', 'missing', 'Phase G3; the public pages wait for a design', '/admin/crm/partners'),
  (12, 'Lead magnets with the gating rule and versioned Krav-sjekk rules', 'missing', 'Phase G4; the public tools wait for a design', '/admin/cms/magnets'),
  (13, 'Org.nr-first signup + industry landing-page system', 'partial', 'Landing pages exist; the org.nr-first form waits for experiment E1', '/admin/cms/landing'),
  (14, 'Programmatic SEO/GEO with the GEO pattern and AI-citation tracking', 'partial', 'Search performance exists; no per-page GEO checklist or 50-prompt citation tracker', '/admin/seo'),
  (15, '«Laget med Orgpuls» thank-you link and results poster', 'missing', 'Changes the respondent pages, which have no design for it, and needs decision 3', null),
  (16, 'Cookieless web analytics, goals and funnel', 'built', '', '/admin/web'),
  (17, 'Attribution: first/last touch, partner code, «Hvor hørte du om oss?» on the company', 'partial', 'First and last touch and «Hvor hørte du om oss?» are stored on the organisation; no partner code', '/admin/orgs'),
  (18, 'Health score v1 per customer', 'partial', 'On the Event catalogue, lowest first; not yet on the customer detail, and NPS has no source', '/admin/growth/events'),
  (19, 'Experiment backlog with ICE; holdout readouts', 'partial', 'Backlog built; the holdout readout report is missing', '/admin/growth/experiments'),
  (20, '90-day plan with gates; funnel definitions and lead math', 'built', '', '/admin/growth/plan'),
  (21, 'Risks, guardrails and open decisions', 'built', '', '/admin/growth/risks'),
  (22, 'Anonymity firewall (separate schema, no grants, CI checks)', 'built', 'Seven rules computed live on the Event catalogue, and proved by a suite in CI', '/admin/growth/events'),
  (23, 'Referral programme (codes, two-sided reward) and verneombud sharing', 'missing', 'Exists only in the report', null),
  (24, 'Segment builder on Brønnøysund attributes + events', 'partial', 'Segments filter on employees and industry code; not on events or thresholds crossed', '/admin/crm/segments'),
  (25, 'Parent-company relation (chains deciding for many units)', 'missing', 'One organisation per customer; no parent chain', '/admin/orgs'),
  (26, 'NPS results and review requests', 'missing', 'No customer NPS exists', null),
  (27, 'Tickets linked to the company; detractor → ticket', 'partial', 'Tickets are linked to the organisation; no detractor flow without NPS', '/admin/tickets'),
  (28, 'Sending-provider DPA, sub-processors, EU residency', 'partial', 'Sub-processors are listed in the data processing agreement; the provider card is phase G4', '/admin/legal'),
  (29, 'Person enrichment, SMS, predictive scoring, send-time optimisation, AI copy, multi-touch attribution', 'skipped', 'The report says not to build these yet', null),
  (30, 'Drag-and-drop page builder', 'skipped', 'Sentral’s editor is block-based on the template registry — keep the block set fixed, no free-form layout', '/admin/cms/templates');

insert into app.growth_recommendations (sort, priority, title, body) values
  (1, 'now', 'Consent-aware send guard', 'Block any Marketing-classified template to a contact without a granted record; show it as a pre-send checklist on campaigns and journey steps, like the publish checklist on pages.'),
  (2, 'now', 'Honest-compliance copy lint', 'Flag «nye krav», «new law requirements» and unverified inspection claims in pages, landing pages and emails; suggest «Loven er presisert».'),
  (3, 'now', 'Speed-to-lead report', 'Median response time to hand-raisers and PQLs, weekdays 08–16, against the 60-minute line — the gate for weeks 5–6.'),
  (4, 'now', 'Holdout readout', 'Per marketing journey: trial → paid at day 30 for enrolled vs the 10 % holdout, cumulative cohorts, with a small-sample warning.'),
  (5, 'next', 'Referrals screen', 'Referral codes on the company, redemptions, reward state (one month free for both), verneombud share-link clicks.'),
  (6, 'next', 'Segment builder', 'Rules on Brønnøysund attributes (industry code, employees, threshold crossed) and events, with a live count and a holdout switch.'),
  (7, 'next', 'GEO checklist and AI-citation tracker', 'Per page: answer first, statistics with sources, a quotation, a table, named author. Monthly run of 50 sample prompts; citations shown next to clicks.'),
  (8, 'next', 'Attribution on the customer record', 'First touch, last touch, partner code and «Hvor hørte du om oss?» stored on the company; shown in customer detail and in CAC per source.'),
  (9, 'next', 'Health score on customer detail', 'The six components with what is missing, and a low-health list for Support.'),
  (10, 'later', 'Anonymity firewall monitor', 'CI check results, schema grants audit and a PII lint on the event catalogue — so the hard rule is visible, not assumed.'),
  (11, 'later', 'Parent company', 'parent_company_id on customers so kindergarten chains and construction groups roll up seats, health and billing.'),
  (12, 'later', 'Partner-facing dashboard', 'Read-only view per partner code: trials, activations, revenue share, kit downloads.');

insert into app.growth_cuts (sort, body) values
  (1, 'Predictive lead scoring'), (2, 'Drag-and-drop page builder'), (3, 'SMS (needs its own consent)'),
  (4, 'Person enrichment (Apollo, Lusha)'), (5, 'Paid LinkedIn before consented audiences exist'),
  (6, 'G2/Capterra before the English launch'), (7, 'Public procurement'),
  (8, 'Send-time optimisation · AI copy generation · multi-touch attribution');

-- ============================================================ 10. the reads
-- The Growth area's roles, with a second factor (app.admin_role() is null without one).
create function app.growth_admin() returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select app.is_platform_admin(array['super_admin', 'analyst', 'marketing']::app.platform_role[])
$fn$;
revoke all on function app.growth_admin() from public, anon, authenticated;

-- The admins an item may be given to: active, and able to see the Growth area.
create function app.growth_owner_ok(p_owner uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from app.platform_admins a
                 where a.user_id = p_owner and a.active and a.product_id = 'orgpuls'
                   and a.role = any (array['super_admin', 'analyst', 'marketing']::app.platform_role[]))
$fn$;
revoke all on function app.growth_owner_ok(uuid) from public, anon, authenticated;

-- A board item as every reader shows it: its status derived, its owner by address.
create function app.growth_item_json(i app.growth_items) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('key', i.key, 'tier', i.tier, 'rank', i.rank_label, 'name', i.name, 'why', i.why,
    'build', i.build, 'kpi', i.kpi, 'guardrail', i.guardrail, 'effort', i.effort, 'impact', i.impact, 'score', i.score,
    'status', case when i.live_check is not null and app.growth_live(i.live_check) then 'live' else i.status end,
    'stored', i.status, 'live_check', i.live_check, 'href', i.href,
    'owner', (select jsonb_build_object('id', u.id, 'email', u.email) from auth.users u where u.id = i.owner))
$fn$;
revoke all on function app.growth_item_json(app.growth_items) from public, anon, authenticated;

-- The plan's week and its size, for the board's KPI and the plan.
create function app.growth_plan_json() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('start', s.plan_start, 'week', app.growth_plan_week(),
    'weeks', (select max(b.week_to) from app.growth_plan_blocks b),
    -- the current block's first gate, what the week is working towards
    'gate', (select g.gate from app.growth_plan_blocks b join app.growth_plan_gates g on g.block = b.key
             where app.growth_plan_week() between b.week_from and b.week_to order by g.sort limit 1))
  from app.growth_settings s
$fn$;
revoke all on function app.growth_plan_json() from public, anon, authenticated;

create function public.admin_growth_view(p_view text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_from timestamptz := date_trunc('month', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
  v_to timestamptz := (date_trunc('month', now() at time zone 'Europe/Oslo') + interval '1 month') at time zone 'Europe/Oslo';
  v_week int := app.growth_plan_week();
begin
  if not app.growth_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_view is null or p_view not in ('board', 'plan', 'funnel', 'rules', 'experiments', 'risks', 'coverage') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('growth.' || p_view || '_view');

  if p_view = 'board' then
    return jsonb_build_object('ok', true,
      'tiers', (select jsonb_agg(jsonb_build_object('key', t.key, 'name', t.name, 'why', t.why) order by t.sort) from app.growth_tiers t),
      'items', (select coalesce(jsonb_agg(app.growth_item_json(i) order by t.sort, i.sort), '[]')
                from app.growth_items i join app.growth_tiers t on t.key = i.tier),
      'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email) order by u.email), '[]')
                 from auth.users u where app.growth_owner_ok(u.id)),
      'plan', app.growth_plan_json());
  elsif p_view = 'plan' then
    return jsonb_build_object('ok', true, 'plan', app.growth_plan_json(),
      'blocks', (select jsonb_agg(jsonb_build_object('key', b.key, 'from', b.week_from, 'to', b.week_to,
                   'foundation', b.foundation, 'lead', b.lead,
                   'status', app.growth_plan_status(b.week_from, b.week_to, v_week),
                   'gates', (select coalesce(jsonb_agg(g.gate order by g.sort), '[]') from app.growth_plan_gates g where g.block = b.key))
                 order by b.week_from) from app.growth_plan_blocks b));
  elsif p_view = 'funnel' then
    return jsonb_build_object('ok', true, 'month', (v_from at time zone 'Europe/Oslo')::date,
      'stages', (select jsonb_agg(jsonb_build_object('key', f.key, 'stage', f.stage, 'event', f.event_label, 'definition', f.definition,
                   'n', app.growth_funnel_count(f.measure, f.events, v_from, v_to)) order by f.sort) from app.growth_funnel_stages f),
      'lead', (select jsonb_agg(jsonb_build_object('key', l.key, 'source', l.source, 'base', l.base, 'stretch', l.stretch, 'needs', l.needs,
                 'now', app.growth_lead_now(l.channels, v_from, v_to)) order by l.sort) from app.growth_lead_sources l),
      'assumptions', (select jsonb_agg(a.body order by a.sort) from app.growth_assumptions a),
      'benchmarks', (select jsonb_agg(jsonb_build_object('metric', b.metric, 'value', b.value, 'source', b.source) order by b.sort)
                     from app.growth_benchmarks b));
  elsif p_view = 'rules' then
    return jsonb_build_object('ok', true,
      'rules', (select jsonb_agg(jsonb_build_object('key', r.key, 'name', r.name, 'trigger', r.trigger_desc, 'condition', r.condition_desc,
                  'action', r.action_desc, 'stream', r.stream, 'impl_kind', r.impl_kind, 'impl_ref', r.impl_ref,
                  'live', app.growth_impl_live(r.impl_kind, r.impl_ref)) order by r.sort) from app.growth_rules r));
  elsif p_view = 'experiments' then
    return jsonb_build_object('ok', true,
      'experiments', (select jsonb_agg(jsonb_build_object('key', e.key, 'hypothesis', e.hypothesis, 'metric', e.metric,
                        'impact', e.impact, 'confidence', e.confidence, 'ease', e.ease, 'status', e.status)
                        order by e.impact * e.confidence * e.ease desc, e.sort) from app.growth_experiments e));
  elsif p_view = 'risks' then
    return jsonb_build_object('ok', true,
      'guardrails', (select jsonb_agg(jsonb_build_object('title', g.title, 'body', g.body) order by g.sort) from app.growth_guardrails g),
      'risks', (select jsonb_agg(jsonb_build_object('risk', r.risk, 'likelihood', r.likelihood, 'mitigation', r.mitigation) order by r.sort)
                from app.growth_risks r),
      'decisions', (select jsonb_agg(jsonb_build_object('n', d.sort, 'question', d.question, 'default', d.default_value,
                      'decided', d.decided_value, 'by', d.decided_by, 'at', d.decided_at) order by d.sort) from app.growth_decisions d));
  else
    return jsonb_build_object('ok', true,
      'coverage', (select jsonb_agg(jsonb_build_object('feature', c.feature, 'status', c.status, 'note', c.note, 'href', c.href) order by c.sort)
                   from app.growth_coverage c),
      'recommendations', (select jsonb_agg(jsonb_build_object('n', r.sort, 'priority', r.priority, 'title', r.title, 'body', r.body) order by r.sort)
                          from app.growth_recommendations r),
      'cuts', (select jsonb_agg(c.body order by c.sort) from app.growth_cuts c));
  end if;
end $fn$;
revoke all on function public.admin_growth_view(text) from public, anon;
grant execute on function public.admin_growth_view(text) to authenticated;

-- The CSV exports (board, plan, review): the same rows, logged as an export.
create function public.admin_growth_export(p_kind text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_week int := app.growth_plan_week();
begin
  if not app.growth_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_kind is null or p_kind not in ('board', 'plan', 'review') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('growth.export', null, 'growth_export', p_kind);
  if p_kind = 'board' then
    return jsonb_build_object('ok', true,
      'rows', (select coalesce(jsonb_agg(app.growth_item_json(i) || jsonb_build_object('tier_name', t.name) order by t.sort, i.sort), '[]')
               from app.growth_items i join app.growth_tiers t on t.key = i.tier));
  elsif p_kind = 'plan' then
    return jsonb_build_object('ok', true,
      'rows', (select jsonb_agg(jsonb_build_object('from', b.week_from, 'to', b.week_to, 'foundation', b.foundation, 'lead', b.lead,
                 'status', app.growth_plan_status(b.week_from, b.week_to, v_week),
                 'gates', (select coalesce(jsonb_agg(g.gate order by g.sort), '[]') from app.growth_plan_gates g where g.block = b.key))
               order by b.week_from) from app.growth_plan_blocks b));
  else
    return jsonb_build_object('ok', true,
      'coverage', (select jsonb_agg(jsonb_build_object('feature', c.feature, 'status', c.status, 'note', c.note, 'href', c.href) order by c.sort)
                   from app.growth_coverage c),
      'recommendations', (select jsonb_agg(jsonb_build_object('n', r.sort, 'priority', r.priority, 'title', r.title, 'body', r.body) order by r.sort)
                          from app.growth_recommendations r),
      'cuts', (select jsonb_agg(c.body order by c.sort) from app.growth_cuts c));
  end if;
end $fn$;
revoke all on function public.admin_growth_export(text) from public, anon;
grant execute on function public.admin_growth_export(text) to authenticated;

-- ============================================================ 11. the writes
-- A board item's status (building, planned or deferred: «live» is derived, never set) and its owner
-- (an active admin who sees Growth, or none). Audited with what changed.
create function public.admin_growth_set_item(p_key text, p_status text, p_owner uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r app.growth_items;
begin
  if not app.growth_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into r from app.growth_items i where i.key = p_key for update;
  if r.key is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_status is null or p_status not in ('building', 'planned', 'deferred') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  if p_owner is not null and not app.growth_owner_ok(p_owner) then
    return jsonb_build_object('ok', false, 'error', 'invalid_owner');
  end if;
  if r.status = p_status and r.owner is not distinct from p_owner then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  update app.growth_items set status = p_status, owner = p_owner where key = p_key;
  perform app.admin_log('growth.item_update', null, 'growth_item', p_key, null,
    jsonb_build_object('status', jsonb_build_object('from', r.status, 'to', p_status),
                       'owner', jsonb_build_object('from', r.owner, 'to', p_owner)));
  return jsonb_build_object('ok', true, 'changed', true);
end $fn$;
revoke all on function public.admin_growth_set_item(text, text, uuid) from public, anon;
grant execute on function public.admin_growth_set_item(text, text, uuid) to authenticated;

-- An experiment's status: queued, running or done. Audited with what changed.
create function public.admin_growth_set_experiment(p_key text, p_status text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_from text;
begin
  if not app.growth_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select e.status into v_from from app.growth_experiments e where e.key = p_key for update;
  if v_from is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_status is null or p_status not in ('queued', 'running', 'done') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  if v_from = p_status then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  update app.growth_experiments set status = p_status where key = p_key;
  perform app.admin_log('growth.experiment_update', null, 'growth_experiment', p_key, null,
    jsonb_build_object('status', jsonb_build_object('from', v_from, 'to', p_status)));
  return jsonb_build_object('ok', true, 'changed', true);
end $fn$;
revoke all on function public.admin_growth_set_experiment(text, text) from public, anon;
grant execute on function public.admin_growth_set_experiment(text, text) to authenticated;

-- «Decide»: an open decision's answer and who gave it, stamped now. A later decision replaces it; each
-- is in the audit log with what it replaced.
create function public.admin_growth_decide(p_n int, p_value text, p_by text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r app.growth_decisions;
  v_value text := nullif(btrim(regexp_replace(coalesce(p_value, ''), '[[:cntrl:]]', ' ', 'g')), '');
  v_by text := nullif(btrim(regexp_replace(coalesce(p_by, ''), '[[:cntrl:]]', ' ', 'g')), '');
begin
  if not app.growth_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into r from app.growth_decisions d where d.sort = p_n for update;
  if r.sort is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_value is null or char_length(v_value) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;
  if v_by is null or char_length(v_by) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_by');
  end if;
  update app.growth_decisions set decided_value = v_value, decided_by = v_by, decided_at = now() where sort = p_n;
  perform app.admin_log('growth.decide', null, 'growth_decision', p_n::text, null,
    jsonb_build_object('value', jsonb_build_object('from', r.decided_value, 'to', v_value),
                       'by', jsonb_build_object('from', r.decided_by, 'to', v_by)));
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_growth_decide(int, text, text) from public, anon;
grant execute on function public.admin_growth_decide(int, text, text) to authenticated;

-- ============================================================ 12. the Event catalogue page, finished
-- As 0141 left it, with two additions: each event's «Used by» (the funnel stages that read it, from
-- the registry above), and the time the firewall was computed.
create or replace function public.admin_growth_events() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'analyst', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('growth.events_view');
  return jsonb_build_object('ok', true,
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object('name', e.name, 'version', e.version, 'group', e.event_group, 'pii', e.pii_level,
                                                   'props', to_jsonb(e.allowed_props), 'description', e.description, 'source', e.source,
                                                   'n7', (select count(*) from app.growth_events g
                                                          where g.name = e.name and g.occurred_at > now() - interval '7 days'),
                                                   -- what reads it: the funnel's stages that count it
                                                   'used', (select coalesce(jsonb_agg(f.stage order by f.sort), '[]')
                                                            from app.growth_funnel_stages f where e.name = any (f.events)))
                                order by e.sort), '[]')
      from app.event_catalogue e),
    -- each component with its maximum, and whether anything in the schema can score it (NPS cannot)
    'parts', (select jsonb_agg(jsonb_build_object('key', h.key, 'max', h.max, 'no_source', not h.sourced) order by h.ord)
              from app.health_parts() h),
    'reachable', (select sum(h.max) filter (where h.sourced) from app.health_parts() h),
    -- the organisations in a trial or on a plan, not demos, lowest score first; the ten lowest. Each
    -- score is computed once (the lateral), and a component with no source is no customer's shortfall.
    'health', (
      select coalesce(jsonb_agg(jsonb_build_object('org_id', x.id, 'name', x.name, 'total', x.total,
                                                   -- the components that fall short, as the design lists them
                                                   'missing', (select coalesce(jsonb_agg(a.c->'key' order by a.ord), '[]')
                                                               from jsonb_array_elements(x.h->'components') with ordinality as a(c, ord)
                                                               where a.c->>'missing' is not null and a.c->>'missing' <> 'no_source'))
                                order by x.total, x.name), '[]')
      from (select o.id, o.name, s.h, (s.h->>'total')::int as total
            from app.organizations o
            cross join lateral (select app.health_score(o.id) as h offset 0) s  -- offset 0: never inlined, so computed once
            where app.org_access(o.id) in ('trial', 'active') and not app.is_demo(o.id)
            order by (s.h->>'total')::int, o.name
            limit 10) x),
    'firewall', (select jsonb_agg(jsonb_build_object('rule', f.rule, 'pass', f.pass, 'evidence', f.evidence) order by f.seq)
                 from app.growth_firewall() f),
    -- the moment the rules above were computed: this read, never a stored «passing»
    'checked_at', clock_timestamp());
end $fn$;
revoke all on function public.admin_growth_events() from public, anon;
grant execute on function public.admin_growth_events() to authenticated;
