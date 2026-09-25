/**
 * Audits the landing pages against docs/landingsside-gjennomgang.md: what each page says to
 * a search engine, what a visitor sees before scrolling, and what axe finds.
 *
 *   node scripts/verify/landing-audit.mjs --label before
 *   node scripts/verify/landing-audit.mjs --label after --base http://localhost:3000 /lovkrav
 *
 * For each page and each width (375, 768, 1440) it writes a full-page screenshot, light and
 * dark colour scheme, to artifacts/landing/<label>/, and prints one JSON report per page.
 * It exits non-zero if a check the guide sets as a requirement fails.
 *
 * axe-core is read from AXE_PATH (a path to axe.min.js) when set; without it, the
 * accessibility checks are skipped and say so.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const base = arg('base', 'http://localhost:3000')
const label = arg('label', 'now')
const shots = !process.argv.includes('--no-shots')
const out = join('artifacts/landing', label)
const axeSource = process.env.AXE_PATH ? readFileSync(process.env.AXE_PATH, 'utf8') : null

/** The pages in scope and the search each one is written for (the guide, section 1). */
const PAGES = [
  { path: '/', keyword: 'medarbeiderundersøkelse' },
  { path: '/lovkrav', keyword: 'kartlegging psykososialt arbeidsmiljø' },
  { path: '/verneombud', keyword: 'verneombud kartlegging' },
  { path: '/smaa-bedrifter', keyword: 'medarbeiderundersøkelse små bedrifter' },
  { path: '/bygg-og-anlegg', keyword: 'arbeidsmiljøundersøkelse bygg og anlegg' },
]
const VALUED = ['--base', '--label']
const only = process.argv.slice(2).filter((a, i, all) => a.startsWith('/') && !VALUED.includes(all[i - 1]))
const pages = PAGES.filter((p) => !only.length || only.includes(p.path))

/** Every word of the keyword appears (as a word stem) in the text, in any order. */
const hasKeyword = (text, keyword) => {
  // a soft hyphen (U+00AD) is where a long word may break; it is not part of the word
  const t = text.replace(/\u00ad/g, '').toLowerCase()
  return keyword
    .toLowerCase()
    .split(/\s+/)
    .every((w) => t.includes(w.slice(0, Math.max(4, w.length - 2))))
}

mkdirSync(out, { recursive: true })
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const reports = []
let failures = 0

