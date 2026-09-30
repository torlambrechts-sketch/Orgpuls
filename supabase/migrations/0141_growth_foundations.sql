-- 0141_growth_foundations.sql — Sentral › Growth G1: the event catalogue and its stream, the
-- anonymity firewall, the consent ledger and health score v1 (D-182, docs/implementation/growth-admin.md).
--
-- Database first. One public function, admin_growth_events() (section 5), for the one page every
-- block of which is G1's: Sentral › Growth › Event catalogue. The Consent page is G3's; nothing else
-- here is reachable by a client role.
--
-- 1. **Events are org-level, and only the product writes them.** app.event_catalogue names each event
--    with its PII level and the props it may carry; app.growth_events is the stream. A trigger on the
--    stream refuses a prop the catalogue does not allow, a value that is not a short keyword (never a
--    number, never an id; a band only from its fixed vocabulary), and a person on an event whose PII
--    level is not 'user'. The events are
--    emitted by AFTER triggers on the product's tables and by app.growth_tick() in the hourly job,
--    which derives what needs counts: a round's recipients when it opened, and the threshold.
--      * **Nothing is attached to responses, answers, extra_answers or response_comments.** The one
--        survey event that depends on answers, survey.threshold_reached, is derived in the hourly tick
--        from counts, as a band, with the hour truncated.
--      * Recipient counts are bands. No band says how many when there are fewer than five.
--      * An event that carries no organisation (pii_level 'none') carries no key either, and its hour
--        is truncated: nothing on it leads back to the row, and so the person, it came from. The
--        catalogue marks such events hour_only (employees.imported and the threshold too), and the
--        stream refuses a finer time on one. occurred_at is the stream's only time and its id is
--        random: no insertion time and no sequence that would order an event among the rows it
--        came from.
--      * A respondent, an invitation, an employee and the employees' eNPS are never events.
--      * Demo organisations (app.is_demo) emit nothing.
--      * An event goes with its organisation and its account (cascade), as retention requires.
--      * Events that have a timestamp in the product are backfilled with source 'backfill'.
-- 2. **The anonymity firewall** (app.growth_firewall()) computes each rule live from the catalog and
--    the data: no foreign key in either direction between a growth, CRM, event or consent table and a
--    respondent table; no catalogue prop that could carry a respondent; no privilege on an answer table
--    (table or column) for any role but a superuser, the owner and the platform's own; no contact who
--    is an employee, active or not, and not an account; no event whose key or props equal a
--    respondent's id, an invitation's token hash or an employee's address; nothing on the tables a
--    submission writes (the answer tables and invitations) but their own guards — no other trigger, no
--    rule, no policy, no constraint, default or index calling a function; the growth tables closed to
--    clients. Its evidence is structured (counts and object names), which the page words through
--    next-intl.
-- 3. **The consent ledger** (app.consent_records) is append-only. It is written by deferred triggers
--    on crm_contacts, crm_list_members and crm_suppression, so no path that changes consent — the ones
--    that exist and any added later — can change it without a record. Each path names its method
--    (app.consent_via, a transaction-local setting); crm_contacts keeps the derived latest state the
--    dispatcher reads. Purposes are app.consent_purposes: the contact-level basis ('marketing') and one
--    per list the CRM sends to.
-- 4. **Health score v1** (app.health_score(org)): the report's six components, each from real data,
--    with what is missing. Customer NPS has no source in the schema, so it scores 0, says 'no_source',
--    and the page says the reachable maximum is 90 rather than counting it against any customer.

-- ============================================================ 1. the event catalogue
create type app.growth_pii as enum ('none', 'org', 'user');

-- A prop name that could carry a respondent, a person, an id or an exact count. A band is an
-- aggregate, so response_rate_band and employee_count_band are allowed; recipient_count is not.
create function app.growth_prop_forbidden(p text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select coalesce(p, '') !~ '^[a-z][a-z_]{0,39}$'
      or (p ~ '(respondent|token|response|invitation|answer|employee|email|phone|comment|address|(^|_)name($|_)|(^|_)ids?$|(^|_)counts?$|(^|_)(number|total)$)'
          and p !~ '_band$')
$fn$;
revoke all on function app.growth_prop_forbidden(text) from public, anon, authenticated;

create function app.growth_props_ok(p text[]) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select p is not null and cardinality(p) <= 10
     and not exists (select 1 from unnest(p) x where app.growth_prop_forbidden(x))
$fn$;
revoke all on function app.growth_props_ok(text[]) from public, anon, authenticated;

create table app.event_catalogue (
  name text primary key check (name ~ '^[a-z_]+\.[a-z_]+$' and char_length(name) <= 60),
  version int not null default 1 check (version >= 1),
  event_group text not null check (event_group in ('signup', 'setup', 'survey', 'value', 'trial', 'billing', 'support', 'consent', 'lead')),
  -- the catalogue's reading order (the report's, group by group)
  sort int not null unique check (sort > 0),
  pii_level app.growth_pii not null,
  -- the event is stamped with the hour and nothing finer: an exact time would join it to the row it
  -- came from (a consent record, a demo request, the employees one statement wrote). Every event that
  -- carries no organisation is hour_only.
  hour_only boolean not null default false,
  allowed_props text[] not null default '{}',
  source text not null check (char_length(source) between 3 and 200),
  description text not null check (char_length(description) between 3 and 300),
  created_at timestamptz not null default now(),
  constraint event_catalogue_props_ok check (app.growth_props_ok(allowed_props)),
  constraint event_catalogue_none_hour_only check (pii_level <> 'none' or hour_only)
);
comment on table app.event_catalogue is
  'The events Orgpuls emits (0141, D-182): one PII level and a fixed set of props per event. Read by the stream''s check and by the firewall.';
alter table app.event_catalogue enable row level security;
revoke all on app.event_catalogue from public, anon, authenticated;

insert into app.event_catalogue (sort, name, event_group, pii_level, hour_only, allowed_props, source, description) values
  (10, 'user.signed_up', 'signup', 'user', false, '{role}', 'app.memberships insert: an account''s first membership', 'An account joined an organisation, with its role.'),
  (20, 'org.created', 'signup', 'org', false, '{}', 'app.organizations insert', 'An organisation signed up.'),
  (30, 'org.brreg_verified', 'signup', 'org', false, '{}', 'app.organizations registry_fetched_at set', 'The organisation''s entry in Enhetsregisteret was fetched.'),
  (40, 'employees.imported', 'setup', 'org', true, '{employee_count_band}', 'app.employees insert, one event per statement and organisation', 'Employees were added to the list; how many, as a band.'),
  (50, 'survey.created', 'survey', 'org', false, '{measurement_kind}', 'app.measurements insert', 'A measurement was created: a baseline, a pulse or a follow-up.'),
  (60, 'survey.scheduled', 'survey', 'org', false, '{measurement_kind}', 'app.rounds planned with an opening date', 'A round was given its opening date.'),
  (70, 'survey.sent', 'survey', 'org', false, '{recipient_count_band,measurement_kind}', 'app.growth_tick(), hourly: a round that opened, its invitations counted', 'A round opened. Recipients as a band, never a count below five.'),
  (80, 'survey.threshold_reached', 'survey', 'org', true, '{response_rate_band}', 'app.growth_tick(), hourly, from counts', 'A round reached the anonymity threshold. The response rate as a band, the hour truncated.'),
  (90, 'results.viewed', 'value', 'user', false, '{view,role}', 'app.product_events insert', 'A leader opened results, the report, comments or measures (once a day per page).'),
  (100, 'action_item.created', 'value', 'org', false, '{measure_kind}', 'app.measures insert', 'A measure (tiltak) was created.'),
  (110, 'stakeholder.invited', 'value', 'org', false, '{role}', 'app.member_invites insert', 'A colleague was invited into the organisation with a role.'),
  (120, 'trial.extended', 'trial', 'org', false, '{}', 'app.billing trial_ends_at moved later before a plan is confirmed: the customer''s extend_trial or Sentral''s admin_extend_trial', 'The trial was extended.'),
  (130, 'trial.expiring', 'trial', 'org', false, '{}', 'app.growth_tick(): three days before trial_ends_at', 'The trial ends in three days and no plan is confirmed.'),
  (140, 'trial.expired', 'trial', 'org', false, '{}', 'app.growth_tick(): trial_ends_at passed', 'The trial ended without a confirmed plan.'),
  (150, 'subscription.started', 'billing', 'org', false, '{plan}', 'app.billing confirmed_at set', 'A plan was confirmed.'),
  (160, 'subscription.tier_changed', 'billing', 'org', false, '{plan}', 'app.billing plan changed after confirmation', 'A confirmed plan moved to another tier.'),
  (170, 'subscription.cancelled', 'billing', 'org', false, '{cancel_source}', 'app.billing cancelled_at set', 'The subscription was cancelled.'),
  (180, 'ticket.created', 'support', 'org', false, '{category,priority,channel}', 'app.tickets insert from the app (channel in_app): a signed-in account''s', 'A customer''s account raised a support ticket in the app.'),
  (190, 'consent.granted', 'consent', 'none', true, '{purpose,lawful_basis,method}', 'app.consent_records insert', 'A contact''s consent, or another basis, for a purpose was recorded.'),
  (200, 'consent.withdrawn', 'consent', 'none', true, '{purpose,method}', 'app.consent_records insert', 'A contact withdrew from a purpose.'),
  (210, 'lead.hand_raised', 'lead', 'none', true, '{channel}', 'app.demo_requests insert; a sales request from the contact form (app.tickets)', 'Someone asked for a demo or for sales to get in touch.');

