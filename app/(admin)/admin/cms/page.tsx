import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LayoutThumb, ScorePill, StateChip } from '@/components/admin/CmsVisuals'
import type { CmsMessages } from '@/components/admin/CmsEditor'
import { Card, day, PageHead, Problem, Stat, Table, Td } from '@/components/admin/ui'
import { ButtonLink } from '@/components/ui/Button'
import { isError, whoami } from '@/lib/admin/api'
import { cmsPages, cmsTemplates, cmsTraffic, localeState, type CmsPage } from '@/lib/admin/cms'
import { catalogues, designedMeta } from '@/lib/admin/cmsSite'
import { CMS_LOCALES, parseContent, pathOf, type CmsLocale } from '@/lib/cms/content'
import { designedPages, type DesignedGroup } from '@/lib/cms/designed'
import { seoScore } from '@/lib/cms/seo'

/**
 * The site's pages (X-094): every public page in one list, the designed ones beside the ones made
 * from templates, each with its languages and their state, its search score, and what it brought in
 * the last 30 days. Filtered by kind, state and text; the templates to start a new page from are at
 * the foot.
 */
const FILTERS = ['all', 'designed', 'cms', 'articles', 'drafts', 'attention', 'archived'] as const
type Filter = (typeof FILTERS)[number]
const DAYS = 30

type Row = {
  key: string
  href: string
  path: string
  title: string
  kind: { designed: DesignedGroup } | { template: string }
  langs: { lang: CmsLocale; state: 'live' | 'changed' | 'scheduled' | 'draft' | 'archived' }[]
  score: number
  updated: string | null
  article: boolean
  live: boolean
  archived: boolean
}