for (const pg of pages) {
  const r = { path: pg.path, keyword: pg.keyword, fail: [], note: [] }
  const need = (ok, what) => (ok ? null : r.fail.push(what))

  // ------------------------------------------------------------------ desktop, content
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  const errors = []
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const res = await p.goto(base + pg.path, { waitUntil: 'networkidle' })
  r.status = res?.status()

  Object.assign(
    r,
    await p.evaluate(() => {
      const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
      const main = document.querySelector('main') ?? document.body
      const meta = (n) => document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.getAttribute('content') ?? null
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => {
        try {
          const j = JSON.parse(s.textContent)
          return (j['@graph'] ?? [j]).map((n) => n['@type'])
        } catch {
          return ['INVALID']
        }
      })
      const links = [...main.querySelectorAll('a[href]')].map((a) => ({ href: a.getAttribute('href'), text: text(a) }))
      const firstP = [...main.querySelectorAll('p')].find((el) => text(el).split(' ').length > 12)
      return {
        lang: document.documentElement.lang,
        title: document.title,
        description: meta('description'),
        canonical: document.querySelector('link[rel=canonical]')?.href ?? null,
        ogImage: meta('og:image'),
        ogLocale: meta('og:locale'),
        robots: meta('robots'),
        h1: [...document.querySelectorAll('h1')].map(text),
        h2: [...main.querySelectorAll('h2')].map(text),
        h3: [...main.querySelectorAll('h3')].map(text),
        firstParagraph: text(firstP),
        words: main.innerText.split(/\s+/).filter(Boolean).length,
        ld,
        ctas: links.filter((l) => /^\/registrer/.test(l.href)).map((l) => l.text),
        forms: [...main.querySelectorAll('form')].map((f) => f.getAttribute('action')),
        images: [...main.querySelectorAll('img')].map((i) => ({ src: i.currentSrc.split('/').pop()?.slice(0, 60), alt: i.alt })),
        internal: [...new Set(links.map((l) => l.href).filter((h) => h.startsWith('/')))],
        vagueLinks: links.filter((l) => /^(les mer|klikk her|her)$/i.test(l.text)).map((l) => l.href),
        arrows: links.filter((l) => l.text.endsWith('→')).length,
        uppercaseLabels: [...main.querySelectorAll('span,p')].filter(
          (el) => getComputedStyle(el).textTransform === 'uppercase' && text(el).length > 3,
        ).length,
        thirdPartyScripts: [...document.scripts].map((s) => s.src).filter((s) => s && !s.startsWith(location.origin)),
        footer: text(document.querySelector('footer')),
      }
    }),
  )
  r.consoleErrors = errors

  need(r.status === 200, `status ${r.status}`)
  need(r.lang === 'nb', `html lang is "${r.lang}", not "nb"`)
  need(r.title.length <= 60, `title ${r.title.length} characters`)
  need(r.title.endsWith('| Orgpuls'), 'title does not end with "| Orgpuls"')
  need(hasKeyword(r.title.split('|')[0], pg.keyword), 'keyword not in title')
  need(
    r.description && r.description.length >= 120 && r.description.length <= 155,
    `description ${r.description?.length} characters`,
  )
  need(r.description && hasKeyword(r.description, pg.keyword), 'keyword not in description')
  need(r.description && /30 dager gratis/i.test(r.description), 'description does not offer 30 days free')
  need(r.h1.length === 1, `${r.h1.length} H1`)
  need(r.h1[0] && hasKeyword(r.h1[0], pg.keyword), 'keyword not in H1')
  need(hasKeyword(r.firstParagraph, pg.keyword), 'keyword not in first paragraph')
  need(r.words >= 400, `${r.words} words`)
  need(!!r.canonical, 'no canonical')
  need(!!r.ogImage, 'no og:image')
  need(r.ogLocale === 'nb_NO', `og:locale ${r.ogLocale}`)
  need(!r.robots?.includes('noindex'), 'noindex')
  need(r.ld.includes('Organization'), 'no Organization JSON-LD')
  need(!r.ld.includes('INVALID'), 'invalid JSON-LD')
  if (pg.path === '/') need(r.ld.includes('SoftwareApplication'), 'no SoftwareApplication JSON-LD')
  else {
    need(r.ld.includes('BreadcrumbList'), 'no BreadcrumbList JSON-LD')
    need(r.internal.includes('/'), 'no link to the start page')
    need(
      r.internal.some((h) => PAGES.some((o) => o.path !== '/' && o.path !== pg.path && h === o.path)),
      'no link to another landing page',
    )
    need(
      r.internal.some((h) => h.startsWith('/artikler/')),
      'no link to an article',
    )
  }
  need(
    r.images.every((i) => typeof i.alt === 'string'),
    'image without alt',
  )
  need(r.vagueLinks.length === 0, `vague link text: ${r.vagueLinks.join(', ')}`)
  need(r.thirdPartyScripts.length === 0, `third-party scripts: ${r.thirdPartyScripts.join(', ')}`)
  need(errors.length === 0, `console errors: ${errors.join(' | ')}`)
  need(/Orgpuls AS/.test(r.footer), 'footer has no company name')
  need(/kontakt/i.test(r.footer), 'footer has no contact link')
  need(/personvern/i.test(r.footer), 'footer has no privacy link')
  if (!/org\.?\s?nr/i.test(r.footer)) r.note.push('footer has no org.nr.')
  if (r.arrows) r.note.push(`${r.arrows} links end with an arrow`)
  if (r.uppercaseLabels) r.note.push(`${r.uppercaseLabels} uppercase labels`)

  // ---------------------------------------------------------------- what is above the fold
  for (const [w, h] of [
    [375, 667],
    [1440, 900],
  ]) {
    await p.setViewportSize({ width: w, height: h })
    await p.goto(base + pg.path, { waitUntil: 'networkidle' })
    await p.waitForTimeout(400)
    const fold = await p.evaluate((h) => {
      const main = document.querySelector('main') ?? document.body
      const inView = (el) => !!el && el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().bottom <= h
      const byText = (re) =>
        [...main.querySelectorAll('*')].find((el) => el.children.length === 0 && re.test(el.textContent ?? ''))
      const orgnr = main.querySelector('input[name="orgnr"]')
      const submit = orgnr?.form?.querySelector('button[type="submit"]')
      return {
        h1: inView(document.querySelector('h1')),
        orgnr: inView(orgnr),
        start: inView(submit),
        price: inView(byText(/265 kr/)),
        anonymity: inView(byText(/fem (har )?svar|minst fem|færre enn fem/i)),
        product: inView(main.querySelector('figure img, [data-product]')),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        smallTargets:
          window.innerWidth < 500
            ? [...document.querySelectorAll('a, button, input, select')]
                .filter((el) => {
                  const b = el.getBoundingClientRect()
                  if (!b.width || getComputedStyle(el).display === 'inline') return false
                  return b.height < 44 || b.width < 44
                })
                .map(
                  (el) =>
                    `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
                )
            : [],
      }
    }, h)
    r[`fold${w}`] = fold
    need(fold.h1, `${w}: H1 not above the fold`)
    need(fold.orgnr && fold.start, `${w}: orgnr field and start button not above the fold`)
    need(fold.price, `${w}: price not above the fold`)
    need(fold.product || w < 500, `${w}: nothing from the product above the fold`)
    need(!fold.overflow, `${w}: horizontal overflow`)
    need(fold.smallTargets.length === 0, `${w}: touch targets under 44 px: ${fold.smallTargets.slice(0, 6).join('; ')}`)
    if (!fold.anonymity) r.note.push(`${w}: the five-answer promise is not above the fold`)
  }

  // ------------------------------------------------------------------------- axe
  if (axeSource) {
    await p.setViewportSize({ width: 1440, height: 900 })
    await p.goto(base + pg.path, { waitUntil: 'networkidle' })
    await p.addScriptTag({ content: axeSource })
    const axe = await p.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })
      return res.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        sample: v.nodes[0]?.target?.join(' '),
      }))
    })
    r.axe = axe
    need(axe.length === 0, `axe: ${axe.map((v) => `${v.id} (${v.nodes})`).join(', ')}`)
  } else r.note.push('axe skipped: AXE_PATH not set')

  await ctx.close()

  // ------------------------------------------------------------------ screenshots
  if (shots) {
    for (const scheme of ['light', 'dark']) {
      for (const w of [375, 768, 1440]) {
        const c = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme })
        const s = await c.newPage()
        await s.goto(base + pg.path, { waitUntil: 'networkidle' })
        const hgt = await s.evaluate(() => document.documentElement.scrollHeight)
        for (let y = 0; y < hgt; y += 700) await s.evaluate((y) => window.scrollTo(0, y), y)
        await s.waitForLoadState('networkidle')
        await s.evaluate(() => window.scrollTo(0, 0))
        const name = `${pg.path === '/' ? 'forside' : pg.path.slice(1)}-${w}-${scheme}.png`
        await s.screenshot({ path: join(out, name), fullPage: true })
        await c.close()
      }
    }
  }

  failures += r.fail.length
  reports.push(r)
  console.log(`${r.fail.length ? 'FAIL' : 'PASS'} ${pg.path} — ${r.fail.length} failing, ${r.note.length} notes`)
  for (const f of r.fail) console.log(`  ✗ ${f}`)
  for (const n of r.note) console.log(`  · ${n}`)
}

writeFileSync(join(out, 'report.json'), JSON.stringify(reports, null, 2))
await b.close()
console.log(`report: ${join(out, 'report.json')}`)
process.exit(failures ? 1 : 0)
