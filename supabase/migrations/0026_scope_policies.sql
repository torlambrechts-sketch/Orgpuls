-- 0026_scope_policies.sql — every policy says who it is for and what it is for.
--
-- S3, P5 and P6 in docs/CODE_REVIEW_2026-09-23.md, plus one finding the review missed.
-- All four rewrite the same policies, so they are one migration. **No one's access to
-- anything changes.** That is a claim, so it is argued here and asserted in
-- supabase/tests/write_invariants.sql (16–20).
--
-- ---------------------------------------------------------------------------
-- 1. FOR ALL IS SPLIT INTO INSERT, UPDATE AND DELETE  (P5)
-- ---------------------------------------------------------------------------
--
-- Twenty-one tables carried a `*_read` policy FOR SELECT and a `*_write` policy FOR ALL.
-- FOR ALL includes SELECT, so every read evaluated both and OR'd them: the effective read
-- rule for app.measures was `measure_read OR measure_write`, not `measure_read`, and
-- Postgres paid for both on every row. The Supabase advisor counted 73 of these.
--
-- Dropping SELECT from the write policies is only safe if no one was reading *through*
-- them. The proof is in the two function bodies:
--
--     is_org_member(o) = exists(membership: org_id = o, user_id = auth.uid(), active)
--     has_role(o, r)   = exists(membership: org_id = o, user_id = auth.uid(), active,
--                                role = any(r))
--
-- has_role is is_org_member with one more conjunct, so it implies it. Every write
-- expression below is has_role on the same org its read partner tests with
-- is_org_member — directly, or through the same parent table for the child tables — so
-- anyone the write policy would have admitted to a SELECT, the read policy already admits.
-- The OR contributed nothing but cost.
--
-- UPDATE and DELETE still need the row to be *visible* to find it, and an INSERT ...
-- RETURNING (which every server action now does, S1) needs the new row visible to return
-- it. Both now come from the read policy alone, and both still succeed by the same
-- implication. write_invariants.sql 1–3 and 13 exercise exactly that path.
--
-- The expressions are unchanged, character for character in meaning; the names gain a
-- suffix so a grep for the old name finds the new three.
--
-- ---------------------------------------------------------------------------
-- 2. EVERY ORG-DATA POLICY IS TO authenticated  (S3)
-- ---------------------------------------------------------------------------
--
-- Twenty-eight policies had no TO clause, which means TO public — every role, anon
-- included. It was latent rather than live: a policy only admits a role that also holds a
-- table GRANT, and anon's grants in this schema are the four instrument tables and nothing
-- else (verified 2026-09-23). But that made the grant the only thing between an anonymous
-- caller and thirteen tables of organisational data, and a grant is invisible where the
-- policy is written. Now both would have to be wrong at once.
--
-- The four instrument tables (factors, statements, extra_questions, extra_options) keep
-- `TO anon, authenticated USING (true)`: they are the question text itself, public by
-- nature, and they are not touched here.
--
-- ---------------------------------------------------------------------------
-- 3. auth.uid() ONCE PER QUERY, NOT ONCE PER ROW  (P6)
-- ---------------------------------------------------------------------------
--
-- The advisor flagged app.profiles: `id = auth.uid()` is re-evaluated per row.
-- `(select auth.uid())` is hoisted into an InitPlan and evaluated once. Same value, same
-- rule.
--
-- The review also proposed hoisting app.is_org_member() out of every read policy. That is
-- **not** done here, deliberately. Its argument varies per row so it cannot be hoisted the
-- same way; the replacement would be a subquery on app.memberships, which has RLS of its
-- own and is exactly the recursion is_org_member exists to break by being SECURITY
-- DEFINER. The tables it guards are small — the large ones, answers and responses, are
-- never read through RLS at all, only through the k-gated definer RPCs — so the cost is
-- an index probe per row on tables of hundreds. The risk of rewriting fifteen read rules
-- to save that is not worth taking before there is a query plan that says otherwise.
--
-- ---------------------------------------------------------------------------
-- 4. app.job_runs EXPOSES ITS HEARTBEAT AND NOTHING ELSE  (new)
-- ---------------------------------------------------------------------------
--
-- job_runs is the scheduler's log: one row per hourly tick, with how many rounds it
-- opened, closed and planned and how many notices it queued — counted across *every*
-- organisation, because the tick is global. Its read policy was `USING (true)` and
-- authenticated held SELECT, so since sign-up went live (0024) any organisation's users
-- could read platform-wide activity: how many customers' rounds opened this hour.
--
-- The Årshjulet screen uses one column of it — `ran_at`, for "Årshjulet gikk sist …",
-- which is what makes "kjører" checkable. The counts were fetched and never rendered.
-- So the grant narrows to that one column, and lib/wheel/read.ts asks for nothing else.
-- A timestamp that the scheduler ran is not information about any customer.

