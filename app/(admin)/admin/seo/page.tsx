import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SeoPerformance } from '@/components/admin/SeoPerformance'
import { BTN, PageHead, Problem, Segments } from '@/components/admin/ui'
import { bareTitle } from '@/lib/admin/analytics'
import { isError, SEO_PERIODS } from '@/lib/admin/api'
import { cmsPages, cmsRedirects } from '@/lib/admin/cms'
import { catalogues, designedMeta } from '@/lib/admin/cmsSite'
import { parseContent, pathOf } from '@/lib/cms/content'
import { designedPages } from '@/lib/cms/designed'
import { DESCRIPTION_RANGE, TITLE_RANGE } from '@/lib/cms/seo'

/**
 * Content › SEO (X-095, the design's `isSeo`). Health: every published page with its title and
 * description against the ranges the page score uses, whether it is indexed, the redirects and the
 * sitemap. Performance: what search engines report (0061, D-106), as before.
 */
type Row = { key: string; href: string; path: string; title: string; titleLen: number; descLen: number; indexed: boolean }

export default async function AdminSeo({ searchParams }: { searchParams: Promise<{ view?: string; d?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await searchParams
  const view = sp.view === 'performance' ? 'performance' : 'health'
  const days = SEO_PERIODS.find((p) => String(p) === sp.d) ?? 28
  const h = (k: string, v?: Record<string, string | number>) => t(`seo.health.${k}`, v)

  const head = (lead: string) => (
    <PageHead title={h('title')} lead={lead}>
      <div className="flex flex-wrap items-center gap-[10px]">
        {view === 'performance' ? (
          <Segments label={t('seo.period')} items={SEO_PERIODS.map((p) => ({ key: String(p), label: t('web.days', { count: p }), href: `/admin/seo?view=performance&d=${p}`, on: p === days }))} />
        ) : null}
        <Segments
          label={h('view')}
          items={[
            { key: 'health', label: h('health'), href: '/admin/seo', on: view === 'health' },
            { key: 'performance', label: h('performance'), href: '/admin/seo?view=performance', on: view === 'performance' },
          ]}
        />
        <Link href={'/admin/cms/redirects' as Route} className={BTN.primary}>
          {h('newRedirect')}
        </Link>
      </div>
    </PageHead>
  )
  if (view === 'performance') {
    return (
      <>
        {head(t('seo.lead'))}
        <SeoPerformance days={days} />
      </>
    )
  }

  const [pages, redirects, cat] = await Promise.all([cmsPages(), cmsRedirects(), catalogues()])
  if (isError(pages) || isError(redirects)) {
    const e = [pages, redirects].find(isError)
    return <Problem text={e?.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const designed: Row[] = designedPages().map((p) => {
    const meta = designedMeta(p, cat).no ?? designedMeta(p, cat).en
    return {
      key: p.path,
      href: `/admin/cms/site?path=${encodeURIComponent(p.path)}`,
      path: p.path,
      title: bareTitle(meta?.title ?? p.path),
      titleLen: (meta?.title ?? '').trim().length,
      descLen: (meta?.description ?? '').trim().length,
      indexed: true,
    }
  })
  const made: Row[] = pages.rows
    .filter((p) => !p.archived && p.locales.some((l) => l.current))
    .map((p) => {
      const l = p.locales.find((x) => x.locale === 'no' && x.current) ?? p.locales.find((x) => x.current)
      const c = parseContent(l?.current ?? {})
      return {
        key: p.id,
        href: `/admin/cms/${p.id}`,
        path: pathOf(p.kind, p.slug),
        title: bareTitle(c?.h1 || c?.title || p.slug),
        titleLen: (c?.title ?? '').trim().length,
        descLen: (c?.description ?? '').trim().length,
        indexed: !p.noindex,
      }
    })
  const rows = [...made, ...designed]
  const titleOff = (r: Row) => r.titleLen < TITLE_RANGE[0] || r.titleLen > TITLE_RANGE[1]
  const descOff = (r: Row) => r.descLen === 0 || r.descLen < DESCRIPTION_RANGE[0] || r.descLen > DESCRIPTION_RANGE[1]
  const issues = (r: Row) => {
    const out: string[] = []
    if (r.titleLen === 0) out.push(h('noTitle'))
    else if (titleOff(r)) out.push(h(r.titleLen > TITLE_RANGE[1] ? 'titleLong' : 'titleShort', { n: r.titleLen, min: TITLE_RANGE[0], max: TITLE_RANGE[1] }))
    if (r.descLen === 0) out.push(h('noDescription'))
    else if (descOff(r)) out.push(h(r.descLen > DESCRIPTION_RANGE[1] ? 'descLong' : 'descShort', { n: r.descLen, min: DESCRIPTION_RANGE[0], max: DESCRIPTION_RANGE[1] }))
    return out
  }
  const indexable = rows.filter((r) => r.indexed)
  const hits = redirects.rows.reduce((s, r) => s + r.hits, 0)
  const kpis = [
    { key: 'missing', value: indexable.filter((r) => r.descLen === 0).length, sub: h('ofIndexable', { n: indexable.length }) },
    { key: 'titleOff', value: rows.filter(titleOff).length, sub: h('outside', { min: TITLE_RANGE[0], max: TITLE_RANGE[1] }) },
    { key: 'notIndexed', value: rows.length - indexable.length, sub: h('onPurpose') },
    { key: 'redirects', value: redirects.rows.length, sub: h('hits', { n: hits }) },
  ]
  const sorted = [...rows].sort((a, b) => issues(b).length - issues(a).length)
  const sitemap = `https://${t('nav.siteDomain')}/sitemap.xml`

  return (
    <>
      {head(h('lead', { count: rows.length }))}
      <div className="grid gap-[16px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {kpis.map((k) => (
          <div key={k.key} className="rounded-panel border border-line bg-sf px-[22px] py-[20px]">
            <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{h(`kpi.${k.key}`)}</div>
            <div className="mt-[8px] text-[30px] font-bold leading-[1.15]">{k.value}</div>
            <div className="mt-[4px] text-[12.5px] text-mut">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-[18px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(300px,.9fr)]">
        <section className="min-w-0 rounded-panel border border-line bg-sf">
          <div className="px-[20px] pt-[20px]">
            <h2 className="m-0 font-display text-[22px] font-medium">{h('pages')}</h2>
            <div className="mt-[4px] text-[12.5px] text-mut">{h('ranges', { t0: TITLE_RANGE[0], t1: TITLE_RANGE[1], d0: DESCRIPTION_RANGE[0], d1: DESCRIPTION_RANGE[1] })}</div>
          </div>
          <ul className="m-0 mt-[10px] flex list-none flex-col p-0">
            {sorted.map((r) => {
              const list = issues(r)
              return (
                <li key={r.key} className="flex items-center gap-[14px] border-t border-line px-[20px] py-[13px]">
                  <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${list.length ? 'bg-peach' : 'bg-teal'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">
                      {r.title} <span className="text-[12.5px] font-normal text-mut">{r.path}</span>
                    </div>
                    <div className="text-[12.5px] text-mut">{list.length ? list.join(' · ') : h('inRange')}</div>
                  </div>
                  <span className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold">
                    <span aria-hidden="true" className={`block h-[6px] w-[6px] rounded-pill ${r.indexed ? 'bg-teal' : 'bg-mut'}`} />
                    {h(r.indexed ? 'indexed' : 'noindex')}
                  </span>
                  <Link href={r.href as Route} className={BTN.row}>
                    {h('edit')}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
            <div className="flex items-baseline justify-between gap-[12px]">
              <h2 className="m-0 font-display text-[22px] font-medium">{h('redirectsTitle')}</h2>
              <Link href={'/admin/cms/redirects' as Route} className="text-[12.5px] font-semibold text-link">
                {h('manage')}
              </Link>
            </div>
            <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
              {[...redirects.rows]
                .sort((a, b) => b.hits - a.hits)
                .slice(0, 6)
                .map((r) => (
                  <li key={r.from} className="flex items-center gap-[10px] border-b border-line py-[10px] text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.from}</span>
                    <span aria-hidden="true" className="opacity-50">
                      →
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.to}</span>
                    <span className="whitespace-nowrap text-[12px] text-mut">{h('hitsShort', { n: r.hits })}</span>
                  </li>
                ))}
            </ul>
            {redirects.rows.length ? null : <p className="mb-0 mt-[8px] text-[13px] text-mut">{h('noRedirects')}</p>}
          </section>
          <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
            <h2 className="m-0 font-display text-[22px] font-medium">{h('sitemap')}</h2>
            <div className="mt-[8px] text-[13px] leading-[1.55]">{h('sitemapLead')}</div>
            <a href={sitemap} target="_blank" rel="noopener noreferrer" className="mt-[12px] block truncate rounded-[12px] border border-line bg-bg px-[14px] py-[12px] text-[12.5px] font-semibold text-ink no-underline hover:text-ink">
              {sitemap}
            </a>
          </section>
        </div>
      </div>
    </>
  )
}
