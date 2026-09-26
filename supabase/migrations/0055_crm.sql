-- 0055_crm.sql — the marketing CRM: contacts, consent, segments, campaigns (D-101, X-061).
--
-- The admin specification's Marketing CRM, Phase 2 basics. Contacts, consent and segments
-- live here, in Orgpuls' own database; the sending goes through the same provider as the
-- product's mail, on a separate marketing sender (the dispatcher refuses to send marketing
-- without one).
--
--   * **Respondents are never contacts.** A contact is either a person who signs in (an
--     auth user with a membership, synced by app.crm_sync) or a prospect who gave consent:
--     the newsletter's double opt-in, the contact form's checkbox, an import that names the
--     consent's source per row, or an admin who records it. Nothing here reads
--     app.employees, a response table or an invitation, and no column references them;
--     crm_invariants.sql proves both.
--   * **The basis is stored per contact** ('consent', 'customer', 'none'). Markedsføringsloven
--     § 15 allows mail to an existing customer about similar products without consent, only
--     if the customer could reserve themselves when the address was collected. Orgpuls' signup
--     does not offer that yet, so the exception is a setting, off until someone turns it on
--     with a reason (app.crm_settings).
--   * **Mailable** = active, not on the suppression list, a basis that allows it, and some
--     engagement (or the consent itself) within 12 months: the specification's list hygiene.
--   * **The suppression list holds hashes,** not addresses: sha256 of the lower-cased address.
--     It outlives an erased contact, so an erased person is not mailed again by a later
--     import; only their own double opt-in lifts it.
--   * **One-click unsubscribe.** Every marketing mail carries a token of its own; the database
--     keeps only its hash. crm_unsubscribe takes the token, anonymously, and acts at once.
--   * **Sends keep no address after sending.** The address is copied onto the send while it
--     waits, and cleared when the provider has it.
--   * **Reporting**: delivered, bounced, opened, clicked and unsubscribed per campaign, and
--     sessions and signups carrying its utm_campaign from the site's own analytics (0050).
--     Opens and clicks are recorded only for CRM sends; for the product's own mail they are
--     still dropped (D-97).
--
-- A new admin role, 'marketing', runs the CRM; 'super_admin' may too, and 'analyst' may read.
-- Every table has RLS with no policy and no grant. The admin functions require the second
-- factor (app.admin_role) and write to the audit log.

alter type app.platform_role add value if not exists 'marketing';

-- ---------------------------------------------------------------- helpers
create function app.crm_hash(p_email text) returns text
  language sql immutable set search_path = ''
as $fn$ select encode(extensions.digest(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8'), 'sha256'), 'hex') $fn$;

-- A token's hash, the same way the respondent tokens are kept.
create function app.crm_token_hash(p_token text) returns text
  language sql immutable set search_path = ''
as $fn$ select encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex') $fn$;

create function app.crm_new_token() returns text
  language sql volatile set search_path = ''
as $fn$ select encode(extensions.gen_random_bytes(32), 'hex') $fn$;

-- ---------------------------------------------------------------- tables
create table app.crm_settings (
  id boolean primary key default true check (id),
  customer_exception boolean not null default false,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz
);
insert into app.crm_settings (id) values (true);
alter table app.crm_settings enable row level security;
revoke all on app.crm_settings from public, anon, authenticated;

create table app.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'orgpuls',
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text check (char_length(name) between 1 and 120),
  company text check (char_length(company) between 1 and 200),
  org_number text check (org_number ~ '^[0-9]{9}$'),
  role text check (role in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet')),
  user_id uuid unique references auth.users (id) on delete set null,
  org_id uuid references app.organizations (id) on delete set null,
  source text not null check (source in ('user', 'newsletter', 'contact_form', 'import', 'manual', 'event')),
  basis text not null default 'none' check (basis in ('consent', 'customer', 'none')),
  status text not null default 'active' check (status in ('pending', 'active', 'unsubscribed')),
  consent_at timestamptz,
  consent_source text check (char_length(consent_source) between 3 and 200),
  optin_hash text unique check (optin_hash ~ '^[0-9a-f]{64}$'),
  optin_sent_at timestamptz,
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  lang text not null default 'no' check (lang in ('no', 'en')),
  last_engaged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, email),
  -- consent is a fact with a date and a source, or it is not consent
  check (basis <> 'consent' or (consent_at is not null and consent_source is not null))
);
create index crm_contacts_org on app.crm_contacts (org_id);
create index crm_contacts_tags on app.crm_contacts using gin (tags);
alter table app.crm_contacts enable row level security;
revoke all on app.crm_contacts from public, anon, authenticated;

create table app.crm_suppression (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('unsubscribed', 'hard_bounce', 'invalid', 'spam', 'blocked', 'manual', 'erased')),
  at timestamptz not null default now()
);
alter table app.crm_suppression enable row level security;
revoke all on app.crm_suppression from public, anon, authenticated;

create table app.crm_segments (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'orgpuls',
  name text not null check (char_length(btrim(name)) between 1 and 120),
  filter jsonb not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);
alter table app.crm_segments enable row level security;
revoke all on app.crm_segments from public, anon, authenticated;

