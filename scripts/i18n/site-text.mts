/**
 * Every text on the public site as one document for a copywriter (2026-10-01): page by page, then
 * Norwegian and English, then section by section, in the order the page shows them.
 *
 *   npx tsx scripts/i18n/site-text.mts --out <file.md>      write the document
 *   npx tsx scripts/i18n/site-text.mts --diff <file.md>     read an edited copy back: every text
 *                                                           that differs from the source, as JSON
 *
 * Each text is under a line `[[<lang>:<id>]]` that names where it lives: a message key
 * (`no:site.home.h1`) or a path in an industry page's content file
 * (`no:bransje.handel.hero.h1`). The document is read back by those ids, so whatever a writer
 * changes between two id lines is the new text for that id.
 *
 * Which texts a page shows, and in what order, is lib/i18n/site-pages.json (X-090), crawled from
 * the running site. A text more than one page shows is listed once, under «Felles tekster». An
 * industry page's own words are its content file (content/industries); the survey's statements
 * (`factor.*`) are the instrument, locked, and left out.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { INDUSTRIES } from '@/content/industries'
import type { IndustryPage } from '@/content/industries/types'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import map from '@/lib/i18n/site-pages.json'

type Lang = 'no' | 'en'
type Entry = { id: string; kind: string; section: string; no: string | null; en: string | null }
type Page = { path: string; name: string; entries: Entry[]; enMissing?: string }

const MSG: Record<Lang, unknown> = { no, en }
const outArg = process.argv.indexOf('--out')
const OUT = outArg > 0 ? process.argv[outArg + 1] : 'site-text.md'
const diffArg = process.argv.indexOf('--diff')

/** The texts of a document, by `<lang>:<id>`: the lines under each id line, up to the next id line or heading. */
export function parseSiteText(md: string): Map<string, string> {
  const out = new Map<string, string>()
  let id: string | null = null
  let buf: string[] = []
  const flush = () => {
    if (id) {
      while (buf.length && buf[0].trim() === '') buf.shift()
      while (buf.length && buf[buf.length - 1].trim() === '') buf.pop()
      out.set(id, buf.join('\n'))
    }
    id = null
    buf = []
  }
  for (const line of md.split(/\r?\n/)) {
    const m = /^\[\[(no|en):([^\]]+)\]\]/.exec(line)
    if (m) {
      flush()
      id = `${m[1]}:${m[2]}`
    } else if (/^#{1,3} /.test(line) || line.trim() === '---') flush()
    else if (id) buf.push(line)
  }
  flush()
  return out
}

