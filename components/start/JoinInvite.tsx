'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { acceptSignedIn, joinWithPassword, type JoinState } from '@/app/(marketing)/bli-med/actions'

const PROBLEMS = new Set([
  'wrong_password', 'short_password', 'confirm_email', 'other_organisation', 'wrong_account',
  'expired', 'already_accepted', 'not_found', 'failed',
])

const PRIMARY =
  'mt-[16px] inline-flex h-[48px] w-full cursor-pointer items-center justify-center rounded-cta border border-ink bg-ac text-[15.5px] font-bold text-ink disabled:cursor-default disabled:opacity-60'

function Problem({ state }: { state: JoinState }) {
  const t = useTranslations('bliMed')
  if (!state.problem) return null
  return (
    <p role="alert" className="mt-[10px] text-[13px] leading-[1.5] text-danger [text-wrap:pretty]">
      {t(`problem.${PROBLEMS.has(state.problem) ? state.problem : 'failed'}`)}
    </p>
  )
}

/** Not signed in: one password field, which signs in or creates the account. */
export function JoinWithPassword({ token }: { token: string }) {
  const t = useTranslations('bliMed')
  const [state, action, pending] = useActionState<JoinState, FormData>(joinWithPassword, {})
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <label className="mt-[20px] block">
        <span className="mb-[7px] block text-[13px] font-bold">{t('password')}</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          className="h-[48px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[15px] text-ink outline-none"
        />
      </label>
      <p className="mt-[8px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{t('passwordNote')}</p>
      <Problem state={state} />
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? t('joining') : t('join')}
      </button>
    </form>
  )
}

/** Signed in with the invited address: one button. */
export function AcceptInvite({ token }: { token: string }) {
  const t = useTranslations('bliMed')
  const [state, action, pending] = useActionState<JoinState, FormData>(acceptSignedIn, {})
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <Problem state={state} />
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? t('joining') : t('accept')}
      </button>
    </form>
  )
}
