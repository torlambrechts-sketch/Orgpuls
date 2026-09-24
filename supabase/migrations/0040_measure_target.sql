-- 0040_measure_target.sql — the number a measure aims for (design 3, Tiltak's detail panel).
--
-- "Slik måler vi effekten" names the statement a measure is followed up on, where it
-- stands now and where it should get to: "Nå 23 · Mål 33". "Nå" is the statement's index
-- from the latest grunnlinje, read through `results_items` (0037) and k-gated there. "Mål"
-- is a decision someone makes when they choose the measure, so it is stored here, on the
-- index's own 0–100 scale, and empty until someone sets it — the screen shows the empty
-- state rather than a target nobody chose.
--
-- It is written through the measures' existing policies (0013, 0026): no new write path.

alter table app.measures
  add column target int check (target is null or target between 0 and 100);

comment on column app.measures.target is
  'The index the followed statement should reach, 0–100. Null until someone sets it.';
