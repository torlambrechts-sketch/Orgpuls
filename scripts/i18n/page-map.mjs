/**
 * The page map (X-090): which texts each public page shows, in the order it shows them. Writes
 * lib/i18n/site-pages.json, which admin › Translations reviews the site by, one page at a time.
 *
 * It is crawled, not written by hand: a QA server started with ORGPULS_I18N_KEYS=1 prefixes every
 * message with its own path between ⟪ ⟫ (lib/i18n/keyed.ts), and this reads those markers from the
 * server-rendered HTML of every page in the sitemap and a few public pages the sitemap leaves out.
 * The React payload scripts are stripped first: they carry the whole client catalogue on every page.
 *
 *   shared   a text on more than half of the pages (header, footer, cookie line): one page of its own
 *   states   per page: texts no crawl reached (an error, a sent form, a later step) whose group of
 *            keys only that page shows, e.g. every `registrer.*` text belongs to /registrer
 *   unseen   a text of a namespace the site shows that no crawled page showed and no one page
 *            owns: listed, so nothing on the site is outside the map
 *
 * A page whose address carries a database slug (a newsletter issue) is crawled once, under its
 * route's pattern, so the map does not depend on what a database holds.
 *
 *   node scripts/i18n/page-map.mjs           crawl and write the map
 *   node scripts/i18n/page-map.mjs --check   crawl and fail if a page shows a text its entry lacks,
 *                                            or the map names a text messages/ no longer has
 *   --base http://localhost:3102             crawl a server already running in keys mode
 *
 * Without --base it serves the QA build (scripts/qa/serve.mjs) on QA port 3102 in keys mode, and
 * stops it after. The local Supabase stack must be running (npm run qa:up).
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const OUT = 'lib/i18n/site-pages.json'
const PORT = 3102
const check = process.argv.includes('--check')
const baseArg = process.argv.indexOf('--base')
let base = baseArg > 0 ? process.argv[baseArg + 1] : `http://localhost:${PORT}`

/** public pages the sitemap does not list: the sign-in, the sign-up, the pages a link opens */
const EXTRA = ['/logg-inn', '/registrer', '/nytt-passord', '/avmeld', '/bli-med/ukjent', '/demo', '/nyhetsbrev']
/** addresses whose last segment is a database slug: crawled once, under the pattern */
const PATTERNS = [{ re: /^\/nyhetsbrev\/arkiv\/[^/]+$/, as: '/nyhetsbrev/arkiv/[slug]' }]

const flatten = (o, p = '', out = {}) => {
  if (typeof o === 'string') out[p] = o
  else if (Array.isArray(o)) o.forEach((v, i) => flatten(v, `${p}.${i}`, out))
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) flatten(v, p ? `${p}.${k}` : k, out)
  return out
}
/** lib/i18n/keyed.ts `isStructuralPath`: a block's kind, a link, an id — data, not words */
const isStructural = (path) => /\.\d+\.(t|id|href|slug|url)$/.test(path)
const catalogue = Object.fromEntries(Object.entries(flatten(JSON.parse(readFileSync('messages/no.json', 'utf8')))).filter(([k]) => !isStructural(k)))