/** The pages a visitor reads, in the order the site presents them; utility pages are left out. */
const PAGES: [string, string][] = [
  ['/', 'Forside'],
  ['/plattform', 'Plattform'],
  ['/hvorfor', 'Hvorfor Orgpuls'],
  ['/bruksomrader', 'Bruksområder'],
  ['/priser', 'Priser'],
  ['/sikkerhet', 'Sikkerhet'],
  ['/kontakt', 'Kontakt'],
  ['/demo', 'Demo'],
  ['/registrer', 'Registrer (prøv gratis)'],
  ['/bransjer', 'Bransjer (oversikt)'],
  ['/lovkrav', 'Lovkravet'],
  ['/verneombud', 'Verneombud'],
  ['/smaa-bedrifter', 'Små bedrifter'],
  ['/bygg-og-anlegg', 'Bygg og anlegg'],
  ['/bygg-og-anlegg/sporsmal', 'Bygg og anlegg – spørsmålene'],
  ['/helse-og-omsorg', 'Helse og omsorg'],
  ['/helse-og-omsorg/sporsmal', 'Helse og omsorg – spørsmålene'],
  ['/barnehage-og-skole', 'Barnehage og skole'],
  ['/barnehage-og-skole/sporsmal', 'Barnehage og skole – spørsmålene'],
  ['/kunnskap-og-kontor', 'Kunnskap og kontor'],
  ['/kunnskap-og-kontor/sporsmal', 'Kunnskap og kontor – spørsmålene'],
  ['/handel', 'Handel'],
  ['/handel/sporsmal', 'Handel – spørsmålene'],
  ['/artikler', 'Artikler (oversikt)'],
  ['/artikler/nye-regler-psykososialt-arbeidsmiljo-2026', 'Artikkel: Nye regler 2026'],
  ['/artikler/krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'Artikkel: Krav til kartlegging'],
  ['/artikler/medarbeiderundersokelse-sporsmal', 'Artikkel: Spørsmål i medarbeiderundersøkelsen'],
  ['/artikler/hvor-ofte-bor-dere-male-arbeidsmiljoet', 'Artikkel: Hvor ofte bør dere måle'],
  ['/artikler/anonym-medarbeiderundersokelse', 'Artikkel: Anonym medarbeiderundersøkelse'],
  ['/artikler/verneombudets-rolle-i-kartleggingen', 'Artikkel: Verneombudets rolle'],
  ['/nyhetsbrev', 'Nyhetsbrev'],
]
const LEFT_OUT = ['/logg-inn', '/nytt-passord', '/avmeld', '/bli-med', '/nyhetsbrev/arkiv', '/personvernerklaering']

/** Labels for the shared texts' groups and for a page's own sections, by key prefix (longest wins). */
const GROUPS: [string, string][] = [
  ['site.chrome.nav', 'Hovedmeny'],
  ['site.chrome.footer', 'Bunntekst'],
  ['site.chrome.start', 'Prøv-feltet nederst på sidene'],
  ['site.chrome.trust', 'Tillitsstripe under toppen'],
  ['site.chrome', 'Knapper og småtekster som går igjen'],
  ['site.bransjer.cards', 'Bransjekort'],
  ['site.home.industries', 'Bransjer på forsiden'],
  ['seo.signup', 'Organisasjonsnummer-feltet i toppen'],
  ['seo.common', 'Småtekster som går igjen'],
  ['seo.home', 'Forsidens produktbilder og artikler'],
  ['seo.shots', 'Tekster til produktbilder'],
  ['seo.pages.bransjer', 'Bransjer'],
  ['start.plan', 'Prisplanene'],
  ['start.final', 'Avslutningsfeltet nederst'],
  ['start.faq', 'Spørsmål og svar'],
  ['start', 'Registrering og prisplaner'],
  ['industry', 'Bransjesidene – felles oppsett'],
  ['newsletter', 'Nyhetsbrev'],
  ['site.contact', 'Kontaktskjema'],
  ['site.demo', 'Demo-skjema'],
  ['site.story', 'Eksempelhistoriene'],
  ['registrer', 'Registrering – skjemaet'],
  ['demo', 'Demo'],
  ['seo.lp', 'Kort som lenker til landingssidene'],
  ['seo.articles', 'Artikkelkort'],
  ['seo.index', 'Artikler'],
  ['seo.pages', 'Kort som lenker til sidene'],
  ['site.bransjer', 'Bransjer'],
]
const groupOf = (key: string) => GROUPS.find(([p]) => key === p || key.startsWith(p + '.'))?.[1] ?? key.split('.')[0]

const HERO = new Set(['pill', 'h1', 'lead', 'how', 'kicker', 'crumb', 'next', 'eyebrow', 'stats', 'byline'])
const SECTION_NAMES: Record<string, string> = {
  sections: 'Undermeny',
  faq: 'Spørsmål og svar',
  who: 'Hvem er du?',
  roles: 'Hvem er du?',
  explore: 'Utforsk',
  teasers: 'Utforsk',
  about: 'Om oss',
  price: 'Pris',
  showcase: 'Produktbilder',
  card: 'Kort som lenker hit fra andre sider',
  finalTitle: 'Avslutning',
  finalBody: 'Avslutning',
  signupLabel: 'Toppen av siden',
  tip: 'Tips-knappen i toppen',
  ctaTitle: 'Avslutning',
  ctaBody: 'Avslutning',
  sources: 'Kilder',
  usesLabel: 'Bruksområdene',
  uses: 'Bruksområdene',
  app: 'Produktbildet',
  seoTitle: 'SEO – Google og nettleserfanen',
  seoDescription: 'SEO – Google og nettleserfanen',
  segment: 'Segmenter',
  sectors: 'Bransjer',
  industries: 'Bransjer',
  other: 'Andre bransjer',
  heat: 'Varmekart',
  get: 'Hva dere får',
  features: 'Funksjoner',
  facts: 'Fakta',
  malinger: 'Målinger og årshjul',
  respondent: 'Slik er det å svare',
  roller: 'Roller og tilgang',
  resultater: 'Resultater',
  rapport: 'Rapport',
  oppsett: 'Oppsett og integrasjoner',
  tiltak: 'Tiltak',
  kommentarer: 'Kommentarer',
  assistent: 'Assistenten',
  visninger: 'Fire visninger',
  articlesAll: 'Artikler',
  articlesEyebrow: 'Artikler',
  articlesTitle: 'Artikler',
  callouts: 'Fremhevede punkter',
  cards: 'Kort',
  compare: 'Sammenligning',
}

const KIND: Record<string, string> = {
  h1: 'Hovedoverskrift (H1)',
  h2: 'Mellomtittel',
  h3: 'Undertittel',
  t: 'Tittel',
  title: 'Tittel',
  name: 'Navn',
  lead: 'Ingress',
  d: 'Tekst',
  text: 'Tekst',
  body: 'Tekst',
  p: 'Avsnitt',
  q: 'Spørsmål',
  a: 'Svar',
  items: 'Punkt',
  label: 'Etikett',
  placeholder: 'Hjelpetekst i feltet',
  k: 'Liten overskrift',
  eyebrow: 'Liten overskrift',
  kicker: 'Liten overskrift',
  pill: 'Merkelapp',
  caption: 'Bildetekst',
  alt: 'Beskrivelse av bilde (skjermlesere)',
  ref: 'Lovhenvisning',
  cite: 'Kilde',
  cta: 'Knapp',
  submit: 'Knapp',
  trial: 'Knapp',
  start: 'Knapp',
  see: 'Knapp',
  how: 'Knapp',
  next: 'Knapp',
  send: 'Knapp',
  all: 'Lenke',
  crumb: 'Brødsmule (stien øverst)',
  v: 'Tall',
  l: 'Forklaring til tallet',
  description: 'Tekst',
  footnote: 'Fotnote',
  intro: 'Innledning',
  navLabel: 'Navn i menyen',
  i: 'Forbokstaver i ikonet',
  s: 'Undertekst',
  get: 'Punkt',
  who: 'Liten overskrift',
  explore: 'Liten overskrift',
  head: 'Overskrift',
  link: 'Lenke',
  bottom: 'Tekst',
  about: 'Tekst',
  menu: 'Knapp',
  signIn: 'Knapp',
  demo: 'Knapp',
  getStarted: 'Knapp',
  ctaFree: 'Knapp',
  priceLine: 'Linje under knappen',
  anonymity: 'Linje under knappen',
}

/** Leaves that are structure, not words: they are never exported. */
const STRUCTURE = new Set(['href', 'url', 'id', 'key', 'w', 'h', 'slug', 'launched', 'factorKey', 'itemCode', 'featureFlag', 'newUntil', 'kind', 'defaultVariant', 'code', 'related', 'values', 'reviewed', 'ordinal'])

const get = (lang: Lang, key: string): unknown =>
  key.split('.').reduce<unknown>((o, s) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[s] : undefined), MSG[lang])

