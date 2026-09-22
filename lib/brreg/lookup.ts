import 'server-only'
import { z } from 'zod'

/**
 * Enhetsregisteret.
 *
 * Brønnøysundregistrene publish the Norwegian company register as an open API: no key, no
 * account, no personal data — an organisation number goes in and the facts a company is
 * registered with come out. It is the right source for this screen because it is the
 * *authoritative* one: an organisation's legal name, its form and its næringskode are
 * whatever the register says they are, and a product that asked a leader to type them in
 * would be asking them to copy something that is already public and already correct.
 *
 * Three things this deliberately does not do.
 *
 * **It is not called on render.** The caller stores what comes back and the screen prints
 * the stored row with the date it was fetched. A page that looked the number up on every
 * load would make Oppsett depend on somebody else's uptime, and would tell Brønnøysund
 * every time a leader opened a tab.
 *
 * **It sends nothing but the number.** No employee, no e-mail, no measurement — an
 * organisation number is a public identifier, and it is the entire request.
 *
 * **It never throws at the caller.** A register that is slow, down or has changed its
 * shape is an ordinary Tuesday, and the screen's job then is to say the lookup did not
 * work, not to show an error page over a form the user was in the middle of.
 */

const Unit = z.object({
  organisasjonsnummer: z.string(),
  navn: z.string(),
  organisasjonsform: z
    .object({ kode: z.string().nullish(), beskrivelse: z.string().nullish() })
    .nullish(),
  naeringskode1: z
    .object({ kode: z.string().nullish(), beskrivelse: z.string().nullish() })
    .nullish(),
  registreringsdatoEnhetsregisteret: z.string().nullish(),
  forretningsadresse: z
    .object({
      adresse: z.array(z.string()).nullish(),
      postnummer: z.string().nullish(),
      poststed: z.string().nullish(),
      kommune: z.string().nullish(),
      kommunenummer: z.string().nullish(),
    })
    .nullish(),
  antallAnsatte: z.number().nullish(),
  registrertIMvaregisteret: z.boolean().nullish(),
  slettedato: z.string().nullish(),
})

export interface RegistryFacts {
  orgNumber: string
  name: string
  formCode: string | null
  formLabel: string | null
  naceCode: string | null
  naceLabel: string | null
  registeredOn: string | null
  address: string | null
  municipality: string | null
  municipalityNo: string | null
  employees: number | null
  vat: boolean | null
}

export type LookupResult =
  | { ok: true; facts: RegistryFacts }
  /** `not_found` is the register's answer, `unreachable` is ours. They read differently. */
  | { ok: false; problem: 'not_found' | 'deleted' | 'unreachable' }

const ENDPOINT = 'https://data.brreg.no/enhetsregisteret/api/enheter'

/** "Industriveien 14" + "3229" + "SANDEFJORD" -> "Industriveien 14, 3229 Sandefjord". */
const titleCase = (v: string) =>
  v.replace(/\S+/g, (w) => w.charAt(0) + w.slice(1).toLocaleLowerCase('no'))

export async function lookupOrgNumber(orgNumber: string): Promise<LookupResult> {
  const digits = orgNumber.replace(/\s/g, '')
  if (!/^\d{9}$/.test(digits)) return { ok: false, problem: 'not_found' }

  let response: Response
  try {
    response = await fetch(`${ENDPOINT}/${digits}`, {
      headers: { accept: 'application/json' },
      // the register is a fact about a company, not about this request; a stale minute
      // is harmless and a burst of tab switches should not become a burst of lookups
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return { ok: false, problem: 'unreachable' }
  }

  if (response.status === 404) return { ok: false, problem: 'not_found' }
  if (!response.ok) return { ok: false, problem: 'unreachable' }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, problem: 'unreachable' }
  }

  const parsed = Unit.safeParse(body)
  if (!parsed.success) return { ok: false, problem: 'unreachable' }
  const u = parsed.data

  // a dissolved company is a real answer from the register, and a different one
  if (u.slettedato) return { ok: false, problem: 'deleted' }

  const a = u.forretningsadresse
  const street = (a?.adresse ?? []).filter(Boolean).join(', ')
  const post = [a?.postnummer, a?.poststed ? titleCase(a.poststed) : null]
    .filter(Boolean)
    .join(' ')
  const address = [street, post].filter(Boolean).join(', ') || null

  return {
    ok: true,
    facts: {
      orgNumber: u.organisasjonsnummer,
      name: u.navn,
      formCode: u.organisasjonsform?.kode ?? null,
      formLabel: u.organisasjonsform?.beskrivelse ?? null,
      naceCode: u.naeringskode1?.kode ?? null,
      naceLabel: u.naeringskode1?.beskrivelse ?? null,
      registeredOn: u.registreringsdatoEnhetsregisteret ?? null,
      address,
      municipality: a?.kommune ? titleCase(a.kommune) : null,
      municipalityNo: a?.kommunenummer ?? null,
      employees: u.antallAnsatte ?? null,
      vat: u.registrertIMvaregisteret ?? null,
    },
  }
}
