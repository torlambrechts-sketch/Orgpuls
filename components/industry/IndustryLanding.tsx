import type { Route } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { keep } from '@/components/marketing/Diagrams'
import { IndustryArt } from '@/components/marketing/art/IndustryArt'
import { RiskIcon } from './RiskIcon'
import { TemplateTeaser } from '@/components/marketing/TemplateTeaser'
import { Tick } from '@/components/site/parts'
import { SiteTop } from '@/components/site/v3/SiteTop'
import { StartBand } from '@/components/site/v3/StartBand'
import { Faq } from '@/components/site/v3/pris/Faq'
import type { IndustryLanding as Landing } from '@/content/industries/landing'
import { liveQuestionPages } from '@/content/industries'
import { moduleFacts, moduleFile, simplifiedFactors } from '@/content/industries/modules'
import { ARTICLES } from '@/lib/marketing/site'
import { SHOTS } from '@/lib/marketing/shots'
import type { ShotId } from '@/lib/marketing/shot-ids'

/**
 * The industry page (D-207), written as an article about the industry (D-240), drawn from its registry
 * entry (content/industries/landing.ts) and its messages (`site.bransje.<msg>`, `site.bransje.common`).
 * Every block is a v3 pattern, at the v3 values:
 *
 *   hero ............ the mint band (crumbs, ink eyebrow, 56px H1), a link down to Orgpuls, and the
 *                     industry's drawing (IndustryArt)
 *   tallene ......... Forside's ink band in one compact row: heading and lead, four figures, the note
 *   sammenlignet .... the industry beside all employed, a bar pair per measure
 *   utfordringer .... a card per challenge, four across: icon (RiskIcon), key figure, provisions,
 *                     and the situation, finding and law folded out; an audience label where a
 *                     challenge concerns one (barnehage og skole, D-211)
 *   hvorfor ......... Forside slide 2's law card (✓ rows), beside r20 cards
 *   orgpuls ......... what Orgpuls does for the industry: the product picture and tiles, how each
 *                     challenge is measured, the question page in each wording (D-211)
 *   varianter ....... only for a module in two variants (D-212): both sets in r20 cards
 *   slik ser det ut . Plattform's zigzag cases with a real screen in the browser frame
 *   steg ............ Forside's Sløyfen pillars
 *   anonymitet ...... ✓ rows in an r24 panel
 *   spørsmål ........ Pris' FAQ
 *   kom i gang ...... the shared start band
 *
 * Every figure carries a numbered marker to the source list at the foot (#kilde-<key>); the
 * registry, not the words, says which source, so the numbers cannot drift from the figures.
 */
const Str = z.string()
const Item = z.object({ t: Str, d: Str })
const Stat = z.object({ v: Str, l: Str })
const LawRow = z.object({ ref: Str, t: Str })
const Challenge = z.object({
  t: Str,
  looks: Str,
  fig: Str,
  solve: Str,
  law: Str,
  v: Str.optional(),
  vl: Str,
  ref: Str,
})
const CompareWords = z.object({
  k: Str,
  title: Str,
  lead: Str,
  industry: Str,
  all: Str,
  items: z.array(Str),
  groups: z.record(Str, Str).optional(),
  units: z.record(Str, Str).optional(),
})
const OrgpulsWords = z.object({ k: Str, title: Str, lead: Str, measures: Str })
const Block = z.object({ k: Str, h3: Str, ticks: z.array(Str).min(1), caption: Str })
const Qa = z.object({ q: Str, a: Str })
const WordingWords = z.object({ k: Str, title: Str, lead: Str, begge: Str, example: Str, items: z.record(Str, z.object({ t: Str, link: Str })) })

const COLUMN = 'mx-auto w-full max-w-[1240px] px-[56px] max-sm:px-[16px]'
const EYEBROW = 'text-[11px] font-bold uppercase tracking-[.12em]'
const H2 =
  'm-0 font-display text-[38px] font-semibold leading-[1.1] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[30px] max-sm:leading-[1.12]'
const LEAD = 'm-0 text-[16px] leading-[1.65] text-body [text-wrap:pretty]'
const SHOT_SHADOW = 'shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)]'

