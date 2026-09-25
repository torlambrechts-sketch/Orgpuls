import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Container } from './Section'

/**
 * The closing offer every public page ends on: the start page's ink panel, now a band the
 * full width of the window with its content on 8 of 12 columns and the button beside it
 * (docs/landingsside-gjennomgang.md 4.2). Title and body are the page's own.
 */
export async function CtaBand({ title, body }: { title: string; body: string }) {
  const t = await getTranslations()
  return (
    <section aria-labelledby="final-title" className="w-full bg-ink py-16 text-bg lg:py-24">
      <Container>
        <div className="grid items-center gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <h2 id="final-title" className="m-0 font-display text-mk-h2 font-semibold [text-wrap:balance]">
              {title}
            </h2>
            <p className="m-0 mt-4 max-w-prose text-mk-lead opacity-80 [text-wrap:pretty]">{body}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-3 lg:col-span-4">
            <Link
              href="/registrer"
              className="inline-flex h-14 items-center justify-center rounded-tile border border-ac bg-ac px-6 text-mk-body font-bold text-ink no-underline hover:text-ink hover:no-underline"
            >
              {t('start.ctaFree')}
            </Link>
            <span className="text-center text-mk-small opacity-80">{t('seo.common.priceLine')}</span>
          </div>
        </div>
      </Container>
    </section>
  )
}
