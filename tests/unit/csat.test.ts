import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { csatUrl, renderTicketReply, type MailCatalogue, type TicketJob } from '@/supabase/functions/_shared/mail'
import { parseCsatForm, parseKey, readOpen, readSubmit } from '@/lib/csat/parse'
import { csatAllowed, resetCsatThrottle } from '@/lib/csat/throttle'
import { hoursLabel, metShare, ratingLabel, weekLabel } from '@/lib/admin/ticketReport'

/**
 * Ticketing Phase 2 (0135): the rating page's boundary, the resolution mail's link, the page's
 * throttle and the report's figures. The database's side — minting, one use, expiry, the limit —
 * is supabase/tests/ticketing_p2_invariants.sql.
 */
const KEY = '0123456789abcdef'.repeat(4)
const form = (v: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, x] of Object.entries(v)) fd.set(k, x)
  return fd
}

describe('the rating key', () => {
  it('is 64 lowercase hex characters and nothing else', () => {
    expect(parseKey(KEY)).toBe(KEY)
    expect(parseKey(KEY.toUpperCase())).toBeNull()
    expect(parseKey(KEY.slice(1))).toBeNull()
    expect(parseKey(`${KEY}0`)).toBeNull()
    expect(parseKey(`${KEY.slice(0, 63)}g`)).toBeNull()
    expect(parseKey(undefined)).toBeNull()
    expect(parseKey(['a'])).toBeNull()
  })
})

describe('the rating form', () => {
  it('takes a score from 1 to 5 and a trimmed comment, empty as none', () => {
    expect(parseCsatForm(form({ key: KEY, rating: '4', comment: '  Rask hjelp  ' }))).toEqual({
      ok: true,
      data: { key: KEY, rating: 4, comment: 'Rask hjelp' },
    })
    expect(parseCsatForm(form({ key: KEY, rating: '1', comment: '   ' }))).toEqual({ ok: true, data: { key: KEY, rating: 1, comment: null } })
    expect(parseCsatForm(form({ key: KEY, rating: '5' }))).toEqual({ ok: true, data: { key: KEY, rating: 5, comment: null } })
  })

  it('names the field that failed, never what was typed', () => {
    expect(parseCsatForm(form({ key: KEY, rating: '0' }))).toEqual({ ok: false, problem: 'invalid_rating' })
    expect(parseCsatForm(form({ key: KEY, rating: '6' }))).toEqual({ ok: false, problem: 'invalid_rating' })
    expect(parseCsatForm(form({ key: KEY, rating: '3.5' }))).toEqual({ ok: false, problem: 'invalid_rating' })
    expect(parseCsatForm(form({ key: KEY }))).toEqual({ ok: false, problem: 'invalid_rating' })
    expect(parseCsatForm(form({ key: KEY, rating: '3', comment: 'x'.repeat(2001) }))).toEqual({ ok: false, problem: 'too_long' })
    // surrounding space does not count towards the limit
    expect(parseCsatForm(form({ key: KEY, rating: '3', comment: ` ${'x'.repeat(2000)} ` })).ok).toBe(true)
    const bad = parseCsatForm(form({ key: 'nope', rating: '3', comment: 'hemmelig' }))
    expect(bad).toEqual({ ok: false, problem: 'invalid' })
    expect(JSON.stringify(bad)).not.toContain('hemmelig')
  })
})

