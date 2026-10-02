import 'server-only'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { INDUSTRIES, pageIn } from '@/content/industries'
import { MODULE_KEYS, moduleFile, moduleSource } from '@/content/industries/modules'
import type { IndustryPage } from '@/content/industries/types'
import { LOCALES, type Locale } from '@/lib/i18n/locales'
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
 * because they are rules in code or one organisation's own data rather than text (D-130): the
 * chapter 1A coverage map and the BHT industry codes (components/oppsett/RegelverkTab.tsx,
 * SelskapTab.tsx), the Lovdata link targets (lib/marketing/lovdata.ts), and a measure's own
 * law_ref. The CRM's platform-wide templates and lists are read from the database, as the
 * instrument's law references are.
 */

export type LegalLang = Locale
export const LEGAL_SECTIONS = ['industries', 'modules', 'documents', 'site', 'product', 'messages'] as const
export type LegalSection = (typeof LEGAL_SECTIONS)[number]

export type LegalLine = { path: string; text: string }
export type Msg = { key: string; values?: Record<string, string> }
/** a place on the site, by its path */
const onSite = (path: string): Msg => ({ key: 'path', values: { path } })
/** a place in the product or a kind of message: its own message key */
const place = (key: string): Msg => ({ key })
export type LegalUnit = {
  /** stable: the approval's key (0082's key rule) */
  key: string
  section: LegalSection
  /** a message key under admin.legal.unit, with the names it quotes */
  title: Msg
  lang: LegalLang
  /** where the text lives, for whoever edits it */
  source: string
  /** where a reader meets it: a message key under admin.legal.whereAt, with the path it names */
  where: Msg
  /** published now, in this language */
  live: boolean
  lines: LegalLine[]
  hash: string
  /** set when a path no longer resolves: the unit is shown as broken, never as approvable */
  missing?: string[]
}

const MESSAGES: Record<LegalLang, unknown> = { no, en }
const LANGS: LegalLang[] = [...LOCALES]

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
  // no text is not a text: a source that yielded nothing (a failed read, an empty file) is broken,
  // never an approvable empty unit
  const missing = u.missing ?? (u.lines.length === 0 ? [u.source] : undefined)
  return { ...u, ...(missing ? { missing } : {}), hash: sha256(canonical(u.lines)) }
}

// ---------------------------------------------------------------- message-based units

type MessageSpec = {
  id: string
  section: LegalSection
  paths: string[]
  where: Msg
  /** published in a language; default: both */
  live?: (lang: LegalLang) => boolean
  /** the languages it exists in; default: both. The admin app is English in either file (D-90) */
  langs?: readonly LegalLang[]
  /** a title naming the text by its own heading: admin.legal.unit.<key> with {title} from this path */
  title?: { key: string; from: string }
}

const industryLanding = (slug: IndustryPage['slug']) => (lang: LegalLang) => {
  // the landing page is what the address shows until the industry page launches in that language
  const page = pageIn(INDUSTRIES.find((i) => i.slug === slug) ?? null, lang)
  return !page?.launched
}

/** Text that states law or a legal duty: what makes a help article a legal text */
export const STATES_LAW = /§|\blov|forskrift|GDPR|personvern|personopplysning|Arbeidstilsynet|verneombud|Working Environment Act|regulation|data protection/i

/** Every help article that states law, in either language, read from the data rather than listed */
function helpWithLaw(): string[] {
  const articles = (lang: LegalLang) => (at(MESSAGES[lang], 'hjelp.article') ?? {}) as Record<string, unknown>
  return Object.keys(articles('no')).filter((k) =>
    LANGS.some((lang) => {
      const lines: LegalLine[] = []
      leaves(articles(lang)[k], k, lines)
      return lines.some((l) => STATES_LAW.test(l.text))
    }),
  )
}

/**
 * The message files' legal text, as units. The paths come from a review of both files
 * (D-130); a path that stops resolving makes its unit broken, and tests/unit/legal-registry
 * fails, so a renamed key cannot quietly drop out of the review.
 */
