/**
 * The account chip's letters: the first letter of the first and the last name, as the
 * design's "TB" is Tuva Berg's. One name gives one letter; no name gives none.
 */
export function initialsOf(name: string | null | undefined): string | null {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const first = words[0]!.charAt(0)
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : ''
  return (first + last).toLocaleUpperCase('nb')
}
