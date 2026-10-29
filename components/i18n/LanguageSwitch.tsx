'use client'

import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useTransition } from 'react'
import { setLanguage } from '@/lib/i18n/actions'
import { bcp47, LOCALES, type Locale } from '@/lib/i18n/locales'

const SHORT: Record<Locale, string> = { no: 'NO', en: 'EN', sv: 'SV', de: 'DE' }
const NAME: Record<Locale, string> = { no: 'Norsk', en: 'English', sv: 'Svenska', de: 'Deutsch' }

/**
 * Norsk / English (D-96). Each language is named in itself, so someone who reads only one
 * of them can still find it.
 *
 * The choice is saved (lib/i18n/actions) and the page drawn again in place. Until the move (UK-G,
 * D-275) the public site's English had a host of its own (D-98) and the switch was a link to it;
 * en.orgpuls.com now sends its readers on, so English on www.orgpuls.com is this choice, on the same
 * address, as it is in the app.
 */
export function LanguageSwitch({
  label,
  size = 'sm',
  langs = LOCALES,
}: {
  label: string
  /** `text`: the two names as words in the surrounding small type (the site footer's bottom line, D-190) */
  size?: 'sm' | 'lg' | 'text'
  /** the languages offered: the public site offers its own (lib/hosts.ts `siteLangs`, D-252); the app, every one */
  langs?: readonly Locale[]
}) {
  const current = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const text = size === 'text'
  const h = size === 'lg' ? 'h-[44px] flex-1' : 'h-[30px]'
  const item = (on: boolean) =>
    text
      ? // the hit area grows 6px above and below without moving the line
        `-my-[6px] inline-flex items-center border-none bg-transparent px-0 py-[6px] no-underline hover:no-underline ${
          on ? 'font-bold text-ink hover:text-ink' : 'font-normal text-mut hover:text-ink'
        }`
      : `${h} inline-flex min-w-[34px] items-center justify-center rounded-[7px] border-none px-[8px] text-[12.5px] font-bold no-underline hover:no-underline ${
          on ? 'bg-ink text-bg hover:text-bg' : 'bg-transparent text-ink hover:bg-bg hover:text-ink'
        }`

  return (
    <span
      role="group"
      aria-label={label}
      className={
        text
          ? 'inline-flex flex-none items-center gap-[12px]'
          : `inline-flex flex-none items-center gap-[2px] rounded-ctl border border-line bg-sf p-[2px] ${size === 'lg' ? 'w-full' : ''}`
      }
    >
      {langs.map((l) => {
        const on = l === current
        const cls = item(on)
        return (
          <button
            key={l}
            type="button"
            lang={bcp47(l)}
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
            className={
              text
                ? `${cls} cursor-pointer`
                : `${h} min-w-[34px] cursor-pointer rounded-[7px] border-none px-[8px] text-[12.5px] font-bold ${
                    on ? 'bg-ink text-bg' : 'bg-transparent text-ink hover:bg-bg'
                  }`
            }
          >
            {size === 'sm' ? SHORT[l] : NAME[l]}
          </button>
        )
      })}
    </span>
  )
}
