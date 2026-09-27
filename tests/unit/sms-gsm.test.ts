import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flattenMessages, literalText, parseIcu, type Catalogue } from '@/lib/i18n/icu-rules'
import { asciiQuotes, isGsm7, nonGsm7 } from '@/lib/sms/gsm7'
import { smsLength } from '@/supabase/functions/_shared/sms'

/**
 * GSM-7 for SMS text (gap analysis, queue item 2): the alphabet the dispatcher bills with,
 * the templates in messages/, and the organisation's own text as it is saved.
 */

// 3GPP TS 23.038 § 6.2.1, the default alphabet, by position (0x1B is the escape to the
// extension table, not a character)
const BASIC = [
  '@', '£', '$', '¥', 'è', 'é', 'ù', 'ì', 'ò', 'Ç', '\n', 'Ø', 'ø', '\r', 'Å', 'å',
  'Δ', '_', 'Φ', 'Γ', 'Λ', 'Ω', 'Π', 'Ψ', 'Σ', 'Θ', 'Ξ', null, 'Æ', 'æ', 'ß', 'É',
  ' ', '!', '"', '#', '¤', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  '¡', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Ä', 'Ö', 'Ñ', 'Ü', '§',
  '¿', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'ä', 'ö', 'ñ', 'ü', 'à',
].filter((c): c is string => c !== null)

// § 6.2.1.1, the extension table: two septets each. The table also holds FF (0x0A, a page
// break), which sms.ts does not list; nobody types one, and counting it as UCS-2 can only
// over-state a message's cost, never under-state it.
const EXTENSION = ['^', '{', '}', '\\', '[', '~', ']', '|', '€']

describe('the GSM-7 alphabet sms.ts bills with', () => {
  it('is 3GPP TS 23.038’s default alphabet, one septet each', () => {
    expect(BASIC).toHaveLength(127)
    for (const c of BASIC) expect(smsLength(c), JSON.stringify(c)).toEqual({ chars: 1, parts: 1, unicode: false })
  })

  it('counts the extension table as two septets', () => {
    for (const c of EXTENSION) expect(smsLength(c), c).toEqual({ chars: 2, parts: 1, unicode: false })
  })

  it('treats every other character in the Basic Multilingual Plane as UCS-2', () => {
    const gsm = new Set([...BASIC, ...EXTENSION])
    const wrong: string[] = []
    for (let cp = 0; cp <= 0xffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue
      const c = String.fromCodePoint(cp)
      if (gsm.has(c) === smsLength(c).unicode) wrong.push(`U+${cp.toString(16).padStart(4, '0')}`)
    }
    expect(wrong).toEqual([])
  })

  it('names the characters that break GSM-7', () => {
    expect(nonGsm7('Hei! Svar på undersøkelsen: blåbær.')).toEqual([])
    expect(nonGsm7('Hei – «svar» nå… “takk” 👋')).toEqual(['–', '«', '»', '…', '“', '”', '👋'])
    expect(isGsm7('Ærlig talt, €5 [ok]')).toBe(true)
    expect(isGsm7('don’t')).toBe(false)
  })
})

describe('the SMS templates in messages/', () => {
  const sms = (locale: string) => {
    const catalogue = JSON.parse(readFileSync(join(__dirname, '..', '..', 'messages', `${locale}.json`), 'utf8')) as Catalogue
    return Object.entries(flattenMessages(catalogue)).filter(([key]) => key.startsWith('mail.sms.'))
  }

  it.each(['no', 'en'])('are GSM-7 in %s, placeholders aside', (locale) => {
    const templates = sms(locale)
    expect(templates.length).toBeGreaterThanOrEqual(4)
    for (const [key, text] of templates) expect(nonGsm7(literalText(parseIcu(text))), key).toEqual([])
  })

  it('strips the placeholders, not the text around them', () => {
    expect(literalText(parseIcu('Hei! {org} spør, {n, plural, one {# dag} other {# dager}} igjen'))).toBe('Hei!  spør,  dag dager igjen')
  })
})

describe('asciiQuotes', () => {
  it('turns typographic quotes into ASCII, one character for one', () => {
    const typed = '‘Hei’ – „svar” “nå” «anonymt» ‹ja› don´t `x` ‚y‛ 5′ 6″ ‟z'
    const out = asciiQuotes(typed)
    expect(out).toBe(`'Hei' – "svar" "nå" "anonymt" 'ja' don't 'x' 'y' 5' 6" "z`)
    expect([...out]).toHaveLength([...typed].length)
    expect(nonGsm7(out)).toEqual(['–'])
  })

  it('leaves ordinary text alone', () => {
    const text = 'Hei! Nordvik Anlegg AS spør hvordan du har det på jobb. Svaret er helt anonymt:'
    expect(asciiQuotes(text)).toBe(text)
  })
})

// The save action, with the database and Next's cache replaced by what it calls.
const update = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/org/current', () => ({ getCurrentOrgId: async () => 'org-1' }))
vi.mock('@/lib/supabase/write', () => ({ writeFailed: () => false }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    schema: () => ({
      from: () => ({
        update: (row: unknown) => {
          update(row)
          return { eq: () => ({ select: async () => ({ data: [{ id: 'org-1' }], error: null }) }) }
        },
      }),
    }),
  }),
}))

describe('saveSms', () => {
  beforeEach(() => update.mockClear())

  const save = async (text: string) => {
    const { saveSms } = await import('@/app/(app)/integrasjoner/sms/actions')
    const form = new FormData()
    form.set('enabled', 'true')
    form.set('when', 'alle')
    form.set('text', text)
    return saveSms(form)
  }

  it('stores typographic quotes as ASCII, so the text stays GSM-7', async () => {
    expect(await save('  Hei! «Nordvik» spør: “Hvordan har du det?” Det er ‘helt’ anonymt:  ')).toEqual({ ok: true })
    const row = update.mock.calls[0]![0] as { sms_text: string }
    expect(row.sms_text).toBe(`Hei! "Nordvik" spør: "Hvordan har du det?" Det er 'helt' anonymt:`)
    expect(isGsm7(row.sms_text)).toBe(true)
  })

  it('still stores a blank text as the default', async () => {
    await save('   ')
    expect(update.mock.calls[0]![0]).toMatchObject({ sms_text: null })
  })
})
