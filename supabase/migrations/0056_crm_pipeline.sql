-- 0056_crm_pipeline.sql — prospects, lists, templates, A/B tests and a web archive (D-103, X-062).
--
-- The CRM of 0055 grows into what a small B2B sales team uses day to day:
--
--   * **Companies and a pipeline.** app.crm_companies holds every organisation we sell to or
--     serve: prospects added by hand, imported from a CSV or picked from Brønnøysund's open
--     register, and every customer organisation (synced). A stage (new → contacted → engaged
--     → meeting → trial → customer, or lost / not relevant), an owner, a next step with a
--     date, and an activity log (notes, calls, meetings, tasks, stage changes). A company
--     that signs up is linked by org.nr and its stage follows its plan from then on.
--   * **E-mail lists.** Subscriptions per purpose (the newsletter, product news, events,
--     offers), each with its own consent: a person joins a list by double opt-in or by an
--     admin who records the consent. A campaign goes to a list (optionally narrowed by a
--     segment) or to a segment. One-click unsubscribe leaves that list; the preference
--     centre, reached from any mail's token, sets every list or leaves them all.
--   * **A business-address basis.** Markedsføringsloven § 15 governs e-mail to natural
--     persons. A company's own role address (post@, firmapost@, kontakt@ …) taken from the
--     register is not a person, so it may receive a relevant B2B offer without consent, with
--     an opt-out in every mail. Only such role addresses get basis 'business'; an address
--     that looks like a person's, and any enkeltpersonforetak, gets none.
--   * **Templates as data.** Six seeded templates (newsletter, product news, event
--     invitation, offer, trial onboarding, first contact), block by block, for the editor
--     to start from. New block kinds: article, bullet list, image with alt text, event,
--     quote, divider and P.S. A 'letter' style renders a plain personal mail, as first
--     contact should look.
--   * **A/B subject tests.** A share of the audience (10–50 %) gets subject A or B; after a
--     wait the one with the better open or click rate goes to everyone else.
--   * **Click map.** A click is stored per send and link (path and utm_content), never
--     with a query string, so no token reaches the table.
--   * **Web archive.** A newsletter or announcement can be published at
--     /nyhetsbrev/arkiv/<slug> once it has gone out: the same content, no personal data.
--
-- Every new table has RLS on, no policy and no client grant. Respondents are still never
-- contacts: nothing here references or reads the employee, invitation or answer tables.

-- ---------------------------------------------------------------- companies
create table app.crm_companies (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'orgpuls',
  org_number text check (org_number ~ '^[0-9]{9}$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  form_code text check (char_length(form_code) <= 10),
  nace_code text check (nace_code ~ '^[0-9]{2}(\.[0-9]{1,3})?$'),
  nace_label text check (char_length(nace_label) <= 200),
  employees int check (employees between 0 and 1000000),
  municipality text check (char_length(municipality) <= 80),
  municipality_no text check (municipality_no ~ '^[0-9]{4}$'),
  website text check (char_length(website) <= 300),
  phone text check (char_length(phone) <= 40),
  source text not null default 'manual' check (source in ('brreg', 'import', 'manual', 'signup')),
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'engaged', 'meeting', 'trial', 'customer', 'lost', 'not_relevant')),
  stage_changed_at timestamptz not null default now(),
  owner_id uuid references auth.users (id) on delete set null,
  next_step text check (char_length(next_step) <= 300),
  next_step_at date,
  lost_reason text check (char_length(lost_reason) <= 300),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  org_id uuid unique references app.organizations (id) on delete set null,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index crm_companies_orgnr on app.crm_companies (product_id, org_number) where org_number is not null;
create index crm_companies_stage on app.crm_companies (stage);
alter table app.crm_companies enable row level security;
revoke all on app.crm_companies from public, anon, authenticated;

create table app.crm_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.crm_companies (id) on delete cascade,
  contact_id uuid references app.crm_contacts (id) on delete set null,
  kind text not null check (kind in ('note', 'call', 'meeting', 'email', 'task', 'stage')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  due_at date,
  done_at timestamptz,
  admin_id uuid references auth.users (id) on delete set null,
  admin_email text,
  created_at timestamptz not null default now()
);
create index crm_activities_company on app.crm_activities (company_id, created_at desc);
create index crm_activities_open on app.crm_activities (due_at) where kind = 'task' and done_at is null;
alter table app.crm_activities enable row level security;
revoke all on app.crm_activities from public, anon, authenticated;

alter table app.crm_contacts add column company_id uuid references app.crm_companies (id) on delete set null;
create index crm_contacts_company on app.crm_contacts (company_id);
alter table app.crm_contacts drop constraint crm_contacts_basis_check;
alter table app.crm_contacts add constraint crm_contacts_basis_check check (basis in ('consent', 'customer', 'business', 'none'));
alter table app.crm_contacts drop constraint crm_contacts_source_check;
alter table app.crm_contacts add constraint crm_contacts_source_check
  check (source in ('user', 'newsletter', 'contact_form', 'import', 'manual', 'event', 'brreg'));

-- A role address, not a person's: the only kind the 'business' basis may be given.
create function app.crm_role_address(p_email text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select split_part(lower(btrim(coalesce(p_email, ''))), '@', 1) in (
    'post', 'postmottak', 'firmapost', 'firmaet', 'kontakt', 'kontor', 'info', 'mail', 'epost', 'e-post', 'hei', 'hello',
    'office', 'admin', 'administrasjon', 'resepsjon', 'sentralbord', 'salg', 'sales', 'faktura', 'regnskap', 'hr',
    'personal', 'ledelse', 'daglig.leder', 'dagligleder', 'booking', 'service', 'kundeservice')
$fn$;

-- ---------------------------------------------------------------- lists
create table app.crm_lists (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'orgpuls',
  key text not null check (key ~ '^[a-z0-9-]{2,40}$'),
  name_no text not null check (char_length(name_no) between 1 and 80),
  name_en text not null check (char_length(name_en) between 1 and 80),
  description_no text not null default '' check (char_length(description_no) <= 300),
  description_en text not null default '' check (char_length(description_en) <= 300),
  public boolean not null default true,
  sort int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, key)
);
alter table app.crm_lists enable row level security;
revoke all on app.crm_lists from public, anon, authenticated;

insert into app.crm_lists (key, name_no, name_en, description_no, description_en, sort) values
  ('nyhetsbrev', 'Nyhetsbrevet', 'The newsletter',
   'Om lovkravet, det psykososiale arbeidsmiljøet og det som er nytt i Orgpuls. Omtrent én gang i måneden.',
   'On the legal requirement, the psychosocial work environment and what is new in Orgpuls. About once a month.', 1),
  ('produktnytt', 'Produktnyheter', 'Product news',
   'Når Orgpuls får noe nytt som endrer hvordan dere jobber.',
   'When Orgpuls gets something new that changes how you work.', 2),
  ('arrangementer', 'Webinarer og kurs', 'Webinars and courses',
   'Invitasjoner til korte webinarer og kurs om kartlegging, risikovurdering og tiltak.',
   'Invitations to short webinars and courses on surveys, risk assessment and measures.', 3),
  ('tilbud', 'Tilbud', 'Offers',
   'Tidsbegrensede tilbud og kampanjer.',
   'Time-limited offers and campaigns.', 4);

create table app.crm_list_members (
  list_id uuid not null references app.crm_lists (id) on delete cascade,
  contact_id uuid not null references app.crm_contacts (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'subscribed', 'unsubscribed')),
  source text not null check (char_length(source) between 2 and 200),
  subscribed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (list_id, contact_id)
);
create index crm_list_members_contact on app.crm_list_members (contact_id);
alter table app.crm_list_members enable row level security;
revoke all on app.crm_list_members from public, anon, authenticated;

-- everyone who confirmed the newsletter under 0055 is on the newsletter list
insert into app.crm_list_members (list_id, contact_id, status, source, subscribed_at)
select l.id, c.id, 'subscribed', coalesce(c.consent_source, 'consent before lists'), coalesce(c.consent_at, now())
from app.crm_contacts c cross join app.crm_lists l
where l.key = 'nyhetsbrev' and c.basis = 'consent' and c.status = 'active';