describe('the database answers', () => {
  it('csat_submit: ok, the known refusals, and failed for anything else', () => {
    expect(readSubmit({ ok: true })).toEqual({ ok: true })
    for (const e of ['invalid', 'invalid_rating', 'too_long', 'rate_limited'] as const)
      expect(readSubmit({ ok: false, error: e })).toEqual({ ok: false, problem: e })
    expect(readSubmit({ ok: false, error: 'something_else' })).toEqual({ ok: false, problem: 'failed' })
    expect(readSubmit(null)).toEqual({ ok: false, problem: 'failed' })
    expect(readSubmit('ok')).toEqual({ ok: false, problem: 'failed' })
  })

  it('csat_open: the case number, or one invalid for every kind of bad key', () => {
    expect(readOpen({ ok: true, number: 1042 })).toEqual({ ok: true, number: 1042 })
    expect(readOpen({ ok: true })).toEqual({ ok: false, problem: 'failed' })
    expect(readOpen({ ok: false, error: 'invalid' })).toEqual({ ok: false, problem: 'invalid' })
    expect(readOpen({ ok: false, error: 'rate_limited' })).toEqual({ ok: false, problem: 'rate_limited' })
    expect(readOpen({ ok: false, error: 'not_found' })).toEqual({ ok: false, problem: 'failed' })
    expect(readOpen(undefined)).toEqual({ ok: false, problem: 'failed' })
  })
})

describe('the resolution mail', () => {
  const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
  const SITE = 'https://www.orgpuls.no/'
  const job: TicketJob = {
    id: 'm1',
    to_email: 'kari@example.no',
    to_name: 'Kari',
    subject: 'Re: Faktura [#1042]',
    number: 1042,
    body: 'Hei Kari,\n\nDette er løst.\n\nVennlig hilsen\nOrgpuls',
  }

  it('carries the rating link, as text, when the claim minted a key', () => {
    const r = renderTicketReply(cat, { ...job, csat_key: KEY }, SITE)
    const url = csatUrl(SITE, KEY)
    expect(url).toBe(`https://www.orgpuls.no/vurdering?t=${KEY}`)
    expect(r.text).toContain(`${no.mail.ticket.csatLabel}: ${url}`)
    expect(r.text).toContain(no.mail.ticket.csatNote)
    expect(r.html).toContain(url)
    // never an <a href>: the provider's click tracking would rewrite it and log the key (D-97)
    expect(r.html).not.toMatch(/<a\s[^>]*vurdering/)
  })

  it('carries no link on an ordinary reply, or for a key that is not one', () => {
    for (const csat_key of [undefined, null, 'x', `${KEY.slice(0, 63)}"`]) {
      const r = renderTicketReply(cat, { ...job, csat_key }, SITE)
      expect(r.text).not.toContain('/vurdering')
      expect(r.html).not.toContain('/vurdering')
      expect(r.text).not.toContain(no.mail.ticket.csatNote)
    }
  })

  it('speaks English when asked', () => {
    const r = renderTicketReply(cat, { ...job, csat_key: KEY }, SITE, 'en')
    expect(r.text).toContain(en.mail.ticket.csatLabel)
    expect(r.text).toContain('Case number #1042')
  })
})

describe('the page throttle', () => {
  it('lets thirty through per network in ten minutes, then waits', () => {
    resetCsatThrottle()
    const t0 = 1_000_000
    for (let i = 0; i < 30; i++) expect(csatAllowed('10.0.0.0/24', t0)).toBe(true)
    expect(csatAllowed('10.0.0.0/24', t0)).toBe(false)
    expect(csatAllowed('10.0.1.0/24', t0)).toBe(true)
    expect(csatAllowed('10.0.0.0/24', t0 + 10 * 60 * 1000)).toBe(true)
  })
})

describe('the report', () => {
  it('prints no share over nothing due, and no median of nothing', () => {
    expect(metShare({ met: 0, missed: 0 })).toBeNull()
    expect(metShare({ met: 2, missed: 1 })).toBe(67)
    expect(hoursLabel(null)).toBeNull()
    expect(hoursLabel(0.25)).toBe('15 min')
    expect(hoursLabel(3.46)).toBe('3.5 h')
    expect(hoursLabel(60)).toBe('2.5 d')
    expect(ratingLabel(null)).toBeNull()
    expect(ratingLabel(4.25)).toBe('4.25')
    expect(ratingLabel(4)).toBe('4.0')
    expect(weekLabel('2026-09-28')).toMatch(/^28 Sep/)
  })
})
