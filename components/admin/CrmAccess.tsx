'use client'

import { useState } from 'react'
import type en from '@/messages/en.json'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import { Button } from '@/components/ui/Button'
import type { CrmAccess, CrmArea } from '@/lib/admin/crm'
import { deleteCrmGroup, deleteCrmSet, deleteCrmTeam, saveCrmGroup, saveCrmSet, saveCrmTeam, setCrmStaffAccess } from '@/lib/admin/crmAccessActions'

/**
 * Admin › Users & roles › CRM access (0196, D-221): who works under which permission set and in which
 * visibility group, the sets themselves, the groups and the teams. The database decides; these forms ask.
 */
export type AccessMessages = (typeof en)['admin']['crmAccess']
type Common = { reason: string; reasonHint: string; saving: string; done: string }

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none h-[38px]'
const label = 'mb-[5px] block text-[12px] font-semibold'
const fill = (s: string, v: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

function Reason({ common, required }: { common: Common; required: boolean }) {
  const [value, setValue] = useState('')
  return (
    <label className="block">
      <span className={label}>{common.reason}</span>
      <input name="reason" value={value} onChange={(e) => setValue(e.target.value)} required={required} minLength={required ? 5 : undefined} maxLength={500} className={field} />
      {required ? <span className="mt-[4px] block text-[12px] text-mut">{common.reasonHint}</span> : null}
    </label>
  )
}

/** One staff member: their own set (or their role's) and their visibility group */
export function StaffAccessForm({
  person,
  sets,
  groups,
  m,
  common,
  reasonRequired,
}: {
  person: CrmAccess['staff'][number]
  sets: CrmAccess['sets']
  groups: CrmAccess['groups']
  m: AccessMessages
  common: Common
  reasonRequired: boolean
}) {
  const [set, setSet] = useState(person.set_id ?? '')
  const [group, setGroup] = useState(person.group_id ?? '')
  const [state, action, pending] = useKeptAction(setCrmStaffAccess, () => undefined)
  const roleSet = sets.find((s) => s.id === person.effective_set && !person.set_id)
  return (
    <form action={action} className="grid items-end gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_auto]">
      <input type="hidden" name="user" value={person.user_id} />
      <label className="block">
        <span className={label}>{m.staff.set}</span>
        <select name="set" value={set} onChange={(e) => setSet(e.target.value)} className={field}>
          <option value="">{roleSet ? fill(m.staff.roleDefault, { set: roleSet.name }) : m.staff.roleNone}</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={label}>{m.staff.group}</span>
        <select name="group" value={group} onChange={(e) => setGroup(e.target.value)} className={field}>
          <option value="">{m.staff.noGroup}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" tone="quiet" disabled={pending}>
        {pending ? common.saving : m.save}
      </Button>
      {reasonRequired ? (
        <div className="md:col-span-3">
          <Reason common={common} required />
        </div>
      ) : null}
      <div className="md:col-span-3">
        <Outcome state={state} problems={m.problem} done={common.done} />
      </div>
    </form>
  )
}

/** A set's actions by area; the admin set holds them all and is not changed here */
export function SetForm({
  set,
  actions,
  m,
  common,
  reasonRequired,
}: {
  set?: CrmAccess['sets'][number]
  actions: CrmAccess['actions']
  m: AccessMessages
  common: Common
  reasonRequired: boolean
}) {
  const [name, setName] = useState(set?.name ?? '')
  const [picked, setPicked] = useState<string[]>(set?.actions ?? [])
  const [state, action, pending] = useKeptAction(saveCrmSet, () => (set ? undefined : (setName(''), setPicked([]))))
  const [delState, del, deleting] = useKeptAction(deleteCrmSet, () => undefined)
  const all = set?.kind === 'admin'
  const areas = [...new Set(actions.map((a) => a.area))] as CrmArea[]
  return (
    <div className="flex flex-col gap-[10px]">
      <form action={action} className="flex flex-col gap-[12px]">
        {set ? <input type="hidden" name="id" value={set.id} /> : null}
        <label className="block">
          <span className={label}>{m.sets.name}</span>
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} readOnly={set?.builtin} className={field} />
        </label>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className={label}>{m.sets.actions}</legend>
          {all ? (
            <p className="m-0 text-[12.5px] text-mut">{m.sets.adminAll}</p>
          ) : (
            <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
              {areas.map((area) => (
                <div key={area} className="flex flex-col gap-[5px]">
                  <span className="text-[12px] font-semibold text-mut">{m.area[area]}</span>
                  {actions
                    .filter((a) => a.area === area)
                    .map((a) => {
                      const key = a.key.split('.')[1] as string
                      const words = m.action[area] as Record<string, string>
                      return (
                        <label key={a.key} className="flex items-center gap-[6px] text-[13px]">
                          <input
                            type="checkbox"
                            name="actions"
                            value={a.key}
                            checked={picked.includes(a.key)}
                            onChange={(e) => setPicked(e.target.checked ? [...picked, a.key] : picked.filter((x) => x !== a.key))}
                          />
                          {words[key] ?? key}
                        </label>
                      )
                    })}
                </div>
              ))}
            </div>
          )}
        </fieldset>
        {all ? null : (
          <>
            {reasonRequired ? <Reason common={common} required /> : null}
            <span className="flex flex-wrap items-center gap-[10px]">
              <Button type="submit" size="sm" tone="quiet" disabled={pending}>
                {pending ? common.saving : set ? m.save : m.sets.add}
              </Button>
              <Outcome state={state} problems={m.problem} done={common.done} />
            </span>
          </>
        )}
      </form>
      {set && set.kind === 'custom' ? (
        <form action={del} className="flex flex-wrap items-center gap-[10px]">
          <input type="hidden" name="id" value={set.id} />
          {reasonRequired ? <Reason common={common} required /> : null}
          <Button type="submit" size="sm" tone="ghost" disabled={deleting}>
            {deleting ? common.saving : m.sets.delete}
          </Button>
          <Outcome state={delState} problems={m.problem} done={common.done} />
        </form>
      ) : null}
    </div>
  )
}

