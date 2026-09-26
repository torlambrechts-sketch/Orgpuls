import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Faq } from '@/components/start/Faq'
import { SignupStart } from '@/components/marketing/SignupStart'
import { citeOrder } from '@/content/industries/cites'
import { getIndustry, pageIn } from '@/content/industries'
import { listOf, moduleFile, type PageLang } from '@/content/industries/modules'
import type { IndustryPage, ResultPreview } from '@/content/industries/types'
import { flag, type FlagName } from '@/lib/flags'
import type { ModuleFile } from '@/lib/modules/schema'
import { CitedText } from './CitedText'

/**
 * An industry page (§ B3), drawn from its content file and its module file. Every sentence is
 * the page's own; every statement is the module's by code, or the core instrument's; the
 * chrome around them (labels, legends, the helpline line) is next-intl. Sections a feature
 * flag governs are left out while the flag is off, so the page claims only what is shipped.
 */
export const WRAP = 'mx-auto max-w-[1120px] px-[18px] sm:px-[26px]'
export const H2 = 'm-0 font-display text-[clamp(25px,3.4vw,36px)] font-semibold leading-[1.15] tracking-[-0.01em] [text-wrap:balance]'
export const SEC = 'pt-[clamp(48px,7vw,88px)]'

const on = (f?: string) => !f || flag(f as FlagName)

/** The band colour of a result cell, as Resultater draws bands: mint ≥65, yellow 50–64, peach below. */
const cell = (v: number) => (v >= 65 ? 'bg-mint' : v >= 50 ? 'bg-sbg' : 'bg-peach')

