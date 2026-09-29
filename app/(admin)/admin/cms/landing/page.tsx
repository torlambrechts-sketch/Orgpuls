import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CmsMessages } from '@/components/admin/CmsEditor'
import { SiteNoticeForm } from '@/components/admin/SiteNoticeForm'
import { Avatar, BTN, day, PageHead, Problem } from '@/components/admin/ui'
import { bareTitle, int } from '@/lib/admin/analytics'
import { isError, whoami } from '@/lib/admin/api'
import { cmsPages, cmsTemplates, cmsTraffic, localeState, siteNoticeAdmin } from '@/lib/admin/cms'
import { catalogues, designedMeta } from '@/lib/admin/cmsSite'
import { parseContent, pathOf } from '@/lib/cms/content'
import { designedPages } from '@/lib/cms/designed'

/**
 * Content › Landing & front pages (X-095, the design's `isLanding`): what visitors meet first —
 * the front page with its visits and sign-ups in the last 30 days, the site notice (the design's
 * «Splash page», 0123, as a notice on the public pages rather than a page that replaces them),
 * and every landing page, the designed ones and those made from a landing template, with visits,
 * conversion into sign-ups, state and who changed it last.
 */
const DAYS = 30
type Landing = { key: string; href: string; path: string; title: string; note: string; live: boolean; state: 'live' | 'draft' | 'scheduled' | 'changed'; author: string | null }