create table app.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 101) unique,
  product_id text not null default 'orgpuls',
  name text not null check (char_length(btrim(name)) between 1 and 120),
  kind text not null default 'newsletter' check (kind in ('newsletter', 'campaign', 'promotion', 'announcement')),
  lang text not null default 'no' check (lang in ('no', 'en')),
  subject text not null default '' check (char_length(subject) <= 150),
  preheader text not null default '' check (char_length(preheader) <= 200),
  blocks jsonb not null default '[]',
  segment_id uuid references app.crm_segments (id) on delete set null,
  utm_campaign text not null check (utm_campaign ~ '^[a-z0-9_-]{1,60}$'),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  audience int,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_campaigns_due on app.crm_campaigns (scheduled_at) where status = 'scheduled';
alter table app.crm_campaigns enable row level security;
revoke all on app.crm_campaigns from public, anon, authenticated;

create table app.crm_sends (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('campaign', 'test', 'optin')),
  campaign_id uuid references app.crm_campaigns (id) on delete cascade,
  contact_id uuid references app.crm_contacts (id) on delete set null,
  to_email text check (char_length(to_email) <= 254),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  leased_until timestamptz,
  provider_id text,
  last_error text check (last_error ~ '^[a-z0-9_]{1,40}$'),
  unsub_hash text unique check (unsub_hash ~ '^[0-9a-f]{64}$'),
  delivery app.mail_delivery,
  delivery_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (kind = 'optin' or campaign_id is not null)
);
create unique index crm_sends_once on app.crm_sends (campaign_id, contact_id) where kind = 'campaign';
create index crm_sends_pending on app.crm_sends (created_at) where status in ('pending', 'sending');
create index crm_sends_provider on app.crm_sends (btrim(provider_id, '<> ')) where provider_id is not null;
create index crm_sends_contact on app.crm_sends (contact_id);
alter table app.crm_sends enable row level security;
revoke all on app.crm_sends from public, anon, authenticated;

-- ---------------------------------------------------------------- what a contact is
-- prospect: no account. trial: an account in an organisation that has not confirmed a plan.
-- customer: an account in one that has. former: an account with no active membership, or a
-- synced account that has since been deleted.
create function app.crm_type(p_user uuid, p_org uuid, p_source text) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select case
    when p_user is null then case when p_source = 'user' then 'former' else 'prospect' end
    when not exists (select 1 from app.memberships m where m.user_id = p_user and m.active) then 'former'
    when p_org is not null and app.org_access(p_org) = 'active' then 'customer'
    else 'trial'
  end
$fn$;

create function app.crm_suppressed(p_email text) returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select exists (select 1 from app.crm_suppression s where s.email_hash = app.crm_hash(p_email)) $fn$;

create function app.crm_mailable(c app.crm_contacts) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select c.status = 'active'
    and not app.crm_suppressed(c.email)
    and (c.basis = 'consent'
         or (c.basis = 'customer' and (select s.customer_exception from app.crm_settings s)
             and app.crm_type(c.user_id, c.org_id, c.source) = 'customer'))
    and coalesce(c.last_engaged_at, c.consent_at, c.created_at) > now() - interval '12 months'
$fn$;

-- Accounts become contacts, and stay current: organisation, name, role and basis. A basis
-- of consent is never downgraded; 'customer' follows the organisation's plan.
create function app.crm_sync() returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into app.crm_contacts (email, name, user_id, org_id, role, source, basis, lang)
  select lower(btrim(u.email)), nullif(left(btrim(coalesce(p.full_name, '')), 120), ''), u.id, m.org_id,
         case m.role::text when 'daglig_leder' then 'daglig_leder' when 'avdelingsleder' then 'leder' when 'verneombud' then 'verneombud' end,
         'user', 'none', case when p.lang = 'en' then 'en' else 'no' end
  from auth.users u
  join lateral (select m.org_id, m.role from app.memberships m where m.user_id = u.id
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

  update app.crm_contacts c set basis = x.basis, updated_at = now()
  from (select c2.id, case when app.crm_type(c2.user_id, c2.org_id, c2.source) = 'customer' then 'customer' else 'none' end as basis
        from app.crm_contacts c2 where c2.basis <> 'consent' and c2.user_id is not null) x
  where c.id = x.id and c.basis is distinct from x.basis;
end $fn$;

-- ---------------------------------------------------------------- segments
-- A filter is a small JSON object of known keys; anything else is refused.
create function app.crm_filter_ok(f jsonb) returns boolean
  language plpgsql immutable set search_path = ''
as $fn$
declare k text;
begin
  if f is null or jsonb_typeof(f) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(f) loop
    if k not in ('types', 'roles', 'sources', 'tags', 'lang', 'min_employees', 'max_employees', 'nace', 'no_survey_days', 'mailable_only') then
      return false;
    end if;
  end loop;
  if f ? 'types' and (jsonb_typeof(f->'types') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'types') v
      where v not in ('prospect', 'trial', 'customer', 'former'))) then return false; end if;
  if f ? 'roles' and (jsonb_typeof(f->'roles') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'roles') v
      where v not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet'))) then return false; end if;
  if f ? 'sources' and (jsonb_typeof(f->'sources') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'sources') v
      where v not in ('user', 'newsletter', 'contact_form', 'import', 'manual', 'event'))) then return false; end if;
  if f ? 'tags' and (jsonb_typeof(f->'tags') <> 'array' or jsonb_array_length(f->'tags') > 20 or exists (
      select 1 from jsonb_array_elements_text(f->'tags') v where v !~ '^[a-z0-9æøå_-]{1,40}$')) then return false; end if;
  if f ? 'lang' and (f->>'lang') not in ('no', 'en') then return false; end if;
  if f ? 'nace' and (f->>'nace') !~ '^[0-9]{2}(\.[0-9]{1,3})?$' then return false; end if;
  if f ? 'min_employees' and (jsonb_typeof(f->'min_employees') <> 'number' or (f->>'min_employees')::numeric not between 0 and 100000) then return false; end if;
  if f ? 'max_employees' and (jsonb_typeof(f->'max_employees') <> 'number' or (f->>'max_employees')::numeric not between 0 and 100000) then return false; end if;
  if f ? 'no_survey_days' and (jsonb_typeof(f->'no_survey_days') <> 'number' or (f->>'no_survey_days')::numeric not between 1 and 3650) then return false; end if;
  if f ? 'mailable_only' and jsonb_typeof(f->'mailable_only') <> 'boolean' then return false; end if;
  return true;
