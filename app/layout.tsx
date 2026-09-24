import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { SiteAnalytics } from '@/components/shell/SiteAnalytics'
import { SITE_URL } from '@/lib/marketing/site'
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
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Orgpuls',
  description: 'Psykososialt arbeidsmiljø for norske virksomheter.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        {/* Vercel sets VERCEL=1 on its own builds and functions; nowhere else serves /_vercel */}
        {process.env.VERCEL === '1' ? <SiteAnalytics /> : null}
      </body>
    </html>
  )
}