-- ---------------------------------------------------------------- templates
create table app.crm_templates (
  key text primary key check (key ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  description text not null,
  kind text not null check (kind in ('newsletter', 'campaign', 'promotion', 'announcement')),
  style text not null default 'branded' check (style in ('branded', 'letter')),
  subject text not null,
  preheader text not null default '',
  blocks jsonb not null,
  sort int not null default 0
);
alter table app.crm_templates enable row level security;
revoke all on app.crm_templates from public, anon, authenticated;

insert into app.crm_templates (key, name, description, kind, style, subject, preheader, blocks, sort) values
('nyhetsbrev', 'Månedlig nyhetsbrev',
 'Ett hovedtema øverst med én knapp, så to–tre korte saker med hver sin lenke. For nyhetsbrevlisten.',
 'newsletter', 'branded', 'Tre ting om arbeidsmiljøet denne måneden', 'Årets kartlegging, nye krav og et tips til tiltaksplanen',
 '[{"type":"heading","text":"Kartleggingen: slik får dere høy svarprosent"},
   {"type":"text","text":"Svarprosenten avgjør hva resultatet kan brukes til. Her er de tre grepene som gjør mest."},
   {"type":"button","text":"Les de tre grepene","url":"https://www.orgpuls.com/artikler"},
   {"type":"divider"},
   {"type":"article","title":"Hva Arbeidstilsynet ser etter","text":"Kort om hva dokumentasjonen av det psykososiale arbeidsmiljøet må inneholde.","url":"https://www.orgpuls.com/lovkrav","label":"Les mer"},
   {"type":"article","title":"Verneombudets rolle","text":"Hvordan verneombudet kan følge kartleggingen uten å se enkeltsvar.","url":"https://www.orgpuls.com/verneombud","label":"Les mer"},
   {"type":"ps","text":"Svar gjerne på denne e-posten hvis det er noe du vil vi skal skrive om."}]', 1),
('produktnytt', 'Produktnyhet',
 'Én nyhet, forklart med nytten først, tre punkter og én knapp inn i produktet. For produktnyhetslisten og kunder.',
 'announcement', 'branded', 'Nytt i Orgpuls: tiltaksplanen følger opp seg selv', 'Påminnelser til eierne og effektmåling uten ekstra arbeid',
 '[{"type":"heading","text":"Tiltaksplanen følger nå opp seg selv"},
   {"type":"text","text":"Tiltak som mangler oppfølging er det Arbeidstilsynet oftest peker på. Nå får eieren av hvert tiltak en påminnelse før fristen."},
   {"type":"bullets","text":"Påminnelse til eieren en uke før fristen\nStatus rett i årshjulet\nEffekten måles i neste puls"},
   {"type":"button","text":"Se tiltaksplanen","url":"https://www.orgpuls.com/plattform"},
   {"type":"quote","text":"Nå slipper vi å jage folk før AMU-møtet.","title":"Daglig leder, byggfirma med 40 ansatte"}]', 2),
('arrangement', 'Invitasjon til webinar',
 'Tittel, tid og sted øverst, hva man lærer, og én påmeldingsknapp. For arrangementslisten.',
 'campaign', 'branded', 'Webinar: risikovurdering på 30 minutter', 'Torsdag kl. 09.00 – gratis, med opptak',
 '[{"type":"event","title":"Risikovurdering av det psykososiale arbeidsmiljøet","text":"Torsdag 23. oktober kl. 09.00–09.30\nPå Teams – opptak sendes alle påmeldte","url":"https://www.orgpuls.com/kontakt","label":"Meld meg på"},
   {"type":"text","text":"På 30 minutter går vi gjennom hvordan dere går fra kartlegging til risikovurdering og tiltak – og hva som må dokumenteres."},
   {"type":"bullets","text":"Hva lovkravet faktisk krever\nHvordan dere prioriterer tiltak\nMaler dere kan bruke samme dag"},
   {"type":"button","text":"Meld meg på","url":"https://www.orgpuls.com/kontakt"}]', 3),
('tilbud', 'Tilbud',
 'Tilbudet i overskriften, hva det gir, en tydelig frist og én knapp. For tilbudslisten.',
 'promotion', 'branded', 'Kom i gang før årsskiftet – første måned gratis', 'Tilbudet gjelder til 15. desember',
 '[{"type":"heading","text":"Første måned gratis når dere starter før årsskiftet"},
   {"type":"text","text":"Få årets kartlegging og risikovurdering på plass før fristen, uten å betale for den første måneden."},
   {"type":"bullets","text":"Hele spørsmålssettet og rapporten fra dag én\nIngen binding og ingen kortopplysninger\nHjelp til første utsending"},
   {"type":"button","text":"Kom i gang","url":"https://www.orgpuls.com/registrer"},
   {"type":"ps","text":"Tilbudet gjelder nye kunder som registrerer seg innen 15. desember."}]', 4),
('onboarding', 'Kom i gang (prøveperiode)',
 'Tre konkrete steg for nye brukere i prøveperioden, med én knapp til neste steg.',
 'campaign', 'branded', 'Tre steg til første kartlegging', 'Det tar under en time',
 '[{"type":"heading","text":"Tre steg til første kartlegging"},
   {"type":"bullets","text":"Legg inn de ansatte, eller last opp en liste\nVelg når kartleggingen skal gå ut\nGodkjenn utsendingen – resten går av seg selv"},
   {"type":"button","text":"Legg inn de ansatte","url":"https://www.orgpuls.com/oppsett?fane=ansatte"},
   {"type":"text","text":"Står du fast, svar på denne e-posten, så hjelper vi deg."}]', 5),
('forste-kontakt', 'Første kontakt (bedrift)',
 'En kort, personlig e-post uten bilder og med én lenke: slik første kontakt med en ny bedrift bør se ut. Til bedriftens egen adresse.',
 'campaign', 'letter', 'Kartleggingen av arbeidsmiljøet i {firma}', '',
 '[{"type":"text","text":"Hei,\n\nAlle virksomheter med ansatte skal kartlegge det psykososiale arbeidsmiljøet og dokumentere risikovurdering og tiltak. For mange tar det mye tid.\n\nOrgpuls gjør kartleggingen, rapporten og oppfølgingen for dere, med et forskningsbasert spørreskjema og full anonymitet for de ansatte."},
   {"type":"button","text":"Se hvordan det fungerer","url":"https://www.orgpuls.com/plattform"},
   {"type":"text","text":"Passer det med en prat på 15 minutter neste uke? Svar på denne e-posten, så finner vi et tidspunkt."},
   {"type":"ps","text":"Er ikke dette aktuelt, kan dere melde dere av med lenken under, så hører dere ikke mer fra oss."}]', 6);

-- ---------------------------------------------------------------- campaigns and sends
alter table app.crm_campaigns
  add column list_id uuid references app.crm_lists (id) on delete set null,
  add column template_key text references app.crm_templates (key) on delete set null,
  add column style text not null default 'branded' check (style in ('branded', 'letter')),
  add column signature text not null default '' check (char_length(signature) <= 200),
  add column subject_b text not null default '' check (char_length(subject_b) <= 150),
  add column ab_percent int not null default 20 check (ab_percent between 10 and 50),
  add column ab_metric text not null default 'open' check (ab_metric in ('open', 'click')),
  add column ab_wait_hours int not null default 4 check (ab_wait_hours between 1 and 48),
  add column ab_winner text check (ab_winner in ('a', 'b')),
  add column ab_decided_at timestamptz,
  add column publish_web boolean not null default false,
  add column slug text check (slug ~ '^[a-z0-9-]{3,80}$'),
  add column web_description text not null default '' check (char_length(web_description) <= 200);
create unique index crm_campaigns_slug on app.crm_campaigns (product_id, slug) where slug is not null;

alter table app.crm_sends add column variant text check (variant in ('a', 'b'));
alter table app.crm_sends drop constraint crm_sends_status_check;
alter table app.crm_sends add constraint crm_sends_status_check check (status in ('held', 'pending', 'sending', 'sent', 'failed', 'skipped'));

create table app.crm_clicks (
  send_id uuid not null references app.crm_sends (id) on delete cascade,
  url text not null check (char_length(url) between 1 and 600 and url !~ '[?#]'),
  content text not null default '' check (content ~ '^[a-z0-9_-]{0,60}$'),
  clicks int not null default 1,
  first_at timestamptz not null default now(),
  primary key (send_id, url, content)
);
alter table app.crm_clicks enable row level security;
revoke all on app.crm_clicks from public, anon, authenticated;

-- ---------------------------------------------------------------- blocks
-- heading, text, button (0055) and article, bullets, image, divider, quote, event, ps.
create or replace function app.crm_blocks_ok(b jsonb) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select jsonb_typeof(b) = 'array' and jsonb_array_length(b) between 1 and 30
    and not exists (
      select 1 from jsonb_array_elements(b) x
      where jsonb_typeof(x) <> 'object'
         or (select count(*) from jsonb_object_keys(x) k where k not in ('type', 'text', 'url', 'title', 'label', 'alt', 'href')) > 0
         or coalesce(x->>'type', '') not in ('heading', 'text', 'button', 'article', 'bullets', 'image', 'divider', 'quote', 'event', 'ps')
         or char_length(coalesce(x->>'text', '')) > 3000
         or char_length(coalesce(x->>'title', '')) > 150
         or char_length(coalesce(x->>'label', '')) > 60
         or char_length(coalesce(x->>'alt', '')) > 150
         or (x ? 'url' and (char_length(x->>'url') > 500 or (x->>'url') !~ '^https://[^\s<>"]{3,}$'))
         or (x ? 'href' and (char_length(x->>'href') > 500 or (x->>'href') !~ '^https://[^\s<>"]{3,}$'))
         -- what each kind needs
         or ((x->>'type') in ('heading', 'text', 'bullets', 'quote', 'ps') and char_length(btrim(coalesce(x->>'text', ''))) = 0)
         or ((x->>'type') = 'heading' and char_length(x->>'text') > 150)
         or ((x->>'type') = 'button' and (char_length(btrim(coalesce(x->>'text', ''))) not between 1 and 60 or not x ? 'url'))
         or ((x->>'type') = 'article' and (char_length(btrim(coalesce(x->>'title', ''))) = 0 or not x ? 'url'))
         or ((x->>'type') = 'event' and char_length(btrim(coalesce(x->>'title', ''))) = 0)
         or ((x->>'type') = 'image' and (not x ? 'url' or char_length(btrim(coalesce(x->>'alt', ''))) = 0)))
$fn$;

-- ---------------------------------------------------------------- who may be mailed
-- A segment campaign: consent, the existing-customer exception when it is on, or a
-- company's role address. A list campaign additionally needs the list subscription.
create or replace function app.crm_mailable(c app.crm_contacts) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select c.status = 'active'
    and not app.crm_suppressed(c.email)
    and (c.basis = 'consent'
         or (c.basis = 'business' and app.crm_role_address(c.email))
         or (c.basis = 'customer' and (select s.customer_exception from app.crm_settings s)
             and app.crm_type(c.user_id, c.org_id, c.source) = 'customer'))
    and coalesce(c.last_engaged_at, c.consent_at, c.created_at) > now() - interval '12 months'
$fn$;

create function app.crm_on_list(c app.crm_contacts, p_list uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select c.status = 'active'
    and not app.crm_suppressed(c.email)
    and exists (select 1 from app.crm_list_members m where m.list_id = p_list and m.contact_id = c.id and m.status = 'subscribed')
    and coalesce(c.last_engaged_at, c.consent_at, c.created_at) > now() - interval '12 months'
$fn$;

-- ---------------------------------------------------------------- segments, extended
-- New keys: stages (the company's), lists (subscribed to any of), bases.
create or replace function app.crm_filter_ok(f jsonb) returns boolean
  language plpgsql immutable set search_path = ''
as $fn$
declare k text;
begin
  if f is null or jsonb_typeof(f) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(f) loop
    if k not in ('types', 'roles', 'sources', 'tags', 'lang', 'min_employees', 'max_employees', 'nace', 'no_survey_days',
                 'mailable_only', 'stages', 'lists', 'bases') then
      return false;
    end if;
  end loop;
  if f ? 'types' and (jsonb_typeof(f->'types') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'types') v
      where v not in ('prospect', 'trial', 'customer', 'former'))) then return false; end if;
  if f ? 'roles' and (jsonb_typeof(f->'roles') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'roles') v
      where v not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet'))) then return false; end if;
  if f ? 'sources' and (jsonb_typeof(f->'sources') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'sources') v
      where v not in ('user', 'newsletter', 'contact_form', 'import', 'manual', 'event', 'brreg'))) then return false; end if;
  if f ? 'stages' and (jsonb_typeof(f->'stages') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'stages') v
      where v not in ('new', 'contacted', 'engaged', 'meeting', 'trial', 'customer', 'lost', 'not_relevant'))) then return false; end if;
  if f ? 'bases' and (jsonb_typeof(f->'bases') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'bases') v
      where v not in ('consent', 'customer', 'business', 'none'))) then return false; end if;
  if f ? 'lists' and (jsonb_typeof(f->'lists') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'lists') v
      where v !~ '^[a-z0-9-]{2,40}$')) then return false; end if;
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

