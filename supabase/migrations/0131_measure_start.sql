-- 0131_measure_start.sql — when a measure starts (D-75's open item, D-173).
--
-- Tiltak's plan draws each chosen and running measure as a bar from its start to its deadline.
-- A measure had a deadline (`due_date`, 0013) and no start, so the bar began where the row was
-- written — "when it was recorded", which is when somebody typed it in, not when the work begins.
-- A measure decided in September for work that starts after the winter holiday was drawn as if it
-- were already under way.
--
-- `starts_on` is that date: a calendar date, like `due_date`, and empty until a leader sets it.
-- Empty keeps today's rule — the plan draws from `created_at` — so no measure that exists moves.
-- The one rule the data can hold on its own is the order: a measure cannot start after its
-- deadline. It is a CHECK and not a trigger, so it holds for every writer and has nothing to say
-- about referential maintenance (CLAUDE.md): no cascade or SET NULL touches either date.
--
-- Written through the measures' existing policies (0013, 0026): daglig leder and avdelingsleder
-- write, every member reads, the verneombud reads and does not write. The table-level grant covers
-- a new column, and no column-level grant or revoke exists on app.measures. The step log (0105)
-- fires on `step` alone, the closing rule (0015) and the module and effect-round checks read
-- other columns, and the demo copy (0094) copies every column it finds: none of them needs this one
-- named. No new write path.

alter table app.measures
  add column starts_on date,
  add constraint measures_starts_before_due
    check (starts_on is null or due_date is null or starts_on <= due_date);

comment on column app.measures.starts_on is
  'The day the work on the measure begins (D-173). Null until a leader sets it; Tiltak''s plan then '
  'draws the measure from created_at. Never after due_date.';
