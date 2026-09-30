-- 0144 — Sentral › Growth G4: Tools & lead magnets, and Deliverability (D-185)
--
-- Phase G4 of docs/implementation/growth-admin.md. Registry rows for what the report names, and
-- counts for what the database records — never the design's sample figures.
--
-- 1. **The magnet registry** (app.growth_magnets): the report's seven magnets in its order, each with
--    its kind, the artefact it gates and its TRUE status. No public tool, template pack or guide
--    exists yet, so six are 'planned'. The newsletter's status is derived, never typed: it is live
--    while its CRM list exists, is public and is not archived. A row keeps a true proper name only
--    («Krav-sjekk»); a descriptive name is a message (admin.growth.g4.magnets.name.<key>), and the
--    newsletter's names its CRM list, read from that list. Completions, consent and trials have
--    no source for a tool that does not exist, so the read returns null for them (the page prints
--    the design's «—»), never 0 % over nothing.
-- 2. **Krav-sjekk rules as versioned data** (app.growth_krav_rules + app.growth_krav_rule_versions):
--    verneombud from 5 employees (aml § 6-1), AMU from 30 and 10–30 on demand (aml § 7-1), the BHT
--    duty by the industry list of forskrift om organisering, ledelse og medvirkning § 13-1
--    (FOR-2011-12-06-1355) and the § 4-3 wording rule. Every version carries the day it was last
--    checked, against what, and whether it is guidance rather than legal advice. A version is
--    never edited: a change is a new version, written by a migration (no admin edit is built,
--    D-185). The immutability trigger follows CLAUDE.md: it compares the columns that carry a
--    version's meaning and refuses any change to them, and a version is deleted only when its rule
--    is already gone.
-- 3. **The mail streams** (app.mail_streams): the two senders the dispatcher is deployed with — the
--    product's no-reply@orgpuls.com (ORGPULS_MAIL_FROM, D-65) and the marketing sender
--    hei@nyheter.orgpuls.com (ORGPULS_MARKETING_FROM, D-101). The function secrets are the
--    dispatcher's; this table is what Sentral reads, and a change of either is a migration here.
-- 4. **The template registry** (app.mail_templates): every mail the product and the CRM send — the
--    nine notice kinds, the invitation test, the ticket reply, the nine trial and cancellation
--    steps, Auth's four mails, the newsletter confirmation, the campaign test, and each CRM
--    template — classified service or marketing and bound to one stream. A marketing mail is only
--    ever on the marketing stream (CHECK). supabase/tests/growth_g4_invariants.sql (row 7) proves
--    every kind the database can queue has a row; tests/unit/growth-g4.test.ts proves the same of
--    the dispatcher's code.
-- 5. **The authentication check** (app.mail_auth_runs + app.mail_auth_checks): SPF, DKIM and DMARC
--    for each stream's domain, looked up in public DNS by the server (lib/admin/mailDomain.ts, the
--    campaign editor's check). A run is claimed first (public.admin_deliverability_claim: one a
--    minute, for everyone, before any lookup goes out, and audited), then recorded against its
--    claim by public.admin_deliverability_check. Both are for the roles that write in the CRM (super_admin
--    and marketing, as app.crm_can_write), with the second factor; the record is audited with its
--    levels. Only the stream's own domain can be recorded. The levels are the server action's: the
--    database cannot repeat a DNS lookup, so what it records is trusted input from a write role,
--    attributed and audited; a write role can call the record directly and state levels DNS did
--    not give, which the audit then shows as that admin's (D-185).
-- 6. Two reads, public.admin_growth_magnets() and public.admin_growth_deliverability(), for super_admin,
--    analyst and marketing with the second factor (the growth section, lib/admin/access.ts), each
--    audited. Every figure is counted from the tables that record it: the outbox and its
--    recipients, ticket and trial mail, the invitation tests, app.mail_events and the CRM's sends.
--    Nothing a respondent wrote, and no address, is read or returned: only counts. A personal
--    notice (invitation, reminders, a link) counts people, and a reminder only those who have not
--    answered, so its 7-day count is withheld below k (app.k_min()), as G1 bands such figures. A
--    withheld notice's messages are then left out of every aggregate too — the stream's volume,
--    its reported, delivered, spam and bounce counts, and so the KPIs — since a total that held
--    them would give the withheld count back as the total less the rows shown. The stream says
--    that it left some out (withheld), never how many.
--    Delivered counts the states only a delivered message reaches (delivered, then a complaint or
--    an unsubscribe); a message still deferred is in flight and not yet reported.
--
-- Every table here has RLS enabled, no policy and no grant: clients reach them only through the
-- two reads, the claim and the one write.

