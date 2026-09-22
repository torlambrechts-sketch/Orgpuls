-- 0021_company.sql — the company's own facts, and the difference between a duty and a login.
--
-- Oppsett is where an organisation describes itself, and most of what it describes was
-- until now either absent from the schema or invented by a screen. This migration gives
-- three things a row: where the company is registered, where its people physically work,
-- and which of them hold a statutory position.
--
-- **The registry snapshot is stored, not fetched on render.** Enhetsregisteret is a public
-- API with no key and no personal data, but a page that called it on every load would make
-- the screen depend on somebody else's uptime and would send this organisation's number to
-- Brønnøysund every time a leader opened a tab. `registry_fetched_at` records when the
-- lookup happened, and the screen prints the date, so a stale row reads as stale rather
-- than as fresh.
--
-- **`duty_role` is not `app.org_role`, and conflating them would be a security bug.**
-- `app.memberships.role` says what a signed-in user may *read* — it is access control, it
-- is what `app.has_role` tests, and it is the only thing RLS consults. `duty_role` says
-- what a person *is* under the act: the verneombud the § 6-2 record names, the
-- tillitsvalgt § 9-2 requires the drøfting with. A tillitsvalgt appears here and in no
-- `app.org_role`, which is the point: they are a counterpart the law names, not a reader
-- this product grants anything to. Writing a duty here grants nobody a single row.

create type app.duty_role as enum
  ('daglig_leder', 'avdelingsleder', 'verneombud', 'tillitsvalgt');

alter table app.employees add column duty_role app.duty_role;

comment on column app.employees.duty_role is
  'A statutory position, not access. Access is app.memberships.role, which is what '
  'app.has_role tests and what every RLS policy consults. Setting this grants nothing.';

-- --------------------------------------------------------------------------- locations
--
-- The design's reason for these is real: "Arbeidsmiljøet er sjelden likt på kontoret og
-- ute på anlegg." A location is a place, never a person — `headcount` is a number the
-- organisation states about a site, not a count derived from anybody's row, so a site with
-- three people is not a group of three that k would have to protect.
create table app.locations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0 and length(name) <= 80),
  address    text check (address is null or length(btrim(address)) > 0),
  headcount  int not null default 0 check (headcount >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table app.locations enable row level security;

create policy location_read on app.locations
  for select using (app.is_org_member(org_id));
create policy location_write on app.locations
  for all
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

revoke all on app.locations from anon, public;
grant select, insert, update, delete on app.locations to authenticated;

-- ----------------------------------------------------------------- company-wide settings
--
-- `law_mode` is the design's "Lovmodus": whether the statutory framing is visible in the
-- interface. It changes wording and which tab exists. It changes **nothing** about what is
-- stored, measured or documented — the design says so and the product must mean it, so
-- nothing anywhere keys behaviour off this column.
--
-- The work-environment year's start month is deliberately NOT a column here. It already
-- exists, as `app.year_wheels.baseline_month`, and the design's own note says as much:
-- "Grunnlinjen legges i denne måneden hvert år. Årshjulet følger etter." A second column
-- would be a second truth, and the two would disagree the first time somebody moved one.
alter table app.organizations
  add column law_mode boolean not null default true,
  add column bht_name text check (bht_name is null or length(btrim(bht_name)) > 0),
  add column registry_fetched_at        timestamptz,
  add column registry_form_code         text,
  add column registry_form_label        text,
  add column registry_nace_code         text,
  add column registry_nace_label        text,
  add column registry_registered_on     date,
  add column registry_address           text,
  add column registry_municipality      text,
  add column registry_municipality_no   text,
  add column registry_employees         int check (registry_employees is null or registry_employees >= 0),
  add column registry_vat               boolean;

comment on column app.organizations.law_mode is
  'Interface framing only. Nothing stored, measured or documented depends on it.';