end $fn$;

-- The contacts a filter selects. "No survey in N days" reads rounds, never who was invited.
create function app.crm_segment_contacts(f jsonb) returns setof app.crm_contacts
  language sql stable security definer set search_path = ''
as $fn$
  select c.* from app.crm_contacts c
  left join app.organizations o on o.id = c.org_id
  where app.crm_filter_ok(f)
    and (not f ? 'types' or app.crm_type(c.user_id, c.org_id, c.source) in (select jsonb_array_elements_text(f->'types')))
    and (not f ? 'roles' or c.role in (select jsonb_array_elements_text(f->'roles')))
    and (not f ? 'sources' or c.source in (select jsonb_array_elements_text(f->'sources')))
    and (not f ? 'tags' or c.tags && array(select jsonb_array_elements_text(f->'tags')))
    and (not f ? 'lang' or c.lang = f->>'lang')
    and (not f ? 'min_employees' or coalesce(o.employee_count, 0) >= (f->>'min_employees')::numeric)
    and (not f ? 'max_employees' or coalesce(o.employee_count, 0) <= (f->>'max_employees')::numeric)
    and (not f ? 'nace' or o.registry_nace_code like (f->>'nace') || '%')
    and (not f ? 'no_survey_days' or (c.org_id is not null and not exists (
          select 1 from app.rounds r where r.org_id = c.org_id and r.status in ('apen', 'lukket')
            and r.opens_at > now() - make_interval(days => (f->>'no_survey_days')::int))))
    and (not coalesce((f->>'mailable_only')::boolean, false) or app.crm_mailable(c))
$fn$;

-- ---------------------------------------------------------------- campaign content
-- Blocks: heading, text or button. A button's address must be https.
create function app.crm_blocks_ok(b jsonb) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select jsonb_typeof(b) = 'array' and jsonb_array_length(b) between 1 and 30
    and not exists (
      select 1 from jsonb_array_elements(b) x
      where jsonb_typeof(x) <> 'object'
         or (x->>'type') is null or (x->>'type') not in ('heading', 'text', 'button')
         or char_length(btrim(coalesce(x->>'text', ''))) not between 1 and 3000
         or ((x->>'type') = 'heading' and char_length(x->>'text') > 150)
         or ((x->>'type') = 'button' and (char_length(x->>'text') > 60 or char_length(coalesce(x->>'url', '')) > 500
                                           or coalesce(x->>'url', '') !~ '^https://[^\s<>"]{3,}$'))
         or (select count(*) from jsonb_object_keys(x) k where k not in ('type', 'text', 'url')) > 0)
$fn$;