-- The company's size and industry come from the organisation when there is one, else from
-- the prospect record.
create or replace function app.crm_segment_contacts(f jsonb) returns setof app.crm_contacts
  language sql stable security definer set search_path = ''
as $fn$
  select c.* from app.crm_contacts c
  left join app.organizations o on o.id = c.org_id
  left join app.crm_companies co on co.id = c.company_id
  where app.crm_filter_ok(f)
    and (not f ? 'types' or app.crm_type(c.user_id, c.org_id, c.source) in (select jsonb_array_elements_text(f->'types')))
    and (not f ? 'roles' or c.role in (select jsonb_array_elements_text(f->'roles')))
    and (not f ? 'sources' or c.source in (select jsonb_array_elements_text(f->'sources')))
    and (not f ? 'bases' or c.basis in (select jsonb_array_elements_text(f->'bases')))
    and (not f ? 'stages' or co.stage in (select jsonb_array_elements_text(f->'stages')))
    and (not f ? 'lists' or exists (select 1 from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
                                    where m.contact_id = c.id and m.status = 'subscribed'
                                      and l.key in (select jsonb_array_elements_text(f->'lists'))))
    and (not f ? 'tags' or c.tags && array(select jsonb_array_elements_text(f->'tags')))
    and (not f ? 'lang' or c.lang = f->>'lang')
    and (not f ? 'min_employees' or coalesce(o.employee_count, co.employees, 0) >= (f->>'min_employees')::numeric)
    and (not f ? 'max_employees' or coalesce(o.employee_count, co.employees, 0) <= (f->>'max_employees')::numeric)
    and (not f ? 'nace' or coalesce(o.registry_nace_code, co.nace_code) like (f->>'nace') || '%')
    and (not f ? 'no_survey_days' or (c.org_id is not null and not exists (
          select 1 from app.rounds r where r.org_id = c.org_id and r.status in ('apen', 'lukket')
            and r.opens_at > now() - make_interval(days => (f->>'no_survey_days')::int))))
    and (not coalesce((f->>'mailable_only')::boolean, false) or app.crm_mailable(c))
$fn$;

-- ---------------------------------------------------------------- the sync, extended
-- Organisations become companies whose stage follows their plan; accounts become contacts
-- of their organisation's company.
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
  where o.org_number ~ '^[0-9]{9}$'
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

  update app.crm_contacts c set company_id = co.id, updated_at = now()
  from app.crm_companies co
  where co.org_id = c.org_id and c.org_id is not null and c.company_id is distinct from co.id;

  update app.crm_contacts c set basis = x.basis, updated_at = now()
  from (select c2.id, case when app.crm_type(c2.user_id, c2.org_id, c2.source) = 'customer' then 'customer' else 'none' end as basis
        from app.crm_contacts c2 where c2.basis <> 'consent' and c2.user_id is not null) x
  where c.id = x.id and c.basis is distinct from x.basis;
end $fn$;

