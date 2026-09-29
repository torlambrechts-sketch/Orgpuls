import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CmsMessages } from '@/components/admin/CmsEditor'
import { Icon } from '@/components/admin/icons'
import { Avatar, BTN, day, PageHead, Problem, Segments } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { cmsPages, cmsTemplates, localeState, type CmsPage } from '@/lib/admin/cms'
import { catalogues, designedMeta } from '@/lib/admin/cmsSite'
import { CMS_LOCALES, parseContent, pathOf, type CmsLocale } from '@/lib/cms/content'
import { designedPages, type DesignedGroup } from '@/lib/cms/designed'
import { bareTitle } from '@/lib/admin/analytics'

/**
 * Content › Pages (X-095, the design's `isPages`; X-094 before it): every page of the public site in
 * one list — the designed pages, whose words are edited here and in Languages, and the pages made
 * from templates — with its kind, address, template, when it was last changed, its languages, its
 * state and who changed it last. Search and the design's segments (all, pages, articles, drafts,
 * scheduled) filter it. The search score and the traffic are on SEO and Analytics.
 */
const SEGS = ['all', 'pages', 'articles', 'drafts', 'scheduled', 'archived'] as const
type Seg = (typeof SEGS)[number]
type State = 'live' | 'changed' | 'scheduled' | 'draft' | 'archived'
const STATE_DOT: Record<State, string> = { live: 'bg-teal', changed: 'bg-ac', scheduled: 'bg-ac', draft: 'bg-ac', archived: 'bg-mut' }

type Row = {
  key: string
  href: string
  path: string
  title: string
  article: boolean
  kind: string
  template: string
  langs: { lang: CmsLocale; state: 'live' | 'changed' | 'scheduled' | 'draft' | 'archived' | 'missing' }[]
  state: State
  updated: string | null
  author: string | null
}