-- ============================================================ 1. the magnets
create table app.growth_magnets (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  -- the report's order
  rank int not null unique check (rank between 1 and 99),
  -- a true proper name, as the report gives it; null where the name is descriptive, which is then a
  -- message (admin.growth.g4.magnets.name.<key>). What it does is a message too (….item.<key>)
  name text check (char_length(name) between 2 and 80),
  kind text not null check (kind in ('tool', 'template', 'report', 'newsletter')),
  -- the take-away behind consent and double opt-in; 'none' for the newsletter, whose signup is the consent
  gated text not null check (gated in ('pdf', 'pdf_templates', 'templates', 'pdf_ics', 'none')),
  -- a typed status for what nothing in the schema can show; null where the status is derived
  status text check (status in ('planned', 'building', 'live')),
  -- the CRM list a newsletter is: live while that list exists, is public and is not archived
  list_key text check (list_key ~ '^[a-z0-9-]{2,40}$'),
  constraint growth_magnets_status_derived check ((status is null) = (list_key is not null))
);
comment on table app.growth_magnets is
  'The report''s lead magnets in its order (0144, D-185). status is the true state; a newsletter''s is derived from its CRM list.';
alter table app.growth_magnets enable row level security;
revoke all on app.growth_magnets from public, anon, authenticated, service_role;

insert into app.growth_magnets (key, rank, name, kind, gated, status, list_key) values
  ('krav_sjekk', 1, 'Krav-sjekk', 'tool', 'pdf_templates', 'planned', null),
  ('risiko_sjekk', 2, 'Psykososial risiko-sjekk', 'tool', 'pdf_templates', 'planned', null),
  ('dokumentasjonspakke', 3, '§ 4-3 dokumentasjonspakke', 'template', 'templates', 'planned', null),
  ('sykefravaer', 4, 'Sykefraværskalkulator', 'tool', 'pdf', 'planned', null),
  ('arshjul', 5, 'Årshjul for psykososialt arbeidsmiljø', 'template', 'pdf_ics', 'planned', null),
  ('bransjeguider', 6, null, 'report', 'pdf', 'planned', null),
  ('nyhetsbrev', 7, null, 'newsletter', 'none', null, 'nyhetsbrev');

-- ============================================================ 2. the Krav-sjekk rules
create table app.growth_krav_rules (
  key text primary key check (key in ('verneombud', 'amu', 'bht', 'wording_4_3')),
  sort int not null unique check (sort > 0)
);
comment on table app.growth_krav_rules is 'The Krav-sjekk rules (0144, D-185); their content is in app.growth_krav_rule_versions.';
alter table app.growth_krav_rules enable row level security;
revoke all on app.growth_krav_rules from public, anon, authenticated, service_role;

create table app.growth_krav_rule_versions (
  rule_key text not null references app.growth_krav_rules (key) on delete cascade,
  version int not null check (version >= 1),
  -- the headcount the duty starts at (verneombud 5, AMU 30)
  threshold int check (threshold between 1 and 1000),
  -- the headcount from which either party may demand it (AMU 10)
  on_demand_from int check (on_demand_from between 1 and 1000),
  -- the provision the rule follows
  reference text not null check (char_length(reference) between 3 and 120),
  -- a wording rule: the phrase to use, and the one never to use
  say text check (char_length(say) between 2 and 120),
  never_say text check (char_length(never_say) between 2 and 120),
  -- «sist kontrollert»: the day the rule was last read against its source, and the source
  checked_on date not null,
  checked_against text not null check (char_length(checked_against) between 3 and 120),
  -- shown to a visitor as guidance, not legal advice
  guidance_only boolean not null,
  primary key (rule_key, version),
  constraint growth_krav_threshold check (rule_key not in ('verneombud', 'amu') or threshold is not null),
  -- the AMU rule is two figures, both required: never a «0–30 on demand» from a missing one
  constraint growth_krav_amu check (rule_key <> 'amu' or on_demand_from is not null),
  constraint growth_krav_on_demand check (on_demand_from is null or (threshold is not null and on_demand_from < threshold)),
  constraint growth_krav_wording check ((rule_key = 'wording_4_3') = (say is not null and never_say is not null))
);
comment on table app.growth_krav_rule_versions is
  'Versions of each Krav-sjekk rule (0144, D-185). Never edited: a change is a new version. The latest is the rule.';
