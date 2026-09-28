-- 0102_outbox_kind_evaluering.sql — the reminder that the ordning is due for evaluation
-- (aml. § 9-2 tredje ledd; audit finding A-02, D-153).
--
-- On its own because a value added to an enum cannot be used in the transaction that adds it,
-- and 0103 uses it (as 0098 did for 0099).

alter type app.outbox_kind add value if not exists 'evaluering';
