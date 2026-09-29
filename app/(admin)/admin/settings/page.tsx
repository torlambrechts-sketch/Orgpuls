import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { FixedSwitch, IndexingSwitch } from '@/components/admin/SettingsSwitch'
import { FIELD, FIELD_LABEL, PageHead, Problem, when } from '@/components/admin/ui'
import { isError, ops, siteSettings } from '@/lib/admin/api'
import { ADMIN_HOST, EN_HOST, MAIN_HOST } from '@/lib/hosts'

/**
 * Admin › Site settings (X-095, the design's `isSettings`; D-170). General: the site's configuration
 * as it is — set in code and the environment, so shown, not edited. Access: the switches that
 * exist — the second factor (always on), «Allow search engines» (0126), and the two that are changed
 * where they belong. Integrations: what sends and runs, from Operations. The design's API keys,
 * webhooks, customer single sign-on and branding are not features Orgpuls has, and are not drawn.
 */
const TABS = ['general', 'access', 'integrations'] as const
type Tab = (typeof TABS)[number]

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'general'
  const s = (k: string, v?: Record<string, string | number>) => t(`settings.${k}`, v)
  const [settings, run] = await Promise.all([siteSettings(), tab === 'integrations' ? ops() : Promise.resolve(null)])
  if (isError(settings)) return <Problem text={settings.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  const general = [
    { label: s('general.name'), value: 'Orgpuls' },
    { label: s('general.domain'), value: MAIN_HOST },
    { label: s('general.english'), value: EN_HOST },
    { label: s('general.admin'), value: ADMIN_HOST },
    { label: s('general.language'), value: s('general.languageValue') },
    { label: s('general.zone'), value: 'Europe/Oslo' },
  ]
  const row = 'flex items-center gap-[16px] rounded-panel border border-line bg-sf px-[20px] py-[16px]'
  const card = 'rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]'

  return (
    <>
      <PageHead title={s('title')} lead={s('lead', { domain: MAIN_HOST })} />
      <nav aria-label={s('tabs')} className="flex flex-wrap gap-[2px] md:px-[18px]">
        {TABS.map((x) => (
          <Link
            key={x}
            href={(x === 'general' ? '/admin/settings' : `/admin/settings?tab=${x}`) as Route}
            aria-current={x === tab ? 'page' : undefined}
            className={`rounded-bar px-[13px] py-[7px] text-[13.5px] text-ink no-underline hover:text-ink hover:no-underline ${x === tab ? 'bg-sbg font-bold' : 'font-medium hover:bg-ink/5'}`}
          >
            {s(`tab.${x}`)}
          </Link>
        ))}
      </nav>

      {tab === 'general' ? (
        <div className="mt-[16px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(300px,.9fr)]">
          <section className={`${card} flex flex-col gap-[16px]`}>
            {general.map((g) => (
              <label key={g.label} className="block">
                <span className={FIELD_LABEL}>{g.label}</span>
                <input readOnly value={g.value} className={FIELD} />
              </label>
            ))}
          </section>
          <section className={card}>
            <h2 className="m-0 font-display text-[22px] font-medium">{s('general.whereTitle')}</h2>
            <div className="mt-[4px] text-[12.5px] text-mut">{s('general.whereLead')}</div>
            <div className="mt-[16px] rounded-[12px] border border-dashed border-line bg-bg px-[16px] py-[14px] text-[13px] leading-[1.55] [text-wrap:pretty]">{s('general.whereText')}</div>
          </section>
        </div>
      ) : null}

      {tab === 'access' ? (
        <div className="mt-[16px] flex flex-col gap-[10px]">
          <div className={row}>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{s('access.mfa')}</div>
              <div className="mt-[2px] text-[12.5px] text-mut [text-wrap:pretty]">
                {s('access.mfaWhy')} {settings.admins_without_factor ? s('access.mfaMissing', { n: settings.admins_without_factor }) : s('access.mfaAll')}
              </div>
            </div>
            <FixedSwitch on label={s('access.mfa')} />
          </div>
          <div className={row}>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{s('access.index')}</div>
              <div className="mt-[2px] text-[12.5px] text-mut [text-wrap:pretty]">
                {s('access.indexWhy')}
                {settings.indexing_at ? ` ${s('access.changed', { by: settings.indexing_by ?? '—', at: when(settings.indexing_at) })}` : ''}
              </div>
            </div>
            <IndexingSwitch
              on={settings.allow_indexing}
              label={s('access.index')}
              confirmOff={s('access.indexConfirm')}
              problems={{ not_allowed: t('common.notAllowed'), invalid: t('common.failed'), failed: t('common.failed') }}
            />
          </div>
          <div className={row}>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{s('access.auto')}</div>
              <div className="mt-[2px] text-[12.5px] text-mut [text-wrap:pretty]">
                {s('access.autoWhy')}{' '}
                <Link href={'/admin/translations' as Route} className="font-semibold text-link">
                  {s('access.autoWhere')}
                </Link>
              </div>
            </div>
            <FixedSwitch on={settings.auto_approve} label={s('access.auto')} />
          </div>
          <div className={row}>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{s('access.notice')}</div>
              <div className="mt-[2px] text-[12.5px] text-mut [text-wrap:pretty]">
                {s('access.noticeWhy')}{' '}
                <Link href={'/admin/cms/landing' as Route} className="font-semibold text-link">
                  {s('access.noticeWhere')}
                </Link>
              </div>
            </div>
            <FixedSwitch on={settings.notice_on} label={s('access.notice')} />
          </div>
        </div>
      ) : null}

      {tab === 'integrations' ? (
        run && isError(run) ? (
          <div className="mt-[16px]">
            <Problem text={run.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
          </div>
        ) : run ? (
          <div className="mt-[16px] grid items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
            <section className={card}>
              <div className="flex items-center justify-between gap-[12px]">
                <h2 className="m-0 font-display text-[22px] font-medium">{s('int.sending')}</h2>
                <Link href={'/admin/ops' as Route} className="text-[12.5px] font-semibold text-link">
                  {s('int.open')}
                </Link>
              </div>
              <div className="mt-[4px] text-[12.5px] text-mut">{s('int.sendingLead')}</div>
              <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
                {run.queue.map((q) => (
                  <li key={`${q.kind}-${q.channel ?? ''}`} className="flex items-center gap-[12px] border-b border-line py-[12px] last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[13px] font-semibold">
                        {q.kind}
                        {q.channel ? ` · ${q.channel}` : ''}
                      </div>
                      <div className="text-[12px] text-mut">{s('int.counts', { sent: q.sent, due: q.due, scheduled: q.scheduled })}</div>
                    </div>
                    <span className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold">
                      <span aria-hidden="true" className={`block h-[6px] w-[6px] rounded-pill ${q.failed ? 'bg-peach' : 'bg-teal'}`} />
                      {q.failed ? s('int.failed', { n: q.failed }) : s('int.ok')}
                    </span>
                  </li>
                ))}
              </ul>
              {run.queue.length ? null : <p className="mb-0 mt-[8px] text-[13px] text-mut">{s('int.nothing')}</p>}
            </section>
            <section className={card}>
              <div className="flex items-center justify-between gap-[12px]">
                <h2 className="m-0 font-display text-[22px] font-medium">{s('int.jobs')}</h2>
                <Link href={'/admin/ops' as Route} className="text-[12.5px] font-semibold text-link">
                  {s('int.open')}
                </Link>
              </div>
              <div className="mt-[4px] text-[12.5px] text-mut">{s('int.jobsLead')}</div>
              <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
                {run.runs.slice(0, 5).map((r) => (
                  <li key={r.ran_at} className="flex items-center gap-[12px] border-b border-line py-[12px] last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold">{when(r.ran_at)}</div>
                      <div className="text-[12px] text-mut">{s('int.run', { opened: r.opened, closed: r.closed, queued: r.queued })}</div>
                    </div>
                  </li>
                ))}
              </ul>
              {run.runs.length ? null : <p className="mb-0 mt-[8px] text-[13px] text-mut">{s('int.noRuns')}</p>}
            </section>
            <section className={card}>
              <h2 className="m-0 font-display text-[22px] font-medium">{s('int.search')}</h2>
              <div className="mt-[8px] text-[13px] leading-[1.55] [text-wrap:pretty]">{s('int.searchText')}</div>
              <Link href={'/admin/seo?view=performance' as Route} className="mt-[12px] inline-block text-[12.5px] font-semibold text-link">
                {s('int.searchOpen')}
              </Link>
            </section>
          </div>
        ) : null
      ) : null}
    </>
  )
}