-- ---------------------------------------------------------------- the public side
-- The newsletter's double opt-in: called by the site's server actions (the contact form's
-- checkbox, a signup box). It always answers ok, so it cannot tell anyone whether an address
-- is known. A confirmation mail is queued at most once per ten minutes per address.
create function public.crm_newsletter_signup(p_email text, p_name text, p_company text, p_lang text, p_source text, p_trap text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_source text := case when p_source = 'contact_form' then 'contact_form' else 'newsletter' end;
  v_c app.crm_contacts;
begin
  if coalesce(p_trap, '') <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if (select count(*) from app.crm_sends s where s.kind = 'optin' and s.created_at > now() - interval '1 hour') >= 100 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into app.crm_contacts (email, name, company, source, basis, status, lang)
  values (v_email, nullif(left(btrim(coalesce(p_name, '')), 120), ''), nullif(left(btrim(coalesce(p_company, '')), 200), ''),
          v_source, 'none', 'pending', case when p_lang = 'en' then 'en' else 'no' end)
  on conflict (product_id, email) do nothing;
  select * into v_c from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email;

  -- already subscribed with consent and not suppressed: nothing to confirm
  if v_c.basis = 'consent' and v_c.status = 'active' and not app.crm_suppressed(v_email) then
    return jsonb_build_object('ok', true);
  end if;
  if v_c.optin_sent_at is not null and v_c.optin_sent_at > now() - interval '10 minutes' then
    return jsonb_build_object('ok', true);
  end if;
  update app.crm_contacts set optin_sent_at = now(), updated_at = now(),
    name = coalesce(name, nullif(left(btrim(coalesce(p_name, '')), 120), '')),
    company = coalesce(company, nullif(left(btrim(coalesce(p_company, '')), 200), ''))
  where id = v_c.id;
  insert into app.crm_sends (kind, contact_id, to_email) values ('optin', v_c.id, v_email);
  return jsonb_build_object('ok', true);
end $fn$;

-- The confirmation link's token: consent, with its date and source, and the suppression lifted.
create function public.crm_confirm(p_token text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c app.crm_contacts;
begin
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
  delete from app.crm_suppression where email_hash = app.crm_hash(v_c.email);
  return jsonb_build_object('ok', true, 'lang', v_c.lang);
end $fn$;

-- One-click unsubscribe: the mail's own token, honoured at once, and the address suppressed.
create function public.crm_unsubscribe(p_token text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_s app.crm_sends;
  v_email text;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_s from app.crm_sends s where s.unsub_hash = app.crm_token_hash(p_token);
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update app.crm_sends set unsubscribed_at = coalesce(unsubscribed_at, now()) where id = v_s.id;
  if v_s.contact_id is not null then
    update app.crm_contacts set status = 'unsubscribed', updated_at = now() where id = v_s.contact_id returning email into v_email;
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_email), 'unsubscribed')
    on conflict (email_hash) do update set reason = 'unsubscribed', at = now();
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- the dispatcher's side
-- Starts due campaigns (each mailable contact in the segment gets one send), closes finished
-- ones, and leases up to p_batch sends for two minutes. Each lease mints the mail's token and
-- keeps its hash: an unsubscribe token for a campaign or test, the confirmation for an opt-in.
-- A contact who became unmailable while the send waited is skipped. Service role only.
create function public.crm_mail_claim(p_batch int default 25) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c record;
  v_n int;
  v_jobs jsonb := '[]';
  v_s record;
  v_token text;
begin
  for v_c in select * from app.crm_campaigns where status = 'scheduled' and scheduled_at <= now() for update skip locked loop
    insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
    select 'campaign', v_c.id, s.id, s.email
    from (select distinct on (x.id) x.* from app.crm_segment_contacts(coalesce((select g.filter from app.crm_segments g where g.id = v_c.segment_id), '{"types":[]}')) x) s
    where app.crm_mailable(s) and (s.lang = v_c.lang or v_c.lang is null)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    update app.crm_campaigns set status = 'sending', started_at = now(), audience = v_n, updated_at = now() where id = v_c.id;
  end loop;

  update app.crm_campaigns c set status = 'sent', finished_at = now(), updated_at = now()
  where c.status = 'sending' and not exists (select 1 from app.crm_sends s where s.campaign_id = c.id and s.status in ('pending', 'sending'));

  for v_s in
    select s.id, s.kind, s.campaign_id, s.contact_id, s.to_email from app.crm_sends s
    where (s.status = 'pending' or (s.status = 'sending' and s.leased_until < now())) and s.attempts < 5
    order by s.created_at limit least(greatest(coalesce(p_batch, 25), 1), 50)
    for update skip locked
  loop
    if v_s.kind = 'campaign' and not coalesce((select app.crm_mailable(c) from app.crm_contacts c where c.id = v_s.contact_id), false) then
      update app.crm_sends set status = 'skipped', to_email = null where id = v_s.id;
      continue;
    end if;
    if v_s.kind = 'optin' and exists (select 1 from app.crm_contacts c where c.id = v_s.contact_id and c.basis = 'consent' and c.status = 'active') then
      update app.crm_sends set status = 'skipped', to_email = null where id = v_s.id;
      continue;
    end if;
    v_token := app.crm_new_token();
    if v_s.kind = 'optin' then
      update app.crm_contacts set optin_hash = app.crm_token_hash(v_token) where id = v_s.contact_id;
      update app.crm_sends set status = 'sending', leased_until = now() + interval '2 minutes', attempts = attempts + 1 where id = v_s.id;
    else
      update app.crm_sends set status = 'sending', leased_until = now() + interval '2 minutes', attempts = attempts + 1,
        unsub_hash = app.crm_token_hash(v_token) where id = v_s.id;
    end if;
    v_jobs := v_jobs || jsonb_build_object(
      'id', v_s.id, 'kind', v_s.kind, 'to_email', v_s.to_email, 'token', v_token,
      'name', (select c.name from app.crm_contacts c where c.id = v_s.contact_id),
      'lang', coalesce((select g.lang from app.crm_campaigns g where g.id = v_s.campaign_id),
                       (select c.lang from app.crm_contacts c where c.id = v_s.contact_id), 'no'),
      'campaign', (select jsonb_build_object('kind', g.kind, 'subject', g.subject, 'preheader', g.preheader, 'blocks', g.blocks,
                                             'utm_campaign', g.utm_campaign)
                   from app.crm_campaigns g where g.id = v_s.campaign_id));
  end loop;
  return v_jobs;
end $fn$;

-- The address is cleared once the provider has the mail.
create function public.crm_mail_done(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null, p_permanent boolean default false)
  returns void
  language sql security definer set search_path = ''
as $fn$
  update app.crm_sends set
    status = case when p_ok then 'sent' when p_permanent or attempts >= 5 then 'failed' else 'pending' end,
    provider_id = case when p_ok then left(p_provider_id, 200) else provider_id end,
    sent_at = case when p_ok then now() else sent_at end,
    to_email = case when p_ok or p_permanent or attempts >= 5 then null else to_email end,
    last_error = case when p_ok then null else left(regexp_replace(lower(coalesce(p_error, 'unknown')), '[^a-z0-9_]', '_', 'g'), 40) end,
    leased_until = null
  where id = p_id
$fn$;

-- A provider event for a CRM send: delivery state, opens and clicks, and what suppresses the
-- address. Returns matched = false for any other mail, which is then left to
-- record_mail_event; an open or a click of the product's own mail is never stored.
create function public.record_crm_event(p_event text, p_message_id text, p_at timestamptz) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id text := btrim(coalesce(p_message_id, ''), '<> ');
  v_s app.crm_sends;
  v_email text;
  v_at timestamptz := least(coalesce(p_at, now()), now());
begin
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
end $fn$;

-- ---------------------------------------------------------------- admin: gates
create function app.crm_can_read() returns boolean
  language plpgsql stable security definer set search_path = ''
as $fn$ begin return app.is_platform_admin(array['super_admin', 'marketing', 'analyst']::app.platform_role[]); end $fn$;

create function app.crm_can_write() returns boolean
  language plpgsql stable security definer set search_path = ''
as $fn$ begin return app.is_platform_admin(array['super_admin', 'marketing']::app.platform_role[]); end $fn$;

create function app.crm_contact_json(c app.crm_contacts) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'id', c.id, 'email', c.email, 'name', c.name, 'company', coalesce(c.company, o.name), 'org_number', coalesce(c.org_number, o.org_number),
    'org_id', c.org_id, 'org_name', o.name, 'role', c.role, 'source', c.source, 'basis', c.basis, 'status', c.status,
    'type', app.crm_type(c.user_id, c.org_id, c.source), 'mailable', app.crm_mailable(c), 'suppressed', app.crm_suppressed(c.email),
    'consent_at', c.consent_at, 'consent_source', c.consent_source, 'tags', to_jsonb(c.tags), 'lang', c.lang,
    'last_engaged_at', c.last_engaged_at, 'created_at', c.created_at)
  from (select 1) one left join app.organizations o on o.id = c.org_id