alter table app.growth_krav_rule_versions enable row level security;
revoke all on app.growth_krav_rule_versions from public, anon, authenticated, service_role;

-- nobody may change a version's content; a version goes only with its rule (CLAUDE.md): the rule
-- compares the columns that carry meaning, so an update that changes none of them passes
create function app.growth_krav_version_guard() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' then
    if (new.rule_key, new.version, new.threshold, new.on_demand_from, new.reference, new.say, new.never_say,
        new.checked_on, new.checked_against, new.guidance_only)
       is distinct from
       (old.rule_key, old.version, old.threshold, old.on_demand_from, old.reference, old.say, old.never_say,
        old.checked_on, old.checked_against, old.guidance_only) then
      raise exception 'a Krav-sjekk rule version is never edited; add a new version' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if exists (select 1 from app.growth_krav_rules r where r.key = old.rule_key) then
    raise exception 'a Krav-sjekk rule version is deleted only with its rule' using errcode = 'P0001';
  end if;
  return old;
end $fn$;
revoke all on function app.growth_krav_version_guard() from public, anon, authenticated;
create trigger growth_krav_version_guard before update or delete on app.growth_krav_rule_versions
  for each row execute function app.growth_krav_version_guard();

insert into app.growth_krav_rules (key, sort) values ('verneombud', 1), ('amu', 2), ('bht', 3), ('wording_4_3', 4);
-- read against Lovdata on 30 September 2026 (D-185): § 6-1 lets a business under 5 employees agree
-- otherwise in writing; § 7-1 requires an AMU from 30 and on demand from 10 to 30; the BHT duty is the
-- industry list of FOR-2011-12-06-1355 § 13-1, which replaced the 2009 regulation the design cites
insert into app.growth_krav_rule_versions (rule_key, version, threshold, on_demand_from, reference, say, never_say, checked_on, checked_against, guidance_only) values
  ('verneombud', 1, 5, null, 'arbeidsmiljøloven § 6-1', null, null, '2026-09-30', 'Lovdata', true),
  ('amu', 1, 30, 10, 'arbeidsmiljøloven § 7-1', null, null, '2026-09-30', 'Lovdata', true),
  ('bht', 1, null, null, 'forskrift 2011-12-06-1355 § 13-1', null, null, '2026-09-30', 'Lovdata', true),
  ('wording_4_3', 1, null, null, 'arbeidsmiljøloven § 4-3', 'Loven er presisert', 'nye krav', '2026-09-30', 'Lovdata', true);

