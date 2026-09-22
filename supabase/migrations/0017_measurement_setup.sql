-- 0017_measurement_setup.sql — what Måleoppsett decides, stored where it belongs.
--
-- The setup screen is where an organisation configures a measurement before it goes out,
-- and almost everything it offers was previously a control with nowhere to write. Six
-- numbered sections; this migration gives five of them a column and the sixth a table.
--
-- The sixth is the one that matters legally. § 9-2 makes a recurring measurement with
-- per-group results a "kontrolltiltak", and attaches three duties to it: drøfting with
-- the tillitsvalgte beforehand, information to those affected, and periodic evaluation of
-- whether the arrangement is still needed. § 6-2 fjerde ledd separately requires the
-- verneombud be consulted on the design of it. The design states all four on the screen.
-- Stated on a screen they are a promise; stored, they are documentation — and § 9-2 is
-- the paragraph an inspector asks about when results are broken down by department, which
-- this product does by default.
--
-- Two things deliberately NOT done here:
--
--   * `app.measurement_kind` gains 'oppfolging', but nothing in this migration uses it.
--     ALTER TYPE ... ADD VALUE inside a transaction cannot be used by later statements in
--     that same transaction, and this file runs as one.
--   * `round_audience` gains nothing. The design's section 3 checks departments, and an
--     empty `app.round_groups` already means "everyone" — a new enum value would be a
--     second way to say what the absence of rows says.

alter type app.measurement_kind add value if not exists 'oppfolging';

-- ---------------------------------------------------------------------------
-- 2 · Hvilke spørsmål — the comment regime
-- ---------------------------------------------------------------------------
--
-- Where a respondent may write free text is a privacy decision, not a preference. Every
-- option here trades detail against exposure: a comment field on every statement gathers
-- the most and is also the most re-identifying, because a person is recognisable by what
-- they describe (CLAUDE.md invariant 7). The design defaults to `lave` — a field that
-- appears only when somebody answers 1 or 2 — and that default is carried here rather
-- than left to whoever creates the round.
create type app.comment_policy as enum ('hvert', 'lave', 'slutt', 'av');

alter table app.rounds
  add column comment_policy app.comment_policy not null default 'lave',
  -- "Tillat anonym toveis-samtale på kommentarer": whether a leader may reply to a
  -- comment without learning who wrote it. False means comments are read and not answered.
  add column allow_dialogue boolean not null default true,
  -- 4 · Rytme og oppfølging. These are the round's *intent*; `opens_at` and `closes_at`
  -- remain its facts. They are both kept because they answer different questions — the
  -- setup screen shows what was configured, the rounds list shows what happened, and a
  -- round closed early must not rewrite the setting it was created under.
  add column reminder_day int check (reminder_day is null or reminder_day between 1 and 14),
  add column close_after_days int not null default 7 check (close_after_days between 1 and 60);

-- ---------------------------------------------------------------------------
-- 3 · Hvem skal svare
-- ---------------------------------------------------------------------------
--
-- No rows means every group, which is what `audience = 'alle_ansatte'` already says and
-- what the fixture's rounds do. Rows narrow it. The k floor is untouched by any of this:
-- a group that is invited and answers below the threshold is still withheld, which is the
-- warning the design prints under this section rather than a rule this table enforces.
create table app.round_groups (
  round_id uuid not null references app.rounds (id) on delete cascade,
  group_id uuid not null references app.groups (id) on delete cascade,
  primary key (round_id, group_id)
);

create index round_groups_group_idx on app.round_groups (group_id);

create function app.round_groups_same_org() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (
    select 1 from app.rounds r join app.groups g on g.org_id = r.org_id
    where r.id = new.round_id and g.id = new.group_id
  ) then
    raise exception 'round % and group % are not in the same organisation',
      new.round_id, new.group_id;
  end if;
  return new;
end $fn$;

create trigger round_groups_same_org
  before insert or update on app.round_groups
  for each row execute function app.round_groups_same_org();

-- ---------------------------------------------------------------------------
-- 5 · Egne spørsmål
-- ---------------------------------------------------------------------------
--
-- The organisation's own questions, which the design caps at five ("0 av 5"). The cap is
-- a trigger rather than a comment: the instrument's comparability is the product's whole
-- argument, and an unbounded tail of local questions turns a standardised measurement
-- into a survey builder. The eleven factors and their statements stay untouchable — these
-- are additional, never substitutions.
create table app.org_questions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0 and length(body) <= 300),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index org_questions_org_idx on app.org_questions (org_id) where active;

