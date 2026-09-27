import 'server-only'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { INDUSTRIES, pageIn } from '@/content/industries'
import { MODULE_VERSIONS, moduleFile } from '@/content/industries/modules'
import type { IndustryPage } from '@/content/industries/types'
import { ARTICLES } from '@/lib/marketing/site'
import { DPA_SHA256, DPA_VERSION } from './dpa'

/**
 * Every legal text in the product and on the site, for the legal review (D-130, X-065).
 *
 * A legal text is one the product or the site states law in, paraphrases it, or makes a legal or
 * compliance promise with — and the legal documents themselves. Each is read from where it
 * lives (the industry registry, the module files, the message files, the database, the terms
 * draft), never copied here, so what the review shows is what is published.
 *
 * One unit is what a reviewer reads as one thing: one law item on an industry page, one factor's
 * legal basis in a module, one landing page, one article, one document, one in-app section. Its
 * text is the unit's strings in order, each under its path; its hash is the SHA-256 of that
 * text. An approval (app.legal_approvals, 0082) names the hash it approved, so any edit to a
 * unit shows it as changed until it is approved again.
 *
 * Left out, on purpose: labels that only name a law or a role ("Verneombud", "Hjemmel"), the
 * unrendered seo.pages.plattform/bruksomrader blocks (published nowhere), and the survey's
 * own statements, which are the instrument rather than a claim about the law. Not yet covered,
 * because they are code or per-organisation data rather than text (D-130): the chapter 1A
 * coverage map and the BHT industry codes (components/oppsett/RegelverkTab.tsx, SelskapTab.tsx),
 * the Lovdata link targets (lib/marketing/lovdata.ts), the CRM e-mail templates
 * (app.crm_templates) and a measure's own law_ref.
 */

export type LegalLang = 'no' | 'en'
export const LEGAL_SECTIONS = ['industries', 'modules', 'documents', 'site', 'product', 'messages'] as const
export type LegalSection = (typeof LEGAL_SECTIONS)[number]

export type LegalLine = { path: string; text: string }
export type LegalUnit = {
  /** stable: the approval's key (0082's key rule) */
  key: string
  section: LegalSection
  /** a message key under admin.legal.unit for a message-based unit; else a literal title */
  title: { key: string; values?: Record<string, string> } | { text: string }
  lang: LegalLang
  /** where the text lives, for whoever edits it */
  source: string
  /** where a reader meets it: a path on the site, or a place in the app */
  where: string
  /** published now, in this language */
  live: boolean
  lines: LegalLine[]
  hash: string
  /** set when a path no longer resolves: the unit is shown as broken, never as approvable */
  missing?: string[]
}

const MESSAGES: Record<LegalLang, unknown> = { no, en }
const LANGS: LegalLang[] = ['no', 'en']

// ---------------------------------------------------------------- text and hash

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** The canonical text: every line under its path, in order. What is hashed is what is shown. */
export const canonical = (lines: LegalLine[]) => lines.map((l) => `${l.path}\n${l.text}`).join('\n\n')

/** `a.b[2].c` into its steps */
function steps(path: string): (string | number)[] {
  const out: (string | number)[] = []
  for (const part of path.split('.')) {
    const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(part)
    if (!m) return []
    out.push(m[1]!)
    for (const i of m[2]!.matchAll(/\[(\d+)\]/g)) out.push(Number(i[1]))
  }
  return out
}

function at(root: unknown, path: string): unknown {
  let v: unknown = root
  for (const s of steps(path)) {
    if (v === null || typeof v !== 'object') return undefined
    v = (v as Record<string | number, unknown>)[s]
  }
  return v
}

/** Every string under a value, with its full path, in document order */
function leaves(v: unknown, path: string, out: LegalLine[]): void {
  if (typeof v === 'string') {
    if (v.trim()) out.push({ path, text: v })
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => leaves(x, `${path}[${i}]`, out))
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) leaves(x, `${path}.${k}`, out)
  }
}

function unit(u: Omit<LegalUnit, 'hash'>): LegalUnit {
  return { ...u, hash: sha256(canonical(u.lines)) }
}

// ---------------------------------------------------------------- message-based units

