import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { SiteAnalytics } from '@/components/shell/SiteAnalytics'
import { PUBLIC_CLIENT_NAMESPACES, pickMessages } from '@/lib/i18n/client'
import { bcp47, dirOf } from '@/lib/i18n/locales'
import { SITE_URL } from '@/lib/marketing/site'
import { ownSite } from '@/lib/site/own'
import './fonts.css'
import './globals.css'

/**
 * The two families are loaded by app/fonts.css, which is the design bundle's own
 * stylesheet serving the bundle's own woff2 files. next/font is deliberately not used
 * here; the reason is recorded at the top of that file.
 */

/**
 * `metadataBase` makes every relative URL in a page's metadata (canonical, Open Graph image)
 * absolute on the production host. The start page and the public pages set their own title
 * and description (lib/marketing/meta.ts); the application's screens keep this one.
 */
export async function generateMetadata(): Promise<Metadata> {
  // the product's name is the brand's (lib/brand.ts, X-111): Orgpuls, or Empvibe in its market
  const brand = await getTranslations('brand')
  // a site of its own (D-270) makes its pages' relative URLs absolute on its own address
  const own = await ownSite()
  return {
    metadataBase: new URL(own?.site.url ?? SITE_URL),
    title: brand('name'),
    description: own ? (await getTranslations('app'))('tagline') : 'Psykososialt arbeidsmiljø for norske virksomheter.',
    // Bing Webmaster Tools' meta-tag check, when the site is verified that way rather than imported
    // from Google Search Console (D-234); the value is the code Bing shows, set in Vercel's environment
    ...(process.env.BING_SITE_VERIFICATION ? { verification: { other: { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } } } : {}),
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    // `no` is the product's name for its source language; the page says which written
    // standard it is in, Bokmål, as a browser, a screen reader and a search engine expect
    <html lang={bcp47(locale)} dir={dirOf(locale)}>
      <body>
        {/* the public namespaces only; the application and the respondent's routes provide their own (lib/i18n/client) */}
        <NextIntlClientProvider messages={pickMessages(messages, PUBLIC_CLIENT_NAMESPACES)}>{children}</NextIntlClientProvider>
        {/* Vercel sets VERCEL=1 on its own builds and functions; nowhere else serves /_vercel */}
        {process.env.VERCEL === '1' ? <SiteAnalytics /> : null}
      </body>
    </html>
  )
}