$fn$;

-- ---------------------------------------------------------------- admin: contacts
create function public.admin_crm_contacts(p_q text default null, p_type text default null, p_limit int default 200) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.contacts', null, null, null, null, jsonb_build_object('q', v_q is not null, 'type', p_type));
  return jsonb_build_object('ok', true,
    'counts', (select jsonb_build_object(
        'total', count(*),
        'prospect', count(*) filter (where t = 'prospect'), 'trial', count(*) filter (where t = 'trial'),
        'customer', count(*) filter (where t = 'customer'), 'former', count(*) filter (where t = 'former'),
        'mailable', count(*) filter (where m), 'pending', count(*) filter (where st = 'pending'),
        'unsubscribed', count(*) filter (where st = 'unsubscribed'))
      from (select app.crm_type(c.user_id, c.org_id, c.source) t, app.crm_mailable(c) m, c.status st from app.crm_contacts c) x),
    'suppressed', (select count(*) from app.crm_suppression),
    'customer_exception', (select s.customer_exception from app.crm_settings s),
    'waiting', (select count(*) from app.crm_sends s where s.status in ('pending', 'sending')),
    'rows', (select coalesce(jsonb_agg(app.crm_contact_json(c) order by c.created_at desc), '[]') from (
        select c.* from app.crm_contacts c left join app.organizations o on o.id = c.org_id
        where (v_q is null or c.email like '%' || v_q || '%' or lower(coalesce(c.name, '')) like '%' || v_q || '%'
               or lower(coalesce(c.company, o.name, '')) like '%' || v_q || '%' or v_q = any (c.tags))
          and (p_type is null or app.crm_type(c.user_id, c.org_id, c.source) = p_type)
        order by c.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) c));
end $fn$;

create function public.admin_crm_contact(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c app.crm_contacts;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_contacts where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.contact', v_c.org_id, 'crm_contact', p_id::text);
  return jsonb_build_object('ok', true, 'contact', app.crm_contact_json(v_c),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', s.kind, 'campaign_id', s.campaign_id, 'campaign', g.name, 'status', s.status, 'created_at', s.created_at,
        'sent_at', s.sent_at, 'delivery', s.delivery, 'opened_at', s.opened_at, 'clicked_at', s.clicked_at,
        'unsubscribed_at', s.unsubscribed_at) order by s.created_at desc), '[]')
      from app.crm_sends s left join app.crm_campaigns g on g.id = s.campaign_id where s.contact_id = p_id));
end $fn$;

