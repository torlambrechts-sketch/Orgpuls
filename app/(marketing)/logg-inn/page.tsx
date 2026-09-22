import { getTranslations } from 'next-intl/server'
import { SignInPanel } from '@/components/start/SignInPanel'

/**
 * Sign-in. Orgpuls_Start.dc.html lines 435-500.
 *
 * The screen the earlier build had was logged as D-03: the application bundle contained no
 * authentication surface at all, so it was assembled from primitives. The start bundle has
 * one, so this is now transcribed rather than invented, and D-03 is superseded.
 *
 * The right column is the design's own and is worth keeping intact: it tells a respondent
 * that they do not need an account, which is the single most common reason somebody lands
 * on a sign-in page they have no business on.
 */
export default async function SignInPage() {
  const t = await getTranslations()

  return (
    <main className="animate-entry mx-auto max-w-[920px] px-[26px] pb-[70px] pt-[44px]">
      <div className="grid items-start gap-[20px] [grid-template-columns:repeat(auto-fit,minmax(288px,1fr))]">
        <SignInPanel />

        <div className="flex flex-col gap-[12px]">
          <div className="rounded-panel border-[1.5px] border-ink bg-sbg px-[24px] py-[22px]">
            <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">
              {t('auth.respondentHead')}
            </span>
            <span className="mt-[7px] block text-[15.5px] font-bold leading-[1.35] [text-wrap:pretty]">
              {t('auth.respondentTitle')}
            </span>
            <span className="mt-[8px] block text-[13.5px] leading-[1.6] [text-wrap:pretty]">
              {t('auth.respondentBody')}
            </span>
          </div>
          <div className="rounded-note border border-line bg-sf px-[22px] py-[20px]">
            <span className="block text-[13.5px] font-bold">{t('auth.lockedHead')}</span>
            <span className="mt-[6px] block text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">
              {t('auth.lockedBody')}
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}