-- ============================================================ the stream
-- An event goes with its organisation and with its account (ON DELETE CASCADE): the deletion 30 days
-- after an agreement ends leaves no row of the organisation (0136, retention_invariants.sql), and an
-- account's events are the account's.
-- occurred_at is the only time an event keeps, and its id is random. An insertion time (a created_at
-- defaulting to now()) would be the exact instant of the row the event came from — the consent record,
-- the demo request, the employees of one statement all default to the same now() — and would undo the
-- hour an hour_only event is stamped with; a sequence would order the events as those rows are
-- ordered. Neither exists.
create table app.growth_events (
  id uuid primary key default gen_random_uuid(),
  name text not null references app.event_catalogue (name),
  occurred_at timestamptz not null,
  org_id uuid references app.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  props jsonb not null default '{}' check (jsonb_typeof(props) = 'object'),
  source text not null check (source in ('trigger', 'tick', 'backfill')),
  dedupe_key text check (dedupe_key ~ '^[0-9a-z:._+-]{1,120}$')
);
comment on table app.growth_events is
  'Org-level product events (0141, D-182). Written only by triggers on product tables and the hourly tick; never by a respondent, never about one.';
create unique index growth_events_once on app.growth_events (name, dedupe_key) where dedupe_key is not null;
create index growth_events_name_at on app.growth_events (name, occurred_at desc);
create index growth_events_org on app.growth_events (org_id, occurred_at desc) where org_id is not null;
create index growth_events_user on app.growth_events (user_id) where user_id is not null;
alter table app.growth_events enable row level security;
revoke all on app.growth_events from public, anon, authenticated;

-- a demo is no customer: nothing it does is an event
insert into app.demo_copy_plan (table_name, step, mode, via, note)
values ('growth_events', null, 'skip', null, 'a demo emits no growth event');

-- The catalogue is the contract: every prop is one the entry allows; every value a short keyword with
-- a letter in it — not a number, not an id — except a band, which must be one of its fixed vocabulary
-- (app.growth_band_ok: a count band is never a bare count); a person only on an event whose PII level
-- is 'user'; an hour_only event on the hour, never a finer time; and an event with no organisation
-- carries no key (a key would be the id of the row it came from).
create function app.growth_event_check() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  e app.event_catalogue;
  k text;
  v jsonb;
