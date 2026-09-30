'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createGroup, renameGroup } from '@/app/(app)/oppsett/actions'
import type { Group } from '@/lib/org/read'

// LocationForm's field and submit, and the select beside them in ImportForm and MembersPanel
const CONTROL = 'box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink'
const SELECT = 'box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[11px] text-[13.5px] text-ink'
const SUBMIT =
  'inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-ink bg-ac text-[13.5px] font-bold text-ink'

/**
 * «Ny gruppe» and «Gi nytt navn» under the list of groups (D-172). The design draws neither:
 * its groups are fixed data. These are the Lokasjoner tab's add form — the same labels, fields
 * and submit — under the same rule line, so the tab gains no control the settings screens do
 * not already have.
 *
 * Renaming is a select and a name rather than an edit in the row, which keeps the rows as the
 * design draws them. Choosing a group puts its name in the field to change.
 *
 * There is no delete: results, round audiences and memberships are keyed by the group.
 */
export function GroupForm({ groups, canWrite }: { groups: Group[]; canWrite: boolean }) {
  const t = useTranslations('oppsett.grupper.edit')
  const [status, setStatus] = useState<{ ok: true; text: string } | { ok: false; problem: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [renameId, setRenameId] = useState(groups[0]?.id ?? '')
  const [renameTo, setRenameTo] = useState(groups[0]?.name ?? '')
  // a group renamed or created elsewhere, or the chosen one gone from the list: start from the first
  const chosen = groups.find((g) => g.id === renameId) ?? groups[0]

  const problemText = (p: string) => (['invalid', 'duplicate', 'denied'].includes(p) ? t(`problem.${p}`) : t('problem.denied'))

  return (
    <div className="mt-[16px] border-t border-line pt-[16px]">
      <form
        action={(data) =>
          startTransition(async () => {
            const name = String(data.get('name') ?? '').trim()
            const result = await createGroup(data)
            setStatus(result.ok ? { ok: true, text: t('created', { name }) } : result)
          })
        }
        className="grid items-end gap-[10px] md:[grid-template-columns:minmax(190px,1fr)_120px]"
      >
        <label className="block">
          <span className="mb-[5px] block text-[11.5px] text-mut">{t('newName')}</span>
          <input
            name="name"
            required
            maxLength={60}
            disabled={!canWrite}
            placeholder={t('newPlaceholder')}
            className={CONTROL}
          />
        </label>
        <button type="submit" disabled={!canWrite || pending} className={SUBMIT}>
          {t('add')}
        </button>
      </form>

      {chosen ? (
        <form
          // submitted by hand: an action would reset the form, and these two fields are controlled
          onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            startTransition(async () => {
              const name = String(data.get('name') ?? '').trim()
              const result = await renameGroup(data)
              setStatus(result.ok ? { ok: true, text: t('renamed', { name }) } : result)
            })
          }}
          className="mt-[12px] grid items-end gap-[10px] md:[grid-template-columns:minmax(150px,1fr)_minmax(190px,1.4fr)_120px]"
        >
          <label className="block">
            <span className="mb-[5px] block text-[11.5px] text-mut">{t('group')}</span>
            <select
              name="id"
              value={chosen.id}
              disabled={!canWrite}
              onChange={(e) => {
                setRenameId(e.target.value)
                setRenameTo(groups.find((g) => g.id === e.target.value)?.name ?? '')
              }}
              className={SELECT}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-[5px] block text-[11.5px] text-mut">{t('newNameFor')}</span>
            <input
              name="name"
              required
              maxLength={60}
              disabled={!canWrite}
              value={chosen.id === renameId ? renameTo : chosen.name}
              onChange={(e) => {
                setRenameId(chosen.id)
                setRenameTo(e.target.value)
              }}
              className={CONTROL}
            />
          </label>
          <button type="submit" disabled={!canWrite || pending} className={SUBMIT}>
            {t('rename')}
          </button>
        </form>
      ) : null}

      <div role="status">
        {status ? (
          <p
            className={`mt-[11px] max-w-[600px] text-[12.5px] leading-[1.5] [text-wrap:pretty] ${status.ok ? 'text-link' : 'text-danger'}`}
          >
            {status.ok ? status.text : problemText(status.problem)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
