'use client'

import { startTransition, useActionState, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { messageEdit, messagesApprove, messagesImport, messagesSheetImport, setAutoApprove, translationsApproveLanguage, translationsImport, type AdminResult, type ImportResult } from '@/lib/admin/actions'
import { Outcome } from './ActionForms'

type Problems = Record<string, string>
const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const label = 'mb-[5px] block text-[12px] font-semibold'

/**
 * Import a survey language's translation file (D-133): «Check file» shows what would be written and
 * what is kept out; «Import» writes exactly that. Nothing imported is approved.
 */
export function TranslationImportForm({
  locale,
  scope,
  platform = false,
  sheet = false,
  labels,
}: {
  locale: string
  /** the tab the file is imported into: entries of the other tab are counted and left out (0101) */
  scope: 'questionnaire' | 'pages'
  /** bokmål or English pages: overrides of messages/ (0101), not the registry */
  platform?: boolean
  /** a page's bilingual spreadsheet, bokmål and English at once (X-090) */
  sheet?: boolean
  labels: {
    file: string
    origin: string
    origins: Record<string, string>
    check: string
    apply: string
    checking: string
    summary: string
    outside: string
    written: string
    removed: string
    nothing: string
    codes: Record<string, string>
    problems: Problems
    problemsHead: string
  }
}) {
  const [state, action, pending] = useActionState<ImportResult | null, FormData>(sheet ? messagesSheetImport : platform ? messagesImport : translationsImport, null)
  const form = useRef<HTMLFormElement>(null)
  // a new file or source needs checking again before it can be imported
  const [dirty, setDirty] = useState(true)
  const submit = (intent: 'check' | 'apply') => {
    if (!form.current) return
    const fd = new FormData(form.current)
    fd.set('intent', intent)
    if (intent === 'apply' && state?.ok) fd.set('digest', state.digest)
    startTransition(() => action(fd))
    if (intent === 'check') setDirty(false)
  }
  const checked = state?.ok && !state.applied && !dirty ? state : null
  const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

  return (
    <form ref={form} onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-[10px]">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="scope" value={scope} />
      <div className="grid gap-[10px] [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:minmax(0,1fr)_minmax(0,14rem)]">
        <label className="block">
          <span className={label}>{labels.file}</span>
          <input
            type="file"
            name="file"
            accept={sheet ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : '.json,.xlf,.xliff,application/json,application/xliff+xml'}
            required
            onChange={() => setDirty(true)}
            className={`${field} py-[8px]`}
          />
        </label>
        <label className="block">
          <span className={label}>{labels.origin}</span>
          <select name="origin" defaultValue="professional" onChange={() => setDirty(true)} className={`${field} h-[40px]`}>
            {Object.entries(labels.origins).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="button" size="sm" tone="secondary" disabled={pending} onClick={() => submit('check')}>
          {pending ? labels.checking : labels.check}
        </Button>
        {checked && checked.rows > 0 ? (
          <Button type="button" size="sm" disabled={pending} onClick={() => submit('apply')}>
            {fill(labels.apply, { n: checked.rows })}
          </Button>
        ) : null}
        {state && !state.ok ? (
          <span role="alert" className="text-[12.5px] font-semibold text-danger">
            {(labels.problems[state.problem] ?? labels.problems.failed) + (state.detail ? ` (${state.detail})` : '')}
          </span>
        ) : null}
      </span>
      {state?.ok ? (
        <div role="status" className="rounded-ctl border border-line bg-bg px-[14px] py-[10px] text-[13px] leading-[1.6]">
          <p className="m-0">
            {state.applied && state.written
              ? fill(labels.written, { new: state.written.new, changed: state.written.changed, same: state.written.same, refused: state.written.refused.length }) +
                (state.written.removed ? ` ${fill(labels.removed, { n: state.written.removed })}` : '')
              : state.rows
                ? fill(labels.summary, { format: state.format.toUpperCase(), rows: state.rows, unchanged: state.unchanged, untranslated: state.untranslated })
                : labels.nothing}
            {state.outside ? ` ${fill(labels.outside, { n: state.outside })}` : ''}
          </p>
          {state.problems.length ? (
            <details className="mt-[6px]" open={state.problems.some((p) => p.level === 'error')}>
              <summary className="cursor-pointer text-[12.5px] font-semibold text-link">{fill(labels.problemsHead, { n: state.problems.length })}</summary>
              <ul className="m-0 mt-[6px] list-none p-0">
                {state.problems.map((p, i) => (
                  <li key={`${p.key}-${i}`} className="py-[2px] text-[12.5px]">
                    <span className={p.level === 'error' ? 'font-semibold text-dangerdeep' : 'font-semibold text-mut'}>{labels.codes[p.code] ?? p.code}</span>{' '}
                    <span className="break-all font-mono text-[11.5px]">{p.key}</span>
                    {p.detail ? <span className="text-mut"> — {p.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {state.applied && state.written?.refused.length ? (
            <ul className="m-0 mt-[6px] list-none p-0">
              {state.written.refused.map((r) => (
                <li key={r.key} className="text-[12.5px]">
                  <span className="break-all font-mono text-[11.5px]">{r.key}</span> <span className="text-mut">— {r.error}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

/** Approve what may be approved in a survey language (0086), exactly what the page showed */
export function TranslationApproveForm({
  locale,
  digest,
  labels,
}: {
  locale: string
  digest: string
  labels: { read: string; submit: string; saving: string; done: string; problems: Problems }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(translationsApproveLanguage, null)
  const [read, setRead] = useState(false)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(() => action(fd))
      }}
      className="flex flex-col gap-[10px]"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="digest" value={digest} />
      <label className="inline-flex items-start gap-[8px] text-[13px] leading-[1.5]">
        <input type="checkbox" name="read" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-[3px] h-[16px] w-[16px] accent-ink" />
        {labels.read}
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

/** Approve the waiting bokmål or English overrides the page listed, each by its text's hash (0101) */
export function MessagesApproveForm({
  locale,
  items,
  labels,
}: {
  locale: string
  items: { key: string; hash: string }[]
  labels: { read: string; submit: string; saving: string; done: string; problems: Problems }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(messagesApprove, null)
  const [read, setRead] = useState(false)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(() => action(fd))
      }}
      className="flex flex-col gap-[10px]"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <label className="inline-flex items-start gap-[8px] text-[13px] leading-[1.5]">
        <input type="checkbox" name="read" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-[3px] h-[16px] w-[16px] accent-ink" />
        {labels.read}
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

/**
 * The auto-approve switch (0101, D-152). Turning it on asks once: it approves everything waiting
 * and everything that arrives until it is turned off, marked as automatic.
 */
export function AutoApproveForm({
  on,
  labels,
}: {
  on: boolean
  labels: { turnOn: string; turnOff: string; confirm: string; saving: string; done: string; problems: Problems }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(setAutoApprove, null)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!on && !window.confirm(labels.confirm)) return
        const fd = new FormData(e.currentTarget)
        startTransition(() => action(fd))
      }}
      className="flex flex-wrap items-center gap-[10px]"
    >
      <input type="hidden" name="on" value={on ? 'off' : 'on'} />
      <Button type="submit" size="sm" tone={on ? 'secondary' : 'primary'} disabled={pending}>
        {pending ? labels.saving : on ? labels.turnOff : labels.turnOn}
      </Button>
      <Outcome state={state} problems={labels.problems} done={labels.done} />
    </form>
  )
}

/**
 * One text of the site, corrected in place on its page (X-090): bokmål and English together. What
 * is saved waits for approval like any override, or is approved at once while auto-approve is on.
 */
export function MessageEditForm({
  path,
  no,
  en,
  labels,
}: {
  path: string
  no: string
  en: string
  labels: { edit: string; bokmal: string; english: string; save: string; saving: string; done: string; problems: Problems }
}) {
  const [state, action, pending] = useActionState(messageEdit, null)
  const rows = (s: string) => Math.min(12, Math.max(2, Math.ceil(s.length / 70) + (s.match(/\n/g)?.length ?? 0)))
  return (
    <details className="mt-[6px]">
      <summary className="cursor-pointer text-[12.5px] font-semibold text-link">{labels.edit}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(() => action(fd))
        }}
        className="mt-[8px] flex flex-col gap-[8px]"
      >
        <input type="hidden" name="key" value={path} />
        <div className="grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
          <label className="block min-w-0">
            <span className={label}>{labels.bokmal}</span>
            <textarea name="no" lang="nb" defaultValue={no} rows={rows(no)} className={`${field} py-[8px] leading-[1.5]`} />
          </label>
          <label className="block min-w-0">
            <span className={label}>{labels.english}</span>
            <textarea name="en" lang="en" defaultValue={en} rows={rows(en)} className={`${field} py-[8px] leading-[1.5]`} />
          </label>
        </div>
        <span className="flex flex-wrap items-center gap-[10px]">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? labels.saving : labels.save}
          </Button>
          {state ? (
            state.ok ? (
              <span role="status" className="text-[12.5px] font-semibold text-link">
                {labels.done}
              </span>
            ) : (
              <span role="alert" className="text-[12.5px] font-semibold text-danger">
                {(labels.problems[state.problem] ?? labels.problems.failed) + (state.detail ? ` (${state.detail})` : '')}
              </span>
            )
          ) : null}
        </span>
      </form>
    </details>
  )
}
