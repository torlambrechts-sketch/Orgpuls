import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { isStructuralPath, keyedMessages } from '@/lib/i18n/keyed'
import { checkPlatformImport, platformCatalogue, type Override } from '@/lib/i18n/platform-package'
import { buildSiteSheet, readSiteSheet } from '@/lib/i18n/site-sheet'
import { readXlsx, SheetError, writeXlsx, zip } from '@/lib/xlsx'
import siteMap from '@/lib/i18n/site-pages.json'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * The site, page by page (X-090): the keys mode marks every text but a block's data, the page map
 * names only texts that exist, and a page's bilingual spreadsheet comes back through Excel, Numbers
 * or LibreOffice as the texts it went out with.
 */
const cat = platformCatalogue(no as never, en as never)
const byPath = new Map(cat.map((e) => [e.path, e]))
const none = new Map<string, Override>()
const labels = { no: 'Norsk (bokmål)', en: 'English', note: 'Note', waiting: 'Waiting', unreached: 'Other state', hint: 'Keep placeholders' }

describe('the spreadsheet', () => {
  it('round-trips text exactly: line breaks, markup, quotes, braces, emoji, spaces', () => {
    const rows = [
      ['key', 'no', 'en'],
      ['a', 'Linje én\nlinje «to»', 'Line one\r\nline "two"'],
      ['b', '<b>fet</b> & {count, plural, one {# svar} other {# svar}}', "it's 5 < 6 > 4"],
      ['c', '  mellomrom  ', '😀 ⟪not a key⟫'],
      ['d', '', 'only English'],
    ]
    const back = readXlsx(writeXlsx(rows, { sheet: '/priser', widths: [10, 20, 20] }))
    expect(back[0]).toEqual(rows[0])
    // a line break comes back as \n, whichever the program wrote
    expect(back[1]).toEqual(['a', 'Linje én\nlinje «to»', 'Line one\nline "two"'])
    expect(back[2]).toEqual(rows[2])
    expect(back[3]).toEqual(rows[3])
    expect(back[4]).toEqual(rows[4])
  })

  it('reads shared strings, rich-text runs and Excel escapes, as the office programs save them', () => {
    const files = [
      { name: 'xl/workbook.xml', data: '<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId7"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId7" Type="t" Target="worksheets/sheet9.xml"/></Relationships>' },
      {
        name: 'xl/sharedStrings.xml',
        data: '<sst><si><t>key</t></si><si><t>no</t></si><si><r><t>fet</t></r><r><rPr><b/></rPr><t xml:space="preserve"> og vanlig</t></r><rPh><t>x</t></rPh></si><si><t>a_x000D_\nb &amp; c</t></si></sst>',
      },
      {
        name: 'xl/worksheets/sheet9.xml',
        data: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="3"><c r="A3" t="str"><v>k.one</v></c><c r="C3" t="s"><v>2</v></c></row><row r="4"><c r="B4" t="s"><v>3</v></c><c r="C4"><v>42</v></c></row></sheetData></worksheet>',
      },
    ]
    const rows = readXlsx(zip(files))
    expect(rows[0]).toEqual(['key', 'no'])
    expect(rows[1]).toEqual([])
    expect(rows[2]).toEqual(['k.one', '', 'fet og vanlig'])
    expect(rows[3]).toEqual(['', 'a\nb & c', '42'])
  })

  it('refuses what is not a workbook, and a zip that unpacks past its bound', () => {
    expect(() => readXlsx(new TextEncoder().encode('key;no;en\n'))).toThrow(SheetError)
    expect(() => readXlsx(zip([{ name: 'a.txt', data: 'x' }]))).toThrow(/no workbook/)
    const bomb = zip([
      { name: 'xl/workbook.xml', data: '<workbook/>' },
      { name: 'xl/worksheets/sheet1.xml', data: 'x'.repeat(2_000_000) },
    ])
    expect(deflateRawSync(Buffer.from('x'.repeat(2_000_000))).length).toBeLessThan(10_000)
    expect(() => readXlsx(bomb, 1_000_000)).toThrow(/too large/)
  })

  // a /priser sheet this module wrote, opened and saved by openpyxl (another zip writer, its own
  // styles and theme): a column inserted before bokmål, one English cell corrected over two lines
  it('reads back a sheet another program has saved, by its headings', () => {
    const rows = readXlsx(new Uint8Array(readFileSync('tests/unit/fixtures/site-sheet-openpyxl.xlsx')))
    expect(rows[0]).toEqual(['key', 'Comment', 'Norsk (bokmål) · no', 'English · en', 'Note'])
    const sheet = readSiteSheet(rows)
    const n = checkPlatformImport({ format: 'xlsx', locale: 'no', entries: sheet.no }, 'no', cat, none, none, 'professional')
    const e = checkPlatformImport({ format: 'xlsx', locale: 'en', entries: sheet.en }, 'en', cat, none, none, 'professional')
    expect(n.rows).toEqual([])
    expect(e.rows).toHaveLength(1)
    expect(e.rows[0]).toMatchObject({ key: rows[2]![0], text: `${byPath.get(rows[2]![0]!)!.en} (corrected)\nsecond line` })
  })
})

