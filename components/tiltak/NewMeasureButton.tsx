'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { createMeasure } from '@/app/(app)/tiltak/actions'

/**
 * "＋ Nytt tiltak" (bundle line 1726).
 *
 * The design creates a measure and lets the person fill it in, rather than asking for a
 * title in a dialog first — so this posts two values and nothing else: the factor the
 * new measure hangs on, and the round that raised it. Both are resolved on the server;
 * the button carries them rather than deciding them, because "which factor" and "which
 * measurement" are facts about the instrument and the schedule, not about a click.
 *
 * It is a real button rather than a link: creating a row is not a navigation, and a
 * GET that writes is a GET a crawler can make.
 */
export function NewMeasureButton({
  label,
  factorKey,
  roundId,
  problems,
}: {
  label: string
  factorKey: string
  roundId: string | null
  problems: Record<string, string>
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <span className="flex flex-none flex-col items-end">
      <Button
        size="tiny"
        tone="primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const data = new FormData()
            data.set('factorKey', factorKey)
            if (roundId) data.set('roundId', roundId)
            const result = await createMeasure(data)
            setProblem(result.ok ? null : result.problem)
          })
        }
      >
        {label}
      </Button>
      {problem ? (
        <span className="mt-[6px] text-right text-[11.5px] leading-[1.4] text-danger">
          {problems[problem] ?? problems.denied}
        </span>
      ) : null}
    </span>
  )
}
