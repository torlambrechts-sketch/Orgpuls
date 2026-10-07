'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { INNSIKT_COOKIE, type InnsiktMode } from '@/lib/innsikt/mode'
import { PREF_MAX_AGE } from '@/lib/shell/prefs'

/**
 * «Visning: Enkel | Avansert» (Orgpuls.dc.html 136-142, D-244). The choice is kept in a cookie the
 * server reads, so the next visit opens on it; the page is then rendered again on the server.
 */
export function ModeSwitch({ mode, labels }: { mode: InnsiktMode; labels: { label: string; group: string; enkel: string; avansert: string } }) {
  const router = useRouter()
  const [, start] = useTransition()
  const pick = (m: InnsiktMode) => {
    if (m === mode) return
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${INNSIKT_COOKIE}=${m}; Path=/; Max-Age=${PREF_MAX_AGE}; SameSite=Lax${secure}`
    start(() => router.refresh())
  }
  return (
    <div className="flex items-center justify-end gap-[10px] px-[16px] pt-[20px] md:px-[28px]">
      <span aria-hidden="true" className="text-[12px] text-mut">
        {labels.label}
      </span>
      <span role="group" aria-label={labels.group} className="flex gap-[3px] rounded-cta bg-well p-[4px]">
        {(['enkel', 'avansert'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === mode}
            onClick={() => pick(m)}
            className={`cursor-pointer rounded-bar border-none px-[14px] py-[7px] text-[13px] text-ink ${
              m === mode ? 'bg-sf font-bold shadow-[0_1px_2px_rgba(25,21,16,.14)]' : 'bg-transparent font-medium'
            }`}
          >
            {labels[m]}
          </button>
        ))}
      </span>
    </div>
  )
}
