-- 0231_outbox_kind_tilgang.sql — the notice that somebody asks to join an organisation that already
-- uses the product (X-114, D-279): the daglig leder is told who asks, and lets them in or not.
--
-- On its own because a value added to an enum cannot be used in the transaction that adds it,
-- and 0232 uses it (as 0102 did for 0103).

alter type app.outbox_kind add value if not exists 'tilgang';
