/**
 * The card each landing page and article unfurls into on LinkedIn, Teams or Slack (D-85,
 * D-106): 1200 x 630,
 * the site's own type and colours, the page's H1, and the picture of the product that page
 * shows in its hero (lib/marketing/site LANDING_HERO, assets/produkt).
 *
 * Rendered by the same Chromium the other scripts use, with the site's own fonts from a
 * running server, so a card and the page it links to are set in the same faces:
 *
 *   node scripts/marketing/og-images.mjs                     # every landing page
 *   node scripts/marketing/og-images.mjs --base http://localhost:3000
 *
 * Writes public/og/<slug>.png for a landing page and public/og/artikler/<slug>.png for an
 * article (its H1, with its landing page's picture). Run it when an H1 or picture changes.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const base = arg('base', 'http://localhost:3000')
const out = 'public/og'
const no = JSON.parse(readFileSync('messages/no.json', 'utf8'))
// the site's own @font-face rules; their /fonts/… URLs resolve against the running server
const fonts = readFileSync('app/fonts.css', 'utf8')

// the same pairs as LANDING_HERO in lib/marketing/site.ts
const PAGES = [
  { slug: 'lovkrav', key: 'lovkrav', shot: 'rapport' },
  { slug: 'verneombud', key: 'verneombud', shot: 'varmekart' },
  { slug: 'smaa-bedrifter', key: 'smaaBedrifter', shot: 'oversikt' },
  { slug: 'bygg-og-anlegg', key: 'byggOgAnlegg', shot: 'sporsmal' },
  { slug: 'helse-og-omsorg', key: 'helseOgOmsorg', shot: 'samtaler' },
]
// each article with the landing page it belongs to, read from lib/marketing/site.ts
const siteSrc = readFileSync('lib/marketing/site.ts', 'utf8')
const shotOf = Object.fromEntries(PAGES.map((p) => [p.slug, p.shot]))
const ARTICLE_CARDS = [...siteSrc.matchAll(/slug: '([^']+)',\s*key: '([^']+)',[\s\S]*?landing: '([^']+)'/g)].map((m) => ({
  slug: m[1],
  h1: no.seo.articles[m[2]].h1,
  shot: shotOf[m[3]],
  file: `artikler/${m[1]}.png`,
}))
if (ARTICLE_CARDS.length === 0 || ARTICLE_CARDS.some((a) => !a.h1 || !a.shot)) throw new Error('lib/marketing/site.ts ARTICLES changed shape')
const PILLS = ['15 dager gratis', 'Dekker arbeidsmiljøloven', 'Anonymt – minst 5 svar']
// the mark's own path and dot, read from the component rather than redrawn here
const logoSrc = readFileSync('components/shell/Logo.tsx', 'utf8')
const markPath = logoSrc.match(/d="([^"]+)"/)?.[1]
const markDot = logoSrc.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/)
if (!markPath || !markDot) throw new Error('components/shell/Logo.tsx changed shape; update how the mark is read here')

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const html = (p) => {
  const img = `data:image/webp;base64,${readFileSync(`assets/produkt/${p.shot}.webp`).toString('base64')}`
  const phone = p.shot === 'sporsmal'
  return `<!doctype html><html lang="nb"><head><base href="${base}/"><style>${fonts}</style>
<style>
  * { box-sizing: border-box; margin: 0 }
  body { width: 1200px; height: 630px; background: #FCF6E9; color: #191510; font-family: 'DM Sans', sans-serif; overflow: hidden; position: relative }
  .left { position: absolute; left: 80px; top: 72px; bottom: 72px; width: ${phone ? 640 : 590}px; display: flex; flex-direction: column }
  .brand { display: flex; align-items: center; gap: 18px; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 40px }
  .mark { width: 68px; height: 68px; border: 3px solid #191510; border-radius: 14px; background: #FFFDF6; display: grid; place-items: center }
  h1 { margin-top: 52px; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 46px; line-height: 1.1; text-wrap: balance }
  .pills { margin-top: auto; display: flex; flex-wrap: wrap; gap: 12px }
  .pill { height: 50px; padding: 0 20px; border-radius: 999px; border: 2px solid #E8DFC9; background: #FFFDF6; display: flex; align-items: center; font-size: 20px; font-weight: 600 }
  .pill:first-child { background: #F5C64A; border-color: #191510 }
  .shot { position: absolute; ${phone ? 'right: 90px; top: 48px; width: 290px; border: 8px solid #191510; border-radius: 36px' : 'left: 720px; top: 72px; width: 560px; max-height: 486px; border: 2px solid #E8DFC9; border-radius: 22px'}; overflow: hidden; background: #FFFDF6; box-shadow: 0 24px 50px -30px rgba(25,21,16,.45) }
  .shot img { display: block; width: 100% }
</style></head><body>
  <div class="left">
    <div class="brand"><span class="mark"><svg width="40" height="24" viewBox="0 0 20 12" fill="none"><path d="${markPath}" stroke="#191510" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${markDot[1]}" cy="${markDot[2]}" r="${markDot[3]}" fill="#191510"/></svg></span>Orgpuls</div>
    <h1>${esc(p.h1 ?? no.seo.lp[p.key].h1)}</h1>
    <div class="pills">${PILLS.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>
  </div>
  <div class="shot"><img src="${img}"></div>
</body></html>`
}

mkdirSync(join(out, 'artikler'), { recursive: true })
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await b.newPage({ viewport: { width: 1200, height: 630 } })
// written into a page on the server's own origin, so its font files are same-origin
await page.goto(`${base}/robots.txt`)
for (const p of [...PAGES, ...ARTICLE_CARDS]) {
  await page.setContent(html(p), { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const file = join(out, p.file ?? `${p.slug}.png`)
  await page.screenshot({ path: file })
  console.log(file)
}
await b.close()