-- 1 ---------------------------------------------------------------- split FOR ALL

drop policy employee_write on app.employees;
create policy employee_write_insert on app.employees for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy employee_write_update on app.employees for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy employee_write_delete on app.employees for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));

drop policy group_admin on app.groups;
create policy group_admin_insert on app.groups for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy group_admin_update on app.groups for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy group_admin_delete on app.groups for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));

drop policy invitation_write on app.invitations;
create policy invitation_write_insert on app.invitations for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy invitation_write_update on app.invitations for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy invitation_write_delete on app.invitations for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));

drop policy location_write on app.locations;
create policy location_write_insert on app.locations for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy location_write_update on app.locations for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy location_write_delete on app.locations for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));

drop policy measure_group_write on app.measure_groups;
create policy measure_group_write_insert on app.measure_groups for insert to authenticated
  with check ((EXISTS ( SELECT 1 FROM app.measures m WHERE ((m.id = measure_groups.measure_id) AND app.has_role(m.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy measure_group_write_update on app.measure_groups for update to authenticated
  using ((EXISTS ( SELECT 1 FROM app.measures m WHERE ((m.id = measure_groups.measure_id) AND app.has_role(m.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))))
  with check ((EXISTS ( SELECT 1 FROM app.measures m WHERE ((m.id = measure_groups.measure_id) AND app.has_role(m.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy measure_group_write_delete on app.measure_groups for delete to authenticated
  using ((EXISTS ( SELECT 1 FROM app.measures m WHERE ((m.id = measure_groups.measure_id) AND app.has_role(m.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));

drop policy measurement_write on app.measurements;
create policy measurement_write_insert on app.measurements for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy measurement_write_update on app.measurements for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy measurement_write_delete on app.measurements for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));

drop policy measure_write on app.measures;
create policy measure_write_insert on app.measures for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]));
create policy measure_write_update on app.measures for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]));
create policy measure_write_delete on app.measures for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]));

drop policy membership_admin on app.memberships;
create policy membership_admin_insert on app.memberships for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy membership_admin_update on app.memberships for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy membership_admin_delete on app.memberships for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));

drop policy org_question_write on app.org_questions;
create policy org_question_write_insert on app.org_questions for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]));
create policy org_question_write_update on app.org_questions for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]));
create policy org_question_write_delete on app.org_questions for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]));

drop policy risk_assessment_write on app.risk_assessments;
create policy risk_assessment_write_insert on app.risk_assessments for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]));
create policy risk_assessment_write_update on app.risk_assessments for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]));
create policy risk_assessment_write_delete on app.risk_assessments for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role]));

drop policy risk_factor_write on app.risk_factor_assessments;
create policy risk_factor_write_insert on app.risk_factor_assessments for insert to authenticated
  with check ((EXISTS ( SELECT 1 FROM app.risk_assessments ra WHERE ((ra.id = risk_factor_assessments.assessment_id) AND app.has_role(ra.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy risk_factor_write_update on app.risk_factor_assessments for update to authenticated
  using ((EXISTS ( SELECT 1 FROM app.risk_assessments ra WHERE ((ra.id = risk_factor_assessments.assessment_id) AND app.has_role(ra.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))))
  with check ((EXISTS ( SELECT 1 FROM app.risk_assessments ra WHERE ((ra.id = risk_factor_assessments.assessment_id) AND app.has_role(ra.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy risk_factor_write_delete on app.risk_factor_assessments for delete to authenticated
  using ((EXISTS ( SELECT 1 FROM app.risk_assessments ra WHERE ((ra.id = risk_factor_assessments.assessment_id) AND app.has_role(ra.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));

drop policy round_consultation_write on app.round_consultations;
create policy round_consultation_write_insert on app.round_consultations for insert to authenticated
  with check ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_consultations.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy round_consultation_write_update on app.round_consultations for update to authenticated
  using ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_consultations.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))))
  with check ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_consultations.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy round_consultation_write_delete on app.round_consultations for delete to authenticated
  using ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_consultations.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));

drop policy round_extra_write on app.round_extra_questions;
create policy round_extra_write_insert on app.round_extra_questions for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy round_extra_write_update on app.round_extra_questions for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy round_extra_write_delete on app.round_extra_questions for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));

drop policy round_factor_write on app.round_factors;
create policy round_factor_write_insert on app.round_factors for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy round_factor_write_update on app.round_factors for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy round_factor_write_delete on app.round_factors for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));

drop policy round_group_write on app.round_groups;
create policy round_group_write_insert on app.round_groups for insert to authenticated
  with check ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_groups.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy round_group_write_update on app.round_groups for update to authenticated
  using ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_groups.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))))
  with check ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_groups.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy round_group_write_delete on app.round_groups for delete to authenticated
  using ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_groups.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));