export default async function CmsLanding() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('cms') as CmsMessages
  const [pages, templates, traffic, notice, who, cat] = await Promise.all([cmsPages(), cmsTemplates(), cmsTraffic(DAYS), siteNoticeAdmin(), whoami(), catalogues()])
  const failed = [pages, templates, traffic, notice].find(isError)
  if (failed || isError(pages) || isError(templates) || isError(traffic) || isError(notice)) {
    return <Problem text={failed && isError(failed) && failed.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const l = (k: string, v?: Record<string, string | number>) => t(`cms.landingPage.${k}`, v)
  const byPath = new Map(traffic.rows.map((r) => [r.path, r]))
  const conv = (path: string) => {
    const r = byPath.get(path)
    if (!r || !r.visitors) return { visits: r?.views ?? 0, pct: null as string | null, signups: r?.signups ?? 0 }
    return { visits: r.views, pct: `${((100 * r.signups) / r.visitors).toFixed(1).replace('.', ',')} %`, signups: r.signups }
  }

  const home = designedPages().find((p) => p.path === '/')
  const homeTitle = home ? bareTitle((designedMeta(home, cat).no ?? designedMeta(home, cat).en)?.title ?? '/') : '/'
  const front = conv('/')

  const landingTemplates = new Set(templates.rows.filter((x) => x.layout === 'landing' || x.layout === 'splash').map((x) => x.key))
  const made: Landing[] = pages.rows
    .filter((p) => !p.archived && landingTemplates.has(p.template))
    .map((p) => {
      const first = p.locales.find((x) => x.locale === 'no') ?? p.locales[0]
      const c = parseContent(first?.draft ?? {})
      const states = p.locales.map(localeState)
      return {
        key: p.id,
        href: `/admin/cms/${p.id}`,
        path: pathOf(p.kind, p.slug),
        title: bareTitle(c?.h1 || c?.title || p.slug),
        note: templates.rows.find((x) => x.key === p.template)?.name ?? p.template,
        live: states.includes('live') || states.includes('changed'),
        state: states.includes('live') ? 'live' : states.includes('changed') ? 'changed' : states.includes('scheduled') ? 'scheduled' : 'draft',
        author: p.author ?? null,
      }
    })
  const designed: Landing[] = designedPages()
    .filter((p) => p.group === 'landing' || p.group === 'industry')
    .map((p) => ({
      key: p.path,
      href: `/admin/cms/site?path=${encodeURIComponent(p.path)}`,
      path: p.path,
      title: bareTitle((designedMeta(p, cat).no ?? designedMeta(p, cat).en)?.title ?? p.path),
      note: m.group[p.group],
      live: true,
      state: 'live',
      author: null,
    }))
  const rows = [...made, ...designed]
  const dot = (s: Landing['state']) => (s === 'live' ? 'bg-teal' : 'bg-ac')

  return (
    <>
      <PageHead title={l('title')} lead={l('lead', { site: t('nav.siteDomain'), count: rows.length })}>
        {canWrite ? (
          <Link href={'/admin/cms/new?template=landingsside' as Route} className={BTN.primary}>
            {l('new')}
          </Link>
        ) : null}
      </PageHead>

      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
          <div className="flex items-baseline justify-between gap-[12px]">
            <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{l('front')}</div>
            <span className="inline-flex items-center gap-[6px] rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold">
              <span aria-hidden="true" className="block h-[6px] w-[6px] rounded-pill bg-teal" />
              {l('live')}
            </span>
          </div>
          <h2 className="mb-0 mt-[10px] font-display text-[22px] font-medium">{homeTitle}</h2>
          <div className="mt-[4px] text-[12.5px] text-mut">{l('frontNote', { site: t('nav.siteDomain') })}</div>
          <div className="mt-[16px] flex flex-wrap gap-[18px] rounded-[12px] border border-line bg-bg px-[16px] py-[14px]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{l('visits', { days: DAYS })}</div>
              <div className="mt-[2px] text-[22px] font-bold">{int(front.visits)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{l('conversion')}</div>
              <div className="mt-[2px] text-[22px] font-bold">
                {front.pct ?? '—'} <span className="text-[12.5px] font-medium text-mut">{l('signups', { count: front.signups })}</span>
              </div>
            </div>
          </div>
          <div className="mt-[16px] flex gap-[10px]">
            <Link href={'/admin/cms/site?path=%2F' as Route} className={BTN.secondary}>
              {l('editFront')}
            </Link>
          </div>
        </section>

        <section className="relative rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
          <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{l('notice')}</div>
          <h2 className="mb-0 mt-[10px] font-display text-[22px] font-medium">{notice.no ?? l('noticeTitle')}</h2>
          <div className="mt-[4px] text-[12.5px] text-mut">
            {notice.on ? l('noticeOn', { by: notice.by ?? '—', at: notice.at ? day(notice.at) : '—' }) : l('noticeOff')}
          </div>
          <div className="mt-[16px] rounded-[12px] border border-line bg-bg px-[16px] py-[14px] text-[13px] leading-[1.55] [text-wrap:pretty]">{l('noticeExplain')}</div>
          <SiteNoticeForm
            on={notice.on}
            no={notice.no ?? ''}
            en={notice.en ?? ''}
            canWrite={canWrite}
            labels={{
              switch: l('noticeSwitch'),
              edit: l('noticeEdit'),
              no: l('noticeNo'),
              en: l('noticeEn'),
              save: l('noticeSave'),
              saving: t('common.saving'),
              done: t('common.done'),
              problems: { not_allowed: t('common.notAllowed'), invalid: l('noticeInvalid'), text_required: l('noticeTextRequired'), failed: t('common.failed') },
            }}
          />
        </section>
      </div>

      <section className="mt-[18px] rounded-panel border border-line bg-sf">
        <div className="px-[20px] pt-[20px]">
          <h2 className="m-0 font-display text-[22px] font-medium">{l('pages')}</h2>
          <div className="mt-[4px] text-[12.5px] text-mut">{l('pagesLead')}</div>
        </div>
        <div className="relative mt-[14px] overflow-x-auto">
          <div className="min-w-[660px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="flex-[2.2]">{l('col.page')}</span>
              <span className="flex-[1.4]">{l('col.visits')}</span>
              <span className="w-[92px]">{l('col.status')}</span>
              <span className="w-[36px]">{l('col.owner')}</span>
              <span className="w-[112px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {rows.map((r) => {
                const c = conv(r.path)
                return (
                  <li key={r.key} className="flex items-center gap-[14px] border-b border-line px-[20px] py-[14px] last:border-b-0">
                    <div className="min-w-0 flex-[2.2]">
                      <div className="truncate font-semibold">{r.title}</div>
                      <div className="truncate text-[12.5px] text-mut">
                        {t('nav.siteDomain')}
                        {r.path} · {r.note}
                      </div>
                    </div>
                    <div className="flex-[1.4] text-[13px]">
                      {r.live ? (
                        <>
                          <b>{int(c.visits)}</b> <span className="text-mut">{l('visitsWord')}</span> · <b>{c.pct ?? '—'}</b>{' '}
                          <span className="text-mut">{l('signups', { count: c.signups })}</span>
                        </>
                      ) : (
                        <span className="text-mut">{l('notLive')}</span>
                      )}
                    </div>
                    <div className="w-[92px]">
                      <span className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold">
                        <span aria-hidden="true" className={`block h-[6px] w-[6px] rounded-pill ${dot(r.state)}`} />
                        {t(`cms.hub.state.${r.state}`)}
                      </span>
                    </div>
                    <div className="w-[36px]">{r.author ? <Avatar name={r.author.split('@')[0] ?? r.author} /> : null}</div>
                    <div className="flex w-[112px] justify-end">
                      <Link href={r.href as Route} className={BTN.row}>
                        {l('edit')}
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}
