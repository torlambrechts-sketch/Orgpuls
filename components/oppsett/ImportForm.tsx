'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { addEmployee, importEmployees } from '@/app/(app)/oppsett/actions'
import { normalizePhone } from '@/supabase/functions/_shared/sms'
import type { Group } from '@/lib/org/read'

/**
 * Where the people come from. Bundle lines 2112-2205.
 *
 * The preview is parsed here and the import is parsed again on the server, by the same
 * rules. That is not duplication for its own sake: the preview exists so a leader can see
 * what they are about to write, and the server's parse is the one that decides what is
 * written. Only one of them runs somewhere a person can edit it.
 *
 * A row with no group imports without one. The design says as much — those people land in
 * "Uten gruppe" and the register counts them — and refusing a whole paste over one short
 * line is how a leader gives up and types thirty-four names by hand.
 */

interface Labels {
  sourceManual: string
  sourceManualNote: string
  sourceCsv: string
  sourceCsvNote: string
  pasteHead: string
  pasteLead: string
  pastePlaceholder: string
  colName: string
  colEmail: string
  colGroup: string
  colLeader: string
  colMobile: string
  allGood: string
  reset: string
  addHead: string
  name: string
  namePlaceholder: string
  email: string
  emailPlaceholder: string
  group: string
  noGroup: string
  add: string
  emailNote: string
  phone: string
  phonePlaceholder: string
  problems: Record<string, string>
}

/** The same split the server uses: tab, semicolon or comma, whichever the sheet produced. */
const CELLS = /[\t;,]/