type MessageSpec = {
  id: string
  section: LegalSection
  paths: string[]
  where: string
  /** published in a language; default: both */
  live?: (lang: LegalLang) => boolean
  /** a title naming the text by its own heading: admin.legal.unit.<key> with {title} from this path */
  title?: { key: string; from: string }
}

const industryLanding = (slug: IndustryPage['slug']) => (lang: LegalLang) => {
  // the landing page is what the address shows until the industry page launches in that language
  const page = pageIn(INDUSTRIES.find((i) => i.slug === slug) ?? null, lang)
  return !page?.launched
}

/**
 * The message files' legal text, as units. The paths come from a review of both files
 * (D-130); a path that stops resolving makes its unit broken, and tests/unit/legal-registry
 * fails, so a renamed key cannot quietly drop out of the review.
 */
export const MESSAGE_SPECS: MessageSpec[] = [
  // -------- the public site
  { id: 'lp.lovkrav', section: 'site', paths: ['seo.lp.lovkrav'], where: '/lovkrav' },
  { id: 'lp.verneombud', section: 'site', paths: ['seo.lp.verneombud'], where: '/verneombud' },
  { id: 'lp.smaaBedrifter', section: 'site', paths: ['seo.lp.smaaBedrifter'], where: '/smaa-bedrifter' },
  { id: 'lp.byggOgAnlegg', section: 'site', paths: ['seo.lp.byggOgAnlegg'], where: '/bygg-og-anlegg', live: industryLanding('bygg-og-anlegg') },
  { id: 'lp.helseOgOmsorg', section: 'site', paths: ['seo.lp.helseOgOmsorg'], where: '/helse-og-omsorg', live: industryLanding('helse-og-omsorg') },
  ...ARTICLES.map((a) => ({
    id: `article.${a.key}`,
    section: 'site' as const,
    paths: [`seo.articles.${a.key}`],
    where: `/artikler/${a.slug}`,
    title: { key: 'article', from: `seo.articles.${a.key}.title` },
  })),
  {
    id: 'site.hvorfor',
    section: 'site',
    paths: ['site.hvorfor.seoDescription', 'site.hvorfor.sections[3]', 'site.hvorfor.sections[5]', 'site.hvorfor.compare.rows[2]', 'site.hvorfor.compare.rows[6]', 'site.hvorfor.faq.items[5]'],
    where: '/hvorfor',
  },
  { id: 'site.bruksomrader', section: 'site', paths: ['site.bruksomrader.h1', 'site.bruksomrader.sections[0]', 'site.bruksomrader.sections[6]', 'site.bruksomrader.sections[7]'], where: '/bruksomrader' },
  {
    id: 'site.plattform',
    section: 'site',
    paths: ['site.plattform.rapport', 'site.plattform.resultater.rows', 'site.plattform.oppsett.cards[5]', 'site.plattform.assistent.d', 'site.plattform.respondent.points[0]', 'site.plattform.roller.d'],
    where: '/plattform',
  },
  {
    id: 'site.claims',
    section: 'site',
    paths: [
      'site.home.roles[0].get[2]', 'site.home.roles[3].get[2]', 'site.home.teasers[2].d', 'site.home.about.d',
      'site.chrome.footer.about', 'site.bransjer.lead', 'site.bransjer.other.d', 'seo.common.disclaimer', 'seo.common.anonymity', 'seo.common.priceLine',
      'seo.index.description', 'seo.index.lead', 'seo.pages.priser.blocks[2].items[1]', 'seo.pages.priser.faq[2]',
    ],
    where: '/, /bransjer, /priser, footer',
  },
  // -------- documents
  { id: 'doc.dpa', section: 'documents', paths: ['dpa'], where: 'app: Oppsett › Databehandleravtale' },
  { id: 'doc.privacy', section: 'documents', paths: ['seo.pages.personvernerklaering'], where: '/personvernerklaering' },
  { id: 'doc.security', section: 'documents', paths: ['seo.pages.sikkerhet'], where: '/sikkerhet' },
  { id: 'doc.personvernTab', section: 'documents', paths: ['oppsett.personvern'], where: 'app: Oppsett › Personvern' },
  // -------- in the product
  {
    id: 'app.report',
    section: 'product',
    paths: [
      'rapport.docLead', 'rapport.docTitle', 'rapport.audienceNote', 'rapport.instrumentBody', 'rapport.section4Empty',
      'rapport.section8EmptyInfo', 'rapport.register.lead', 'rapport.screeningRule', 'rapport.ansatteAnonymity',
      'rapport.gjennomforingBody', 'rapport.section7Withheld',
    ],
    where: 'app: Rapport (printed for Arbeidstilsynet, AMU, management, employees)',
  },
  { id: 'app.regelverk', section: 'product', paths: ['oppsett.regelverk'], where: 'app: Oppsett › Regelverk' },
  { id: 'app.duty', section: 'product', paths: ['oppsett.lead', 'oppsett.duty', 'oppsett.lovmodus', 'oppsett.ansatte.dutyNote'], where: 'app: Oppsett' },
  {
    id: 'app.maleoppsett',
    section: 'product',
    paths: [
      'maleoppsett.consentLead', 'maleoppsett.voLaw', 'maleoppsett.voNote', 'maleoppsett.tvLaw', 'maleoppsett.infoLaw',
      'maleoppsett.infoPurposeValue', 'maleoppsett.infoConsequenceValue', 'maleoppsett.infoDurationValue', 'maleoppsett.evalLaw', 'maleoppsett.summaryLegal',
      'maleoppsett.lead.grunnlinje', 'maleoppsett.kind.grunnlinje.note', 'maleoppsett.perRound.screening', 'maleoppsett.perRound.reasonNote',
    ],
    where: 'app: Måleoppsett',
  },
  ...['hvaLovenKrever', 'kontrolltiltak', 'rapportTilTilsynet', 'gdpr', 'hvaVilagrer'].map((k) => ({
    id: `help.${k}`,
    section: 'product' as const,
    paths: [`hjelp.article.${k}`],
    where: 'app: Hjelp',
    title: { key: 'help', from: `hjelp.article.${k}.title` },
  })),
  { id: 'app.assistant', section: 'product', paths: ['headerPanel.law'], where: 'app: the header panel, Arbeidsmiljøloven' },
  {
    id: 'app.claims',
    section: 'product',
    paths: [
      'malinger.qsLead', 'malinger.lead', 'malinger.innstillinger.screening', 'malinger.innstillinger.reasonNote',
      'arshjulet.cadence.minimum.label', 'arshjulet.cadence.minimum.note', 'arshjulet.audience.verneombud.note',
      'tiltak.lead', 'tiltak.kindNote.kollektivt', 'tiltak.kindNote.individuelt', 'kommentarer.varselNote',
      'veiviser.law.lead', 'veiviser.law.on.note', 'veiviser.law.off.note', 'veiviser.rhythm.preset.minimum.note',
      'veiviser.safety.duty', 'veiviser.safety.dutySmall', 'veiviser.safety.amuMust', 'veiviser.safety.amuMay',
      'oversikt.lawOk', 'oversikt.voLead', 'innsikt.loopHead', 'innsikt.lead.verneombud', 'arshjulet.lead', 'smsSetup.legal',
      'start.faq.inspection.q', 'start.faq.inspection.a',
      'registrer.incl.report',
    ],
    where: 'app: Målinger, Årshjul, Tiltak, Kommentarer, the wizard; /start',
  },
  {
    id: 'app.anonymity',
    section: 'product',
    paths: [
      'app.tagline', 'respond.promise1', 'respond.promise2', 'respond.promise3', 'respond.promise4', 'respond.doneLead',
      'respond.openNote', 'respond.keys.lead', 'respond.thread.lead', 'respond.thread.contact.body', 'respond.thread.contact.note',
      'respond.countLead', 'respond.segmentLead', 'entry.sentLead', 'entry.sentLeadEmail',
      'extra.apent_felt.note', 'entry.privacy', 'entry.lead', 'entry.leadEmail', 'malinger.plakat.anonymous',
      'malinger.privacy', 'malinger.innstillinger.qr.note', 'oppsett.roller.can.daglig_leder', 'innsikt.lead.avdelingsleder',
      'start.faq.anonymous.q', 'start.faq.anonymous.a', 'start.faq.twelve.a',
    ],
    where: 'the survey, the QR page and poster, the app, /start',
  },
  {
    id: 'app.terms',
    section: 'product',
    paths: [
      'oppsett.billing.terms', 'oppsett.billing.termsAfterTrial', 'oppsett.billing.cancel.leadPaying', 'oppsett.billing.cancel.leadTrial',
      'oppsett.billing.cancel.confirm', 'oppsett.billing.cancel.doneBody', 'access.cancelledBody', 'access.endedBody', 'start.faq.leaving.a',
    ],
    where: 'app: Oppsett › Betaling, the closed-account screens; /start',
  },
  // -------- messages that leave the product
  {
    id: 'mail.legal',
    section: 'messages',
    paths: ['mail.invitasjon.anonymous', 'mail.forvarsel.alle_ansatte', 'mail.forvarsel.verneombud', 'mail.sms', 'mail.lifecycle'],
    where: 'e-mail and SMS',
  },
  { id: 'mail.crm', section: 'messages', paths: ['mail.crm'], where: 'every newsletter and campaign e-mail' },
  { id: 'consent.newsletter', section: 'messages', paths: ['newsletter', 'unsubscribe'], where: '/nyhetsbrev, /kontakt, /avmeld' },
  { id: 'consent.signup', section: 'messages', paths: ['registrer.consent', 'registrer.googleHint'], where: '/registrer' },
]

