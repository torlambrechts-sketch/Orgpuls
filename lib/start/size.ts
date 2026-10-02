/**
 * The bands meet where the plans do (0048: Liten up to 25, Vanlig up to 100), so a company of 25
 * is in the first band, not the second, and is never priced out of Liten by its own answer. `max`
 * bounds a band; the register's headcount, when Brønnøysund has one, picks the band and is the
 * number kept, where it falls in the band chosen.
 */
export const SIZES = [
  { key: 'under25', count: 20, max: 25 },
  { key: 'to50', count: 38, max: 50 },
  { key: 'to100', count: 75, max: 100 },
  { key: 'over100', count: 150, max: Infinity },
] as const
export type SizeKey = (typeof SIZES)[number]['key']
export const bandOf = (n: number): SizeKey => SIZES.find((s) => n <= s.max)!.key
export const countFor = (key: SizeKey, register: number | null) => {
  const i = SIZES.findIndex((s) => s.key === key)
  const min = i === 0 ? 1 : SIZES[i - 1]!.max + 1
  return register !== null && register >= min && register <= SIZES[i]!.max ? register : SIZES[i]!.count
}
