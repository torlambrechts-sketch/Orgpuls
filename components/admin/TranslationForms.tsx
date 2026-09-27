'use client'

import { startTransition, useActionState, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { translationsApproveLanguage, translationsImport, type AdminResult, type ImportResult } from '@/lib/admin/actions'
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
  labels,
}: {
  locale: string
  labels: {
    file: string
    origin: string
    origins: Record<string, string>
    check: string
    apply: string
    checking: string
    summary: string
    written: string
    nothing: string
    codes: Record<string, string>
    problems: Problems
    problemsHead: string
  }
}) {
  const [state, action, pending] = useActionState<ImportResult | null, FormData>(translationsImport, null)
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
      <div className="grid gap-[10px] [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:minmax(0,1fr)_minmax(0,14rem)]">
        <label className="block">
          <span className={label}>{labels.file}</span>
          <input
            type="file"
            name="file"
            accept=".json,.xlf,.xliff,application/json,application/xliff+xml"
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
              ? fill(labels.written, { new: state.written.new, changed: state.written.changed, same: state.written.same, refused: state.written.refused.length })
              : state.rows
                ? fill(labels.summary, { format: state.format.toUpperCase(), rows: state.rows, unchanged: state.unchanged, untranslated: state.untranslated })
                : labels.nothing}
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