function messageUnits(): LegalUnit[] {
  return MESSAGE_SPECS.flatMap((s) =>
    LANGS.map((lang) => {
      const lines: LegalLine[] = []
      const missing: string[] = []
      for (const p of s.paths) {
        const v = at(MESSAGES[lang], p)
        if (v === undefined) missing.push(p)
        else leaves(v, p, lines)
      }
      return unit({
        key: `msg:${lang}:${s.id}`,
        section: s.section,
        title: s.title
          ? { key: s.title.key, values: { title: String(at(MESSAGES[lang], s.title.from) ?? s.id) } }
          : { key: s.id },
        lang,
        source: `messages/${lang}.json › ${s.paths.join(', ')}`,
        where: s.where,
        live: s.live ? s.live(lang) : true,
        lines,
        ...(missing.length ? { missing } : {}),
      })
    }),
  )
}

// ---------------------------------------------------------------- industry pages

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function industryUnits(): LegalUnit[] {
  return INDUSTRIES.flatMap((entry) =>
    LANGS.flatMap((lang) => {
      const page = pageIn(entry, lang)
      if (!page) return []
      const file = `content/industries/${entry.slug}${lang === 'en' ? '.en' : ''}.ts`
      const where = `/${entry.slug}${lang === 'en' ? ' (en.orgpuls.com)' : ''}`
      const base = `industry:${entry.slug}:${lang}`
      const seen = new Set<string>()
      const law = page.law.items.map((l, i) => {
        let id = slugOf(l.ref) || String(i)
        if (seen.has(id)) id = `${id}-${i}`
        seen.add(id)
        return unit({
          key: `${base}:law:${id}`,
          section: 'industries',
          title: { text: `${page.navLabel} · ${l.ref}` },
          lang,
          source: `${file} › law.items[${i}]`,
          where,
          live: page.launched,
          lines: [
            { path: `law.items[${i}].ref`, text: l.ref },
            { path: `law.items[${i}].text`, text: l.text },
          ],
        })
      })
      const intro = unit({
        key: `${base}:law-intro`,
        section: 'industries',
        title: { key: 'industry.lawIntro', values: { page: page.navLabel } },
        lang,
        source: `${file} › law.title, law.intro`,
        where,
        live: page.launched,
        lines: [
          { path: 'law.title', text: page.law.title },
          { path: 'law.intro', text: page.law.intro },
        ],
      })
      // the page's other promises: the threshold note, the challenges (which cite law), the FAQ and
      // the question page's rules — one unit, as a reviewer reads the page
      const other: LegalLine[] = [{ path: 'hero.thresholdNote', text: page.hero.thresholdNote }]
      page.challenges.forEach((c, i) => other.push({ path: `challenges[${i}].body`, text: c.body }))
      page.faq.forEach((f, i) => {
        other.push({ path: `faq[${i}].q`, text: f.q }, { path: `faq[${i}].a`, text: f.a })
        if (f.more) other.push({ path: `faq[${i}].more`, text: f.more.text })
      })
      if (page.questionPage) {
        other.push({ path: 'questionPage.lead', text: page.questionPage.lead })
        page.questionPage.rules.forEach((r, i) =>
          other.push({ path: `questionPage.rules[${i}].title`, text: r.title }, { path: `questionPage.rules[${i}].text`, text: r.text }),
        )
      }
      const claims = unit({
        key: `${base}:claims`,
        section: 'industries',
        title: { key: 'industry.claims', values: { page: page.navLabel } },
        lang,
        source: `${file} › hero.thresholdNote, challenges, faq, questionPage`,
        where: `${where}, /${entry.slug}/sporsmal`,
        live: page.launched,
        lines: other,
      })
      return [...law, intro, claims]
    }),
  )
}

