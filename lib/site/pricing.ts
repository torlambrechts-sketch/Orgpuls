/**
 * The three plans as /priser sizes them (D-190), the numbers billing keeps: Liten up to 25
 * employees at 265 kr a month, Vanlig up to 100 at 565 kr, Flere selskaper by agreement at any size
 * (supabase/migrations/0048_billing.sql, `save_billing` refuses a plan below the headcount). The
 * page's words are `site.pris`; these are the numbers its size read-out computes with.
 */
export const PLAN_SIZES = [
  { key: 'small', max: 25, monthly: 265 },
  { key: 'usual', max: 100, monthly: 565 },
  { key: 'group', max: Infinity, monthly: null },
] as const

/** The read-out's range (the design's slider) and where it starts */
export const SIZE_RANGE = { min: 1, max: 150, start: 18 } as const

/** Which plan a headcount fits: 0 Liten, 1 Vanlig, 2 Flere selskaper */
export const fitOf = (n: number) => PLAN_SIZES.findIndex((p) => n <= p.max)