export const MESSAGE_SPECS: MessageSpec[] = [
  // -------- the public site
  { id: 'lp.lovkrav', section: 'site', paths: ['seo.lp.lovkrav'], where: onSite('/lovkrav') },
  { id: 'lp.verneombud', section: 'site', paths: ['seo.lp.verneombud'], where: onSite('/verneombud') },
  { id: 'lp.smaaBedrifter', section: 'site', paths: ['seo.lp.smaaBedrifter'], where: onSite('/smaa-bedrifter') },
  { id: 'lp.byggOgAnlegg', section: 'site', paths: ['seo.lp.byggOgAnlegg'], where: onSite('/bygg-og-anlegg'), live: industryLanding('bygg-og-anlegg') },
  { id: 'lp.helseOgOmsorg', section: 'site', paths: ['seo.lp.helseOgOmsorg'], where: onSite('/helse-og-omsorg'), live: industryLanding('helse-og-omsorg') },
  ...ARTICLES.map((a) => ({
    id: `article.${a.key}`,
    section: 'site' as const,
    paths: [`seo.articles.${a.key}`],
    where: onSite(`/artikler/${a.slug}`),
    title: { key: 'article', from: `seo.articles.${a.key}.title` },
  })),
  {
    id: 'site.hvorfor',
    section: 'site',
    paths: ['site.hvorfor.seoDescription', 'site.hvorfor.sections[3]', 'site.hvorfor.sections[5]', 'site.hvorfor.compare.rows[2]', 'site.hvorfor.compare.rows[6]', 'site.hvorfor.faq.items[5]'],
    where: onSite('/hvorfor'),
  },
  { id: 'site.bruksomrader', section: 'site', paths: ['site.bruksomrader.h1', 'site.bruksomrader.sections[0]', 'site.bruksomrader.sections[6]', 'site.bruksomrader.sections[7]'], where: onSite('/bruksomrader') },
  {
    id: 'site.plattform',
    section: 'site',
    paths: ['site.plattform.rapport', 'site.plattform.resultater.ticks[2]', 'site.plattform.resultater.rows', 'site.plattform.oppsett.ticks[2]', 'site.plattform.respondent.ticks[0]', 'site.plattform.roller.p'],
    where: onSite('/plattform'),
  },
  {
    id: 'site.claims',
    section: 'site',
    paths: [
      'site.home.roles[0].get[2]', 'site.home.roles[3].get[2]', 'site.home.teasers[2].d', 'site.home.about.d',
      'site.chrome.footer.about', 'site.bransjer.lead', 'site.bransjer.other.d', 'seo.common.disclaimer', 'seo.common.anonymity', 'seo.common.priceLine',
      // the hero's risk line and trust strip (D-187)
      'site.chrome.risk', 'site.chrome.trust.eu', 'site.chrome.trust.k', 'site.chrome.trust.qps', 'site.chrome.trust.law',
      'seo.index.description', 'seo.index.lead', 'seo.pages.priser.blocks[2].items[1]', 'seo.pages.priser.faq[2]',
      // the pills on every share card (scripts/marketing/og-images.mjs), in Norwegian on both hosts
      'seo.og.pills', 'seo.home.showcase.samtaler.body', 'seo.home.showcase.varmekart.body',
    ],
    where: place('siteClaims'),
  },
  {
    id: 'site.terms',
    section: 'site',
    paths: ['seo.pages.priser.description', 'seo.pages.priser.lead', 'seo.pages.priser.faq[0]', 'seo.pages.priser.faq[1]', 'seo.pages.priser.blocks[2].items[4]', 'site.home.price.d', 'site.chrome.band.lead', 'site.chrome.band.leadHome'],
    where: place('prices'),
  },
  // -------- documents
  { id: 'doc.dpa', section: 'documents', paths: ['dpa'], where: place('dpaTab') },
  // what the signer confirms and the copy prints: when the agreement binds, and on whose authority
  {
    id: 'doc.dpaSigning',
    section: 'documents',
    paths: ['oppsett.dpa.unsignedBody', 'oppsett.dpa.processorLine', 'oppsett.dpa.form.confirm', 'oppsett.dpa.signatureLine'],
    where: place('dpaTab'),
  },
  { id: 'doc.privacy', section: 'documents', paths: ['seo.pages.personvernerklaering'], where: onSite('/personvernerklaering') },
  { id: 'doc.security', section: 'documents', paths: ['seo.pages.sikkerhet'], where: onSite('/sikkerhet') },
  { id: 'doc.personvernTab', section: 'documents', paths: ['oppsett.personvern'], where: place('personvernTab') },
  // -------- in the product
  {
    id: 'app.report',
    section: 'product',
    paths: [
      'rapport.docLead', 'rapport.docTitle', 'rapport.audienceNote', 'rapport.instrumentBody', 'rapport.section4Empty',
      'rapport.section8EmptyInfo', 'rapport.register.lead', 'rapport.screeningRule', 'rapport.ansatteAnonymity',
      'rapport.gjennomforingBody', 'rapport.section7Withheld', 'rapport.evaluation.cadence',
    ],
    where: place('report'),
  },
  { id: 'app.regelverk', section: 'product', paths: ['oppsett.regelverk'], where: place('regelverk') },
  { id: 'app.duty', section: 'product', paths: ['oppsett.lead', 'oppsett.duty', 'oppsett.lovmodus', 'oppsett.ansatte.dutyNote'], where: place('oppsett') },
  {
    id: 'app.maleoppsett',
    section: 'product',
    paths: [
      'maleoppsett.consentLead', 'maleoppsett.voLaw', 'maleoppsett.voNote', 'maleoppsett.tvLaw', 'maleoppsett.infoLaw',
      'maleoppsett.infoPurposeValue', 'maleoppsett.infoConsequenceValue', 'maleoppsett.infoDurationValue', 'maleoppsett.evalLaw', 'maleoppsett.summaryLegal',
      'maleoppsett.lead.grunnlinje', 'maleoppsett.kind.grunnlinje.note', 'maleoppsett.perRound.screening', 'maleoppsett.perRound.reasonNote',
    ],
    where: place('maleoppsett'),
  },
  ...helpWithLaw().map((k) => ({
    id: `help.${k}`,
    section: 'product' as const,
    paths: [`hjelp.article.${k}`],
    where: place('help'),
    title: { key: 'help', from: `hjelp.article.${k}.title` },
  })),
  {
    id: 'app.assistant',
    section: 'product',
    // the law tab, and the screen texts beside it that state law or a legal duty
    paths: ['headerPanel.law', 'headerPanel.screen.measure.s1', 'headerPanel.screen.settings.sci', 'headerPanel.screen.wheel.s2', 'headerPanel.screen.tasks.sci'],
    where: place('assistant'),
  },
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
      'start.faq.inspection.q', 'start.faq.inspection.a', 'registrer.todo.send.note', 'playbook.kontakt.ev',
      'registrer.incl.report',
    ],
    where: place('appClaims'),
  },
  {
    id: 'app.anonymity',
    section: 'product',
    paths: [
      'app.tagline', 'auth.respondentBody', 'respond.commentPrompt', 'respond.promise1', 'respond.promise2', 'respond.promise3', 'respond.promise4', 'respond.doneLead',
      'respond.openNote', 'respond.keys.lead', 'respond.thread.lead', 'respond.thread.contact.body', 'respond.thread.contact.note',
      'respond.countLead', 'respond.segmentLead', 'entry.sentLead', 'entry.sentLeadEmail',
      'extra.apent_felt.note', 'entry.privacy', 'entry.lead', 'entry.leadEmail', 'malinger.plakat.anonymous',
      'malinger.privacy', 'malinger.innstillinger.qr.note', 'oppsett.roller.can.daglig_leder', 'innsikt.lead.avdelingsleder',
      'start.faq.anonymous.q', 'start.faq.anonymous.a', 'start.faq.twelve.a', 'integrasjoner.privacyNote',
      'oppsett.integrasjoner.epost.what', 'oppsett.integrasjoner.epost.whatOn', 'resultater.module.countLead',
    ],
    where: place('anonymity'),
  },
  {
    id: 'app.terms',
    section: 'product',
    paths: [
      'oppsett.billing.terms', 'oppsett.billing.termsAfterTrial', 'oppsett.billing.trialBody', 'oppsett.billing.cancel.leadPaying', 'oppsett.billing.cancel.leadTrial',
      'oppsett.billing.cancel.confirm', 'oppsett.billing.cancel.doneBody', 'access.cancelledBody', 'access.endedBody', 'start.faq.leaving.a',
    ],
    where: place('billing'),
  },
  // -------- messages that leave the product
  {
    id: 'mail.legal',
    section: 'messages',
    paths: ['mail.invitasjon.anonymous', 'mail.forvarsel.alle_ansatte', 'mail.forvarsel.verneombud', 'mail.sms', 'mail.lifecycle', 'mail.ticket.footer', 'mail.evaluering'],
    where: place('mail'),
  },
  { id: 'mail.crm', section: 'messages', paths: ['mail.crm'], where: place('crm') },
  { id: 'consent.newsletter', section: 'messages', paths: ['newsletter', 'unsubscribe', 'mail.optin'], where: place('newsletter') },
  { id: 'consent.signup', section: 'messages', paths: ['registrer.consent', 'registrer.googleHint'], where: onSite('/registrer') },
  // the team's own reading of the law it mails on: who may be mailed without consent
  { id: 'admin.crmBasis', section: 'messages', paths: ['admin.crm.settings.lead', 'admin.crm.settings.on'], where: place('crmSettings'), langs: ['en'] },
]

