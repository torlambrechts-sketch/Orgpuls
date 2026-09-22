'use client'

import { useState, useTransition } from 'react'
import { fetchRegistry } from '@/app/(app)/oppsett/actions'

/**
 * "Hent fra Brønnøysund". Bundle lines 1995-2003.
 *
 * The button performs a real lookup against Enhetsregisteret and stores what comes back.
 * It is a submit rather than an onClick because it is a form that writes, and because a
 * form still works while the transition is pending and while JavaScript is loading.
 *
 * Four distinct outcomes get four distinct sentences. "Fant ikke virksomheten" and
 * "Registeret svarte ikke" are different problems with different next steps, and a single
 * "noe gikk galt" would leave a leader retyping a number that was correct.
 */
export function RegistryForm({
  orgNumber,
  canWrite,
  fetched,
  note,
  labels,
}: {
  orgNumber: string
  canWrite: boolean
  fetched: boolean
  note: string
  labels: {
    field: string
    placeholder: string
    fetch: string
    refetch: string
    busy: string
    problems: Record<string, string>
  }
}) {
  const [value, setValue] = useState(orgNumber)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(data) =>
        startTransition(async () => {
          const result = await fetchRegistry(data)
          setProblem(result.ok ? null : result.problem)
        })
      }
    >
      <div className="mt-[16px] flex flex-wrap items-end gap-[9px]">
        <label className="min-w-[190px] flex-1">
          <span className="mb-[5px] block text-[11.5px] text-mut">{labels.field}</span>
          <input
            name="orgNumber"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canWrite}
            inputMode="numeric"
            placeholder={labels.placeholder}
            className="box-border h-[42px] w-full rounded-btn border border-line bg-bg px-[14px] font-mono text-[14px] text-ink outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!canWrite || pending}
          className="inline-flex h-[42px] flex-none cursor-pointer items-center justify-center whitespace-nowrap rounded-btn border border-ink bg-ac px-[18px] text-[13.5px] font-bold text-ink"
        >
          {pending ? labels.busy : fetched ? labels.refetch : labels.fetch}
        </button>
      </div>

      <div
        className="mt-[9px] max-w-[600px] text-[12.5px] leading-[1.5] [text-wrap:pretty]"
        style={{ color: problem ? '#A33A16' : '#5F5849' }}
      >
        {problem ? (labels.problems[problem] ?? labels.problems.denied) : note}
      </div>
    </form>
  )
}
