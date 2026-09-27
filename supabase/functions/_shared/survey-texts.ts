/**
 * A survey language's page strings and mail texts, as the registry holds them approved (0086,
 * D-133), checked against the bokmål they must be translated from (lib/i18n/survey-source.json:
 * path → SHA-256 of the bokmål). Shared by the survey page and the dispatcher, so the page is
 * offered in a language exactly when its invitation can be sent in it. No imports: Deno runs it too.
 */
export type Approved = Record<string, { t: string; h: string | null }>

/** Every source path has an approved text made from that very source */
export function complete(source: Record<string, string>, approved: Approved | undefined): boolean {
  if (!approved) return false
  return Object.entries(source).every(([path, hash]) => approved[path]?.h === hash && approved[path]!.t.trim() !== '')
}

/** The approved texts as a nested object, for the paths the source has, each at `place(path)` */
export function nest(source: Record<string, string>, approved: Approved, place: (path: string) => string = (p) => p): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const path of Object.keys(source)) {
    const text = approved[path]?.t
    if (text === undefined) continue
    const keys = place(path).split('.')
    let o = out
    for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>
    o[keys[keys.length - 1]!] = text
  }
  return out
}

/**
 * Where a page string sits in the messages: `respond.*` as it is; a factor's or a question's label
 * (respondentStrings flattens `factor.<key>.label` to `factor.<key>`) back under `.label`.
 */
export const uiPlace = (path: string) => (/^(factor|extra)\.[^.]+$/.test(path) ? `${path}.label` : path)
