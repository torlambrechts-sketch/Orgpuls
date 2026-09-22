-- 0007_extra_questions.sql — the four questions that sit outside the index.
--
-- The design's Målinger screen prints "Alle ansatte · 37 spørsmål" for a grunnlinje.
-- Eleven factors x three statements is 33, and the remaining four are the block the
-- Spørsmålssettet card heads "I tillegg, utenfor indeksen" (bundle lines 671-688):
-- an eNPS-style recommendation question, two prevalence questions, and one open field.
-- Without them the screen would have to print 33 and disagree with its own design, or
-- print 37 and invent four rows — so they are transcribed here as data.
--
-- They are emphatically NOT part of the index. The bundle says so twice, and the
-- reason is statistical: a 1-5 recommendation score and a yes/no prevalence rate do
-- not share a scale with a QPS Nordic factor, and averaging them together would make
-- the published index incomparable with the benchmark and with previous years.
--
-- Two of them carry a reporting rule that is a privacy rule, not a preference. The
-- bundle states it in the question's own note:
--   "Vises kun som antall for hele virksomheten, aldri per gruppe."
-- A prevalence question about harassment or violence, broken down by a group of eight,
-- identifies people. `org_only` records that, so the aggregation RPCs can enforce it
-- rather than each screen remembering to. Nothing reads it yet — the reporting path
-- for extra questions arrives with the Resultat segment — and it is recorded now
-- because the rule belongs with the question, not with the screen that displays it.
--
-- As everywhere else, no user-facing text lives here: wording and notes are i18n keys.

create type app.extra_kind as enum ('scale_1_5', 'yes_no_decline', 'free_text');

create table app.extra_questions (
  key        text primary key check (key ~ '^[a-z_]+$'),
  kind       app.extra_kind not null,
  sort_order int not null unique,
  -- true: may only ever be reported as a count for the whole organisation
  org_only   boolean not null default false
);

create table app.round_extra_questions (
  org_id    uuid not null,
  round_id  uuid not null,
  extra_key text not null references app.extra_questions (key),
  primary key (round_id, extra_key),
  foreign key (org_id, round_id) references app.rounds (org_id, id) on delete cascade
);

alter table app.extra_questions       enable row level security;
alter table app.round_extra_questions enable row level security;

-- The registry is public reference data, exactly like app.factors: a respondent
-- answering through a token has to be able to read the question they are answering.
create policy extra_question_read on app.extra_questions
  for select to authenticated, anon using (true);

create policy round_extra_read on app.round_extra_questions
  for select to authenticated using (app.is_org_member(org_id));
create policy round_extra_write on app.round_extra_questions
  for all to authenticated
  using (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder','verneombud']::app.org_role[]));

grant select on app.extra_questions to authenticated, anon;
grant select on app.round_extra_questions to authenticated;
grant insert, update, delete on app.round_extra_questions to authenticated;

insert into app.extra_questions (key, kind, sort_order, org_only) values
  ('anbefaling',  'scale_1_5',      1, false),
  ('krenkende',   'yes_no_decline', 2, true),
  ('vold',        'yes_no_decline', 3, true),
  ('apent_felt',  'free_text',      4, false);
