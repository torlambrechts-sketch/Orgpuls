import { continueWithMicrosoft } from '@/lib/auth/oauth'
import { PROVIDER_BUTTON } from '@/components/start/GoogleButton'

/**
 * «Fortsett med Microsoft» (D-201): the first of the design's alternative sign-in buttons
 * (Orgpuls_Start.dc.html lines 473-477, `li.alts[0]`), drawn exactly as the design draws them and
 * as GoogleButton draws Google — 46 px, the page colour, a 1.5 px line border, 12 px radius, the
 * label at 14.5/600, and the design's 10 px gap before it, which is where Microsoft's four-square
 * logo goes, as Microsoft's branding guidance for its sign-in button asks.
 *
 * Its own form, with the flow in hidden fields; or, with `inForm`, a submit button that sends the
 * form it sits in to Microsoft instead (the signup's step 2 carries the company).
 */
export function MicrosoftButton({
  label,
  fields = {},
  disabled = false,
  inForm = false,
}: {
  label: string
  fields?: Record<string, string>
  disabled?: boolean
  inForm?: boolean
}) {
  const button = (
    <button
      type="submit"
      disabled={disabled}
      className={PROVIDER_BUTTON}
      {...(inForm ? { formAction: continueWithMicrosoft, formNoValidate: true } : {})}
    >
      <MicrosoftLogo />
      {label}
    </button>
  )
  if (inForm) return button
  return (
    <form action={continueWithMicrosoft} className="flex flex-col">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {button}
    </form>
  )
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}
