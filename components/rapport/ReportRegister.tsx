'use client'

import { useActionState, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  addInformation,
  addTraining,
  removeInformation,
  removeTraining,
  type RegisterResult,
} from '@/app/(app)/rapport/actions'
import { INFORMATION_AUDIENCES, INFORMATION_CHANNELS } from '@/lib/report/enums'

/**
 * Where section 8's records are made. Not in the design: the bundle prints section 8 as
 * two paragraphs of prose and has no control that could have produced them. D-52.
 *
 * It sits under the document rather than inside it, is hidden in print with the rest of
 * the report's chrome, and lists each record in the words the document prints, so what
 * is typed here and what the inspector reads cannot drift apart.
 */

export interface RegisterItem {
  id: string
  /** the document's own sentence for this record */
  line: string
  note: string | null
}

const CONTROL = 'box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[11px] text-[13.5px] text-ink'
const PRIMARY =
  'inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-ink bg-ac px-[16px] text-[13.5px] font-bold text-ink disabled:cursor-default disabled:opacity-60'
const REMOVE =
  'inline-flex h-[32px] flex-none cursor-pointer items-center rounded-ctl border border-line bg-transparent px-[12px] text-[12.5px] font-semibold text-ink disabled:cursor-default disabled:opacity-60'

const PROBLEMS = new Set(['invalid', 'duplicate', 'nextDue', 'denied'])

export function ReportRegister({
  round,
  information,
  trainings,
}: {
  /** the round section 8's information belongs to — the year's grunnlinje — if closed */
  round: { id: string; title: string } | null
  information: RegisterItem[]
  trainings: RegisterItem[]
}) {
  const t = useTranslations('rapport.register')

  return (
    <section className="report-chrome mx-auto max-w-[1180px] px-[16px] pb-[48px] md:px-[28px]">
      <div className="rounded-panel border border-line bg-sf px-[26px] py-[24px] max-md:px-[18px]">
        <h2 className="m-0 font-display text-[21px] font-semibold">{t('title')}</h2>
        <p className="mt-[6px] max-w-[680px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('lead')}
        </p>

        <div className="mt-[18px] grid gap-[28px] md:grid-cols-2">
          <div className="min-w-0">
            <span className="block text-[14.5px] font-bold">{t('infoHead')}</span>
            <span className="mt-[3px] block text-[12.5px] text-mut">
              {round ? t('infoFor', { round: round.title }) : t('infoNoRound')}
            </span>
            <Items items={information} remove={removeInformation} />
            {round ? <InformationForm roundId={round.id} /> : null}
          </div>

          <div className="min-w-0">
            <span className="block text-[14.5px] font-bold">{t('trainingHead')}</span>
            <span className="mt-[3px] block text-[12.5px] text-mut">{t('trainingFor')}</span>
            <Items items={trainings} remove={removeTraining} />
            <TrainingForm />
          </div>
        </div>
      </div>
    </section>
  )
}

function Items({ items, remove }: { items: RegisterItem[]; remove: (id: string) => Promise<RegisterResult> }) {
  const t = useTranslations('rapport.register')
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)

  if (items.length === 0) return <p className="mt-[12px] text-[13px] text-mut">{t('none')}</p>

  return (
    <>
      <ul className="m-0 mt-[12px] flex list-none flex-col gap-[8px] p-0">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-start justify-between gap-[10px] rounded-tile border border-line bg-bg px-[14px] py-[10px]"
          >
            <span className="min-w-0 text-[13px] leading-[1.5] [overflow-wrap:anywhere]">
              {i.line}
              {i.note ? <span className="block text-[12.5px] text-mut">{i.note}</span> : null}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setProblem(null)
                  const result = await remove(i.id)
                  if (!result.ok) setProblem(result.problem)
                })
              }
              className={REMOVE}
            >
              {t('remove')}
            </button>
          </li>
        ))}
      </ul>
      <Problem problem={problem} />
    </>
  )
}

function InformationForm({ roundId }: { roundId: string }) {
  const t = useTranslations('rapport')
  const [state, action, pending] = useActionState<RegisterResult | null, FormData>(addInformation, null)

  return (
    <form action={action} className="mt-[14px] grid gap-[10px] border-t border-line pt-[14px] sm:grid-cols-2">
      <input type="hidden" name="roundId" value={roundId} />
      <Field label={t('register.audience')}>
        <select name="audience" required defaultValue="alle_ansatte" className={CONTROL}>
          {INFORMATION_AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {t(`audienceName.${a}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('register.channel')}>
        <select name="channel" required defaultValue="allmote" className={CONTROL}>
          {INFORMATION_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {t(`channel.${c}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('register.heldOn')}>
        <input type="date" name="heldOn" required className={CONTROL} />
      </Field>
      <Field label={t('register.note')}>
        <input name="note" maxLength={1000} className={CONTROL} />
      </Field>
      <span className="flex flex-wrap items-center gap-[10px] sm:col-span-2">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? t('register.saving') : t('register.addInfo')}
        </button>
        <Problem problem={state && !state.ok ? state.problem : null} inline />
      </span>
    </form>
  )
}

function TrainingForm() {
  const t = useTranslations('rapport')
  const [state, action, pending] = useActionState<RegisterResult | null, FormData>(addTraining, null)

  return (
    <form action={action} className="mt-[14px] grid gap-[10px] border-t border-line pt-[14px] sm:grid-cols-2">
      <span className="sm:col-span-2">
        <Field label={t('register.trainingTitle')}>
          <input name="title" required maxLength={200} className={CONTROL} />
        </Field>
      </span>
      <Field label={t('register.audience')}>
        <select name="audience" required defaultValue="ledere" className={CONTROL}>
          {INFORMATION_AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {t(`audienceName.${a}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('register.heldOn')}>
        <input type="date" name="heldOn" required className={CONTROL} />
      </Field>
      <Field label={t('register.nextDue')}>
        <input type="date" name="nextDue" className={CONTROL} />
      </Field>
      <Field label={t('register.note')}>
        <input name="note" maxLength={1000} className={CONTROL} />
      </Field>
      <span className="flex flex-wrap items-center gap-[10px] sm:col-span-2">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? t('register.saving') : t('register.addTraining')}
        </button>
        <Problem problem={state && !state.ok ? state.problem : null} inline />
      </span>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-[5px] block text-[11.5px] text-mut">{label}</span>
      {children}
    </label>
  )
}

function Problem({ problem, inline = false }: { problem: string | null; inline?: boolean }) {
  const t = useTranslations('rapport.register')
  if (!problem) return null
  return (
    <span role="alert" className={`${inline ? '' : 'mt-[8px] '}block text-[12.5px] text-danger`}>
      {t(`problem.${PROBLEMS.has(problem) ? problem : 'denied'}`)}
    </span>
  )
}
