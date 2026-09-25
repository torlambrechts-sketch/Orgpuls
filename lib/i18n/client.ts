import type { AbstractIntlMessages } from 'next-intl'

/**
 * The messages a part of the site's client components read, and only those.
 *
 * NextIntlClientProvider serialises the messages it is given into every page's HTML. The
 * whole catalogue is about 270 kB, which is what the signed-in application's many client
 * screens read from; a public page's client components read a few kB of it, and a
 * respondent's even less. So the root layout provides the public namespaces, the
 * application's layout the whole catalogue, and the respondent's routes their own.
 */
export const PUBLIC_CLIENT_NAMESPACES = ['registrer', 'auth', 'bliMed'] as const
export const RESPONDENT_CLIENT_NAMESPACES = ['respond', 'factor'] as const

export function pickMessages(messages: AbstractIntlMessages, namespaces: readonly string[]): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {}
  for (const n of namespaces) {
    const m = messages[n]
    if (m !== undefined) picked[n] = m
  }
  return picked
}