-- Create a prospect (consent recorded by the admin, with its source and date) or edit one.
-- The address of an existing contact is not changed here; an account's is its own.
create function public.admin_crm_save_contact(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_tags text[];
  v_consent_at timestamptz;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p ? 'tags' then
    if jsonb_typeof(p->'tags') <> 'array' or jsonb_array_length(p->'tags') > 20
       or exists (select 1 from jsonb_array_elements_text(p->'tags') t where t !~ '^[a-z0-9æøå_-]{1,40}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_tags');
    end if;
    v_tags := array(select distinct jsonb_array_elements_text(p->'tags'));
  end if;
  if coalesce(p->>'role', '') <> '' and p->>'role' not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  if coalesce(p->>'org_number', '') <> '' and regexp_replace(p->>'org_number', '\s', '', 'g') !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;

  if v_id is null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      return jsonb_build_object('ok', false, 'error', 'invalid_email');
    end if;
    if char_length(btrim(coalesce(p->>'consent_source', ''))) < 3 then
      return jsonb_build_object('ok', false, 'error', 'consent_required');
    end if;
    begin
      v_consent_at := coalesce(nullif(p->>'consent_at', '')::timestamptz, now());
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
    end;
    if v_consent_at > now() + interval '1 day' then
      return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
    end if;
    if exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang)
    values (v_email, nullif(left(btrim(coalesce(p->>'name', '')), 120), ''), nullif(left(btrim(coalesce(p->>'company', '')), 200), ''),
            nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), ''), nullif(p->>'role', ''),
            case when p->>'source' = 'event' then 'event' else 'manual' end, 'consent', 'active', v_consent_at,
            left(btrim(p->>'consent_source'), 200), coalesce(v_tags, '{}'), case when p->>'lang' = 'en' then 'en' else 'no' end)
    returning id into v_id;
    perform app.admin_log('crm.contact_create', null, 'crm_contact', v_id::text, null, jsonb_build_object('consent_source', left(btrim(p->>'consent_source'), 200)));
  else
    update app.crm_contacts c set
      name = case when p ? 'name' then nullif(left(btrim(coalesce(p->>'name', '')), 120), '') else c.name end,
      company = case when p ? 'company' then nullif(left(btrim(coalesce(p->>'company', '')), 200), '') else c.company end,
      org_number = case when p ? 'org_number' then nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), '') else c.org_number end,
      role = case when p ? 'role' then nullif(p->>'role', '') else c.role end,
      tags = coalesce(v_tags, c.tags),
      lang = case when p->>'lang' in ('no', 'en') then p->>'lang' else c.lang end,
      updated_at = now()
    where c.id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    perform app.admin_log('crm.contact_update', null, 'crm_contact', v_id::text, null, p - 'email' - 'consent_source' - 'consent_at');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- CSV import, parsed by the admin: every row must name where its consent came from. A new
-- address becomes a consented prospect; a known one gets its empty fields and tags filled,
-- never its status or basis changed. Suppressed addresses are imported but stay suppressed.
create function public.admin_crm_import(p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
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
end $fn$;

-- Unsubscribe on someone's behalf (asked by phone, by mail), or erase the contact entirely.
-- Either way the address's hash goes on the suppression list.
create function public.admin_crm_contact_action(p_id uuid, p_action text, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c app.crm_contacts;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_c from app.crm_contacts where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_action = 'unsubscribe' then
    update app.crm_contacts set status = 'unsubscribed', updated_at = now() where id = p_id;
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_c.email), 'manual') on conflict (email_hash) do nothing;
  elsif p_action = 'erase' then
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_c.email), 'erased')
    on conflict (email_hash) do update set reason = 'erased', at = now();
    delete from app.crm_sends where contact_id = p_id and status in ('pending', 'sending');
    delete from app.crm_contacts where id = p_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('crm.contact_' || p_action, v_c.org_id, 'crm_contact', p_id::text, p_reason);
  return jsonb_build_object('ok', true);
end $fn$;

create function public.admin_crm_settings(p_customer_exception boolean, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  update app.crm_settings set customer_exception = coalesce(p_customer_exception, false), changed_by = auth.uid(), changed_at = now();
  perform app.admin_log('crm.settings', null, null, null, p_reason, jsonb_build_object('customer_exception', coalesce(p_customer_exception, false)));
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- admin: segments
create function public.admin_crm_segments() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.segments');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'filter', g.filter, 'updated_at', g.updated_at,
      'total', (select count(*) from app.crm_segment_contacts(g.filter)),
      'mailable', (select count(*) from app.crm_segment_contacts(g.filter) c where app.crm_mailable(c))) order by g.name), '[]')
    from app.crm_segments g));
end $fn$;

create function public.admin_crm_segment_preview(p_filter jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_filter_ok(p_filter) then
    return jsonb_build_object('ok', false, 'error', 'invalid_filter');
  end if;
  perform app.crm_sync();
  return jsonb_build_object('ok', true,
    'total', (select count(*) from app.crm_segment_contacts(p_filter)),
    'mailable', (select count(*) from app.crm_segment_contacts(p_filter) c where app.crm_mailable(c)),
    'sample', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'email', c.email, 'name', c.name,
                 'type', app.crm_type(c.user_id, c.org_id, c.source), 'mailable', app.crm_mailable(c))), '[]')
               from (select * from app.crm_segment_contacts(p_filter) limit 20) c));
end $fn$;

