'use client'

import { useState, useTransition } from 'react'
import { addLocation, removeLocation } from '@/app/(app)/oppsett/actions'
import type { Location } from '@/lib/settings/read'

/** A location with its headcount already worded — see the note on `LocationRow`. */
export interface LocationRow extends Location {
  headcountLabel: string
}

/**
 * Lokasjoner. Bundle lines 2010-2033.
 *
 * `headcountLabel` arrives already worded rather than as a count with a formatter, because
 * a function cannot cross the server/client boundary — and because the plural rule for
 * "ansatt/ansatte" belongs with the other message lookups on the server side.
 *
 * A location is a place. Its headcount is a number the organisation states about a site,
 * derived from nobody's row, and nothing joins a response to it — which is why a site of
 * three is not a group of three that k would have to protect.
 *
 * The design's remove button is an "×" with no confirmation, and this keeps it that way:
 * the design specifies no dialog anywhere in the product, and inventing one here would be
 * inventing a pattern (D-22's reasoning).
 */
export function LocationForm({
  locations,
  canWrite,
  summary,
  summaryTone,
  labels,
}: {
  locations: LocationRow[]
  canWrite: boolean
  summary: string
  summaryTone: string
  labels: {
    remove: string
    name: string
    namePlaceholder: string
    address: string
    addressPlaceholder: string
    add: string
    problems: Record<string, string>
  }
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const remove = (id: string) =>
    startTransition(async () => {
      const data = new FormData()
      data.set('id', id)
      const result = await removeLocation(data)
      setProblem(result.ok ? null : result.problem)
    })

  return (
    <>
      <div className="mt-[16px] flex flex-col gap-[9px]">
        {locations.map((l) => (
          <div
            key={l.id}
            className="grid items-center gap-[14px] rounded-tile border border-line bg-bg px-[16px] py-[13px] [grid-template-columns:minmax(0,1fr)_minmax(0,1.4fr)_110px_40px]"
          >
            <span className="text-[14px] font-semibold">{l.name}</span>
            <span className="text-[12.5px] text-mut [text-wrap:pretty]">{l.address ?? ''}</span>
            <span className="text-[12.5px] text-mut">{l.headcountLabel}</span>
            <button
              type="button"
              onClick={() => remove(l.id)}
              disabled={!canWrite || pending}
              aria-label={`${labels.remove} ${l.name}`}
              className="h-[30px] w-[30px] cursor-pointer rounded-focus border border-line bg-transparent p-0 text-[14px] leading-none text-mut"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div
        className="mt-[11px] max-w-[600px] text-[12.5px] leading-[1.5] [text-wrap:pretty]"
        style={{ color: problem ? '#A33A16' : summaryTone }}
      >
        {problem ? (labels.problems[problem] ?? labels.problems.denied) : summary}
      </div>

      <form
        action={(data) =>
          startTransition(async () => {
            const result = await addLocation(data)
            setProblem(result.ok ? null : result.problem)
          })
        }
        className="mt-[16px] grid items-end gap-[10px] border-t border-line pt-[16px] [grid-template-columns:minmax(150px,1fr)_minmax(190px,1.4fr)_120px]"
      >
        <label className="block">
          <span className="mb-[5px] block text-[11.5px] text-mut">{labels.name}</span>
          <input
            name="name"
            required
            maxLength={80}
            disabled={!canWrite}
            placeholder={labels.namePlaceholder}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-[5px] block text-[11.5px] text-mut">{labels.address}</span>
          <input
            name="address"
            maxLength={160}
            disabled={!canWrite}
            placeholder={labels.addressPlaceholder}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!canWrite || pending}
          className="inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-ink bg-ac text-[13.5px] font-bold text-ink"
        >
          {labels.add}
        </button>
      </form>
    </>
  )
}
