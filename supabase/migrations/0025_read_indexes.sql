-- 0025_read_indexes.sql — indexes for the reads the product actually makes.
--
-- P1 and P3 in docs/CODE_REVIEW_2026-09-23.md. Nothing here changes a policy, a
-- constraint or a row; it changes how the planner reaches them.
--
-- ---------------------------------------------------------------------------
-- WHY app.answers NEEDED ONE AT ALL
-- ---------------------------------------------------------------------------
--
-- `app.answers` carried exactly one index, its primary key
-- `(response_id, factor_key, ordinal)`. That serves the join from `app.responses`, whose
-- leading column it is. It cannot serve a predicate that leads with `factor_key`, which is
-- what every aggregation in the product does: the index per factor, the band per factor,
-- the effect comparison per factor.
--
-- `pg_stat_user_tables` on the hosted project, before this migration:
--
--     relname | seq_scan | seq_tup_read | avg rows per scan | live rows
--     answers |       80 |      134 178 |             1 677 |     1 716
--
-- Every sequential scan read essentially the whole table. At 1 716 rows that costs
-- `results_summary` 37.8 ms cold over 1 559 buffers, which is survivable and is why nobody
-- noticed. It is also linear: the design fixture is one organisation of 34 people, and a
-- 500-person undertaking answering 37 questions over three years is roughly 55 000 answer
-- rows — thirty-two times the work, per call, on a page that makes several.
--
-- ---------------------------------------------------------------------------
-- WHAT IS NOT HERE
-- ---------------------------------------------------------------------------
--
-- The advisor lists 25 unindexed foreign keys. This migration adds eight of them — the
-- ones on paths the product walks on every request — and deliberately not the other
-- seventeen. An index is not free: it is paid for on every insert, and `app.answers` and
-- `app.responses` are written by the one path that must stay fast under a whole
-- organisation answering at once. Indexes are added here because a query needs them, and
-- the next eight should be added the same way: measure, then add.
--
-- `memberships_group_idx` is the one to notice. `app.visible_groups` is on the path of
-- every scoped read in the product, and it joins memberships to groups.

-- the aggregations: group by factor across a round
create index if not exists answers_factor_idx on app.answers (factor_key, ordinal);

-- the k gate and every org-scoped result read
create index if not exists responses_org_round_idx on app.responses (org_id, round_id);
create index if not exists responses_group_idx on app.responses (group_id);

-- app.visible_groups, on every scoped read
create index if not exists memberships_group_idx on app.memberships (group_id) where group_id is not null;

-- Tiltak's owner chips and report section 6
create index if not exists measures_owner_idx on app.measures (owner_employee_id) where owner_employee_id is not null;
create index if not exists measures_effect_round_idx on app.measures (effect_round_id) where effect_round_id is not null;

-- the roster, and building a round's invitations
create index if not exists employees_group_idx on app.employees (group_id) where group_id is not null;
create index if not exists invitations_employee_idx on app.invitations (employee_id);
