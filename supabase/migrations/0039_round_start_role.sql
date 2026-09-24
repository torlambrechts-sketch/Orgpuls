-- 0039_round_start_role.sql — 0038's read policy names its role.
--
-- `round_start_read` was written without `to authenticated`, so it applied to `public`,
-- anon included. anon has no grant on the table and the policy's `has_role` needs a
-- signed-in member, so nothing was readable through it. But 0026 made "every policy on
-- organisation data names `authenticated`" a rule of the schema, and write_invariants.sql
-- (check 17) holds it. This puts the policy back inside the rule rather than leaving a
-- second line of defence doing the first one's job.

alter policy round_start_read on app.round_starts to authenticated;
