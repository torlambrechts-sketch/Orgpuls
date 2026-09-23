'use client'

import { useActionState, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  inviteMember,
  revokeInvite,
  setMember,
  type InviteResult,
} from '@/app/(app)/oppsett/member-actions'
import { MEMBER_ROLES, type MemberRole } from '@/lib/members/roles'
import type { Member, OpenInvite } from '@/lib/members/read'

/**
 * Who has access, and letting somebody new in. Not in the design: the bundle's Roller tab
 * is the access matrix and the three permission cards, and grants nothing. The matrix
 * above this panel is the design's; this panel is what makes it true for a given person.
 * D-51.
 *
 * Every write goes through a 0028 function that holds the rules — invitation by address,
 * acceptance by the invited account only, the last daglig leder kept — so this component
 * only collects the choice and reports the verdict.
 */

const CONTROL = 'box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[11px] text-[13.5px] text-ink'
const PRIMARY =
  'inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-ink bg-ac px-[16px] text-[13.5px] font-bold text-ink disabled:cursor-default disabled:opacity-60'
const SECONDARY =
  'inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-line bg-transparent px-[14px] text-[13px] font-semibold text-ink disabled:cursor-default disabled:opacity-60'

type Group = { id: string; name: string }

export function MembersPanel({
  members,
  invites,
  groups,
  canWrite,
  locked,
  locale,
}: {
  members: Member[]
  invites: OpenInvite[]
  groups: Group[]
  canWrite: boolean
  /** the shared demo organisation issues no invitations (0029) */
  locked: boolean
  locale: string
}) {
  const t = useTranslations('oppsett.roller')

  return (
    <section className="mt-[16px] rounded-panel border border-line bg-sf px-[26px] py-[24px] max-md:px-[18px]">
      <h2 className="m-0 font-display text-[21px] font-semibold">{t('members.title')}</h2>
      <p className="mt-[6px] max-w-[680px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
        {!canWrite ? t('members.readOnly') : locked ? t('members.locked') : t('members.lead')}
      </p>

      <div className="mt-[16px] flex flex-col gap-[9px]">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} groups={groups} canWrite={canWrite} />
        ))}
      </div>

      {canWrite && !locked ? (
        <>
          <InviteForm groups={groups} />
          {invites.length > 0 ? <OpenInvites invites={invites} groups={groups} locale={locale} /> : null}
        </>
      ) : null}
    </section>
  )
}

