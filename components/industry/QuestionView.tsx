import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { citeOrder } from '@/content/industries/cites'
import { listOf, moduleFile, simplifiedFactors, type PageFactor, type PageLang } from '@/content/industries/modules'
import type { IndustryPage } from '@/content/industries/types'
import { flag, type FlagName } from '@/lib/flags'
import { CitedText } from './CitedText'
import { InVariant, VariantScope, VariantSwitch } from './Variant'
import { Worded, WordingScope, WordingSwitch } from './Wording'
import { H2, IndustryCta, SEC, SourceList, WRAP } from './IndustryView'

/**
 * /<slug>/sporsmal (§ B3): the whole module, generated from its file — the scale, every
 * factor with its rationale, statements, legal basis and three suggestions, the count
 * questions, and how answers are reported. Nothing here is typed twice: change the file,
 * publish a new version, and this page follows.
 */
const on = (f?: string) => !f || flag(f as FlagName)

export async function QuestionView({
  page,
  lang,
}: {
  page: IndustryPage & { module: NonNullable<IndustryPage['module']>; questionPage: NonNullable<IndustryPage['questionPage']> }
  lang: PageLang
}) {
  const t = await getTranslations('industry')
  const ts = await getTranslations()
  const q = page.questionPage
  const mod = moduleFile(page.module.key, page.module.version, lang)
  const moduleTitle = page.moduleName?.title ?? mod.name

  // a factor's rationale cites its sources in order; number them in reading order down the page
  const cites = (f: (typeof mod.factors)[number]) => f.rationale + f.rationale_sources.map((k) => `{{cite:${k}}}`).join('')
  const order = citeOrder(mod.factors.map(cites))
  const sources = order.flatMap((k) => mod.sources.filter((s) => s.key === k))
  const numbers = new Map(sources.map((s, i) => [s.key, i + 1]))
  const titles = new Map(mod.sources.map((s) => [s.key, s.title]))
  const typeLabel = (x: string) => t(`actionType.${x}`)
  const segments = on('module_segments') ? mod.segments : []
  // a worded module (barnehage og skole, D-131): the switch, and every statement through it
  const worded = !!mod.wording
  // a module in variants (kunnskap og kontor, D-137): the extended set, and a switch to the simplified
  const simple = simplifiedFactors(mod)
  const inVariants = simple.length > 0
  const nameOf = new Map(mod.factors.map((f) => [f.id, f.name]))
  const chip = (text: string) => <span className="rounded-pill bg-sbg px-[9px] py-[3px] text-[11.5px] font-bold text-mut">{text}</span>

  const toc = (list: PageFactor[]) => (
    <ul className="m-0 flex list-none flex-wrap gap-[8px] p-0">
      {[
        ...list.map((f) => ({ id: f.id, label: <Worded text={f.name} variants={f.name_variants} /> })),
        { id: 'ja-nei', label: t('tocCount') },
        { id: 'rapportering', label: t('tocReporting') },
      ].map((x) => (
        <li key={x.id}>
          <a
            href={`#${x.id}`}
            className="inline-block rounded-pill border border-line bg-sf px-[12px] py-[7px] text-[13px] font-semibold text-ink no-underline hover:border-ink hover:text-ink"
          >
            {x.label}
          </a>
        </li>
      ))}
    </ul>
  )

  // one factor's section: an extended factor's, with its rationale; a simplified one's, with where it comes from
  const factorSection = (f: PageFactor, simpleView = false) => (
    <section key={f.id} id={f.id} className={`${WRAP} scroll-mt-[90px] pt-[clamp(40px,6vw,64px)]`} aria-labelledby={`${f.id}-h`}>
      <h2 id={`${f.id}-h`} className={H2}>
        <Worded text={f.name} variants={f.name_variants} />
      </h2>
      {f.optional || f.extended_only ? (
        <div className="mt-[10px] flex flex-wrap gap-[6px]">
          {f.extended_only ? chip(t('variant.extendedOnly')) : null}
          {f.optional ? chip(t('variant.optional')) : null}
        </div>
      ) : null}
      <div className="mt-[18px] grid gap-x-[48px] gap-y-[24px] min-[900px]:grid-cols-2">
        <div className="min-w-0">
          {simpleView ? (
            <p className="m-0 max-w-[62ch] text-[15px] leading-[1.6] text-body">
              {f.summary}{' '}
              {t('variant.builtFrom', {
                list: listOf((mod.variants?.[0].factors.find((x) => x.id === f.id)?.built_from ?? []).map((k) => nameOf.get(k) ?? k), lang),
              })}
            </p>
          ) : (
            <p className="m-0 max-w-[62ch] text-[15px] leading-[1.6] text-body">
              <CitedText text={cites(f)} numbers={numbers} titles={titles} />
            </p>
          )}
          <div className="mb-[6px] mt-[18px] text-[13px] font-semibold text-mut">{t('statements')}</div>
          <ul className="m-0 list-none p-0">
            {f.items.map((i) => (
              <li key={i.id} className="grid items-baseline gap-x-[14px] gap-y-[4px] border-t border-line py-[13px] last:border-b [grid-template-columns:auto_minmax(0,1fr)]">
                <span className="min-w-[64px] whitespace-nowrap text-[12px] font-bold tabular-nums text-mut">{i.id}</span>
                <span className="font-display text-[18px] leading-[1.35]">
                  <Worded text={i.text} variants={i.text_variants} />
                  {inVariants && !simpleView && i.core_indicator ? (
                    <span className="ml-[8px] inline-block align-middle font-sans">{chip(t('variant.core'))}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {f.legal_basis.length ? (
            <>
              <div className="mb-[6px] mt-[18px] text-[13px] font-semibold text-mut">{t('legal')}</div>
              <ul className="m-0 pl-[18px] text-[14px] text-body">
                {f.legal_basis.map((l) => (
                  <li key={l} className="my-[4px]">
                    {l}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="mb-[6px] text-[13px] font-semibold text-mut">{t('suggestions')}</div>
          <div className="grid gap-[10px]">
            {f.action_suggestions.map((a) => (
              <div key={a.title} className="rounded-[14px] bg-cream px-[16px] py-[14px]">
                <div className="text-[12px] font-bold text-mut">{typeLabel(a.type)}</div>
                <b className="mt-[3px] block text-[15px]">{a.title}</b>
                <p className="mb-0 mt-[5px] text-[14px] text-body">{a.description}</p>
                <small className="mt-[7px] block text-[12.5px] text-mut">{t('remeasureCode', { code: a.remeasure_item })}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )

  const body = (
    <div className="pb-[20px]">
      <div className={`${WRAP} pt-[clamp(18px,3.5vw,44px)]`}>
        <nav aria-label={ts('seo.common.breadcrumb')} className="text-[12.5px] text-mut">
          <Link href="/" className="text-mut">
            {ts('seo.common.home')}
          </Link>
          <span aria-hidden="true"> / </span>
          {/* under Bransjer, as the industry page and the header's menu have it (D-129) */}
          <Link href="/bransjer" className="text-mut">
            {ts('seo.pages.bransjer.crumb')}
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/${page.slug}${page.launched ? '' : '?forhandsvis=1'}` as Route} className="text-mut">
            {page.navLabel}
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{q.crumb}</span>
        </nav>
        <span className="mt-[16px] inline-flex items-center gap-[8px] rounded-pill bg-sbg px-[13px] py-[6px] text-[12.5px] font-bold">
          <span aria-hidden="true" className="block h-[7px] w-[7px] rounded-pill bg-link" />
          {t('versionPill', { module: moduleTitle, version: mod.version })}
        </span>
        {mod.validation_status === 'provisional' ? <span className="ml-[8px] inline-block align-middle">{chip(t('variant.provisional'))}</span> : null}
        <h1 className="mb-0 mt-[16px] max-w-[22ch] font-display text-[clamp(30px,5vw,50px)] font-semibold leading-[1.08] tracking-[-0.01em] [hyphens:auto] [overflow-wrap:break-word] [text-wrap:balance]">
          {q.h1}
        </h1>
        <p className="mb-0 mt-[14px] max-w-[58ch] text-[16.5px] leading-[1.6] text-body [text-wrap:pretty]">{q.lead}</p>

        <div className="mt-[26px] text-[13px] font-semibold text-mut">{t('scaleHead')}</div>
        <ol className="m-0 mt-[14px] grid max-w-[620px] list-none grid-cols-5 gap-[6px] overflow-x-auto p-0">
          {mod.scale.labels.map((l, i) => (
            <li key={l} className="min-w-[52px] rounded-[10px] border border-line bg-sf px-[8px] py-[10px] text-center text-[12.5px]">
              <b className="block font-display text-[17px]">{mod.scale.to_index[String(i + 1)]}</b>
              {l}
            </li>
          ))}
        </ol>
        <p className="mb-0 mt-[12px] max-w-[62ch] text-[14px] text-body">{q.scaleNote}</p>
        {worded ? (
          <WordingSwitch
            labels={{
              legend: t('wording.legend'),
              note: t('wording.note'),
              barnehage: t('wording.barnehage'),
              skole: t('wording.skole'),
              begge: t('wording.begge'),
            }}
          />
        ) : null}
        {inVariants ? <VariantSwitch label={t('variant.simpleOnly')} note={t('variant.note')} /> : null}

        <nav aria-label={t('tocLabel')} className="mt-[22px]">
          {inVariants ? (
            <>
              <InVariant variant="utvidet">{toc(mod.factors)}</InVariant>
              <InVariant variant="forenklet">{toc(simple)}</InVariant>
            </>
          ) : (
            toc(mod.factors)
          )}
        </nav>
      </div>

      {inVariants
        ? [
            ...mod.factors.map((f) => (
              <InVariant key={f.id} variant="utvidet">
                {factorSection(f)}
              </InVariant>
            )),
            ...simple.map((f) => (
              <InVariant key={f.id} variant="forenklet">
                {factorSection(f, true)}
              </InVariant>
            )),
          ]
        : mod.factors.map((f) => factorSection(f))}

      <section id="ja-nei" className={`${WRAP} ${SEC} scroll-mt-[90px]`} aria-labelledby="ja-nei-h">
        <h2 id="ja-nei-h" className={H2}>
          {q.countTitle}
        </h2>
        <p className="mb-0 mt-[12px] max-w-[62ch] text-[16px] leading-[1.6] text-body">{q.countIntro}</p>
        {mod.count_items.map((c) => {
          // a module in variants: a question only the extended set asks, in its view only
          const extendedOnly = inVariants && !!c.variants && !c.variants.includes('forenklet')
          const card = (
            <div key={c.id} className="mt-[14px] rounded-card border border-line bg-sf px-[20px] py-[18px]">
              <span className="text-[12px] font-bold tabular-nums text-mut">{c.id}</span>
              {extendedOnly ? <span className="ml-[8px] inline-block align-middle">{chip(t('variant.extendedOnly'))}</span> : null}
              <span className="mt-[4px] block font-display text-[18px] leading-[1.35]">
                <Worded text={c.text} variants={c.text_variants} />
              </span>
              <ul className="m-0 mt-[10px] flex list-none flex-wrap gap-[6px] p-0">
                {c.options.map((o) => (
                  <li key={o} className="rounded-pill border border-line px-[10px] py-[4px] text-[12.5px] text-mut">
                    {o}
                  </li>
                ))}
              </ul>
              <p className="mb-0 mt-[10px] text-[13.5px] text-body">
                {c.why} {t('countOnly')}
              </p>
            </div>
          )
          return extendedOnly ? (
            <InVariant key={c.id} variant="utvidet">
              {card}
            </InVariant>
          ) : (
            card
          )
        })}
      </section>

      {segments.length ? (
        <section className={`${WRAP} ${SEC}`} aria-labelledby="bakgrunn">
          <h2 id="bakgrunn" className={H2}>
            {q.segmentsTitle}
          </h2>
          <p className="mb-0 mt-[12px] max-w-[62ch] text-[16px] leading-[1.6] text-body">{q.segmentsIntro}</p>
          {segments.map((s) => (
            <div key={s.id} className="mt-[14px] rounded-card border border-line bg-sf px-[20px] py-[18px]">
              <span className="block font-display text-[18px] leading-[1.35]">{s.text}</span>
              <ul className="m-0 mt-[10px] flex list-none flex-wrap gap-[6px] p-0">
                {s.options.map((o) => (
                  <li key={o} className="rounded-pill border border-line px-[10px] py-[4px] text-[12.5px] text-mut">
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      <section id="rapportering" className={`${WRAP} ${SEC} scroll-mt-[90px]`} aria-labelledby="rapportering-h">
        <h2 id="rapportering-h" className={H2}>
          {q.rulesTitle}
        </h2>
        <dl className="mb-0 mt-[20px] grid gap-x-[40px] min-[760px]:grid-cols-2">
          {q.rules
            .filter((r) => on(r.featureFlag))
            .map((r) => (
              <div key={r.title} className="border-t border-line py-[14px]">
                <dt className="font-bold">{r.title}</dt>
                <dd className="m-0 text-[14px] text-body">{r.text}</dd>
              </div>
            ))}
        </dl>
        {mod.relation_to_core?.covered_by_core_factors.length ? (
          <p className="mb-0 mt-[22px] max-w-[70ch] text-[14px] leading-[1.6] text-body">
            {t('coreCovered', { list: listOf(mod.relation_to_core.covered_by_core_factors, lang) })} {q.coreNote}
          </p>
        ) : null}
      </section>

      <IndustryCta title={q.cta.title} text={q.cta.text} ts={ts} />
      <SourceList sources={sources} title={t('sources')} />
    </div>
  )
  if (inVariants) return <VariantScope simpleIds={simple.map((f) => f.id)}>{body}</VariantScope>
  return worded ? <WordingScope>{body}</WordingScope> : body
}
