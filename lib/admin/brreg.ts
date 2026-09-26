import 'server-only'
import { z } from 'zod'

/**
 * Searching Enhetsregisteret for prospects (D-103): the open register's search, by industry
 * code, municipality, size and organisation form, excluding bankrupt companies and companies
 * being wound up. Public data only. Nothing is stored until the admin adds a company.
 */
const Unit = z.object({
  organisasjonsnummer: z.string(),
  navn: z.string(),
  organisasjonsform: z.object({ kode: z.string().nullish() }).nullish(),
  naeringskode1: z.object({ kode: z.string().nullish(), beskrivelse: z.string().nullish() }).nullish(),
  antallAnsatte: z.number().nullish(),
  forretningsadresse: z.object({ kommune: z.string().nullish(), kommunenummer: z.string().nullish() }).nullish(),
  hjemmeside: z.string().nullish(),
  epostadresse: z.string().nullish(),
  telefon: z.string().nullish(),
  mobil: z.string().nullish(),
})
const Page = z.object({
  _embedded: z.object({ enheter: z.array(Unit) }).optional(),
  page: z.object({ totalElements: z.number(), totalPages: z.number(), number: z.number() }),
})

export type RegistryHit = {
  org_number: string
  name: string
  form_code: string | null
  nace_code: string | null
  nace_label: string | null
  employees: number | null
  municipality: string | null
  municipality_no: string | null
  website: string | null
  email: string | null
  phone: string | null
}
export type RegistrySearch = { ok: true; hits: RegistryHit[]; total: number; page: number; pages: number } | { ok: false; problem: 'unreachable' }

export const SearchInput = z.object({
  nace: z.string().regex(/^\d{2}(\.\d{1,3})?$/).optional(),
  municipality: z.string().regex(/^\d{4}$/).optional(),
  min: z.number().int().min(0).max(100000).optional(),
  max: z.number().int().min(0).max(100000).optional(),
  form: z.enum(['AS', 'ASA', 'ENK', 'ANS', 'DA', 'SA', 'STI', 'FLI', 'KOMM']).optional(),
  page: z.number().int().min(0).max(99).default(0),
})

const title = (v: string) => v.replace(/\S+/g, (w) => w.charAt(0) + w.slice(1).toLocaleLowerCase('no'))

export async function searchRegistry(input: z.infer<typeof SearchInput>): Promise<RegistrySearch> {
  const q = new URLSearchParams({ size: '50', page: String(input.page), konkurs: 'false', underAvvikling: 'false' })
  if (input.nace) q.set('naeringskode', input.nace)
  if (input.municipality) q.set('kommunenummer', input.municipality)
  if (input.min !== undefined) q.set('fraAntallAnsatte', String(input.min))
  if (input.max !== undefined) q.set('tilAntallAnsatte', String(input.max))
  if (input.form) q.set('organisasjonsform', input.form)
  try {
    const res = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter?${q}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, problem: 'unreachable' }
    const parsed = Page.safeParse(await res.json())
    if (!parsed.success) return { ok: false, problem: 'unreachable' }
    const hits = (parsed.data._embedded?.enheter ?? []).map((u) => ({
      org_number: u.organisasjonsnummer,
      name: u.navn,
      form_code: u.organisasjonsform?.kode ?? null,
      nace_code: u.naeringskode1?.kode ?? null,
      nace_label: u.naeringskode1?.beskrivelse ?? null,
      employees: u.antallAnsatte ?? null,
      municipality: u.forretningsadresse?.kommune ? title(u.forretningsadresse.kommune) : null,
      municipality_no: u.forretningsadresse?.kommunenummer ?? null,
      website: u.hjemmeside ?? null,
      email: u.epostadresse?.toLowerCase() ?? null,
      phone: u.telefon ?? u.mobil ?? null,
    }))
    return { ok: true, hits, total: parsed.data.page.totalElements, page: parsed.data.page.number, pages: parsed.data.page.totalPages }
  } catch {
    return { ok: false, problem: 'unreachable' }
  }
}
