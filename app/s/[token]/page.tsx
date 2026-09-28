import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { LOCALE_NAMES, chooseLocale, offeredLocales, surveyMessages } from '@/lib/i18n/offered'
import { logoPath } from '@/lib/org/logo'
import { RESPONDENT_CLIENT_NAMESPACES, pickMessages } from '@/lib/i18n/client'
import { getRespondForm, getRespondLocales } from '@/lib/respond/read'
import { RespondFlow, type RespondEngagement } from '@/components/respond/RespondFlow'
import { flag } from '@/lib/flags'
import { unmask } from '@/lib/text/mask'
import { respondCopy, respondQuestions } from '@/lib/respond/questions'
import { bcp47 } from '@/lib/i18n/locales'

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
  const offered = offeredLocales(locales?.locales ?? null, locales?.ui)
  const lang = offered ? chooseLocale(offered, Array.isArray(asked) ? asked[0] : asked, locales?.employee_lang, locales?.org_lang) : await getLocale()
  // bokmål and English have their page strings in messages/; a survey-only language (D-133) has
  // them in the registry, laid over bokmål's, and offeredLocales has found every one approved
  const surveyOnly = !!offered && lang !== 'no' && lang !== 'en'
  const uiLocale = lang === 'en' ? 'en' : 'no'
  const messages = surveyOnly
    ? surveyMessages(await getMessages({ locale: 'no' }), locales?.ui[lang] ?? {})
    : offered
      ? await getMessages({ locale: uiLocale })
      : null
  const tl = surveyOnly ? createTranslator({ locale: lang, messages: messages! }) : offered ? await getTranslations({ locale: uiLocale }) : t
  const texts = offered && lang !== 'no' ? (locales?.texts[lang] ?? null) : null

  const questions = respondQuestions(tl, form, offered ? lang : await getLocale(), texts)

  /*
   * Engagement phase 2 (0105, D-156), each part behind its flag. Everything here is the whole
   * organisation's, computed in the database; the survey still knows no group and no person.
   */
  const dateLocale = offered ? bcp47(lang) : (await getLocale()) === 'en' ? 'en-GB' : 'nb-NO'
  const day = (iso: string) =>
    new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' }).format(new Date(`${iso}T12:00:00Z`))
  const labels = { n: tl('masked.n'), a: tl('masked.a'), s: tl('masked.s') }
  const since = form.since
  const engagement: RespondEngagement = {
    since: !flag('engagement_since_last') || !since
      ? null
      : since.first
        ? { first: true }
        : since.items.length
          ? {
              first: false,
              items: since.items.map((i) => ({ title: unmask(i.title, labels), done: i.status === 'gjennomfort' })),
              footer: tl('respond.since.footer', {
                month: new Intl.DateTimeFormat(dateLocale, { month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(since.since)),
              }),
            }
          : null,
    reasons: flag('engagement_pulse_reason')
      ? Object.fromEntries(
          Object.entries(form.reasons).map(([factor, items]) => [
            factor,
            items.slice(0, 2).map((r) => tl('respond.reason', { title: unmask(r.title, labels), date: day(r.started) })),
          ]),
        )
      : {},
    thanks: flag('engagement_thanks')
      ? {
          title: tl('respond.thanks.title'),
          lines: [
            // only where everyone is told: the «alle ansatte» notice goes on that day (0105)
            ...(form.publish_on ? [tl('respond.thanks.shared', { date: day(form.publish_on) })] : []),
            tl('respond.thanks.same'),
            tl('respond.thanks.anonymous', { threshold: form.threshold }),
            // only where the round's page shows what is decided (0100)
            ...(form.page ? [tl('respond.thanks.next')] : []),
          ],
        }
      : null,
  }

  const flow = (
    <RespondFlow
      token={token}
      org={form.org}
      logo={form.logo ? logoPath(form.logo) : null}
      questions={questions}
      engagement={engagement}
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
    <main lang={offered ? bcp47(lang) : undefined} className="animate-entry mx-auto min-h-screen max-w-[420px] bg-bg">
      {offered ? (
        <NextIntlClientProvider locale={surveyOnly ? lang : uiLocale} messages={pickMessages(messages ?? {}, RESPONDENT_CLIENT_NAMESPACES)}>
          {flow}
        </NextIntlClientProvider>
      ) : (
        flow
      )}
    </main>
  )
}
