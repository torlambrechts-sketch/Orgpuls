/**
 * Enhetsregisteret, as the Brønnøysund trigger engine reads it (0143, D-184). Pure functions, no I/O,
 * shared by the edge function orgpuls-brreg-triggers and its unit tests.
 *
 *   the update feed   GET /oppdateringer/enheter?oppdateringsid=…&size=…&includeChanges=true
 *                     `_embedded.oppdaterteEnheter[]`: oppdateringsid, organisasjonsnummer,
 *                     endringstype (Ny, Endring, Sletting, Fjernet, Ukjent) and, with
 *                     includeChanges, the JSON Patch of what changed
 *   an entity         GET /enheter?organisasjonsnummer=a,b,…&size=100 (up to 100 at a time), or
 *                     /enheter/{orgnr}: 410 Gone when it was removed for legal reasons
 *   the role feed     GET /oppdateringer/roller?afterId=…&size=… (CloudEvents: id, data.organisasjonsnummer)
 *   an entity's roles GET /enheter/{orgnr}/roller: role groups, the daglig leder's (DAGL) with sistEndret
 *
 * What leaves this file is what the engine may keep: an organisation's own facts, a generic address
 * only (never a named one: markedsføringsloven § 15), no sole proprietorship (ENK — a person's name
 * and often a home), and of a person only the general manager's name, for a phone call or a letter.
 * A birth date is never read out.
 */

/** Local parts that name a role, not a person: the only addresses the engine keeps or emails (SQL: app.brreg_generic_email) */
export const GENERIC_LOCAL_PARTS = [
  'post', 'postmottak', 'postkasse', 'firmapost', 'firma', 'kontakt', 'kontor', 'info', 'epost', 'e-post',
  'mail', 'office', 'admin', 'resepsjon', 'sentralbord', 'service', 'kundeservice', 'salg', 'ordre',
  'regnskap', 'faktura', 'hr', 'personal', 'hms', 'contact', 'hello', 'hei',
] as const

/** True for a generic role address (post@, firmapost@ …). A named address — ola.nordmann@, fornavn@ — never is. */
export function isGenericEmail(email: string | null | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase()
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return false
  return (GENERIC_LOCAL_PARTS as readonly string[]).includes(e.split('@')[0]!)
}

export type ChangeType = 'Ny' | 'Endring' | 'Sletting' | 'Fjernet' | 'Ukjent'
export type FeedItem = { id: number; org: string; type: ChangeType; employeesOp: 'add' | 'replace' | 'remove' | null }

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const ORG = /^[0-9]{9}$/
const TYPES: ChangeType[] = ['Ny', 'Endring', 'Sletting', 'Fjernet', 'Ukjent']

/** The update feed's items: id, organisation number, change type, and how the employee count changed if it did */
export function parseFeed(json: unknown): FeedItem[] {
  const list = obj(obj(json)._embedded).oppdaterteEnheter
  if (!Array.isArray(list)) return []
  const out: FeedItem[] = []
  for (const raw of list) {
    const it = obj(raw)
    const id = Number(it.oppdateringsid)
    const org = str(it.organisasjonsnummer)
    const type = TYPES.includes(it.endringstype as ChangeType) ? (it.endringstype as ChangeType) : 'Ukjent'
    if (!Number.isSafeInteger(id) || !org || !ORG.test(org)) continue
    let employeesOp: FeedItem['employeesOp'] = null
    if (Array.isArray(it.endringer)) {
      for (const ch of it.endringer) {
        const c = obj(ch)
        if (c.path === '/antallAnsatte' && (c.op === 'add' || c.op === 'replace' || c.op === 'remove')) employeesOp = c.op
      }
    }
    out.push({ id, org, type, employeesOp })
  }
  return out
}

export type Change = { type: ChangeType; employeesOp: FeedItem['employeesOp'] }
/**
 * The feed's items folded per organisation, in order: the latest type wins; an employee count
 * that was added (none before) stays known as added even if a later item replaced it the same day.
 */
export function foldFeed(items: FeedItem[], into = new Map<string, Change>()): Map<string, Change> {
  for (const it of items) {
    const prev = into.get(it.org)
    into.set(it.org, {
      type: prev?.type === 'Ny' && it.type === 'Endring' ? 'Ny' : it.type,
      employeesOp: prev?.employeesOp === 'add' ? 'add' : (it.employeesOp ?? prev?.employeesOp ?? null),
    })
  }
  return into
}

