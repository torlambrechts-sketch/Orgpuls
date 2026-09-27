import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { LOCALE_NAMES, chooseLocale, offeredLocales } from '@/lib/i18n/offered'
import { RESPONDENT_CLIENT_NAMESPACES, pickMessages } from '@/lib/i18n/client'
import { getRespondForm, getRespondLocales } from '@/lib/respond/read'
import { RespondFlow } from '@/components/respond/RespondFlow'
import { respondCopy, respondQuestions } from '@/lib/respond/questions'

/**
 * The respondent surface.
 *
 * Public: no session, no sign-in, no cookie that identifies anyone. The token in the
 * path is the only credential and it is validated in the database. `/s` is in the
 * middleware's PUBLIC_PATHS for that reason.
 *
 * The design shows this screen only inside a phone mock on the Målinger preview (bundle
 * lines 1880-1931), because a prototype has no route for it. Everything inside the
 * mock's screen is reproduced here; the mock's own chrome — the black bezel, the 36px
 * radius, the "09:41" — is phone, not product, and is not. See docs/DEVIATIONS.md D-09.
 *
 * Every string comes from next-intl and every question from the database. The order is
 * the server's, shuffled per token, because the screen tells the respondent it is.
 */
export const dynamic = 'force-dynamic'

export default async function RespondPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ lang?: string | string[] }>
}) {
  const { token } = await params
  const asked = (await searchParams).lang
  const t = await getTranslations()
  const result = await getRespondForm(token)

  if ('refused' in result) {
    return (
      <main className="animate-entry mx-auto min-h-screen max-w-[420px] px-[20px] py-[60px]">
        <div className="rounded-card border border-line bg-sf px-[22px] py-[26px]">
          <h1 className="m-0 font-display text-[24px] font-semibold leading-[1.2]">
            {t('respond.invalid')}
          </h1>
          <p className="mt-[10px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('respond.invalidLead')}
          </p>
        </div>
      </main>
    )
  }

  const { form } = result

  /*
   * The respondent's language (engagement P1, D-127). With a language flag on, the survey is
   * offered in bokmål and in every language whose items and page strings were approved; the
   * choice is `?lang=`, then the employee's own, then bokmål, and it lives in the address only
   * — never in a cookie, never with an answer (I6). With no flag on, `offered` is null and the
   * page is in the host's or the switch's language, as before.
   */
  const locales = await getRespondLocales(token)
  const offered = offeredLocales(locales?.locales ?? null)
  const lang = offered ? chooseLocale(offered, Array.isArray(asked) ? asked[0] : asked, locales?.employee_lang, locales?.org_lang) : await getLocale()
  // only bokmål and English have page strings (messages/); a language without them is never offered
  const uiLocale = lang === 'en' ? 'en' : 'no'
  const tl = offered ? await getTranslations({ locale: uiLocale }) : t
  const texts = offered && lang !== 'no' ? (locales?.texts[lang] ?? null) : null

  const questions = respondQuestions(tl, form, offered ? lang : await getLocale(), texts)
  const flow = (
    <RespondFlow
      token={token}
      org={form.org}
      questions={questions}
      copy={respondCopy(tl, form.threshold, form.modules.reduce((n, m) => n + m.minutes, 0))}
      languages={
        offered && offered.length > 1
          ? {
              current: lang,
              label: tl('respond.language'),
              options: offered.map((code) => ({ code, name: LOCALE_NAMES[code] })),
            }
          : null
      }
    />
  )

  return (
    <main lang={offered ? lang : undefined} className="animate-entry mx-auto min-h-screen max-w-[420px] bg-bg">
      {offered ? (
        <NextIntlClientProvider
          locale={uiLocale}
          messages={pickMessages(await getMessages({ locale: uiLocale }), RESPONDENT_CLIENT_NAMESPACES)}
        >
          {flow}
        </NextIntlClientProvider>
      ) : (
        flow
      )}
    </main>
  )
}