export default async function CmsHub({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('cms') as CmsMessages
  const sp = await searchParams
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.f ?? '') ? (sp.f as Filter) : 'all'
  const q = (sp.q ?? '').trim().toLowerCase().slice(0, 80)

  const [pages, traffic, templates, who, cat] = await Promise.all([cmsPages(), cmsTraffic(DAYS), cmsTemplates(), whoami(), catalogues()])
  if (isError(pages) || isError(traffic) || isError(templates)) {
    const e = [pages, traffic, templates].find(isError)
    return <Problem text={e?.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const byPath = new Map(traffic.rows.map((r) => [r.path, r]))
  const templateName = new Map(templates.rows.map((x) => [x.key, x.name]))

  // ---------------------------------------------------------------- the designed pages
  const designed: Row[] = designedPages().map((p) => {
    const meta = designedMeta(p, cat)
    const langs = CMS_LOCALES.filter((l) => meta[l]).map((lang) => ({ lang, state: 'live' as const }))
    const first = meta.no ?? meta.en
    const s = seoScore({ layout: 'designed', fixed: true, slug: p.path.slice(1), keyword: '', noindex: false, twin: langs.length > 1, title: first?.title ?? '', description: first?.description ?? '' })
    return {
      key: p.path,
      href: `/admin/cms/site?path=${encodeURIComponent(p.path)}`,
      path: p.path,
      title: first?.title ?? p.path,
      kind: { designed: p.group },
      langs,
      score: s.score,
      updated: null,
      article: p.group === 'article',
      live: true,
      archived: false,
    }
  })

  // ---------------------------------------------------------------- the pages made here
  const made: Row[] = pages.rows.map((p: CmsPage) => {
    const first = p.locales.find((l) => l.locale === 'no') ?? p.locales[0]
    const c = parseContent(first?.draft ?? {})
    const s = seoScore({
      layout: p.layout,
      slug: p.slug,
      keyword: p.focus_keyword ?? '',
      noindex: p.noindex,
      twin: p.locales.length > 1,
      title: c?.title ?? '',
      description: c?.description ?? '',
      body: c ? { h1: c.h1, lead: c.lead, blocks: c.blocks, faq: c.faq, sources: c.sources, raw: first?.draft } : undefined,
    })
    return {
      key: p.id,
      href: `/admin/cms/${p.id}`,
      path: pathOf(p.kind, p.slug),
      title: c?.h1 || c?.title || p.slug,
      kind: { template: templateName.get(p.template) ?? p.template },
      langs: p.locales.map((l) => ({ lang: l.locale, state: p.archived ? ('archived' as const) : localeState(l) })),
      score: s.score,
      updated: p.updated_at,
      article: p.kind === 'article',
      live: !p.archived && p.locales.some((l) => l.current),
      archived: p.archived,
    }
  })

  const all = [...made, ...designed]
  const shown = all.filter((r) => {
    if (q && !`${r.path} ${r.title}`.toLowerCase().includes(q)) return false
    switch (filter) {
      case 'designed':
        return 'designed' in r.kind
      case 'cms':
        return 'template' in r.kind && !r.archived
      case 'articles':
        return r.article && !r.archived
      case 'drafts':
        return !r.live && !r.archived
      case 'attention':
        return r.score < 70 && !r.archived
      case 'archived':
        return r.archived
      default:
        return !r.archived
    }
  })

  const liveMade = made.filter((r) => r.live).length
  const drafts = made.filter((r) => !r.live && !r.archived).length
  const scheduled = pages.rows.filter((p) => !p.archived && p.locales.some((l) => l.pending_at && new Date(l.pending_at) > new Date())).length
  const views = traffic.rows.reduce((s, r) => s + r.views, 0)
  const signups = traffic.rows.reduce((s, r) => s + r.signups, 0)

  const chip = (f: Filter) => {
    const href = `/admin/cms?f=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`
    return (
      <a
        key={f}
        href={href}
        aria-current={f === filter ? 'page' : undefined}
        className={`inline-flex h-[32px] items-center rounded-pill border px-[13px] text-[12.5px] font-semibold no-underline hover:no-underline ${
          f === filter ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'
        }`}
      >
        {m.filter[f]}
      </a>
    )
  }

  return (
    <>
      <PageHead title={m.title} lead={m.lead}>
        <span className="flex flex-wrap gap-[8px]">
          <ButtonLink href={'/admin/cms/redirects' as Route} size="sm" tone="secondary">
            {m.redirectsLink}
          </ButtonLink>
          {canWrite ? (
            <ButtonLink href={'/admin/cms/new' as Route} size="sm">
              + {m.new}
            </ButtonLink>
          ) : null}
        </span>
      </PageHead>

      <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
        <Stat label={m.stats.site} value={designed.length + liveMade} hint={m.stats.siteHint.replace('{designed}', String(designed.length)).replace('{cms}', String(liveMade))} />
        <Stat label={m.stats.live} value={liveMade} />
        <Stat label={m.stats.drafts} value={drafts} />
        <Stat label={m.stats.scheduled} value={scheduled} />
        <Stat label={m.stats.views.replace('{days}', String(DAYS))} value={views.toLocaleString('en-GB')} />
        <Stat label={m.stats.signups.replace('{days}', String(DAYS))} value={signups} hint={m.stats.signupsHint} />
      </div>

      <Card className="mt-[14px]">
        <div className="mb-[12px] flex flex-wrap items-center gap-[8px]">
          <nav aria-label={m.filter.label} className="flex flex-wrap gap-[6px]">
            {FILTERS.map(chip)}
          </nav>
          <form action="/admin/cms" className="ml-auto flex gap-[6px]" role="search">
            <input type="hidden" name="f" value={filter} />
            <label className="sr-only" htmlFor="cms-q">
              {m.filter.search}
            </label>
            <input
              id="cms-q"
              name="q"
              defaultValue={q}
              placeholder={m.filter.search}
              className="box-border h-[32px] w-[220px] rounded-pill border border-line bg-bg px-[13px] text-[12.5px] outline-none focus-visible:border-ink"
            />
          </form>
        </div>
        <Table
          head={[m.table.page, m.table.type, m.table.languages, m.table.seo, m.table.views, m.table.visitors, m.table.cta, m.table.signups, m.table.updated]}
          empty={shown.length ? undefined : m.table.empty}
        >
          {shown.map((r) => {
            const tr = byPath.get(r.path)
            return (
              <tr key={r.key}>
                <Td wrap className="min-w-[240px]">
                  <Link href={r.href as Route} className="font-semibold text-link">
                    {r.title}
                  </Link>
                  <span className="mt-[2px] block font-mono text-[11.5px] text-mut">{r.path}</span>
                </Td>
                <Td>
                  {'designed' in r.kind ? (
                    <span className="text-[12px]">
                      <span className="font-semibold">{m.designedBadge}</span> <span className="text-mut">· {m.group[r.kind.designed]}</span>
                    </span>
                  ) : (
                    <span className="text-[12px] font-semibold">{r.kind.template}</span>
                  )}
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-[4px]">
                    {r.langs.length ? r.langs.map((l) => <StateChip key={l.lang} lang={l.lang} state={l.state} label={m.state[l.state]} />) : m.state.none}
                  </span>
                </Td>
                <Td>
                  <ScorePill score={r.score} label={m.table.seo} />
                </Td>
                <Td>{tr?.views ?? 0}</Td>
                <Td>{tr?.visitors ?? 0}</Td>
                <Td>{tr?.cta ?? 0}</Td>
                <Td>{tr?.signups ?? 0}</Td>
                <Td className="text-mut">{r.updated ? day(r.updated) : '—'}</Td>
              </tr>
            )
          })}
        </Table>
        <p className="mb-0 mt-[10px] text-[12px] text-mut">{m.table.note.replace('{days}', String(DAYS))}</p>
      </Card>

      <Card title={m.templates.title} className="mt-[14px]">
        <p className="m-0 mb-[14px] max-w-[80ch] text-[13px] leading-[1.55] text-mut">{m.templates.lead}</p>
        <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {templates.rows.map((x) => {
            const body = (
              <>
                <LayoutThumb layout={x.layout} />
                <span className="mt-[9px] flex items-center justify-between gap-[8px]">
                  <span className="text-[13.5px] font-bold text-ink">{x.name}</span>
                  <span className="rounded-pill bg-track px-[8px] py-[2px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-mut">{m.layout[x.layout]}</span>
                </span>
                <span className="mt-[5px] block text-[12px] leading-[1.5] text-mut">{x.description}</span>
              </>
            )
            return canWrite ? (
              <Link key={x.key} href={`/admin/cms/new?template=${x.key}` as Route} className="block rounded-panel border border-line bg-bg p-[12px] no-underline hover:border-ink hover:no-underline" aria-label={`${m.templates.use}: ${x.name}`}>
                {body}
              </Link>
            ) : (
              <div key={x.key} className="rounded-panel border border-line bg-bg p-[12px]">
                {body}
              </div>
            )
          })}
        </div>
      </Card>
    </>
  )
}
