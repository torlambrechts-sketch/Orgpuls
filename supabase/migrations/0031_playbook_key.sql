-- 0031_playbook_key.sql — which suggestion a measure came from.
--
-- The design (2026-09-24) offers three research-backed measures per factor, on Resultat
-- under the open factor row and on Tiltak as "Forslag fra resultatene", each with a
-- "Gjør til tiltak" button that turns into "Lagt til i Tiltak ✓" once pressed. In the
-- prototype that is local state. Here it has to be a fact about the organisation's
-- measures, or every member sees a different answer and a reload forgets it.
--
-- So a measure may carry the key of the suggestion it was adopted from, `<factor>.<n>`,
-- matching lib/playbook/registry.ts. Nullable: a measure the leader wrote themselves has
-- none. Unique per organisation: the button offers each suggestion once, and a second
-- press during a slow round-trip must not create a twin. Deleting the measure frees the
-- key, which is the same thing the design's button promises in the other direction.
--
-- No policy changes: the column rides on measure_read / measure_write from 0013.

alter table app.measures
  add column playbook_key text
    check (playbook_key ~ '^[a-z]+\.[1-3]$');

comment on column app.measures.playbook_key is
  'The playbook suggestion this measure was adopted from (<factor>.<n>, see lib/playbook/registry.ts). Null for a measure written by hand.';

create unique index measures_one_per_playbook_key
  on app.measures (org_id, playbook_key)
  where playbook_key is not null;
