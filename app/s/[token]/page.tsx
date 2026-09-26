import { getLocale, getTranslations } from 'next-intl/server'
import { getRespondForm } from '@/lib/respond/read'
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
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
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

  const questions = respondQuestions(t, form, await getLocale())

  return (
    <main className="animate-entry mx-auto min-h-screen max-w-[420px] bg-bg">
      <RespondFlow
        token={token}
        org={form.org}
        questions={questions}
        copy={respondCopy(t, form.threshold, form.modules.reduce((n, m) => n + m.minutes, 0))}
      />
    </main>
  )
}
