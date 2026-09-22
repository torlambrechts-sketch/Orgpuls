'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { signIn, type SignInState } from './actions'

export function SignInForm({ labels }: {
  labels: { email: string; password: string; submit: string; error: string }
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {})

  return (
    <form action={action} className="mt-[22px] flex flex-col gap-[14px]">
      <label className="flex flex-col gap-[6px]">
        <span className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.email}</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-[42px] rounded-btn border border-line bg-bg px-[13px] text-[14px] text-ink"
        />
      </label>
      <label className="flex flex-col gap-[6px]">
        <span className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.password}</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-[42px] rounded-btn border border-line bg-bg px-[13px] text-[14px] text-ink"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-[12.5px] text-danger">{labels.error}</p>
      ) : null}

      <Button type="submit" size="md" tone="primary" disabled={pending} className="mt-[4px] w-full">
        {labels.submit}
      </Button>
    </form>
  )
}