-- ---------------------------------------------------------------- the public side, extended
-- The signup names the lists it joins (public lists only; the newsletter when none is named).
drop function public.crm_newsletter_signup(text, text, text, text, text, text);
create function public.crm_newsletter_signup(p_email text, p_name text, p_company text, p_lang text, p_source text,
                                             p_trap text default null, p_lists text[] default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_source text := case when p_source = 'contact_form' then 'contact_form' else 'newsletter' end;
  v_c app.crm_contacts;
  v_keys text[] := coalesce(nullif(p_lists, '{}'), array['nyhetsbrev']);
  v_new int;
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

  -- the chosen public lists, as pending until the mailed link confirms them
  insert into app.crm_list_members (list_id, contact_id, status, source)
  select l.id, v_c.id, 'pending', 'signup (' || v_source || ')'
  from app.crm_lists l where l.public and l.archived_at is null and l.key = any (v_keys)
  on conflict (list_id, contact_id) do update set status = 'pending'
  where app.crm_list_members.status = 'unsubscribed';
  get diagnostics v_new = row_count;

  -- subscribed already to everything chosen: nothing to confirm
  if v_c.basis = 'consent' and v_c.status = 'active' and not app.crm_suppressed(v_email) and not exists (
       select 1 from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
       where m.contact_id = v_c.id and l.key = any (v_keys) and m.status <> 'subscribed') then
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

-- Confirming also confirms the lists that were waiting.
create or replace function public.crm_confirm(p_token text) returns jsonb
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
  update app.crm_list_members set status = 'subscribed', subscribed_at = now(), unsubscribed_at = null
  where contact_id = v_c.id and status = 'pending';
  delete from app.crm_suppression where email_hash = app.crm_hash(v_c.email);
  return jsonb_build_object('ok', true, 'lang', v_c.lang);
end $fn$;

-- One-click unsubscribe: from the mail's list when it had one, from everything otherwise.
drop function public.crm_unsubscribe(text);
create function public.crm_unsubscribe(p_token text, p_scope text default 'list') returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_s app.crm_sends;
  v_list uuid;
  v_email text;
begin
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
end $fn$;

-- The preference centre: what this mail's recipient is subscribed to. No address is returned.
create function public.crm_preferences(p_token text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_s app.crm_sends;
  v_c app.crm_contacts;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_s from app.crm_sends s where s.unsub_hash = app.crm_token_hash(p_token);
  select * into v_c from app.crm_contacts c where c.id = v_s.contact_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  return jsonb_build_object('ok', true, 'lang', v_c.lang,
    'all_off', v_c.status = 'unsubscribed',
    'campaign_list', (select l.key from app.crm_campaigns g join app.crm_lists l on l.id = g.list_id where g.id = v_s.campaign_id),
    'lists', (select coalesce(jsonb_agg(jsonb_build_object('key', l.key, 'name_no', l.name_no, 'name_en', l.name_en,
                'description_no', l.description_no, 'description_en', l.description_en,
                'subscribed', coalesce(m.status = 'subscribed', false)) order by l.sort), '[]')
              from app.crm_lists l left join app.crm_list_members m on m.list_id = l.id and m.contact_id = v_c.id
              where l.public and l.archived_at is null));
end $fn$;

-- Setting them. Ticking a list is the recipient's own act from their own mailbox, which is
-- consent; leaving everything suppresses the address.
create function public.crm_set_preferences(p_token text, p_lists text[], p_all_off boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_s app.crm_sends;
  v_c app.crm_contacts;
  v_keys text[] := coalesce(p_lists, '{}');
begin
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
end $fn$;

-- Public lists for the signup page: names and descriptions only.
create function public.crm_public_lists() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('key', l.key, 'name_no', l.name_no, 'name_en', l.name_en,
    'description_no', l.description_no, 'description_en', l.description_en) order by l.sort), '[]')
  from app.crm_lists l where l.public and l.archived_at is null
$fn$;

-- The web archive: campaigns published to the web, once they have gone out.
create function public.crm_archive(p_limit int default 50) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(x order by x.published_at desc), '[]') from (
    select c.slug, c.subject as title, nullif(c.web_description, '') as description, c.preheader, c.lang, c.kind,
           coalesce(c.started_at, c.scheduled_at) as published_at
    from app.crm_campaigns c
    where c.publish_web and c.slug is not null and c.status in ('sending', 'sent')
    order by coalesce(c.started_at, c.scheduled_at) desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x
$fn$;

create function public.crm_archive_item(p_slug text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('slug', c.slug, 'title', c.subject, 'description', nullif(c.web_description, ''), 'preheader', c.preheader,
    'lang', c.lang, 'kind', c.kind, 'style', c.style, 'signature', c.signature, 'blocks', c.blocks, 'utm_campaign', c.utm_campaign,
    'published_at', coalesce(c.started_at, c.scheduled_at))
  from app.crm_campaigns c
  where c.slug = p_slug and c.publish_web and c.status in ('sending', 'sent')
$fn$;

-- ---------------------------------------------------------------- the dispatcher's side, extended
create or replace function public.crm_mail_claim(p_batch int default 25) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c record;
  v_n int;
  v_test int;
  v_jobs jsonb := '[]';
  v_s record;
  v_token text;
  v_a numeric;
  v_b numeric;
  v_filter jsonb;
begin
  -- start what is due: the audience, split for an A/B test when there is a subject B
  for v_c in select * from app.crm_campaigns where status = 'scheduled' and scheduled_at <= now() for update skip locked loop
    v_filter := (select g.filter from app.crm_segments g where g.id = v_c.segment_id);
    if v_c.list_id is not null then
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, c.id, c.email from app.crm_contacts c
      where app.crm_on_list(c, v_c.list_id)
        and (v_filter is null or c.id in (select x.id from app.crm_segment_contacts(v_filter) x))
      on conflict do nothing;
    else
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, s.id, s.email
      from (select distinct on (x.id) x.* from app.crm_segment_contacts(coalesce(v_filter, '{"types":[]}')) x) s
      where app.crm_mailable(s) and s.lang = v_c.lang
      on conflict do nothing;
    end if;
    get diagnostics v_n = row_count;
    if btrim(v_c.subject_b) <> '' and v_n >= 4 then
      v_test := greatest(2, (v_n * v_c.ab_percent / 100));
      with ranked as (
        select s.id, row_number() over (order by random()) as rn from app.crm_sends s where s.campaign_id = v_c.id and s.kind = 'campaign'
      )
      update app.crm_sends s set
        variant = case when r.rn <= v_test then case when r.rn % 2 = 1 then 'a' else 'b' end end,
        status = case when r.rn <= v_test then 'pending' else 'held' end
      from ranked r where r.id = s.id;
    else
      update app.crm_sends set variant = 'a' where campaign_id = v_c.id and kind = 'campaign';
    end if;
    update app.crm_campaigns set status = 'sending', started_at = now(), audience = v_n, updated_at = now() where id = v_c.id;
  end loop;

  -- decide A/B tests whose wait is over, and release the rest with the winner
  for v_c in select * from app.crm_campaigns where status = 'sending' and btrim(subject_b) <> '' and ab_decided_at is null
      and started_at + make_interval(hours => ab_wait_hours) <= now() for update skip locked loop
    select
      avg(case when v_c.ab_metric = 'click' then (s.clicked_at is not null)::int else (s.opened_at is not null)::int end) filter (where s.variant = 'a'),
      avg(case when v_c.ab_metric = 'click' then (s.clicked_at is not null)::int else (s.opened_at is not null)::int end) filter (where s.variant = 'b')
      into v_a, v_b
    from app.crm_sends s where s.campaign_id = v_c.id and s.kind = 'campaign' and s.status = 'sent';
    update app.crm_campaigns set ab_winner = case when coalesce(v_b, 0) > coalesce(v_a, 0) then 'b' else 'a' end, ab_decided_at = now()
    where id = v_c.id;
    update app.crm_sends set status = 'pending', variant = case when coalesce(v_b, 0) > coalesce(v_a, 0) then 'b' else 'a' end
    where campaign_id = v_c.id and status = 'held';
  end loop;

  update app.crm_campaigns c set status = 'sent', finished_at = now(), updated_at = now()
  where c.status = 'sending' and not exists (select 1 from app.crm_sends s where s.campaign_id = c.id and s.status in ('held', 'pending', 'sending'));

  for v_s in
    select s.id, s.kind, s.campaign_id, s.contact_id, s.to_email, s.variant from app.crm_sends s
    where (s.status = 'pending' or (s.status = 'sending' and s.leased_until < now())) and s.attempts < 5
    order by s.created_at limit least(greatest(coalesce(p_batch, 25), 1), 50)
    for update skip locked
  loop
    if v_s.kind = 'campaign' and not coalesce((
        select case when g.list_id is not null then app.crm_on_list(c, g.list_id) else app.crm_mailable(c) end
        from app.crm_contacts c, app.crm_campaigns g where c.id = v_s.contact_id and g.id = v_s.campaign_id), false) then
      update app.crm_sends set status = 'skipped', to_email = null where id = v_s.id;
      continue;
    end if;
    if v_s.kind = 'optin' and exists (select 1 from app.crm_contacts c where c.id = v_s.contact_id and c.basis = 'consent' and c.status = 'active'
        and not exists (select 1 from app.crm_list_members m where m.contact_id = c.id and m.status = 'pending')) then
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
      'company', (select coalesce(co.name, c.company) from app.crm_contacts c left join app.crm_companies co on co.id = c.company_id
                  where c.id = v_s.contact_id),
      'lang', coalesce((select g.lang from app.crm_campaigns g where g.id = v_s.campaign_id),
                       (select c.lang from app.crm_contacts c where c.id = v_s.contact_id), 'no'),
      'lists', case when v_s.kind = 'optin' then (
                 select coalesce(jsonb_agg(jsonb_build_object('name_no', l.name_no, 'name_en', l.name_en) order by l.sort), '[]')
                 from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
                 where m.contact_id = v_s.contact_id and m.status = 'pending') end,
      'campaign', (select jsonb_build_object('kind', g.kind, 'style', g.style, 'signature', g.signature,
                     'subject', case when v_s.variant = 'b' and btrim(g.subject_b) <> '' then g.subject_b else g.subject end,
                     'preheader', g.preheader, 'blocks', g.blocks, 'utm_campaign', g.utm_campaign,
                     'web_slug', case when g.publish_web then g.slug end,
                     'list', (select jsonb_build_object('name_no', l.name_no, 'name_en', l.name_en) from app.crm_lists l where l.id = g.list_id))
                   from app.crm_campaigns g where g.id = v_s.campaign_id));
  end loop;
  return v_jobs;
end $fn$;

-- Events, with the clicked link: stored as its path and utm_content, never its query.
drop function public.record_crm_event(text, text, timestamptz);
create function public.record_crm_event(p_event text, p_message_id text, p_at timestamptz, p_link text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id text := btrim(coalesce(p_message_id, ''), '<> ');
  v_s app.crm_sends;
  v_email text;
  v_at timestamptz := least(coalesce(p_at, now()), now());
  v_url text;
  v_content text;
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
end $fn$;

-- ---------------------------------------------------------------- admin: companies
create or replace function app.crm_contact_json(c app.crm_contacts) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'id', c.id, 'email', c.email, 'name', c.name, 'company', coalesce(co.name, c.company, o.name), 'org_number', coalesce(c.org_number, co.org_number, o.org_number),
    'org_id', c.org_id, 'org_name', o.name, 'company_id', c.company_id, 'role', c.role, 'source', c.source, 'basis', c.basis, 'status', c.status,
    'type', app.crm_type(c.user_id, c.org_id, c.source), 'mailable', app.crm_mailable(c), 'suppressed', app.crm_suppressed(c.email),
    'consent_at', c.consent_at, 'consent_source', c.consent_source, 'tags', to_jsonb(c.tags), 'lang', c.lang,
    'last_engaged_at', c.last_engaged_at, 'created_at', c.created_at,
    'lists', (select coalesce(jsonb_agg(l.key order by l.sort), '[]') from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
              where m.contact_id = c.id and m.status = 'subscribed'))
  from (select 1) one
  left join app.organizations o on o.id = c.org_id
  left join app.crm_companies co on co.id = c.company_id
$fn$;

create function app.crm_company_json(co app.crm_companies) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select to_jsonb(co) - 'product_id' || jsonb_build_object(
    'owner_email', (select u.email::text from auth.users u where u.id = co.owner_id),
    'contacts', (select count(*) from app.crm_contacts c where c.company_id = co.id),
    'open_tasks', (select count(*) from app.crm_activities a where a.company_id = co.id and a.kind = 'task' and a.done_at is null))
$fn$;

create function app.crm_log(p_company uuid, p_contact uuid, p_kind text, p_body text, p_due date default null) returns uuid
  language plpgsql security definer set search_path = ''
as $fn$
declare v_id uuid;
begin
  insert into app.crm_activities (company_id, contact_id, kind, body, due_at, admin_id, admin_email)
  values (p_company, p_contact, p_kind, left(p_body, 4000), p_due, auth.uid(), (select u.email::text from auth.users u where u.id = auth.uid()))
  returning id into v_id;
  update app.crm_companies set last_activity_at = now() where id = p_company;
  return v_id;
end $fn$;

create function public.admin_crm_companies(p_q text default null, p_stage text default null, p_owner uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.companies');
  return jsonb_build_object('ok', true,
    'stages', (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (select stage, count(*) n from app.crm_companies group by stage) x),
    'tasks_due', (select count(*) from app.crm_activities a where a.kind = 'task' and a.done_at is null and a.due_at <= current_date),
    'rows', (select coalesce(jsonb_agg(app.crm_company_json(co) order by co.next_step_at nulls last, co.updated_at desc), '[]') from (
        select co.* from app.crm_companies co
        where (v_q is null or lower(co.name) like '%' || v_q || '%' or co.org_number = v_q or v_q = any (co.tags))
          and (p_stage is null or co.stage = p_stage)
          and (p_owner is null or co.owner_id = p_owner)
        order by co.next_step_at nulls last, co.updated_at desc limit 500) co));
end $fn$;

create function public.admin_crm_company(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_co app.crm_companies;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_co from app.crm_companies where id = p_id;
  if v_co.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.company', v_co.org_id, 'crm_company', p_id::text);
  return jsonb_build_object('ok', true, 'company', app.crm_company_json(v_co),
    'contacts', (select coalesce(jsonb_agg(app.crm_contact_json(c) order by c.created_at), '[]') from app.crm_contacts c where c.company_id = p_id),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'body', a.body, 'due_at', a.due_at, 'done_at', a.done_at,
                     'admin_email', a.admin_email, 'created_at', a.created_at,
                     'contact', (select coalesce(c.name, c.email) from app.crm_contacts c where c.id = a.contact_id)) order by a.created_at desc), '[]')
                   from app.crm_activities a where a.company_id = p_id),
    'mail', (select jsonb_build_object('sent', count(*) filter (where s.status = 'sent'), 'opened', count(*) filter (where s.opened_at is not null),
                     'clicked', count(*) filter (where s.clicked_at is not null), 'last_at', max(s.sent_at))
             from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id where c.company_id = p_id and s.kind = 'campaign'),
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', a.user_id, 'email', u.email) order by u.email), '[]')
               from app.platform_admins a join auth.users u on u.id = a.user_id
               where a.active and a.role in ('super_admin', 'marketing')));
