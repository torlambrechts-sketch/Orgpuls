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
 */
export const DPA_VERSION = '2026-09-25'
export const DPA_SHA256 = '92a39e5765e43fab1ddf9c7c80b196bc65e6d0a6951c40b223212a1c929a5771'

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
