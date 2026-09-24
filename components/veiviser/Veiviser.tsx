'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  fetchRegistry,
  importEmployees,
  saveLawMode,
  saveOrgName,
  setEmployeeDutyRole,
  setThreshold,
} from '@/app/(app)/oppsett/actions'
import {
  finishWizard,
  loadWizard,
  planFirstRound,
  saveWizardRhythm,
  saveWizardStep,
  skipWizard,
} from '@/app/(app)/oppsett/wizard-actions'
import type { WizardModel } from '@/lib/wizard/read'
import { wheelMonths } from '@/lib/wheel/months'

/**
 * The Veiviser (design 3, v3 191-406; D-76): nine steps in a dialog over the page.
 *
 * Every step writes through the action that owns its table and moves on only when that
 * write is confirmed, so a wizard left half-way leaves the organisation in a state every
 * other screen already understands. The step itself is saved on each move, and
 * "Fortsett senere" and Escape close it there.
 *
 * What the prototype invents is not drawn: no "Daglig leder" from the register (it does
 * not return one), no thresholds of 3 or 4 (k is 5 and cannot be lowered, S1), no Entra
 * import (there is no integration), and the verneombud is a person in the register, not a
 * name typed into a field (`duty_role`, 0021).
 */
const STEPS = ['velkommen', 'virksomheten', 'ansatte', 'grupper', 'verneombud', 'maling', 'rytme', 'utsending', 'klart'] as const
const LAST = STEPS.length - 1
type Method = 'csv' | 'paste' | 'entra' | 'hand'
type Cadence = 'kvartalspuls' | 'halvarspuls' | 'manedspuls' | 'minimum'
const PRESETS: Cadence[] = ['kvartalspuls', 'halvarspuls', 'manedspuls', 'minimum']
const THRESHOLDS = [5, 8]

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const chip = (on: boolean) => ({
  background: on ? '#FBEBBE' : '#FFFDF6',
  borderColor: on ? '#191510' : '#E8DFC9',
  fontWeight: on ? 700 : 500,
})

function Card({
  on,
  label,
  note,
  onPick,
  pad = 'px-[15px] py-[14px]',
}: {
  on: boolean
  label: string
  note: string
  onPick: () => void
  pad?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={`flex cursor-pointer items-start gap-[11px] rounded-[13px] border text-left leading-[normal] text-ink ${pad} ${focus}`}
      style={{ background: chip(on).background, borderColor: chip(on).borderColor }}
    >
      <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink">
        <span className="block h-[8px] w-[8px] rounded-pill" style={{ background: on ? '#191510' : 'transparent' }} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px]" style={{ fontWeight: chip(on).fontWeight }}>
          {label}
        </span>
        <span className="mt-[3px] block text-[12px] leading-[1.45] text-mut [text-wrap:pretty]">{note}</span>
      </span>
    </button>
  )
}

function Box({ on }: { on: boolean }) {
  return (
    <span
      className="flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[5px] border-2 border-ink text-[11px] font-bold"
      style={{ background: on ? '#191510' : '#FFFDF6', color: on ? '#FCF6E9' : 'transparent' }}
    >
      {on ? '✓' : ''}
    </span>
  )
}

function Lead({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <p
      className={`mb-0 mt-[8px] text-[14px] leading-[1.6] text-mut [text-wrap:pretty] ${wide ? 'max-w-[600px]' : 'max-w-[560px]'}`}
    >
      {children}
    </p>
  )
}

