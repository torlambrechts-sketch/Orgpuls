'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useTransition } from 'react'
import { setLanguage } from '@/lib/i18n/actions'
import { LOCALES } from '@/lib/i18n/locales'
import { EN_HOST, MAIN_URL } from '@/lib/hosts'

const SHORT = { no: 'NO', en: 'EN' } as const
const NAME = { no: 'Norsk', en: 'English' } as const

/**
 * Norsk / English (D-96). Each language is named in itself, so someone who reads only one
 * of them can still find it.
 *
 * On the public site in production each language has its own host (D-98), so the switch is
 * a plain link to the same page on the other one: `hosts` is passed then. Otherwise the choice
 * is saved (lib/i18n/actions) and the page drawn again in place; leaving the English host for
 * Norwegian goes to www, since that host is English whatever is chosen.
 */
export function LanguageSwitch({
  label,
  size = 'sm',
  hosts,
}: {
  label: string
  size?: 'sm' | 'lg'
  hosts?: { no: string; en: string }
}) {
  const current = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = useTransition()
  const h = size === 'lg' ? 'h-[44px] flex-1' : 'h-[30px]'

  return (
    <span
      role="group"
      aria-label={label}
      className={`inline-flex flex-none items-center gap-[2px] rounded-ctl border border-line bg-sf p-[2px] ${size === 'lg' ? 'w-full' : ''}`}
    >
      {LOCALES.map((l) => {
        const on = l === current
        const cls = `${h} inline-flex min-w-[34px] items-center justify-center rounded-[7px] border-none px-[8px] text-[12.5px] font-bold no-underline hover:no-underline ${
          on ? 'bg-ink text-bg hover:text-bg' : 'bg-transparent text-ink hover:bg-bg hover:text-ink'
        }`
        if (hosts) {
          return (
            <a
              key={l}
              href={`${hosts[l]}${pathname}`}
              hrefLang={l === 'no' ? 'nb' : 'en'}
              lang={l === 'no' ? 'nb' : 'en'}
              aria-current={on ? 'true' : undefined}
              aria-label={NAME[l]}
              className={cls}
            >
              {size === 'lg' ? NAME[l] : SHORT[l]}
            </a>
          )
        }
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
                if (l === 'no' && window.location.hostname === EN_HOST) window.location.href = `${MAIN_URL}${pathname}`
                else router.refresh()
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