begin
  select * into e from app.event_catalogue c where c.name = new.name;
  if e.name is null then
    raise exception 'growth event %: not in the catalogue', new.name using errcode = 'check_violation';
  end if;
  for k, v in select j.key, j.value from jsonb_each(new.props) j loop
    if not (k = any (e.allowed_props)) then
      raise exception 'growth event %: prop % is not in the catalogue', new.name, k using errcode = 'check_violation';
    end if;
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[a-z0-9_:.+-]{1,60}$'
       or (v #>> '{}') ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then
      raise exception 'growth event %: prop % must be a short keyword', new.name, k using errcode = 'check_violation';
    end if;
    if k ~ '_band$' then
      if not app.growth_band_ok(k, v #>> '{}') then
        raise exception 'growth event %: prop % must be one of its bands', new.name, k using errcode = 'check_violation';
      end if;
    elsif (v #>> '{}') !~ '[a-z]' then
      raise exception 'growth event %: prop % must be a keyword, not a number', new.name, k using errcode = 'check_violation';
    end if;
  end loop;
  if new.user_id is not null and e.pii_level <> 'user' then
    raise exception 'growth event %: carries no person', new.name using errcode = 'check_violation';
  end if;
  if new.org_id is not null and e.pii_level = 'none' then
    raise exception 'growth event %: carries no organisation', new.name using errcode = 'check_violation';
  end if;
  if e.pii_level = 'none' and new.dedupe_key is not null then
    raise exception 'growth event %: carries no key', new.name using errcode = 'check_violation';
  end if;
  if e.hour_only and new.occurred_at <> date_trunc('hour', new.occurred_at) then
    raise exception 'growth event %: is stamped with the hour, nothing finer', new.name using errcode = 'check_violation';
  end if;
  return new;
end $fn$;
revoke all on function app.growth_event_check() from public, anon, authenticated;
create trigger growth_event_check before insert on app.growth_events
  for each row execute function app.growth_event_check();

-- An event is a record: nobody changes one. It goes with its organisation or its account (the
-- cascade), or by a retention delete; it is never edited.
create function app.growth_event_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  raise exception 'growth_events is a record: rows are not changed' using errcode = 'check_violation';
end $fn$;
revoke all on function app.growth_event_guard() from public, anon, authenticated;
create trigger growth_event_guard before update on app.growth_events
  for each row execute function app.growth_event_guard();

-- bands: never a count, and nothing that says how many below five
create function app.growth_count_band(n bigint) returns text
  language sql immutable set search_path = ''
as $fn$
  select case when coalesce(n, 0) < 5 then 'under_5' when n < 10 then '5_9' when n < 25 then '10_24'
              when n < 50 then '25_49' when n < 100 then '50_99' when n < 250 then '100_249' else '250_plus' end
$fn$;
revoke all on function app.growth_count_band(bigint) from public, anon, authenticated;

create function app.growth_rate_band(p_num bigint, p_den bigint) returns text
  language sql immutable set search_path = ''
as $fn$
  select case when coalesce(p_den, 0) <= 0 then null
              when p_num::numeric / p_den < 0.25 then 'under_25' when p_num::numeric / p_den < 0.5 then '25_49'
              when p_num::numeric / p_den < 0.75 then '50_74' else '75_plus' end
$fn$;
revoke all on function app.growth_rate_band(bigint, bigint) from public, anon, authenticated;

-- a band prop holds one of its bands and nothing else: a rate band one of growth_rate_band's four, any
-- other band one of growth_count_band's seven
create function app.growth_band_ok(p_prop text, p_value text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select case when p_prop ~ '_rate_band$' then p_value = any (array['under_25', '25_49', '50_74', '75_plus'])
              else p_value = any (array['under_5', '5_9', '10_24', '25_49', '50_99', '100_249', '250_plus']) end
$fn$;
revoke all on function app.growth_band_ok(text, text) from public, anon, authenticated;

-- The one way in. A demo organisation emits nothing; a key makes an event happen once.
create function app.growth_emit(p_name text, p_at timestamptz, p_org uuid, p_user uuid, p_props jsonb, p_source text, p_key text)
  returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_org is not null and app.is_demo(p_org) then
    return;
  end if;
  insert into app.growth_events (name, occurred_at, org_id, user_id, props, source, dedupe_key)
  values (p_name, coalesce(p_at, now()), p_org, p_user, coalesce(p_props, '{}'), p_source, p_key)
  on conflict (name, dedupe_key) where dedupe_key is not null do nothing;
end $fn$;
revoke all on function app.growth_emit(text, timestamptz, uuid, uuid, jsonb, text, text) from public, anon, authenticated;

-- An organisation marked a demo after it was made (demo_build writes the organisation, then the mark)
-- takes back what it emitted in between.
create function app.growth_forget_demo() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  delete from app.growth_events g where g.org_id = new.org_id;
  return null;
end $fn$;
revoke all on function app.growth_forget_demo() from public, anon, authenticated;
create trigger growth_forget_demo after insert on app.demo_orgs
  for each row execute function app.growth_forget_demo();

-- ============================================================ the product's triggers
-- Plain AFTER triggers on the product's own tables, each emitting from the row it was handed. What
-- needs the transaction's final state (a round's recipients) is the hourly tick's.

create function app.growth_on_org() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    perform app.growth_emit('org.created', new.created_at, new.id, null, '{}', 'trigger', new.id::text);
  end if;
  if new.registry_fetched_at is not null and (tg_op = 'INSERT' or old.registry_fetched_at is null) then
    perform app.growth_emit('org.brreg_verified', new.registry_fetched_at, new.id, null, '{}', 'trigger', new.id::text);
  end if;
  return null;
end $fn$;
revoke all on function app.growth_on_org() from public, anon, authenticated;
create trigger growth_org_created after insert on app.organizations
  for each row execute function app.growth_on_org();
create trigger growth_org_verified after update of registry_fetched_at on app.organizations
  for each row execute function app.growth_on_org();

-- an account signs up when it first joins an organisation, with the role it joined as
create function app.growth_on_membership() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.active then
    perform app.growth_emit('user.signed_up', new.created_at, new.org_id, new.user_id,
                            jsonb_build_object('role', new.role::text), 'trigger', new.user_id::text);
  end if;
  return null;
end $fn$;
revoke all on function app.growth_on_membership() from public, anon, authenticated;
create trigger growth_user_signed_up after insert on app.memberships
  for each row execute function app.growth_on_membership();

-- employees: one event per statement and organisation, with how many as a band. Nothing about who,
-- and the hour truncated: employees.created_at is the statement's now(), and an exact time would join
-- the event to the very rows it counts.
create function app.growth_on_employees() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare r record;
begin
  for r in select n.org_id, count(*) as n from new_rows n group by n.org_id loop
    perform app.growth_emit('employees.imported', date_trunc('hour', now()), r.org_id, null,
                            jsonb_build_object('employee_count_band', app.growth_count_band(r.n)), 'trigger', null);
  end loop;
  return null;
end $fn$;
revoke all on function app.growth_on_employees() from public, anon, authenticated;
create trigger growth_employees_imported after insert on app.employees
  referencing new table as new_rows for each statement execute function app.growth_on_employees();

create function app.growth_on_measurement() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  perform app.growth_emit('survey.created', new.created_at, new.org_id, null,
                          jsonb_build_object('measurement_kind', new.kind::text), 'trigger', new.id::text);
  return null;
end $fn$;
revoke all on function app.growth_on_measurement() from public, anon, authenticated;
create trigger growth_survey_created after insert on app.measurements
  for each row execute function app.growth_on_measurement();

-- a planned round given its opening date (the opening itself is survey.sent, the tick's)
create function app.growth_on_round() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.status = 'planlagt' and new.opens_at is not null then
    perform app.growth_emit('survey.scheduled', now(), new.org_id, null,
                            jsonb_strip_nulls(jsonb_build_object('measurement_kind',
                              (select m.kind::text from app.measurements m where m.id = new.measurement_id))),
                            'trigger', new.id::text);
  end if;
  return null;
end $fn$;
revoke all on function app.growth_on_round() from public, anon, authenticated;
create trigger growth_survey_scheduled after insert or update of status, opens_at on app.rounds
  for each row execute function app.growth_on_round();

create function app.growth_on_measure() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  perform app.growth_emit('action_item.created', new.created_at, new.org_id, null,
                          jsonb_build_object('measure_kind', new.kind::text), 'trigger', new.id::text);
  return null;
end $fn$;
revoke all on function app.growth_on_measure() from public, anon, authenticated;
create trigger growth_action_item after insert on app.measures
  for each row execute function app.growth_on_measure();

create function app.growth_on_invite() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  perform app.growth_emit('stakeholder.invited', new.created_at, new.org_id, null,
                          jsonb_build_object('role', new.role::text), 'trigger', new.id::text);
  return null;
end $fn$;
revoke all on function app.growth_on_invite() from public, anon, authenticated;
create trigger growth_stakeholder_invited after insert on app.member_invites
  for each row execute function app.growth_on_invite();

-- billing: the extension, the confirmation, a tier change and the cancellation, each at its own time.
-- An extension is the trial's end moving later before a plan is confirmed, whoever moved it: the
-- customer's own extend_trial (0048, which also stamps trial_extended_at) or Sentral's
-- admin_extend_trial (0049, which does not).
create function app.growth_on_billing() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.trial_ends_at > old.trial_ends_at and new.confirmed_at is null and old.confirmed_at is null then
    perform app.growth_emit('trial.extended', coalesce(nullif(new.trial_extended_at, old.trial_extended_at), now()), new.org_id, null, '{}',
                            'trigger', new.org_id::text || ':' || extract(epoch from new.trial_ends_at)::bigint);
  end if;
  if new.confirmed_at is not null and old.confirmed_at is null then
    perform app.growth_emit('subscription.started', new.confirmed_at, new.org_id, null,
                            jsonb_strip_nulls(jsonb_build_object('plan', new.plan)), 'trigger',
                            new.org_id::text || ':' || extract(epoch from new.confirmed_at)::bigint);
  elsif new.confirmed_at is not null and old.confirmed_at is not null and new.plan is distinct from old.plan and new.plan is not null then
    perform app.growth_emit('subscription.tier_changed', now(), new.org_id, null, jsonb_build_object('plan', new.plan), 'trigger', null);
  end if;
  if new.cancelled_at is not null and old.cancelled_at is null then
    perform app.growth_emit('subscription.cancelled', new.cancelled_at, new.org_id, null,
                            jsonb_strip_nulls(jsonb_build_object('cancel_source', new.cancel_source)), 'trigger',
                            new.org_id::text || ':' || extract(epoch from new.cancelled_at)::bigint);
  end if;
  return null;
end $fn$;
revoke all on function app.growth_on_billing() from public, anon, authenticated;
create trigger growth_billing after update on app.billing
  for each row execute function app.growth_on_billing();

-- tickets: a customer's account raising one in the app (channel in_app, the one channel a signed-in
-- account writes); a sales request from the contact form is a hand-raise. The contact form is
-- unauthenticated: public.submit_contact links a ticket to the account whose address was typed, and
-- marks the link unverified, so anyone typing a customer's address would otherwise emit that
-- customer's ticket.created. Anything else from the form (whose sender may be an employee) emits
-- nothing. A hand-raise carries no key and its hour truncated: the ticket's number or time would lead
-- to the requester's address (pii_level 'none').
create function app.growth_on_ticket() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.channel = 'in_app' and new.user_id is not null and new.org_id is not null then
    perform app.growth_emit('ticket.created', new.created_at, new.org_id, null,
                            jsonb_build_object('category', new.category::text, 'priority', new.priority::text, 'channel', new.channel),
                            'trigger', new.id::text);
  elsif new.channel = 'contact_form' and new.category = 'sales' then
    perform app.growth_emit('lead.hand_raised', date_trunc('hour', new.created_at), null, null,
                            jsonb_build_object('channel', 'contact_form'), 'trigger', null);
  end if;
  return null;
end $fn$;
revoke all on function app.growth_on_ticket() from public, anon, authenticated;
create trigger growth_ticket_created after insert on app.tickets
  for each row execute function app.growth_on_ticket();

create function app.growth_on_product_event() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  perform app.growth_emit('results.viewed', new.at, new.org_id,
                          (select u.id from auth.users u where u.id = new.user_id),
                          jsonb_strip_nulls(jsonb_build_object('view', replace(new.name, '_viewed', ''), 'role', new.role::text)),
                          'trigger', 'pe:' || new.id);
  return null;
end $fn$;
revoke all on function app.growth_on_product_event() from public, anon, authenticated;
create trigger growth_results_viewed after insert on app.product_events
  for each row execute function app.growth_on_product_event();

create function app.growth_on_demo_request() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  -- no key, the hour truncated: the request's id or time would lead to its address
  perform app.growth_emit('lead.hand_raised', date_trunc('hour', new.at), null, null, jsonb_build_object('channel', 'demo'), 'trigger', null);
  return null;
end $fn$;
revoke all on function app.growth_on_demo_request() from public, anon, authenticated;
create trigger growth_demo_request after insert on app.demo_requests
  for each row execute function app.growth_on_demo_request();

-- ============================================================ the hourly tick
-- From counts, after app.wheel_tick() has opened what was due:
--   * survey.sent: a round that opened, at its opening time, its recipients counted and given as a band;
--   * survey.threshold_reached: a round whose responses reached the organisation's threshold, the
--     response rate as a band and the hour truncated — never a trigger on an answer table;
--   * trial.expiring and trial.expired, at the times they fell.
-- A failure here must never undo the scheduler's work, so it is caught and reported by its SQLSTATE
-- alone (no message: nothing a row holds reaches a log).
create function app.growth_tick() returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r record;
  v_n int := 0;
  v_before bigint;
begin
  select count(*) into v_before from app.growth_events;
  begin
    for r in
      select ro.id, ro.org_id, ro.opens_at,
             (select count(*) from app.invitations i where i.round_id = ro.id) as invited,
             (select m.kind::text from app.measurements m where m.id = ro.measurement_id) as kind
      from app.rounds ro
      where ro.status in ('apen', 'lukket') and ro.opens_at is not null and not app.is_demo(ro.org_id)
        and not exists (select 1 from app.growth_events g where g.name = 'survey.sent' and g.dedupe_key = ro.id::text)
    loop
      perform app.growth_emit('survey.sent', least(r.opens_at, now()), r.org_id, null,
                              jsonb_strip_nulls(jsonb_build_object('recipient_count_band', app.growth_count_band(r.invited),
                                                                   'measurement_kind', r.kind)),
                              'tick', r.id::text);
    end loop;

    for r in
      select ro.id, ro.org_id,
             (select count(*) from app.responses x where x.round_id = ro.id) as answered,
             (select count(*) from app.invitations i where i.round_id = ro.id) as invited,
             greatest(app.k_min(), coalesce(o.threshold, app.k_min())) as k
      from app.rounds ro join app.organizations o on o.id = ro.org_id
      where (ro.status = 'apen' or (ro.status = 'lukket' and ro.closes_at > now() - interval '2 days'))
        and not app.is_demo(ro.org_id)
        and not exists (select 1 from app.growth_events g where g.name = 'survey.threshold_reached' and g.dedupe_key = ro.id::text)
    loop
      if r.answered >= r.k and r.invited > 0 then
        perform app.growth_emit('survey.threshold_reached', date_trunc('hour', now()), r.org_id, null,
                                jsonb_build_object('response_rate_band', app.growth_rate_band(r.answered, r.invited)), 'tick', r.id::text);
      end if;
    end loop;

    for r in
      select b.org_id, b.trial_ends_at from app.billing b
      where b.trial_ends_at - interval '3 days' <= now()
        and (b.confirmed_at is null or b.confirmed_at > b.trial_ends_at - interval '3 days')
    loop
      perform app.growth_emit('trial.expiring', r.trial_ends_at - interval '3 days', r.org_id, null, '{}', 'tick',
                              r.org_id::text || ':' || extract(epoch from r.trial_ends_at)::bigint);
    end loop;
    for r in
      select b.org_id, b.trial_ends_at from app.billing b
      where b.trial_ends_at <= now() and (b.confirmed_at is null or b.confirmed_at > b.trial_ends_at)
    loop
      perform app.growth_emit('trial.expired', r.trial_ends_at, r.org_id, null, '{}', 'tick',
                              r.org_id::text || ':' || extract(epoch from r.trial_ends_at)::bigint);
    end loop;
  exception when others then
    raise warning 'growth_tick failed: %', sqlstate;
    return -1;
  end;
  select count(*) - v_before into v_n from app.growth_events;
  return v_n;
end $fn$;
revoke all on function app.growth_tick() from public, anon, authenticated;

-- the hourly job: the wheel first, then what its turn made true
select cron.schedule('orgpuls-wheel', '0 * * * *', $cron$select app.wheel_tick(); select app.growth_tick()$cron$);

-- ============================================================ backfill, where the product kept the time
insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'org.created', o.created_at, o.id, '{}', 'backfill', o.id::text
from app.organizations o where not app.is_demo(o.id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'org.brreg_verified', o.registry_fetched_at, o.id, '{}', 'backfill', o.id::text
from app.organizations o where o.registry_fetched_at is not null and not app.is_demo(o.id);

-- an account's first membership, where it is still active
insert into app.growth_events (name, occurred_at, org_id, user_id, props, source, dedupe_key)
select distinct on (ms.user_id) 'user.signed_up', ms.created_at, ms.org_id, ms.user_id, jsonb_build_object('role', ms.role::text),
       'backfill', ms.user_id::text
from app.memberships ms
where ms.active and not app.is_demo(ms.org_id) and exists (select 1 from auth.users u where u.id = ms.user_id)
order by ms.user_id, ms.created_at;

-- one event per transaction's timestamp: the employees one statement wrote share its time
-- (created_at is its transaction's now()), and so do those of several statements in one transaction,
-- which the rows cannot tell apart; the hour truncated, as the trigger's
insert into app.growth_events (name, occurred_at, org_id, props, source)
select 'employees.imported', date_trunc('hour', e.created_at), e.org_id, jsonb_build_object('employee_count_band', app.growth_count_band(count(*))),
       'backfill'
from app.employees e where not app.is_demo(e.org_id)
group by e.org_id, e.created_at;

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'survey.created', m.created_at, m.org_id, jsonb_build_object('measurement_kind', m.kind::text), 'backfill', m.id::text
from app.measurements m where not app.is_demo(m.org_id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'survey.sent', least(r.opens_at, now()), r.org_id,
       jsonb_strip_nulls(jsonb_build_object('recipient_count_band', app.growth_count_band((select count(*) from app.invitations i where i.round_id = r.id)),
                                            'measurement_kind', (select m.kind::text from app.measurements m where m.id = r.measurement_id))),
       'backfill', r.id::text
from app.rounds r where r.status in ('apen', 'lukket') and r.opens_at is not null and not app.is_demo(r.org_id);

-- survey.threshold_reached: the hour the round's responses reached its threshold — responses keep
-- only their hour, so it is the hour of the k-th — with the response rate at that hour as a band: what
-- the hourly tick emits for a round that reaches it now. survey.scheduled has no backfill: a round
-- keeps no time at which it was planned.
insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'survey.threshold_reached', h.hour, ro.org_id, jsonb_build_object('response_rate_band', app.growth_rate_band(h.answered, inv.n)),
       'backfill', ro.id::text
from app.rounds ro
join app.organizations o on o.id = ro.org_id
cross join lateral (select count(*) as n from app.invitations i where i.round_id = ro.id) inv
cross join lateral (
  select s.submitted_hour as hour, s.cum::bigint as answered
  from (select r.submitted_hour, sum(count(*)) over (order by r.submitted_hour) as cum
        from app.responses r where r.round_id = ro.id group by r.submitted_hour) s
  where s.cum >= greatest(app.k_min(), coalesce(o.threshold, app.k_min()))
  order by s.submitted_hour limit 1) h
where ro.status in ('apen', 'lukket') and inv.n > 0 and not app.is_demo(ro.org_id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'action_item.created', me.created_at, me.org_id, jsonb_build_object('measure_kind', me.kind::text), 'backfill', me.id::text
from app.measures me where not app.is_demo(me.org_id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'stakeholder.invited', i.created_at, i.org_id, jsonb_build_object('role', i.role::text), 'backfill', i.id::text
from app.member_invites i where not app.is_demo(i.org_id);

insert into app.growth_events (name, occurred_at, org_id, user_id, props, source, dedupe_key)
select 'results.viewed', pe.at, pe.org_id, u.id,
       jsonb_strip_nulls(jsonb_build_object('view', replace(pe.name, '_viewed', ''), 'role', pe.role::text)), 'backfill', 'pe:' || pe.id
from app.product_events pe left join auth.users u on u.id = pe.user_id
where not app.is_demo(pe.org_id);

-- the customer's own extension (0048 stamps it), and each of Sentral's (0049 audits it as 'trial.extend')
insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'trial.extended', b.trial_extended_at, b.org_id, '{}', 'backfill', b.org_id::text || ':c' || extract(epoch from b.trial_extended_at)::bigint
from app.billing b where b.trial_extended_at is not null and not app.is_demo(b.org_id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'trial.extended', a.at, a.org_id, '{}', 'backfill', a.org_id::text || ':a' || a.id
from app.admin_audit a
where a.action = 'trial.extend' and a.org_id is not null
  and exists (select 1 from app.organizations o where o.id = a.org_id) and not app.is_demo(a.org_id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'subscription.started', b.confirmed_at, b.org_id, jsonb_strip_nulls(jsonb_build_object('plan', b.plan)), 'backfill',
       b.org_id::text || ':' || extract(epoch from b.confirmed_at)::bigint
from app.billing b where b.confirmed_at is not null and not app.is_demo(b.org_id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'subscription.cancelled', b.cancelled_at, b.org_id, jsonb_strip_nulls(jsonb_build_object('cancel_source', b.cancel_source)), 'backfill',
       b.org_id::text || ':' || extract(epoch from b.cancelled_at)::bigint
from app.billing b where b.cancelled_at is not null and not app.is_demo(b.org_id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'trial.expiring', b.trial_ends_at - interval '3 days', b.org_id, '{}', 'backfill', b.org_id::text || ':' || extract(epoch from b.trial_ends_at)::bigint
from app.billing b
where b.trial_ends_at - interval '3 days' <= now() and (b.confirmed_at is null or b.confirmed_at > b.trial_ends_at - interval '3 days')
  and not app.is_demo(b.org_id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'trial.expired', b.trial_ends_at, b.org_id, '{}', 'backfill', b.org_id::text || ':' || extract(epoch from b.trial_ends_at)::bigint
from app.billing b
where b.trial_ends_at <= now() and (b.confirmed_at is null or b.confirmed_at > b.trial_ends_at) and not app.is_demo(b.org_id);

insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
select 'ticket.created', t.created_at, t.org_id,
       jsonb_build_object('category', t.category::text, 'priority', t.priority::text, 'channel', t.channel), 'backfill', t.id::text
from app.tickets t where t.channel = 'in_app' and t.user_id is not null and t.org_id is not null and not app.is_demo(t.org_id);

insert into app.growth_events (name, occurred_at, props, source)
select 'lead.hand_raised', date_trunc('hour', t.created_at), jsonb_build_object('channel', 'contact_form'), 'backfill'
from app.tickets t where t.channel = 'contact_form' and t.category = 'sales';

insert into app.growth_events (name, occurred_at, props, source)
select 'lead.hand_raised', date_trunc('hour', d.at), jsonb_build_object('channel', 'demo'), 'backfill'
from app.demo_requests d;

-- ============================================================ 3. the consent ledger
-- Purposes: the contact-level basis the segment campaigns, sequences and journeys send under, and one
-- per list. A list added later gets its purpose with it.
create table app.consent_purposes (
  key text primary key check (key ~ '^(marketing|list:[a-z0-9-]{2,40})$'),
  list_id uuid unique references app.crm_lists (id) on delete set null,
  created_at timestamptz not null default now(),
  check (key <> 'marketing' or list_id is null)
);
comment on table app.consent_purposes is
  'What a contact can consent to (0141, D-182): the contact-level basis (marketing) and one purpose per CRM list.';
alter table app.consent_purposes enable row level security;
revoke all on app.consent_purposes from public, anon, authenticated;

insert into app.consent_purposes (key, list_id) values ('marketing', null);
insert into app.consent_purposes (key, list_id)
select 'list:' || l.key, l.id from app.crm_lists l where l.product_id = 'orgpuls';

create function app.consent_purpose_for_list() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.product_id = 'orgpuls' then
    insert into app.consent_purposes (key, list_id) values ('list:' || new.key, new.id)
    on conflict (key) do update set list_id = excluded.list_id where app.consent_purposes.list_id is null;
  end if;
  return null;
end $fn$;
revoke all on function app.consent_purpose_for_list() from public, anon, authenticated;
create trigger consent_purpose_for_list after insert on app.crm_lists
  for each row execute function app.consent_purpose_for_list();

create table app.consent_records (
  id bigint generated always as identity primary key,
  contact_id uuid not null references app.crm_contacts (id) on delete cascade,
  purpose text not null references app.consent_purposes (key),
  status text not null check (status in ('granted', 'withdrawn', 'lapsed', 'not_given', 'notice_given')),
  lawful_basis text check (lawful_basis in ('consent', 'existing_customer_15_3', 'legit_interest_phone', 'business_address')),
  method text not null check (method in ('migrated', 'double_opt_in', 'one_click_unsubscribe', 'preference_centre',
                                         'provider_complaint', 'provider_bounce', 'provider_unsubscribe',
                                         'admin', 'import', 'account_sync', 'demo_request', 'system')),
  doi_sent_at timestamptz,
  doi_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  check (status <> 'granted' or lawful_basis is not null),
  check (doi_confirmed_at is null or status = 'granted')
);
comment on table app.consent_records is
  'The consent ledger (0141, D-182): append-only; a withdrawal is a new row. Written by deferred triggers on the CRM tables; crm_contacts keeps the latest state the dispatcher reads.';
create index consent_records_latest on app.consent_records (contact_id, purpose, id desc);
create index consent_records_created_by on app.consent_records (created_by) where created_by is not null;
alter table app.consent_records enable row level security;
revoke all on app.consent_records from public, anon, authenticated;

-- Append-only: nobody changes a record. created_by may be cleared by its account's deletion; a record
-- goes only with its contact — the erasure's cascade (CLAUDE.md: immutability permits referential
-- maintenance).
create function app.consent_records_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' then
    if (new.id, new.contact_id, new.purpose, new.status, new.lawful_basis, new.method, new.doi_sent_at, new.doi_confirmed_at,
        new.created_at)
       is distinct from (old.id, old.contact_id, old.purpose, old.status, old.lawful_basis, old.method, old.doi_sent_at,
        old.doi_confirmed_at, old.created_at)
       or (new.created_by is distinct from old.created_by
           and (new.created_by is not null or exists (select 1 from auth.users u where u.id = old.created_by))) then
      raise exception 'consent_records is append-only: a change is a new record' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if exists (select 1 from app.crm_contacts c where c.id = old.contact_id) then
    raise exception 'consent_records is append-only: records go only with their contact' using errcode = 'check_violation';
  end if;
  return old;
end $fn$;
revoke all on function app.consent_records_guard() from public, anon, authenticated;
create trigger consent_records_guard before update or delete on app.consent_records
  for each row execute function app.consent_records_guard();

create function app.consent_basis(p_basis text) returns text
  language sql immutable set search_path = ''
as $fn$
  select case p_basis when 'consent' then 'consent' when 'customer' then 'existing_customer_15_3'
                      when 'business' then 'business_address' end
$fn$;
revoke all on function app.consent_basis(text) from public, anon, authenticated;

-- What the CRM's state means for one purpose now: the status and basis the ledger's latest record must
-- carry, or no row when there is nothing to record (no list membership, or a membership awaiting its
-- double opt-in, which changes nothing until it is confirmed). A list never confirmed has no consent
-- to withdraw: an unsubscribe while it waits records nothing for it. Only a purpose that already has
-- a record (a consent given before) is withdrawn while its membership waits.
create function app.consent_derive(p_contact uuid, p_purpose text, out status text, out lawful_basis text)
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  c app.crm_contacts;
  p app.consent_purposes;
  m app.crm_list_members;
  v_sup boolean;
begin
  select * into c from app.crm_contacts x where x.id = p_contact;
  select * into p from app.consent_purposes x where x.key = p_purpose;
  if c.id is null or p.key is null then return; end if;
  v_sup := app.crm_suppressed(c.email);
  if p.key = 'marketing' then
    lawful_basis := app.consent_basis(c.basis);
    status := case when c.status = 'unsubscribed' then 'withdrawn'
                   when c.basis = 'none' then 'not_given'
                   when v_sup then 'lapsed'
                   when c.status = 'active' then 'granted'
                   else 'not_given' end;
    if status = 'not_given' then lawful_basis := null; end if;
    return;
  end if;
  select * into m from app.crm_list_members x where x.list_id = p.list_id and x.contact_id = c.id;
  if m.list_id is null then return; end if;
  if m.status = 'pending'
     and not exists (select 1 from app.consent_records r where r.contact_id = c.id and r.purpose = p.key) then
    return;
  end if;
  if m.status = 'unsubscribed' or c.status = 'unsubscribed' then
    status := 'withdrawn'; lawful_basis := 'consent';
  elsif m.status = 'pending' then
    return;
  elsif v_sup then
    status := 'lapsed'; lawful_basis := 'consent';
  elsif c.status = 'active' then
    status := 'granted'; lawful_basis := 'consent';
  else
    status := 'not_given';
  end if;
end $fn$;
revoke all on function app.consent_derive(uuid, text) from public, anon, authenticated;

create function app.consent_latest(p_contact uuid, p_purpose text) returns app.consent_records
  language sql stable security definer set search_path = ''
as $fn$
  select r.* from app.consent_records r where r.contact_id = p_contact and r.purpose = p_purpose order by r.id desc limit 1
$fn$;
revoke all on function app.consent_latest(uuid, text) from public, anon, authenticated;

-- Brings the ledger up to the CRM's state for one contact: a new record for each purpose whose state
-- differs from its latest record. The method is the path's own (app.consent_via, set by the function
-- that changed consent), else 'admin' for a signed-in admin, else 'system'. The account sync and the
-- system have no author: crm_sync runs inside the admin's CRM reads, and whoever opened a page did not
-- make the change it records.
create function app.consent_sync(p_contact uuid) returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  c app.crm_contacts;
  v_purpose text;
  d record;
  l app.consent_records;
  v_via text := nullif(current_setting('app.consent_via', true), '');
  v_by uuid;
  v_n int := 0;
begin
  select * into c from app.crm_contacts x where x.id = p_contact;
  if c.id is null then return 0; end if;
  if v_via is null then
    v_via := case when app.admin_role() is not null then 'admin' else 'system' end;
  end if;
  v_by := case when v_via not in ('account_sync', 'system') then (select u.id from auth.users u where u.id = auth.uid()) end;
  for v_purpose in
    select 'marketing'
    union all
    select p.key from app.crm_list_members m join app.consent_purposes p on p.list_id = m.list_id where m.contact_id = c.id
  loop
    select * into d from app.consent_derive(c.id, v_purpose);
    if d.status is null then continue; end if;
    l := app.consent_latest(c.id, v_purpose);
    if l.id is null and d.status = 'not_given' then continue; end if;
    if l.id is not null and l.status = d.status and l.lawful_basis is not distinct from d.lawful_basis then continue; end if;
    insert into app.consent_records (contact_id, purpose, status, lawful_basis, method, doi_sent_at, doi_confirmed_at, created_by)
    values (c.id, v_purpose, d.status, d.lawful_basis, v_via,
            case when v_via = 'double_opt_in' and d.status = 'granted' then c.optin_sent_at end,
            -- the confirmation's time is the contact's consent_at (crm_confirm stamps it now())
            case when v_via = 'double_opt_in' and d.status = 'granted' then coalesce(c.consent_at, now()) end,
            v_by);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;
revoke all on function app.consent_sync(uuid) from public, anon, authenticated;

create function app.consent_on_contact() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  perform app.consent_sync(new.id);
  return null;
end $fn$;
revoke all on function app.consent_on_contact() from public, anon, authenticated;
-- The address too: suppression is kept by address, so a contact that moves onto a suppressed address
-- (or off one) lapses (or is granted again) — app.crm_sync moves an account's contact with its login.
create constraint trigger consent_on_contact after insert or update of basis, status, email on app.crm_contacts
  deferrable initially deferred for each row execute function app.consent_on_contact();

create function app.consent_on_member() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  perform app.consent_sync(new.contact_id);
  return null;
end $fn$;
revoke all on function app.consent_on_member() from public, anon, authenticated;
create constraint trigger consent_on_member after insert or update of status on app.crm_list_members
  deferrable initially deferred for each row execute function app.consent_on_member();

-- suppression is kept by hash; the contacts it concerns are found the same way
create index crm_contacts_email_hash on app.crm_contacts (app.crm_hash(email));
create function app.consent_on_suppression() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare v_id uuid;
begin
  for v_id in select c.id from app.crm_contacts c
              where app.crm_hash(c.email) = case when tg_op = 'DELETE' then old.email_hash else new.email_hash end loop
    perform app.consent_sync(v_id);
  end loop;
  return null;
end $fn$;
revoke all on function app.consent_on_suppression() from public, anon, authenticated;
create constraint trigger consent_on_suppression after insert or update or delete on app.crm_suppression
  deferrable initially deferred for each row execute function app.consent_on_suppression();

-- a granted or withdrawn record is an event, without the contact: no key and the hour truncated, since
-- the record's id or its exact time would lead back to the contact (the trigger fires once per record,
-- so nothing needs a key to happen once)
create function app.consent_event() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.status = 'granted' then
    perform app.growth_emit('consent.granted', date_trunc('hour', new.created_at), null, null,
                            jsonb_build_object('purpose', new.purpose, 'lawful_basis', new.lawful_basis, 'method', new.method),
                            case when new.method = 'migrated' then 'backfill' else 'trigger' end, null);
  elsif new.status = 'withdrawn' then
    perform app.growth_emit('consent.withdrawn', date_trunc('hour', new.created_at), null, null,
                            jsonb_build_object('purpose', new.purpose, 'method', new.method),
                            case when new.method = 'migrated' then 'backfill' else 'trigger' end, null);
  end if;
  return null;
end $fn$;
revoke all on function app.consent_event() from public, anon, authenticated;
create trigger consent_event after insert on app.consent_records
  for each row execute function app.consent_event();

-- ---------------------------------------------------------------- the backfill: one record per contact
-- The contact's current state for the contact-level purpose, at the time its own columns give; and one
-- per list membership that is subscribed or unsubscribed. Method 'migrated'. A double opt-in is known
-- by its consent_source naming one: crm_confirm writes 'double opt-in (<source>)', and a source
-- written otherwise ('Newsletter form + double opt-in, wording v3') says the same.
insert into app.consent_records (contact_id, purpose, status, lawful_basis, method, doi_sent_at, doi_confirmed_at, created_at)
select c.id, 'marketing', d.status, d.lawful_basis, 'migrated',
       case when d.status = 'granted' and c.basis = 'consent' and c.consent_source ~* 'double opt-in' and c.optin_sent_at <= c.consent_at then c.optin_sent_at end,
       case when d.status = 'granted' and c.basis = 'consent' and c.consent_source ~* 'double opt-in' then c.consent_at end,
       case d.status
         when 'withdrawn' then coalesce((select s.at from app.crm_suppression s where s.email_hash = app.crm_hash(c.email) and s.reason in ('unsubscribed', 'spam')),
                                        (select max(se.unsubscribed_at) from app.crm_sends se where se.contact_id = c.id), c.updated_at)
         when 'lapsed' then coalesce((select s.at from app.crm_suppression s where s.email_hash = app.crm_hash(c.email)), c.updated_at)
         when 'granted' then case when c.basis = 'consent' then coalesce(c.consent_at, c.created_at)
                                  when c.basis = 'customer' then greatest(c.created_at, coalesce((select b.confirmed_at from app.billing b where b.org_id = c.org_id), c.created_at))
                                  else c.created_at end
         else c.created_at end
from app.crm_contacts c cross join lateral app.consent_derive(c.id, 'marketing') d
where d.status is not null;

-- A list withdrawn by the list's own unsubscribe is dated by it; one withdrawn because the contact
-- unsubscribed from everything (record_crm_event and admin_crm_contact_action leave the membership
-- 'subscribed') is dated as the contact's withdrawal is above.
insert into app.consent_records (contact_id, purpose, status, lawful_basis, method, created_at)
select m.contact_id, p.key, d.status, d.lawful_basis, 'migrated',
       case d.status when 'withdrawn' then
                       case when m.status = 'unsubscribed' then coalesce(m.unsubscribed_at, m.created_at)
                            else (select coalesce((select s.at from app.crm_suppression s where s.email_hash = app.crm_hash(c.email) and s.reason in ('unsubscribed', 'spam')),
                                                  (select max(se.unsubscribed_at) from app.crm_sends se where se.contact_id = c.id), c.updated_at)
                                  from app.crm_contacts c where c.id = m.contact_id) end
                     when 'lapsed' then coalesce((select s.at from app.crm_suppression s join app.crm_contacts c on c.id = m.contact_id
                                                  where s.email_hash = app.crm_hash(c.email)), m.created_at)
                     else coalesce(m.subscribed_at, m.created_at) end
from app.crm_list_members m
join app.consent_purposes p on p.list_id = m.list_id
cross join lateral app.consent_derive(m.contact_id, p.key) d
where d.status is not null and d.status <> 'not_given';

-- ---------------------------------------------------------------- each path names its method
-- The functions that change consent, as 0055–0137 left them, with one line added: the method their
-- change is recorded under. Nothing else in them changes. (Admin functions not listed here are
-- recorded as 'admin' by the signed-in admin's role; crm_newsletter_signup changes no consent — it
-- asks for it — so it writes no record until the confirmation does.)
CREATE OR REPLACE FUNCTION public.admin_crm_company_import(p_rows jsonb, p_source text DEFAULT 'brreg'::text, p_tag text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  v_orgnr text;
  v_id uuid;
  v_email text;
  v_basis text;
  v_manager text;
  v_role text;
  v_old text;
  v_tag text := nullif(lower(btrim(coalesce(p_tag, ''))), '');
  v_tags text[];
  v_added int := 0;
  v_known int := 0;
  v_business int := 0;
  v_managers int := 0;
  v_skipped int := 0;
begin
  perform set_config('app.consent_via', 'import', true);  -- 0141: the ledger records the method
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 2000
     or (v_tag is not null and v_tag !~ '^[a-z0-9æøå_-]{1,40}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_orgnr := regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g');
    if v_orgnr !~ '^[0-9]{9}$' or char_length(btrim(coalesce(r->>'name', ''))) = 0 then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_role := case when r->>'manager_role' in ('DAGL', 'INNH') then r->>'manager_role' end;
    v_manager := case when v_role is not null and char_length(btrim(coalesce(r->>'manager_name', ''))) between 2 and 120
                      then btrim(r->>'manager_name') end;
    if v_manager is null then v_role := null; end if;
    v_tags := coalesce(array(select distinct t from unnest(string_to_array(lower(coalesce(r->>'tags', '')), ';') || v_tag) t
                             where t ~ '^[a-z0-9æøå_-]{1,40}$'), '{}');

    select id into v_id from app.crm_companies where product_id = 'orgpuls' and org_number = v_orgnr;
    if v_id is not null then
      v_known := v_known + 1;
      select manager_name into v_old from app.crm_companies where id = v_id;
      -- the register's address greets whoever the register names now, unless a person renamed it
      if v_manager is not null and v_manager is distinct from v_old then
        update app.crm_contacts c set name = v_manager, role = 'daglig_leder'
         where c.company_id = v_id and c.source = 'brreg' and (c.name is null or c.name = v_old);
      end if;
      update app.crm_companies c
         set manager_name = coalesce(v_manager, c.manager_name),
             manager_role = case when v_manager is not null then v_role else c.manager_role end,
             manager_seen_at = case when v_manager is not null then now() else c.manager_seen_at end,
             tags = array(select distinct t from unnest(c.tags || v_tags) t)
       where c.id = v_id;
    else
      insert into app.crm_companies (org_number, name, form_code, nace_code, nace_label, employees, municipality, municipality_no, website, phone,
                                     source, tags, manager_name, manager_role, manager_seen_at)
      values (v_orgnr, left(btrim(r->>'name'), 200), left(r->>'form_code', 10),
              case when r->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then r->>'nace_code' end, left(r->>'nace_label', 200),
              case when r->>'employees' ~ '^[0-9]{1,7}$' then (r->>'employees')::int end, left(r->>'municipality', 80),
              case when r->>'municipality_no' ~ '^[0-9]{4}$' then r->>'municipality_no' end,
              nullif(left(btrim(coalesce(r->>'website', '')), 300), ''), nullif(left(btrim(coalesce(r->>'phone', '')), 40), ''),
              case when p_source = 'import' then 'import' else 'brreg' end, v_tags,
              v_manager, v_role, case when v_manager is not null then now() end)
      returning id into v_id;
      v_added := v_added + 1;
      perform app.crm_log(v_id, null, 'stage', 'Lagt til fra ' || case when p_source = 'import' then 'import' else 'Brønnøysundregistrene' end);
    end if;
    if v_manager is not null then v_managers := v_managers + 1; end if;

    v_email := lower(btrim(coalesce(r->>'email', '')));
    if v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(v_email) <= 254 then
      v_basis := case when app.crm_role_address(v_email) and coalesce(r->>'form_code', '') <> 'ENK' then 'business' else 'none' end;
      insert into app.crm_contacts (email, name, company, org_number, company_id, role, source, basis, status, consent_source, tags)
      values (v_email, v_manager, left(btrim(r->>'name'), 200), v_orgnr, v_id,
              case when v_manager is not null then 'daglig_leder' end, 'brreg', v_basis, 'active',
              case when v_basis = 'business' then 'role address in Enhetsregisteret' end, v_tags)
      on conflict (product_id, email) do update
        set company_id = coalesce(app.crm_contacts.company_id, excluded.company_id),
            -- the register's manager greets the company address, unless a person has named it otherwise
            name = case when app.crm_contacts.source = 'brreg' then coalesce(excluded.name, app.crm_contacts.name) else app.crm_contacts.name end,
            role = case when app.crm_contacts.source = 'brreg' then coalesce(excluded.role, app.crm_contacts.role) else app.crm_contacts.role end,
            tags = array(select distinct t from unnest(app.crm_contacts.tags || excluded.tags) t);
      if v_basis = 'business' then v_business := v_business + 1; end if;
    end if;
  end loop;
  perform app.admin_log('crm.company_import', null, null, null, v_tag,
    jsonb_build_object('added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped);
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_crm_import(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  i int := 0;
  v_email text;
  v_at timestamptz;
  v_tags text[];
  v_inserted int := 0;
  v_updated int := 0;
  v_suppressed int := 0;
  v_rejected jsonb := '[]';
begin
  perform set_config('app.consent_via', 'import', true);  -- 0141: the ledger records the method
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 5000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_email := lower(btrim(coalesce(r->>'email', '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_email'); continue;
    end if;
    if char_length(btrim(coalesce(r->>'consent_source', ''))) < 3 then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'consent_required'); continue;
    end if;
    begin
      v_at := coalesce(nullif(btrim(coalesce(r->>'consent_at', '')), '')::timestamptz, now());
    exception when others then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_consent_at'); continue;
    end;
    if v_at > now() + interval '1 day' then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_consent_at'); continue;
    end if;
    if coalesce(r->>'role', '') <> '' and r->>'role' not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet') then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_role'); continue;
    end if;
    v_tags := array(select distinct t from unnest(string_to_array(lower(coalesce(r->>'tags', '')), ';')) t
                    where btrim(t) ~ '^[a-z0-9æøå_-]{1,40}$');
    if app.crm_suppressed(v_email) then v_suppressed := v_suppressed + 1; end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang)
    values (v_email, nullif(left(btrim(coalesce(r->>'name', '')), 120), ''), nullif(left(btrim(coalesce(r->>'company', '')), 200), ''),
            case when regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g') ~ '^[0-9]{9}$' then regexp_replace(r->>'org_number', '\s', '', 'g') end,
            nullif(r->>'role', ''), 'import', 'consent', 'active', v_at, left(btrim(r->>'consent_source'), 200),
            coalesce(v_tags, '{}'), case when r->>'lang' = 'en' then 'en' else 'no' end)
    on conflict (product_id, email) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    else
      update app.crm_contacts c set
        name = coalesce(c.name, nullif(left(btrim(coalesce(r->>'name', '')), 120), '')),
        company = coalesce(c.company, nullif(left(btrim(coalesce(r->>'company', '')), 200), '')),
        role = coalesce(c.role, nullif(r->>'role', '')),
        tags = array(select distinct t from unnest(c.tags || coalesce(v_tags, '{}')) t),
        updated_at = now()
      where c.product_id = 'orgpuls' and c.email = v_email;
      v_updated := v_updated + 1;
    end if;
  end loop;
  perform app.admin_log('crm.import', null, null, null, null,
    jsonb_build_object('rows', i, 'inserted', v_inserted, 'updated', v_updated, 'rejected', jsonb_array_length(v_rejected)));
  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated, 'suppressed', v_suppressed, 'rejected', v_rejected);
end $function$
;

CREATE OR REPLACE FUNCTION app.crm_sync()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform set_config('app.consent_via', 'account_sync', true);  -- 0141: the ledger records the method
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

  -- 0117: an account whose address changed. Its contact follows it to the new address; where
  -- another contact already holds that address (a subscriber who later signed up with it), the
  -- old contact lets go of the account and the upsert below attaches it to that one.
  update app.crm_contacts c set user_id = null, updated_at = now()
  from auth.users u
  where c.user_id = u.id and u.email is not null and c.email <> lower(btrim(u.email))
    and exists (select 1 from app.crm_contacts o where o.product_id = c.product_id and o.email = lower(btrim(u.email)) and o.id <> c.id);
  update app.crm_contacts c set email = lower(btrim(u.email)), updated_at = now()
  from auth.users u
  where c.user_id = u.id and u.email is not null and c.email <> lower(btrim(u.email))
    and lower(btrim(u.email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

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
end $function$
;

CREATE OR REPLACE FUNCTION app.demo_lead(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text;
  r       app.demo_requests;
begin
  perform set_config('app.consent_via', 'demo_request', true);  -- 0141: the ledger records the method
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
end $function$
;

CREATE OR REPLACE FUNCTION public.crm_confirm(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_contacts;
begin
  perform set_config('app.consent_via', 'double_opt_in', true);  -- 0141: the ledger records the method
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_c from app.crm_contacts c where c.optin_hash = app.crm_token_hash(p_token);
  if v_c.id is null or v_c.optin_sent_at < now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  update app.crm_contacts set basis = 'consent', status = 'active', consent_at = now(),
    consent_source = 'double opt-in (' || v_c.source || ')', optin_hash = null, last_engaged_at = now(), updated_at = now()
  where id = v_c.id;
  update app.crm_list_members set status = 'subscribed', subscribed_at = now(), unsubscribed_at = null
  where contact_id = v_c.id and status = 'pending';
  delete from app.crm_suppression where email_hash = app.crm_hash(v_c.email);
  return jsonb_build_object('ok', true, 'lang', v_c.lang);
end $function$
;

CREATE OR REPLACE FUNCTION public.crm_set_preferences(p_token text, p_lists text[], p_all_off boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s app.crm_sends;
  v_c app.crm_contacts;
  v_keys text[] := coalesce(p_lists, '{}');
begin
  perform set_config('app.consent_via', 'preference_centre', true);  -- 0141: the ledger records the method
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_s from app.crm_sends s where s.unsub_hash = app.crm_token_hash(p_token);
  select * into v_c from app.crm_contacts c where c.id = v_s.contact_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if coalesce(p_all_off, false) or cardinality(v_keys) = 0 then
    update app.crm_contacts set status = 'unsubscribed', updated_at = now() where id = v_c.id;
    update app.crm_list_members set status = 'unsubscribed', unsubscribed_at = now() where contact_id = v_c.id and status <> 'unsubscribed';
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_c.email), 'unsubscribed')
    on conflict (email_hash) do update set reason = 'unsubscribed', at = now();
    return jsonb_build_object('ok', true, 'all_off', true);
  end if;
  insert into app.crm_list_members (list_id, contact_id, status, source, subscribed_at)
  select l.id, v_c.id, 'subscribed', 'preference centre', now()
  from app.crm_lists l where l.public and l.archived_at is null and l.key = any (v_keys)
  on conflict (list_id, contact_id) do update set status = 'subscribed', subscribed_at = now(), unsubscribed_at = null
  where app.crm_list_members.status <> 'subscribed';
  update app.crm_list_members m set status = 'unsubscribed', unsubscribed_at = now()
  from app.crm_lists l
  where l.id = m.list_id and m.contact_id = v_c.id and l.public and not (l.key = any (v_keys)) and m.status <> 'unsubscribed';
  update app.crm_contacts set status = 'active', basis = 'consent',
    consent_at = case when basis = 'consent' then consent_at else now() end,
    consent_source = case when basis = 'consent' then consent_source else 'preference centre' end,
    last_engaged_at = now(), updated_at = now()
  where id = v_c.id;
  delete from app.crm_suppression where email_hash = app.crm_hash(v_c.email);
  return jsonb_build_object('ok', true, 'all_off', false);
end $function$
;

CREATE OR REPLACE FUNCTION public.crm_unsubscribe(p_token text, p_scope text DEFAULT 'list'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s app.crm_sends;
  v_list uuid;
  v_email text;
begin
  perform set_config('app.consent_via', 'one_click_unsubscribe', true);  -- 0141: the ledger records the method
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_s from app.crm_sends s where s.unsub_hash = app.crm_token_hash(p_token);
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select c.list_id into v_list from app.crm_campaigns c where c.id = v_s.campaign_id;
  update app.crm_sends set unsubscribed_at = coalesce(unsubscribed_at, now()) where id = v_s.id;
  if v_s.contact_id is null then
    return jsonb_build_object('ok', true, 'scope', 'none');
  end if;
  if p_scope = 'list' and v_list is not null then
    update app.crm_list_members set status = 'unsubscribed', unsubscribed_at = now()
    where list_id = v_list and contact_id = v_s.contact_id;
    return jsonb_build_object('ok', true, 'scope', 'list');
  end if;
  update app.crm_contacts set status = 'unsubscribed', updated_at = now() where id = v_s.contact_id returning email into v_email;
  update app.crm_list_members set status = 'unsubscribed', unsubscribed_at = now() where contact_id = v_s.contact_id and status <> 'unsubscribed';
  insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_email), 'unsubscribed')
  on conflict (email_hash) do update set reason = 'unsubscribed', at = now();
  return jsonb_build_object('ok', true, 'scope', 'all');
end $function$
;

CREATE OR REPLACE FUNCTION public.record_crm_event(p_event text, p_message_id text, p_at timestamp with time zone, p_link text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id text := btrim(coalesce(p_message_id, ''), '<> ');
  v_s app.crm_sends;
  v_email text;
  v_at timestamptz := least(coalesce(p_at, now()), now());
  v_url text;
  v_content text;
begin
  -- 0141: the ledger records the method: a complaint, an unsubscribe the provider handled, or a bounce
  perform set_config('app.consent_via', case when p_event = 'spam' then 'provider_complaint' when p_event = 'unsubscribed' then 'provider_unsubscribe' else 'provider_bounce' end, true);
  if v_id = '' then
    return jsonb_build_object('matched', false);
  end if;
  select * into v_s from app.crm_sends s where btrim(s.provider_id, '<> ') = v_id limit 1;
  if v_s.id is null then
    return jsonb_build_object('matched', false);
  end if;
  select c.email into v_email from app.crm_contacts c where c.id = v_s.contact_id;

  if p_event in ('opened', 'click') then
    update app.crm_sends set opened_at = coalesce(opened_at, v_at),
      clicked_at = case when p_event = 'click' then coalesce(clicked_at, v_at) else clicked_at end
    where id = v_s.id;
    update app.crm_contacts set last_engaged_at = greatest(coalesce(last_engaged_at, v_at), v_at) where id = v_s.contact_id;
    if p_event = 'click' and coalesce(p_link, '') ~ '^https?://' then
      v_url := left(split_part(split_part(p_link, '#', 1), '?', 1), 600);
      v_content := coalesce(substring(p_link from '[?&]utm_content=([a-z0-9_-]{1,60})'), '');
      insert into app.crm_clicks (send_id, url, content, first_at) values (v_s.id, v_url, v_content, v_at)
      on conflict (send_id, url, content) do update set clicks = app.crm_clicks.clicks + 1;
    end if;
  elsif p_event in ('delivered', 'soft_bounce', 'hard_bounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed', 'error') then
    update app.crm_sends set delivery = p_event::app.mail_delivery, delivery_at = v_at
    where id = v_s.id and (delivery_at is null or delivery_at <= v_at);
    if v_email is not null and p_event in ('hard_bounce', 'invalid', 'spam', 'blocked', 'unsubscribed') then
      insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_email), p_event)
      on conflict (email_hash) do nothing;
      if p_event in ('spam', 'unsubscribed') then
        update app.crm_contacts set status = 'unsubscribed', updated_at = now() where id = v_s.contact_id;
        update app.crm_sends set unsubscribed_at = coalesce(unsubscribed_at, v_at) where id = v_s.id;
      end if;
    end if;
  end if;
  return jsonb_build_object('matched', true);
end $function$
;


-- ============================================================ 2. the anonymity firewall
-- Each rule computed live, from the catalog and the rows. Nothing here returns a row of any table:
-- its evidence is structured — counts, and the names of database objects as data — and the Event
-- catalogue page words it through next-intl (admin.growth.events.firewall.evidence.<rule>).
-- growth_firewall_invariants.sql proves every rule passes and that each fails when broken, by each
-- mechanism it checks.
create function app.growth_firewall() returns table (seq int, rule text, pass boolean, evidence jsonb)
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
  -- the growth, CRM, event and consent tables
  v_scope constant text := '^(crm_|growth_|consent_|event_)|_events$';
  v_own constant text[] := array['event_catalogue', 'growth_events', 'consent_records', 'consent_purposes'];
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

-- ============================================================ 4. health score v1
-- 0–100 per organisation, the report's six components (§ 7.7), each with its points, its maximum and
-- what is missing (a key, which the page translates). Read from counts and dates the admin already
-- sees; never an answer. Customer NPS has no source in the schema: it scores 0 and says 'no_source',
-- health_parts marks it unsourced, and the score carries the reachable maximum (90) beside the 100 —
-- the page says so instead of listing NPS as something every customer falls short on.
--   survey_cycle   30  an active year wheel, and a round open or opened within the wheel's longest gap
--                      between rounds plus a month
--   action_items   25  a measure created or updated in the last 90 days
--   logins         15  two or more of the organisation's accounts signed in within 30 days
--   response_rate  15  the last closed round: 60 % or more all of it, 40 % or more half (rounded), as
--                      0060's account health draws the same lines
--   nps            10  no source
--   p1_tickets      5  no open urgent ticket
create function app.health_parts() returns table (ord int, key text, max int, sourced boolean)
  language sql immutable set search_path = ''
as $fn$
  values (1, 'survey_cycle', 30, true), (2, 'action_items', 25, true), (3, 'logins', 15, true), (4, 'response_rate', 15, true),
         (5, 'nps', 10, false), (6, 'p1_tickets', 5, true)
$fn$;
revoke all on function app.health_parts() from public, anon, authenticated;

create function app.health_score(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_max jsonb := (select jsonb_object_agg(h.key, h.max) from app.health_parts() h);
  w app.year_wheels;
  v_gap int;
  v_last timestamptz;
  v_open boolean;
  v_n bigint;
  v_inv bigint;
  v_ans bigint;
  v_round uuid;
  v_got jsonb := '{}';
  v_miss jsonb := '{}';
begin
  if not exists (select 1 from app.organizations o where o.id = p_org) then
    return null;
  end if;

  -- survey cycle
  select * into w from app.year_wheels y where y.org_id = p_org and y.active order by y.created_at desc limit 1;
  select exists (select 1 from app.rounds r where r.org_id = p_org and r.status = 'apen'),
         (select max(r.opens_at) from app.rounds r where r.org_id = p_org and r.status in ('apen', 'lukket') and r.opens_at <= now())
    into v_open, v_last;
  if w.id is null then
    v_miss := v_miss || '{"survey_cycle": "no_active_wheel"}';
  else
    select coalesce(max(g.gap), 12) into v_gap from (
      select coalesce(lead(m.month) over (order by m.month), first_value(m.month) over (order by m.month) + 12) - m.month as gap
      from app.wheel_months(w.cadence, w.baseline_month, w.skip_fellesferie) m) g;
    if v_open or v_last > now() - make_interval(months => v_gap + 1) then
      v_got := v_got || jsonb_build_object('survey_cycle', v_max->'survey_cycle');
    elsif v_last is null then
      v_miss := v_miss || '{"survey_cycle": "no_survey_yet"}';
    else
      v_miss := v_miss || '{"survey_cycle": "survey_overdue"}';
    end if;
  end if;

  -- action items
  if exists (select 1 from app.measures me where me.org_id = p_org and greatest(me.created_at, me.updated_at) > now() - interval '90 days') then
    v_got := v_got || jsonb_build_object('action_items', v_max->'action_items');
  else
    v_miss := v_miss || '{"action_items": "no_action_item_90d"}';
  end if;

  -- logins by two or more of the organisation's accounts
  select count(distinct m.user_id) into v_n
  from app.memberships m join auth.users u on u.id = m.user_id
  where m.org_id = p_org and m.active and u.last_sign_in_at > now() - interval '30 days';
  if v_n >= 2 then
    v_got := v_got || jsonb_build_object('logins', v_max->'logins');
  else
    v_miss := v_miss || '{"logins": "fewer_than_2_logins_30d"}';
  end if;

  -- response rate of the last closed round, as every screen counts it: responses over invitations
  select r.id into v_round from app.rounds r where r.org_id = p_org and r.status = 'lukket' order by r.closes_at desc nulls last limit 1;
  if v_round is null then
    v_miss := v_miss || '{"response_rate": "no_closed_round"}';
  else
    select count(*) into v_inv from app.invitations i where i.round_id = v_round;
    select count(*) into v_ans from app.responses x where x.round_id = v_round;
    if v_inv > 0 and v_ans::numeric / v_inv >= 0.6 then
      v_got := v_got || jsonb_build_object('response_rate', v_max->'response_rate');
    elsif v_inv > 0 and v_ans::numeric / v_inv >= 0.4 then
      v_got := v_got || jsonb_build_object('response_rate', round((v_max->>'response_rate')::numeric / 2));
      v_miss := v_miss || '{"response_rate": "response_rate_below_60"}';
    else
      v_miss := v_miss || '{"response_rate": "response_rate_below_40"}';
    end if;
  end if;

  -- customer NPS: nothing in the schema records it
  v_miss := v_miss || '{"nps": "no_source"}';

  -- no open P1 (urgent) ticket
  if exists (select 1 from app.tickets t where t.org_id = p_org and t.priority = 'urgent' and t.status not in ('resolved', 'closed')) then
    v_miss := v_miss || '{"p1_tickets": "open_p1_ticket"}';
  else
    v_got := v_got || jsonb_build_object('p1_tickets', v_max->'p1_tickets');
  end if;

  return (
    select jsonb_build_object('org_id', p_org, 'total', sum(coalesce((v_got->>h.key)::int, 0)), 'max', sum(h.max),
             'reachable', sum(h.max) filter (where h.sourced),
             'components', jsonb_agg(jsonb_build_object('key', h.key, 'max', h.max, 'points', coalesce((v_got->>h.key)::int, 0),
                                                        'missing', v_miss->>h.key) order by h.ord))
    from app.health_parts() h);
end $fn$;
revoke all on function app.health_score(uuid) from public, anon, authenticated;

-- ============================================================ 5. the Event catalogue page's read
-- Sentral › Growth › Event catalogue (design revision 3, `isEvents`): the catalogue with each event's
-- count over the last seven days, health score v1 with the lowest-scoring customers first, and the
-- firewall's rules as they stand now. For the roles that see Growth (lib/admin/access.ts: super_admin,
-- analyst, marketing), with the second factor, and audited.
create function public.admin_growth_events() returns jsonb
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
                                                          where g.name = e.name and g.occurred_at > now() - interval '7 days'))
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
                 from app.growth_firewall() f));
end $fn$;
revoke all on function public.admin_growth_events() from public, anon;
grant execute on function public.admin_growth_events() to authenticated;