export function Veiviser({ face, onClose }: { face: string; onClose: (later: boolean) => void }) {
  const t = useTranslations('veiviser')
  const tf = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const dialog = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)

  const [model, setModel] = useState<WizardModel | null>(null)
  const [failed, setFailed] = useState(false)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  // the drafts, one per step, seeded from the model
  const [orgNr, setOrgNr] = useState('')
  const [orgName, setOrgName] = useState('')
  const [fetching, setFetching] = useState(false)
  const [method, setMethod] = useState<Method>('csv')
  const [paste, setPaste] = useState('')
  const [file, setFile] = useState<{ name: string; text: string; lines: number } | null>(null)
  const [threshold, setThr] = useState(5)
  const [vo, setVo] = useState('')
  const [tv, setTv] = useState('')
  const [law, setLaw] = useState(true)
  const [cadence, setCadence] = useState<Cadence>('kvartalspuls')
  const [base, setBase] = useState(9)
  const [pause, setPause] = useState(true)
  const [voFirst, setVoFirst] = useState(true)
  const [day, setDay] = useState('')

  const seed = useCallback((m: WizardModel) => {
    setModel(m)
    setOrgNr(m.org.orgNumber ?? '')
    setOrgName(m.org.name)
    setThr(m.threshold)
    setVo(m.employees.find((e) => e.dutyRole === 'verneombud')?.id ?? '')
    setTv(m.employees.find((e) => e.dutyRole === 'tillitsvalgt')?.id ?? '')
    setLaw(m.lawMode)
    if (m.wheel) {
      setCadence(m.wheel.cadence)
      setBase(m.wheel.baselineMonth)
      setPause(m.wheel.skipFellesferie)
      setVoFirst(m.wheel.voLead === null || m.wheel.voLead > 0)
    }
    const planned = m.send.planned
      ? new Intl.DateTimeFormat('en-CA', { timeZone: m.timezone }).format(new Date(m.send.planned))
      : null
    setDay(planned && m.send.days.includes(planned) ? planned : (m.send.days[0] ?? ''))
  }, [])

  useEffect(() => {
    let live = true
    loadWizard()
      .then((m) => {
        if (!live) return
        if (!m) return setFailed(true)
        seed(m)
        setStep(m.step)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [seed])

  const refresh = async () => {
    const m = await loadWizard()
    if (m) setModel(m)
    return m
  }

  const later = useCallback(() => {
    const d = new FormData()
    d.set('step', String(step))
    void saveWizardStep(d)
    onClose(true)
  }, [step, onClose])

  // the dialog holds focus: Tab cycles inside it, Escape is "Fortsett senere"
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        later()
        return
      }
      if (e.key !== 'Tab' || !dialog.current) return
      const all = [
        ...dialog.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, label[tabindex]'),
      ].filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
      if (!all.length) return
      const first = all[0]!
      const last = all[all.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [later])

  // each step starts at its title, for the eye and for a screen reader
  useEffect(() => {
    if (!model) return
    body.current?.scrollTo?.(0, 0)
    body.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [step, model])

  const go = async (to: number) => {
    setProblem(null)
    setStep(to)
    const d = new FormData()
    d.set('step', String(to))
    await saveWizardStep(d)
  }

  const run = async (fn: () => Promise<{ ok: boolean; problem?: string } | { ok: true }>, ns: string) => {
    const r = (await fn()) as { ok: boolean; problem?: string }
    if (r.ok) return true
    const key = `${ns}.problem.${r.problem}`
    setProblem(t.has(key) ? t(key) : t('problem'))
    return false
  }

  const form = (entries: Record<string, string>) => {
    const d = new FormData()
    for (const [k, v] of Object.entries(entries)) d.set(k, v)
    return d
  }

  /** what "Neste" writes on each step before it moves on */
  const next = async () => {
    if (!model || busy) return
    setBusy(true)
    setProblem(null)
    try {
      let ok = true
      if (step === 1 && model.org.fetched && orgName.trim() !== model.org.name) {
        ok = await run(() => saveOrgName(form({ name: orgName })), 'org')
      }
      if (step === 2) {
        const rows = method === 'csv' ? file?.text : method === 'paste' ? paste : undefined
        if (rows && rows.trim()) {
          ok = await run(() => importEmployees(form({ rows })), 'people')
          if (ok) {
            setPaste('')
            setFile(null)
            await refresh()
          }
        }
      }
      if (step === 3 && threshold !== model.threshold) {
        ok = await run(() => setThreshold(form({ threshold: String(threshold) })), 'groups')
      }
      if (step === 4) {
        const was = (role: string) => model.employees.find((e) => e.dutyRole === role)?.id ?? ''
        for (const [role, now] of [
          ['verneombud', vo],
          ['tillitsvalgt', tv],
        ] as const) {
          const before = was(role)
          if (before === now) continue
          if (before) ok = ok && (await run(() => setEmployeeDutyRole(form({ id: before, dutyRole: '' })), 'safety'))
          if (now) ok = ok && (await run(() => setEmployeeDutyRole(form({ id: now, dutyRole: role })), 'safety'))
        }
        if (ok) await refresh()
      }
      if (step === 5 && law !== model.lawMode) {
        ok = await run(() => saveLawMode(form({ lawMode: law ? 'on' : 'off' })), 'law')
      }
      if (step === 6) {
        ok = await run(
          () =>
            saveWizardRhythm(
              form({
                cadence,
                baselineMonth: String(base),
                skipFellesferie: pause ? 'on' : 'off',
                voFirst: voFirst ? 'on' : 'off',
              }),
            ),
          'rhythm',
        )
        if (ok) await refresh()
      }
      if (step === 7 && !model.send.measured) {
        ok = await run(() => planFirstRound(form({ day })), 'send')
      }
      if (step === 7 && ok) await refresh()
      if (ok) await go(step + 1)
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    setBusy(true)
    const r = await finishWizard()
    setBusy(false)
    if (!r.ok) return setProblem(t('problem'))
    onClose(false)
    router.push('/innsikt' as Route)
    router.refresh()
  }

  const skip = async () => {
    await skipWizard()
    onClose(false)
  }

  const fetchOrg = async () => {
    if (fetching) return
    setFetching(true)
    setProblem(null)
    const ok = await run(() => fetchRegistry(form({ orgNumber: orgNr })), 'org')
    if (ok) {
      const m = await refresh()
      if (m) setOrgName(m.org.name)
    }
    setFetching(false)
  }

  const readFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const text = await f.text()
      setFile({ name: f.name, text, lines: text.split('\n').filter((l) => l.trim()).length })
      setProblem(null)
    } catch {
      setProblem(t('people.problem.unreadable'))
    }
  }

  // ---------------------------------------------------------------- presentation
  const monthLong = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15)))
  const monthShort = (m: number) => {
    const n = monthLong(m)
    return n.charAt(0).toLocaleUpperCase(locale) + n.slice(1, 3)
  }
  const dayLabel = (iso: string) => {
    const s = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
      new Date(`${iso}T12:00:00Z`),
    )
    return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1)
  }
  const plannedLabel = (at: string, tz: string) => {
    const s = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(
      new Date(at),
    )
    return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1)
  }

  if (!model) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(25,21,16,.55)] p-[24px]">
        <div role="status" className="rounded-[22px] bg-bg px-[28px] py-[22px] text-[14px] text-mut">
          {failed ? t('loadFailed') : t('loading')}
          {failed ? (
            <button type="button" onClick={() => onClose(false)} className={`ml-[14px] font-bold text-ink ${focus}`}>
              ×
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const emp = model.org.employeeCount
  const pulses = wheelMonths(cadence, base, pause)
    .filter((m) => m.kind === 'puls')
    .map((m) => m.month)
  const voOnDays = model.wheel?.voLead && model.wheel.voLead > 0 ? model.wheel.voLead : 2
  const voName = model.employees.find((e) => e.dutyRole === 'verneombud')?.name ?? null
  const tvName = model.employees.find((e) => e.dutyRole === 'tillitsvalgt')?.name ?? null
  const small = model.groups.filter((g) => g.headcount < threshold)
  const thresholds = THRESHOLDS.includes(model.threshold) ? THRESHOLDS : [...THRESHOLDS, model.threshold].sort((a, b) => a - b)
  const minutes = Math.max(1, Math.round((model.questions * 8) / 60))
  const nextLabel = step === 0 ? t('start') : step === LAST - 1 && !model.send.measured ? t('plan') : t('next')

  const control =
    'box-border h-[42px] w-full rounded-btn border border-line bg-sf px-[14px] text-[14px] text-ink outline-none focus-visible:border-ink'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(25,21,16,.55)] p-[24px] max-sm:p-[10px]">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="veiviser-title"
        className="grid max-h-[calc(100vh-48px)] w-full max-w-[920px] grid-cols-[230px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-[22px] bg-bg shadow-[0_30px_80px_-30px_rgba(25,21,16,.6)] max-sm:max-h-[calc(100vh-20px)] max-sm:grid-cols-[minmax(0,1fr)]"
      >
        <nav
          aria-label={t('stepsAria')}
          className="flex min-h-0 flex-col gap-[4px] overflow-auto border-r border-line bg-sf px-[20px] py-[26px] max-sm:hidden"
        >
          <div className="px-[6px] pb-[12px] text-[11px] uppercase tracking-[.11em] text-mut">
            {t('head', { n: step + 1, total: STEPS.length })}
          </div>
          {STEPS.map((s, i) => {
            const on = i === step
            const done = i < step
            return (
              <button
                key={s}
                type="button"
                onClick={() => i <= step && i !== step && void go(i)}
                aria-current={on ? 'step' : undefined}
                disabled={i > step}
                className={`flex items-center gap-[10px] rounded-ctl border-none bg-transparent p-[8px] text-left leading-[normal] text-ink disabled:cursor-default ${i < step ? 'cursor-pointer' : ''} ${focus}`}
              >
                <span
                  className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-pill border-2 text-[11px] font-bold"
                  style={{
                    background: on ? '#191510' : done ? '#CFE7E4' : '#FFFDF6',
                    color: on ? '#FCF6E9' : done ? '#20431C' : '#5F5849',
                    borderColor: on ? '#191510' : done ? '#2F5D2A' : '#E8DFC9',
                  }}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className="text-[13px]" style={{ fontWeight: on ? 700 : 600, color: i <= step ? '#191510' : '#5F5849' }}>
                  {t(`steps.${s}`)}
                </span>
              </button>
            )
          })}
          <div className="mt-auto px-[6px] pt-[12px]">
            <div className="h-[5px] overflow-hidden rounded-pill bg-line">
              <div className="h-full bg-ac" style={{ width: `${Math.round((step / LAST) * 100)}%` }} />
            </div>
            <button
              type="button"
              onClick={later}
              className={`mt-[14px] cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold leading-[normal] text-mut ${focus}`}
            >
              {t('later')}
            </button>
          </div>
        </nav>

        <div ref={body} className="flex min-h-0 min-w-0 flex-col overflow-auto">
          <div className="flex-1 px-[32px] pt-[28px] max-sm:px-[18px]">
            {/* the step list is folded away on a phone; this is where it says how far */}
            <div className="mb-[8px] hidden text-[11px] uppercase tracking-[.11em] text-mut max-sm:block">
              {t('head', { n: step + 1, total: STEPS.length })}
            </div>
            <h2
              id="veiviser-title"
              tabIndex={-1}
              className="m-0 font-display text-[28px] font-semibold leading-[1.15] outline-none"
            >
              {t(`steps.${STEPS[step]}`)}
            </h2>

            {step === 0 ? (
              <>
                <div className="mt-[18px] flex items-start gap-[16px] rounded-note bg-sbg px-[20px] py-[18px]">
                  <span
                    aria-hidden
                    className="block h-[44px] w-[44px] flex-none rounded-cta bg-sf bg-cover bg-center"
                    style={{ backgroundImage: `url(/tuva/${face}.png)` }}
                  />
                  <span className="text-[14.5px] leading-[1.6] [text-wrap:pretty]">{t('welcome')}</span>
                </div>
                <ul className="m-0 mt-[18px] flex list-none flex-col gap-[8px] p-0">
                  {(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7'] as const).map((k) => (
                    <li key={k} className="flex items-center gap-[12px] text-[14px]">
                      <span className="h-[8px] w-[8px] flex-none rounded-pill bg-ink" />
                      {t(`welcomeList.${k}`)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <Lead>{t('org.lead')}</Lead>
                <div className="mt-[18px] grid max-w-[520px] grid-cols-[minmax(0,1fr)_auto] items-end gap-[10px] max-sm:grid-cols-1">
                  <label className="block">
                    <span className="mb-[6px] block text-[12.5px] font-semibold">{t('org.number')}</span>
                    <input
                      value={orgNr}
                      onChange={(e) => setOrgNr(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      className={`${control} rounded-btn`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={fetchOrg}
                    disabled={fetching}
                    className={`h-[42px] cursor-pointer whitespace-nowrap rounded-btn border border-ink bg-ac px-[16px] text-[13px] font-bold leading-[normal] text-ink ${focus}`}
                  >
                    {fetching ? t('org.fetching') : model.org.fetched ? t('org.fetched') : t('org.fetch')}
                  </button>
                </div>
                {model.org.fetched ? (
                  <div className="mt-[14px] max-w-[520px] rounded-opt border border-line bg-sf px-[18px] py-[16px]">
                    <label className="block">
                      <span className="mb-[6px] block text-[12.5px] font-semibold">{t('org.name')}</span>
                      <input
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[14px] text-ink outline-none focus-visible:border-ink"
                      />
                    </label>
                    <div className="mt-[12px] flex flex-col gap-[7px]">
                      {(
                        [
                          ['address', model.org.address],
                          ['industry', model.org.industry],
                          ['registered', model.org.registryEmployees === null ? null : String(model.org.registryEmployees)],
                        ] as const
                      )
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k} className="flex gap-[12px] text-[13px]">
                            <span className="w-[130px] flex-none text-mut">{t(`org.${k}`)}</span>
                            <span className="font-semibold">{v}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Lead>{t('people.lead', { count: model.people })}</Lead>
                <div className="mt-[18px] grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                  {(['csv', 'paste', 'entra', 'hand'] as const).map((k) => (
                    <Card
                      key={k}
                      on={method === k}
                      label={t(`people.method.${k}.label`)}
                      note={t(`people.method.${k}.note`)}
                      onPick={() => setMethod(k)}
                    />
                  ))}
                </div>
                {method === 'csv' ? (
                  <label
                    className="mt-[14px] block cursor-pointer rounded-opt border-2 border-dashed border-rule bg-sf p-[26px] text-center text-[13.5px] leading-[1.5] text-mut focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink [text-wrap:pretty]"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      void readFile(e.dataTransfer.files[0])
                    }}
                  >
                    <input
                      type="file"
                      accept=".csv,.txt,text/csv,text/plain"
                      aria-label={t('people.fileAria')}
                      className="sr-only"
                      onChange={(e) => void readFile(e.target.files?.[0])}
                    />
                    {file ? t('people.fileChosen', { name: file.name, count: file.lines }) : t('people.fileNote')}
                  </label>
                ) : null}
                {method === 'entra' ? (
                  <div className="mt-[14px] rounded-opt border-2 border-dashed border-rule bg-sf p-[26px] text-center text-[13.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                    {t('people.entraNote')}
                  </div>
                ) : null}
                {method === 'paste' ? (
                  <textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    placeholder={t('people.pastePlaceholder')}
                    aria-label={t('people.pasteAria')}
                    className="mt-[14px] box-border block min-h-[120px] w-full resize-y rounded-[13px] border border-line bg-sf px-[15px] py-[13px] text-[13.5px] leading-[1.55] text-ink outline-none focus-visible:border-ink"
                  />
                ) : null}
                {method === 'hand' ? (
                  <Link
                    href={'/oppsett?fane=ansatte' as Route}
                    onClick={later}
                    className={`mt-[14px] inline-flex h-[40px] items-center rounded-btn border border-ink bg-sf px-[16px] text-[13px] font-bold text-ink no-underline ${focus}`}
                  >
                    {t('people.register')}
                  </Link>
                ) : null}
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Lead>{t('groups.lead')}</Lead>
                {model.groups.length ? (
                  <div className="mt-[18px] flex max-w-[560px] flex-col gap-[8px]">
                    {model.groups.map((g) => {
                      const under = g.headcount < threshold
                      return (
                        <div
                          key={g.id}
                          className="flex items-center justify-between gap-[12px] rounded-btn border border-line bg-sf px-[14px] py-[11px]"
                        >
                          <span className="text-[13.5px] font-semibold">{g.name}</span>
                          <span className="text-[12px]" style={{ color: under ? '#A33A16' : '#5F5849' }}>
                            {t('groups.count', { count: g.headcount })} {under ? t('groups.small') : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="mt-[18px] max-w-[560px] rounded-btn border border-dashed border-rule bg-sf px-[14px] py-[13px] text-[13px] leading-[1.5] text-mut">
                    {t('groups.none')}
                  </div>
                )}
                <div className="mt-[18px] text-[13px] font-semibold">{t('groups.threshold')}</div>
                <div className="mt-[9px] flex flex-wrap gap-[7px]">
                  {thresholds.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={threshold === n}
                      onClick={() => setThr(n)}
                      className={`cursor-pointer rounded-pill border px-[15px] py-[8px] text-[12.5px] leading-[normal] text-ink ${focus}`}
                      style={chip(threshold === n)}
                    >
                      {t('groups.chip', { n })}
                    </button>
                  ))}
                </div>
                <div className="mt-[10px] max-w-[560px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                  {small.length
                    ? t('groups.someSmall', {
                        names: new Intl.ListFormat(locale, { type: 'conjunction' }).format(small.map((g) => g.name)),
                        n: threshold,
                      })
                    : model.groups.length
                      ? t('groups.allLarge')
                      : null}
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <Lead>{emp >= 5 ? t('safety.duty', { count: emp }) : t('safety.dutySmall')}</Lead>
                {model.employees.length ? (
                  <div className="mt-[18px] grid max-w-[560px] gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                    {(
                      [
                        ['vo', vo, setVo, tv],
                        ['tv', tv, setTv, vo],
                      ] as const
                    ).map(([k, value, set, other]) => (
                      <label key={k} className="block">
                        <span className="mb-[6px] block text-[12.5px] font-semibold">{t(`safety.${k}`)}</span>
                        <select value={value} onChange={(e) => set(e.target.value)} className={control}>
                          <option value="">{t('safety.nobody')}</option>
                          {model.employees
                            .filter((e) => e.id !== other)
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="mt-[18px] max-w-[560px] rounded-btn border border-dashed border-rule bg-sf px-[14px] py-[13px] text-[13px] leading-[1.5] text-mut">
                    {t('safety.empty')}
                  </div>
                )}
                {emp >= 10 ? (
                  <div className="mt-[14px] max-w-[560px] rounded-cta bg-sbg px-[15px] py-[13px] text-[13px] leading-[1.55] [text-wrap:pretty]">
                    {emp >= 30 ? t('safety.amuMust') : t('safety.amuMay')}
                  </div>
                ) : null}
              </>
            ) : null}

            {step === 5 ? (
              <>
                <Lead>{t('law.lead')}</Lead>
                <div className="mt-[18px] grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                  {([true, false] as const).map((k) => (
                    <Card
                      key={String(k)}
                      on={law === k}
                      label={t(`law.${k ? 'on' : 'off'}.label`)}
                      note={t(`law.${k ? 'on' : 'off'}.note`)}
                      onPick={() => setLaw(k)}
                    />
                  ))}
                </div>
                <div className="mt-[16px] flex flex-wrap gap-[6px]">
                  {model.factorKeys.map((k) => (
                    <span key={k} className="rounded-pill border border-line bg-sf px-[12px] py-[6px] text-[12px] font-semibold">
                      {tf(`factor.${k}.label`)}
                    </span>
                  ))}
                </div>
                <div className="mt-[12px] max-w-[560px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                  {t('law.note')}
                </div>
              </>
            ) : null}

            {step === 6 ? (
              <>
                <Lead wide>{t('rhythm.lead')}</Lead>
                <div className="mt-[16px] grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  {PRESETS.map((k) => (
                    <Card
                      key={k}
                      on={cadence === k}
                      label={t(`rhythm.preset.${k}.label`)}
                      note={t(`rhythm.preset.${k}.note`)}
                      onPick={() => setCadence(k)}
                      pad="px-[14px] py-[13px]"
                    />
                  ))}
                </div>
                <div className="mt-[16px] rounded-opt border border-line bg-sf px-[18px] py-[16px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
                    <span className="text-[11px] uppercase tracking-[.11em] text-mut">
                      {t('rhythm.year', { count: 1 + pulses.length })}
                    </span>
                    <span className="text-[12px] text-mut">{t('rhythm.cellsNote')}</span>
                  </div>
                  <div className="mt-[12px] grid grid-cols-[repeat(12,minmax(0,1fr))] gap-[4px]">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const isB = m === base
                      const isP = pulses.includes(m)
                      const isF = m === ((base + 10) % 12) + 1
                      const lab = isB ? 'hoved' : isP ? 'puls' : isF ? 'avklaring' : pause && m === 7 ? 'ferie' : null
                      return (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={isB}
                          aria-label={t('rhythm.monthAria', {
                            month: monthLong(m),
                            what: lab ? t(`rhythm.cell.${lab}`) : t('rhythm.cell.ingen'),
                          })}
                          onClick={() => setBase(m)}
                          className={`flex min-w-0 cursor-pointer flex-col items-center gap-[5px] rounded-ctl border-none bg-transparent px-[2px] py-[8px] leading-[normal] text-ink ${focus}`}
                        >
                          <span className="text-[10.5px] font-semibold text-mut">{monthShort(m)}</span>
                          <span
                            className="box-border block h-[20px] w-[20px] rounded-pill border-2"
                            style={{
                              background: isB ? '#F5C64A' : isP ? '#A8D5D2' : '#FFFDF6',
                              borderColor: isB ? '#191510' : isP ? '#2F5D2A' : '#E8DFC9',
                            }}
                          />
                          <span
                            className="min-h-[12px] whitespace-nowrap text-[10px] leading-[1.2]"
                            style={{ fontWeight: isB || isP ? 700 : 500, color: isB || isP ? '#191510' : '#8A8272' }}
                          >
                            {lab ? t(`rhythm.cell.${lab}`) : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="mt-[14px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                  <div className="flex flex-col gap-[8px]">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={pause}
                      onClick={() => setPause(!pause)}
                      className={`flex cursor-pointer items-center gap-[11px] rounded-cta border border-line bg-sf px-[14px] py-[12px] text-left leading-[normal] text-ink ${focus}`}
                    >
                      <Box on={pause} />
                      <span className="text-[13.5px] font-semibold">{t('rhythm.pause')}</span>
                    </button>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={voFirst}
                      onClick={() => setVoFirst(!voFirst)}
                      className={`flex cursor-pointer items-center gap-[11px] rounded-cta border border-line bg-sf px-[14px] py-[12px] text-left leading-[normal] text-ink ${focus}`}
                    >
                      <Box on={voFirst} />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold">{t('rhythm.voFirst', { days: voOnDays })}</span>
                        <span className="mt-[1px] block text-[11.5px] text-mut">{t('rhythm.voFirstNote')}</span>
                      </span>
                    </button>
                  </div>
                  <div className="rounded-cta bg-sbg px-[16px] py-[14px]">
                    <div className="text-[11px] uppercase tracking-[.11em] text-mut">{t('rhythm.each')}</div>
                    <div className="mt-[9px] flex flex-col gap-[6px]">
                      {(
                        [
                          ['vo', voFirst ? t('rhythm.leadDays', { days: voOnDays }) : t('rhythm.lead0')],
                          [
                            'dl',
                            (model.wheel?.leaderLead ?? 1) > 0
                              ? t('rhythm.leadDays', { days: model.wheel?.leaderLead ?? 1 })
                              : t('rhythm.lead0'),
                          ],
                          ['all', t('rhythm.at9')],
                          ['result', t('rhythm.day7', { day: 7 })],
                        ] as const
                      ).map(([who, when]) => (
                        <div key={who} className="flex justify-between gap-[10px] text-[12.5px]">
                          <span>{t(`rhythm.who.${who}`)}</span>
                          <strong className="whitespace-nowrap">{when}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {step === 7 ? (
              <>
                {model.send.measured ? (
                  <Lead>{t('send.measured')}</Lead>
                ) : (
                  <>
                    <Lead>{t('send.lead')}</Lead>
                    <div className="mt-[16px] flex flex-wrap gap-[7px]">
                      {model.send.days.map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={day === d}
                          onClick={() => setDay(d)}
                          className={`cursor-pointer rounded-pill border px-[15px] py-[9px] text-[13px] leading-[normal] text-ink ${focus}`}
                          style={chip(day === d)}
                        >
                          {dayLabel(d)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-[18px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                  <div className="rounded-opt border border-line bg-sf px-[18px] py-[16px]">
                    <div className="text-[11px] uppercase tracking-[.11em] text-mut">{t('send.how')}</div>
                    <div className="mt-[10px] flex flex-col gap-[8px]">
                      {(
                        [
                          [t('send.t1k', { days: voFirst ? voOnDays : 0 }), t('send.t1v')],
                          [t('send.t2k'), t('send.t2v', { count: model.people, sms: String(model.send.sms) })],
                          [t('send.t3k', { day: 4 }), t('send.t3v')],
                          [t('send.t4k', { day: 7 }), t('send.t4v')],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k} className="flex gap-[12px] text-[13px] leading-[1.45]">
                          <span className="w-[86px] flex-none font-bold">{k}</span>
                          <span className="[text-wrap:pretty]">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-opt bg-ink px-[18px] py-[16px] text-bg">
                    <div className="text-[11px] uppercase tracking-[.11em] opacity-65">{t('send.survey')}</div>
                    <div className="mt-[8px] text-[15px] font-bold">
                      {t('send.q', { questions: model.questions, areas: model.factorKeys.length })}
                    </div>
                    <div className="mt-[4px] text-[13px] opacity-80">
                      {t('send.meta', { minutes, count: model.people, groups: model.groups.length })}
                    </div>
                    <div className="mt-[12px] text-[12.5px] leading-[1.5] opacity-80 [text-wrap:pretty]">
                      {t(`rhythm.summary.${cadence}`, { month: monthLong(base) })}
                      {pause ? t('rhythm.summaryPause') : ''}. {t('send.cadence')}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {step === 8 ? (
              <>
                <div className="mt-[16px] flex items-center gap-[14px] rounded-opt bg-mint px-[18px] py-[16px] text-greendeep">
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-pill bg-greendeep text-[17px] font-bold text-mint">
                    ✓
                  </span>
                  <span className="text-[14px] leading-[1.5] [text-wrap:pretty]">{t('done.note')}</span>
                </div>
                <div className="mt-[16px] flex max-w-[600px] flex-col gap-[7px]">
                  {(
                    [
                      ['org', t('done.orgV', { name: model.org.name, count: emp })],
                      ['people', t('done.peopleV', { count: model.people })],
                      ['groups', t('done.groupsV', { count: model.groups.length, n: model.threshold })],
                      ['vo', voName ? (tvName ? t('done.voTv', { vo: voName, tv: tvName }) : voName) : t('done.voNone')],
                      [
                        'measure',
                        t('done.measureV', {
                          mode: t(`law.${model.lawMode ? 'on' : 'off'}.label`),
                          areas: model.factorKeys.length,
                        }),
                      ],
                      [
                        'rhythm',
                        model.wheel
                          ? t(`done.rhythmV.${model.wheel.cadence}`, { month: monthLong(model.wheel.baselineMonth) })
                          : '—',
                      ],
                      [
                        'first',
                        model.send.planned
                          ? t('done.firstV', { date: plannedLabel(model.send.planned, model.timezone) })
                          : model.send.measured
                            ? t('done.firstMeasured')
                            : t('done.firstNone'),
                      ],
                    ] as const
                  ).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex gap-[14px] rounded-btn border border-line bg-sf px-[14px] py-[11px] text-[13.5px]"
                    >
                      <span className="w-[130px] flex-none text-mut">{t(`done.${k}`)}</span>
                      <span className="font-semibold [text-wrap:pretty]">{v}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {problem ? (
              <div role="alert" className="mt-[14px] max-w-[560px] text-[12.5px] leading-[1.5] text-danger">
                {problem}
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-0 mt-[20px] flex items-center justify-between gap-[12px] border-t border-line bg-bg px-[32px] pb-[24px] pt-[18px] max-sm:px-[18px]">
            {step === 0 ? (
              <button
                type="button"
                onClick={skip}
                className={`h-[40px] cursor-pointer rounded-ctl border border-line bg-transparent px-[14px] text-[13px] font-semibold leading-[normal] text-mut ${focus}`}
              >
                {t('skip')}
              </button>
            ) : (
              <button
                type="button"
                onClick={later}
                className={`hidden cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold leading-[normal] text-mut max-sm:inline ${focus}`}
              >
                {t('later')}
              </button>
            )}
            <span className="ml-auto flex gap-[8px]">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => void go(step - 1)}
                  disabled={busy}
                  className={`h-[40px] cursor-pointer rounded-ctl border border-line bg-transparent px-[16px] text-[13.5px] font-semibold leading-[normal] text-ink ${focus}`}
                >
                  {t('back')}
                </button>
              ) : null}
              {step === LAST ? (
                <button
                  type="button"
                  onClick={finish}
                  disabled={busy}
                  className={`h-[40px] cursor-pointer rounded-ctl border border-ink bg-ac px-[20px] text-[14px] font-bold leading-[normal] text-ink ${focus}`}
                >
                  {t('finish')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void next()}
                  disabled={busy}
                  aria-busy={busy}
                  className={`h-[40px] cursor-pointer rounded-ctl border border-ink bg-ac px-[20px] text-[14px] font-bold leading-[normal] text-ink ${focus}`}
                >
                  {nextLabel}
                </button>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