end $fn$;

-- Create or edit a company. A stage change is logged as an activity; a customer's stage
-- follows its plan and cannot be set by hand.
create function public.admin_crm_company_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
  v_old app.crm_companies;
  v_tags text[];
  v_orgnr text := nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), '');
  v_stage text := nullif(p->>'stage', '');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p ? 'name' and char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_orgnr is not null and v_orgnr !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;
  if v_stage is not null and v_stage not in ('new', 'contacted', 'engaged', 'meeting', 'lost', 'not_relevant') then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if p ? 'tags' then
    if jsonb_typeof(p->'tags') <> 'array' or jsonb_array_length(p->'tags') > 20
       or exists (select 1 from jsonb_array_elements_text(p->'tags') t where t !~ '^[a-z0-9æøå_-]{1,40}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_tags');
    end if;
    v_tags := array(select distinct jsonb_array_elements_text(p->'tags'));
  end if;
  if nullif(p->>'owner_id', '') is not null and not exists (
      select 1 from app.platform_admins a where a.user_id = (p->>'owner_id')::uuid and a.active) then
    return jsonb_build_object('ok', false, 'error', 'invalid_owner');
  end if;
  begin
    perform nullif(p->>'next_step_at', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_date');
  end;

  if v_id is null then
    if not p ? 'name' then
      return jsonb_build_object('ok', false, 'error', 'invalid_name');
    end if;
    if v_orgnr is not null and exists (select 1 from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = v_orgnr) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_companies (org_number, name, nace_code, employees, municipality, website, phone, source, stage, owner_id,
                                   next_step, next_step_at, tags)
    values (v_orgnr, btrim(p->>'name'), case when p->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then p->>'nace_code' end,
            case when p->>'employees' ~ '^[0-9]{1,7}$' then (p->>'employees')::int end, nullif(left(btrim(coalesce(p->>'municipality', '')), 80), ''),
            nullif(left(btrim(coalesce(p->>'website', '')), 300), ''), nullif(left(btrim(coalesce(p->>'phone', '')), 40), ''),
            'manual', coalesce(v_stage, 'new'), nullif(p->>'owner_id', '')::uuid,
            nullif(left(btrim(coalesce(p->>'next_step', '')), 300), ''), nullif(p->>'next_step_at', '')::date, coalesce(v_tags, '{}'))
    returning id into v_id;
    perform app.crm_log(v_id, null, 'stage', 'Opprettet: ' || coalesce(v_stage, 'new'));
    perform app.admin_log('crm.company_create', null, 'crm_company', v_id::text);
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_old from app.crm_companies where id = v_id;
  if v_old.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_stage is not null and v_old.org_id is not null then
    return jsonb_build_object('ok', false, 'error', 'stage_follows_plan');
  end if;
  update app.crm_companies c set
    name = case when p ? 'name' then btrim(p->>'name') else c.name end,
    website = case when p ? 'website' then nullif(left(btrim(coalesce(p->>'website', '')), 300), '') else c.website end,
    phone = case when p ? 'phone' then nullif(left(btrim(coalesce(p->>'phone', '')), 40), '') else c.phone end,
    owner_id = case when p ? 'owner_id' then nullif(p->>'owner_id', '')::uuid else c.owner_id end,
    next_step = case when p ? 'next_step' then nullif(left(btrim(coalesce(p->>'next_step', '')), 300), '') else c.next_step end,
    next_step_at = case when p ? 'next_step_at' then nullif(p->>'next_step_at', '')::date else c.next_step_at end,
    lost_reason = case when p ? 'lost_reason' then nullif(left(btrim(coalesce(p->>'lost_reason', '')), 300), '') else c.lost_reason end,
    tags = coalesce(v_tags, c.tags),
    stage = coalesce(v_stage, c.stage),
    stage_changed_at = case when v_stage is not null and v_stage <> c.stage then now() else c.stage_changed_at end,
    updated_at = now()
  where c.id = v_id;
  if v_stage is not null and v_stage <> v_old.stage then
    perform app.crm_log(v_id, null, 'stage', v_old.stage || ' → ' || v_stage
      || case when v_stage = 'lost' and nullif(p->>'lost_reason', '') is not null then ': ' || left(p->>'lost_reason', 300) else '' end);
  end if;
  perform app.admin_log('crm.company_update', v_old.org_id, 'crm_company', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- Companies picked from Brønnøysund, or a CSV of companies. The register's e-mail becomes a
-- contact only as a role address with basis 'business'; a person's address, or any
-- enkeltpersonforetak's, is kept with no basis and is not mailed.
create function public.admin_crm_company_import(p_rows jsonb, p_source text default 'brreg') returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r jsonb;
  v_orgnr text;
  v_id uuid;
  v_email text;
  v_basis text;
  v_added int := 0;
  v_known int := 0;
  v_business int := 0;
  v_skipped int := 0;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_orgnr := regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g');
    if v_orgnr !~ '^[0-9]{9}$' or char_length(btrim(coalesce(r->>'name', ''))) = 0 then
      v_skipped := v_skipped + 1; continue;
    end if;
    select id into v_id from app.crm_companies where product_id = 'orgpuls' and org_number = v_orgnr;
    if v_id is not null then
      v_known := v_known + 1; continue;
    end if;
    insert into app.crm_companies (org_number, name, form_code, nace_code, nace_label, employees, municipality, municipality_no, website, phone,
                                   source, tags)
    values (v_orgnr, left(btrim(r->>'name'), 200), left(r->>'form_code', 10),
            case when r->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then r->>'nace_code' end, left(r->>'nace_label', 200),
            case when r->>'employees' ~ '^[0-9]{1,7}$' then (r->>'employees')::int end, left(r->>'municipality', 80),
            case when r->>'municipality_no' ~ '^[0-9]{4}$' then r->>'municipality_no' end,
            nullif(left(btrim(coalesce(r->>'website', '')), 300), ''), nullif(left(btrim(coalesce(r->>'phone', '')), 40), ''),
            case when p_source = 'import' then 'import' else 'brreg' end,
            coalesce(array(select distinct t from unnest(string_to_array(lower(coalesce(r->>'tags', '')), ';')) t where t ~ '^[a-z0-9æøå_-]{1,40}$'), '{}'))
    returning id into v_id;
    v_added := v_added + 1;
    perform app.crm_log(v_id, null, 'stage', 'Lagt til fra ' || case when p_source = 'import' then 'import' else 'Brønnøysundregistrene' end);
    v_email := lower(btrim(coalesce(r->>'email', '')));
    if v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(v_email) <= 254 then
      v_basis := case when app.crm_role_address(v_email) and coalesce(r->>'form_code', '') <> 'ENK' then 'business' else 'none' end;
      insert into app.crm_contacts (email, company, org_number, company_id, source, basis, status, consent_source)
      values (v_email, left(btrim(r->>'name'), 200), v_orgnr, v_id, 'brreg', v_basis, 'active',
              case when v_basis = 'business' then 'role address in Enhetsregisteret' end)
      on conflict (product_id, email) do update set company_id = coalesce(app.crm_contacts.company_id, excluded.company_id);
      if v_basis = 'business' then v_business := v_business + 1; end if;
    end if;
  end loop;
  perform app.admin_log('crm.company_import', null, null, null, null,
    jsonb_build_object('added', v_added, 'known', v_known, 'business', v_business, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'added', v_added, 'known', v_known, 'business', v_business, 'skipped', v_skipped);
end $fn$;

create function public.admin_crm_activity(p_company uuid, p_contact uuid, p_kind text, p_body text, p_due date default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_kind not in ('note', 'call', 'meeting', 'email', 'task') or char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from app.crm_companies c where c.id = p_company) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_contact is not null and not exists (select 1 from app.crm_contacts c where c.id = p_contact and c.company_id = p_company) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.crm_log(p_company, p_contact, p_kind, btrim(p_body), case when p_kind = 'task' then p_due end);
  -- a first call, mail or meeting moves a new prospect to "contacted"
  if p_kind in ('call', 'email', 'meeting') then
    update app.crm_companies set stage = 'contacted', stage_changed_at = now() where id = p_company and stage = 'new' and org_id is null;
  end if;
  perform app.admin_log('crm.activity_add', null, 'crm_company', p_company::text);
  return jsonb_build_object('ok', true);
end $fn$;

create function public.admin_crm_task_done(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update app.crm_activities set done_at = case when done_at is null then now() end where id = p_id and kind = 'task';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.task_done', null, 'crm_activity', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;

-- The tasks that are due, across companies: the sales team's day.
create function public.admin_crm_tasks() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'company_id', a.company_id, 'company', co.name, 'body', a.body, 'due_at', a.due_at,
      'admin_email', a.admin_email) order by a.due_at nulls last, a.created_at), '[]')
    from app.crm_activities a join app.crm_companies co on co.id = a.company_id
    where a.kind = 'task' and a.done_at is null));