-- ============================================================ 3. the streams
create table app.mail_streams (
  key text primary key check (key in ('transactional', 'marketing')),
  -- the address the dispatcher sends the stream from; its domain is the one authenticated
  sender text not null unique check (sender = lower(sender) and sender ~ '^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  sort int not null unique check (sort > 0)
);
comment on table app.mail_streams is
  'The dispatcher''s two senders (0144, D-185), as its function secrets set them: ORGPULS_MAIL_FROM and ORGPULS_MARKETING_FROM.';
alter table app.mail_streams enable row level security;
revoke all on app.mail_streams from public, anon, authenticated, service_role;

insert into app.mail_streams (key, sender, sort) values
  ('transactional', 'no-reply@orgpuls.com', 1),
  ('marketing', 'hei@nyheter.orgpuls.com', 2);

create function app.mail_stream_domain(p_sender text) returns text
  language sql immutable set search_path = ''
as $fn$ select lower(split_part(p_sender, '@', 2)) $fn$;
revoke all on function app.mail_stream_domain(text) from public, anon, authenticated;

-- ============================================================ 4. the template registry
create table app.mail_templates (
  key text primary key check (key ~ '^[a-z]+\.[a-z0-9_.-]{2,60}$'),
  -- what sends it: the outbox's notices, a ticket reply, the trial's mail, Auth's hook, or the CRM
  source text not null check (source in ('notice', 'ticket', 'lifecycle', 'auth', 'crm')),
  -- the dispatcher's own name for it: an outbox kind, a lifecycle step, an Auth action, a CRM send kind or template
  ref text not null check (char_length(ref) between 2 and 60),
  classification text not null check (classification in ('service', 'marketing')),
  stream text not null references app.mail_streams (key),
  locales text[] not null check (cardinality(locales) between 1 and 7 and locales <@ array['no', 'en', 'pl', 'uk', 'lt', 'sv', 'da']),
  version int not null default 1 check (version >= 1),
  sort int not null unique check (sort > 0),
  unique (source, ref),
  -- marketing is never sent on the product's stream (D-101)
  constraint mail_templates_marketing_stream check (classification <> 'marketing' or stream = 'marketing')
);
comment on table app.mail_templates is
  'Every mail the product and the CRM send, classified service or marketing and bound to one stream (0144, D-185).';
alter table app.mail_templates enable row level security;
revoke all on app.mail_templates from public, anon, authenticated, service_role;

insert into app.mail_templates (key, source, ref, classification, stream, locales, sort) values
  -- the outbox's notices (0032, outbox_kind); a personal one speaks the survey's languages (D-133)
  ('notice.forvarsel', 'notice', 'forvarsel', 'service', 'transactional', '{no,en}', 10),
  ('notice.invitasjon', 'notice', 'invitasjon', 'service', 'transactional', '{no,en,pl,uk,lt,sv,da}', 11),
  ('notice.paminnelse', 'notice', 'paminnelse', 'service', 'transactional', '{no,en,pl,uk,lt,sv,da}', 12),
  ('notice.siste_paminnelse', 'notice', 'siste_paminnelse', 'service', 'transactional', '{no,en,pl,uk,lt,sv,da}', 13),
  ('notice.lenke', 'notice', 'lenke', 'service', 'transactional', '{no,en,pl,uk,lt,sv,da}', 14),
  ('notice.resultat', 'notice', 'resultat', 'service', 'transactional', '{no,en}', 15),
  ('notice.tiltak_forfalt', 'notice', 'tiltak_forfalt', 'service', 'transactional', '{no,en}', 16),
  ('notice.svarprosent', 'notice', 'svarprosent', 'service', 'transactional', '{no,en}', 17),
  ('notice.evaluering', 'notice', 'evaluering', 'service', 'transactional', '{no,en}', 18),
  -- «Send test til meg» (0127): the invitation, to the daglig leder's own address
  ('notice.test', 'notice', 'test', 'service', 'transactional', '{no,en}', 19),
  -- a reply to a support case (0051, 0135), rendered in bokmål
  ('ticket.reply', 'ticket', 'reply', 'service', 'transactional', '{no}', 30),
  -- the trial's and a cancellation's mail (0060, 0064; lifecycle_mail.step)
  ('trial.welcome', 'lifecycle', 'welcome', 'service', 'transactional', '{no,en}', 40),
  ('trial.setup_help', 'lifecycle', 'setup_help', 'service', 'transactional', '{no,en}', 41),
  ('trial.first_sent', 'lifecycle', 'first_sent', 'service', 'transactional', '{no,en}', 42),
  ('trial.results_ready', 'lifecycle', 'results_ready', 'service', 'transactional', '{no,en}', 43),
  ('trial.trial_ending', 'lifecycle', 'trial_ending', 'service', 'transactional', '{no,en}', 44),
  ('trial.trial_ended', 'lifecycle', 'trial_ended', 'service', 'transactional', '{no,en}', 45),
  ('trial.read_only_soon', 'lifecycle', 'read_only_soon', 'service', 'transactional', '{no,en}', 46),
  ('trial.cancelled', 'lifecycle', 'cancelled', 'service', 'transactional', '{no,en}', 47),
  ('trial.deletion_soon', 'lifecycle', 'deletion_soon', 'service', 'transactional', '{no,en}', 48),
  -- Auth's mail, sent by its send-email hook (orgpuls-auth-mail, D-65)
  ('auth.recovery', 'auth', 'recovery', 'service', 'transactional', '{no,en}', 60),
  ('auth.signup', 'auth', 'signup', 'service', 'transactional', '{no,en}', 61),
  ('auth.magiclink', 'auth', 'magiclink', 'service', 'transactional', '{no,en}', 62),
  ('auth.invite', 'auth', 'invite', 'service', 'transactional', '{no,en}', 63),
  -- the CRM's sends (0055, crm_sends.kind): the double opt-in asks for consent and sells nothing
  ('crm.optin', 'crm', 'optin', 'service', 'marketing', '{no,en}', 80),
  ('crm.test', 'crm', 'test', 'marketing', 'marketing', '{no,en}', 81),
  -- a campaign written from a blank page
  ('crm.campaign', 'crm', 'campaign', 'marketing', 'marketing', '{no,en}', 82);

-- each CRM template (0056, 0113) a campaign may start from; their texts are bokmål
insert into app.mail_templates (key, source, ref, classification, stream, locales, sort)
select 'crm.' || t.key, 'crm', 'template:' || t.key, 'marketing', 'marketing', '{no}', 100 + row_number() over (order by t.sort, t.key)
from app.crm_templates t;

-- ============================================================ 5. the authentication check
create type app.mail_auth_level as enum ('pass', 'warn', 'fail', 'unknown');

-- a run of «Run authentication check», claimed before any lookup goes out: one a minute, for everyone
create table app.mail_auth_runs (
  id bigint generated always as identity primary key,
  -- who claimed it; only they may record it
  admin_id uuid references auth.users (id) on delete set null,
  claimed_at timestamptz not null default now(),
  -- set when its results were recorded; a run is recorded once
  recorded_at timestamptz,
  check (recorded_at is null or recorded_at >= claimed_at)
);
create index mail_auth_runs_claimed_at on app.mail_auth_runs (claimed_at desc);
comment on table app.mail_auth_runs is
  'Each «Run authentication check» (0144, D-185): claimed before its DNS lookups, so one a minute goes out; recorded once.';
alter table app.mail_auth_runs enable row level security;
revoke all on app.mail_auth_runs from public, anon, authenticated, service_role;

create table app.mail_auth_checks (
  id bigint generated always as identity primary key,
  run_id bigint not null references app.mail_auth_runs (id) on delete cascade,
  stream text not null references app.mail_streams (key) on delete cascade,
  -- the domain looked up: the stream's sender's, at the time
  domain text not null check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  checked_at timestamptz not null default now(),
  spf app.mail_auth_level not null,
  dkim app.mail_auth_level not null,
  dmarc app.mail_auth_level not null,
  -- the DMARC record's p= (none, quarantine, reject), when there is one
  dmarc_policy text check (dmarc_policy in ('none', 'quarantine', 'reject')),
  unique (run_id, stream)
);
create index mail_auth_checks_stream_at on app.mail_auth_checks (stream, checked_at desc);
comment on table app.mail_auth_checks is
  'SPF, DKIM and DMARC of each stream''s domain as the server''s lookup in public DNS found them (0144, D-185); written by admin_deliverability_check.';
alter table app.mail_auth_checks enable row level security;
revoke all on app.mail_auth_checks from public, anon, authenticated, service_role;

-- ============================================================ 6. the reads, the claim and the write
/*
 * Double opt-in, as it stands: of the contacts sent a confirmation mail in 90 days (a crm_sends
 * 'optin' row the dispatcher marked sent; a request held, failed or skipped sent nothing), how many
 * confirmed after it. A contact is confirmed when its token is spent and its consent dates from
 * after its first such mail; one still holding a token has not confirmed (it may yet, within seven
 * days, or it expired). With a list key, only the contacts on that list. Null when no
 * confirmation was sent: never a rate over nothing.
 */
create function app.growth_doi(p_list text default null) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  with mailed as (
    select s.contact_id, min(s.sent_at) as first_sent
    from app.crm_sends s
    where s.kind = 'optin' and s.status = 'sent' and s.sent_at > now() - interval '90 days' and s.contact_id is not null
    group by s.contact_id)
  select jsonb_build_object('sent', count(*),
                            'confirmed', count(*) filter (where c.optin_hash is null and c.consent_at >= x.first_sent and c.basis = 'consent'))
  from mailed x
  join app.crm_contacts c on c.id = x.contact_id
  where c.product_id = 'orgpuls'
    and (p_list is null or exists (select 1 from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
                                   where m.contact_id = c.id and l.product_id = 'orgpuls' and l.key = p_list))
$fn$;
revoke all on function app.growth_doi(text) from public, anon, authenticated;

create function public.admin_growth_magnets() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'analyst', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('growth.magnets_view');
  return jsonb_build_object('ok', true,
    'magnets', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'key', m.key, 'rank', m.rank, 'name', m.name, 'kind', m.kind, 'gated', m.gated,
               -- the newsletter is named after its CRM list, as the list is named
               'list_name', l.name_no,
               'status', coalesce(m.status, case when l.id is not null and l.public and l.archived_at is null then 'live' else 'planned' end),
               'derived', m.list_key is not null,
               -- a newsletter's completions are its subscribers; a tool records nothing yet (no tool exists)
               'completions', case when m.list_key is not null and l.id is not null
                                   then (select count(*) from app.crm_list_members x where x.list_id = l.id and x.status = 'subscribed') end,
               'doi', case when m.list_key is not null then app.growth_doi(m.list_key) end)
             order by m.rank), '[]')
      from app.growth_magnets m
      left join app.crm_lists l on l.product_id = 'orgpuls' and l.key = m.list_key),
    'doi', app.growth_doi(),
    'rules', (
      select jsonb_agg(jsonb_build_object('key', r.key, 'version', v.version, 'threshold', v.threshold, 'on_demand_from', v.on_demand_from,
                                          'reference', v.reference, 'say', v.say, 'never_say', v.never_say,
                                          'checked_on', v.checked_on, 'checked_against', v.checked_against, 'guidance', v.guidance_only)
             order by r.sort)
      from app.growth_krav_rules r
      cross join lateral (select * from app.growth_krav_rule_versions x where x.rule_key = r.key order by x.version desc limit 1) v),
    -- every change to any rule is a new version of the rule set
    'ruleset_version', (select count(*) from app.growth_krav_rule_versions) - (select count(*) from app.growth_krav_rules) + 1,
    'marketing_domain', (select app.mail_stream_domain(s.sender) from app.mail_streams s where s.key = 'marketing'));