function MemberRow({ member, groups, canWrite }: { member: Member; groups: Group[]; canWrite: boolean }) {
  const t = useTranslations('oppsett.roller')
  const [role, setRole] = useState<MemberRole>(member.role)
  const [group, setGroup] = useState<string>(member.group_id ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty = role !== member.role || (role === 'avdelingsleder' && group !== (member.group_id ?? ''))
  const save = (active: boolean) =>
    start(async () => {
      setProblem(null)
      const result = await setMember({
        id: member.id,
        role,
        group: role === 'avdelingsleder' && group ? group : null,
        active,
      })
      if (!result.ok) setProblem(result.problem)
    })

  return (
    <div
      className={`grid items-center gap-[12px] rounded-tile border border-line px-[16px] py-[13px] md:[grid-template-columns:minmax(0,1.3fr)_170px_190px_auto] ${
        member.active ? 'bg-bg' : 'bg-transparent'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold [overflow-wrap:anywhere]">
          {member.name ?? t('members.noName')}
          {member.is_self ? <span className="font-normal text-mut"> ({t('members.you')})</span> : null}
        </span>
        <span className="block text-[12.5px] text-mut [overflow-wrap:anywhere]">
          {member.email}
          {!member.active ? ` · ${t('members.inactive')}` : ''}
        </span>
      </span>

      <label className="block">
        <span className="sr-only">{t('members.role')}</span>
        <select
          value={role}
          disabled={!canWrite || pending}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          className={CONTROL}
        >
          {MEMBER_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="sr-only">{t('members.group')}</span>
        {role === 'avdelingsleder' ? (
          <select
            value={group}
            disabled={!canWrite || pending}
            onChange={(e) => setGroup(e.target.value)}
            className={CONTROL}
          >
            <option value="">{t('members.chooseGroup')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="block text-[12.5px] text-mut max-md:hidden">—</span>
        )}
      </label>

      {canWrite ? (
        <span className="flex flex-wrap justify-start gap-[8px] md:justify-end">
          {dirty ? (
            <button
              type="button"
              disabled={pending || (role === 'avdelingsleder' && !group)}
              onClick={() => save(member.active)}
              className={PRIMARY}
            >
              {pending ? t('members.saving') : t('members.save')}
            </button>
          ) : member.is_self ? null : (
            <button
              type="button"
              disabled={pending}
              onClick={() => save(!member.active)}
              className={SECONDARY}
            >
              {member.active ? t('members.deactivate') : t('members.reactivate')}
            </button>
          )}
        </span>
      ) : null}

      {problem ? (
        <p role="alert" className="m-0 text-[12.5px] text-danger md:col-span-4">
          {t(`members.problem.${problem in PROBLEMS ? problem : 'failed'}`)}
        </p>
      ) : null}
    </div>
  )
}

/** The verdicts that have their own sentence; anything else reads as "failed". */
const PROBLEMS = {
  invalid_email: 1,
  invalid_role: 1,
  invalid_group: 1,
  already_member: 1,
  locked: 1,
  last_daglig_leder: 1,
  not_allowed: 1,
  not_found: 1,
  invalid: 1,
  failed: 1,
}

function InviteForm({ groups }: { groups: Group[] }) {
  const t = useTranslations('oppsett.roller')
  const [state, action, pending] = useActionState<InviteResult, FormData>(inviteMember, { status: 'idle' })
  const [copied, setCopied] = useState(false)

  return (
    <div className="mt-[20px] border-t border-line pt-[18px]">
      <span className="block text-[14.5px] font-bold">{t('members.inviteHead')}</span>
      {/* remounted per issued invitation: React resets the form after a successful action,
          and a fresh mount keeps the role the fields show and the role state in step */}
      <InviteFields
        key={state.status === 'invited' ? state.link : 'new'}
        groups={groups}
        action={action}
        pending={pending}
      />

      {state.status === 'problem' ? (
        <p role="alert" className="mt-[9px] text-[12.5px] text-danger">
          {t(`members.problem.${state.problem in PROBLEMS ? state.problem : 'failed'}`)}
        </p>
      ) : null}

      {state.status === 'invited' ? (
        <div className="mt-[14px] rounded-row bg-mint px-[18px] py-[16px]">
          <span className="block text-[14px] font-bold text-greendeep">{t('members.linkHead')}</span>
          <span className="mt-[5px] block max-w-[640px] text-[13px] leading-[1.55] text-greendeep [text-wrap:pretty]">
            {t('members.linkNote', { email: state.email })}
          </span>
          <span className="mt-[11px] flex flex-wrap items-center gap-[8px]">
            <input
              readOnly
              value={state.link}
              aria-label={t('members.linkHead')}
              onFocus={(e) => e.currentTarget.select()}
              className={`${CONTROL} min-w-0 flex-1 bg-sf font-mono text-[12px]`}
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(state.link).then(() => setCopied(true))
              }}
              className={SECONDARY}
            >
              {copied ? t('members.copied') : t('members.copy')}
            </button>
          </span>
        </div>
      ) : null}
    </div>
  )
}

function InviteFields({
  groups,
  action,
  pending,
}: {
  groups: Group[]
  action: (form: FormData) => void
  pending: boolean
}) {
  const t = useTranslations('oppsett.roller')
  const [role, setRole] = useState<MemberRole>('avdelingsleder')

  return (
    <form
      action={action}
      className="mt-[11px] grid items-end gap-[10px] md:[grid-template-columns:minmax(0,1.4fr)_170px_190px_auto]"
    >
      <label className="block">
        <span className="mb-[5px] block text-[11.5px] text-mut">{t('members.email')}</span>
        <input name="email" type="email" required inputMode="email" autoComplete="off" className={CONTROL} />
      </label>
      <label className="block">
        <span className="mb-[5px] block text-[11.5px] text-mut">{t('members.role')}</span>
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          className={CONTROL}
        >
          {MEMBER_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-[5px] block text-[11.5px] text-mut">{t('members.group')}</span>
        <select name="group" disabled={role !== 'avdelingsleder'} required={role === 'avdelingsleder'} className={CONTROL}>
          <option value="">{role === 'avdelingsleder' ? t('members.chooseGroup') : '—'}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? t('members.inviting') : t('members.invite')}
      </button>
    </form>
  )
}

function OpenInvites({ invites, groups, locale }: { invites: OpenInvite[]; groups: Group[]; locale: string }) {
  const t = useTranslations('oppsett.roller')
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' }).format(new Date(iso))
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name

  return (
    <div className="mt-[20px] border-t border-line pt-[18px]">
      <span className="block text-[14.5px] font-bold">{t('members.openHead')}</span>
      <div className="mt-[11px] flex flex-col gap-[8px]">
        {invites.map((i) => (
          <div
            key={i.id}
            className="flex flex-wrap items-center justify-between gap-[10px] rounded-tile border border-line bg-bg px-[16px] py-[11px]"
          >
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold [overflow-wrap:anywhere]">{i.email}</span>
              <span className="block text-[12px] text-mut">
                {[t(`role.${i.role}`), groupName(i.group_id), t('members.expires', { date: date(i.expires_at) })]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setProblem(null)
                  const result = await revokeInvite(i.id)
                  if (!result.ok) setProblem(result.problem)
                })
              }
              className={SECONDARY}
            >
              {t('members.revoke')}
            </button>
          </div>
        ))}
      </div>
      {problem ? (
        <p role="alert" className="mt-[9px] text-[12.5px] text-danger">
          {t(`members.problem.${problem in PROBLEMS ? problem : 'failed'}`)}
        </p>
      ) : null}
    </div>
  )
}
