'use client'

import { useActionState, useState } from 'react'
import { runAuthCheck } from '@/lib/admin/deliverabilityActions'
import type { AdminResult } from '@/lib/admin/actions'
import { Modal } from './Modal'

/**
 * The controls of phase G4's two views (D-185): a magnet's «Open», which shows what the registry
 * holds about it and changes nothing, and Deliverability's «Run authentication check».
 */

/** The design's modal sections (`modal.sections`): a small-caps heading over a line, on the canvas colour */
function Section({ h, t }: { h: string; t: string }) {
  return (
    <div className="rounded-cta border border-line bg-bg px-[14px] py-[12px]">
      <div className="mb-[4px] text-[11px] uppercase tracking-[0.09em] text-mut">{h}</div>
      <div className="text-[13px] leading-[1.55] [text-wrap:pretty]">{t}</div>
    </div>
  )
}

/**
 * A magnet's «Open»: the design's modal with its sections — what it does, how it is gated, and
 * where it stands. The design's «Open editor» is left out: no tool has an editor (D-185).
 */
export function MagnetOpen({
  label,
  title,
  sub,
  sections,
  closeLabel,
}: {
  label: string
  title: string
  sub: string
  sections: { h: string; t: string }[]
  closeLabel: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label} · ${title}`}
        className="cursor-pointer rounded-bar border border-line bg-transparent px-[10px] py-[6px] font-[inherit] text-[12px] font-semibold leading-[normal] text-ink hover:bg-ink/5"
      >
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} sub={sub} closeLabel={closeLabel}>
        <div className="mt-[22px] flex flex-col gap-[10px] leading-[1.5]">
          {sections.map((s) => (
            <Section key={s.h} h={s.h} t={s.t} />
          ))}
        </div>
        <div className="mt-[24px] flex justify-end gap-[10px]">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded-ctl border-0 bg-ink px-[18px] py-[10px] font-[inherit] text-[13.5px] font-bold leading-[normal] text-sf"
          >
            {closeLabel}
          </button>
        </div>
      </Modal>
    </>
  )
}

/**
 * «Run authentication check»: the design's outlined button with the ink hairline. It looks both
 * streams' domains up in public DNS and records what came back; the page then shows it. A refusal
 * (another run within the minute, a role outside growth) is said under the button.
 */
export function RunAuthCheck({ label, busyLabel, problems }: { label: string; busyLabel: string; problems: Record<string, string> }) {
  const [state, action, busy] = useActionState<AdminResult | null, FormData>(runAuthCheck, null)
  return (
    <form action={action} className="flex flex-col items-end gap-[4px]">
      <button
        type="submit"
        disabled={busy}
        className="cursor-pointer whitespace-nowrap rounded-ctl border border-ink bg-transparent px-[15px] py-[9px] font-[inherit] text-[12.5px] font-semibold leading-[normal] text-ink hover:bg-ink/5 disabled:cursor-default disabled:opacity-60"
      >
        {busy ? busyLabel : label}
      </button>
      {state && !state.ok ? (
        <span role="alert" className="text-[11.5px] font-semibold text-caution">
          {problems[state.problem] ?? problems.failed}
        </span>
      ) : null}
    </form>
  )
}
