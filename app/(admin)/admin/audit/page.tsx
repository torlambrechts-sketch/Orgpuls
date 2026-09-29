import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Avatar, BTN, PageHead, Problem, when } from '@/components/admin/ui'
import { auditList, isError, type AuditRow } from '@/lib/admin/api'
import { AUDIT_AREAS, areaOf, type AuditArea } from '@/lib/admin/audit'

/**
 * Admin › Audit log (X-095, the design's `isAudit`; D-90, D-170): everything every admin has done
 * or looked at, newest first — who, what, on which organisation or item, in which area — with the
 * reason and the detail under each entry, the design's area chips, and «Export CSV» of the same.
 */
const LIMIT = 500

function target(a: AuditRow): string | null {
  if (a.org_name) return a.org_name
  if (a.target_type && a.target_id) return `${a.target_type} ${a.target_id}`
  return a.target_type
}

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await searchParams
  const area = (AUDIT_AREAS as readonly string[]).includes(sp.area ?? '') ? (sp.area as AuditArea) : null
  const res = await auditList(null, LIMIT)
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const a = (k: string, v?: Record<string, string | number>) => t(`audit.v2.${k}`, v)
  const present = AUDIT_AREAS.filter((x) => res.rows.some((r) => areaOf(r.action) === x))
  const rows = res.rows.filter((r) => !area || areaOf(r.action) === area)
  const chip = (on: boolean) =>
    `rounded-pill border border-line px-[14px] py-[8px] text-[12px] font-semibold text-ink no-underline hover:text-ink hover:no-underline ${on ? 'bg-sbg' : 'bg-transparent hover:bg-ink/5'}`

  return (
    <>
      <PageHead title={a('title')} lead={a('lead', { count: res.rows.length })}>
        <a href={`/admin/audit/export${area ? `?area=${area}` : ''}`} className={`${BTN.secondary} border-ink`}>
          {a('export')}
        </a>
      </PageHead>

      <section className="rounded-panel border border-line bg-sf">
        <nav aria-label={a('areas')} className="flex flex-wrap items-center gap-[6px] px-[20px] py-[16px]">
          <Link href={'/admin/audit' as Route} aria-current={area ? undefined : 'page'} className={chip(!area)}>
            {a('area.all')}
          </Link>
          {present.map((x) => (
            <Link key={x} href={`/admin/audit?area=${x}` as Route} aria-current={x === area ? 'page' : undefined} className={chip(x === area)}>
              {a(`area.${x}`)}
            </Link>
          ))}
        </nav>
        <div className="overflow-x-auto">
          <div className="min-w-[660px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-y border-line px-[20px] pb-[10px] pt-[12px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="w-[110px]">{a('col.when')}</span>
              <span className="flex-[2.6]">{a('col.change')}</span>
              <span className="w-[92px]">{a('col.area')}</span>
              <span className="w-[30px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {rows.map((r) => {
                const tg = target(r)
                const detail = r.detail ? Object.entries(r.detail) : []
                return (
                  <li key={r.id} className="border-b border-line last:border-b-0">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-[14px] px-[20px] py-[13px] [&::-webkit-details-marker]:hidden">
                        <span className="w-[110px] whitespace-nowrap text-[12.5px] text-mut">{when(r.at)}</span>
                        <span className="flex min-w-0 flex-[2.6] items-center gap-[12px]">
                          <Avatar name={(r.admin_email ?? '?').split('@')[0] ?? '?'} />
                          <span className="min-w-0 text-[13.5px]">
                            <span className="font-semibold">{r.admin_email ?? a('system')}</span> <span className="font-mono text-[12.5px]">{r.action}</span>
                            {tg ? (
                              <>
                                {' '}
                                <span className="font-semibold">{tg}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                        <span className="w-[92px] text-[12.5px] text-mut">{a(`area.${areaOf(r.action)}`)}</span>
                        <span aria-hidden="true" className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-bar border border-line text-mut">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-150 group-open:rotate-180">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </span>
                      </summary>
                      <div className="bg-bg px-[20px] py-[14px] text-[13px] md:pl-[144px]">
                        <span className="mb-[4px] block text-[11px] uppercase tracking-[0.09em] text-mut">{a('details')}</span>
                        <div className="text-[12.5px] text-mut">
                          {r.admin_role ? t(`role.${r.admin_role}`) : '—'}
                          {r.org_id ? (
                            <>
                              {' · '}
                              <Link href={`/admin/orgs/${r.org_id}` as Route} className="font-semibold text-link">
                                {r.org_name ?? r.org_id}
                              </Link>
                            </>
                          ) : null}
                        </div>
                        {r.reason ? <p className="mb-0 mt-[6px] [overflow-wrap:anywhere]">{a('reason', { reason: r.reason })}</p> : null}
                        {detail.length ? (
                          <dl className="m-0 mt-[6px] grid gap-x-[14px] gap-y-[2px] text-[12.5px] [grid-template-columns:max-content_minmax(0,1fr)]">
                            {detail.map(([k, v]) => (
                              <div key={k} className="contents">
                                <dt className="font-mono text-mut">{k}</dt>
                                <dd className="m-0 [overflow-wrap:anywhere]">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : r.reason ? null : (
                          <p className="mb-0 mt-[6px] text-mut">{a('noDetail')}</p>
                        )}
                      </div>
                    </details>
                  </li>
                )
              })}
            </ul>
            {rows.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{t('common.none')}</p>}
          </div>
        </div>
      </section>
    </>
  )
}
