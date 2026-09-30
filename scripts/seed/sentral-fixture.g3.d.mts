/** Types for sentral-fixture.g3.mjs, so the unit tests can import it (D-184). */
export const ENTITIES: readonly (readonly [string, string, string, string, string, number | null, number, string, string | null, string | null])[]
export const PARTNERS: readonly (readonly [string, string, string, string | null, string | null, string | null, number | null, string])[]
export const POLL_ID: number
export function g3Sql(helpers: {
  id: (name: string) => string
  q: (v: unknown) => string
  today: (hhmm: string) => string
  company: (key: string) => string
  contact: (key: string) => string
  task: (key: string) => string
}): string