end $fn$;

-- ---------------------------------------------------------------- admin: lists and templates
create function public.admin_crm_lists() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.lists');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'key', l.key, 'name_no', l.name_no, 'name_en', l.name_en,
      'description_no', l.description_no, 'description_en', l.description_en, 'public', l.public, 'archived', l.archived_at is not null,
      'subscribed', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.status = 'subscribed'),
      'pending', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.status = 'pending'),
      'unsubscribed', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.status = 'unsubscribed'),
      'joined_30d', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.subscribed_at > now() - interval '30 days'),
      'left_30d', (select count(*) from app.crm_list_members m where m.list_id = l.id and m.unsubscribed_at > now() - interval '30 days'),
      'campaigns', (select count(*) from app.crm_campaigns c where c.list_id = l.id and c.status in ('sending', 'sent')),
      'open_rate', (select round(avg((s.opened_at is not null)::int) * 100, 1) from app.crm_sends s join app.crm_campaigns c on c.id = s.campaign_id
                    where c.list_id = l.id and s.kind = 'campaign' and s.status = 'sent'),
      'click_rate', (select round(avg((s.clicked_at is not null)::int) * 100, 1) from app.crm_sends s join app.crm_campaigns c on c.id = s.campaign_id
                     where c.list_id = l.id and s.kind = 'campaign' and s.status = 'sent')) order by l.sort, l.name_no), '[]')
    from app.crm_lists l));