create function app.org_questions_cap() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare v_n int;
begin
  select count(*) into v_n from app.org_questions
  where org_id = new.org_id and active and id <> new.id;
  if new.active and v_n >= 5 then
    raise exception 'an organisation may have at most five of its own questions (has %)', v_n;
  end if;
  return new;
end $fn$;

create trigger org_questions_cap
  before insert or update on app.org_questions
  for each row execute function app.org_questions_cap();

create table app.round_org_questions (
  round_id    uuid not null references app.rounds (id) on delete cascade,
  question_id uuid not null references app.org_questions (id) on delete cascade,
  primary key (round_id, question_id)
);

-- ---------------------------------------------------------------------------
-- 6 · Forankring og drøfting — § 9-2 and § 6-2
-- ---------------------------------------------------------------------------
--
-- Four duties, two of them things somebody did on a date with a named counterpart.
--
--   verneombud_raad        § 6-2 fjerde ledd — the verneombud consulted on the design,
--                          not merely told about it afterwards
--   droftet_tillitsvalgte  § 9-2 første ledd — need and design discussed with the
--                          elected representatives before the measure is introduced
--
-- `held_on` and `counterpart` are what turn a ticked box into documentation. A box with
-- no date is a claim; "drøftet 3. februar med Kari Sund, tillitsvalgt Fellesforbundet" is
-- a record. Both are nullable, because the screen lets you tick the box first and fill in
-- the meeting afterwards, and a half-finished record is more honest than a refused one.
create type app.consultation_kind as enum ('verneombud_raad', 'droftet_tillitsvalgte');

create table app.round_consultations (
  round_id    uuid not null references app.rounds (id) on delete cascade,
  kind        app.consultation_kind not null,
  confirmed   boolean not null default false,
  held_on     date,
  counterpart text,
  note        text,
  primary key (round_id, kind)
);

-- § 9-2 tredje ledd: the arrangement must be evaluated periodically. It is a property of
-- the ordning, so it sits on the measurement rather than on one round of it.
create type app.evaluation_cadence as enum ('hver_6_mnd', 'arlig', 'etter_hver_runde');

alter table app.measurements
  add column evaluation_cadence app.evaluation_cadence not null default 'arlig';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Reading is org-wide on all four tables: a verneombud asked to advise on the setup
-- (§ 6-2) has to be able to see the setup. Writing is the employer's, the same pair that
-- owns measures and risk assessments.
alter table app.round_groups enable row level security;
alter table app.org_questions enable row level security;
alter table app.round_org_questions enable row level security;
alter table app.round_consultations enable row level security;

create policy round_group_read on app.round_groups
  for select using (
    exists (select 1 from app.rounds r where r.id = round_id and app.is_org_member(r.org_id))
  );
create policy round_group_write on app.round_groups
  for all
  using (exists (select 1 from app.rounds r where r.id = round_id
                 and app.has_role(r.org_id, array['daglig_leder','avdelingsleder']::app.org_role[])))
  with check (exists (select 1 from app.rounds r where r.id = round_id
                 and app.has_role(r.org_id, array['daglig_leder','avdelingsleder']::app.org_role[])));

create policy org_question_read on app.org_questions
  for select using (app.is_org_member(org_id));
create policy org_question_write on app.org_questions
  for all
  using (app.has_role(org_id, array['daglig_leder','avdelingsleder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder','avdelingsleder']::app.org_role[]));

create policy round_org_question_read on app.round_org_questions
  for select using (
    exists (select 1 from app.rounds r where r.id = round_id and app.is_org_member(r.org_id))
  );
create policy round_org_question_write on app.round_org_questions
  for all
  using (exists (select 1 from app.rounds r where r.id = round_id
                 and app.has_role(r.org_id, array['daglig_leder','avdelingsleder']::app.org_role[])))
  with check (exists (select 1 from app.rounds r where r.id = round_id
                 and app.has_role(r.org_id, array['daglig_leder','avdelingsleder']::app.org_role[])));

create policy round_consultation_read on app.round_consultations
  for select using (
    exists (select 1 from app.rounds r where r.id = round_id and app.is_org_member(r.org_id))
  );
create policy round_consultation_write on app.round_consultations
  for all
  using (exists (select 1 from app.rounds r where r.id = round_id
                 and app.has_role(r.org_id, array['daglig_leder','avdelingsleder']::app.org_role[])))
  with check (exists (select 1 from app.rounds r where r.id = round_id
                 and app.has_role(r.org_id, array['daglig_leder','avdelingsleder']::app.org_role[])));

revoke all on app.round_groups, app.org_questions, app.round_org_questions,
              app.round_consultations from anon, public;
grant select, insert, update, delete
  on app.round_groups, app.org_questions, app.round_org_questions,
     app.round_consultations to authenticated;
