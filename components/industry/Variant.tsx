'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * The question page's switch for a module in variants (D-137): the extended set by default, every
 * statement with the core ones marked, and «Vis bare forenklet» for the simplified set alone. The
 * server renders the extended set, so the page reads whole without script. A link to a simplified
 * factor (the industry page's overview links F1–F8) opens the simplified set.
 */
const Current = createContext<{ simple: boolean; set: (on: boolean) => void }>({ simple: false, set: () => {} })

export function VariantScope({ simpleIds, children }: { simpleIds: string[]; children: ReactNode }) {
  const [simple, set] = useState(false)
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!simpleIds.includes(id)) return
    set(true)
    // the section renders once the switch is on; then go to it
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView())
  }, [simpleIds])
  return <Current.Provider value={{ simple, set }}>{children}</Current.Provider>
}

export function VariantSwitch({ label, note }: { label: string; note: string }) {
  const { simple, set } = useContext(Current)
  return (
    <div className="mt-[22px]">
      <label className="inline-flex cursor-pointer items-center gap-[9px] rounded-pill border border-line bg-sf px-[12px] py-[7px] text-[13px] font-semibold text-ink hover:border-ink has-[:checked]:border-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink">
        <input type="checkbox" role="switch" checked={simple} onChange={() => set(!simple)} className="h-[16px] w-[16px] accent-ink" />
        {label}
      </label>
      <p className="mb-0 mt-[10px] max-w-[62ch] text-[14px] text-body">{note}</p>
    </div>
  )
}

/** Shown in one variant's view only */
export function InVariant({ variant, children }: { variant: 'forenklet' | 'utvidet'; children: ReactNode }) {
  const { simple } = useContext(Current)
  return (variant === 'forenklet') === simple ? <>{children}</> : null
}