end $fn$;

create function public.admin_crm_list_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p->>'name_no', ''))) not between 1 and 80 or char_length(btrim(coalesce(p->>'name_en', ''))) not between 1 and 80
     or char_length(coalesce(p->>'description_no', '')) > 300 or char_length(coalesce(p->>'description_en', '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_id is null then
    if coalesce(p->>'key', '') !~ '^[a-z0-9-]{2,40}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_key');
    end if;
    if exists (select 1 from app.crm_lists l where l.product_id = 'orgpuls' and l.key = p->>'key') then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_lists (key, name_no, name_en, description_no, description_en, public, sort)
    values (p->>'key', btrim(p->>'name_no'), btrim(p->>'name_en'), coalesce(p->>'description_no', ''), coalesce(p->>'description_en', ''),
            coalesce((p->>'public')::boolean, true), (select coalesce(max(sort), 0) + 1 from app.crm_lists))
    returning id into v_id;
  else
    update app.crm_lists set name_no = btrim(p->>'name_no'), name_en = btrim(p->>'name_en'),
      description_no = coalesce(p->>'description_no', description_no), description_en = coalesce(p->>'description_en', description_en),
      public = coalesce((p->>'public')::boolean, public),
      archived_at = case when (p->>'archived')::boolean then coalesce(archived_at, now()) when p ? 'archived' then null else archived_at end
    where id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  perform app.admin_log('crm.list_save', null, 'crm_list', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- Put contacts on a list. Only contacts whose consent we hold; the admin names its source.
create function public.admin_crm_list_add(p_list uuid, p_contacts uuid[], p_source text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_source, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;
  if not exists (select 1 from app.crm_lists l where l.id = p_list and l.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  insert into app.crm_list_members (list_id, contact_id, status, source, subscribed_at)
  select p_list, c.id, 'subscribed', left(btrim(p_source), 200), now()
  from app.crm_contacts c
  where c.id = any (coalesce(p_contacts, '{}')) and c.basis = 'consent' and c.status = 'active' and not app.crm_suppressed(c.email)
  on conflict (list_id, contact_id) do update set status = 'subscribed', subscribed_at = now(), unsubscribed_at = null, source = excluded.source
  where app.crm_list_members.status = 'pending';
  get diagnostics v_n = row_count;
  perform app.admin_log('crm.list_add', null, 'crm_list', p_list::text, p_source, jsonb_build_object('added', v_n));
  return jsonb_build_object('ok', true, 'added', v_n, 'refused', coalesce(cardinality(p_contacts), 0) - v_n);
end $fn$;

create function public.admin_crm_templates() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort), '[]') from app.crm_templates t));
end $fn$;