end $fn$;
revoke all on function public.admin_growth_magnets() from public, anon;
grant execute on function public.admin_growth_magnets() to authenticated;

/*
 * Every mail sent in the last seven days, one row per message on e-mail, with the stream, the
 * registry key and its delivery state as the provider last reported it. An SMS is not mail and is
 * left out. Auth's mail is sent by its hook and recorded nowhere, so it is not here either; the
 * page says so on its rows.
 */
create function app.mail_sent_7d() returns table (stream text, template text, delivery app.mail_delivery)
  language sql stable security definer set search_path = ''
as $fn$
  -- a personal notice: one person, one message
  select 'transactional', 'notice.' || o.kind::text, o.delivery
  from app.outbox o
  where o.sent_at > now() - interval '7 days' and coalesce(o.channel, 'email') = 'email'
    and not exists (select 1 from app.outbox_recipients r where r.outbox_id = o.id)
  union all
  -- a notice to a role: a message per person (0134)
  select 'transactional', 'notice.' || o.kind::text, r.delivery
  from app.outbox_recipients r join app.outbox o on o.id = r.outbox_id
  where r.sent_at > now() - interval '7 days'
  union all
  -- «Send test til meg»: the provider's id is not kept, so no delivery state, ever
  select 'transactional', 'notice.test', null::app.mail_delivery
  from app.send_tests t
  where t.sent_at > now() - interval '7 days'
  union all
  select 'transactional', 'ticket.reply', m.delivery
  from app.ticket_mail m
  where m.sent_at > now() - interval '7 days'
  union all
  -- the trial's mail keeps its provider id; its events are in mail_events, matched by that id
  select 'transactional', 'trial.' || l.step,
         (select e.event::app.mail_delivery from app.mail_events e
          where e.message_id = btrim(l.provider_id, '<> ') order by e.at desc limit 1)
  from app.lifecycle_mail l
  where l.sent_at > now() - interval '7 days'
  union all
  select 'marketing',
         case when s.kind = 'campaign' then coalesce('crm.' || c.template_key, 'crm.campaign') else 'crm.' || s.kind end,
         s.delivery
  from app.crm_sends s left join app.crm_campaigns c on c.id = s.campaign_id
  where s.sent_at > now() - interval '7 days'
