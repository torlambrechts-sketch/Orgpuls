import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

/**
 * The start page's closing block — ink panel, yellow button — so every public page ends on
 * the same offer in the same place. Title and body are the page's own.
 */
export async function CtaBand({ title, body }: { title: string; body: string }) {
  const t = await getTranslations()
  return (
    <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
      <div className="rounded-[22px] bg-ink p-[clamp(28px,4vw,44px)] text-bg">
        <div className="grid items-center gap-[26px] [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          <div className="min-w-0">
            <h2 className="m-0 max-w-[24ch] font-display text-[clamp(25px,3.4vw,33px)] font-semibold leading-[1.14] [text-wrap:balance]">
              {title}
            </h2>
            <p className="mt-[13px] max-w-[48ch] text-[15px] leading-[1.65] opacity-[0.78] [text-wrap:pretty]">{body}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-[11px]">
            <Link
              href="/registrer"
              className="inline-flex h-[52px] items-center justify-center rounded-tile border border-ac bg-ac text-[16.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
            >
              {t('start.ctaFree')}
            </Link>
            <span className="text-center text-[13px] opacity-[0.78]">{t('seo.common.priceLine')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