export async function IndustryView({
  page,
  core,
  lang,
}: {
  page: IndustryPage
  core: (key: string, ordinal: number) => { factor: string; text: string }
  lang: PageLang
}) {
  const t = await getTranslations('industry')
  const ts = await getTranslations()
  const mod = page.module ? moduleFile(page.module.key, page.module.version, lang) : null
  const itemOf = (code: string) => {
    for (const f of mod?.factors ?? []) {
      const i = f.items.find((x) => x.id === code)
      if (i) return { factor: f, item: i }
    }
    return null
  }

  const challenges = page.challenges.filter((c) => on(c.featureFlag))
  const order = citeOrder([...challenges.map((c) => c.body), page.moduleOverview?.intro ?? ''])
  const allSources = [...(mod?.sources ?? []), ...(page.extraSources ?? [])]
  // the page's citations in reading order, then the other sources the module's factors cite
  const factorCited = new Set(mod?.factors.flatMap((f) => f.rationale_sources) ?? [])
  const sources = [
    ...order.flatMap((k) => allSources.filter((s) => s.key === k)),
    ...allSources.filter((s) => !order.includes(s.key) && factorCited.has(s.key)),
  ]
  const numbers = new Map(sources.map((s, i) => [s.key, i + 1]))
  const titles = new Map(allSources.map((s) => [s.key, s.title]))
  const cite = (text: string) => <CitedText text={text} numbers={numbers} titles={titles} />
  const faq = page.faq.filter((f) => on(f.featureFlag))
  const moduleTitle = page.moduleName?.title ?? ''
  // before launch the question page exists only as a preview, so links to it say so (D-118)
  const qp = page.launched ? '' : '?forhandsvis=1'

  return (
    <div className="pb-[20px]">
      {/* ------------------------------------------------------------------ hero */}
      <div className={`${WRAP} pt-[clamp(18px,3.5vw,44px)]`}>
        <div className="grid items-center gap-[40px] min-[980px]:[grid-template-columns:minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <nav aria-label={ts('seo.common.breadcrumb')} className="text-[12.5px] text-mut">
              <Link href="/" className="text-mut">
                {ts('seo.common.home')}
              </Link>
              <span aria-hidden="true"> / </span>
              <Link href="/bruksomrader" className="text-mut">
                {ts('seo.pages.bruksomrader.crumb')}
              </Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">{page.navLabel}</span>
            </nav>
            <span className="mt-[16px] inline-flex items-center gap-[8px] rounded-pill bg-sbg px-[13px] py-[6px] text-[12.5px] font-bold">
              <span aria-hidden="true" className="block h-[7px] w-[7px] rounded-pill bg-link" />
              {page.hero.pill}
            </span>
            <h1 className="mb-0 mt-[16px] max-w-[22ch] font-display text-[clamp(30px,5vw,50px)] font-semibold leading-[1.08] tracking-[-0.01em] [hyphens:auto] [overflow-wrap:break-word] [text-wrap:balance]">
              {page.hero.h1}
            </h1>
            <p className="mb-0 mt-[14px] max-w-[58ch] text-[16.5px] leading-[1.6] text-body [text-wrap:pretty]">{page.hero.lead}</p>
            <div className="mt-[22px]">
              <SignupStart
                label={ts('seo.signup.label')}
                submit={ts('seo.signup.submit')}
                invalid={ts('seo.signup.invalid')}
                invalidChecksum={ts('seo.signup.invalidChecksum')}
              />
            </div>
            <p className="mb-0 mt-[9px] text-[12.5px] text-mut">{ts('seo.common.priceLine')}</p>
            <p className="mb-0 mt-[4px] text-[12.5px] text-mut">{page.hero.thresholdNote}</p>
          </div>
          {page.hero.preview && mod ? (
            <PreviewBoard preview={page.hero.preview} mod={mod} moduleTitle={moduleTitle} t={t} />
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------------ challenges */}
      {page.challengesIntro ? (
        <section className={`${WRAP} ${SEC}`} aria-labelledby="utfordringer">
          <h2 id="utfordringer" className={H2}>
            {page.challengesIntro.title}
          </h2>
          <p className="mb-0 mt-[12px] max-w-[62ch] text-[16px] leading-[1.6] text-body">{page.challengesIntro.text}</p>
          <div className="mt-[34px] border-t-[1.5px] border-ink">
            {challenges.map((c) => {
              const m = c.measuredBy.kind === 'module' ? itemOf(c.measuredBy.itemCode) : null
              const k = c.measuredBy.kind === 'core' ? core(c.measuredBy.factorKey, c.measuredBy.ordinal) : null
              return (
                <div
                  key={c.title}
                  className="grid gap-x-[48px] gap-y-[18px] border-b border-line py-[30px] min-[860px]:[grid-template-columns:minmax(0,1fr)_minmax(0,0.85fr)]"
                >
                  <div className="min-w-0">
                    <h3 className="m-0 font-display text-[21px] font-semibold leading-[1.25]">{c.title}</h3>
                    <p className="mb-0 mt-[10px] max-w-[62ch] text-[15px] leading-[1.55] text-body">{cite(c.body)}</p>
                    <span
                      className={`mt-[12px] inline-block rounded-pill px-[11px] py-[4px] text-[12px] font-bold ${
                        m ? 'bg-ac text-ink' : 'bg-track text-mut'
                      }`}
                    >
                      {m ? t('tagModule', { module: moduleTitle, factor: m.factor.name }) : t('tagCore')}
                    </span>
                    {c.helpline ? (
                      <p className="mb-0 mt-[12px] text-[13px] text-mut">
                        {t.rich('helpline', {
                          number: (chunks) => (
                            <a href="tel:116123" className="font-semibold underline underline-offset-[3px]">
                              {chunks}
                            </a>
                          ),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="self-start rounded-[14px] bg-cream px-[18px] py-[16px]">
                    <div className="text-[12.5px] font-semibold text-mut">
                      {m ? t('measuredIn', { module: page.moduleName?.inline ?? '' }) : t('measuredCore')}
                    </div>
                    <q className="mt-[6px] block font-display text-[18.5px] leading-[1.35] [quotes:'«''»']">
                      {m ? m.item.text : k?.text}
                    </q>
                    <div className="mt-[10px] text-[13px] text-body">
                      {m ? (
                        <Link href={`/${page.slug}/sporsmal${qp}#${m.factor.id}` as Route}>{t('seeAll')}</Link>
                      ) : (
                        t('coreFactor', { factor: k?.factor ?? '' })
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------------- module overview */}
      {page.moduleOverview && mod ? (
        <section className={`${WRAP} ${SEC}`} aria-labelledby="modulen">
          <h2 id="modulen" className={H2}>
            {page.moduleOverview.title}
          </h2>
          <p className="mb-0 mt-[12px] max-w-[62ch] text-[16px] leading-[1.6] text-body">{cite(page.moduleOverview.intro)}</p>
          <dl className="mb-0 mt-[28px] grid grid-cols-2 overflow-hidden rounded-card border border-line bg-sf min-[760px]:grid-cols-4">
            {[
              { v: mod.factors.length, l: t('facts.factors') },
              { v: mod.factors.reduce((n, f) => n + f.items.length, 0), l: t('facts.statements') },
              { v: t('facts.minutesValue', { n: mod.estimated_minutes }), l: t('facts.minutes') },
              { v: mod.anonymity.min_responses, l: t('facts.threshold') },
            ].map((f, i) => (
              <div
                key={f.l}
                className={`flex flex-col-reverse px-[18px] py-[18px] ${i % 2 === 0 ? 'border-r border-line' : ''} ${
                  i < 2 ? 'border-b border-line min-[760px]:border-b-0' : ''
                } min-[760px]:border-r min-[760px]:last:border-r-0`}
              >
                <dt className="text-[13px] text-mut">{f.l}</dt>
                <dd className="m-0 font-display text-[26px] font-semibold">{f.v}</dd>
              </div>
            ))}
          </dl>
          <ul className="m-0 mt-[26px] grid list-none gap-x-[40px] p-0 min-[760px]:grid-cols-2">
            {mod.factors.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/${page.slug}/sporsmal${qp}#${f.id}` as Route}
                  className="group block border-t border-line py-[15px] text-ink no-underline hover:text-ink"
                >
                  <span className="block text-[15.5px] font-bold group-hover:underline">{f.name}</span>
                  <span className="mt-[3px] block text-[13.5px] text-mut">{f.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
          {mod.relation_to_core?.covered_by_core_factors.length ? (
            <p className="mb-0 mt-[22px] max-w-[70ch] text-[14px] leading-[1.6] text-body">
              {t('coreCovered', { list: listOf(mod.relation_to_core.covered_by_core_factors, lang) })} {page.moduleOverview.coreNote}{' '}
              <Link href={`/${page.slug}/sporsmal${qp}` as Route} className="font-semibold underline underline-offset-[3px]">
                {t('seeQuestions')}
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* -------------------------------------------------------------- the loop */}
      {page.loop && mod ? <Loop page={page} mod={mod} t={t} /> : null}

      {/* -------------------------------------------------------------- the law */}
      <section className={`${WRAP} ${SEC}`} aria-labelledby="loven">
        <h2 id="loven" className={H2}>
          {page.law.title}
        </h2>
        <p className="mb-0 mt-[12px] max-w-[62ch] text-[16px] leading-[1.6] text-body">{page.law.intro}</p>
        <dl className="mb-0 mt-[26px]">
          {page.law.items.map((l) => (
            <div key={l.ref} className="grid gap-x-[24px] gap-y-[8px] border-t border-line py-[16px] min-[640px]:[grid-template-columns:200px_minmax(0,1fr)]">
              <dt className="font-bold">{l.ref}</dt>
              <dd className="m-0 text-body">{l.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* --------------------------------------------------------------- the faq */}
      {faq.length ? (
        <section className={`${WRAP} ${SEC}`} aria-labelledby="sporsmal-vi-far">
          <h2 id="sporsmal-vi-far" className={H2}>
            {t('faqTitle')}
          </h2>
          <div className="mt-[20px] max-w-[820px]">
            <Faq items={faq.map((f, i) => ({ key: String(i), q: f.q, a: f.a }))} />
          </div>
        </section>
      ) : null}

      <IndustryCta title={page.cta.title} text={page.cta.text} ts={ts} />

      {/* ------------------------------------------------------------ the sources */}
      {sources.length ? <SourceList sources={sources} title={t('sources')} /> : null}

      {/* ------------------------------------------------------------ the others */}
      {page.related.length ? (
        <nav className={`${WRAP} pt-[40px]`} aria-label={t('related')}>
          <h2 className="m-0 text-[13px] font-bold">{t('related')}</h2>
          <ul className="m-0 mt-[8px] flex list-none flex-wrap gap-[8px] p-0">
            {page.related.map((r) => (
              <li key={r}>
                <Link
                  href={`/${r}` as Route}
                  className="inline-block rounded-pill border border-line bg-sf px-[12px] py-[7px] text-[13px] font-semibold text-ink no-underline hover:border-ink hover:text-ink"
                >
                  {pageIn(getIndustry(r), lang)?.navLabel ?? ts(`seo.lp.${r.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}.crumb`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  )
}

type T = Awaited<ReturnType<typeof getTranslations<'industry'>>>


function PreviewBoard({ preview, mod, moduleTitle, t }: { preview: ResultPreview; mod: ModuleFile; moduleTitle: string; t: T }) {
  return (
    <figure
      role="figure"
      aria-label={t('board.label', { company: preview.company })}
      className="m-0 min-w-0 rounded-card border border-line bg-sf px-[18px] pb-[16px] pt-[18px]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
        <span className="text-[14px] font-bold">
          {moduleTitle} · {preview.company}
        </span>
        <span className="text-[12px] text-mut">{preview.caption}</span>
      </div>
      <div className="mt-[12px] overflow-x-auto" tabIndex={0} aria-label={t('board.scroll')}>
        <table className="w-full min-w-[420px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="py-[6px] pr-[6px] text-left text-[12px] font-semibold text-mut">
                {t('board.factor')}
              </th>
              {preview.columns.map((c) => (
                <th key={c} scope="col" className="whitespace-nowrap px-[6px] py-[6px] text-right text-[12px] font-semibold text-mut">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => (
              <tr key={r.factorKey}>
                <th scope="row" className="border-t border-line py-[7px] pr-[6px] text-left font-normal">
                  {mod.factors.find((f) => f.id === r.factorKey)?.name}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} className="border-t border-line px-[6px] py-[7px] text-right tabular-nums">
                    {v === null ? (
                      <span className="font-medium text-mut">–</span>
                    ) : (
                      <span className={`inline-block min-w-[34px] rounded-[7px] px-[6px] py-[3px] text-center font-bold text-ink ${cell(v)}`}>{v}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-[8px] flex flex-wrap gap-[12px] text-[12px] text-mut">
        {(['low', 'mid', 'high'] as const).map((b) => (
          <span key={b} className="inline-flex items-center gap-[6px]">
            <i aria-hidden="true" className={`inline-block h-[12px] w-[12px] rounded-[4px] ${b === 'low' ? 'bg-mint' : b === 'mid' ? 'bg-sbg' : 'bg-peach'}`} />
            {t(`board.${b}`)}
          </span>
        ))}
      </div>
      <figcaption className="mt-[10px] text-[12px] text-mut">{preview.footnote}</figcaption>
    </figure>
  )
}

function Loop({ page, mod, t }: { page: IndustryPage; mod: ModuleFile; t: T }) {
  const loop = page.loop!
  const factor = mod.factors.find((f) => f.id === loop.example.factorKey)
  const action = factor?.action_suggestions.find((a) => a.type === loop.example.actionType)
  const statement = factor?.items.find((i) => i.id === action?.remeasure_item)?.text
  return (
    <section className={`${WRAP} ${SEC}`} aria-labelledby="sloyfen">
      <h2 id="sloyfen" className={H2}>
        {loop.title}
      </h2>
      <ol className="m-0 mt-[28px] grid list-none gap-[18px] p-0 min-[520px]:grid-cols-2 min-[860px]:grid-cols-4">
        {loop.steps.map((s, i) => (
          <li key={s.title} className="border-t-[3px] border-ink pt-[14px]">
            <span aria-hidden="true" className="mb-[8px] block font-display text-[30px] font-semibold leading-none">
              {i + 1}
            </span>
            <b className="block text-[15px]">{s.title}</b>
            <span className="text-[14px] text-body">{s.text}</span>
          </li>
        ))}
      </ol>
      {factor && action ? (
        <div className="mt-[30px] rounded-card border border-line bg-sf px-[22px] py-[20px]">
          <div className="text-[12.5px] font-semibold text-mut">
            {t('loopExample', { factor: factor.name, group: loop.example.groupLabel })}
          </div>
          <h3 className="m-0 mt-[6px] font-display text-[21px] font-semibold leading-[1.25]">{action.title}</h3>
          <p className="mb-0 mt-[6px] max-w-[68ch] text-[14.5px] leading-[1.55] text-body">
            {action.description} {t('remeasure', { statement: statement ?? '' })}
          </p>
          <ol className="m-0 mt-[12px] flex list-none flex-wrap gap-[8px] p-0" aria-label={t('loopSteps')}>
            {loop.example.chips.map((c, i) => (
              <li
                key={c}
                aria-current={i === loop.example.on ? 'step' : undefined}
                className={`rounded-pill px-[10px] py-[5px] text-[12.5px] font-semibold ${
                  i <= loop.example.on ? 'bg-mint text-ink' : 'bg-track text-mut'
                }`}
              >
                {c}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}

export function IndustryCta({ title, text, ts }: { title: string; text: string; ts: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <div className={`${WRAP} pt-[clamp(56px,8vw,96px)]`}>
      <section className="rounded-card bg-ink p-[clamp(26px,5vw,48px)] text-bg" aria-labelledby="kom-i-gang">
        <h2 id="kom-i-gang" className={`${H2} text-bg`}>
          {title}
        </h2>
        <p className="mb-0 mt-[12px] max-w-[56ch] text-[15.5px] leading-[1.6] opacity-[0.85]">{text}</p>
        <div className="mt-[22px]">
          <SignupStart
            tone="dark"
            label={ts('seo.signup.label')}
            submit={ts('start.ctaFree')}
            invalid={ts('seo.signup.invalid')}
            invalidChecksum={ts('seo.signup.invalidChecksum')}
          />
        </div>
        <p className="mb-0 mt-[9px] text-[12.5px] opacity-75">{ts('seo.common.priceLine')}</p>
      </section>
    </div>
  )
}

export function SourceList({ sources, title }: { sources: { key: string; title: string; url: string }[]; title: string }) {
  return (
    <section className={`${WRAP} pt-[48px]`} aria-labelledby="kilder">
      <h2 id="kilder" className="m-0 font-display text-[21px] font-semibold">
        {title}
      </h2>
      <ol className="mb-0 mt-[18px] max-w-[84ch] pl-[20px] text-[13.5px] text-body">
        {sources.map((s) => (
          <li key={s.key} id={`k-${s.key}`} className="my-[6px] scroll-mt-[90px]">
            <a href={s.url} rel="noopener" className="break-words">
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
