import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Market } from '@/lib/markets'

/**
 * The data processing agreement (databehandleravtale, D-87): its words are messages
 * (`dpa.*`), and this file pins which words a signature is to.
 *
 * A signature records a version and the SHA-256 of that version's governing text. The database
 * holds the same pair (`app.dpa_versions`, 0047) and copies the hash onto each signature, so a signed
 * record says exactly what was agreed to. Changing a word of a governing text without publishing a
 * new version fails the unit test (tests/unit/dpa.test.ts): the words in force cannot drift from the
 * words signed.
 *
 * There is an agreement per market whose law it is written under (0226, D-274). Norway's governs in
 * Norwegian (`no.json`), and the other languages translate it. The United Kingdom's is its own, under
 * Article 28 of the UK GDPR, written in English and governing in English: the gb pack's `dpa`
 * (messages/market/gb/en.json), which an organisation there reads in any language, since the pack is
 * laid over the catalogue last (lib/i18n/request.ts). Sweden signs Norway's until its PUB-avtal (SE-E).
 *
 * Publishing a new version: edit the text, set the market's entry in DPA_IN_FORCE, and insert the
 * same pair into app.dpa_versions in a new migration, with the market.
 *
 * A Norwegian version is the date it was published, with `.2`, `.3` … for a second or third version the
 * same day (0151): 2026-10-02.2 says that a lower threshold, never under three, may be chosen;
 * 2026-10-02.3 (0166, D-202) what the Entra import stores; 2026-10-02.4 (0177, D-203) adds
 * Microsoft's Azure Bot Service, which relays a Teams message, to vedlegg 3, and the Teams
 * conversation to vedlegg 1; 2026-10-02.5 (0186, D-205) adds what Slack delivery stores to vedlegg 1;
 * 2026-10-05 (0204, X-103) adds, to vedlegg 1, the employee who asks to be told when management answers.
 * Another market's version carries its code in front of the date (gb-2026-10-10, 0226), so two
 * markets publishing on the same day never share a version.
 */
export const DPA_IN_FORCE = {
  no: { version: '2026-10-05', sha256: 'bb0c548efca436bbac573f8ed59ca1aaabf748b4b4de09d942f8a8b100186904' },
  gb: { version: 'gb-2026-10-10', sha256: '62bf840c8403acddd968b8146dc94ad95cbac86d8ca1ff8f02754d370aa12e58' },
} as const
export type DpaMarket = keyof typeof DPA_IN_FORCE

/**
 * The agreement an organisation in each market signs: its market's own where one is published, else
 * Norway's. Mirrors app.dpa_market (0226), which public.sign_dpa signs by.
 */
export const DPA_MARKET: Record<Market, DpaMarket> = { no: 'no', se: 'no', gb: 'gb' }

/** The version in force for an organisation in `market`, and its hash */
export function dpaInForce(market: Market): { version: string; sha256: string } {
  return DPA_IN_FORCE[DPA_MARKET[market]]
}

export const DpaSection = z.object({
  h: z.string().min(1),
  p: z.array(z.string().min(1)).optional(),
  ul: z.array(z.string().min(1)).optional(),
})
export type DpaSection = z.infer<typeof DpaSection>

export const DpaText = z.object({
  title: z.string().min(1),
  lead: z.string().min(1),
  sections: z.array(DpaSection).min(1),
})
export type DpaText = z.infer<typeof DpaText>

/** The text in one fixed shape, keys in one order, so the same words always hash the same. */
export function canonicalDpa(text: DpaText): string {
  return JSON.stringify({
    title: text.title,
    lead: text.lead,
    sections: text.sections.map((s) => ({ h: s.h, p: s.p ?? [], ul: s.ul ?? [] })),
  })
}

export function dpaHash(text: DpaText): string {
  return createHash('sha256').update(canonicalDpa(text)).digest('hex')
}

/**
 * The day a version was published: the version without its market or same-day suffix
 * (2026-10-02.2 → 2026-10-02, gb-2026-10-10 → 2026-10-10).
 */
export function dpaVersionDay(version: string): string {
  return version.replace(/^[a-z]{2}-/, '').slice(0, 10)
}
