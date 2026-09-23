import type { getTranslations } from 'next-intl/server'
import type { Choice, Question, RespondCopy } from '@/components/respond/RespondFlow'
import type { RespondForm } from '@/lib/respond/read'

type T = Awaited<ReturnType<typeof getTranslations>>

/**
 * The respondent form as the flow renders it: every question from the database, every
 * string from next-intl. Shared by the real respondent page (/s/[token]) and the leaders'
 * preview (/forhandsvis), so a preview cannot drift from what employees are sent.
 */
export function respondQuestions(t: T, form: Pick<RespondForm, 'questions' | 'extra'>): Question[] {
  // the shared 1..5 agreement scale every factor statement is answered on. The range is
  // the database's: app.answers carries check (value between 1 and 5).
  const scale: Choice[] = [1, 2, 3, 4, 5].map((n) => ({
    ordinal: n,
    label: t(`respond.scale.o${n}`),
  }))

  return [
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

}

export function respondCopy(t: T, threshold: number): RespondCopy {
  return {
    // the raw template, because the substitution happens per step in the client
    progress: t.raw('respond.progress'),
    next: t('respond.next'),
    submit: t('respond.submit'),
    skip: t('respond.skip'),
    commentPrompt: t('respond.commentPrompt'),
    commentPlaceholder: t('respond.commentPlaceholder'),
    openPlaceholder: t('respond.openPlaceholder'),
    doneTitle: t('respond.doneTitle'),
    doneLead: t('respond.doneLead', { threshold }),
    submitFailed: t('respond.submitFailed'),
  }
}
