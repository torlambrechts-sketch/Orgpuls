import { createHash } from 'node:crypto'

/** Pure: lib/i18n/overrides.ts lays approved overrides over a catalogue with this (0101). */
type Tree = { [k: string]: unknown }

/**
 * An approved override as public.message_overrides returns it: since 0109 the text with the SHA-256
 * of the file text it replaced; before, the text alone.
 */
export type OverrideValue = string | { text: string; file: string | null }

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/**
 * Whether an override still replaces what the file says (0109, X-090). Once the files change at its
 * path, by the weekly fold-back or by hand, the files win. A row with no basis (before 0109) applies.
 */
export const stillApplies = (fileText: string, basis: string | null | undefined) => !basis || basis === sha(fileText)

/** The catalogue with each override laid over the string at its path; nothing else changes */
export function applyOverrides<T>(tree: T, flat: Record<string, OverrideValue>): T {
  const keys = Object.keys(flat)
  if (!keys.length) return tree
  const out = structuredClone(tree) as unknown as Tree
  for (const key of keys) {
    const parts = key.split('.')
    let node: unknown = out
    for (const p of parts.slice(0, -1)) node = node && typeof node === 'object' ? (node as Tree)[p] : undefined
    const last = parts.at(-1)!
    if (!node || typeof node !== 'object' || typeof (node as Tree)[last] !== 'string') continue
    const v = flat[key]!
    const [text, basis] = typeof v === 'string' ? [v, null] : [v.text, v.file]
    if (stillApplies((node as Tree)[last] as string, basis)) (node as Tree)[last] = text
  }
  return out as unknown as T
}
