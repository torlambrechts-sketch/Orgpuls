-- 0008_round_audience.sql — who a round was sent to.
--
-- The rounds list prints "Alle ansatte · 37 spørsmål · lukket 14. september". The
-- question count is derivable from app.round_factors and app.round_extra_questions,
-- and the date from closes_at, but the audience was not held anywhere — so the label
-- would have had to be a literal in the component, which is the one thing a value on
-- this screen may never be.
--
-- It is a real domain concept rather than a caption. The Måleoppsett screen chooses
-- who a measurement goes to, and a puls aimed at a single department is a different
-- round from a grunnlinje aimed at everyone: the k-threshold still applies, but the
-- denominator the participation card divides by is the invited audience, not the
-- payroll. Recording it as an enum keeps that decision in the row rather than implied
-- by which invitations happen to exist, which matters once someone leaves mid-round.
--
-- One value exists today because the product can only send to everyone today. The
-- enum is the extension point; adding 'utvalgte_grupper' later is a row-level change
-- plus a message key, not a schema rewrite.

create type app.round_audience as enum ('alle_ansatte');

alter table app.rounds
  add column audience app.round_audience not null default 'alle_ansatte';