describe('a page as a bilingual sheet', () => {
  const page = siteMap.pages.find((p) => p.path === '/priser')!
  const entries = page.keys.flatMap((k) => (byPath.has(k) && byPath.get(k)!.view === 'pages' ? [{ entry: byPath.get(k)!, reached: true }] : []))

  it('goes out in the page order and comes back unchanged when nobody touched it', () => {
    const rows = buildSiteSheet(entries, none, none, labels)
    expect(rows.slice(1).map((r) => r[0])).toEqual(entries.map((e) => e.entry.path))
    const sheet = readSiteSheet(readXlsx(writeXlsx(rows, { sheet: 'x' })))
    for (const locale of ['no', 'en'] as const) {
      const c = checkPlatformImport({ format: 'xlsx', locale, entries: sheet[locale] }, locale, cat, none, none, 'professional')
      expect(c.rows).toEqual([])
      expect(c.problems.filter((p) => p.level === 'error')).toEqual([])
    }
  })

  it('writes a corrected cell as an override in its own language, and refuses a lost placeholder', () => {
    const rows = buildSiteSheet(entries, none, none, labels)
    const plain = rows.findIndex((r, i) => i > 0 && !/[{<]/.test(r[1]!) && r[2])
    const withArg = rows.findIndex((r, i) => i > 0 && /\{\w+\}/.test(r[2]!))
    rows[plain]![2] = `${rows[plain]![2]} (corrected)`
    if (withArg > 0) rows[withArg]![2] = 'No placeholder any more'
    // columns may be reordered and added
    const shuffled = rows.map((r) => [r[3]!, r[2]!, 'extra', r[0]!, r[1]!])
    const sheet = readSiteSheet(readXlsx(writeXlsx(shuffled, { sheet: 'x' })))
    const e = checkPlatformImport({ format: 'xlsx', locale: 'en', entries: sheet.en }, 'en', cat, none, none, 'professional')
    expect(e.rows).toEqual([expect.objectContaining({ key: rows[plain]![0], text: `${rows[plain]![2]}` })])
    if (withArg > 0) expect(e.problems).toContainEqual(expect.objectContaining({ key: `msg:${rows[withArg]![0]}`, code: 'placeholders' }))
    const n = checkPlatformImport({ format: 'xlsx', locale: 'no', entries: sheet.no }, 'no', cat, none, none, 'professional')
    expect(n.rows).toEqual([])
  })

  it('needs the key column and a language column', () => {
    expect(() => readSiteSheet([['nøkkel', 'tekst']])).toThrow(SheetError)
    expect(readSiteSheet([['KEY', 'EN'], ['a.b', 'x']])).toEqual({ no: [], en: [{ key: 'msg:a.b', target: 'x' }] })
  })
})

describe('the page map and the keys mode', () => {
  it('names only texts messages/ has, never a block kind or a link', () => {
    const all = [...siteMap.shared, ...siteMap.unseen, ...siteMap.pages.flatMap((p) => [...p.keys, ...p.states])]
    expect(all.filter((k) => !byPath.has(k))).toEqual([])
    expect(all.filter(isStructuralPath)).toEqual([])
    expect(siteMap.pages.map((p) => p.path)).toContain('/')
  })

  it('marks every text with its path, leaves data alone, and is off unless asked for', () => {
    const tree = { a: { b: 'Hei {name}', blocks: [{ t: 'p', text: 'Tekst' }, { t: 'links', items: [{ title: 'T', href: '/x' }] }] } }
    expect(keyedMessages('no', tree)).toBe(tree)
    const env = process.env
    process.env = { ...env, ORGPULS_I18N_KEYS: '1' }
    try {
      const k = keyedMessages('no', tree) as typeof tree
      expect(k.a.b).toBe('⟪a.b⟫Hei {name}')
      expect(k.a.blocks[0]).toEqual({ t: 'p', text: '⟪a.blocks.0.text⟫Tekst' })
      expect(k.a.blocks[1]).toEqual({ t: 'links', items: [{ title: '⟪a.blocks.1.items.0.title⟫T', href: '/x' }] })
      expect(keyedMessages('en', tree)).toBe(tree)
      process.env = { ...env, ORGPULS_I18N_KEYS: '1', VERCEL_ENV: 'production' }
      expect(keyedMessages('no', tree)).toBe(tree)
    } finally {
      process.env = env
    }
  })
})

describe('the mails read the same rule (0109)', () => {
  it('lays a mail override only while the deployed text still says what it replaced', async () => {
    const { withMailOverrides } = await import('@/supabase/functions/_shared/mail')
    const { createHash } = await import('node:crypto')
    const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
    const tree = { invite: { subject: 'Hei', body: 'Svar', footer: 'Takk' } }
    const out = await withMailOverrides(tree, {
      'mail.invite.subject': { text: 'Hallo', file: sha('Hei') },
      'mail.invite.body': { text: 'Svar nå', file: sha('an earlier text') },
      'mail.invite.footer': 'Tusen takk',
      'mail.invite.missing': 'Ny',
      'respond.next': 'Neste',
    })
    expect(out).toEqual({ invite: { subject: 'Hallo', body: 'Svar', footer: 'Tusen takk' } })
    expect(tree.invite.subject).toBe('Hei')
  })
})