/** A visibility group: its name and the group it sits inside */
export function GroupForm({
  group,
  groups,
  m,
  common,
  reasonRequired,
}: {
  group?: CrmAccess['groups'][number]
  groups: CrmAccess['groups']
  m: AccessMessages
  common: Common
  reasonRequired: boolean
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [parent, setParent] = useState(group?.parent_id ?? '')
  const [state, action, pending] = useKeptAction(saveCrmGroup, () => (group ? undefined : (setName(''), setParent(''))))
  const [delState, del, deleting] = useKeptAction(deleteCrmGroup, () => undefined)
  return (
    <div className="flex flex-col gap-[8px]">
      <form action={action} className="grid items-end gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_auto]">
        {group ? <input type="hidden" name="id" value={group.id} /> : null}
        <label className="block">
          <span className={label}>{m.groups.name}</span>
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={field} />
        </label>
        <label className="block">
          <span className={label}>{m.groups.parent}</span>
          <select name="parent" value={parent} onChange={(e) => setParent(e.target.value)} className={field}>
            <option value="">{m.groups.top}</option>
            {groups
              .filter((g) => g.id !== group?.id)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </label>
        <Button type="submit" size="sm" tone="quiet" disabled={pending}>
          {pending ? common.saving : group ? m.save : m.groups.add}
        </Button>
        {reasonRequired ? (
          <div className="md:col-span-3">
            <Reason common={common} required />
          </div>
        ) : null}
        <div className="md:col-span-3">
          <Outcome state={state} problems={m.problem} done={common.done} />
        </div>
      </form>
      {group ? (
        <form action={del} className="flex flex-wrap items-center gap-[10px]">
          <input type="hidden" name="id" value={group.id} />
          {reasonRequired ? <Reason common={common} required /> : null}
          <Button type="submit" size="tiny" tone="ghost" disabled={deleting}>
            {deleting ? common.saving : m.groups.delete}
          </Button>
          <Outcome state={delState} problems={m.problem} done={common.done} />
        </form>
      ) : null}
    </div>
  )
}

/** A team: its name, its manager and its members */
export function TeamForm({
  team,
  staff,
  m,
  common,
  reasonRequired,
}: {
  team?: CrmAccess['teams'][number]
  staff: CrmAccess['staff']
  m: AccessMessages
  common: Common
  reasonRequired: boolean
}) {
  const [name, setName] = useState(team?.name ?? '')
  const [manager, setManager] = useState(team?.manager_id ?? '')
  const [members, setMembers] = useState<string[]>(team?.members.map((x) => x.user_id) ?? [])
  const [state, action, pending] = useKeptAction(saveCrmTeam, () => (team ? undefined : (setName(''), setManager(''), setMembers([]))))
  const [delState, del, deleting] = useKeptAction(deleteCrmTeam, () => undefined)
  // active staff, and whoever is already on the team, so saving it never drops someone silently
  const people = staff.filter((p) => p.active || p.user_id === team?.manager_id || team?.members.some((x) => x.user_id === p.user_id))
  return (
    <div className="flex flex-col gap-[8px]">
      <form action={action} className="flex flex-col gap-[10px]">
        {team ? <input type="hidden" name="id" value={team.id} /> : null}
        <div className="grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
          <label className="block">
            <span className={label}>{m.teams.name}</span>
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={field} />
          </label>
          <label className="block">
            <span className={label}>{m.teams.manager}</span>
            <select name="manager" value={manager} onChange={(e) => setManager(e.target.value)} className={field}>
              <option value="">{m.teams.noManager}</option>
              {people.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.email ?? p.user_id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className={label}>{m.teams.members}</legend>
          <div className="flex flex-wrap gap-x-[14px] gap-y-[6px]">
            {people.map((p) => (
              <label key={p.user_id} className="flex items-center gap-[6px] text-[13px]">
                <input
                  type="checkbox"
                  name="members"
                  value={p.user_id}
                  checked={members.includes(p.user_id)}
                  onChange={(e) => setMembers(e.target.checked ? [...members, p.user_id] : members.filter((x) => x !== p.user_id))}
                />
                {p.email ?? p.user_id}
              </label>
            ))}
          </div>
        </fieldset>
        {reasonRequired ? <Reason common={common} required /> : null}
        <span className="flex flex-wrap items-center gap-[10px]">
          <Button type="submit" size="sm" tone="quiet" disabled={pending}>
            {pending ? common.saving : team ? m.save : m.teams.add}
          </Button>
          <Outcome state={state} problems={m.problem} done={common.done} />
        </span>
      </form>
      {team ? (
        <form action={del} className="flex flex-wrap items-center gap-[10px]">
          <input type="hidden" name="id" value={team.id} />
          {reasonRequired ? <Reason common={common} required /> : null}
          <Button type="submit" size="tiny" tone="ghost" disabled={deleting}>
            {deleting ? common.saving : m.teams.delete}
          </Button>
          <Outcome state={delState} problems={m.problem} done={common.done} />
        </form>
      ) : null}
    </div>
  )
}
