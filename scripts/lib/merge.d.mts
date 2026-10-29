/** The types of scripts/lib/merge.mjs, which is lib/i18n/merge.ts for the plain-Node scripts */
export type Tree = { [k: string]: unknown }
export function mergeValue(lower: unknown, upper: unknown): unknown
export function mergeMessages(lower: Tree, upper: Tree): Tree
