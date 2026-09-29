import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CmsMessages } from '@/components/admin/CmsEditor'
import { BTN, PageHead, Problem } from '@/components/admin/ui'
import { cmsWriter } from '@/lib/admin/access'
import { isError, whoami } from '@/lib/admin/api'
import { cmsPages, cmsTemplates } from '@/lib/admin/cms'
import { parseContent } from '@/lib/cms/content'

/**
 * Content › Templates (X-095, the design's `isTemplates`): each template a page can be made from,
 * with the blocks it starts with in their order, how many pages were made from it, and «New page»
 * from it. The templates are written with the site (0114, X-094) — their blocks are drawn by the
 * site's own designed sections — so there is no «Edit» or «New template» here (D-168).
 */
const DOT: Record<string, string> = { landing: 'bg-viz1', splash: 'bg-viz3', document: 'bg-viz2', article: 'bg-viz5' }

export default async function CmsTemplates() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('cms') as CmsMessages
  const [templates, pages, who] = await Promise.all([cmsTemplates(), cmsPages(), whoami()])
  if (isError(templates) || isError(pages)) {
    const e = [templates, pages].find(isError)
    return <Problem text={e?.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const canWrite = cmsWriter(who?.role)
  const tp = (k: string, v?: Record<string, string | number>) => t(`cms.templatesPage.${k}`, v)
  const blockName = (b: string) => (m.editor.block as Record<string, string>)[b] ?? b

  return (
    <>
      <PageHead title={tp('title')} lead={tp('lead', { count: templates.rows.length })} />
      <div className="grid gap-[16px] [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        {templates.rows.map((x) => {
          const c = parseContent(x.content_no)
          const blocks = [tp('hero'), ...(c?.blocks ?? []).map((b) => blockName(b.t)), ...(c?.faq.length ? [tp('faq')] : []), ...(c?.finalTitle !== undefined ? [tp('closing')] : [])]
          const n = pages.rows.filter((p) => p.template === x.key && !p.archived).length
          return (
            <section key={x.key} className="flex flex-col gap-[12px] rounded-panel border border-line bg-sf px-[24px] py-[22px]">
              <div className="flex items-center gap-[10px]">
                <span aria-hidden="true" className={`block h-[10px] w-[10px] rounded-pill ${DOT[x.layout] ?? 'bg-line'}`} />
                <h2 className="m-0 flex-1 font-display text-[20px] font-medium">{x.name}</h2>
                <span className="rounded-pill border border-line px-[7px] py-[2px] text-[11px] font-semibold text-mut">{m.layout[x.layout]}</span>
              </div>
              <div className="text-[13px] leading-[1.5] text-mut [text-wrap:pretty]">{x.description}</div>
              <ul className="m-0 flex list-none flex-col gap-[4px] rounded-[12px] border border-line bg-bg px-[14px] py-[12px]">
                {blocks.map((b, i) => (
                  <li key={`${b}-${i}`} className="flex items-center gap-[8px] text-[12.5px]">
                    <span aria-hidden="true" className="block h-[6px] w-[6px] rounded-pill bg-line" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-center justify-between gap-[10px] border-t border-line pt-[12px]">
                <span className="text-[12.5px] text-mut">{tp('pages', { count: n, site: t('nav.siteName') })}</span>
                {canWrite ? (
                  <Link href={`/admin/cms/new?template=${x.key}` as Route} className={`${BTN.row} border-ink`}>
                    {tp('newPage')}
                  </Link>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>
      <p className="mb-0 mt-[14px] max-w-[90ch] text-[12px] leading-[1.55] text-mut md:px-[18px]">{tp('note')}</p>
    </>
  )
}
