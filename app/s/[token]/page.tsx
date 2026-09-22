import { getTranslations } from 'next-intl/server'
import { getRespondForm } from '@/lib/respond/read'
import { RespondFlow, type Choice, type Question } from '@/components/respond/RespondFlow'

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

  // the shared 1..5 agreement scale every factor statement is answered on. The range is
  // the database's: app.answers carries check (value between 1 and 5).
  const scale: Choice[] = [1, 2, 3, 4, 5].map((n) => ({
    ordinal: n,
    label: t(`respond.scale.o${n}`),
  }))

  const questions: Question[] = [
    ...form.questions.map(
      (q): Question => ({
        kind: 'factor',
        id: `${q.factor}#${q.ordinal}`,
        factor: q.factor,
        ordinal: q.ordinal,
        factorLabel: t(`factor.${q.factor}.label`),
        text: t(`factor.${q.factor}.s${q.ordinal}`),
        choices: scale,
      }),
    ),
    ...form.extra.map((x): Question =>
      x.kind === 'free_text'
        ? {
            kind: 'extra-text',
            id: x.key,
            extraKey: x.key,
            factorLabel: t(`extra.${x.key}.label`),
            text: t(`extra.${x.key}.text`),
            note: t('respond.openNote'),
          }
        : {
            kind: 'extra-choice',
            id: x.key,
            extraKey: x.key,
            factorLabel: t(`extra.${x.key}.label`),
            text: t(`extra.${x.key}.text`),
            // counted from the database, so a question that gains an option gains it here
            choices: Array.from({ length: x.options }, (_, i) => ({
              ordinal: i + 1,
              label: t(`extra.${x.key}.o${i + 1}`),
            })),
          },
    ),
  ]

  return (
    <main className="animate-entry mx-auto min-h-screen max-w-[420px] bg-bg">
      <RespondFlow
        token={token}
        org={form.org}
        questions={questions}
        copy={{
          // the raw template, because the substitution happens per step in the client
          progress: t.raw('respond.progress'),
          next: t('respond.next'),
          submit: t('respond.submit'),
          skip: t('respond.skip'),
          commentPrompt: t('respond.commentPrompt'),
          commentPlaceholder: t('respond.commentPlaceholder'),
          openPlaceholder: t('respond.openPlaceholder'),
          doneTitle: t('respond.doneTitle'),
          doneLead: t('respond.doneLead', { threshold: form.threshold }),
          submitFailed: t('respond.submitFailed'),
        }}
      />
    </main>
  )
}
