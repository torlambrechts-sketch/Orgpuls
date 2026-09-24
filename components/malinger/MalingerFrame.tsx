import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'
import { YearRail, type RailView } from './YearRail'

/**
 * Målinger's frame (v3 870-942): the title and its two buttons, the year rail, and the four
 * tabs. The tabs are addresses (`?fane=`), links styled as the design's tab buttons (D-06).
 */
export type MalingerTab = 'kommende' | 'historikk' | 'arshjul' | 'sporsmal'
const TABS: MalingerTab[] = ['kommende', 'historikk', 'arshjul', 'sporsmal']

export async function MalingerFrame({
  tab,
  counts,
  rail,
  nextPlannedId,
  children,
}: {
  tab: MalingerTab
  counts: Record<MalingerTab, number>
  rail: RailView
  /** the next round the wheel has planned, which "＋ Ny måling" opens the setup of (D-58) */
  nextPlannedId: string | null
  children: ReactNode
}) {
  const t = await getTranslations('malinger')
  return (
    <main className="mx-auto max-w-page animate-ht-in px-[28px] pb-[60px] pt-[30px] max-sm:px-[16px]">
      <div className="flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">{t('title')}</h1>
          <p className="mt-[9px] max-w-[600px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">{t('lead')}</p>
        </div>
        <span className="flex flex-none flex-wrap gap-[9px]">
          <ButtonLink href={{ pathname: '/forhandsvis' }} tone="secondary">
            {t('previewAsEmployee')}
          </ButtonLink>
          <ButtonLink
            href={
              nextPlannedId
                ? { pathname: '/maleoppsett', query: { runde: nextPlannedId } }
                : { pathname: '/maleoppsett', query: { type: 'grunnlinje' } }
            }
            tone="primary"
          >
            {t('newMeasurement')}
          </ButtonLink>
        </span>
      </div>

      <YearRail view={rail} />

      <nav className="mt-[20px] flex flex-wrap gap-[6px] border-b border-line" aria-label={t('tabsAria')}>
        {TABS.map((k) => (
          <Link
            key={k}
            href={(k === 'kommende' ? '/malinger' : `/malinger?fane=${k}`) as Route}
            aria-current={tab === k ? 'page' : undefined}
            className={`flex items-center gap-[8px] border-b-[3px] px-[16px] pb-[12px] pt-[10px] text-[14.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
              tab === k ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-mut'
            }`}
          >
            {t(`tab.${k}`)}
            <span className="rounded-pill bg-track px-[8px] py-[2px] text-[11px] font-bold text-mut">{counts[k]}</span>
          </Link>
        ))}
      </nav>

      {children}
    </main>
  )
}
