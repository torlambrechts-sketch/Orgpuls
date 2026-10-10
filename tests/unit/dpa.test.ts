import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import no from '@/messages/no.json'
import en from '@/messages/en.json'
import gb from '@/messages/market/gb/en.json'
import { rebrand } from '@/lib/brand'
import { DPA_IN_FORCE, DPA_MARKET, DpaText, dpaHash, dpaInForce, dpaVersionDay } from '@/lib/legal/dpa'
import { MARKETS } from '@/lib/markets'

/** Every version the migrations publish, as app.dpa_versions holds them (0047, 0226) */
const PUBLISHED = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .flatMap((f) =>
    [
      ...readFileSync(`supabase/migrations/${f}`, 'utf8').matchAll(
        /insert into app\.dpa_versions \(version, text_sha256, published_on(?:, market)?\)\s*values \('([^']+)', '([0-9a-f]{64})', date '([\d-]+)'(?:, '([a-z]{2})')?\)/g,
      ),
    ].map((m) => ({ version: m[1]!, sha256: m[2]!, publishedOn: m[3]!, market: m[4] ?? 'no' })),
  )

/** The version sign_dpa takes as current for a market's agreement: newest day, then highest version */
const newest = (market: string) =>
  PUBLISHED.filter((v) => v.market === market).sort((a, b) =>
    a.publishedOn === b.publishedOn ? (a.version < b.version ? 1 : -1) : a.publishedOn < b.publishedOn ? 1 : -1,
  )[0]

describe('the data processing agreement', () => {
  it('is well formed in both languages', () => {
    expect(DpaText.safeParse(no.dpa).success).toBe(true)
    expect(DpaText.safeParse(en.dpa).success).toBe(true)
  })

  it('has the same sections in both languages', () => {
    expect(en.dpa.sections.length).toBe(no.dpa.sections.length)
  })

  it('is the text the published version was hashed from: a change to the words needs a new version', () => {
    expect(dpaHash(DpaText.parse(no.dpa))).toBe(DPA_IN_FORCE.no.sha256)
    expect(DPA_IN_FORCE.no.version).toMatch(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/)
  })
})

describe('the United Kingdom’s agreement (UK-F1, D-274)', () => {
  const text = DpaText.parse(gb.dpa)

  it('is its own text, hashed as published: a change to the words needs a new version', () => {
    expect(dpaHash(text)).toBe(DPA_IN_FORCE.gb.sha256)
    expect(DPA_IN_FORCE.gb.version).toMatch(/^gb-\d{4}-\d{2}-\d{2}(\.\d+)?$/)
  })

  it('is shown exactly as hashed: it names Empvibe itself, so the brand changes nothing in it', () => {
    expect(rebrand(gb.dpa, 'empvibe', 'en')).toEqual(gb.dpa)
    expect(JSON.stringify(gb.dpa)).not.toMatch(/Orgpuls/)
  })

  it('states UK law, not Norway’s: no Norwegian authority, act or translation note', () => {
    const words = JSON.stringify(gb.dpa)
    expect(words).not.toMatch(/Datatilsynet|Working Environment Act|section 9-3|chapter 1A|Norwegian version|translation/)
    // the EU's GDPR does not bind a UK controller as such: every reference is to the UK GDPR
    expect(words).not.toMatch(/(?<!UK )GDPR/)
    for (const law of ['UK GDPR', 'Data Protection Act 2018', 'Information Commission (ICO)', 'section 164A', 'Schedule 21', 'Management of Health and Safety at Work Regulations 1999']) {
      expect(words, law).toContain(law)
    }
  })

  it('never offers a threshold under the market’s floor of five', () => {
    expect(JSON.stringify(gb.dpa)).not.toMatch(/\bthree\b|never under three/)
    expect(JSON.stringify(gb.dpa)).toMatch(/at least five/)
  })

  it('is governed by Norwegian law, with Oslo District Court as the venue (X-113)', () => {
    const law = text.sections.find((s) => /Governing law/.test(s.h))
    expect(law?.p?.join(' ')).toMatch(/Norwegian law.*Oslo District Court \(Oslo tingrett\)/)
  })
})

describe('the agreement each market signs', () => {
  it('pins, for each agreement, the newest version the migrations publish for it', () => {
    for (const [market, inForce] of Object.entries(DPA_IN_FORCE)) {
      expect(newest(market), market).toEqual(expect.objectContaining({ version: inForce.version, sha256: inForce.sha256 }))
    }
  })

  it('is the market’s own where one is published, else Norway’s, as app.dpa_market decides', () => {
    for (const market of MARKETS) {
      expect(DPA_MARKET[market], market).toBe(PUBLISHED.some((v) => v.market === market) ? market : 'no')
    }
    expect(dpaInForce('se')).toBe(DPA_IN_FORCE.no)
    expect(dpaInForce('gb')).toBe(DPA_IN_FORCE.gb)
  })

  it('reads a version’s day without its market or same-day suffix', () => {
    expect(dpaVersionDay('2026-10-02.2')).toBe('2026-10-02')
    expect(dpaVersionDay('gb-2026-10-10')).toBe('2026-10-10')
    expect(dpaVersionDay('gb-2026-10-10.3')).toBe('2026-10-10')
  })
})
