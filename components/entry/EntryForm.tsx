'use client'

import { useActionState } from 'react'
import { requestLink, type EntryState } from '@/app/inn/[code]/actions'

/**
 * The QR page's one field (0076, D-126): a mobile number or an e-mail address, and a
 * button. Styled as the sign-in panel's field and primary button (components/start). After
 * sending, the page says the same thing whatever happened, so it tells nobody who is on the
 * list or who has answered.
 */
export function EntryForm({
  code,
  labels,
}: {
  code: string
  labels: {
    field: string
    placeholder: string
    submit: string
    sending: string
    sentTitle: string
    sentLead: string
    again: string
    invalid: string
    busy: string
    failed: string
  }
}) {
  const [state, action, pending] = useActionState<EntryState, FormData>(requestLink.bind(null, code), { status: 'idle' })

  if (state.status === 'sent') {
    return (
      <div className="mt-[20px] rounded-row bg-mint px-[22px] py-[20px]" role="status">
        <span className="block text-[15px] font-bold text-greendeep">{labels.sentTitle}</span>
        <span className="mt-[6px] block text-[13.5px] leading-[1.6] text-greendeep [text-wrap:pretty]">{labels.sentLead}</span>
        <a href={`/inn/${code}`} className="mt-[12px] inline-block text-[13px] font-semibold text-greendeep">
          {labels.again}
        </a>
      </div>
    )
  }

  const problem =
    state.status === 'invalid' ? labels.invalid : state.status === 'busy' ? labels.busy : state.status === 'failed' ? labels.failed : null

  return (
    <form action={action}>
      <label className="mt-[20px] block">
        <span className="mb-[7px] block text-[13px] font-bold">{labels.field}</span>
        <input
          name="contact"
          type="text"
          required
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          placeholder={labels.placeholder}
          aria-invalid={state.status === 'invalid' || undefined}
          aria-describedby={problem ? 'entry-problem' : undefined}
          className="h-[48px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[15px] text-ink outline-none focus-visible:border-ink"
        />
      </label>
      {problem ? (
        <p id="entry-problem" role="alert" className="mt-[9px] text-[12.5px] text-danger">
          {problem}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-[14px] inline-flex h-[48px] w-full cursor-pointer items-center justify-center rounded-cta border border-ink bg-ac text-[15.5px] font-bold text-ink disabled:cursor-default"
      >
        {pending ? labels.sending : labels.submit}
      </button>
    </form>
  )
}
