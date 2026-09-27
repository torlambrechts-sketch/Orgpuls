import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { DemoRequest } from '@/components/site/DemoForm'
import { pageMeta } from '@/lib/marketing/meta'

/**
 * The demo (0094, D-143): a work address, a login link, and a copy of Demobedriften AS of the
 * visitor's own. No design exists for the page; it is the newsletter's card (/nyhetsbrev) with
 * the demo's rules under the form, so a visitor knows what they get and what cannot happen.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('demo')
  return pageMeta({ title: `${t('metaTitle')} · Orgpuls`, description: t('metaDescription'), path: '/demo' })
}

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ feil?: string }> }) {
  const { feil } = await searchParams
  const t = await getTranslations('demo')
  const lang = (await getLocale()) === 'en' ? 'en' : 'no'
  const rules = t.raw('rules') as string[]
  const startProblem = feil === 'closed' ? t('closed') : feil ? t('startFailed') : null

  return (
    <div className="animate-entry mx-auto max-w-[520px] px-[26px] pb-[70px] pt-[44px]">
      <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
        <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">{t('badge')}</span>
        <h1 className="mt-[13px] font-display text-[clamp(26px,3.6vw,31px)] font-semibold leading-[1.12]">{t('title')}</h1>
        <p className="mt-[10px] max-w-[44ch] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">{t('lead')}</p>
        {startProblem ? (
          <p role="alert" className="mt-[14px] text-[13px] leading-[1.5] text-danger">
            {startProblem}
          </p>
        ) : null}
        <DemoRequest
          lang={lang}
          words={{
            mail: t('mail'),
            consent: t('consent'),
            submit: t('submit'),
            sending: t('sending'),
            sentTitle: t('sentTitle'),
            sentLead: t.raw('sentLead') as string,
            invalid: t('invalid'),
            limited: t('limited'),
            closed: t('closed'),
            failed: t('failed'),
          }}
        />
        <h2 className="mt-[24px] text-[14px] font-bold">{t('rulesTitle')}</h2>
        <ul className="m-0 mt-[8px] flex list-disc flex-col gap-[6px] pl-[18px] text-[13.5px] leading-[1.55] text-body">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="m-0 mt-[16px] text-[12.5px] leading-[1.55] text-mut">
          {t('privacy')}{' '}
          <Link href="/personvernerklaering" className="text-link">
            {t('privacyLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
