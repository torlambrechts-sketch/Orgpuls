/** Pure: lib/i18n/overrides.ts lays approved overrides over a catalogue with this (0101). */
type Tree = { [k: string]: unknown }

/** The catalogue with each override laid over the string at its path; nothing else changes */
export function applyOverrides<T>(tree: T, flat: Record<string, string>): T {
  const keys = Object.keys(flat)
  if (!keys.length) return tree
  const out = structuredClone(tree) as unknown as Tree
  for (const key of keys) {
    const parts = key.split('.')
    let node: unknown = out
    for (const p of parts.slice(0, -1)) node = node && typeof node === 'object' ? (node as Tree)[p] : undefined
    const last = parts.at(-1)!
    if (node && typeof node === 'object' && typeof (node as Tree)[last] === 'string') (node as Tree)[last] = flat[key]
  }
  return out as unknown as T
}

