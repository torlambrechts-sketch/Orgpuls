import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import { getAccessState } from '@/lib/billing/read'
import { getCurrentOrgId } from '@/lib/org/current'
import { getViewerRole } from '@/lib/org/read'

/**
 * The line over every screen once a trial has ended unconfirmed (0052, D-94). In the 14 days'
 * grace it says until when everything still works; after that, that results can still be
 * read and a running survey finishes, but nothing new is sent. The daglig leder gets the way
 * to confirm; everyone else is told who can. During the trial and once a plan is confirmed,
 * nothing is drawn, so the screens stay as the design draws them.
 *
 * A cancelled organisation (0064, D-108) is told, from the day it is registered, when the
 * agreement ends and when everything is deleted, with the way to the report to download.
 */
export async function AccessNotice() {
  const org = await getCurrentOrgId()
  if (!org) return null
  const [state, role] = await Promise.all([getAccessState(org), getViewerRole()])
  if (!state) return null

  const t = await getTranslations('access')
  const format = await getFormatter()
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: 'Europe/Oslo' })

  if (state.cancel_effective_at && state.deletion_due_at) {
    const ended = Date.now() >= new Date(state.cancel_effective_at).getTime()
    // the agreement's last day is the day before it ends at midnight
    const lastDay = date(new Date(new Date(state.cancel_effective_at).getTime() - 1000).toISOString())
    return (
      <div role="status" className={`border-b border-line ${ended ? 'bg-peach' : 'bg-sbg'}`}>
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-[14px] gap-y-[6px] px-[16px] py-[10px] text-[13px] leading-[1.5] md:px-[28px]">
          <span className="min-w-0 flex-1 [text-wrap:pretty]">
            <strong className="font-bold">{ended ? t('endedHead') : t('cancelledHead')}</strong>{' '}
            {ended
              ? t('endedBody', { deleted: date(state.deletion_due_at) })
              : t('cancelledBody', { ends: lastDay, deleted: date(state.deletion_due_at) })}
          </span>
          <Link
            href="/rapport"
            className="inline-flex h-[32px] flex-none items-center rounded-bar border border-ink bg-ac px-[13px] text-[12.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
          >
            {t('download')}
          </Link>
        </div>
      </div>
    )
  }

  if (state.access !== 'grace' && state.access !== 'read_only') return null
  const grace = state.access === 'grace'

  return (
    <div role="status" className={`border-b border-line ${grace ? 'bg-sbg' : 'bg-peach'}`}>
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-[14px] gap-y-[6px] px-[16px] py-[10px] text-[13px] leading-[1.5] md:px-[28px]">
        <span className="min-w-0 flex-1 [text-wrap:pretty]">
          <strong className="font-bold">{grace ? t('graceHead') : t('readOnlyHead')}</strong>{' '}
          {grace
            ? t('graceBody', { end: date(state.trial_ends_at), until: date(state.read_only_from) })
            : t('readOnlyBody', { end: date(state.trial_ends_at) })}
        </span>
        {role === 'daglig_leder' ? (
          <Link
            href={{ pathname: '/oppsett', query: { fane: 'betaling' } }}
            className="inline-flex h-[32px] flex-none items-center rounded-bar border border-ink bg-ac px-[13px] text-[12.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
          >
            {t('confirm')}
          </Link>
        ) : (
          <span className="text-mut">{t('askLeader')}</span>
        )}
      </div>
    </div>
  )
}