function messageUnits(messages: Record<LegalLang, unknown> = MESSAGES): LegalUnit[] {
  return MESSAGE_SPECS.flatMap((s) =>
    (s.langs ?? LANGS).map((lang) => {
      const lines: LegalLine[] = []
      const missing: string[] = []
      for (const p of s.paths) {
        const v = at(messages[lang], p)
        if (v === undefined) missing.push(p)
        else leaves(v, p, lines)
      }
      return unit({
        key: `msg:${lang}:${s.id}`,
        section: s.section,
        title: s.title
          ? { key: s.title.key, values: { title: String(at(messages[lang], s.title.from) ?? s.id) } }
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
      const where: Msg = { key: lang === 'en' ? 'industryEn' : 'path', values: { path: `/${entry.slug}` } }
      const base = `industry:${entry.slug}:${lang}`
      const seen = new Set<string>()
      const law = page.law.items.map((l, i) => {
        // keyed by the reference, so reordering the items keeps each approval; a second item with
        // the same reference gets the next free suffix
        const root = slugOf(l.ref) || 'item'
        let id = root
        for (let n = 2; seen.has(id); n++) id = `${root}-${n}`
        seen.add(id)
        return unit({
          key: `${base}:law:${id}`,
          section: 'industries',
          title: { key: 'industry.lawItem', values: { page: page.navLabel, ref: l.ref } },
          lang,
          source: `${file} › law.items[${i}]`,
          where,
          live: page.launched,
          // the hashed paths carry no position (it is in `source`), so moving an item is not a change
          lines: [
            { path: 'law.ref', text: l.ref },
            { path: 'law.text', text: l.text },
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
        where: { key: lang === 'en' ? 'industryQuestionsEn' : 'industryQuestions', values: { path: `/${entry.slug}` } },
        live: page.launched,
        lines: other,
      })
      return [...law, intro, claims]
    }),
  )
}

// ---------------------------------------------------------------- module files

function moduleUnits(published: ReadonlySet<string>): LegalUnit[] {
  return MODULE_KEYS.flatMap((key) => {
    return LANGS.flatMap((lang) => {
      const m = moduleFile(key, lang)
      // a module without an English translation reads Norwegian in English: nothing to review twice
      if (lang === 'en' && !moduleFile(key).translations?.en) return []
      const onPage = (i: (typeof INDUSTRIES)[number]) => pageIn(i, lang)?.module?.key === key
      const live = INDUSTRIES.some((i) => onPage(i) && pageIn(i, lang)?.launched)
      const factors = m.factors.map((f) =>
        unit({
          // keyed by the module, not its version (X-096): a new version keeps the review of what it did not change
          key: `module:${key}:${lang}:${f.id}`,
          section: 'modules',
          title: { key: 'module.factor', values: { module: m.name, factor: f.name } },
          lang,
          source: `${moduleSource(key)} › factors[${f.id}]${lang === 'en' ? ' (translations.en)' : ''}`,
          where: live
            ? { key: 'moduleOnSite', values: { path: `/${INDUSTRIES.find(onPage)?.slug}/sporsmal` } }
            : place('moduleInReport'),
          // published in the database is what reaches a customer's survey and report
          live: published.has(key),
          lines: [
            ...f.legal_basis.map((b, i) => ({ path: `legal_basis[${i}]`, text: b })),
            { path: 'rationale', text: f.rationale },
          ],
        }),
      )
      // the sources a module cites for its claims, listed under «Kilder» on its page (Norwegian titles)
      if (lang === 'en') return factors
      return [
        ...factors,
        unit({
          key: `module:${key}:no:sources`,
          section: 'modules',
          title: { key: 'module.sources', values: { module: m.name } },
          lang: 'no',
          source: `${moduleSource(key)} › sources`,
          where: place('moduleSources'),
          live: published.has(key),
          lines: m.sources.map((x) => ({ path: `sources.${x.key}`, text: `${x.title}\n${x.url}` })),
        }),
      ]
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
    return [unit({ key: 'doc:terms-draft:no', section: 'documents', title: { key: 'doc.termsDraft' }, lang: 'no', source: TERMS_DRAFT, where: place('unpublished'), live: false, lines: [], missing: [TERMS_DRAFT] })]
  }
  // one line per paragraph, so a long document reads as it is written
  const lines = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => ({ path: `¶${i + 1}`, text: p }))
  return [unit({ key: 'doc:terms-draft:no', section: 'documents', title: { key: 'doc.termsDraft' }, lang: 'no', source: TERMS_DRAFT, where: place('unpublished'), live: false, lines })]
}

/** The instrument's law references (app.factors.law_ref): language-independent, from the database */
function instrumentUnit(factors: { key: string; lawRef: string }[] | null): LegalUnit[] {
  // null: the read failed, and the page says so (lib/legal/inputs.ts)
  if (!factors) return []
  return [
    unit({
      key: 'db:no:factors.law_ref',
      section: 'product',
      title: { key: 'app.instrument' },
      lang: 'no',
      source: 'app.factors.law_ref (supabase/migrations/0002_instrument.sql)',
      where: place('instrument'),
      live: true,
      lines: factors.map((f) => ({ path: `factor.${f.key}`, text: f.lawRef })),
    }),
  ]
}

// ---------------------------------------------------------------- all of it

/** The CRM's platform-wide e-mail templates and consent lists (0055, 0056), from the database */
export type CrmTemplate = { key: string; name: string; subject: string; preheader: string; blocks: unknown[] }
export type CrmList = { key: string; name_no: string; name_en: string; description_no: string; description_en: string; public: boolean; archived: boolean }

function crmUnits(templates: CrmTemplate[] | null, lists: CrmList[] | null): LegalUnit[] {
  const out: LegalUnit[] = []
  if (templates) {
    for (const x of templates) {
      const lines: LegalLine[] = [
        { path: 'subject', text: x.subject },
        { path: 'preheader', text: x.preheader },
      ]
      leaves(x.blocks, 'blocks', lines)
      out.push(
        unit({
          key: `db:no:crm_template:${x.key}`,
          section: 'messages',
          title: { key: 'crm.template', values: { name: x.name } },
          lang: 'no',
          source: `app.crm_templates › ${x.key}`,
          where: place('crmTemplate'),
          live: true,
          lines: lines.filter((l) => l.text.trim()),
        }),
      )
    }
  }
  // every list archived, or none yet, is a real state rather than a broken source: nothing to review
  const shown = lists?.filter((l) => !l.archived) ?? []
  if (shown.length) {
    for (const lang of LANGS) {
      out.push(
        unit({
          key: `db:${lang}:crm_lists`,
          section: 'messages',
          title: { key: 'crm.lists' },
          lang,
          source: 'app.crm_lists',
          where: place('newsletter'),
          live: shown.some((l) => l.public),
          lines: shown.flatMap((l) => [
            { path: `${l.key}.name`, text: lang === 'en' ? l.name_en : l.name_no },
            { path: `${l.key}.description`, text: lang === 'en' ? l.description_en : l.description_no },
          ]),
        }),
      )
    }
  }
  return out
}

/** What the registry reads from the database, loaded by lib/legal/inputs.ts for the page and the action alike */
export type LegalInputs = {
  /** null when the read failed: the instrument's unit is then absent, and the page says so */
  factors: { key: string; lawRef: string }[] | null
  /** modules with a version published in the database, by key: whether a module's texts are live */
  publishedModules?: ReadonlySet<string>
  /** null when the read failed: those units are then absent, and the page says so */
  crmTemplates?: CrmTemplate[] | null
  crmLists?: CrmList[] | null
  /** the message files as shown, with their approved overrides (0101); the files alone when absent */
  messages?: Record<LegalLang, unknown>
}

/** Every legal text, in section order. */
export function legalUnits(input: LegalInputs | NonNullable<LegalInputs['factors']>): LegalUnit[] {
  const i: LegalInputs = Array.isArray(input) ? { factors: input } : input
  const all = [
    ...industryUnits(),
    ...moduleUnits(i.publishedModules ?? new Set()),
    ...termsUnit(),
    ...messageUnits(i.messages),
    ...instrumentUnit(i.factors),
    ...crmUnits(i.crmTemplates ?? null, i.crmLists ?? null),
  ]
  return LEGAL_SECTIONS.flatMap((s) => all.filter((u) => u.section === s))
}

/** The DPA's version in force and its own hash (lib/legal/dpa.ts), shown beside the DPA unit */
export const DPA_IN_FORCE = { version: DPA_VERSION, sha256: DPA_SHA256 }
