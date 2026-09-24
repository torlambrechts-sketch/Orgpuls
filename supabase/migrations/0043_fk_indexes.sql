-- 0043_fk_indexes.sql — a covering index for every foreign key in `app` (P8, D-77).
--
-- Supabase's performance advisor listed 21 foreign keys with no index whose leading columns
-- are the key. Each costs a sequential scan of the child whenever its parent row is deleted
-- or its key updated, and every join the readers make along it. The tables are small now;
-- the organisation delete in particular cascades through all of them, so they are indexed
-- before they are not small. `response_comments (factor_key)` is covered by the
-- `(factor_key, ordinal)` index below and needs none of its own.

create index if not exists extra_answers_extra_key_fk_idx on app.extra_answers (extra_key);
create index if not exists invitations_org_id_round_id_fk_idx on app.invitations (org_id, round_id);
create index if not exists member_invites_accepted_by_fk_idx on app.member_invites (accepted_by);
create index if not exists member_invites_created_by_fk_idx on app.member_invites (created_by);
create index if not exists member_invites_group_id_fk_idx on app.member_invites (group_id);
create index if not exists outbox_employee_id_fk_idx on app.outbox (employee_id);
create index if not exists outbox_invitation_id_fk_idx on app.outbox (invitation_id);
create index if not exists outbox_org_id_fk_idx on app.outbox (org_id);
create index if not exists response_comments_factor_key_ordinal_fk_idx on app.response_comments (factor_key, ordinal);
create index if not exists risk_assessments_assessed_by_employee_id_fk_idx on app.risk_assessments (assessed_by_employee_id);
create index if not exists round_extra_questions_extra_key_fk_idx on app.round_extra_questions (extra_key);
create index if not exists round_extra_questions_org_id_round_id_fk_idx on app.round_extra_questions (org_id, round_id);
create index if not exists round_factors_factor_key_fk_idx on app.round_factors (factor_key);
create index if not exists round_factors_org_id_round_id_fk_idx on app.round_factors (org_id, round_id);
create index if not exists round_information_org_id_fk_idx on app.round_information (org_id);
create index if not exists round_org_questions_question_id_fk_idx on app.round_org_questions (question_id);
create index if not exists round_starts_round_id_fk_idx on app.round_starts (round_id);
create index if not exists round_starts_started_by_fk_idx on app.round_starts (started_by);
create index if not exists rounds_org_id_measurement_id_fk_idx on app.rounds (org_id, measurement_id);
create index if not exists trainings_org_id_fk_idx on app.trainings (org_id);
