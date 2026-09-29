import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { MediaDescribe, MediaUpload } from '@/components/admin/MediaForms'
import { day, PageHead, Problem } from '@/components/admin/ui'
import { cmsWriter } from '@/lib/admin/access'
import { isError, whoami } from '@/lib/admin/api'
import { cmsMedia, type Media } from '@/lib/admin/cms'
import { pathOf } from '@/lib/cms/content'
import { mediaSrc } from '@/lib/cms/media'

/**
 * Content › Media (X-095, the design's `isMedia`; 0124, D-169): every image a page can show, with
 * its size, the words a reader who cannot see it is given, and the pages it is used on. «Upload»
 * makes a web version in the browser and adds it; a card opens its details, where its words are
 * edited and an unused image is deleted.
 */
const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

export default async function CmsMedia({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await searchParams
  const [media, who] = await Promise.all([cmsMedia(), whoami()])
  if (isError(media)) return <Problem text={media.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = cmsWriter(who?.role)
  const l = (k: string, v?: Record<string, string | number>) => t(`cms.mediaPage.${k}`, v)
  const rows = media.rows
  const open = rows.find((r) => r.id === sp.m) ?? null
  const unused = rows.filter((r) => r.pages.length === 0).length
  const problems = Object.fromEntries(['not_allowed', 'invalid', 'type', 'too_large', 'unreadable', 'not_found', 'in_use', 'failed'].map((k) => [k, l(`problem.${k}`)]))
  const meta = (r: Media) => l('meta', { size: size(r.bytes), w: r.width, h: r.height })

  return (
    <>
      <PageHead title={l('title')} lead={rows.length ? l('lead', { count: rows.length, unused }) : l('leadEmpty')}>
        {canWrite ? (
          <MediaUpload
            labels={{
              open: l('upload'),
              title: l('uploadTitle'),
              lead: l('uploadLead'),
              file: l('file'),
              altNo: l('altNo'),
              altEn: l('altEn'),
              altHint: l('altHint'),
              cancel: l('cancel'),
              close: l('close'),
              submit: l('uploadSubmit'),
              working: l('working'),
              problems,
            }}
          />
        ) : null}
      </PageHead>

      {open ? (
        <section aria-labelledby="media-open" className="mb-[18px] grid gap-[20px] rounded-panel border border-line bg-sf px-[20px] py-[20px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:px-[26px] md:py-[24px]">
          <div className="min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- the library's own web-sized file */}
            <img src={mediaSrc(open.key)} alt={open.alt_en || open.alt_no} width={open.width} height={open.height} className="block h-auto max-h-[420px] w-auto max-w-full rounded-[12px] border border-line bg-bg" />
            <div className="mt-[10px] text-[12.5px] text-mut">
              {meta(open)} · {l('added', { date: day(open.created_at), by: open.by ?? '—' })}
            </div>
            <div className="mt-[4px] break-all text-[12px] text-mut">{mediaSrc(open.key)}</div>
          </div>
          <div className="flex min-w-0 flex-col gap-[16px]">
            <div className="flex items-start justify-between gap-[12px]">
              <h2 id="media-open" className="m-0 min-w-0 font-display text-[22px] font-medium [overflow-wrap:anywhere]">
                {open.name}
              </h2>
              <Link href={'/admin/cms/media' as Route} aria-label={l('close')} title={l('close')} className="flex h-[36px] w-[36px] flex-none items-center justify-center rounded-pill border border-line text-[18px] text-ink no-underline hover:text-ink hover:no-underline">
                ×
              </Link>
            </div>
            <MediaDescribe
              key={`${open.id}-${open.name}-${open.alt_no}-${open.alt_en}`}
              id={open.id}
              name={open.name}
              altNo={open.alt_no}
              altEn={open.alt_en}
              used={open.pages.length > 0}
              canWrite={canWrite}
              labels={{
                name: l('name'),
                altNo: l('altNo'),
                altEn: l('altEn'),
                save: l('save'),
                saving: t('common.saving'),
                saved: t('common.done'),
                remove: l('delete'),
                removeConfirm: l('deleteConfirm', { name: open.name }),
                inUse: l('inUse'),
                problems,
              }}
            />
            <div>
              <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{l('usedOn')}</div>
              {open.pages.length ? (
                <ul className="m-0 mt-[6px] list-none p-0">
                  {open.pages.map((p) => (
                    <li key={p.id} className="border-b border-line py-[8px] text-[13px]">
                      <Link href={`/admin/cms/${p.id}` as Route} className="font-semibold text-ink no-underline hover:text-ink hover:underline">
                        {p.title}
                      </Link>{' '}
                      <span className="text-mut">
                        {pathOf(p.kind, p.slug)}
                        {p.archived ? ` · ${l('archived')}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-[6px] text-[13px] text-mut">{l('notUsed')}</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {rows.length ? (
        <ul className="m-0 grid list-none gap-[16px] p-0 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
          {rows.map((r) => (
            <li key={r.id} className={`overflow-hidden rounded-panel border bg-sf ${r.id === open?.id ? 'border-ink' : 'border-line'}`}>
              <Link href={`/admin/cms/media?m=${r.id}` as Route} aria-current={r.id === open?.id ? 'true' : undefined} className="block text-ink no-underline hover:text-ink hover:no-underline">
                <span className="flex aspect-[16/10] items-center justify-center overflow-hidden bg-bg">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the library's own web-sized file */}
                  <img src={mediaSrc(r.key)} alt="" loading="lazy" width={r.width} height={r.height} className="block h-full w-full object-cover" />
                </span>
                <span className="block px-[16px] py-[14px]">
                  <span className="block truncate text-[13.5px] font-semibold" title={r.name}>
                    {r.name}
                  </span>
                  <span className="mt-[3px] block text-[12px] text-mut">{meta(r)}</span>
                  <span className="mt-[8px] block border-t border-line pt-[8px] text-[12px] text-mut">{r.pages.length ? l('used', { count: r.pages.length }) : l('notUsed')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 rounded-panel border border-dashed border-line bg-sf px-[20px] py-[22px] text-[13px] text-mut md:px-[26px]">{l(canWrite ? 'empty' : 'emptyRead')}</p>
      )}
    </>
  )
}
