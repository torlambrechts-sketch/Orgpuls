import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The pseudo-locale hook (scripts/i18n/pseudo.mjs; multilingual-gap-analysis.md, CI check 6).
 *
 * With ORGPULS_PSEUDO=1 the source catalogue (`no`) is replaced by its pseudo form: accented,
 * about 40 % longer, every message bracketed. It is how the QA stack renders the respondent
 * screens as a longer language would, to prove nothing clips or scrolls sideways at 320 px.
 * The variable is read per request, so the same QA build serves both catalogues; only the QA
 * pseudo server sets it (scripts/qa/serve.mjs), and it is ignored on a Vercel production
 * deployment whatever it says.
 *
 * Without the variable this returns `messages` itself: nothing is read, nothing changes.
 * The generated file is not committed; `node scripts/i18n/pseudo.mjs` writes it.
 */
export const PSEUDO_FILE = '.pseudo/no.json'

let catalogue: unknown

export function pseudoMessages<T>(locale: string, messages: T): T {
  if (process.env.ORGPULS_PSEUDO !== '1' || process.env.VERCEL_ENV === 'production' || locale !== 'no') return messages
  if (catalogue === undefined) {
    try {
      catalogue = JSON.parse(readFileSync(join(process.cwd(), PSEUDO_FILE), 'utf8'))
    } catch {
      throw new Error(`ORGPULS_PSEUDO=1 but ${PSEUDO_FILE} is missing or unreadable: run node scripts/i18n/pseudo.mjs`)
    }
  }
  return catalogue as T
}
