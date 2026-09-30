/**
 * The keyboard model of a question's options (WAI-ARIA APG, Radio Group): one tab stop per
 * group, and the arrow keys move to the next or previous option and choose it, wrapping at
 * either end. Space chooses the focused option; the option is a <button>, so that is the
 * browser's own click. Pure, so the model is tested without a browser (tests/unit/radiogroup).
 */

/** where an arrow key moves from `index` among `count` options, or null for any other key */
export function arrowTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null
  if (key === 'ArrowDown' || key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (index - 1 + count) % count
  return null
}

/** the option that takes Tab: the chosen one, else the first */
export function tabStop(values: readonly number[], chosen: number | undefined): number {
  const at = chosen === undefined ? -1 : values.indexOf(chosen)
  return at < 0 ? 0 : at
}
