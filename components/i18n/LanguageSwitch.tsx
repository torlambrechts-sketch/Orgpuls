'use client'

import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useTransition } from 'react'
import { setLanguage } from '@/lib/i18n/actions'
import { LOCALES } from '@/lib/i18n/locales'

const SHORT = { no: 'NO', en: 'EN' } as const
const NAME = { no: 'Norsk', en: 'English' } as const

/**
 * Norsk / English (D-96). Each language is named in itself, so someone who reads only one
 * of them can still find it. The choice is saved (lib/i18n/actions) and the page drawn again
 * in place, on the same address.
 */
export function LanguageSwitch({ label, size = 'sm' }: { label: string; size?: 'sm' | 'lg' }) {
  const current = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const h = size === 'lg' ? 'h-[44px] flex-1' : 'h-[30px]'

  return (
    <span role="group" aria-label={label} className={`inline-flex flex-none items-center gap-[2px] rounded-ctl border border-line bg-sf p-[2px] ${size === 'lg' ? 'w-full' : ''}`}>
      {LOCALES.map((l) => {
        const on = l === current
        return (
          <button
            key={l}
            type="button"
            lang={l === 'no' ? 'nb' : 'en'}
            aria-pressed={on}
            aria-label={NAME[l]}
            disabled={pending}
            onClick={() => {
              if (on) return
              start(async () => {
                await setLanguage(l)
                router.refresh()
              })
            }}
            className={`${h} min-w-[34px] cursor-pointer rounded-[7px] border-none px-[8px] text-[12.5px] font-bold ${
              on ? 'bg-ink text-bg' : 'bg-transparent text-ink hover:bg-bg'
            }`}
          >
            {size === 'lg' ? NAME[l] : SHORT[l]}
          </button>
        )
      })}
    </span>
  )
}
