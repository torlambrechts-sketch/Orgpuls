/**
 * The public site's content audit (D-282): every page www.orgpuls.com serves, measured the way a search engine
 * and an AI answer read it — title and description length, whether the H1 asks and the lead answers, words, how
 * many sections are questions, the pages that link it and the pages it links, sources, FAQ, and how old it is.
 * Read from the registries and messages/no.json, so a page cannot be left out by hand.
 *
 *   npx tsx scripts/seo/content-audit.ts                                   print the report
 *   npx tsx scripts/seo/content-audit.ts --out docs/marketing/content-audit-<date>.md --sc sc.json
 *   npx tsx scripts/seo/content-audit.ts --json                            the rows, for another tool
 *
 * `--sc` joins Search Console rows exported from Sentral: [{ page, impr, clicks, pos, top_queries }]. `--notes <md>`
 * puts a hand-written reading of the numbers above the table, so a report carries its conclusions with its evidence.
 *
 * The thresholds are the ones the tests hold (title ≤ 65, description ≤ 155) and the strategy's rules
 * (docs/marketing/seo-geo-strategy.md § 2–3): an article's H1 asks and its lead answers, at least half its sections
 * are questions, at least two other pages link it from their text or their registries (the header and footer do not
 * count), and it cites at least three sources. The article standard (D-287, lib/marketing/readability.ts) adds how
 * an article reads: our own prose at LIX 50 or under with no sentence over 40 words, at least one diagram block, and
 * every abbreviation spelled out at its first use.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import no from '@/messages/no.json'
import { ARTICLES, INFORMATIONAL_PAGES, LANDING_ARTICLES, LANDING_PAGES, LANDING_RELATED, landingKey, SITE_PAGES } from '@/lib/marketing/site'
import { TEMPLATES } from '@/lib/marketing/templates'
import { INDUSTRIES, liveQuestionPages, pageIn } from '@/content/industries'
import { LANDINGS } from '@/content/industries/landing'
import { FOOTERS, SITE_NAV, V3_ROUTES } from '@/lib/site/nav'
import { type Block as ZBlock, plain } from '@/lib/marketing/blocks'
import { allText, DIAGRAM_KINDS, lix, longSentences, ownUnits, unexplainedAbbreviations } from '@/lib/marketing/readability'

type Tree = { [k: string]: unknown }
type Block = {
  t: string
  text?: string
  title?: string
  items?: unknown[]
  head?: string[]
  rows?: string[][]
}
type Page = {
  path: string
  kind: 'home' | 'site' | 'landing' | 'informational' | 'industry' | 'question' | 'index' | 'article' | 'template'
  title: string
  description: string
  h1?: string
  lead?: string
  blocks: Block[]
  text: string[]
  faq: number
  sources: number
  modified?: string
  /** the internal paths the page links, from its text and its registries */
  links: Set<string>
}
type Sc = {
  page: string
  impr: number
  clicks: number
  pos: number | string
  top_queries?: string
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const TODAY = arg('today') ?? new Date().toISOString().slice(0, 10)

const at = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((x, p) => (x as Tree | undefined)?.[p], o)
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []
const words = (ss: string[]) => ss.map(plain).join(' ').split(/\s+/).filter(Boolean).length
const clean = (s: string) => s.replace(/­/g, '').trim()
/** a heading or title that asks: ends in «?» or opens with a question word */
const QUESTION = /\?$|^(hva|hvordan|hvilke[nt]?|når|er|hvor|hvem|hvorfor|må|kan|bør|trenger|finnes)\b/i
const isQ = (s?: string) => !!s && QUESTION.test(clean(s))
const norm = (p: string) => (p.split(/[#?]/)[0] ?? p).replace(/\/$/, '') || '/'
const textLinks = (ss: string[]) => [...ss.join('\n').matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => norm(m[1] ?? ''))
const str = (v: unknown) => (typeof v === 'string' ? v : '')

const pages: Page[] = []
const add = (
  p: Omit<Page, 'links' | 'blocks' | 'text' | 'faq' | 'sources'> &
    Partial<Pick<Page, 'blocks' | 'text' | 'faq' | 'sources'>> & {
      links?: Iterable<string>
    },
) => {
  const { links: given, text: words_, ...rest } = p
  const text = words_ ?? []
  const links = new Set<string>([...(given ?? []), ...textLinks(text)])
  links.delete(p.path)
  pages.push({ blocks: [], faq: 0, sources: 0, ...rest, text, links })
}
const ns = (path: string) => at(no, path) as Tree | undefined

// --- the start page: its own words, the industries and the three newest articles it shows (D-232), the demo
const launched = INDUSTRIES.filter((i) => pageIn(i, 'no')?.launched)
add({
  path: '/',
  kind: 'home',
  title: str(at(no, 'seo.home.title')),
  description: str(at(no, 'seo.home.description')),
  text: [...strings(ns('site.home')), ...strings(ns('seo.home'))],
  links: [
    '/plattform',
    '/priser',
    '/bransjer',
    '/demo',
    '/artikler',
    ...launched.map((i) => `/${i.slug}`),
    ...ARTICLES.slice(0, 3).map((a) => `/artikler/${a.slug}`),
  ],
})

// --- the site's own pages: the v3 pages' words under site.*, the PageView pages' under seo.pages.*
const SITE_NS: Record<string, string[]> = {
  plattform: ['site.plattform'],
  bruksomrader: ['site.bruksomrader'],
  bransjer: ['site.bransjer'],
  hvorfor: ['site.hvorfor'],
  priser: ['site.pris'],
  kontakt: ['site.contact', 'seo.pages.kontakt'],
}
for (const p of SITE_PAGES) {
  const seo =
    p.key === 'hvorfor'
      ? {
          title: at(no, 'site.hvorfor.seoTitle'),
          description: at(no, 'site.hvorfor.seoDescription'),
        }
      : ns(`seo.pages.${p.key}`)
  const page = ns(`seo.pages.${p.key}`)
  // a v3 page draws its design's sections (components/site/v3), not the blocks its namespace may still hold
  const v3 = (V3_ROUTES as readonly string[]).includes(`/${p.slug}`)
  add({
    path: `/${p.slug}`,
    kind: 'site',
    title: str(seo?.title),
    description: str(seo?.description),
    h1: v3 ? undefined : str(page?.h1) || undefined,
    lead: v3 ? undefined : str(page?.lead) || undefined,
    blocks: v3 ? [] : ((page?.blocks as Block[] | undefined) ?? []),
    faq: Array.isArray(page?.faq)
      ? page!.faq.length
      : Array.isArray(at(no, `${SITE_NS[p.key]?.[0]}.faq`))
        ? (at(no, `${SITE_NS[p.key]?.[0]}.faq`) as unknown[]).length
        : 0,
    text: [...(SITE_NS[p.key] ?? [`seo.pages.${p.key}`]).flatMap((n) => strings(ns(n)))],
    links: p.slug === 'bransjer' ? launched.map((i) => `/${i.slug}`) : [],
  })
}
add({
  path: '/demo',
  kind: 'site',
  title: str(at(no, 'demo.metaTitle')),
  description: str(at(no, 'demo.metaDescription')),
  text: strings(ns('demo')),
})

// --- the landing pages (an industry's slug among them is its industry page, below)
for (const slug of LANDING_PAGES) {
  if (LANDINGS.some((l) => l.slug === slug)) continue
  const lp = ns(`seo.lp.${landingKey(slug)}`)
  if (!lp) continue
  add({
    path: `/${slug}`,
    kind: INFORMATIONAL_PAGES.includes(slug) ? 'informational' : 'landing',
    title: str(lp.title),
    description: str(lp.description),
    h1: str(lp.h1),
    lead: str(lp.lead),
    blocks: (lp.blocks as Block[]) ?? [],
    faq: Array.isArray(lp.faq) ? lp.faq.length : 0,
    text: strings(lp),
    links: [...LANDING_ARTICLES[slug].map((a) => `/artikler/${a}`), ...LANDING_RELATED[slug].map((r) => `/${r}`)],
  })
}

// --- the industry pages and their question pages, once launched in Norwegian
for (const l of LANDINGS) {
  const entry = INDUSTRIES.find((i) => i.slug === l.slug)
  const page = pageIn(entry ?? null, 'no')
  if (!page?.launched) continue
  const words_ = ns(`site.bransje.${l.msg}`)
  const question = liveQuestionPages('no').includes(l.slug)
  add({
    path: `/${l.slug}`,
    kind: 'industry',
    title: str(at(words_, 'seo.title')),
    description: str(at(words_, 'seo.description')),
    h1: str(at(words_, 'hero.h1')),
    lead: str(at(words_, 'hero.lead')) || undefined,
    faq: l.faqCount ?? 0,
    sources: Array.isArray(words_?.sources) ? (words_!.sources as unknown[]).length : Object.keys((words_?.sources as Tree) ?? {}).length,
    text: strings(words_),
    links: [...l.related.map((r) => r.href), ...l.articles.map((a) => `/artikler/${a}`), ...(question ? [`/${l.slug}/sporsmal`] : [])],
  })
  if (question && page.questionPage)
    add({
      path: `/${l.slug}/sporsmal`,
      kind: 'question',
      title: page.questionPage.metaTitle,
      description: page.questionPage.metaDescription,
      links: [`/${l.slug}`],
    })
}

// --- the articles and their index
add({
  path: '/artikler',
  kind: 'index',
  title: str(at(no, 'seo.index.title')),
  description: str(at(no, 'seo.index.description')),
  h1: str(at(no, 'seo.index.h1')),
  lead: str(at(no, 'seo.index.lead')),
  text: strings(ns('seo.index')),
  links: ARTICLES.map((a) => `/artikler/${a.slug}`),
})
for (const a of ARTICLES) {
  const w = ns(`seo.articles.${a.key}`)
  if (!w) throw new Error(`seo.articles.${a.key} is missing`)
  add({
    path: `/artikler/${a.slug}`,
    kind: 'article',
    title: str(w.title),
    description: str(w.description),
    h1: str(w.h1),
    lead: str(w.lead),
    blocks: (w.blocks as Block[]) ?? [],
    sources: Array.isArray(w.sources) ? w.sources.length : 0,
    modified: a.modified,
    text: [str(w.h1), str(w.lead), ...strings(w.blocks)],
    links: [...a.related.map((r) => `/artikler/${r}`), ...(a.template ? [`/maler/${a.template}`] : [])],
  })
}

// --- the free templates and their index
add({
  path: '/maler',
  kind: 'index',
  title: str(at(no, 'seo.maler.index.title')),
  description: str(at(no, 'seo.maler.index.description')),
  h1: str(at(no, 'seo.maler.index.h1')),
  lead: str(at(no, 'seo.maler.index.lead')),
  text: strings(ns('seo.maler.index')),
  links: TEMPLATES.map((t) => `/maler/${t.slug}`),
})
for (const t of TEMPLATES) {
  const w = ns(`seo.maler.${t.key}`)
  if (!w) throw new Error(`seo.maler.${t.key} is missing`)
  add({
    path: `/maler/${t.slug}`,
    kind: 'template',
    title: str(w.title),
    description: str(w.description),
    h1: str(w.h1),
    lead: str(w.lead),
    blocks: (w.blocks as Block[]) ?? [],
    text: [str(w.h1), str(w.lead), ...strings(w.blocks)],
  })
}

// --- the header and footer: a link there reaches every page, so it says nothing about one page's standing
const chrome = new Set<string>()
for (const item of SITE_NAV) {
  chrome.add(norm(item.href))
  for (const c of item.children ?? []) chrome.add(norm(c.href))
}
for (const cols of Object.values(FOOTERS)) for (const col of cols) for (const l of col.links) if (l.href) chrome.add(norm(l.href))

// --- measure
const sc: Map<string, Sc> = new Map((arg('sc') ? (JSON.parse(readFileSync(arg('sc')!, 'utf8')) as Sc[]) : []).map((r) => [norm(r.page), r] as const))
const inbound = (p: Page) => pages.filter((q) => q !== p && q.links.has(p.path)).map((q) => q.path)
const days = (iso?: string) => (iso ? Math.round((Date.parse(TODAY) - Date.parse(iso)) / 86400000) : undefined)

type Row = ReturnType<typeof measure>
function measure(p: Page) {
  const h2 = p.blocks.filter((b) => b.t === 'h2' || b.t === 'h3').map((b) => b.text ?? '')
  const h2q = h2.filter((h) => isQ(h)).length
  const firstSentence = (p.lead ?? '').split(/(?<=[.!?])\s/)[0] ?? ''
  const inb = inbound(p)
  const flags: string[] = []
  const wordsOn = p.kind === 'question' ? undefined : words(p.text)
  if ([...p.title].length > 65) flags.push(`T>65 (${[...p.title].length})`)
  if ([...p.description].length > 155) flags.push(`D>155 (${[...p.description].length})`)
  if ([...p.description].length < 70) flags.push(`D<70 (${[...p.description].length})`)
  if ((p.kind === 'article' || p.kind === 'informational') && !isQ(p.h1)) flags.push('H1≠?')
  if (p.kind === 'article' && h2.length && h2q / h2.length < 0.5) flags.push(`H2?<½ (${h2q}/${h2.length})`)
  if (p.kind === 'article' && p.lead && [...p.lead].length > 520) flags.push(`LEAD>520 (${[...p.lead].length})`)
  if (p.kind === 'article' && firstSentence && [...firstSentence].length > 200) flags.push(`FIRST>200 (${[...firstSentence].length})`)
  // a page the header or footer carries is reached from everywhere; a question page is its industry's own
  if (!['home', 'site', 'index', 'question'].includes(p.kind) && !chrome.has(p.path) && inb.length < 2) flags.push(`IN<2 (${inb.length})`)
  if (p.kind === 'article' && p.sources < 3) flags.push(`SRC<3 (${p.sources})`)
  if (p.kind === 'article' && wordsOn !== undefined && wordsOn < 700) flags.push(`W<700 (${wordsOn})`)
  // how it reads (D-287): our own prose at LIX 50 or under, no sentence over 40 words, a diagram, abbreviations spelled out
  let readability: { lix: number; long: number; diagram: boolean; abbr: string[] } | undefined
  if (p.kind === 'article' && p.lead) {
    const a = { title: p.title, description: p.description, h1: p.h1, lead: p.lead, blocks: p.blocks as unknown as ZBlock[] }
    const own = ownUnits(a)
    readability = { lix: lix(own).lix, long: longSentences(own).length, diagram: p.blocks.some((b) => DIAGRAM_KINDS.has(b.t)), abbr: unexplainedAbbreviations(allText(a), 'no') }
    if (readability.lix > 50) flags.push(`LIX>50 (${readability.lix.toFixed(0)})`)
    if (readability.long) flags.push(`SENT>40 (${readability.long})`)
    if (!readability.diagram) flags.push('NODIAGRAM')
    if (readability.abbr.length) flags.push(`ABBR (${readability.abbr.join('/')})`)
  }
  const age = days(p.modified)
  if (age !== undefined && age > 45) flags.push(`AGE>45 (${age}d)`)
  if ((p.kind === 'landing' || p.kind === 'industry') && p.faq === 0) flags.push('NOFAQ')
  const s = sc.get(p.path)
  return {
    path: p.path,
    kind: p.kind,
    title: p.title,
    titleLen: [...p.title].length,
    descLen: [...p.description].length,
    h1: p.h1 ? clean(p.h1) : undefined,
    h1Question: isQ(p.h1),
    leadLen: p.lead ? [...p.lead].length : undefined,
    firstSentenceLen: firstSentence ? [...firstSentence].length : undefined,
    words: wordsOn,
    sections: h2.length,
    questionSections: h2q,
    lists: p.blocks.filter((b) => ['ul', 'ol', 'table'].includes(b.t)).length,
    quotes: p.blocks.filter((b) => ['quote', 'law'].includes(b.t)).length,
    inbound: inb,
    chrome: chrome.has(p.path),
    outbound: [...p.links],
    sources: p.sources,
    readability,
    faq: p.faq,
    modified: p.modified,
    age,
    sc: s
      ? {
          impr: s.impr,
          clicks: s.clicks,
          pos: Number(s.pos),
          top: s.top_queries ?? '',
        }
      : undefined,
    flags,
  }
}

const rows: Row[] = pages.map(measure)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
  process.exit(0)
}

// --- the report
const byKind = Object.entries(rows.reduce<Record<string, number>>((acc, r) => ((acc[r.kind] = (acc[r.kind] ?? 0) + 1), acc), {}))
const flagCounts = Object.entries(
  rows.flatMap((r) => r.flags.map((f) => f.split(' ')[0] ?? f)).reduce<Record<string, number>>((acc, f) => ((acc[f] = (acc[f] ?? 0) + 1), acc), {}),
).sort((a, b) => b[1] - a[1])
const num = (v: number | undefined) => (v === undefined ? '–' : String(v))
const scCell = (r: Row) => (r.sc ? `${r.sc.impr} / ${r.sc.pos.toFixed(0)} · ${r.sc.top.split(';')[0]?.trim() ?? ''}` : '–')
const esc = (s: string) => s.replace(/\|/g, '\\|')
const lines = [
  `# Content audit — www.orgpuls.com — ${TODAY}`,
  '',
  `Generated by \`scripts/seo/content-audit.ts\` from the registries and \`messages/no.json\`: ${rows.length} pages (${byKind.map(([k, n]) => `${n} ${k}`).join(', ')}).`,
  sc.size
    ? `Search Console: the last 28 days, joined by page (impressions / average position · the query with most impressions).`
    : 'No Search Console join (`--sc`).',
  '',
  ...(arg('notes') ? [readFileSync(arg('notes')!, 'utf8').trim(), ''] : []),
  '**Columns.** Title and Desc are lengths in characters (≤ 65, ≤ 155). Words counts the page’s own text. H2 is sections, (q) how many of them ask a question. In is the pages that link it from their text or registries — the header and footer do not count, ✓ marks a page they carry. Out is the pages it links. Src is sources cited, FAQ the questions it answers.',
  '',
  `**Flags.** ${flagCounts.map(([f, n]) => `${f} ×${n}`).join(' · ') || 'none'}`,
  '',
  '| Page | Kind | Title | Desc | Words | H2 (q) | In | Out | Src | FAQ | Modified | SC 28d | Flags |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.path} | ${r.kind} | ${r.titleLen} | ${r.descLen} | ${num(r.words)} | ${r.sections ? `${r.sections} (${r.questionSections})` : '–'} | ${r.inbound.length}${r.chrome ? ' ✓' : ''} | ${r.outbound.length} | ${r.kind === 'article' || r.kind === 'industry' ? r.sources : '–'} | ${r.faq || '–'} | ${r.modified ?? '–'} | ${esc(scCell(r))} | ${esc(r.flags.join(', ')) || '—'} |`,
  ),
  '',
  '## Flagged pages',
  '',
]
for (const r of rows.filter((r) => r.flags.length)) {
  lines.push(`### ${r.path} — ${esc(r.title)}`, '')
  for (const f of r.flags) lines.push(`- ${f}`)
  if (r.flags.some((f) => f.startsWith('IN<2')))
    lines.push(`- linked from: ${r.inbound.length ? r.inbound.join(', ') : 'no page'}${r.chrome ? ' (and the header or footer)' : ''}`)
  if (r.h1) lines.push(`- H1: ${esc(r.h1)}`)
  lines.push('')
}
lines.push('## Inbound links, fewest first', '')
for (const r of [...rows].sort((a, b) => a.inbound.length - b.inbound.length).slice(0, 15))
  lines.push(`- ${r.path}: ${r.inbound.length}${r.chrome ? ' + chrome' : ''}${r.inbound.length ? ` (${r.inbound.join(', ')})` : ''}`)
lines.push('')

const out = arg('out')
if (out) {
  writeFileSync(out, lines.join('\n') + '\n')
  console.log(`${out}: ${rows.length} pages, ${rows.filter((r) => r.flags.length).length} flagged`)
} else console.log(lines.join('\n'))
