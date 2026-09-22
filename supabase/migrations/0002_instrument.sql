-- 0002_instrument.sql — the QPS Nordic based instrument, as data.
--
-- Eleven psychosocial factors, three statements each, generated from the design
-- bundle's FACTORS array (Orgpuls.dc.html lines 2489-2545) so the structure cannot
-- drift from the design. No user-facing text lives here: labels, descriptions and
-- statement wording are i18n keys resolved from messages/<locale>.json. Adding a
-- factor is a row plus message keys, never a component change.

create table app.factors (
  key         text primary key check (key ~ '^[a-z]+$'),
  law_ref     text not null,
  sort_order  int  not null unique
);

create table app.statements (
  factor_key  text not null references app.factors (key) on delete cascade,
  ordinal     int  not null check (ordinal between 1 and 9),
  primary key (factor_key, ordinal)
);

alter table app.factors    enable row level security;
alter table app.statements enable row level security;

-- The instrument is public reference data: every signed-in user and every
-- respondent answering via a token needs to read it. It contains no tenant data.
create policy factor_read    on app.factors    for select to authenticated, anon using (true);
create policy statement_read on app.statements for select to authenticated, anon using (true);

grant select on app.factors, app.statements to authenticated, anon;

insert into app.factors (key, law_ref, sort_order) values
  ('ytring', 'aml. § 4-3 · § 2A', 1),
  ('mengde', 'forskrift kap. 1A · § 4-1', 2),
  ('motstrid', 'forskrift kap. 1A', 3),
  ('kontakt', 'aml. § 4-3 · forskrift 1A', 4),
  ('emosjon', 'forskrift kap. 1A', 5),
  ('leder', 'forskrift kap. 1A', 6),
  ('medvirk', 'aml. § 4-2', 7),
  ('integritet', 'aml. § 4-3 · forskrift 1A', 8),
  ('rolle', 'forskrift kap. 1A', 9),
  ('kollega', 'aml. § 4-3', 10),
  ('mening', 'aml. § 4-2', 11);

insert into app.statements (factor_key, ordinal)
select f.key, o.ordinal
from app.factors f cross join (values (1),(2),(3)) as o(ordinal);