/** Where a path inside a `blocks` array sits: the H2 it falls under, and the block's kind. */
function blockOf(path: string): { h2: number; title: string; kind: string } | undefined {
  const m = /^(.*\.blocks)\.(\d+)\.([a-z]+)/.exec(path)
  if (!m) return undefined
  const arr = get('no', m[1])
  if (!Array.isArray(arr)) return undefined
  let h2 = 0
  let title = ''
  for (let i = 0; i <= Number(m[2]); i++) {
    const b = arr[i] as Record<string, unknown>
    if (b?.t === 'h2') ((h2 += 1), (title = String(b.text)))
  }
  const b = arr[Number(m[2])] as Record<string, unknown>
  const t = String(b?.t)
  const f = m[3]
  const kind =
    t === 'h2' || t === 'h3' ? KIND[t] : t === 'p' ? 'Avsnitt' : t === 'ul' || t === 'ol' ? 'Punkt i liste' : t === 'quote' ? (f === 'cite' ? 'Kilde' : 'Sitat') : t === 'table' ? (f === 'head' ? 'Tabell, kolonnetittel' : 'Tabellcelle') : t === 'law' ? (f === 'items' && /ref$/.test(path) ? 'Lovhenvisning' : 'Lovtekst') : t === 'box' ? (f === 'title' ? 'Faktaboks, tittel' : 'Faktaboks, tekst') : t === 'cards' || t === 'links' ? (/title$/.test(path) ? 'Kort, tittel' : 'Kort, tekst') : KIND[f] ?? 'Tekst'
  return { h2, title, kind }
}