let server = null
async function up() {
  if (baseArg > 0) return
  server = spawn('node', ['scripts/qa/serve.mjs'], {
    env: { ...process.env, QA_PORT: String(PORT), ORGPULS_I18N_KEYS: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
    // its own process group: `next start` runs under npx, and stopping serve.mjs alone leaves it on the port
    detached: true,
  })
  server.on('exit', (code) => {
    if (server) {
      console.error(`page-map: the QA server stopped (${code})`)
      process.exit(2)
    }
  })
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/logg-inn`)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('the QA server did not answer within two minutes')
}
function down() {
  const s = server
  server = null
  if (s?.pid) {
    try {
      process.kill(-s.pid, 'SIGTERM')
    } catch {}
  }
}

/** the markers in a page's HTML, in order, each once; the payload scripts left out */
function markersOf(html) {
  const visible = html.replace(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*self\.__next_f(?:(?!<\/script>)[\s\S])*<\/script>/g, '')
  const keys = []
  const seen = new Set()
  for (const m of visible.matchAll(/⟪([^⟪⟫]+)⟫/g)) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    keys.push(m[1])
  }
  return keys
}

async function crawl() {
  const xml = await (await fetch(`${base}/sitemap.xml`)).text()
  const fromSitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  const seenPattern = new Set()
  const targets = []
  for (const path of [...new Set([...fromSitemap, ...EXTRA])]) {
    const p = PATTERNS.find((x) => x.re.test(path))
    if (p) {
      if (seenPattern.has(p.as)) continue
      seenPattern.add(p.as)
      targets.push({ path: p.as, url: path })
    } else targets.push({ path, url: path })
  }
  const pages = []
  const failed = []
  for (const t of targets) {
    const res = await fetch(`${base}${t.url}`, { redirect: 'manual' })
    if (res.status !== 200) {
      failed.push(`${t.url} → ${res.status}`)
      continue
    }
    const keys = markersOf(await res.text())
    if (!keys.length) failed.push(`${t.url} → no markers: is the server in keys mode (ORGPULS_I18N_KEYS=1)?`)
    else pages.push({ path: t.path, keys })
  }
  return { pages, failed }
}

function build(pages) {
  const count = new Map()
  for (const p of pages) for (const k of p.keys) count.set(k, (count.get(k) ?? 0) + 1)
  const isShared = (k) => count.get(k) > pages.length / 2
  // the shared page in the order the first page shows them
  const shared = [...new Set(pages.flatMap((p) => p.keys.filter(isShared)))]
  const byPath = pages.map((p) => ({ path: p.path, keys: p.keys.filter((k) => !isShared(k)) })).sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path)))
  const namespaces = new Set([...count.keys()].map((k) => k.split('.')[0]))
  const rest = Object.keys(catalogue).filter((k) => namespaces.has(k.split('.')[0]) && !count.has(k))
  // a text no crawl reached goes to the one page that shows its closest group of keys, if one does
  // (or that shows at least twice as many of them as any other page: the newsletter's texts are
  // the newsletter page's, though the contact page borrows one)
  const ownerOf = (prefix) => {
    const found = byPath.map((p) => ({ p, n: p.keys.filter((k) => k.startsWith(prefix)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n)
    if (!found.length) return undefined
    return found.length === 1 || found[0].n >= 2 * found[1].n ? found[0].p : null
  }
  const states = new Map(byPath.map((p) => [p.path, []]))
  const unseen = []
  for (const k of rest) {
    const parts = k.split('.')
    let owner = undefined
    for (let depth = parts.length - 1; depth >= 1 && owner === undefined; depth--) owner = ownerOf(`${parts.slice(0, depth).join('.')}.`)
    if (owner) states.get(owner.path).push(k)
    else unseen.push(k)
  }
  return { pages: byPath.map((p) => ({ ...p, states: states.get(p.path) })), shared, unseen }
}

const tidy = (map) =>
  `${JSON.stringify(
    {
      $comment: 'Generated by scripts/i18n/page-map.mjs (X-090) — do not edit. Which texts each public page shows, in order.',
      ...map,
    },
    null,
    1,
  )}\n`

try {
  await up()
  const { pages, failed } = await crawl()
  down()
  if (failed.length) {
    console.error(`page-map: ${failed.length} page(s) could not be read:\n  ${failed.join('\n  ')}`)
    process.exit(1)
  }
  const map = build(pages)
  if (!check) {
    writeFileSync(OUT, tidy(map))
    console.log(`page-map: ${map.pages.length} pages, ${map.shared.length} shared texts, ${map.unseen.length} texts on no crawled page → ${OUT}`)
    process.exit(0)
  }
  // --check: every text a page shows is in its entry (or the shared page); every text the map names exists
  const committed = JSON.parse(readFileSync(OUT, 'utf8'))
  const has = new Map(committed.pages.map((p) => [p.path, new Set(p.keys)]))
  const shared = new Set(committed.shared)
  const problems = []
  for (const p of pages) {
    const known = has.get(p.path)
    if (!known) {
      problems.push(`${p.path}: a page the map does not have`)
      continue
    }
    const missing = p.keys.filter((k) => !known.has(k) && !shared.has(k))
    if (missing.length) problems.push(`${p.path}: shows ${missing.length} text(s) its entry lacks — ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}`)
  }
  const gone = [...committed.shared, ...committed.unseen, ...committed.pages.flatMap((p) => [...p.keys, ...p.states])].filter((k) => !(k in catalogue))
  if (gone.length) problems.push(`the map names ${gone.length} text(s) messages/no.json no longer has — ${gone.slice(0, 5).join(', ')}`)
  if (problems.length) {
    console.error(`page-map: ${OUT} is out of date. Run \`node scripts/i18n/page-map.mjs\` and commit it.\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`page-map: ${pages.length} pages match ${OUT}`)
} catch (err) {
  down()
  console.error(`page-map: ${err instanceof Error ? err.message : err}`)
  process.exit(2)
}
