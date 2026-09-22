-- 0014_measure_basis_and_completion.sql — two columns 0013 should have had, added rather
-- than edited in, because a migration that has run is a record of what ran.
--
-- 1. `law_ref`. A measure's legal basis is not always its factor's. The design's own
--    cards prove it: two measures on Ytringsklima cite "aml. kap. 2A", the whistleblowing
--    chapter, where the factor itself cites "aml. § 4-3 · § 2A". A measure that exists
--    because somebody blew the whistle is documented under that chapter, and an
--    inspector reads the citation on the measure, not on the instrument. Null means "the
--    factor's", so nothing has to be restated to stay correct.
--
-- 2. `completed_on`. A deadline and a completion date are different facts, and the card
--    prints whichever the step calls for — "Frist 15. oktober" while it runs, "Gjennomført
--    5. september" once it is done, "Lukket 3. februar" once it is closed. Overloading
--    due_date to mean both would lose the deadline the moment the work finished, and the
--    deadline is the thing a late measure is late against.

alter table app.measures
  add column law_ref text,
  add column completed_on date;

comment on column app.measures.law_ref is
  'Legal basis for this measure when it differs from the factor''s. Null means the factor''s own citation applies.';
comment on column app.measures.completed_on is
  'When the measure was carried out or closed. Distinct from due_date, which stays the deadline it was measured against.';