/** A message key's texts as leaves, in order (a key may name a whole array or object). */
function leaves(key: string): { key: string; kind: string; block?: { h2: number; title: string } }[] {
  const out: { key: string; kind: string; block?: { h2: number; title: string } }[] = []
  const walk = (v: unknown, path: string, kind: string) => {
    if (typeof v === 'string') {
      if (/\.blocks\.\d+\.t$/.test(path)) return
      const b = blockOf(path)
      return void out.push({ key: path, kind: b?.kind ?? kind, block: b })
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}.${i}`, kind))
    if (v && typeof v === 'object')
      for (const [f, x] of Object.entries(v)) if (!STRUCTURE.has(f)) walk(x, `${path}.${f}`, KIND[f] ?? kind)
  }
  const last = key.split('.').filter((s) => !/^\d+$/.test(s)).pop() ?? key
  walk(get('no', key), key, KIND[last] ?? 'Tekst')
  return out
}

// ------------------------------------------------------------------ who owns which message key
const byPath = new Map(map.pages.map((p) => [p.path, [...p.keys, ...(p.states ?? [])]]))
const exported = PAGES.map(([p]) => p)
const pagesOf = new Map<string, string[]>()
for (const p of exported)
  for (const k of byPath.get(p) ?? []) if (!k.startsWith('factor.')) pagesOf.set(k, [...(pagesOf.get(k) ?? []), p])

/** A page's own namespaces: where its H1 lives, and the SEO twin of a site.* page. */
function ownPrefixes(path: string): string[] {
  const h1 = (byPath.get(path) ?? []).find((k) => /\.h1$/.test(k) && !k.startsWith('site.chrome'))
  if (!h1) return []
  const base = h1.replace(/\.h1$/, '')
  const out = [base + '.']
  const m = /^site\.(\w+)$/.exec(base)
  if (m) out.push(m[1] === 'home' ? 'seo.home.' : `seo.pages.${m[1]}.`)
  if (base === 'seo.index') out.push('seo.index.')
  return out
}
const OWN = new Map(exported.map((p) => [p, ownPrefixes(p)]))
const ownerOf = (key: string): string | 'shared' => {
  const ps = pagesOf.get(key) ?? []
  const own = ps.find((p) => OWN.get(p)!.some((pre) => key.startsWith(pre)))
  if (own) return own
  return ps.length === 1 ? ps[0] : 'shared'
}

function sectionOf(page: string, leaf: { key: string; block?: { h2: number; title: string } }): string {
  const pre = OWN.get(page)!.find((p) => leaf.key.startsWith(p))
  if (!pre) return groupOf(leaf.key)
  if (leaf.block) return leaf.block.h2 ? `Del: ${leaf.block.title}` : 'Innhold'
  const seg = leaf.key.slice(pre.length).split('.')[0]
  if (pre.startsWith('seo.') && (seg === 'title' || seg === 'description')) return 'SEO – Google og nettleserfanen'
  if (HERO.has(seg)) return 'Toppen av siden'
  return SECTION_NAMES[seg] ?? (seg[0].toUpperCase() + seg.slice(1))
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

// ------------------------------------------------------------------ the pages from messages
const shared: Entry[] = []
const pages: Page[] = PAGES.map(([path, name]) => ({ path, name, entries: [] }))
const page = (p: string) => pages.find((x) => x.path === p)!
const seen = new Set<string>()
for (const key of map.shared)
  for (const leaf of leaves(key)) {
    if (seen.has(leaf.key)) continue
    seen.add(leaf.key)
    shared.push({ id: leaf.key, kind: leaf.kind, section: groupOf(leaf.key), no: str(get('no', leaf.key)), en: str(get('en', leaf.key)) })
  }
for (const path of exported)
  for (const key of byPath.get(path) ?? []) {
    if (key.startsWith('factor.')) continue
    for (const leaf of leaves(key)) {
      if (seen.has(leaf.key)) continue
      seen.add(leaf.key)
      const owner = ownerOf(key)
      const e: Entry = {
        id: leaf.key,
        kind: leaf.kind,
        section: owner === 'shared' ? groupOf(leaf.key) : sectionOf(owner, leaf),
        no: str(get('no', leaf.key)),
        en: str(get('en', leaf.key)),
      }
      ;(owner === 'shared' ? shared : page(owner).entries).push(e)
    }
  }

// ------------------------------------------------------------------ the industry pages' own words
const INDUSTRY_SECTIONS: Record<string, string> = {
  seo: 'SEO – Google og nettleserfanen',
  navLabel: 'Navn',
  moduleName: 'Navn',
  hero: 'Toppen av siden',
  challengesIntro: 'Utfordringene',
  challenges: 'Utfordringene',
  moduleOverview: 'Modulen',
  loop: 'Slik jobber dere med det',
  law: 'Lovkravene',
  faq: 'Spørsmål og svar',
  cta: 'Avslutning',
  extraSources: 'Kilder',
}
function industryLeaves(p: IndustryPage | null): Map<string, { kind: string; section: string; text: string; question: boolean }> {
  const out = new Map<string, { kind: string; section: string; text: string; question: boolean }>()
  if (!p) return out
  const walk = (v: unknown, path: string, kind: string, section: string, question: boolean) => {
    if (typeof v === 'string') return void out.set(path, { kind, section, text: v, question })
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}.${i}`, kind, section, question))
    if (v && typeof v === 'object')
      for (const [f, x] of Object.entries(v)) if (!STRUCTURE.has(f)) walk(x, `${path}.${f}`, KIND[f] ?? kind, section, question)
  }
  for (const [f, v] of Object.entries(p)) {
    if (STRUCTURE.has(f) || f === 'card' || f === 'module' || f === 'sourcesFromFactors') continue
    if (f === 'questionPage') {
      for (const [g, x] of Object.entries(v as object)) walk(x, `questionPage.${g}`, KIND[g] ?? (/Title$/.test(g) ? 'Tittel' : 'Tekst'), g === 'seo' ? INDUSTRY_SECTIONS.seo : 'Spørsmålssiden', true)
      continue
    }
    walk(v, f, KIND[f] ?? 'Tekst', INDUSTRY_SECTIONS[f] ?? f, false)
  }
  return out
}
for (const i of INDUSTRIES) {
  const nos = industryLeaves(i.page)
  const ens = industryLeaves(i.pageEn)
  for (const [path, x] of nos) {
    const target = page(x.question ? `/${i.slug}/sporsmal` : `/${i.slug}`)
    target.entries.unshift({ id: `bransje.${i.slug}.${path}`, kind: x.kind, section: x.section, no: x.text, en: ens.get(path)?.text ?? null })
  }
  if (!i.pageEn) for (const p of [page(`/${i.slug}`), page(`/${i.slug}/sporsmal`)]) p.enMissing = 'Denne siden finnes bare på norsk. Den engelske siden er ikke lansert.'
}
// unshift reversed them: the content file's order is the page's order, before the shared layout's texts
for (const i of INDUSTRIES) for (const p of [page(`/${i.slug}`), page(`/${i.slug}/sporsmal`)]) {
  const own = p.entries.filter((e) => e.id.startsWith('bransje.')).reverse()
  p.entries = [...own, ...p.entries.filter((e) => !e.id.startsWith('bransje.'))]
}

