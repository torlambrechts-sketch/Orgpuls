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

/** the most statements of an instrument on one page (0224): a module factor's most, as D-150 pages them */
export const INSTRUMENT_PAGE_MAX = 5

/**
 * An instrument's pages (0224): its statements in its own order, a new page where the answers change
 * (HSE's Never…Always to its Strongly disagree…Strongly agree), and each run of the same answers cut
 * into pages of at most five, as even as that allows: HSE's 23 then 12 are 5 5 5 4 4 and 4 4 4.
 * Takes each statement's answer scale, in order; returns each statement's page number.
 */
export function instrumentPages(scales: readonly string[]): number[] {
  const pages: number[] = []
  let page = 0
  for (let start = 0; start < scales.length; ) {
    let end = start
    while (end < scales.length && scales[end] === scales[start]) end++
    const length = end - start
    const count = Math.ceil(length / INSTRUMENT_PAGE_MAX)
    for (let p = 0, at = start; p < count; p++, page++) {
      const size = Math.floor(length / count) + (p < length % count ? 1 : 0)
      for (let j = 0; j < size; j++) pages[at++] = page
    }
    start = end
  }
  return pages
}

export function respondQuestions(
  t: T,
  form: Pick<RespondForm, 'questions' | 'extra' | 'threshold'> & {
    modules?: RespondForm['modules']
    own?: RespondForm['own']
    /** the organisation's name, which labels its own questions */
    org?: string
  },
  /** the respondent's language: a module's English where it has one (0072), else its Norwegian */
  lang: string = 'no',
  /**
   * The approved wording for `lang`, by registry key (0079, D-127), when the survey is offered in
   * it. Every item then reads from here, so what a respondent sees is exactly what was
   * approved; without it (bokmål, or no language flag on) the wording is as before.
   */
  texts: Record<string, string> | null = null,
): Question[] {
  const en = lang === 'en'
  const pick = (nb: string, tr?: string | null) => (en && tr ? tr : nb)
  const picks = (nb: string[], tr?: (string | null)[] | null) => nb.map((o, i) => pick(o, tr?.[i]))
  const reg = (key: string, otherwise: string) => (texts ? (texts[key] ?? otherwise) : otherwise)
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
   * module's statements, shuffled within the module (an instrument's in its own order, 0224); the
   * questions outside the index; the module's count questions; its background questions, last
   * and optional.
   */
  const moduleStatements = modules.flatMap((m, mi) => {
    // an instrument (0224) is asked as it is printed: in its order, a page at a time, no factor above
    const pages = m.fixed_order ? instrumentPages(m.statements.map((q) => q.options?.join('\u0000') ?? '')) : null
    return m.statements.map(
      (q, n): Question => ({
        kind: 'module',
        id: q.item,
        item: q.item,
        // a survey language's factor name comes with its texts (0086), under the statement's key
        factorLabel: pages ? '' : reg(`module:${q.item}:factor`, pick(q.factor, q.factor_en)),
        text: reg(`module:${q.item}`, pick(q.text, q.text_en)),
        ...(q.help ? { help: reg(`module:${q.item}:help`, pick(q.help, q.help_en)) } : {}),
        // its own five answers where it has them (0224), translated as a count question's are
        choices: q.options
          ? picks(q.options, q.options_en).map((label, i) => ({ ordinal: i + 1, label: reg(`module:${q.item}:o${i + 1}`, label) }))
          : scale,
        ...(q.preface ? { preface: reg(`module:${q.item}:p`, pick(q.preface, q.preface_en)) } : {}),
        ...(q.na ? {} : { noNotRelevant: true as const }),
        ...(pages ? { page: `instrument:${mi}:${pages[n]}` } : {}),
      }),
    )
  })
  const countQuestions = modules.flatMap((m) =>
    m.count.map(
      (q): Question => ({
        kind: 'count',
        id: q.item,
        item: q.item,
        factorLabel: t('respond.countLabel'),
        lead: t('respond.countLead', { count: countTotal }),
        text: reg(`module:${q.item}`, pick(q.text, q.text_en)),
        choices: picks(q.options, q.options_en).map((label, i) => ({ ordinal: i + 1, label: reg(`module:${q.item}:o${i + 1}`, label) })),
        answers: q.answers,
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
        text: reg(`module:${q.item}`, pick(q.text, q.text_en)),
        choices: picks(q.options, q.options_en).map((label, i) => ({ ordinal: i + 1, label: reg(`module:${q.item}:o${i + 1}`, label) })),
      }),
    ),
  )

  /*
   * The organisation's own questions (0095, D-145), after the statements and before the
   * questions outside the index: «skala» on the extent scale, «fritekst» as a text that is
   * masked before anyone reads it. The words are the organisation's, in its language.
   */
  const extent: Choice[] = [1, 2, 3, 4, 5].map((n) => ({ ordinal: n, label: t(`respond.extent.o${n}`) }))
  const ownLabel = t('respond.ownLabel', { org: form.org ?? '' })
  const ownQuestions = (form.own ?? []).map(
    (q): Question =>
      q.kind === 'skala'
        ? { kind: 'own-scale', id: `own:${q.id}`, question: q.id, factorLabel: ownLabel, text: q.text, choices: extent }
        : { kind: 'own-text', id: `own:${q.id}`, question: q.id, factorLabel: ownLabel, text: q.text, note: t('respond.openNote') },
  )

  return [
    ...form.questions.map(
      (q): Question => ({
        kind: 'factor',
        id: `${q.factor}#${q.ordinal}`,
        factor: q.factor,
        ordinal: q.ordinal,
        factorLabel: t(`factor.${q.factor}.label`),
        text: reg(`core:${q.factor}:${q.ordinal}`, t(`factor.${q.factor}.s${q.ordinal}`)),
        choices: scale,
      }),
    ),
    ...moduleStatements,
    ...ownQuestions,
    ...form.extra.map((x): Question =>
      x.kind === 'free_text'
        ? {
            kind: 'extra-text',
            id: x.key,
            extraKey: x.key,
            factorLabel: t(`extra.${x.key}.label`),
            text: reg(`extra:${x.key}`, t(`extra.${x.key}.text`)),
            note: t('respond.openNote'),
          }
        : {
            kind: 'extra-choice',
            id: x.key,
            extraKey: x.key,
            factorLabel: t(`extra.${x.key}.label`),
            text: reg(`extra:${x.key}`, t(`extra.${x.key}.text`)),
            // counted from the database, so a question that gains an option gains it here
            choices: Array.from({ length: x.options }, (_, i) => ({
              ordinal: i + 1,
              label: reg(`extra:${x.key}:o${i + 1}`, t(`extra.${x.key}.o${i + 1}`)),
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
    notRelevant: t('respond.notRelevant'),
    commentPrompt: t('respond.commentPrompt'),
    commentPlaceholder: t('respond.commentPlaceholder'),
    openPlaceholder: t('respond.openPlaceholder'),
    // the design's line when the survey is the core one; with a module, the sum (D-113)
    doneTitle: moduleMinutes
      ? t('respond.doneTitleMinutes', { minutes: CORE_MINUTES + moduleMinutes })
      : t('respond.doneTitle'),
    doneLead: t('respond.doneLead', { threshold }),
    submitFailed: t('respond.submitFailed'),
    // P1-4 (D-150): the promises before the first page, going back, time left, a resumed survey
    introTitle: t('respond.introTitle'),
    promises: [t('respond.promise1'), t('respond.promise2', { threshold }), t('respond.promise3'), t('respond.promise4')],
    start: t('respond.start'),
    back: t('respond.back'),
    timeLeft: t.raw('respond.timeLeft') as string,
    restored: t('respond.restored'),
    keyboardHint: t('respond.keyboardHint'),
    since: {
      title: t('respond.since.title'),
      done: t('respond.since.done'),
      ongoing: t('respond.since.ongoing'),
      first: t('respond.since.first'),
    },
    notice: {
      title: t('respond.notice.title'),
      lead: t('respond.notice.lead'),
      points: [t('respond.notice.point1'), t('respond.notice.point2'), t('respond.notice.point3')],
      yes: t('respond.notice.yes'),
      no: t('respond.notice.no'),
    },
  }
}
