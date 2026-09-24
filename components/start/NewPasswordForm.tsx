'use client'

import { useActionState } from 'react'
import { setNewPassword, type NewPasswordState } from '@/app/(marketing)/nytt-passord/actions'

/** The new-password form. The sign-in panel's field and button classes, unchanged. D-65. */
export function NewPasswordForm({
  labels,
}: {
  labels: Record<'password' | 'repeat' | 'hint' | 'submit' | 'saving' | 'tooShort' | 'mismatch' | 'failed', string>
}) {
  const [state, action, saving] = useActionState<NewPasswordState, FormData>(setNewPassword, {})

  return (
    <form action={action}>
      <label className="mt-[20px] block">
        <span className="mb-[7px] block text-[13px] font-bold">{labels.password}</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          className="h-[48px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[15px] text-ink outline-none"
        />
      </label>
      <label className="mt-[14px] block">
        <span className="mb-[7px] block text-[13px] font-bold">{labels.repeat}</span>
        <input
          name="repeat"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          className="h-[48px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[15px] text-ink outline-none"
        />
      </label>
      <p className="mt-[9px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{labels.hint}</p>
      {state.problem ? (
        <p role="alert" className="mt-[9px] text-[12.5px] leading-[1.5] text-danger">
          {labels[state.problem]}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={saving}
        className="mt-[14px] inline-flex h-[48px] w-full cursor-pointer items-center justify-center rounded-cta border border-ink bg-ac text-[15.5px] font-bold text-ink"
      >
        {saving ? labels.saving : labels.submit}
      </button>
    </form>
  )
}
