/**
 * Måleoppsett's controls (bundle 1439-1560), shared with Målinger › Innstillinger so the
 * organisation's standard is set with the very controls a round is set with (D-126).
 * Moved here unchanged from SetupForm.tsx.
 */
/** One numbered card of the setup (bundle 1439: 22px 24px, radius 18, hairline). */
export function Section({
  head,
  aside,
  children,
}: {
  head: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
        <span className="text-[11px] uppercase tracking-[0.11em] text-mut">{head}</span>
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * The design's radio card: a ring with a filled dot, a bold label and a note.
 *
 * The input is visually hidden rather than removed, so the control keeps its place in the
 * tab order, answers the arrow keys as a radio group should, and takes the focus ring
 * globals.css gives every :focus-visible. The ring and dot are drawn from the bundle's
 * own values (17px, 2px ink, 8px dot).
 */
export function RadioCard({
  name,
  value,
  label,
  note,
  checked,
  disabled,
  labelSize = '14px',
  noteSize = '12px',
  padX = 15,
  padY = 14,
  radius = 13,
  onChange,
}: {
  name: string
  value: string
  label: string
  note?: string
  checked: boolean
  disabled?: boolean
  labelSize?: string
  noteSize?: string
  padX?: number
  padY?: number
  radius?: number
  onChange: () => void
}) {
  return (
    <label
      className={`flex items-start gap-[11px] border text-left ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
      style={{ padding: `${padY}px ${padX}px`, borderRadius: `${radius}px` }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
        <span
          className="block h-[8px] w-[8px] rounded-pill"
          style={{ background: checked ? '#191510' : 'transparent' }}
        />
      </span>
      <span className="min-w-0">
        <span
          className={`block ${checked ? 'font-bold' : 'font-medium'}`}
          style={{ fontSize: labelSize }}
        >
          {label}
        </span>
        {note ? (
          <span
            className="mt-[3px] block leading-[1.45] text-mut [text-wrap:pretty]"
            style={{ fontSize: noteSize }}
          >
            {note}
          </span>
        ) : null}
      </span>
    </label>
  )
}

/** The design's full-width checkbox row (bundle 1533): 19px square, radius 5. */
export function CheckRow({
  name,
  label,
  sub,
  checked,
  disabled,
  onChange,
  className = '',
}: {
  name: string
  label: string
  sub?: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
  className?: string
}) {
  return (
    <label
      className={`flex w-full items-center gap-[12px] rounded-cta border border-ink px-[15px] py-[13px] text-left ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <Mark checked={checked} size={19} />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{label}</span>
        {sub ? <span className="mt-[2px] block text-[11.5px] text-mut">{sub}</span> : null}
      </span>
    </label>
  )
}

/** The design's department card (bundle 1549): 18px square, name over headcount. */
export function CheckCard({
  name,
  value,
  label,
  note,
  checked,
  disabled,
  onChange,
}: {
  name: string
  value: string
  label: string
  note: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label
      className={`flex items-center gap-[10px] rounded-cta border px-[15px] py-[10px] ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <Mark checked={checked} size={18} />
      <span className="text-left">
        <span className={`block text-[13.5px] ${checked ? 'font-bold' : 'font-medium'}`}>
          {label}
        </span>
        <span className="block text-[11.5px] text-mut">{note}</span>
      </span>
    </label>
  )
}

export function Mark({ checked, size }: { checked: boolean; size: number }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-[5px] border-2 border-ink text-[11px] font-bold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: checked ? '#191510' : 'transparent',
        color: checked ? '#FCF6E9' : 'transparent',
      }}
    >
      ✓
    </span>
  )
}

/** A chip that is really a radio or a checkbox — the same substitution MeasureCard makes. */
export function Chip({
  type,
  name,
  value,
  label,
  checked,
  disabled,
  paddingY,
  paddingX,
  text,
  onChange,
}: {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  label: string
  checked: boolean
  disabled?: boolean
  paddingY: number
  paddingX: number
  text: string
  onChange: () => void
}) {
  return (
    <label className="inline-flex flex-none">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <span
        className={`inline-flex items-center rounded-pill border text-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        } ${checked ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'}`}
        style={{ padding: `${paddingY}px ${paddingX}px`, fontSize: text }}
      >
        {label}
      </span>
    </label>
  )
}

