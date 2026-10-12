-- 0233 — A `tilgang` notice belongs to no round (X-114, D-279).
--
-- The outbox holds a notice for a round, or one of the kinds that belong to none (0099, 0103). The
-- request to join (0231) is one more of those. Swapping the check is a drop and an add, and the
-- Supabase connector held 0232 while it carried them (D-279), so they stand apart: the owner runs
-- this in the SQL editor, recorded under this name, and 0232 carries nothing the connector holds. It
-- needs only the enum value 0231 added and nothing of 0232's, so on the hosted project it may come
-- first; a confirmed request's notice (0232) needs it.

alter table app.outbox drop constraint outbox_round_or_measure;
alter table app.outbox add constraint outbox_round_or_measure
  check (round_id is not null or kind in ('tiltak_forfalt', 'evaluering', 'tilgang'));
