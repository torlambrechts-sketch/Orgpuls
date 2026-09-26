'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { saveHeard } from '@/app/(marketing)/registrer/actions'
import { HEARD, type Heard } from '@/lib/signup/heard'

/**
 * "Hvordan hørte du om oss?" under the finished signup (D-104). Optional: one press saves it,
 * another answer replaces it. Software cannot see a colleague's tip or a mention in ChatGPT;
 * this is how those are counted. A fixed list, never free text. Styled as the size question
 * on step 2, so it reads as the same form.
 */
export function HeardAbout() {
  const t = useTranslations('registrer.heard')
  const [chosen, setChosen] = useState<Heard | null>(null)
  const [saved, setSaved] = useState(false)
  const [, start] = useTransition()

  return (
    <fieldset className="m-0 mt-[26px] border-0 border-t border-line p-0 pt-[20px]">
      <legend className="float-left mb-[9px] block w-full p-0 text-[13px] font-bold">{t('question')}</legend>
      <div className="clear-both flex flex-wrap gap-[7px]">
        {HEARD.map((k) => (
          <label key={k} className="inline-flex flex-none">
            <input
              type="radio"
              name="heard"
              value={k}
              checked={chosen === k}
              onChange={() => {
                setChosen(k)
                setSaved(false)
                start(async () => {
                  const r = await saveHeard(k).catch(() => ({ ok: false }))
                  setSaved(r.ok)
                })
              }}
              className="peer absolute h-px w-px overflow-hidden opacity-0"
            />
            <span
              className={`inline-flex cursor-pointer items-center rounded-pill border-[1.5px] px-[15px] py-[10px] text-[13.5px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                chosen === k ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'
              }`}
            >
              {t(`option.${k}`)}
            </span>
          </label>
        ))}
      </div>
      <div role="status" className="mt-[8px] min-h-[19px] text-[12.5px] leading-[1.5] text-mut">
        {saved ? t('thanks') : t('note')}
      </div>
    </fieldset>
  )
}
