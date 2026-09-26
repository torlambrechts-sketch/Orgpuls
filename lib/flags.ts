/**
 * Feature flags for features that are built but not yet decided (DECISION_LOG, industry
 * modules § 3). A flag hides a whole feature — the control and every sentence that promises
 * it — so the product never claims what it does not do.
 *
 * All are off. `ORGPULS_FLAGS=module_segments,…` switches them on for one deployment, for a
 * preview or a test, without a code change; nothing else reads the variable.
 */
export const FLAG_NAMES = ['module_factor_toggles', 'module_segments', 'signup_industry_hint'] as const
export type FlagName = (typeof FLAG_NAMES)[number]

const on = new Set(
  (process.env.ORGPULS_FLAGS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is FlagName => (FLAG_NAMES as readonly string[]).includes(s)),
)

export const flag = (name: FlagName): boolean => on.has(name)
