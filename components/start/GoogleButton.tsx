import { continueWithGoogle } from '@/lib/auth/oauth'

/**
 * "Fortsett med Google" (D-102), drawn as the design's alternative sign-in button
 * (Orgpuls_Start.dc.html lines 467-477): the "eller" rule, then a 46 px button on the page
 * colour with a 1.5 px line border. Google's "G" sits before the label, as Google's
 * branding rules ask.
 */
export function GoogleDivider({ label }: { label: string }) {
  return (
    <div className="my-[20px] flex items-center gap-[12px]" aria-hidden="true">
      <span className="block h-px flex-1 bg-line" />
      <span className="text-[11.5px] text-mut">{label}</span>
      <span className="block h-px flex-1 bg-line" />
    </div>
  )
}

const BUTTON =
  'flex h-[46px] w-full cursor-pointer items-center justify-center gap-[10px] rounded-cta border-[1.5px] border-line bg-bg text-[14.5px] font-semibold text-ink disabled:cursor-default disabled:opacity-60'

/**
 * Its own form, with the flow in hidden fields; or, with `inForm`, a submit button that
 * sends the form it sits in to Google instead (the signup's step 2 carries the company).
 */
export function GoogleButton({
  label,
  fields = {},
  disabled = false,
  inForm = false,
  onClick,
}: {
  label: string
  fields?: Record<string, string>
  disabled?: boolean
  inForm?: boolean
  onClick?: () => void
}) {
  const button = (
    <button
      type="submit"
      disabled={disabled}
      className={BUTTON}
      {...(inForm ? { formAction: continueWithGoogle, formNoValidate: true, onClick } : { onClick })}
    >
      <GoogleG />
      {label}
    </button>
  )
  if (inForm) return button
  return (
    <form action={continueWithGoogle} className="flex flex-col">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {button}
    </form>
  )
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