create function public.admin_crm_segment_save(p_id uuid, p_name text, p_filter jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if not app.crm_filter_ok(p_filter) then
    return jsonb_build_object('ok', false, 'error', 'invalid_filter');
  end if;
  if exists (select 1 from app.crm_segments g where g.product_id = 'orgpuls' and g.name = btrim(p_name) and g.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  if v_id is null then
    insert into app.crm_segments (name, filter, created_by) values (btrim(p_name), p_filter, auth.uid()) returning id into v_id;
  else
    update app.crm_segments set name = btrim(p_name), filter = p_filter, updated_at = now() where id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  perform app.admin_log('crm.segment_save', null, 'crm_segment', v_id::text, null, jsonb_build_object('name', btrim(p_name), 'filter', p_filter));
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

create function public.admin_crm_segment_delete(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if exists (select 1 from app.crm_campaigns c where c.segment_id = p_id and c.status in ('scheduled', 'sending')) then
    return jsonb_build_object('ok', false, 'error', 'in_use');
  end if;
  delete from app.crm_segments where id = p_id;
  perform app.admin_log('crm.segment_delete', null, 'crm_segment', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- admin: campaigns
create function app.crm_campaign_stats(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'queued', count(*) filter (where s.status in ('pending', 'sending')),
    'sent', count(*) filter (where s.status = 'sent'),
    'failed', count(*) filter (where s.status = 'failed'),
    'skipped', count(*) filter (where s.status = 'skipped'),
    'delivered', count(*) filter (where s.delivery = 'delivered'),
    'bounced', count(*) filter (where s.delivery in ('hard_bounce', 'soft_bounce', 'invalid', 'blocked')),
    'opened', count(*) filter (where s.opened_at is not null),
    'clicked', count(*) filter (where s.clicked_at is not null),
    'unsubscribed', count(*) filter (where s.unsubscribed_at is not null),
    'complaints', count(*) filter (where s.delivery = 'spam'))
  from app.crm_sends s where s.campaign_id = p_id and s.kind = 'campaign'
$fn$;

create function public.admin_crm_campaigns() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.campaigns');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'name', c.name, 'kind', c.kind, 'status', c.status,
      'subject', c.subject, 'segment', g.name, 'scheduled_at', c.scheduled_at, 'finished_at', c.finished_at, 'audience', c.audience,
      'utm_campaign', c.utm_campaign, 'stats', app.crm_campaign_stats(c.id)) order by c.created_at desc), '[]')
    from app.crm_campaigns c left join app.crm_segments g on g.id = c.segment_id));
end $fn$;

create function public.admin_crm_campaign(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c app.crm_campaigns;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.campaign', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true,
    'campaign', to_jsonb(v_c) - 'product_id' - 'created_by',
    'stats', app.crm_campaign_stats(p_id),
    -- the site's own analytics: visits carrying the campaign's tag, and organisations that did
    'web', jsonb_build_object(
      'sessions', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.utm_campaign = v_c.utm_campaign),
      'views', (select count(*) from app.web_events e where e.utm_campaign = v_c.utm_campaign and e.kind = 'view'),
      'signups', (select count(*) from app.org_attribution a where v_c.utm_campaign in (a.first_campaign, a.last_campaign)),
      'paid', (select count(*) from app.org_attribution a join app.billing b on b.org_id = a.org_id
               where v_c.utm_campaign in (a.first_campaign, a.last_campaign) and b.confirmed_at is not null)),
    'tests', (select count(*) from app.crm_sends s where s.campaign_id = p_id and s.kind = 'test'));
end $fn$;

