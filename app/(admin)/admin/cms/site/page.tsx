import type { Route } from 'next'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { ScoreRing, SeoChecklist, SerpPreview } from '@/components/admin/CmsVisuals'
import type { CmsMessages } from '@/components/admin/CmsEditor'
import { MessageEditForm } from '@/components/admin/TranslationForms'
import Link from 'next/link'
import { BTN, Card, Problem, Stat } from '@/components/admin/ui'
import { bareTitle } from '@/lib/admin/analytics'
import { isError, whoami } from '@/lib/admin/api'
import { cmsTraffic } from '@/lib/admin/cms'
import { catalogues, designedMeta } from '@/lib/admin/cmsSite'
import { CMS_LOCALES } from '@/lib/cms/content'
import { designedPages } from '@/lib/cms/designed'
import { seoScore, type SeoCheck } from '@/lib/cms/seo'
import { ADMIN_HOST, EN_HOST, EN_URL, hostOf, MAIN_HOST, MAIN_URL } from '@/lib/hosts'

/**
 * A designed page in the CMS (X-094): its title and description as Google shows them in each
 * language, their score, its traffic, and the two texts edited in place (message overrides, 0101,
 * a super-admin's). Every other word on the page is in Translations, page by page.
 */
const DAYS = 30

export default async function CmsSitePage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('cms') as CmsMessages
  const { path = '' } = await searchParams
  const page = designedPages().find((p) => p.path === path)
  if (!page) return <Problem text={m.site.notFound} />

  const [traffic, who, cat] = await Promise.all([cmsTraffic(DAYS), whoami(), catalogues()])
  if (isError(traffic)) return <Problem text={traffic.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const meta = designedMeta(page, cat)
  const row = traffic.rows.find((r) => r.path === page.path)
  const onAdmin = hostOf((await headers()).get('host')) === ADMIN_HOST
  const hosts = { no: onAdmin ? MAIN_HOST : 'www.orgpuls.com', en: EN_HOST }
  const origins = { no: onAdmin ? MAIN_URL : '', en: onAdmin ? EN_URL : '' }
  const langs = CMS_LOCALES.filter((l) => meta[l])
  const checkText = (c: SeoCheck) => ((m.check as Record<string, Record<string, string>>)[c.id]?.[c.level] ?? c.id).replace('{n}', String(c.n ?? 0))
  const title = bareTitle(meta.no?.title ?? meta.en?.title ?? page.path)
  const superAdmin = who?.role === 'super_admin'
  const editLabels = {
    edit: '',
    bokmal: m.language.no,
    english: m.language.en,
    save: t('common.save'),
    saving: t('common.saving'),
    done: t('common.done'),
    problems: { ...(m.problem as Record<string, string>), unchanged: t('translations.site.unchanged') },
  }

  return (
    <>
      {/* the bar, as the design's page detail draws it (X-095) — the same as a template page's */}
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-[14px] md:px-[18px]">
        <div className="min-w-0">
          <nav aria-label={m.editor.back} className="flex items-center gap-[8px] text-[12.5px]">
            <Link href={'/admin/cms' as Route} className="text-ink no-underline hover:text-ink hover:underline">
              {m.editor.back}
            </Link>
            <span aria-hidden="true" className="text-mut">
              →
            </span>
            <b className="truncate">{title}</b>
          </nav>
          <h1 className="m-0 mt-[8px] font-display text-[28px] font-medium leading-[1.15]">{title}</h1>
          <p className="m-0 mt-[8px] flex flex-wrap items-center gap-[8px] text-[12.5px] text-mut">
            <span className="inline-flex items-center gap-[6px] rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold text-ink">
              <span aria-hidden="true" className="block h-[6px] w-[6px] rounded-pill bg-teal" />
              {m.state.live}
            </span>
            <span>
              {hosts.no}
              {page.path === '/' ? '' : page.path}
            </span>
            <span aria-hidden="true">·</span>
            <span>{m.group[page.group]}</span>
          </p>
          <p className="m-0 mt-[8px] max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">{page.industry ? m.site.industryLead : m.site.lead}</p>
        </div>
        <span className="flex flex-wrap gap-[10px]">
          {langs.map((l) => (
            <a key={l} href={`${origins[l]}${page.path}`} target="_blank" rel="noopener" className={BTN.secondary}>
              {hosts[l]}
              {page.path === '/' ? '' : page.path} ↗
            </a>
          ))}
        </span>
      </div>

      <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
        <Stat label={m.table.views} value={row?.views ?? 0} hint={m.stats.views.replace('{days}', String(DAYS))} />
        <Stat label={m.table.visitors} value={row?.visitors ?? 0} />
        <Stat label={m.table.cta} value={row?.cta ?? 0} />
        <Stat label={m.table.signups} value={row?.signups ?? 0} hint={m.stats.signupsHint} />
      </div>

      <div className="mt-[14px] grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        {langs.map((l) => {
          const x = meta[l]!
          const s = seoScore({ layout: 'designed', fixed: true, slug: page.path.slice(1), keyword: '', noindex: false, twin: langs.length > 1, title: x.title, description: x.description })
          return (
            <Card key={l} title={`${m.site.meta} · ${m.language[l]}`}>
              <SerpPreview host={hosts[l]} path={page.path} title={x.title} description={x.description} empty="—" />
              <div className="mt-[14px] flex items-start gap-[14px]">
                <ScoreRing score={s.score} size={60} label={m.editor.seo.score} />
                <SeoChecklist checks={s.checks} text={checkText} />
              </div>
            </Card>
          )
        })}
      </div>

      {!page.industry && page.title && page.description ? (
        <Card title={m.site.meta} className="mt-[14px]">
          {page.suffix ? <p className="m-0 mb-[10px] text-[12.5px] text-mut">{m.site.suffix.replace('{suffix}', page.suffix)}</p> : null}
          {superAdmin ? (
            <div className="flex flex-col gap-[16px]">
              <div>
                <span className="block text-[12.5px] font-bold">{m.site.title}</span>
                <MessageEditForm path={page.title} no={cat.no(page.title)} en={cat.en(page.title)} labels={{ ...editLabels, edit: m.site.editTitle }} />
              </div>
              <div>
                <span className="block text-[12.5px] font-bold">{m.site.description}</span>
                <MessageEditForm path={page.description} no={cat.no(page.description)} en={cat.en(page.description)} labels={{ ...editLabels, edit: m.site.editDescription }} />
              </div>
            </div>
          ) : (
            <p className="m-0 text-[13px] text-mut">{m.site.superOnly}</p>
          )}
          <p className="mb-0 mt-[14px] text-[13px]">
            {m.site.texts}:{' '}
            <a href={`/admin/translations?view=pages&site=${encodeURIComponent(page.path)}` as Route} className="font-semibold text-link">
              {m.site.textsLink}
            </a>
          </p>
        </Card>
      ) : null}
    </>
  )
}