export default async function CmsHub({ searchParams }: { searchParams: Promise<{ s?: string; q?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('cms') as CmsMessages
  const sp = await searchParams
  const seg: Seg = (SEGS as readonly string[]).includes(sp.s ?? '') ? (sp.s as Seg) : 'all'
  const q = (sp.q ?? '').trim().toLowerCase().slice(0, 80)

  const [pages, templates, who, cat] = await Promise.all([cmsPages(), cmsTemplates(), whoami(), catalogues()])
  if (isError(pages) || isError(templates)) {
    const e = [pages, templates].find(isError)
    return <Problem text={e?.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const templateName = new Map(templates.rows.map((x) => [x.key, x.name]))
  const h = (k: string, v?: Record<string, string | number>) => t(`cms.hub.${k}`, v)

  const designed: Row[] = designedPages().map((p) => {
    const meta = designedMeta(p, cat)
    const first = meta.no ?? meta.en
    return {
      key: p.path,
      href: `/admin/cms/site?path=${encodeURIComponent(p.path)}`,
      path: p.path,
      title: bareTitle(first?.title ?? p.path),
      article: p.group === 'article',
      kind: m.group[p.group as DesignedGroup],
      template: h('designed'),
      langs: CMS_LOCALES.map((lang) => ({ lang, state: meta[lang] ? ('live' as const) : ('missing' as const) })),
      state: 'live',
      updated: null,
      author: null,
    }
  })

  const made: Row[] = pages.rows.map((p: CmsPage) => {
    const first = p.locales.find((l) => l.locale === 'no') ?? p.locales[0]
    const c = parseContent(first?.draft ?? {})
    const states = p.locales.map((l) => localeState(l))
    const state: State = p.archived
      ? 'archived'
      : states.includes('live')
        ? 'live'
        : states.includes('changed')
          ? 'changed'
          : states.includes('scheduled')
            ? 'scheduled'
            : 'draft'
    return {
      key: p.id,
      href: `/admin/cms/${p.id}`,
      path: pathOf(p.kind, p.slug),
      title: bareTitle(c?.h1 || c?.title || p.slug),
      article: p.kind === 'article',
      kind: p.kind === 'article' ? m.group.article : h('page'),
      template: templateName.get(p.template) ?? p.template,
      langs: CMS_LOCALES.map((lang) => {
        const l = p.locales.find((x) => x.locale === lang)
        return { lang, state: l ? (p.archived ? ('archived' as const) : localeState(l)) : ('missing' as const) }
      }),
      state,
      updated: p.updated_at,
      author: p.author ?? null,
    }
  })

  const all = [...made, ...designed]
  const inSeg = (r: Row, s: Seg) =>
    s === 'all'
      ? r.state !== 'archived'
      : s === 'pages'
        ? !r.article && r.state !== 'archived'
        : s === 'articles'
          ? r.article && r.state !== 'archived'
          : s === 'drafts'
            ? r.state === 'draft'
            : s === 'scheduled'
              ? r.state === 'scheduled'
              : r.state === 'archived'
  const matches = (r: Row) => !q || `${r.path} ${r.title}`.toLowerCase().includes(q)
  const shown = all.filter((r) => inSeg(r, seg) && matches(r))
  const published = all.filter((r) => r.state === 'live' || r.state === 'changed').length
  const href = (s: Seg) => `/admin/cms?${new URLSearchParams(Object.entries({ s: s === 'all' ? '' : s, q }).filter(([, v]) => v)).toString()}`

  return (
    <>
      <PageHead title={m.title} lead={h('lead', { published, total: all.filter((r) => r.state !== 'archived').length, site: t('nav.siteDomain') })}>
        {canWrite ? (
          <Link href={'/admin/cms/new' as Route} className={BTN.primary}>
            {h('new')}
          </Link>
        ) : null}
      </PageHead>

      <section className="rounded-panel border border-line bg-sf">
        <div className="flex flex-wrap items-center gap-[10px] px-[20px] py-[16px]">
          <form method="get" action="/admin/cms" role="search" className="flex h-[38px] items-center gap-[8px] rounded-ctl border border-line bg-bg px-[13px]">
            <span className="flex-none text-mut">
              <Icon name="search" size={14} />
            </span>
            {seg !== 'all' ? <input type="hidden" name="s" value={seg} /> : null}
            <input name="q" defaultValue={q} placeholder={h('search')} aria-label={h('searchLabel')} className="box-border w-[172px] max-w-full border-0 bg-transparent text-[13px] text-ink outline-none" />
          </form>
          <Segments label={h('segments')} items={SEGS.filter((s) => s !== 'archived' || seg === 'archived' || all.some((r) => r.state === 'archived')).map((s) => ({ key: s, label: h(`seg.${s}`), n: all.filter((r) => inSeg(r, s) && matches(r)).length, href: href(s), on: s === seg }))} />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[660px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-y border-line px-[20px] pb-[10px] pt-[12px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="flex-[2.2]">{h('col.page')}</span>
              <span className="flex-[1.4]">{h('col.languages')}</span>
              <span className="w-[96px]">{h('col.status')}</span>
              <span className="w-[36px]">{h('col.author')}</span>
              <span className="w-[112px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {shown.map((r) => {
                const have = r.langs.filter((l) => l.state !== 'missing').length
                return (
                  <li key={r.key} className="relative flex items-center gap-[14px] border-b border-line px-[20px] py-[14px] hover:bg-bg">
                    <div className="min-w-0 flex-[2.2]">
                      <div className="flex items-center gap-[8px] font-semibold">
                        <Link href={r.href as Route} className="min-w-0 truncate text-ink no-underline after:absolute after:inset-0 hover:text-ink hover:no-underline">
                          {r.title}
                        </Link>
                        <span className="flex-none rounded-pill border border-line px-[7px] py-[2px] text-[11px] font-semibold text-mut">{r.kind}</span>
                      </div>
                      <div className="truncate text-[12.5px] text-mut">
                        {h('meta', { path: `${t('nav.siteDomain')}${r.path}`, template: r.template, updated: r.updated ? day(r.updated) : h('inCode') })}
                      </div>
                    </div>
                    <div className="flex flex-[1.4] items-center gap-[10px]">
                      <span className="flex gap-[4px]">
                        {r.langs.map((l) => (
                          <span
                            key={l.lang}
                            title={h(`lang.${l.state}`)}
                            className={`rounded-pill border border-line px-[7px] py-[3px] text-[10.5px] font-bold ${l.state === 'live' || l.state === 'changed' ? 'bg-teal' : l.state === 'missing' ? '' : 'bg-sbg'}`}
                          >
                            {l.lang.toUpperCase()}
                          </span>
                        ))}
                      </span>
                      <span className="whitespace-nowrap text-[12.5px]">
                        <b>{Math.round((100 * have) / r.langs.length)} %</b> <span className="text-mut">{`${have}/${r.langs.length}`}</span>
                      </span>
                    </div>
                    <div className="w-[96px]">
                      <span className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold">
                        <span aria-hidden="true" className={`block h-[6px] w-[6px] rounded-pill ${STATE_DOT[r.state]}`} />
                        {h(`state.${r.state}`)}
                      </span>
                    </div>
                    <div className="w-[36px]">{r.author ? <Avatar name={r.author.split('@')[0] ?? r.author} /> : null}</div>
                    <div className="relative flex w-[112px] justify-end">
                      <Link href={r.href as Route} className={BTN.row} tabIndex={-1} aria-hidden="true">
                        {h('open')}
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
            {shown.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{h('none')}</p>}
          </div>
        </div>
      </section>
      <p className="mb-0 mt-[14px] max-w-[90ch] text-[12px] leading-[1.55] text-mut md:px-[18px]">{h('note')}</p>
    </>
  )
}