// ------------------------------------------------------------------ the document
const law = (s: string) => /§|forskrift|\bkap\. \d/i.test(s)
const isSeo = (id: string) =>
  /^seo\.(home|index)\.(title|description)$/.test(id) ||
  /^seo\.(pages|lp|articles)\.[^.]+\.(title|description)$/.test(id) ||
  /\.seo\.(title|description)$/.test(id) ||
  /\.seo(Title|Description)$/.test(id)
function hint(e: Entry, text: string): string {
  const seo = isSeo(e.id)
  const parts = [seo ? (/(title|Title)$/.test(e.id) ? 'Sidetittel i Google og nettleserfanen' : 'Beskrivelse i Google') : e.kind, `${[...text].length} tegn`]
  if (seo) parts.push(/(title|Title)$/.test(e.id) ? 'maks ca. 60 tegn' : 'maks ca. 155 tegn')
  if (law(text)) parts.push('⚖ lovhenvisning – sjekk at den stemmer')
  if (/\{[a-zA-Z]+\}|<\w+>|\{\{cite:/.test(text)) parts.push('behold {…}, <…> og {{cite:…}} som de er')
  return parts.join(' · ')
}
function sections(entries: Entry[]): Map<string, Entry[]> {
  const s = new Map<string, Entry[]>()
  for (const e of entries) s.set(e.section, [...(s.get(e.section) ?? []), e])
  return s
}
function block(lang: Lang, entries: Entry[], missing?: string): string[] {
  const lines = [`## ${lang === 'no' ? 'Norsk' : 'English'}`, '']
  if (lang === 'en' && missing) return [...lines, `_${missing}_`, '']
  for (const [name, es] of sections(entries)) {
    lines.push(`### ${name}`, '')
    for (const e of es) {
      const text = e[lang]
      lines.push(`[[${lang}:${e.id}]] ${text === null ? (lang === 'en' ? 'mangler engelsk tekst' : 'mangler norsk tekst') : hint(e, text)}`)
      lines.push(text ?? '', '')
    }
  }
  return lines
}

const today = new Date().toISOString().slice(0, 10)
const count = (es: Entry[]) => es.length
const doc: string[] = [
  `# Orgpuls – alle tekster på nettsidene (${today})`,
  '',
  'Dette dokumentet inneholder hver tekst på de offentlige sidene på orgpuls.no og en.orgpuls.com. Tekstene står side for side, deretter språk for språk og seksjon for seksjon, i samme rekkefølge som på siden.',
  '',
  '## Slik bruker du dokumentet',
  '',
  '- Hver tekst står under en linje som begynner med `[[no:…]]` eller `[[en:…]]`. **Ikke endre disse linjene.** De sier hvor teksten hører hjemme, og dokumentet leses tilbake automatisk etter dem. Det som står etter `]]` på samme linje er bare til hjelp: hva slags tekst det er, antall tegn og eventuelle advarsler.',
  '- Rediger bare teksten på linjene under. Én tekst kan gjerne gå over flere linjer, men ikke legg inn nye `[[…]]`-linjer, overskrifter eller nye seksjoner. Vil du foreslå en ny tekst eller seksjon, skriv det i en kommentar til slutt i dokumentet under «Forslag».',
  '- Behold det som står i krøllparenteser, som `{year}` og `{orgnr}`, tagger som `<privacy>…</privacy>`, og kildemerker som `{{cite:…}}`. De fylles inn eller blir til lenker på siden.',
  '- To markeringer er lov i løpende tekst: `**fet**` og `[lenketekst](/adresse)`.',
  '- Tekster merket ⚖ viser til lov eller forskrift. Endre gjerne språket, men ikke det juridiske innholdet uten å sjekke kilden.',
  '- Finn ikke på tall, kunder, sitater eller resultater. Står et tall i teksten, er det dokumentert.',
  '- Norsk og engelsk står hver for seg. Endrer du den norske teksten, bør den engelske si det samme.',
  '- Tekster som står på flere sider, som menyen, bunnteksten og knappene, står bare én gang, under «Felles tekster».',
  '',
  `Ikke med: innlogging, nytt passord, avmelding, invitasjoner, nyhetsbrevarkivet og personvernerklæringen (${LEFT_OUT.join(', ')}), og spørsmålene i selve undersøkelsen. Spørsmålene bygger på QPS Nordic og har låst ordlyd.`,
  '',
  '## Innhold',
  '',
  `- Felles tekster (${count(shared)} tekster)`,
  ...pages.map((p) => `- ${p.name} – ${p.path} (${count(p.entries)} tekster)`),
  '',
  '---',
  '',
  '# Felles tekster – meny, bunntekst og knapper som går igjen',
  '',
  ...block('no', shared),
  ...block('en', shared),
]
for (const p of pages) {
  doc.push('---', '', `# ${p.name} – ${p.path}`, '', ...block('no', p.entries), ...block('en', p.entries, p.enMissing))
}
doc.push('---', '', '# Forslag', '', '_Skriv forslag til nye tekster eller seksjoner her._', '')
const all = [shared, ...pages.map((p) => p.entries)].flat()
if (diffArg > 0) {
  // what the document said when it was written, against what came back
  const before = parseSiteText(doc.join('\n'))
  const got = parseSiteText(readFileSync(process.argv[diffArg + 1], 'utf8'))
  const same = (a: string, b: string) => a.trimEnd() === b.trimEnd() || a.replace(/\u00ad/g, '').trimEnd() === b.trimEnd()
  const changed = [...before].flatMap(([id, from]) => {
    const to = got.get(id)
    return to !== undefined && !same(from, to) ? [{ id, from, to }] : []
  })
  const missing = [...before.keys()].filter((id) => !got.has(id))
  const unknown = [...got.keys()].filter((id) => !before.has(id))
  console.log(JSON.stringify({ changed, missing, unknown }, null, 2))
} else {
  writeFileSync(OUT, doc.join('\n'))
  console.log(`site-text: ${pages.length} pages, ${all.length} texts (${all.filter((e) => e.en === null).length} without English) → ${OUT}`)
}
