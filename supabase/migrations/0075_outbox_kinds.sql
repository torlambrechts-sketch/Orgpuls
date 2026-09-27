-- 0075_outbox_kinds.sql — two new kinds of personal message (X-064, D-126).
--
--   lenke             the link a person asked for from the QR page (0076, request_link);
--   siste_paminnelse  the second reminder, the day before the round closes (0076).
--
-- On their own because a value added to an enum cannot be used in the transaction that
-- adds it, and 0076 uses both.

alter type app.outbox_kind add value if not exists 'lenke';
alter type app.outbox_kind add value if not exists 'siste_paminnelse';
