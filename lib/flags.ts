/**
 * Feature flags for features that are built but not yet decided (DECISION_LOG, industry
 * modules § 3). A flag hides a whole feature — the control and every sentence that promises
 * it — so the product never claims what it does not do.
 *
 * All are off. `ORGPULS_FLAGS=module_segments,…` switches them on for one deployment, for a
 * preview or a test, without a code change; nothing else reads the variable. `ORGPULS_FLAGS=*`
 * switches every one on, which is what the QA tenant runs with (qa/README.md) — never set in
 * production, where each flag is named on its own once someone has signed it off.
 */
export const FLAG_NAMES = [
  'module_factor_toggles',
  'module_segments',
  'signup_industry_hint',
  // engagement (docs/implementation/engagement-phases.md P0.1): off in production, on in QA
  'engagement_since_last',
  'engagement_thanks',
  'engagement_pulse_reason',
  'engagement_results_page',
  'engagement_commitments',
  'engagement_celebrate',
  'engagement_reply_nudges',
  'engagement_suggestions',
  'engagement_vote',
  // gated by a person, not only by QA: a DPIA, badge sign-off, approved translations
  'action_volunteers',
  'measured_badge_public',
  'locale_en',
  'locale_pl',
  'locale_lt',
] as const
export type FlagName = (typeof FLAG_NAMES)[number]

const raw = (process.env.ORGPULS_FLAGS ?? '').split(',').map((s) => s.trim())
const on = new Set<FlagName>(
  raw.includes('*') ? FLAG_NAMES : raw.filter((s): s is FlagName => (FLAG_NAMES as readonly string[]).includes(s)),
)

export const flag = (name: FlagName): boolean => on.has(name)
