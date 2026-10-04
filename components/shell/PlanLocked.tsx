import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getViewerRole } from '@/lib/org/read'

/**
 * A screen the free plan does not include (0201, D-217), drawn as the app's empty treatment
 * (ResultaterEmpty): the screen's title, a dashed note that says what a plan adds, and for the
 * daglig leder, who can choose one, the way to Oppsett › Betaling. The design has no such state;
 * D-217 logs it.
 */
export async function PlanLocked({ title, body }: { title: string; body: string }) {
  const [t, role] = await Promise.all([getTranslations('plan'), getViewerRole()])
  return (
    <div className="mx-auto max-w-page px-[28px] pb-[60px] pt-[30px] max-sm:px-[16px]">
      <h1 className="font-display text-[32px] font-semibold leading-[1.1]">{title}</h1>
      <div className="mt-[18px] rounded-note border border-dashed border-rule px-[22px] py-[20px] text-[13px] leading-[1.55] text-mut">
        <p className="m-0 [text-wrap:pretty]">{body}</p>
        {role === 'daglig_leder' ? (
          <Link
            href={{ pathname: '/oppsett', query: { fane: 'betaling' } }}
            className="mt-[14px] inline-flex h-[34px] items-center rounded-bar border border-ink bg-ac px-[14px] text-[12.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
          >
            {t('choose')}
          </Link>
        ) : (
          <p className="mb-0 mt-[10px]">{t('askLeader')}</p>
        )}
      </div>
    </div>
  )
}