export async function IndustryLanding({ landing, lang }: { landing: Landing; lang: 'no' | 'en' }) {
  const [t, common, chrome, all] = await Promise.all([
    getTranslations(`site.bransje.${landing.msg}`),
    getTranslations('site.bransje.common'),
    getTranslations('site.chrome'),
    getTranslations(),
  ])
  const mod = moduleFile(landing.module, lang)
  const facts = moduleFacts(mod)
  const fmt = (s: string) => s.replace('{factors}', facts.factors).replace('{statements}', facts.statements).replace('{minutes}', facts.minutes)

  const tiles = z.array(Item).length(3).parse(t.raw('hero.tiles'))
  const stats = z.array(Stat).length(landing.stats.items.length).parse(t.raw('stats.items'))
  const law = z.array(LawRow).min(1).parse(t.raw('why.law.rows'))
  const cost = z.array(Str).length(landing.why.costCites.length).parse(t.raw('why.cost.items'))
  const challenges = z.array(Challenge).length(landing.challenges.length).parse(t.raw('challenges.items'))
  const blocks = z.array(Block).length(landing.proof.length).parse(t.raw('proof.blocks'))
  const steps = z.array(Item).min(3).parse(t.raw('steps.items'))
  const trust = z.array(Item).min(1).parse(t.raw('trust.items'))
  const faq = z.array(Qa).length(landing.faqCount).parse(t.raw('faq.items'))
  const moduleNames = z.record(Str, Str).parse(t.raw('moduleFactors'))
  const audiences = landing.challenges.some((c) => c.audience) ? z.record(Str, Str).parse(t.raw('audience')) : {}
  // the page as an article (D-240): the industry first, Orgpuls in a section of its own at the foot
  const article = landing.article
  const compare = CompareWords.parse(t.raw('compare'))
  const orgpuls = OrgpulsWords.parse(t.raw('orgpuls'))
  if (
    compare.items.length !== article.compare.length ||
    article.lawCites.length !== challenges.length ||
    article.icons.length !== challenges.length ||
    article.figCites.length !== challenges.length
  )
    throw new Error(`${landing.slug}: the article's messages and registry differ`)

  const number = new Map(landing.sources.map((s, i) => [s.key, i + 1]))
  const cites = (keys: string[], tone: 'ink' | 'cream' = 'ink') =>
    keys.length ? (
      <sup className="ml-[2px] whitespace-nowrap leading-none">
        {keys.map((k, j) => (
          <Fragment key={k}>
            {j ? ',' : null}
            <a
              href={`#kilde-${k}`}
              aria-label={common('sourceMark', { n: number.get(k) ?? 0 })}
              className={`px-[1px] text-[11px] font-bold no-underline hover:underline ${tone === 'cream' ? 'text-bg hover:text-bg' : 'text-link'}`}
            >
              {number.get(k)}
            </a>
          </Fragment>
        ))}
      </sup>
    ) : null

  const articles = landing.articles.flatMap((slug) => {
    const a = ARTICLES.find((x) => x.slug === slug)
    return a ? [{ href: `/artikler/${slug}`, label: all(`seo.articles.${a.key}.h1`) }] : []
  })
  // the question page exists in a language only where the industry's page there is launched (D-118);
  // it is drawn from the content file, so an English one follows from the module's translation (D-120)
  const questionPage = liveQuestionPages(lang).includes(landing.slug)
  const related = [...landing.related.map((r) => ({ href: r.href, label: t(`related.${r.key}`) })), ...articles].filter(
    (r) => questionPage || r.href !== `/${landing.slug}/sporsmal`,
  )
  const hero = SHOTS[landing.heroShot].img
  // a worded module (D-211): the question page in each wording but the file's default («begge»),
  // each shown by the registry's example statement as that wording says it
  const example = landing.wording && mod.factors.flatMap((f) => f.items).find((i) => i.id === landing.wording?.example)
  const wordingWords = landing.wording && mod.wording && example?.text_variants && questionPage ? WordingWords.parse(t.raw('wording')) : null
  const wordings =
    wordingWords && mod.wording ? mod.wording.modes.filter((w): w is 'barnehage' | 'skole' => w !== 'begge' && w !== mod.wording?.default) : []

  // the product's picture and the module's tiles, in the Orgpuls section (D-240)
  const phoneFigure = (
    <figure className="m-0 min-w-0" aria-labelledby="hero-shot-title">
      <div
        className={`mx-auto max-w-[420px] rounded-card border border-line bg-sf px-[24px] py-[22px] ${SHOT_SHADOW} max-sm:px-[16px] max-sm:py-[18px]`}
      >
        <div className="mb-[16px] flex flex-wrap items-baseline justify-between gap-x-[12px] gap-y-[6px]">
          <span id="hero-shot-title" className="text-[15px] font-bold">
            {t('hero.figure.title')}
          </span>
          <span className="text-[12.5px] text-mut">{fmt(t.raw('hero.figure.meta') as string)}</span>
        </div>
        <div className="mx-auto max-w-[300px] overflow-hidden rounded-[13px] border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- eager and sized, as the v3 pages draw shots (D-190 §21) */}
          <img
            src={hero.src}
            width={hero.width}
            height={hero.height}
            alt={all(`seo.shots.${landing.heroShot}.alt`)}
            className="block h-auto w-full"
          />
        </div>
      </div>
      <figcaption className="mx-auto mt-[14px] max-w-[420px] text-[14px] leading-[1.6] text-body [text-wrap:pretty]">
        <strong className="text-greendeep">{t('hero.figure.caption')}</strong> {common('realShot')}
      </figcaption>
    </figure>
  )
  const tileList = (mt: string, stacked = false) => (
    <ul
      className={`m-0 ${mt} grid list-none gap-[10px] p-0 ${stacked ? '' : '[grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]'}`}
    >
      {tiles.map((w, i) => (
        <li key={w.t} className="flex items-start gap-[12px] rounded-note border border-line bg-sf px-[16px] py-[14px]">
          <span
            aria-hidden="true"
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-pill bg-track text-[13px] font-bold"
          >
            {['＋', '◷', '§'][i]}
          </span>
          <span>
            <span className="block text-[14.5px] font-bold">{fmt(w.t)}</span>
            <span className="mt-[2px] block text-[12.5px] leading-[1.45] text-body [text-wrap:pretty]">{fmt(w.d)}</span>
          </span>
        </li>
      ))}
    </ul>
  )

  const factsLine = (mt: string) => (
    <p className={`m-0 ${mt} text-[14px] text-body`}>
      <span className="tabular-nums">{fmt(common.raw('facts') as string)}</span>
      {questionPage ? (
        <>
          {' · '}
          <Link href={`/${landing.slug}/sporsmal` as Route} className="font-bold">
            {t('related.sporsmal')} <span aria-hidden="true">→</span>
          </Link>
        </>
      ) : null}
    </p>
  )

  // a worded module's wordings (D-211), in the Orgpuls section with the question page (D-240)
  const wordingBlock =
    wordingWords && example?.text_variants ? (
      <div
        id="ordbruk"
        className="mt-[40px] grid scroll-mt-[24px] items-start gap-x-[56px] gap-y-[24px] rounded-[24px] border border-line bg-bg px-[40px] py-[40px] [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))] max-sm:px-[16px] max-sm:py-[26px]"
      >
        <div>
          <span className={`${EYEBROW} text-mut`}>{wordingWords.k}</span>
          <h3 className="m-0 mt-[12px] max-w-[20ch] font-display text-[30px] font-semibold leading-[1.12] [text-wrap:balance] max-sm:text-[26px]">
            {wordingWords.title}
          </h3>
          <p className={`${LEAD} mt-[14px] max-w-[46ch]`}>{wordingWords.lead}</p>
          <p className="m-0 mt-[14px] max-w-[46ch] text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">{wordingWords.begge}</p>
        </div>
        <div>
          <p className="m-0 text-[13px] font-semibold text-mut">{wordingWords.example}</p>
          <ul className="m-0 mt-[10px] flex list-none flex-col gap-[10px] p-0">
            {wordings.map((w) => {
              const words = wordingWords.items[w]
              if (!words) return null
              return (
                <li key={w} className="rounded-card border border-line bg-sf px-[20px] py-[18px] max-sm:px-[16px]">
                  <span className="block text-[15px] font-bold">{words.t}</span>
                  <span className="mt-[8px] block rounded-row border border-line bg-bg px-[14px] py-[11px] text-[14px] leading-[1.5] text-body [text-wrap:pretty]">
                    «{example.text_variants?.[w]}»
                  </span>
                  <Link
                    href={`/${landing.slug}/sporsmal?ordbruk=${w}` as Route}
                    className="mt-[12px] inline-flex min-h-[24px] items-center text-[14.5px] font-bold hover:no-underline"
                  >
                    {words.link} <span aria-hidden="true">&nbsp;→</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    ) : null

  // ------------------------------------------------------------------ why
  const whySection = (
    <section id="hvorfor" data-screen-label="Hvorfor" aria-labelledby="hvorfor-h" className={`${COLUMN} pb-[24px] pt-[72px] max-sm:pt-[48px]`}>
      <span className={`${EYEBROW} text-mut`}>{t('why.k')}</span>
      <h2 id="hvorfor-h" className={`${H2} mt-[12px] max-w-[24ch]`}>
        {t('why.title')}
      </h2>
      <p className={`${LEAD} mt-[14px] max-w-[62ch]`}>{t('why.lead')}</p>
      <div className="mt-[36px] grid items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
        <div className={`rounded-card border border-line bg-sf p-[24px] ${SHOT_SHADOW} max-sm:px-[16px] max-sm:py-[18px]`}>
          <div className="mb-[16px] flex flex-wrap items-center justify-between gap-[12px]">
            <h3 className="m-0 text-[15px] font-bold">
              {t('why.law.title')}
              {cites(landing.why.lawCites)}
            </h3>
            <span className="rounded-pill bg-mint px-[11px] py-[4px] text-[12px] font-bold text-greendeep">{t('why.law.pill')}</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
            {law.map((r) => (
              <li key={r.ref} className="flex items-start gap-[14px] rounded-row border border-line bg-bg px-[18px] py-[15px]">
                <span
                  aria-hidden="true"
                  className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-greenbar text-[13px] font-bold text-sf"
                >
                  §
                </span>
                <span>
                  <span className="block whitespace-nowrap text-[15px] font-bold">{r.ref}</span>
                  <span className="mt-[3px] block text-[13.5px] leading-[1.5] text-body [text-wrap:pretty]">{r.t}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/lovkrav" className="mt-[18px] inline-block text-[14.5px] font-bold hover:no-underline">
            {t('why.law.link')} <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="flex flex-col gap-[13px]">
          <div className="rounded-card border border-ink bg-sbg px-[24px] py-[22px] max-sm:px-[16px] max-sm:py-[18px]">
            <h3 className="m-0 font-display text-[22px] font-semibold leading-[1.2] [text-wrap:balance]">{t('why.tilsyn.t')}</h3>
            <p className="m-0 mt-[8px] text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">
              {t('why.tilsyn.p')}
              {cites(landing.why.tilsynCites)}
            </p>
          </div>
          <div className="rounded-card border border-line bg-sf px-[24px] py-[22px] max-sm:px-[16px] max-sm:py-[18px]">
            <h3 className="m-0 font-display text-[22px] font-semibold leading-[1.2] [text-wrap:balance]">{t('why.gap.t')}</h3>
            <p className="m-0 mt-[8px] text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">
              {t('why.gap.p')}
              {cites(landing.why.gapCites)}
            </p>
          </div>
          <div className="rounded-card border border-line bg-sf px-[24px] py-[22px] max-sm:px-[16px] max-sm:py-[18px]">
            <h3 className="m-0 font-display text-[22px] font-semibold leading-[1.2] [text-wrap:balance]">{t('why.cost.t')}</h3>
            <ul className="m-0 mt-[10px] flex list-none flex-col gap-[10px] p-0">
              {cost.map((c, i) => (
                <li key={c} className="flex items-start gap-[10px] text-[14.5px] leading-[1.55] text-body [text-wrap:pretty]">
                  <span aria-hidden="true" className="mt-[8px] h-[6px] w-[6px] flex-none rounded-pill bg-rustbar" />
                  <span>
                    {c}
                    {cites(landing.why.costCites[i] ?? [])}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )

  return (
    <>
      {/* ------------------------------------------------------------------ hero */}
      <SiteTop>
        <section
          data-screen-label="Hero"
          className="w-full max-w-[1240px] self-center px-[56px] pt-[40px] motion-safe:[animation:ht-in_.25s_ease_both] max-sm:px-0 max-sm:pt-[32px]"
        >
          <nav aria-label={chrome('crumbs')}>
            <ol className="m-0 flex list-none flex-wrap gap-[8px] p-0 text-[13px] text-body">
              <li>
                <Link href="/" className="text-body hover:text-body">
                  Orgpuls
                </Link>
              </li>
              <li className="flex gap-[8px]">
                <span aria-hidden="true">›</span>
                <Link href="/bransjer" className="text-body hover:text-body">
                  {all('seo.pages.bransjer.crumb')}
                </Link>
              </li>
              <li aria-current="page" className="flex gap-[8px]">
                <span aria-hidden="true">›</span>
                {t('nav')}
              </li>
            </ol>
          </nav>
          <div className="mt-[22px] grid items-center gap-x-[56px] gap-y-[32px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
            <div className="min-w-0 max-w-[620px]">
              <span className={`inline-block rounded-bar bg-ink px-[12px] py-[7px] text-bg ${EYEBROW}`}>{t('hero.k')}</span>
              <h1 className="m-0 mt-[22px] font-display text-[56px] font-semibold leading-[1.04] tracking-[-.01em] [hyphens:manual] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[40px] max-sm:leading-[1.08] max-[359px]:text-[34px]">
                {t('hero.h1')}
              </h1>
              <p className="m-0 mt-[20px] max-w-[52ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t('hero.lead')}</p>
              <a href="#orgpuls" className="mt-[24px] inline-flex min-h-[44px] items-center gap-[8px] text-[15.5px] font-bold hover:no-underline">
                {t('hero.jump')} <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div aria-hidden="true" className="flex min-w-0 justify-center max-sm:hidden">
              <IndustryArt kind={article.art} className="h-auto w-full max-w-[460px]" />
            </div>
          </div>
        </section>
      </SiteTop>

      <div className="flex flex-col gap-[18px] px-[18px] pt-[18px] max-sm:px-0">
        {/* ------------------------------------------------------------ the figures */}
        {/* the figures in one compact row (D-240) – heading and lead, four figures and the note – so the band introduces the page */}
        <section
          id="tallene"
          data-screen-label="Tallene"
          aria-labelledby="tallene-h"
          className="w-full max-w-[1240px] self-center rounded-[24px] border border-line bg-ink px-[40px] py-[36px] text-bg max-sm:mx-[16px] max-sm:w-auto max-sm:self-stretch max-sm:px-[18px] max-sm:py-[28px]"
        >
          <div className="grid items-end gap-x-[40px] gap-y-[12px] [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
            <div>
              <span className="inline-flex items-center gap-[7px] rounded-pill bg-ac px-[12px] py-[5px] text-[11.5px] font-bold text-ink">
                <span aria-hidden="true">▤</span> {t('stats.k')}
              </span>
              <h2
                id="tallene-h"
                className="m-0 mt-[12px] max-w-[26ch] font-display text-[26px] font-semibold leading-[1.15] [text-wrap:balance] max-sm:text-[23px]"
              >
                {t('stats.title')}
              </h2>
            </div>
            <p className="m-0 max-w-[56ch] text-[14.5px] leading-[1.6] opacity-[.78] [text-wrap:pretty]">
              {t('stats.lead')}
              {cites(landing.stats.leadCites, 'cream')}
            </p>
          </div>
          <ul className="m-0 mt-[28px] grid list-none gap-x-[20px] gap-y-[18px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))] lg:[grid-template-columns:repeat(4,minmax(0,1fr))_minmax(0,1.6fr)]">
            {stats.map((s, i) => (
              <li key={s.v + s.l} className="border-l border-[rgba(252,246,233,.22)] pl-[16px]">
                <span className="block font-display text-[36px] font-semibold leading-none tabular-nums">{s.v}</span>{' '}
                <span className="mt-[8px] block text-[13.5px] leading-[1.45] [text-wrap:pretty]">
                  <span className="opacity-[.78]">{s.l}</span>
                  {cites(landing.stats.items[i] ?? [], 'cream')}
                </span>
              </li>
            ))}
            <li className="rounded-[14px] bg-[rgba(252,246,233,.08)] px-[18px] py-[14px]">
              <h3 className="m-0 font-display text-[18px] font-semibold leading-[1.2] [text-wrap:balance]">{t('stats.h3')}</h3>
              <p className="m-0 mt-[6px] text-[13.5px] leading-[1.5] opacity-[.78] [text-wrap:pretty]">
                {t('stats.note')}
                {cites(landing.stats.noteCites, 'cream')}
              </p>
            </li>
          </ul>
        </section>
      </div>

      <section id="sammenlignet" data-screen-label="Sammenlignet" aria-labelledby="sammenlignet-h" className={`${COLUMN} pt-[72px] max-sm:pt-[48px]`}>
        <span className={`${EYEBROW} text-mut`}>{compare.k}</span>
        <h2 id="sammenlignet-h" className={`${H2} mt-[12px] max-w-[24ch]`}>
          {compare.title}
        </h2>
        <p className={`${LEAD} mt-[14px] max-w-[62ch]`}>{compare.lead}</p>
        <Compare
          words={compare}
          lang={lang}
          ownScale={common('ownScale')}
          rows={article.compare.map((c, i) => ({ ...c, label: compare.items[i] ?? '', cite: cites(c.cites) }))}
        />
      </section>

      {/* ----------------------------------------------------------- challenges */}
      <section id="utfordringer" data-screen-label="Utfordringer" aria-labelledby="utfordringer-h" className="mt-[48px] border-y border-line bg-sf">
        <div className={`${COLUMN} py-[72px] max-sm:py-[48px]`}>
          <span className={`${EYEBROW} text-mut`}>{t('challenges.k')}</span>
          <h2 id="utfordringer-h" className={`${H2} mt-[12px] max-w-[24ch]`}>
            {t('challenges.title')}
          </h2>
          <p className={`${LEAD} mt-[14px] max-w-[62ch]`}>{t('challenges.lead')}</p>
          {/* a card per challenge (D-240), four across: a drawing, the key figure, the title and the provisions at a glance; the situation, the finding and the law fold out */}
          <ol className="m-0 mt-[36px] grid list-none gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))] has-[details[open]]:items-start">
            {challenges.map((c, i) => (
              <li key={c.t} className="flex flex-col rounded-card border border-line bg-bg px-[20px] pb-[16px] pt-[18px] max-sm:px-[16px]">
                <div className="flex items-start justify-between gap-[12px]">
                  <RiskIcon kind={article.icons[i] ?? 'threat'} />
                  <span className="flex flex-col items-end gap-[6px]">
                    <span aria-hidden="true" className="font-display text-[15px] font-semibold tabular-nums text-mut">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {landing.challenges[i]?.audience ? (
                      <span className="rounded-pill bg-sbg px-[9px] py-[3px] text-[11.5px] font-bold text-ink">
                        {audiences[landing.challenges[i]!.audience!] ?? landing.challenges[i]!.audience}
                      </span>
                    ) : null}
                  </span>
                </div>
                <h3 className="m-0 mt-[14px] font-display text-[19px] font-semibold leading-[1.2] [text-wrap:balance]">{c.t}</h3>
                <p className="m-0 mt-[10px] text-[13.5px] leading-[1.45] text-body [text-wrap:pretty]">
                  {c.v ? (
                    <span className="mb-[4px] block font-display text-[30px] font-semibold leading-none tabular-nums text-ink">{c.v}</span>
                  ) : null}
                  {c.vl}
                  {cites(article.figCites[i] ?? [])}
                </p>
                <p className="m-0 mt-[12px] flex items-start gap-[8px] text-[12.5px] font-bold leading-[1.4] text-link">
                  <span
                    aria-hidden="true"
                    className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-pill bg-greenbar text-[10.5px] text-sf"
                  >
                    §
                  </span>
                  <span>{keep(c.ref)}</span>
                </p>
                <details className="group mt-auto pt-[12px]">
                  <summary className="flex min-h-[32px] cursor-pointer list-none items-center gap-[6px] border-t border-line pt-[10px] text-[13.5px] font-bold text-ink [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">{common('more')}</span>
                    <span className="hidden group-open:inline">{common('less')}</span>
                    <span aria-hidden="true" className="transition-transform group-open:rotate-180">
                      ▾
                    </span>
                  </summary>
                  <div className="flex flex-col gap-[10px] pt-[6px] text-[13.5px] leading-[1.55] text-body [text-wrap:pretty]">
                    <p className="m-0">{c.looks}</p>
                    <p className="m-0 border-l-[3px] border-rustbar pl-[10px] font-semibold text-ink">
                      {c.fig}
                      {cites(landing.challenges[i]?.cites ?? [])}
                    </p>
                    <p className="m-0">
                      <span className={`${EYEBROW} mb-[4px] block text-link`}>{common('lawSays')}</span>
                      {keep(c.law)}
                      {cites(article.lawCites[i] ?? [])}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {whySection}

      {/* ------------------------------------- what Orgpuls does, at the foot of an article */}
      <section
        id="orgpuls"
        data-screen-label="Orgpuls"
        aria-labelledby="orgpuls-h"
        className="mt-[48px] scroll-mt-[24px] border-y border-line bg-mint"
      >
        <div className={`${COLUMN} py-[72px] max-sm:py-[48px]`}>
          <div className="grid items-center gap-x-[56px] gap-y-[32px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
            <div className="min-w-0">
              <span className={`${EYEBROW} text-greendeep`}>{orgpuls.k}</span>
              <h2 id="orgpuls-h" className={`${H2} mt-[12px] max-w-[22ch]`}>
                {orgpuls.title}
              </h2>
              <p className={`${LEAD} mt-[14px] max-w-[52ch]`}>{orgpuls.lead}</p>
              <ul className="m-0 mt-[20px] flex list-none flex-col gap-[10px] p-0">
                {[t('stats.text'), t('why.tilsyn.d')].map((x) => (
                  <li key={x} className="flex items-start gap-[10px] text-[14.5px] font-semibold leading-[1.55] [text-wrap:pretty]">
                    <Tick />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
              {tileList('mt-[24px]', true)}
            </div>
            {phoneFigure}
          </div>
          <h3 className="m-0 mt-[56px] font-display text-[26px] font-semibold leading-[1.15] [text-wrap:balance]">{orgpuls.measures}</h3>
          <ol className="m-0 mt-[20px] grid list-none gap-[10px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))]">
            {challenges.map((c, i) => {
              const reg = landing.challenges[i]!
              return (
                <li key={c.t} className="flex flex-col gap-[8px] rounded-note border border-line bg-sf px-[20px] py-[16px] max-sm:px-[16px]">
                  <span className="text-[15px] font-bold">
                    <span aria-hidden="true" className="mr-[8px] tabular-nums text-mut">
                      {i + 1}.
                    </span>
                    {c.t}
                  </span>
                  <span className="text-[14px] leading-[1.55] text-body [text-wrap:pretty]">{c.solve}</span>
                  <MeasuredBy
                    label={common('measured')}
                    items={[
                      ...reg.module.map((id) => ({ id, label: moduleNames[id] ?? id, tag: t('moduleTag'), tone: 'bg-ac text-ink' })),
                      ...reg.core.map((id) => ({ id, label: all(`factor.${id}.label`), tag: common('coreTag'), tone: 'bg-track text-ink' })),
                    ]}
                  />
                </li>
              )
            })}
          </ol>
          {wordingBlock}
          {factsLine('mt-[24px]')}
          <TemplateTeaser slug="kartleggingspakken" className="mt-[24px]" />
        </div>
      </section>

      {/* -------------------------------------------- the variants, where there are two */}
      {landing.variants && mod.variants ? (
        <Variants
          raw={t.raw('variants')}
          picks={landing.variants.picks}
          mod={mod}
          names={moduleNames}
          chips={{ extendedOnly: all('industry.variant.extendedOnly'), optional: all('industry.variant.optional') }}
        />
      ) : null}

      {/* ------------------------------------------------------------- the proof */}
      <section id="slik-ser-det-ut" data-screen-label="Slik ser det ut" aria-labelledby="proof-h">
        <div className={`${COLUMN} pt-[72px] max-sm:pt-[48px]`}>
          <span className={`${EYEBROW} text-mut`}>{t('proof.k')}</span>
          <h2 id="proof-h" className={`${H2} mt-[12px] max-w-[24ch]`}>
            {t('proof.title')}
          </h2>
          <p className={`${LEAD} mt-[14px] max-w-[62ch]`}>{t('proof.lead')}</p>
        </div>
        {blocks.map((b, i) => {
          const shot = landing.proof[i]!
          return (
            <div key={b.h3} className={`border-b border-line ${i % 2 ? 'bg-sf' : 'bg-bg'}`}>
              <div
                className={`mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-[64px] gap-y-[32px] px-[56px] py-[56px] max-sm:px-[16px] max-sm:py-[40px] ${
                  i % 2 ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div className="min-w-0 flex-[1_1_340px]">
                  <span className={`${EYEBROW} text-mut`}>{b.k}</span>
                  <h3 className="m-0 mt-[12px] max-w-[22ch] font-display text-[30px] font-semibold leading-[1.12] [text-wrap:balance] max-sm:text-[26px]">
                    {b.h3}
                  </h3>
                  <ul className="m-0 mt-[18px] flex list-none flex-col gap-[10px] p-0">
                    {b.ticks.map((tick) => (
                      <li key={tick} className="flex items-start gap-[10px] text-[15px] leading-[1.55] text-body [text-wrap:pretty]">
                        <Tick />
                        <span>{tick}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <figure className="m-0 min-w-0 flex-[1_1_480px]">
                  <BrowserFrame id={shot} bar={all(`seo.shots.${shot}.screen`)} alt={all(`seo.shots.${shot}.alt`)} />
                  <figcaption className="mt-[14px] text-[14px] leading-[1.6] text-body [text-wrap:pretty]">
                    <strong className="text-greendeep">{b.caption}</strong> {common('realShot')}
                  </figcaption>
                </figure>
              </div>
            </div>
          )
        })}
      </section>

      {/* ----------------------------------------------------------------- steps */}
      <section id="kom-i-gang-steg" data-screen-label="Steg" aria-labelledby="steg-h" className={`${COLUMN} pt-[72px] max-sm:pt-[48px]`}>
        <div className="flex flex-col items-center gap-[14px] text-center">
          <span className="inline-block rounded-pill bg-sbg px-[13px] py-[6px] text-[12px] font-bold">{t('steps.k')}</span>
          <h2 id="steg-h" className={`${H2} max-w-[24ch]`}>
            {t('steps.title')}
          </h2>
        </div>
        <ol className="m-0 mt-[40px] grid list-none gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
          {steps.map((s, i) => (
            <li
              key={s.t}
              className={`flex flex-col gap-[12px] rounded-card border p-[26px] max-sm:px-[18px] max-sm:py-[22px] ${i === 0 ? 'border-ink bg-sbg' : 'border-line bg-sf'}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-[44px] w-[44px] items-center justify-center rounded-tile font-display text-[19px] font-semibold text-ink ${i === 0 ? 'bg-ac' : 'bg-track'}`}
              >
                {i + 1}
              </span>
              <h3 className="m-0 mt-[4px] font-display text-[22px] font-semibold leading-[1.15] [text-wrap:balance]">{s.t}</h3>
              <p className="m-0 text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------- anonymity */}
      <section id="anonymitet" data-screen-label="Anonymitet" aria-labelledby="anonymitet-h" className={`${COLUMN} pt-[56px] max-sm:pt-[40px]`}>
        <div className="grid items-start gap-x-[56px] gap-y-[28px] rounded-[24px] border border-line bg-sf px-[40px] py-[44px] [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))] max-sm:px-[18px] max-sm:py-[28px]">
          <div>
            <span className={`${EYEBROW} text-mut`}>{t('trust.k')}</span>
            <h2 id="anonymitet-h" className={`${H2} mt-[12px] max-w-[18ch]`}>
              {t('trust.title')}
            </h2>
            <p className={`${LEAD} mt-[14px] max-w-[46ch]`}>{t('trust.lead')}</p>
            <Link href="/sikkerhet" className="mt-[18px] inline-block text-[14.5px] font-bold hover:no-underline">
              {t('trust.link')} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {trust.map((x) => (
              <li key={x.t} className="flex items-start gap-[12px] border-t border-line py-[16px] first:border-t-0 first:pt-0">
                <Tick />
                <span>
                  <span className="block text-[15px] font-bold">{x.t}</span>
                  <span className="mt-[3px] block text-[14px] leading-[1.55] text-body [text-wrap:pretty]">{x.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------- faq */}
      <section
        id="sporsmal-og-svar"
        data-screen-label="Spørsmål"
        aria-labelledby="faq-h"
        className={`${COLUMN} grid items-start gap-x-[64px] gap-y-[24px] pb-[8px] pt-[72px] [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))] max-sm:pt-[48px]`}
      >
        <div>
          <span className={`${EYEBROW} text-mut`}>{t('faq.k')}</span>
          <h2 id="faq-h" className={`${H2} mt-[12px] max-w-[18ch]`}>
            {t('faq.title')}
          </h2>
        </div>
        <Faq items={faq} />
      </section>

      <StartBand />

      {/* ------------------------------------------------- read on, and the sources */}
      <section data-screen-label="Kilder" className={`${COLUMN} pb-[56px] max-sm:pb-[40px]`}>
        <div className="grid items-start gap-x-[64px] gap-y-[32px] border-t border-line pt-[40px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          <nav aria-labelledby="les-videre">
            <h2 id="les-videre" className="m-0 text-[15px] font-bold">
              {common('related')}
            </h2>
            <ul className="m-0 mt-[12px] flex list-none flex-col gap-[8px] p-0">
              {related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href as Route} className="text-[14.5px] font-bold">
                    {r.label} <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="lg:col-span-1">
            <h2 id="kilder" className="m-0 text-[15px] font-bold">
              {common('sources')}
            </h2>
            <p className="m-0 mt-[6px] text-[13px] text-mut">
              {common('sourcesLead', {
                date: new Date(`${landing.fetched}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nb-NO', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              })}
            </p>
            <ol className="m-0 mt-[12px] pl-[20px] text-[13.5px] leading-[1.5] text-body">
              {landing.sources.map((s) => {
                const title = t(`sources.${s.key}`)
                return (
                  <li key={s.key} id={`kilde-${s.key}`} className="my-[10px] scroll-mt-[24px] [overflow-wrap:anywhere]">
                    <a href={s.url} rel="noopener" className="text-link">
                      {title}
                    </a>
                    {/* the year, unless the title already names it */}
                    {title.includes(s.year) ? null : <span className="text-mut"> ({s.year})</span>}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </section>
    </>
  )
}

const VariantsWords = z.object({
  k: Str,
  title: Str,
  lead: Str,
  facts: z.object({ factors: Str, statements: Str, minutes: Str, about: Str, upTo: Str }),
  simple: z.object({ t: Str, badge: Str, d: Str, list: Str }),
  extended: z.object({ t: Str, badge: Str, d: Str, list: Str }),
  picks: z.object({ title: Str, lead: Str, items: z.array(Item) }),
  note: Str,
})

/** {name} in a message read raw */
const fill = (s: string, values: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => String(values[k] ?? m))

/**
 * A module in two variants (kunnskap og kontor, 0089, D-212): both sets side by side, their sizes and
 * factors read from the module file, never typed – the simplified set (F1–F8) and the extended one the
 * organisation picks from (at least `min_factors`), with the file's own «Kun utvidet» and «Valgfri» –
 * and the registry's picks, extended factors to weigh for a kind of business. Composed from the
 * template's own parts: the why section's r20 cards (the emphasised one on sbg with an ink border),
 * the challenge cards' chips, the hero's tiles and the ✓ row.
 */
function Variants({
  raw,
  picks,
  mod,
  names,
  chips,
}: {
  raw: unknown
  picks: string[][]
  mod: ReturnType<typeof moduleFile>
  names: Record<string, string>
  chips: { extendedOnly: string; optional: string }
}) {
  const w = VariantsWords.parse(raw)
  const items = z.array(Item).length(picks.length).parse(w.picks.items)
  const [simpleVariant, extendedVariant] = mod.variants!
  const simple = simplifiedFactors(mod)
  const count = (fs: { items: unknown[] }[]) => fs.reduce((n, f) => n + f.items.length, 0)
  const nameOf = (id: string, fallback: string) => names[id] ?? fallback
  const fileName = new Map(mod.factors.map((f) => [f.id, f.name]))

  const cards = [
    {
      key: 'forenklet',
      words: w.simple,
      emphasis: true,
      figures: [
        { v: String(simple.length), l: w.facts.factors },
        { v: String(count(simple)), l: w.facts.statements },
        { v: fill(w.facts.about, { n: simpleVariant.estimated_minutes }), l: w.facts.minutes },
      ],
      d: w.simple.d,
      factors: simple.map((f) => ({ id: f.id, label: nameOf(f.id, f.name), tags: [] as string[] })),
    },
    {
      key: 'utvidet',
      words: w.extended,
      emphasis: false,
      figures: [
        { v: `${extendedVariant.min_factors}–${mod.factors.length}`, l: w.facts.factors },
        { v: fill(w.facts.upTo, { n: count(mod.factors) }), l: w.facts.statements },
        { v: fill(w.facts.about, { n: extendedVariant.estimated_minutes }), l: w.facts.minutes },
      ],
      d: fill(w.extended.d, { factors: mod.factors.length, min: extendedVariant.min_factors }),
      factors: mod.factors.map((f) => ({
        id: f.id,
        label: nameOf(f.id, f.name),
        tags: [...(f.extended_only ? [chips.extendedOnly] : []), ...(f.optional ? [chips.optional] : [])],
      })),
    },
  ]

  return (
    <section id="varianter" data-screen-label="Varianter" aria-labelledby="varianter-h" className={`${COLUMN} pt-[72px] max-sm:pt-[48px]`}>
      <span className={`${EYEBROW} text-mut`}>{w.k}</span>
      <h2 id="varianter-h" className={`${H2} mt-[12px] max-w-[24ch]`}>
        {w.title}
      </h2>
      <p className={`${LEAD} mt-[14px] max-w-[62ch]`}>{w.lead}</p>
      <div className="mt-[36px] grid items-start gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
        {cards.map((c) => (
          <div
            key={c.key}
            className={`rounded-card border px-[24px] py-[22px] max-sm:px-[16px] max-sm:py-[18px] ${c.emphasis ? 'border-ink bg-sbg' : 'border-line bg-sf'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-[12px] gap-y-[8px]">
              <h3 className="m-0 font-display text-[24px] font-semibold leading-[1.15] max-sm:text-[22px]">{c.words.t}</h3>
              <span
                className={`rounded-pill px-[11px] py-[4px] text-[12px] font-bold ${c.emphasis ? 'bg-mint text-greendeep' : 'bg-track text-ink'}`}
              >
                {c.words.badge}
              </span>
            </div>
            <dl className="m-0 mt-[18px] flex flex-wrap gap-x-[28px] gap-y-[12px]">
              {c.figures.map((f) => (
                <div key={f.l} className="flex flex-col-reverse">
                  <dt className="mt-[4px] text-[12.5px] text-body">{f.l}</dt>
                  <dd className="m-0 font-display text-[28px] font-semibold leading-none tabular-nums max-sm:text-[24px]">{f.v}</dd>
                </div>
              ))}
            </dl>
            <p className="m-0 mt-[16px] text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">{c.d}</p>
            <p className="m-0 mt-[16px] text-[12px] font-bold text-mut">{c.words.list}</p>
            <ul className="m-0 mt-[8px] flex list-none flex-wrap gap-[6px] p-0">
              {c.factors.map((f) => (
                <li key={f.id} className={`rounded-pill px-[10px] py-[4px] text-[12px] font-bold text-ink ${c.emphasis ? 'bg-ac' : 'bg-track'}`}>
                  {f.label}
                  {f.tags.map((tag) => (
                    <span key={tag} className="font-semibold">
                      {' '}
                      · {tag}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h3 className="m-0 mt-[40px] font-display text-[22px] font-semibold leading-[1.2] [text-wrap:balance]">{w.picks.title}</h3>
      <p className="m-0 mt-[8px] max-w-[62ch] text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">{w.picks.lead}</p>
      <ul className="m-0 mt-[18px] grid list-none gap-[10px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))]">
        {items.map((p, i) => (
          <li key={p.t} className="flex flex-col gap-[8px] rounded-note border border-line bg-sf px-[16px] py-[14px]">
            <span className="text-[14.5px] font-bold">{p.t}</span>
            <span className="text-[12.5px] leading-[1.45] text-body [text-wrap:pretty]">{p.d}</span>
            <ul className="m-0 mt-[2px] flex list-none flex-wrap gap-[6px] p-0">
              {(picks[i] ?? []).map((id) => (
                <li key={id} className="rounded-pill bg-ac px-[10px] py-[4px] text-[12px] font-bold text-ink">
                  {nameOf(id, fileName.get(id) ?? id)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-[20px] flex max-w-[72ch] items-start gap-[10px] text-[14px] font-semibold leading-[1.5]">
        <Tick />
        <span>{w.note}</span>
      </p>
    </section>
  )
}

/** A screen from the app in the v3 browser window (Forside's frame): three dots and the screen's name, both decoration */
function BrowserFrame({ id, bar, alt }: { id: ShotId; bar: string; alt: string }) {
  const { img } = SHOTS[id]
  return (
    <div className={`overflow-hidden rounded-panel border border-line bg-sf ${SHOT_SHADOW}`}>
      <div aria-hidden="true" className="flex h-[36px] items-center gap-[7px] border-b border-line px-[14px]">
        <span className="h-[9px] w-[9px] rounded-pill bg-line" />
        <span className="h-[9px] w-[9px] rounded-pill bg-line" />
        <span className="h-[9px] w-[9px] rounded-pill bg-line" />
        <span className="ml-[12px] text-[11.5px] text-mut">{bar}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- eager and sized, as the v3 pages draw shots (D-190 §21) */}
      <img src={img.src} width={img.width} height={img.height} alt={alt} className="block h-auto w-full" />
    </div>
  )
}

/** «Målt med»: the factors that measure a challenge, as chips */
function MeasuredBy({ label, items }: { label: string; items: { id: string; label: string; tag: string; tone: string }[] }) {
  return (
    <div className="mt-[2px] flex flex-wrap items-center gap-[6px]">
      <span className="text-[12px] font-bold text-greendeep">{label}</span>
      <ul className="m-0 flex list-none flex-wrap gap-[6px] p-0">
        {items.map((m) => (
          <li key={m.tag + m.id} className={`rounded-pill px-[10px] py-[4px] text-[12px] font-bold ${m.tone}`}>
            {m.label}
            <span className="font-semibold"> · {m.tag}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The industry beside all employed (D-240): a pair of bars per measure, the industry in rust, all
 * employed in sage – the design's colour for a compared figure – each bar with its value written at
 * its end, so nothing is read by colour alone. Percentages share one 0–100 scale; a figure in another
 * unit (injuries per 1 000) has its own, up to the row's `max`, set apart by a rule and marked as its own scale. A row for a part of the industry names
 * that part under its label. Screen readers read each row's figures as text; the bars are hidden.
 */
function Compare({
  words,
  rows,
  lang,
  ownScale,
}: {
  words: z.infer<typeof CompareWords>
  ownScale: string
  rows: { v: number; all: number; label: string; group?: string; unit?: string; max?: number; cite: React.ReactNode }[]
  lang: 'no' | 'en'
}) {
  const num = (v: number) => v.toLocaleString(lang === 'en' ? 'en-GB' : 'nb-NO')
  const show = (v: number, unit?: string) => (unit ? `${num(v)} ${words.units?.[unit] ?? unit}` : `${num(v)} %`)
  const bar = (v: number, max: number, unit: string | undefined, tone: string) => (
    // the value stands at the end of its bar; the scale runs 0–max over the track, the value's room aside
    <div className={`relative h-[16px] ${unit ? 'mr-[96px]' : 'mr-[56px]'}`}>
      <span className={`absolute inset-y-[1px] left-0 rounded-r-[4px] ${tone}`} style={{ width: `${(v / max) * 100}%` }} />
      <span
        className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-[8px] text-[13px] font-bold leading-none tabular-nums text-ink"
        style={{ left: `${(v / max) * 100}%` }}
      >
        {show(v, unit)}
      </span>
    </div>
  )
  return (
    <figure className="m-0 mt-[32px] rounded-card border border-line bg-sf px-[28px] py-[26px] max-sm:px-[16px] max-sm:py-[20px]">
      <div aria-hidden="true" className="flex flex-wrap gap-x-[22px] gap-y-[6px] text-[13px] font-semibold text-body">
        <span className="flex items-center gap-[8px]">
          <span className="h-[12px] w-[12px] rounded-[3px] bg-rustbar" />
          {words.industry}
        </span>
        <span className="flex items-center gap-[8px]">
          <span className="h-[12px] w-[12px] rounded-[3px] bg-sage" />
          {words.all}
        </span>
      </div>
      <ul className="m-0 mt-[20px] flex list-none flex-col gap-[18px] p-0">
        {rows.map((r) => {
          const group = r.group ? (words.groups?.[r.group] ?? r.group) : null
          const max = r.unit ? (r.max ?? Math.max(r.v, r.all) * 1.25) : 100
          return (
            <li
              key={r.label}
              className={`grid items-center gap-x-[24px] gap-y-[8px] md:grid-cols-[260px_minmax(0,1fr)] ${r.unit ? 'border-t border-dashed border-rule pt-[18px]' : ''}`}
            >
              <span className="text-[14.5px] font-semibold leading-[1.35]">
                {r.label}
                {r.cite}
                {group || r.unit ? (
                  <span className="block text-[12px] font-normal text-mut">{[group, r.unit ? ownScale : null].filter(Boolean).join(' · ')}</span>
                ) : null}
                <span className="sr-only">
                  {' – '}
                  {group ?? words.industry}: {show(r.v, r.unit)}, {words.all}: {show(r.all, r.unit)}
                </span>
              </span>
              <span aria-hidden="true" className="flex flex-col gap-[3px] border-l-2 border-ink">
                {bar(r.v, max, r.unit, 'bg-rustbar')}
                {bar(r.all, max, r.unit, 'bg-sage')}
              </span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
