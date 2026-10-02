-- 0147 — A round the year wheel plans gets the product's reminder (D-192).
--
-- A planned round takes its organisation's standard (0076, round_apply_defaults). An organisation
-- that never saved one has none, and the rounds the wheel plans for it (app.plan_round, the
-- scheduler) are inserted without a reminder day: `reminder_day` had no default, so it stayed null,
-- and the tick skips a round with none (0133, step 3). The year wheel's own tab meanwhile showed
-- «påminnelse dag 2» for that round (ArshjulTab falls back to 2), the Innstillinger tab shows 2 as
-- the standard, and start_next_pulse gives 2 when there is no standard (0108). The site says the
-- reminders go by themselves. So the round sent no reminder while every screen said it would.
--
-- The column now defaults to 2, the standard's own default (0076). Every insert that leaves the
-- column out — the wheel, the scheduler — gets it; every insert that names it, including a copy of a
-- round where a person chose «Ingen påminnelse», keeps what it names. A standard, when there is one,
-- still overrides it at insert (round_apply_defaults).
--
-- The planned rounds that already sit without one in an organisation without a standard get it too:
-- they were inserted by omission, as nothing else plans a round with no standard. Hosted holds two
-- such organisations, both test organisations, with four planned rounds each.

alter table app.rounds alter column reminder_day set default 2;

update app.rounds r
set reminder_day = 2
where r.status = 'planlagt'
  and r.reminder_day is null
  and not exists (select 1 from app.survey_defaults d where d.org_id = r.org_id);