drop policy information_write on app.round_information;
create policy information_write_insert on app.round_information for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy information_write_update on app.round_information for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy information_write_delete on app.round_information for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));

drop policy round_org_question_write on app.round_org_questions;
create policy round_org_question_write_insert on app.round_org_questions for insert to authenticated
  with check ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_org_questions.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy round_org_question_write_update on app.round_org_questions for update to authenticated
  using ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_org_questions.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))))
  with check ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_org_questions.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));
create policy round_org_question_write_delete on app.round_org_questions for delete to authenticated
  using ((EXISTS ( SELECT 1 FROM app.rounds r WHERE ((r.id = round_org_questions.round_id) AND app.has_role(r.org_id, ARRAY['daglig_leder'::app.org_role, 'avdelingsleder'::app.org_role])))));

drop policy round_write on app.rounds;
create policy round_write_insert on app.rounds for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy round_write_update on app.rounds for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy round_write_delete on app.rounds for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));

drop policy training_write on app.trainings;
create policy training_write_insert on app.trainings for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy training_write_update on app.trainings for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));
create policy training_write_delete on app.trainings for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role, 'verneombud'::app.org_role]));

drop policy wheel_notification_write on app.wheel_notifications;
create policy wheel_notification_write_insert on app.wheel_notifications for insert to authenticated
  with check ((EXISTS ( SELECT 1 FROM app.year_wheels w WHERE ((w.id = wheel_notifications.wheel_id) AND app.has_role(w.org_id, ARRAY['daglig_leder'::app.org_role])))));
create policy wheel_notification_write_update on app.wheel_notifications for update to authenticated
  using ((EXISTS ( SELECT 1 FROM app.year_wheels w WHERE ((w.id = wheel_notifications.wheel_id) AND app.has_role(w.org_id, ARRAY['daglig_leder'::app.org_role])))))
  with check ((EXISTS ( SELECT 1 FROM app.year_wheels w WHERE ((w.id = wheel_notifications.wheel_id) AND app.has_role(w.org_id, ARRAY['daglig_leder'::app.org_role])))));
create policy wheel_notification_write_delete on app.wheel_notifications for delete to authenticated
  using ((EXISTS ( SELECT 1 FROM app.year_wheels w WHERE ((w.id = wheel_notifications.wheel_id) AND app.has_role(w.org_id, ARRAY['daglig_leder'::app.org_role])))));

drop policy wheel_write on app.year_wheels;
create policy wheel_write_insert on app.year_wheels for insert to authenticated
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy wheel_write_update on app.year_wheels for update to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]))
  with check (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));
create policy wheel_write_delete on app.year_wheels for delete to authenticated
  using (app.has_role(org_id, ARRAY['daglig_leder'::app.org_role]));

-- 2 ------------------------------------------------------------ TO authenticated
alter policy job_run_read on app.job_runs to authenticated;
alter policy location_read on app.locations to authenticated;
alter policy measure_group_read on app.measure_groups to authenticated;
alter policy measure_read on app.measures to authenticated;
alter policy org_question_read on app.org_questions to authenticated;
alter policy outbox_read on app.outbox to authenticated;
alter policy risk_assessment_read on app.risk_assessments to authenticated;
alter policy risk_factor_read on app.risk_factor_assessments to authenticated;
alter policy round_consultation_read on app.round_consultations to authenticated;
alter policy round_group_read on app.round_groups to authenticated;
alter policy information_read on app.round_information to authenticated;
alter policy round_org_question_read on app.round_org_questions to authenticated;
alter policy training_read on app.trainings to authenticated;
alter policy wheel_notification_read on app.wheel_notifications to authenticated;
alter policy wheel_read on app.year_wheels to authenticated;

-- 3 ------------------------------------------------------------ auth.uid() hoisted
alter policy profile_self_read on app.profiles
  using (id = (select auth.uid()));
alter policy profile_self_write on app.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 4 ------------------------------------------------------------ job_runs heartbeat
revoke select on app.job_runs from authenticated, anon;
grant select (ran_at) on app.job_runs to authenticated;