/** How many the feed flagged «Ny» or «Endring»: the page's «Entity changes» */
export const changedCount = (m: Map<string, Change>) => [...m.values()].filter((c) => c.type === 'Ny' || c.type === 'Endring').length

export type EntityRow = {
  org_number: string
  name: string
  form_code: string
  nace_code: string | null
  employees: number | null
  employees_op: FeedItem['employeesOp']
  is_new: boolean
  municipality: string | null
  address: string | null
  phone: string | null
  email: string | null
  active: boolean
}

/** The entities of a search answer (`_embedded.enheter`) */
export function parseEntities(json: unknown): unknown[] {
  const list = obj(obj(json)._embedded).enheter
  return Array.isArray(list) ? list : []
}

/**
 * One entity as the engine stores it, or null for a sole proprietorship or anything malformed. The
 * employee count is the register's; «harRegistrertAntallAnsatte: false» is none, which is 0.
 */
export function toRow(raw: unknown, change: Change | undefined): EntityRow | null {
  const e = obj(raw)
  const org = str(e.organisasjonsnummer)
  const name = str(e.navn)
  const form = str(obj(e.organisasjonsform).kode)
  if (!org || !ORG.test(org) || !name || !form || form === 'ENK' || !/^[A-ZÆØÅ]{2,6}$/.test(form)) return null
  const nace = str(obj(e.naeringskode1).kode)
  const n = e.antallAnsatte
  const employees = typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : e.harRegistrertAntallAnsatte === false ? 0 : null
  const addr = obj(e.forretningsadresse)
  const lines = Array.isArray(addr.adresse) ? addr.adresse.filter((l): l is string => typeof l === 'string' && l.trim() !== '') : []
  const place = [str(addr.postnummer), str(addr.poststed)].filter(Boolean).join(' ')
  const address = [...lines, place].filter(Boolean).join(', ') || null
  const email = str(e.epostadresse)
  return {
    org_number: org,
    name: name.slice(0, 200),
    form_code: form,
    nace_code: nace && /^[0-9]{2}(\.[0-9]{1,3})?$/.test(nace) ? nace : null,
    employees,
    employees_op: change?.employeesOp ?? null,
    is_new: change?.type === 'Ny',
    municipality: str(addr.kommune)?.slice(0, 80) ?? null,
    address: address ? address.slice(0, 300) : null,
    phone: (str(e.telefon) ?? str(e.mobil))?.slice(0, 40) ?? null,
    // a named address is dropped here, before it can be stored anywhere
    email: isGenericEmail(email) ? email!.toLowerCase() : null,
    active: e.konkurs !== true && e.underAvvikling !== true && e.underTvangsavviklingEllerTvangsopplosning !== true && !str(e.slettedato),
  }
}

/** The role feed's events: id and organisation number */
export function parseRoleFeed(json: unknown): { id: number; org: string }[] {
  if (!Array.isArray(json)) return []
  const out: { id: number; org: string }[] = []
  for (const raw of json) {
    const ev = obj(raw)
    const id = Number(ev.id)
    const org = str(obj(ev.data).organisasjonsnummer)
    if (Number.isSafeInteger(id) && org && ORG.test(org)) out.push({ id, org })
  }
  return out
}

const dagl = (json: unknown) => {
  const groups = obj(json).rollegrupper
  if (!Array.isArray(groups)) return null
  return groups.map(obj).find((g) => obj(g.type).kode === 'DAGL') ?? null
}

/** When the daglig leder role group last changed (YYYY-MM-DD), or null: no name, no birth date */
export function managerChangedOn(json: unknown): string | null {
  const g = dagl(json)
  const d = g ? str(g.sistEndret) : null
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/** The current daglig leder's name, for a phone call or a letter. The birth date beside it is never read. */
export function managerName(json: unknown): string | null {
  const g = dagl(json)
  if (!g || !Array.isArray(g.roller)) return null
  for (const raw of g.roller) {
    const r = obj(raw)
    if (r.avregistrert === true || obj(r.type).kode !== 'DAGL') continue
    const n = obj(obj(r.person).navn)
    const name = [str(n.fornavn), str(n.mellomnavn), str(n.etternavn)].filter(Boolean).join(' ')
    if (name.length >= 2) return name.slice(0, 120)
  }
  return null
}

/** Organisation numbers in groups of at most `size`, for the register's list search */
export function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}
