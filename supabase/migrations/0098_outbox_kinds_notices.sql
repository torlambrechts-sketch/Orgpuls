-- 0098_outbox_kinds_notices.sql — two new kinds of notice (gap analysis P1-5, P1-6; D-149).
--
--   tiltak_forfalt  a measure past its date, or standing still: to its owner, and a copy to the
--                   verneombud where Årshjulet says so (year_wheels.notify_vo_on_overdue, 0019)
--   svarprosent     an open round where a department answers well below the rest: to the daglig
--                   leder, with what can be done about it
--
-- On their own because a value added to an enum cannot be used in the transaction that adds it,
-- and 0099 uses both (as 0075 did for 0076).

alter type app.outbox_kind add value if not exists 'tiltak_forfalt';
alter type app.outbox_kind add value if not exists 'svarprosent';