create function public.admin_crm_campaign_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
  v_status text;
  v_utm text := lower(btrim(coalesce(p->>'utm_campaign', '')));
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if coalesce(p->>'kind', 'newsletter') not in ('newsletter', 'campaign', 'promotion', 'announcement') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if v_utm = '' then
    v_utm := left(trim(both '-' from regexp_replace(translate(replace(lower(p->>'name'), 'æ', 'ae'), 'øå', 'oa'), '[^a-z0-9]+', '-', 'g')), 60);
  end if;
  if v_utm !~ '^[a-z0-9_-]{1,60}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_utm');
  end if;
  if char_length(coalesce(p->>'subject', '')) > 150 or char_length(coalesce(p->>'preheader', '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if p ? 'blocks' and jsonb_array_length(coalesce(p->'blocks', '[]')) > 0 and not app.crm_blocks_ok(p->'blocks') then
    return jsonb_build_object('ok', false, 'error', 'invalid_blocks');
  end if;
  if nullif(p->>'segment_id', '') is not null and not exists (select 1 from app.crm_segments g where g.id = (p->>'segment_id')::uuid) then
    return jsonb_build_object('ok', false, 'error', 'invalid_segment');
  end if;

  if v_id is null then
    insert into app.crm_campaigns (name, kind, lang, subject, preheader, blocks, segment_id, utm_campaign, created_by)
    values (btrim(p->>'name'), coalesce(p->>'kind', 'newsletter'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            coalesce(p->>'subject', ''), coalesce(p->>'preheader', ''), coalesce(p->'blocks', '[]'),
            nullif(p->>'segment_id', '')::uuid, v_utm, auth.uid())
    returning id into v_id;
  else
    select status into v_status from app.crm_campaigns where id = v_id;
    if v_status is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_status <> 'draft' then
      return jsonb_build_object('ok', false, 'error', 'not_draft');
    end if;
    update app.crm_campaigns set name = btrim(p->>'name'), kind = coalesce(p->>'kind', kind),
      lang = case when p->>'lang' in ('no', 'en') then p->>'lang' else lang end,
      subject = coalesce(p->>'subject', subject), preheader = coalesce(p->>'preheader', preheader),
      blocks = coalesce(p->'blocks', blocks), segment_id = nullif(p->>'segment_id', '')::uuid,
      utm_campaign = v_utm, updated_at = now()
    where id = v_id;
  end if;
  perform app.admin_log('crm.campaign_save', null, 'crm_campaign', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- What a campaign needs before anything is sent: a subject, valid blocks and a segment.
create function app.crm_campaign_ready(c app.crm_campaigns) returns text
  language sql stable set search_path = ''
as $fn$
  select case
    when char_length(btrim(c.subject)) = 0 then 'no_subject'
    when not app.crm_blocks_ok(c.blocks) then 'invalid_blocks'
    when c.segment_id is null then 'no_segment'
  end
$fn$;

-- A test goes to the admin's own address only, ten an hour at most.
create function public.admin_crm_campaign_test(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c app.crm_campaigns;
  v_why text;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_why := case when char_length(btrim(v_c.subject)) = 0 then 'no_subject' when not app.crm_blocks_ok(v_c.blocks) then 'invalid_blocks' end;
  if v_why is not null then
    return jsonb_build_object('ok', false, 'error', v_why);
  end if;
  if (select count(*) from app.crm_sends s where s.kind = 'test' and s.created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  insert into app.crm_sends (kind, campaign_id, to_email)
  select 'test', p_id, lower(u.email) from auth.users u where u.id = auth.uid();
  perform app.admin_log('crm.campaign_test', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true, 'to', (select lower(u.email) from auth.users u where u.id = auth.uid()));
end $fn$;

create function public.admin_crm_campaign_schedule(p_id uuid, p_at timestamptz) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c app.crm_campaigns;
  v_why text;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id for update;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_c.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;
  v_why := app.crm_campaign_ready(v_c);
  if v_why is not null then
    return jsonb_build_object('ok', false, 'error', v_why);
  end if;
  if p_at is null or p_at < now() - interval '5 minutes' or p_at > now() + interval '366 days' then
    return jsonb_build_object('ok', false, 'error', 'invalid_time');
  end if;
  update app.crm_campaigns set status = 'scheduled', scheduled_at = greatest(p_at, now()), updated_at = now() where id = p_id;
  perform app.admin_log('crm.campaign_schedule', null, 'crm_campaign', p_id::text, null, jsonb_build_object('at', p_at));
  return jsonb_build_object('ok', true);
end $fn$;

-- A scheduled campaign goes back to draft; one that is sending stops, and what has not gone is skipped.
create function public.admin_crm_campaign_cancel(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_status text;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select status into v_status from app.crm_campaigns where id = p_id for update;
  if v_status = 'scheduled' then
    update app.crm_campaigns set status = 'draft', scheduled_at = null, updated_at = now() where id = p_id;
  elsif v_status = 'sending' then
    update app.crm_sends set status = 'skipped', to_email = null where campaign_id = p_id and status = 'pending';
    update app.crm_campaigns set status = 'cancelled', finished_at = now(), updated_at = now() where id = p_id;
  else
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;
  perform app.admin_log('crm.campaign_cancel', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- the marketing role
-- admin_set_admin (0049) knew four roles; it now knows five.
create or replace function public.admin_set_admin(p_email text, p_role text, p_active boolean, p_reason text) returns jsonb
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
  if p_role is null or p_role not in ('super_admin', 'support', 'finance', 'analyst', 'marketing') then
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
  -- internal helpers: no client
  foreach f in array array[
    'app.crm_hash(text)', 'app.crm_token_hash(text)', 'app.crm_new_token()', 'app.crm_type(uuid,uuid,text)',
    'app.crm_suppressed(text)', 'app.crm_mailable(app.crm_contacts)', 'app.crm_sync()', 'app.crm_filter_ok(jsonb)',
    'app.crm_segment_contacts(jsonb)', 'app.crm_blocks_ok(jsonb)', 'app.crm_can_read()', 'app.crm_can_write()',
    'app.crm_contact_json(app.crm_contacts)', 'app.crm_campaign_stats(uuid)', 'app.crm_campaign_ready(app.crm_campaigns)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- the site: anyone
  foreach f in array array['public.crm_newsletter_signup(text,text,text,text,text,text)', 'public.crm_confirm(text)', 'public.crm_unsubscribe(text)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  -- the admin: signed in, and the function checks the role and the second factor
  foreach f in array array[
    'public.admin_crm_contacts(text,text,int)', 'public.admin_crm_contact(uuid)', 'public.admin_crm_save_contact(uuid,jsonb)',
    'public.admin_crm_import(jsonb)', 'public.admin_crm_contact_action(uuid,text,text)', 'public.admin_crm_settings(boolean,text)',
    'public.admin_crm_segments()', 'public.admin_crm_segment_preview(jsonb)', 'public.admin_crm_segment_save(uuid,text,jsonb)',
    'public.admin_crm_segment_delete(uuid)', 'public.admin_crm_campaigns()', 'public.admin_crm_campaign(uuid)',
    'public.admin_crm_campaign_save(uuid,jsonb)', 'public.admin_crm_campaign_test(uuid)',
    'public.admin_crm_campaign_schedule(uuid,timestamptz)', 'public.admin_crm_campaign_cancel(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- the dispatcher and the event hook: service role only
  foreach f in array array['public.crm_mail_claim(int)', 'public.crm_mail_done(uuid,boolean,text,text,boolean)',
                           'public.record_crm_event(text,text,timestamptz)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