export function ImportForm({
  canWrite,
  groups,
  labels,
}: {
  canWrite: boolean
  groups: Group[]
  labels: Labels
}) {
  /**
   * Three strings here depend on a number that only exists in the browser — how many rows
   * the person has pasted so far. They cannot be resolved on the server like the rest, and
   * a formatter function cannot be passed across the boundary, so this one component reads
   * the catalogue directly. Everything that does not change as you type still arrives as a
   * resolved string, which is why `labels` is still a bag.
   */
  const t = useTranslations('oppsett.ansatte')

  const [source, setSource] = useState<'csv' | 'manual'>('csv')
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<{ written: number; updated: number; skipped: number } | null>(null)
  const [pending, startTransition] = useTransition()

  const rows = useMemo(() => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const parsed = lines.map((l) => l.split(CELLS).map((c) => c.trim()))
    const head = parsed[0]
    return head && /^(navn|name)$/i.test(head[0] ?? '') ? parsed.slice(1) : parsed
  }, [text])

  const badEmail = rows.filter((r) => (r[1] ?? '') !== '' && !(r[1] ?? '').includes('@')).length
  const noGroup = rows.filter((r) => (r[2] ?? '') === '').length
  // column E: a number that cannot be used is imported without it, and said so here first
  const badPhone = rows.filter((r) => (r[4] ?? '') !== '' && !normalizePhone(r[4])).length

  return (
    <>
      <div className="mt-[13px] grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        {(
          [
            ['manual', labels.sourceManual, labels.sourceManualNote],
            ['csv', labels.sourceCsv, labels.sourceCsvNote],
          ] as const
        ).map(([key, label, note]) => (
          <label
            key={key}
            className={`flex items-start gap-[11px] rounded-tile border px-[15px] py-[14px] text-left ${
              canWrite ? 'cursor-pointer' : 'cursor-not-allowed'
            } ${source === key ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
          >
            <input
              type="radio"
              name="source"
              value={key}
              checked={source === key}
              onChange={() => setSource(key)}
              className="peer absolute h-px w-px overflow-hidden opacity-0"
            />
            <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
              <span
                className="block h-[8px] w-[8px] rounded-pill"
                style={{ background: source === key ? '#191510' : 'transparent' }}
              />
            </span>
            <span className="min-w-0">
              <span className={`block text-[14px] ${source === key ? 'font-bold' : 'font-medium'}`}>
                {label}
              </span>
              <span className="mt-[3px] block text-[12px] leading-[1.45] text-mut [text-wrap:pretty]">
                {note}
              </span>
            </span>
          </label>
        ))}
      </div>

      {source === 'csv' ? (
        <div className="mt-[20px] border-t border-line pt-[18px]">
          <div className="text-[14.5px] font-semibold">{labels.pasteHead}</div>
          <div className="mt-[4px] max-w-[620px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
            {labels.pasteLead}
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setDone(null)
              setProblem(null)
            }}
            disabled={!canWrite}
            placeholder={labels.pastePlaceholder}
            className="mt-[12px] min-h-[110px] w-full resize-y rounded-cta border border-line bg-bg px-[15px] py-[13px] font-mono text-[13px] leading-[1.6] text-ink outline-none"
          />

          <div className="mt-[12px] flex flex-wrap gap-[7px]">
            {[labels.colName, labels.colEmail, labels.colGroup, labels.colLeader, labels.colMobile].map(
              (label, i) => (
                <span
                  key={label}
                  className="flex items-baseline gap-[7px] rounded-pill border border-line bg-bg px-[12px] py-[6px]"
                >
                  <span className="text-[12.5px] font-bold">{label}</span>
                  <span className="text-[11.5px] text-mut">
                    {t('column', { letter: 'ABCDE'.charAt(i) })}
                  </span>
                </span>
              ),
            )}
          </div>

          {rows.length > 0 ? (
            <>
              <div className="mt-[16px] overflow-hidden rounded-tile border border-line">
                <div className="flex flex-wrap items-center justify-between gap-[12px] border-b border-line bg-bg px-[15px] py-[11px]">
                  <span className="text-[12.5px] font-bold">
                    {t('rowsRead', { count: rows.length })}
                  </span>
                  <span
                    className="text-[12.5px] font-semibold"
                    style={{ color: badEmail || noGroup || badPhone ? '#A33A16' : '#2F5D2A' }}
                  >
                    {badEmail || noGroup || badPhone
                      ? [
                          badEmail ? `${badEmail} ${labels.colEmail.toLocaleLowerCase('no')}` : '',
                          noGroup ? `${noGroup} ${labels.noGroup.toLocaleLowerCase('no')}` : '',
                          badPhone ? `${badPhone} ${labels.colMobile.toLocaleLowerCase('no')}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : labels.allGood}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-5 gap-[12px] px-[15px] py-[9px] text-[10.5px] uppercase tracking-[0.08em] text-mut">
                      <span>{labels.colName}</span>
                      <span>{labels.colEmail}</span>
                      <span>{labels.colGroup}</span>
                      <span>{labels.colLeader}</span>
                      <span>{labels.colMobile}</span>
                    </div>
                    {rows.slice(0, 4).map((r, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-5 gap-[12px] border-t border-line px-[15px] py-[10px] text-[13px]"
                      >
                        <span className="font-semibold">{r[0] || '—'}</span>
                        <span
                          style={{
                            color:
                              (r[1] ?? '') !== '' && !(r[1] ?? '').includes('@')
                                ? '#A33A16'
                                : '#191510',
                          }}
                        >
                          {r[1] || '—'}
                        </span>
                        <span>{r[2] || '—'}</span>
                        <span className="text-mut">{r[3] || '—'}</span>
                        <span style={{ color: (r[4] ?? '') !== '' && !normalizePhone(r[4]) ? '#A33A16' : '#191510' }}>
                          {r[4] || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-[13px] flex flex-wrap gap-[9px]">
                <button
                  type="button"
                  disabled={!canWrite || pending}
                  onClick={() =>
                    startTransition(async () => {
                      const data = new FormData()
                      data.set('rows', text)
                      const result = await importEmployees(data)
                      if (result.ok) {
                        setText('')
                        setProblem(null)
                        setDone({ written: result.written, updated: result.updated, skipped: result.skipped })
                      } else {
                        setProblem(result.problem)
                      }
                    })
                  }
                  className="inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-btn border border-ink bg-ac px-[18px] text-[13.5px] font-bold text-ink"
                >
                  {t('importLabel', { count: rows.length })}
                </button>
                <button
                  type="button"
                  onClick={() => setText('')}
                  className="inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-btn border border-line bg-transparent px-[16px] text-[13.5px] font-semibold text-mut"
                >
                  {labels.reset}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <form
          action={(data) =>
            startTransition(async () => {
              const result = await addEmployee(data)
              setProblem(result.ok ? null : result.problem)
              setDone(result.ok ? { written: 1, updated: 0, skipped: 0 } : null)
            })
          }
          className="mt-[20px] border-t border-line pt-[18px]"
        >
          <div className="text-[14.5px] font-semibold">{labels.addHead}</div>
          <div className="mt-[12px] grid items-end gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))_130px]">
            <label className="block">
              <span className="mb-[5px] block text-[11.5px] text-mut">{labels.name}</span>
              <input
                name="name"
                required
                maxLength={120}
                disabled={!canWrite}
                placeholder={labels.namePlaceholder}
                className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-[5px] block text-[11.5px] text-mut">{labels.email}</span>
              <input
                name="email"
                type="email"
                disabled={!canWrite}
                placeholder={labels.emailPlaceholder}
                className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-[5px] block text-[11.5px] text-mut">{labels.phone}</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={40}
                disabled={!canWrite}
                placeholder={labels.phonePlaceholder}
                className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-[5px] block text-[11.5px] text-mut">{labels.group}</span>
              <select
                name="groupId"
                disabled={!canWrite}
                className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[11px] text-[13.5px] text-ink"
              >
                <option value="">{labels.noGroup}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={!canWrite || pending}
              className="inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-ink bg-ac text-[13.5px] font-bold text-ink"
            >
              {labels.add}
            </button>
          </div>
          <div className="mt-[11px] max-w-[620px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
            {labels.emailNote}
          </div>
        </form>
      )}

      {problem ? (
        <p className="mt-[11px] text-[12.5px] leading-[1.5] text-danger">
          {labels.problems[problem] ?? labels.problems.denied}
        </p>
      ) : done ? (
        <p className="mt-[11px] text-[12.5px] leading-[1.5] text-link">
          {t('imported', { count: done.written })}
          {done.updated ? ` ${t('phonesAdded', { count: done.updated })}` : ''}
        </p>
      ) : null}
    </>
  )
}
