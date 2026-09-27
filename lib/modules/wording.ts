/**
 * A worded module's statements (0083, D-131): the barnehage og skole module says «barna» in a
 * kindergarten, «elevene» in a school and «barna eller elevene» where an organisation has both.
 * One statement, one code, three wordings; the organisation's choice (or its registered
 * industry) decides which a round asks. Safe for client components.
 */
export const WORDINGS = ['barnehage', 'skole', 'begge'] as const
export type Wording = (typeof WORDINGS)[number]
export type WordingVariants = { barnehage: string; skole: string }

export const isWording = (x: unknown): x is Wording => typeof x === 'string' && (WORDINGS as readonly string[]).includes(x)

/** The text in a wording; «begge», no wording, or a text without variants is the text itself. */
export const pickWording = (text: string, variants: WordingVariants | undefined, w: Wording | null | undefined) =>
  w && w !== 'begge' && variants ? variants[w] : text
