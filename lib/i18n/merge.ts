/**
 * How one catalogue is laid over another: a language over the one it falls back to, a market's pack
 * over its language (lib/i18n/request.ts). The upper catalogue holds only what differs, and everything
 * it leaves out is the lower one's, so a text written once in the lower one reaches every catalogue
 * laid over it (docs/markets/PLAN.md, «market packs are data»).
 *
 *   an object        merged key by key; a key the upper one lacks, or holds as null, is the lower one's
 *   a list           of the lower one's length: merged item by item, null keeping the lower one's item,
 *                    so a pack that changes one bullet of five holds that bullet and four nulls; of
 *                    another length: the upper one's, whole (a market with a bullet more or fewer)
 *   anything else    the upper one's
 *
 * scripts/lib/merge.mjs is the same rule for the plain-Node scripts, and the mail's mergeTree
 * (supabase/functions/_shared/mail.ts) for the edge functions; tests/unit/merge.test.ts holds the
 * three equal. scripts/i18n/pack-delta.mjs keeps every pack to what differs, and refuses a list with
 * a null item whose lower list has another length, the one case where a hole could show as nothing.
 */
export type Tree = { [k: string]: unknown }

const isTree = (v: unknown): v is Tree => !!v && typeof v === 'object' && !Array.isArray(v)

export function mergeValue(lower: unknown, upper: unknown): unknown {
  if (upper === undefined || upper === null) return lower
  if (isTree(lower) && isTree(upper)) return mergeMessages(lower, upper)
  if (Array.isArray(lower) && Array.isArray(upper) && lower.length === upper.length) return upper.map((v, i) => mergeValue(lower[i], v))
  return upper
}

/** `upper` over `lower`, key by key */
export function mergeMessages(lower: Tree, upper: Tree): Tree {
  return Object.fromEntries([...new Set([...Object.keys(lower), ...Object.keys(upper)])].map((k) => [k, mergeValue(lower[k], upper[k])]))
}
