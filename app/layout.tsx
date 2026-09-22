import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './fonts.css'
import './globals.css'

/**
 * The two families are loaded by app/fonts.css, which is the design bundle's own
 * stylesheet serving the bundle's own woff2 files. next/font is deliberately not used
 * here; the reason is recorded at the top of that file.
 */

export const metadata: Metadata = {
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
      </body>
    </html>
  )
}
