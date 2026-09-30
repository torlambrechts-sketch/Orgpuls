/**
 * The Sentral QA fixture's Growth G2 rows (D-183), written by scripts/seed/sentral-fixture.mjs inside
 * its own transaction, after its QA guard: LOCAL ONLY, like the rest of it.
 *
 * G2's registry (0142) is seeded by its migration with the report's text and Orgpuls' true statuses,
 * so the fixture writes no registry row. It sets one value the design's sample has and a fresh
 * database does not: the 90-day plan's start date. The design draws the plan in week 4 of 13 (weeks
 * 1–2 done, 3–4 in progress, 5–6 next); the start date three weeks before this week's Monday makes
 * the plan derive exactly that, so the Board's «Week» card and the plan's statuses can be diffed
 * against the render. A hosted database keeps its own start date — none until the plan starts.
 */
export function g2FixtureSql() {
  return `-- Growth G2 (D-183): the 90-day plan in its fourth week, as the design draws it
update app.growth_settings set plan_start = date_trunc('week', now() at time zone 'Europe/Oslo')::date - 21;
`
}
