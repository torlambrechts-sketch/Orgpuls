import { createHash } from 'node:crypto'
import { z } from 'zod'

/**
 * The data processing agreement (databehandleravtale, D-87): its words are messages
 * (`dpa.*`), and this file pins which words a signature is to.
 *
 * A signature records a version and the SHA-256 of that version's Norwegian text, the text
 * that governs. The database holds the same pair (`app.dpa_versions`, 0047) and copies the
 * hash onto each signature, so a signed record says exactly what was agreed to. Changing a
 * word of the Norwegian text without publishing a new version fails the unit test
 * (tests/unit/dpa.test.ts): the words in force cannot drift from the words signed.
 *
 * Publishing a new version: edit the text, set DPA_VERSION and DPA_SHA256 here, and insert
 * the same pair into app.dpa_versions in a new migration.
 *
 * A version is the date it was published, with `.2`, `.3` … for a second or third version the
 * same day (0151): 2026-10-02.2 says that a lower threshold, never under three, may be chosen;
 * 2026-10-02.3 (0177, D-203) adds Microsoft's Azure Bot Service, which relays a Teams message, to
 * vedlegg 3, and the Teams conversation to vedlegg 1.
 */
export const DPA_VERSION = '2026-10-02.3'
export const DPA_SHA256 = 'a9dbe4c601cbee8e269575d99aff2b7755f739114d1d2d71a44492c9618ecfb9'

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

/** The day a version was published: the version without its same-day suffix (2026-10-02.2 → 2026-10-02). */
export function dpaVersionDay(version: string): string {
  return version.slice(0, 10)
}
