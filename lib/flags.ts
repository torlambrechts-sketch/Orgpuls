import signedOff from './flags.signed-off.json'

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
  // innstillinger-og-forside.md § 4: the footer's and /bruksomrader's industry cards, off until all five pages are out
  'home_industries_block',
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
  'locale_uk',
  'locale_lt',
  'locale_sv',
  'locale_da',
] as const
export type FlagName = (typeof FLAG_NAMES)[number]

const isFlag = (s: string): s is FlagName => (FLAG_NAMES as readonly string[]).includes(s)

/**
 * The flags a person has signed off (engagement-phases.md § 1): on in every deployment,
 * production included, without an environment variable. The list is JSON so the dispatcher is
 * deployed with the same one (scripts/functions/deploy.mjs).
 *   - `locale_en`: Tor approved the English survey on 2026-09-27 (DECISION_LOG X-065). English
 *     is still offered only where every item and the page strings carry an approval in the
 *     database (lib/i18n/offered.ts), which a platform admin gives in the admin app.
 *   - `home_industries_block`: on since all five industry pages launched, 2026-09-28 (X-078).
 */
export const SIGNED_OFF: readonly FlagName[] = (signedOff as string[]).filter(isFlag)

const raw = (process.env.ORGPULS_FLAGS ?? '').split(',').map((s) => s.trim())
const on = new Set<FlagName>([...SIGNED_OFF, ...(raw.includes('*') ? FLAG_NAMES : raw.filter(isFlag))])

export const flag = (name: FlagName): boolean => on.has(name)
