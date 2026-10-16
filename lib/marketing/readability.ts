/**
 * How an article reads (D-287). The unit is the text we wrote ourselves — the lead, the paragraphs, the list
 * items, the boxes and the cards — not the law it quotes or the quotes it carries. On that text: sentence
 * length, and LIX, the Nordic readability index (words per sentence plus the share of words over six letters;
 * 30–40 reads easily, 40–50 is ordinary newspaper prose, over 50 is official text). A list counts each item
 * as a sentence. Also: the abbreviations an article may use only once it has spelled them out, the gendered
 * pairs it does not use at all, and the block kinds that draw rather than tell.
 * Held by tests/unit/article-standard.test.ts; reported by scripts/seo/content-audit.ts.
 */
import { type Block, plain } from './blocks'

export type ArticleText = { lead: string; blocks: Block[] }

/** the block kinds that draw: every article carries at least one, in both languages */
export const DIAGRAM_KINDS: ReadonlySet<string> = new Set(['table', 'cards', 'timeline', 'cycle', 'hub', 'ladder'])

/** the article's own prose, one string per paragraph, list item, box or card */
export function ownUnits(a: ArticleText): string[] {
  const units: string[] = [plain(a.lead)]
  for (const b of a.blocks) {
    if (b.t === 'p' || b.t === 'box') units.push(plain(b.text))
    else if (b.t === 'ul' || b.t === 'ol') for (const i of b.items) units.push(plain(i))
    else if (b.t === 'cards') for (const i of b.items) units.push(plain(i.text))
  }
  return units
}

const WORD = /[A-Za-zÆØÅæøå]/
const NOT_LETTER = /[^A-Za-zÆØÅæøå-]/g
export const words = (s: string) => s.split(/\s+/).filter((w) => WORD.test(w))

/** the sentences of one unit: a stop, question or exclamation mark (a closing » may follow), a space, then a capital, «, § or a digit */
export const sentences = (unit: string) => unit.split(/(?<=[.!?]»?)\s+(?=[A-ZÆØÅ«§0-9])/).filter((s) => s.trim())

export function lix(units: string[]): { lix: number; words: number; sentences: number } {
  const all = words(units.join(' '))
  const n = units.reduce((acc, u) => acc + Math.max(1, sentences(u).length), 0)
  const long = all.filter((w) => w.replace(NOT_LETTER, '').length > 6).length
  return { lix: all.length / Math.max(1, n) + (100 * long) / Math.max(1, all.length), words: all.length, sentences: n }
}

/** the sentences of our own prose over `max` words */
export function longSentences(units: string[], max = 40): string[] {
  return units.flatMap(sentences).filter((s) => words(s).length > max)
}

/** the pairs an inclusive text does not use: a reader is addressed as a person, not as one of two */
export const GENDERED = /\b(han eller hun|hun eller han|han\/hun|hun\/han|he or she|she or he|his or her|her or his|he\/she|s\/he)\b/i

/** every string of an article in reading order — title, description, H1, lead, then the blocks' texts */
export function allText(a: { title?: string; description?: string; h1?: string; lead: string; blocks: Block[] }): string {
  const parts: string[] = [a.title ?? '', a.description ?? '', a.h1 ?? '', a.lead]
  const walk = (v: unknown) => {
    if (typeof v === 'string') parts.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 't') walk(x)
  }
  walk(a.blocks)
  return parts.map(plain).join(' ')
}

/** what spells an abbreviation out, per language; an article that uses one has the gloss at its first use */
export const GLOSSES: Record<'no' | 'en', Record<string, RegExp>> = {
  no: {
    HMS: /helse-, miljø- og sikkerhet/i,
    QPS: /nordiske? spørreskjema|spørreskjema(et)? (om|for) psykologiske og sosiale/i,
    STAMI: /Statens arbeidsmiljøinstitutt/,
    SHA: /sikkerhet, helse og arbeidsmiljø/i,
    HR: /personal(avdeling|funksjon)/i,
    GDPR: /personvernforordning/i,
    AMU: /arbeidsmiljøutvalg/i,
    BHT: /bedriftshelsetjeneste/i,
    MTU: /medarbeidertilfredshetsundersøkelse/i,
    MUST: /Medarbeiderundersøkelsen i staten/i,
    NAV: /arbeids- og velferds/i,
    IA: /inkluderende arbeidsliv/i,
    KI: /kunstig intelligens/i,
    NPS: /Net Promoter Score/i,
    DPIA: /personvernkonsekvens/i,
  },
  en: {
    HSE: /health, safety and environment|health and safety/i,
    HMS: /health, (safety and environment|environment and safety)/i,
    QPS: /Nordic questionnaire|questionnaire (on|for) psychological and social/i,
    STAMI: /National Institute of Occupational Health/,
    SHA: /safety, health and (the )?working environment/i,
    HR: /human resources|personnel/i,
    GDPR: /General Data Protection Regulation/,
    AMU: /working environment committee/i,
    BHT: /occupational health service/i,
    MTU: /satisfaction survey/i,
    MUST: /government.s employee survey|civil service/i,
    NAV: /Labour and Welfare/i,
    IA: /inclusive working life/i,
    NPS: /Net Promoter Score/i,
    DPIA: /data protection impact assessment/i,
  },
}

/** the abbreviations the text uses without spelling them out at or before their first use (within 160 characters) */
export function unexplainedAbbreviations(text: string, lang: 'no' | 'en'): string[] {
  const out: string[] = []
  for (const [abbr, gloss] of Object.entries(GLOSSES[lang])) {
    const first = text.search(new RegExp(`(^|[^A-Za-z])${abbr}(?=$|[^A-Za-z])`))
    if (first < 0) continue
    const g = text.search(gloss)
    if (g < 0 || g > first + 160) out.push(abbr)
  }
  return out
}
