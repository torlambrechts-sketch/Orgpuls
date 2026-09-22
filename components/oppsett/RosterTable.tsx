'use client'

import { useState, useTransition } from 'react'
import { setEmployeeDutyRole, setEmployeeGroup } from '@/app/(app)/oppsett/actions'
import type { DutyRole, RosterPerson } from '@/lib/settings/read'

/**
 * A person with their two select labels already worded. A function cannot cross the
 * server/client boundary, and an aria-label that names the person is the difference
 * between "Gruppe" announced thirty-four times and thirty-four distinct controls.
 */
export interface RosterRow extends RosterPerson {
  groupLabel: string
  roleLabel: string
}
import type { Group } from '@/lib/org/read'

/**
 * Registeret. Bundle lines 2225-2243.
 *
 * Two selects per row, both of which write on change. The design draws them as bare
 * `<select>` elements with no save button, and that is the right control: a select is the
 * only one of these that already announces its own options to a screen reader and already
 * works from the keyboard without anything added.
 *
 * **The Rolle column is a duty, not a grant.** Setting somebody to "Verneombud" records the
 * position the act names — it is what makes § 6-2's record on a round point at a person,
 * and what the Selskap tab's duties card reads. It gives them no access: nothing in any
 * policy consults `duty_role`, and access is `app.memberships.role`, which is granted
 * somewhere else entirely. The note under the table says so, because a column labelled
 * "Rolle" in a settings screen will otherwise be read as one.
 */
export function RosterTable({
  roster,
  groups,
  canWrite,
  dutyRoles,
  labels,
}: {
  roster: RosterRow[]
  groups: Group[]
  canWrite: boolean
  dutyRoles: DutyRole[]
  labels: {
    name: string
    email: string
    group: string
    role: string
    status: string
    noGroup: string
    noEmail: string
    employee: string
    active: string
    inactive: string
    duty: Record<string, string>
    denied: string
  }
}) {
  const [problem, setProblem] = useState(false)
  const [, startTransition] = useTransition()

  const write = (fn: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      const result = await fn()
      setProblem(!result.ok)
    })

  const COLS =
    '[grid-template-columns:minmax(0,1.2fr)_minmax(0,1.6fr)_130px_140px_110px]'

  return (
    <>
      <div className="mt-[16px] overflow-x-auto">
        <div className="min-w-[640px] overflow-hidden rounded-tile border border-line">
          <div
            className={`grid gap-[12px] bg-bg px-[16px] py-[10px] text-[10.5px] uppercase tracking-[0.08em] text-mut ${COLS}`}
          >
            <span>{labels.name}</span>
            <span>{labels.email}</span>
            <span>{labels.group}</span>
            <span>{labels.role}</span>
            <span>{labels.status}</span>
          </div>

          {roster.map((p) => (
            <div
              key={p.id}
              className={`grid items-center gap-[12px] border-t border-line px-[16px] py-[9px] text-[13px] ${COLS}`}
            >
              <span className="font-semibold">{p.name}</span>
              <span className="overflow-hidden text-ellipsis text-mut">
                {p.email ?? labels.noEmail}
              </span>

              <select
                value={p.groupId ?? ''}
                disabled={!canWrite}
                aria-label={p.groupLabel}
                onChange={(e) => {
                  const data = new FormData()
                  data.set('id', p.id)
                  data.set('groupId', e.target.value)
                  write(() => setEmployeeGroup(data))
                }}
                className="box-border h-[32px] w-full rounded-focus border bg-bg px-[8px] text-[12.5px] text-ink"
                // an ungrouped person is a defect the design marks on the control itself
                style={{ borderColor: p.groupId ? '#E8DFC9' : '#D4633A' }}
              >
                <option value="">{labels.noGroup}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>

              <select
                value={p.dutyRole ?? ''}
                disabled={!canWrite}
                aria-label={p.roleLabel}
                onChange={(e) => {
                  const data = new FormData()
                  data.set('id', p.id)
                  data.set('dutyRole', e.target.value)
                  write(() => setEmployeeDutyRole(data))
                }}
                className="box-border h-[32px] w-full rounded-focus border border-line bg-bg px-[8px] text-[12.5px] text-ink"
              >
                <option value="">{labels.employee}</option>
                {dutyRoles.map((r) => (
                  <option key={r} value={r}>
                    {labels.duty[r]}
                  </option>
                ))}
              </select>

              <span className="text-[12px] text-mut">
                {p.active ? labels.active : labels.inactive}
              </span>
            </div>
          ))}
        </div>
      </div>

      {problem ? (
        <p className="mt-[11px] text-[12.5px] leading-[1.5] text-danger">{labels.denied}</p>
      ) : null}
    </>
  )
}
