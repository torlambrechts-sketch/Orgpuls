import { getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'
import { SetupForm, type SetupFormProps } from '@/components/maleoppsett/SetupForm'
import type { CommentPolicy, EvaluationCadence } from '@/lib/setup/read'

/**
 * Måleoppsett, the rendering. Bundle lines 1425-1710.
 *
 * Six numbered sections and a summary panel. The sections are the decisions an
 * organisation makes before a measurement goes out; section 6 is the one that makes the
 * rest lawful, because a recurring measurement with per-group results is a kontrolltiltak
 * under § 9-2 and that paragraph attaches three duties to it.
 *
 * Everything here is stored — migration 0017 — rather than held in a page's state. The
 * prototype keeps all of it in `this.state`, which is why every control on this screen
 * used to be a control with nowhere to write.
 *
 * The interactive half is SetupForm, a client component. Everything it prints was
 * resolved here, so the client holds no message catalogue, no factor list and no
 * knowledge of what a comment policy means.
 */

export interface GroupChoice {
  id: string
  name: string
  headcount: number
  /** how many of them answered the previous round of this kind, from participation */
  answeredLast: number | null
  /** answered below the threshold last time, so the design warns about this group */
  thin: boolean
}

export interface MaleoppsettView {
  roundId: string
  kind: string
  year: number
  status: string
  /** the instrument, in its own order */
  factors: { key: string; selected: boolean }[]
  questionCount: number
  extraCount: number
  commentPolicy: CommentPolicy
  allowDialogue: boolean
  reminderDay: number | null
  closeAfterDays: number
  evaluationCadence: EvaluationCadence
  groups: GroupChoice[]
  /** empty means every group — the absence of rows, not a choice of all of them */
  invitedGroupIds: string[]
  orgQuestions: { id: string; body: string }[]
  consultations: {
    kind: 'verneombud_raad' | 'droftet_tillitsvalgte'
    confirmed: boolean
    heldOn: string | null
    counterpart: string | null
  }[]
  employeeCount: number
  threshold: number
  /** whether the viewer may write; the database decides, this only styles */
  canWrite: boolean
}

/** The three measurement kinds, in the design's order (bundle 1441). */
const KINDS = ['grunnlinje', 'puls', 'oppfolging'] as const

/** Reminder and closing options, the design's own sets (bundle 1568, 1578). */
const REMINDERS: (number | null)[] = [null, 2, 4]
const CLOSES = [5, 7, 14]

export async function MaleoppsettScreen({ view }: { view: MaleoppsettView }) {
  const t = await getTranslations()

  const invited = view.invitedGroupIds.length
    ? view.groups.filter((g) => view.invitedGroupIds.includes(g.id))
    : view.groups
  const invitedHeadcount = invited.reduce((n, g) => n + g.headcount, 0)
  const thin = invited.filter((g) => g.thin)
  const selectedFactors = view.factors.filter((f) => f.selected).length

  const form: SetupFormProps = {
    roundId: view.roundId,
    canWrite: view.canWrite,
    values: {
      kind: view.kind,
      factorKeys: view.factors.filter((f) => f.selected).map((f) => f.key),
      commentPolicy: view.commentPolicy,
      allowDialogue: view.allowDialogue,
      reminderDay: view.reminderDay,
      closeAfterDays: view.closeAfterDays,
      evaluationCadence: view.evaluationCadence,
      invitedGroupIds: view.invitedGroupIds,
      consultations: view.consultations,
    },
    options: {
      kinds: KINDS.map((k) => ({
        value: k,
        label: t(`maleoppsett.kind.${k}.label`),
        // the grunnlinje's note quotes the set's real size; the other two do not take it
        note: t(`maleoppsett.kind.${k}.note`, { count: view.questionCount }),
      })),
      factors: view.factors.map((f) => ({ value: f.key, label: t(`factor.${f.key}.label`) })),
      commentPolicies: (['hvert', 'lave', 'slutt', 'av'] as const).map((c) => ({
        value: c,
        label: t(`maleoppsett.comment.${c}.label`),
        note: t(`maleoppsett.comment.${c}.note`),
      })),
      reminders: REMINDERS.map((r) => ({
        value: r === null ? '' : String(r),
        label: r === null ? t('maleoppsett.reminderNone') : t('maleoppsett.reminderDay', { day: r }),
      })),
      closes: CLOSES.map((c) => ({
        value: String(c),
        label: t('maleoppsett.closeDays', { days: c }),
      })),
      evaluations: (['hver_6_mnd', 'arlig', 'etter_hver_runde'] as const).map((e) => ({
        value: e,
        label: t(`maleoppsett.evaluation.${e}`),
      })),
      groups: view.groups.map((g) => ({
        value: g.id,
        label: g.name,
        note:
          g.answeredLast === null
            ? t('maleoppsett.groupHead', { count: g.headcount })
            : t('maleoppsett.groupHeadAnswered', {
                count: g.headcount,
                answered: g.answeredLast,
              }),
      })),
    },
    labels: {
      section1: t('maleoppsett.section1'),
      section2: t('maleoppsett.section2'),
      section3: t('maleoppsett.section3'),
      section4: t('maleoppsett.section4'),
      section5: t('maleoppsett.section5'),
      section6: t('maleoppsett.section6'),
      factorNote: t('maleoppsett.factorNote'),
      seeAll: t('maleoppsett.seeAll', { count: view.questionCount }),
      commentHead: t('maleoppsett.commentHead'),
      commentLead: t('maleoppsett.commentLead'),
      dialogue: t('maleoppsett.dialogue'),
      dialogueNote: view.allowDialogue
        ? t('maleoppsett.dialogueOn')
        : t('maleoppsett.dialogueOff'),
      groupWarn: thin.length
        ? t('maleoppsett.groupWarnThin', {
            group: thin.map((g) => g.name).join(', '),
            answered: thin[0]?.answeredLast ?? 0,
            threshold: view.threshold,
          })
        : t('maleoppsett.groupWarnNone', { threshold: view.threshold }),
      groupWarnAlert: thin.length > 0,
      cadence: t('maleoppsett.cadenceArlig'),
      reminderHead: t('maleoppsett.reminderHead'),
      closeHead: t('maleoppsett.closeHead'),
      ownCount: t('maleoppsett.ownCount', { count: view.orgQuestions.length }),
      ownNote: t('maleoppsett.ownNote'),
      ownFull: t('maleoppsett.ownFull'),
      ownAdd: t('maleoppsett.ownAdd'),
      ownSave: t('maleoppsett.ownSave'),
      ownOr: t('maleoppsett.ownOr'),
      ownRemove: t('maleoppsett.ownRemove'),
      ownPlaceholder: t('maleoppsett.ownPlaceholder'),
      suggestions: [1, 2, 3, 4].map((n) => t(`maleoppsett.suggest${n}`)),
      consentLead: t('maleoppsett.consentLead'),
      vo: t('maleoppsett.vo'),
      voLaw: t('maleoppsett.voLaw'),
      voNote: t('maleoppsett.voNote'),
      tv: t('maleoppsett.tv'),
      tvLaw: t('maleoppsett.tvLaw'),
      tvNote: t('maleoppsett.tvNote'),
      infoHead: t('maleoppsett.infoHead'),
      infoLaw: t('maleoppsett.infoLaw'),
      info: [
        { k: t('maleoppsett.infoPurposeKey'), v: t('maleoppsett.infoPurposeValue') },
        {
          k: t('maleoppsett.infoConsequenceKey'),
          v: t('maleoppsett.infoConsequenceValue', { threshold: view.threshold }),
        },
        { k: t('maleoppsett.infoDurationKey'), v: t('maleoppsett.infoDurationValue') },
      ],
      evalHead: t('maleoppsett.evalHead'),
      evalLaw: t('maleoppsett.evalLaw'),
      saved: t('maleoppsett.saved'),
      problems: Object.fromEntries(
        ['invalid', 'denied', 'gone', 'capped'].map((k) => [k, t(`maleoppsett.problem.${k}`)]),
      ),
    },
    orgQuestions: view.orgQuestions,
  }

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[28px] pb-[60px] pt-[26px]">
      <ButtonLink href="/malinger" size="xxs" tone="ghost">
        {t('maleoppsett.back')}
      </ButtonLink>

      <div className="mt-[16px]">
        <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">
          {t(`maleoppsett.title.${view.kind}`)}
        </h1>
        <p className="mt-[9px] max-w-[620px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t(`maleoppsett.lead.${view.kind}`)}
        </p>
      </div>

      <div className="mt-[24px] grid items-start gap-[20px] [grid-template-columns:minmax(0,1.6fr)_minmax(280px,0.9fr)]">
        <SetupForm {...form} />

        <div className="sticky top-[78px] flex min-w-0 flex-col gap-[14px]">
          <section className="rounded-panel border border-line bg-ink px-[24px] py-[22px] text-bg">
            <div className="text-[11px] uppercase tracking-[0.11em] opacity-65">
              {t('maleoppsett.summaryHead')}
            </div>
            <div className="mt-[8px] font-display text-[26px] font-semibold leading-[1.15]">
              {t('maleoppsett.summaryQuestions', { count: view.questionCount })}
            </div>

            <div className="mt-[16px] flex flex-col gap-[9px]">
              {/*
                The design's first row is "Tid — ca. 5 minutter å svare". It is omitted:
                nothing measures how long a respondent takes, and any minutes-per-question
                constant that reproduces the design's figure would be a number chosen to
                match a screenshot. D-27.
              */}
              <SummaryRow
                label={t('maleoppsett.summaryPeople')}
                value={t('maleoppsett.summaryPeopleValue', {
                  invited: invitedHeadcount,
                  total: view.employeeCount,
                })}
              />
              <SummaryRow
                label={t('maleoppsett.summaryFactors')}
                value={
                  selectedFactors === view.factors.length
                    ? t('maleoppsett.summaryAllFactors', { count: selectedFactors })
                    : t('maleoppsett.summarySomeFactors', { count: selectedFactors })
                }
              />
              <SummaryRow
                label={t('maleoppsett.summaryCadence')}
                value={t('maleoppsett.cadenceArlig')}
              />
            </div>

            <div className="mt-[16px] border-t border-bg/20 pt-[14px] text-[12.5px] leading-[1.55] opacity-80 [text-wrap:pretty]">
              {view.reminderDay === null
                ? t('maleoppsett.summaryNoReminder', { days: view.closeAfterDays })
                : t('maleoppsett.summaryReminder', {
                    day: view.reminderDay,
                    days: view.closeAfterDays,
                  })}
              <br />
              {t(`maleoppsett.summaryEval.${view.evaluationCadence}`)}
            </div>

            <div className="mt-[12px] rounded-ctl bg-bg/[0.12] px-[12px] py-[10px] text-[12px] leading-[1.5] [text-wrap:pretty]">
              {t('maleoppsett.summaryLegal')}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-[12px] text-[13px]">
      <span className="opacity-65">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  )
}
