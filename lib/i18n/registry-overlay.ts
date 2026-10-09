import { sourceHash } from './survey-catalogue'

/**
 * Pure: the translation registry's instrument texts as catalogue paths (0216, D-253).
 *
 * A platform language whose survey texts live in the registry (lib/i18n/locales.ts `surveyTexts`,
 * Swedish) has no statements or factor names in its message file. The leader's views print them
 * from messages, so lib/i18n/request.ts lays the registry's approved texts over the catalogue at
 * the path each was translated from:
 *
 *   core:<factor>:<n>     factor.<factor>.s<n>    a statement
 *   extra:<question>      extra.<question>.text   a question outside the index
 *   extra:<question>:o<n> extra.<question>.o<n>   one of its options
 *   ui:factor.<factor>    factor.<factor>.label   a factor's name
 *   ui:extra.<question>   extra.<question>.label  a question's label
 *
 * A text is laid only where bokmål has a string at that path and it is still the bokmål the text
 * was translated from: once the bokmål changes, the English behind it is shown until the
 * translation is approved again, never a translation of something the survey no longer says.
 */
export type RegistryText = { t: string; h: string | null }

type Tree = { [k: string]: unknown }

export function registryPath(id: string): string | null {
  let m = /^core:([a-z_]+):(\d+)$/.exec(id)
  if (m) return `factor.${m[1]}.s${m[2]}`
  m = /^extra:([a-z_]+)$/.exec(id)
  if (m) return `extra.${m[1]}.text`
  m = /^extra:([a-z_]+):(o\d+)$/.exec(id)
  if (m) return `extra.${m[1]}.${m[2]}`
  m = /^ui:(factor|extra)\.([a-z_]+)$/.exec(id)
  if (m) return `${m[1]}.${m[2]}.label`
  return null
}

const at = (tree: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Tree)[k] : undefined), tree)

/** path → text for every registry text that still translates the bokmål at its path */
export function registryOverlay(no: Tree, texts: Record<string, RegistryText>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, { t, h }] of Object.entries(texts)) {
    const path = registryPath(id)
    if (!path || !t.trim()) continue
    const source = at(no, path)
    if (typeof source === 'string' && h === sourceHash(source)) out[path] = t
  }
  return out
}