-- ---------------------------------------------------------------- admin: campaigns, extended
drop function public.admin_crm_campaign_save(uuid, jsonb);
create function public.admin_crm_campaign_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
  v_status text;
  v_utm text := lower(btrim(coalesce(p->>'utm_campaign', '')));
  v_slug text := nullif(lower(btrim(coalesce(p->>'slug', ''))), '');
  v_t app.crm_templates;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if nullif(p->>'template_key', '') is not null then
    select * into v_t from app.crm_templates t where t.key = p->>'template_key';
    if v_t.key is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_template');
    end if;
  end if;
  if coalesce(p->>'kind', v_t.kind, 'newsletter') not in ('newsletter', 'campaign', 'promotion', 'announcement') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if v_utm = '' then
    v_utm := left(trim(both '-' from regexp_replace(translate(replace(lower(p->>'name'), 'æ', 'ae'), 'øå', 'oa'), '[^a-z0-9]+', '-', 'g')), 60);
  end if;
  if v_utm !~ '^[a-z0-9_-]{1,60}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_utm');
  end if;
  if char_length(coalesce(p->>'subject', '')) > 150 or char_length(coalesce(p->>'subject_b', '')) > 150
     or char_length(coalesce(p->>'preheader', '')) > 200 or char_length(coalesce(p->>'web_description', '')) > 200
     or char_length(coalesce(p->>'signature', '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if p ? 'blocks' and jsonb_array_length(coalesce(p->'blocks', '[]')) > 0 and not app.crm_blocks_ok(p->'blocks') then
    return jsonb_build_object('ok', false, 'error', 'invalid_blocks');
  end if;
  if nullif(p->>'segment_id', '') is not null and not exists (select 1 from app.crm_segments g where g.id = (p->>'segment_id')::uuid) then
    return jsonb_build_object('ok', false, 'error', 'invalid_segment');
  end if;
  if nullif(p->>'list_id', '') is not null and not exists (select 1 from app.crm_lists l where l.id = (p->>'list_id')::uuid and l.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_list');
  end if;
  if coalesce(p->>'style', 'branded') not in ('branded', 'letter') or coalesce(p->>'ab_metric', 'open') not in ('open', 'click')
     or coalesce(p->>'ab_percent', '20') !~ '^[0-9]{2}$' or (coalesce(p->>'ab_percent', '20'))::int not between 10 and 50
     or coalesce(p->>'ab_wait_hours', '4') !~ '^[0-9]{1,2}$' or (coalesce(p->>'ab_wait_hours', '4'))::int not between 1 and 48 then
    return jsonb_build_object('ok', false, 'error', 'invalid_ab');
  end if;
  if v_slug is not null and (v_slug !~ '^[a-z0-9-]{3,80}$'
      or exists (select 1 from app.crm_campaigns c where c.product_id = 'orgpuls' and c.slug = v_slug and c.id is distinct from p_id)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_slug');
  end if;

  if v_id is null then
    insert into app.crm_campaigns (name, kind, lang, subject, preheader, blocks, segment_id, list_id, utm_campaign, template_key, style, signature,
                                   subject_b, ab_percent, ab_metric, ab_wait_hours, publish_web, slug, web_description, created_by)
    values (btrim(p->>'name'), coalesce(p->>'kind', v_t.kind, 'newsletter'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            coalesce(p->>'subject', v_t.subject, ''), coalesce(p->>'preheader', v_t.preheader, ''), coalesce(p->'blocks', v_t.blocks, '[]'),
            nullif(p->>'segment_id', '')::uuid, nullif(p->>'list_id', '')::uuid, v_utm, v_t.key, coalesce(p->>'style', v_t.style, 'branded'),
            coalesce(p->>'signature', ''), coalesce(p->>'subject_b', ''), coalesce((p->>'ab_percent')::int, 20),
            coalesce(p->>'ab_metric', 'open'), coalesce((p->>'ab_wait_hours')::int, 4), coalesce((p->>'publish_web')::boolean, false),
            v_slug, coalesce(p->>'web_description', ''), auth.uid())
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
      blocks = coalesce(p->'blocks', blocks), segment_id = case when p ? 'segment_id' then nullif(p->>'segment_id', '')::uuid else segment_id end,
      list_id = case when p ? 'list_id' then nullif(p->>'list_id', '')::uuid else list_id end,
      utm_campaign = v_utm, style = coalesce(p->>'style', style), signature = coalesce(p->>'signature', signature),
      subject_b = coalesce(p->>'subject_b', subject_b), ab_percent = coalesce((p->>'ab_percent')::int, ab_percent),
      ab_metric = coalesce(p->>'ab_metric', ab_metric), ab_wait_hours = coalesce((p->>'ab_wait_hours')::int, ab_wait_hours),
      publish_web = coalesce((p->>'publish_web')::boolean, publish_web),
      slug = case when p ? 'slug' then v_slug else slug end, web_description = coalesce(p->>'web_description', web_description),
      updated_at = now()
    where id = v_id;
  end if;
  perform app.admin_log('crm.campaign_save', null, 'crm_campaign', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- A campaign needs a subject, valid blocks, an audience (a list or a segment) and, to be
-- published on the web, an address.
create or replace function app.crm_campaign_ready(c app.crm_campaigns) returns text
  language sql stable set search_path = ''
as $fn$
  select case
    when char_length(btrim(c.subject)) = 0 then 'no_subject'
    when not app.crm_blocks_ok(c.blocks) then 'invalid_blocks'
    when c.segment_id is null and c.list_id is null then 'no_segment'
    when c.publish_web and c.slug is null then 'no_slug'
  end
$fn$;

create or replace function app.crm_campaign_stats(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'queued', count(*) filter (where s.status in ('pending', 'sending', 'held')),
    'held', count(*) filter (where s.status = 'held'),
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

-- The report: rates, the A/B result, the click map, the first 72 hours and a benchmark
-- against the last ten campaigns, and what the site's analytics saw.
drop function public.admin_crm_campaign(uuid);
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
    'variants', (select coalesce(jsonb_agg(v order by v.variant), '[]') from (
        select s.variant, count(*) filter (where s.status = 'sent') as sent,
               count(*) filter (where s.opened_at is not null) as opened, count(*) filter (where s.clicked_at is not null) as clicked
        from app.crm_sends s where s.campaign_id = p_id and s.kind = 'campaign' and s.variant is not null group by s.variant) v),
    'links', (select coalesce(jsonb_agg(l order by l.unique_clicks desc), '[]') from (
        select k.url, k.content, count(distinct k.send_id) as unique_clicks, sum(k.clicks) as clicks
        from app.crm_clicks k join app.crm_sends s on s.id = k.send_id where s.campaign_id = p_id group by k.url, k.content limit 50) l),
    'timeline', (select coalesce(jsonb_agg(t order by t.hour), '[]') from (
        select h.hour,
               (select count(*) from app.crm_sends s where s.campaign_id = p_id and s.opened_at >= v_c.started_at + make_interval(hours => h.hour)
                  and s.opened_at < v_c.started_at + make_interval(hours => h.hour + 1)) as opened,
               (select count(*) from app.crm_sends s where s.campaign_id = p_id and s.clicked_at >= v_c.started_at + make_interval(hours => h.hour)
                  and s.clicked_at < v_c.started_at + make_interval(hours => h.hour + 1)) as clicked
        from generate_series(0, 71) h(hour) where v_c.started_at is not null) t),
    'benchmark', (select jsonb_build_object(
        'campaigns', count(distinct c.id),
        'open_rate', round(avg((s.opened_at is not null)::int) * 100, 1),
        'click_rate', round(avg((s.clicked_at is not null)::int) * 100, 1),
        'unsubscribe_rate', round(avg((s.unsubscribed_at is not null)::int) * 100, 2))
      from (select id from app.crm_campaigns where status = 'sent' and id <> p_id order by finished_at desc limit 10) c
      join app.crm_sends s on s.campaign_id = c.id and s.kind = 'campaign' and s.status = 'sent'),
    'web', jsonb_build_object(
      'sessions', (select count(distinct (e.visitor, e.day)) from app.web_events e where e.utm_campaign = v_c.utm_campaign),
      'views', (select count(*) from app.web_events e where e.utm_campaign = v_c.utm_campaign and e.kind = 'view'),
      'signups', (select count(*) from app.org_attribution a where v_c.utm_campaign in (a.first_campaign, a.last_campaign)),
      'paid', (select count(*) from app.org_attribution a join app.billing b on b.org_id = a.org_id
               where v_c.utm_campaign in (a.first_campaign, a.last_campaign) and b.confirmed_at is not null)),
    'tests', (select count(*) from app.crm_sends s where s.campaign_id = p_id and s.kind = 'test'),
    'list', (select jsonb_build_object('id', l.id, 'name', l.name_no) from app.crm_lists l where l.id = v_c.list_id));
end $fn$;

drop function public.admin_crm_campaigns();
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
      'subject', c.subject, 'segment', g.name, 'list', l.name_no, 'ab', btrim(c.subject_b) <> '', 'ab_winner', c.ab_winner,
      'scheduled_at', c.scheduled_at, 'finished_at', c.finished_at, 'audience', c.audience, 'utm_campaign', c.utm_campaign,
      'publish_web', c.publish_web, 'slug', c.slug, 'stats', app.crm_campaign_stats(c.id),
      'signups', (select count(*) from app.org_attribution a where c.utm_campaign in (a.first_campaign, a.last_campaign)))
      order by c.created_at desc), '[]')
    from app.crm_campaigns c left join app.crm_segments g on g.id = c.segment_id left join app.crm_lists l on l.id = c.list_id));
end $fn$;

-- The CRM's front page: the last 90 days of mail, list growth and the pipeline.
create function public.admin_crm_overview() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.overview');
  return jsonb_build_object('ok', true,
    'mail', (select jsonb_build_object(
        'campaigns', count(distinct s.campaign_id), 'sent', count(*),
        'open_rate', round(avg((s.opened_at is not null)::int) * 100, 1),
        'click_rate', round(avg((s.clicked_at is not null)::int) * 100, 1),
        'ctor', round(100.0 * count(*) filter (where s.clicked_at is not null) / nullif(count(*) filter (where s.opened_at is not null), 0), 1),
        'unsubscribe_rate', round(avg((s.unsubscribed_at is not null)::int) * 100, 2),
        'bounce_rate', round(avg((s.delivery in ('hard_bounce', 'soft_bounce', 'invalid', 'blocked'))::int) * 100, 2))
      from app.crm_sends s where s.kind = 'campaign' and s.status = 'sent' and s.sent_at > now() - interval '90 days'),
    'subscribers', (select jsonb_build_object(
        'total', count(distinct m.contact_id) filter (where m.status = 'subscribed'),
        'joined_30d', count(*) filter (where m.subscribed_at > now() - interval '30 days'),
        'left_30d', count(*) filter (where m.unsubscribed_at > now() - interval '30 days'))
      from app.crm_list_members m),
    'pipeline', (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (select stage, count(*) n from app.crm_companies group by stage) x),
    'won_90d', (select count(*) from app.crm_companies c where c.stage = 'customer' and c.stage_changed_at > now() - interval '90 days'),
    'trials_90d', (select count(*) from app.crm_companies c where c.stage in ('trial', 'customer') and c.created_at > now() - interval '90 days'
                   and c.source = 'signup'),
    'tasks_due', (select count(*) from app.crm_activities a where a.kind = 'task' and a.done_at is null and a.due_at <= current_date),
    'signups_from_email', (select count(*) from app.org_attribution a where a.channel = 'email'));
end $fn$;

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'app.crm_role_address(text)', 'app.crm_on_list(app.crm_contacts,uuid)', 'app.crm_company_json(app.crm_companies)',
    'app.crm_log(uuid,uuid,text,text,date)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.crm_newsletter_signup(text,text,text,text,text,text,text[])', 'public.crm_unsubscribe(text,text)',
    'public.crm_preferences(text)', 'public.crm_set_preferences(text,text[],boolean)', 'public.crm_public_lists()',
    'public.crm_archive(int)', 'public.crm_archive_item(text)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.admin_crm_companies(text,text,uuid)', 'public.admin_crm_company(uuid)', 'public.admin_crm_company_save(uuid,jsonb)',
    'public.admin_crm_company_import(jsonb,text)', 'public.admin_crm_activity(uuid,uuid,text,text,date)', 'public.admin_crm_task_done(uuid)',
    'public.admin_crm_tasks()', 'public.admin_crm_lists()', 'public.admin_crm_list_save(uuid,jsonb)',
    'public.admin_crm_list_add(uuid,uuid[],text)', 'public.admin_crm_templates()', 'public.admin_crm_campaign_save(uuid,jsonb)',
    'public.admin_crm_campaign(uuid)', 'public.admin_crm_campaigns()', 'public.admin_crm_overview()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  execute 'revoke all on function public.record_crm_event(text,text,timestamptz,text) from public, anon, authenticated';
  execute 'grant execute on function public.record_crm_event(text,text,timestamptz,text) to service_role';
end $$;
