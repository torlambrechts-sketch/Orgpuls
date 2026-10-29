/**
 * lib/i18n/merge.ts for the plain-Node scripts, which cannot import TypeScript: the same rule, word
 * for word, held equal to it by tests/unit/merge.test.ts. An object merged key by key; a list of the
 * lower one's length item by item, null keeping the lower one's item; anything else the upper one's.
 */
const isTree = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

export function mergeValue(lower, upper) {
  if (upper === undefined || upper === null) return lower
  if (isTree(lower) && isTree(upper)) return mergeMessages(lower, upper)
  if (Array.isArray(lower) && Array.isArray(upper) && lower.length === upper.length) return upper.map((v, i) => mergeValue(lower[i], v))
  return upper
}

/** `upper` over `lower`, key by key */
export function mergeMessages(lower, upper) {
  return Object.fromEntries([...new Set([...Object.keys(lower), ...Object.keys(upper)])].map((k) => [k, mergeValue(lower[k], upper[k])]))
}