$fn$;
revoke all on function app.mail_sent_7d() from public, anon, authenticated;

/*
 * A template's 7-day count as the growth roles may see it. A personal notice counts people — an
 * invitation each, a link each, and a reminder only for those who have not answered — so below k
 * (app.k_min()) its count is withheld (null), as G1 bands recipient and response figures. Zero and
 * any count of k or more are shown; a notice to a role, trial or CRM mail counts no respondent.
 */
create function app.mail_template_count(p_key text, p_n bigint) returns bigint
  language sql immutable set search_path = ''
as $fn$
  select case when p_key in ('notice.invitasjon', 'notice.paminnelse', 'notice.siste_paminnelse', 'notice.lenke')
                   and p_n between 1 and app.k_min() - 1 then null
              else p_n end
$fn$;
revoke all on function app.mail_template_count(text, bigint) from public, anon, authenticated;

create function public.admin_growth_deliverability() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'analyst', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('growth.deliverability_view');
  return (
    with sent as materialized (select * from app.mail_sent_7d()),
    -- each template's count as the growth roles may see it: null where a personal notice is below k
    counts as materialized (
      select t.key, t.stream, app.mail_template_count(t.key, n.n) as shown
      from app.mail_templates t
      cross join lateral (select count(*) as n from sent x where x.template = t.key) n),
    -- what every aggregate is counted over: every message but a withheld notice's. A stream total
    -- that held them would give their count back by subtraction (the total less the rows shown),
    -- so they are left out of every figure on the page, not only their own row
    shown as materialized (
      select x.* from sent x
      where not exists (select 1 from counts c where c.key = x.template and c.shown is null))
    select jsonb_build_object('ok', true,
      'streams', (
        select jsonb_agg(jsonb_build_object(
                 'key', s.key, 'sender', s.sender, 'domain', app.mail_stream_domain(s.sender),
                 -- a personal notice on this stream is below k, and its messages are in none of the figures
                 'withheld', exists (select 1 from counts c join app.mail_templates t on t.key = c.key
                                     where c.stream = s.key and c.shown is null and t.source <> 'auth'),
                 -- messages sent, and how many of them the provider has reported on: every rate is
                 -- over the reported, never over a message nothing reported on. A message still
                 -- deferred is in flight, not reported, the same as one with no report yet
                 'sent', (select count(*) from shown x where x.stream = s.key),
                 'reported', (select count(*) from shown x where x.stream = s.key and x.delivery is not null and x.delivery <> 'deferred'),
                 -- the invitation tests, which keep no provider id and so are never reported
                 'tests', (select count(*) from shown x where x.stream = s.key and x.template = 'notice.test'),
                 -- delivered: the states only a delivered message reaches, so a complaint or an
                 -- unsubscribe the provider reports after delivery is still a delivered message
                 'delivered', (select count(*) from shown x where x.stream = s.key and x.delivery in ('delivered', 'spam', 'unsubscribed')),
                 'spam', (select count(*) from shown x where x.stream = s.key and x.delivery = 'spam'),
                 'bounced', (select count(*) from shown x where x.stream = s.key and x.delivery in ('hard_bounce', 'soft_bounce', 'invalid', 'blocked')),
                 'hard_bounces', (select count(*) from shown x where x.stream = s.key and x.delivery = 'hard_bounce'),
                 -- when the provider last reported on this stream's e-mail: an event matched to an
                 -- e-mail notice (or one person's message of one), a ticket reply or trial mail; an
                 -- SMS report, and an event matched to nothing, are not this stream's
                 'last_event_at', case s.key
                    when 'transactional' then (
                      select max(e.received_at) from app.mail_events e
                      where exists (select 1 from app.outbox o where o.id = e.outbox_id and coalesce(o.channel, 'email') = 'email')
                         or e.ticket_mail_id is not null
                         or exists (select 1 from app.lifecycle_mail l where btrim(l.provider_id, '<> ') = e.message_id))
                    else (select max(c.delivery_at) from app.crm_sends c) end,
                 'check', (select jsonb_build_object('checked_at', k.checked_at, 'domain', k.domain, 'spf', k.spf, 'dkim', k.dkim,
                                                     'dmarc', k.dmarc, 'dmarc_policy', k.dmarc_policy)
                           from app.mail_auth_checks k where k.stream = s.key order by k.checked_at desc, k.id desc limit 1))
               order by s.sort)
        from app.mail_streams s),
      'templates', (
        select jsonb_agg(jsonb_build_object('key', t.key, 'source', t.source, 'ref', t.ref, 'classification', t.classification,
                                            'stream', t.stream, 'locales', to_jsonb(t.locales), 'version', t.version,
                                            -- Auth's mail is recorded nowhere: no count rather than a 0
                                            'sent', case when t.source = 'auth' then null else c.shown end,
                                            -- a personal notice below k: counted, and withheld
                                            'withheld', t.source <> 'auth' and c.shown is null)
               order by t.sort)
        from app.mail_templates t
        join counts c on c.key = t.key),
      -- the campaign mail's daily cap (0111), which warms a new sending domain
      'daily_cap', (select c.daily_cap from app.crm_settings c where c.id),
      -- below this a personal notice's count is withheld
      'k', app.k_min())
    from (select 1) one);
end $fn$;
revoke all on function public.admin_growth_deliverability() from public, anon;
grant execute on function public.admin_growth_deliverability() to authenticated;

/*
 * Claims a run of «Run authentication check» before the server sends any lookup to DNS: for the
 * roles that write in the CRM (super_admin and marketing, as app.crm_can_write) with the second
 * factor, and one run a minute for everyone, serialised by an advisory lock so two presses cannot
 * both pass. A claimed run counts against the minute whether or not it is recorded. Returns the
 * run's id, which the record names.
 */
create function public.admin_deliverability_claim() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id bigint;
begin
  if not app.is_platform_admin(array['super_admin', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform pg_advisory_xact_lock(hashtext('app.mail_auth_runs'));
  if exists (select 1 from app.mail_auth_runs r where r.claimed_at > now() - interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'too_soon');
  end if;
  insert into app.mail_auth_runs (admin_id) values (auth.uid()) returning id into v_id;
  -- audited when claimed, not only when recorded: a claim sends DNS its lookups whether or not its
  -- record follows, and the run's own admin_id is cleared with the account
  perform app.admin_log('deliverability.auth_claim', null, 'mail_auth_runs', v_id::text);
  return jsonb_build_object('ok', true, 'run', v_id);
end $fn$;
revoke all on function public.admin_deliverability_claim() from public, anon;
grant execute on function public.admin_deliverability_claim() to authenticated;

/*
 * Records what the server's lookup in public DNS found for each stream's domain, against the run
 * the same admin claimed in the last two minutes and has not recorded. It checks the role again,
 * that each result is for its stream's own domain, each stream once, and each level known, then
 * records it and audits it with the levels. The database cannot repeat the lookup: the levels are
 * the server action's (lib/admin/deliverabilityActions.ts), trusted input from a write role,
 * attributed and audited (D-185).
 */
create function public.admin_deliverability_check(p_run bigint, p_results jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_r jsonb;
  v_n int := 0;
begin
  if not app.is_platform_admin(array['super_admin', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) not between 1 and 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- the run: this admin's, claimed in the last two minutes, not yet recorded
  perform 1 from app.mail_auth_runs r
  where r.id = p_run and r.admin_id = auth.uid() and r.recorded_at is null and r.claimed_at > now() - interval '2 minutes'
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for v_r in select * from jsonb_array_elements(p_results) loop
    if not exists (select 1 from app.mail_streams s where s.key = v_r->>'stream' and app.mail_stream_domain(s.sender) = v_r->>'domain')
       or coalesce(v_r->>'spf', '') not in ('pass', 'warn', 'fail', 'unknown')
       or coalesce(v_r->>'dkim', '') not in ('pass', 'warn', 'fail', 'unknown')
       or coalesce(v_r->>'dmarc', '') not in ('pass', 'warn', 'fail', 'unknown')
       or coalesce(v_r->>'dmarc_policy', 'none') not in ('none', 'quarantine', 'reject') then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
  end loop;
  if (select count(distinct x->>'stream') from jsonb_array_elements(p_results) x) <> jsonb_array_length(p_results) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for v_r in select * from jsonb_array_elements(p_results) loop
    insert into app.mail_auth_checks (run_id, stream, domain, spf, dkim, dmarc, dmarc_policy)
    values (p_run, v_r->>'stream', v_r->>'domain', (v_r->>'spf')::app.mail_auth_level, (v_r->>'dkim')::app.mail_auth_level,
            (v_r->>'dmarc')::app.mail_auth_level, v_r->>'dmarc_policy');
    v_n := v_n + 1;
  end loop;
  update app.mail_auth_runs set recorded_at = now() where id = p_run;
  perform app.admin_log('deliverability.auth_check', null, 'mail_streams', null, null,
    jsonb_build_object('run', p_run,
                       'results', (select jsonb_agg(jsonb_build_object('stream', x->>'stream', 'spf', x->>'spf', 'dkim', x->>'dkim',
                                                                        'dmarc', x->>'dmarc', 'dmarc_policy', x->>'dmarc_policy'))
                                   from jsonb_array_elements(p_results) x)));
  return jsonb_build_object('ok', true, 'recorded', v_n);
end $fn$;
revoke all on function public.admin_deliverability_check(bigint, jsonb) from public, anon;
grant execute on function public.admin_deliverability_check(bigint, jsonb) to authenticated;