// ---------------------------------------------------------------- module files

function moduleUnits(): LegalUnit[] {
  return MODULE_VERSIONS.flatMap((kv) => {
    const [key, version] = kv.split('@') as [string, string]
    return LANGS.flatMap((lang) => {
      const m = moduleFile(key, version, lang)
      // a module without an English translation reads Norwegian in English: nothing to review twice
      if (lang === 'en' && !moduleFile(key, version).translations?.en) return []
      const live = INDUSTRIES.some((i) => pageIn(i, lang)?.module?.key === key && pageIn(i, lang)?.launched)
      return m.factors.map((f) =>
        unit({
          key: `module:${kv}:${lang}:${f.id}`,
          section: 'modules',
          title: { text: `${m.name} · ${f.name}` },
          lang,
          source: `modules/${key}/v${version.split('.')[0]}.json › factors[${f.id}]${lang === 'en' ? ' (translations.en)' : ''}`,
          where: live ? `/${INDUSTRIES.find((i) => pageIn(i, lang)?.module?.key === key)?.slug}/sporsmal, the report` : 'the report, when an organisation asks the module',
          live: true,
          lines: [
            ...f.legal_basis.map((b, i) => ({ path: `legal_basis[${i}]`, text: b })),
            { path: 'rationale', text: f.rationale },
          ],
        }),
      )
    })
  })
}

