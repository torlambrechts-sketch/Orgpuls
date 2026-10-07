-- 0211 · One more kind of notice: «dette gjør vi» to everyone asked (D-245)
--
-- On its own because a value added to an enum cannot be used in the transaction that adds it, and
-- 0212 uses it (as 0098 did for 0099).

alter type app.outbox_kind add value if not exists 'tiltak_status';
