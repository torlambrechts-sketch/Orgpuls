/**
 * Pairs what a design card says (a message) with what it looks like and where it goes
 * (code), index for index. The lengths must match — a card with words and no colour, or a
 * colour with no words, is a mistake in one of the two files — so a mismatch throws.
 */
export function zip<A, B>(looks: readonly A[], words: readonly B[]): (A & B)[] {
  if (looks.length !== words.length) throw new Error(`zip: ${looks.length} designs for ${words.length} messages`)
  return looks.map((a, i) => ({ ...a, ...(words[i] as B) }))
}
