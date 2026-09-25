'use client'

import { useActionState, useState } from 'react'
import { adminSignIn, mfaEnroll, mfaVerify, type AdminResult, type Enrolment } from '@/lib/admin/actions'
import { Button } from '@/components/ui/Button'

const field = 'box-border h-[42px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[14px] text-ink outline-none'

export function LoginForm({
  labels,
}: {
  labels: { email: string; password: string; submit: string; pending: string; invalid: string }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(adminSignIn, null)
  return (
    <form action={action} className="flex flex-col gap-[12px]">
      <label className="block">
        <span className="mb-[6px] block text-[12.5px] font-semibold">{labels.email}</span>
        <input name="email" type="email" required autoComplete="username" className={field} />
      </label>
      <label className="block">
        <span className="mb-[6px] block text-[12.5px] font-semibold">{labels.password}</span>
        <input name="password" type="password" required minLength={8} autoComplete="current-password" className={field} />
      </label>
      <Button type="submit" size="md" disabled={pending}>
        {pending ? labels.pending : labels.submit}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
          {labels.invalid}
        </p>
      ) : null}
    </form>
  )
}

type MfaLabels = {
  enrollLead: string
  enrollStart: string
  secret: string
  verifyLead: string
  code: string
  submit: string
  pending: string
  problems: Record<string, string>
}

/**
 * The second step. With an authenticator already set up it asks for a code; without one it
 * enrols one first, showing the QR code and the key for typing by hand.
 */
export function MfaPanel({ factorId, labels }: { factorId: string | null; labels: MfaLabels }) {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null)
  const [starting, setStarting] = useState(false)
  const id = factorId ?? (enrolment?.ok ? enrolment.factorId : null)

  if (!id) {
    return (
      <div className="flex flex-col gap-[12px]">
        <p className="m-0 text-[13.5px] leading-[1.55] text-mut">{labels.enrollLead}</p>
        <Button
          size="md"
          disabled={starting}
          onClick={async () => {
            setStarting(true)
            setEnrolment(await mfaEnroll())
            setStarting(false)
          }}
        >
          {labels.enrollStart}
        </Button>
        {enrolment && !enrolment.ok ? (
          <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
            {labels.problems[enrolment.problem] ?? labels.problems.failed}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {enrolment?.ok ? (
        <div className="flex flex-col items-start gap-[10px]">
          <p className="m-0 text-[13.5px] leading-[1.55] text-mut">{labels.enrollLead}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolment.qr} alt="" width={180} height={180} className="rounded-ctl border border-line bg-white p-[8px]" />
          <p className="m-0 text-[12.5px] text-mut">
            {labels.secret} <code className="break-all font-mono text-ink">{enrolment.secret}</code>
          </p>
        </div>
      ) : (
        <p className="m-0 text-[13.5px] leading-[1.55] text-mut">{labels.verifyLead}</p>
      )}
      <CodeForm factorId={id} labels={labels} />
    </div>
  )
}

function CodeForm({ factorId, labels }: { factorId: string; labels: MfaLabels }) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(mfaVerify, null)
  return (
    <form action={action} className="flex flex-col gap-[12px]">
      <input type="hidden" name="factorId" value={factorId} />
      <label className="block">
        <span className="mb-[6px] block text-[12.5px] font-semibold">{labels.code}</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          className={field}
        />
      </label>
      <Button type="submit" size="md" disabled={pending}>
        {pending ? labels.pending : labels.submit}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
          {labels.problems[state.problem] ?? labels.problems.failed}
        </p>
      ) : null}
    </form>
  )
}
