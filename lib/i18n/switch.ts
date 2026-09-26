/**
 * The page a language switch returns to (D-109): a path on this site, never another host.
 * Anything else — an absolute URL, `//host`, a backslash trick — falls back to the start page.
 */
export function safeReturn(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || v.length > 300 || /[\u0000-\u001f]/.test(v)) return '/'
  return v
}

/** Where the switch sends someone to choose `locale` on the site at `base`: that host's own route. */
export const switchUrl = (base: string, locale: string, path: string) =>
  `${base}/api/sprak?${new URLSearchParams({ l: locale, til: safeReturn(path) })}`