// ---------------------------------------------------------------- the terms draft and the instrument

const TERMS_DRAFT = 'docs/legal/vilkar-utkast.md'

function termsUnit(): LegalUnit[] {
  let text: string
  try {
    text = readFileSync(join(process.cwd(), TERMS_DRAFT), 'utf8')
  } catch {
    return [unit({ key: 'doc:terms-draft:no', section: 'documents', title: { key: 'doc.termsDraft' }, lang: 'no', source: TERMS_DRAFT, where: '–', live: false, lines: [], missing: [TERMS_DRAFT] })]
  }
  // one line per paragraph, so a long document reads as it is written
  const lines = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => ({ path: `¶${i + 1}`, text: p }))
  return [unit({ key: 'doc:terms-draft:no', section: 'documents', title: { key: 'doc.termsDraft' }, lang: 'no', source: TERMS_DRAFT, where: '–', live: false, lines })]
}

/** The instrument's law references (app.factors.law_ref): language-independent, from the database */
function instrumentUnit(factors: { key: string; lawRef: string }[]): LegalUnit[] {
  return [
    unit({
      key: 'db:no:factors.law_ref',
      section: 'product',
      title: { key: 'app.instrument' },
      lang: 'no',
      source: 'app.factors.law_ref (supabase/migrations/0002_instrument.sql)',
      where: 'app: Rapport, Målinger › Spørsmålssett, Tiltak',
      live: true,
      lines: factors.map((f) => ({ path: `factor.${f.key}`, text: f.lawRef })),
    }),
  ]
}

// ---------------------------------------------------------------- all of it

/** Every legal text, in section order. `factors` is the instrument as the database has it. */
export function legalUnits(factors: { key: string; lawRef: string }[]): LegalUnit[] {
  const all = [...industryUnits(), ...moduleUnits(), ...termsUnit(), ...messageUnits(), ...instrumentUnit(factors)]
  return LEGAL_SECTIONS.flatMap((s) => all.filter((u) => u.section === s))
}

/** The DPA's version in force and its own hash (lib/legal/dpa.ts), shown beside the DPA unit */
export const DPA_IN_FORCE = { version: DPA_VERSION, sha256: DPA_SHA256 }
