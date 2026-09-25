import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { RESPONDENT_CLIENT_NAMESPACES, pickMessages } from '@/lib/i18n/client'

/**
 * The respondent's routes: the survey (/s/<token>) and the private conversation
 * (/s/samtale). Their client components read the respondent's messages and the factor
 * names, and a phone on a building site should not download the rest (lib/i18n/client).
 */
export default async function RespondentLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()
  return (
    <NextIntlClientProvider messages={pickMessages(messages, RESPONDENT_CLIENT_NAMESPACES)}>{children}</NextIntlClientProvider>
  )
}
