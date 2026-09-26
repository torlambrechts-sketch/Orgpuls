import type { getTranslations } from 'next-intl/server'
import type { Choice, Question, RespondCopy } from '@/components/respond/RespondFlow'
import type { RespondForm } from '@/lib/respond/read'

type T = Awaited<ReturnType<typeof getTranslations>>

/**
 * The respondent form as the flow renders it: every question from the database, every
 * string from next-intl. Shared by the real respondent page (/s/[token]) and the leaders'
 * preview (/forhandsvis), so a preview cannot drift from what employees are sent.
 */
/**
 * The core survey's time, as the design's own closing line states it ("Takk. Det tok fire
 * minutter."). A module adds its `estimated_minutes` to it (D-113).
 */
export const CORE_MINUTES = 4

export function respondQuestions(
  t: T,
  form: Pick<RespondForm, 'questions' | 'extra' | 'threshold'> & { modules?: RespondForm['modules'] },
): Question[] {
  // the shared 1..5 agreement scale every factor statement is answered on. The range is
  // the database's: app.answers carries check (value between 1 and 5).
  const scale: Choice[] = [1, 2, 3, 4, 5].map((n) => ({
    ordinal: n,
    label: t(`respond.scale.o${n}`),
  }))

  const modules = form.modules ?? []
  const countTotal = modules.reduce((n, m) => n + m.count.length, 0)

  /*
   * The order a respondent meets them in (D-113): the core statements, shuffled; the
   * module's statements, shuffled within the module; the questions outside the index; the
   * module's count questions; its background questions, last and optional.
   */
  const moduleStatements = modules.flatMap((m) =>
    m.statements.map(
      (q): Question => ({ kind: 'module', id: q.item, item: q.item, factorLabel: q.factor, text: q.text, choices: scale }),
    ),
  )
  const countQuestions = modules.flatMap((m) =>
    m.count.map(
      (q): Question => ({
        kind: 'count',
        id: q.item,
        item: q.item,
        factorLabel: t('respond.countLabel'),
        lead: t('respond.countLead', { count: countTotal }),
        text: q.text,
        choices: q.options.map((label, i) => ({ ordinal: i + 1, label })),
      }),
    ),
  )
  const segmentQuestions = modules.flatMap((m) =>
    m.segments.map(
      (q): Question => ({
        kind: 'segment',
        id: q.item,
        item: q.item,
        factorLabel: t('respond.segmentLabel'),
        lead: t('respond.segmentLead', { threshold: form.threshold }),
        text: q.text,
        choices: q.options.map((label, i) => ({ ordinal: i + 1, label })),
      }),
    ),
  )

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
    ...moduleStatements,
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
    ...countQuestions,
    ...segmentQuestions,
  ]
}

export function respondCopy(t: T, threshold: number, moduleMinutes = 0): RespondCopy {
  return {
    // the raw template, because the substitution happens per step in the client
    progress: t.raw('respond.progress'),
    next: t('respond.next'),
    submit: t('respond.submit'),
    skip: t('respond.skip'),
    commentPrompt: t('respond.commentPrompt'),
    commentPlaceholder: t('respond.commentPlaceholder'),
    openPlaceholder: t('respond.openPlaceholder'),
    // the design's line when the survey is the core one; with a module, the sum (D-113)
    doneTitle: moduleMinutes
      ? t('respond.doneTitleMinutes', { minutes: CORE_MINUTES + moduleMinutes })
      : t('respond.doneTitle'),
    doneLead: t('respond.doneLead', { threshold }),
    submitFailed: t('respond.submitFailed'),
  }
}
