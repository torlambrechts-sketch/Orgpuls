'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { pickWording, WORDINGS, type Wording, type WordingVariants } from '@/lib/modules/wording'

/**
 * The question page's switch for a worded module (D-131): «Barnehage / Skole / Begge» at the
 * top, and every statement and count question below it in that wording. The codes stay as
 * they are: the three wordings are one statement. The server renders «begge», the file's own
 * text, so the page reads whole without script.
 */
const Current = createContext<{ wording: Wording; set: (w: Wording) => void }>({ wording: 'begge', set: () => {} })

export function WordingScope({ children }: { children: ReactNode }) {
  const [wording, set] = useState<Wording>('begge')
  return <Current.Provider value={{ wording, set }}>{children}</Current.Provider>
}

export function WordingSwitch({ labels }: { labels: { legend: string; note: string } & Record<Wording, string> }) {
  const { wording, set } = useContext(Current)
  return (
    <fieldset className="m-0 mt-[22px] min-w-0 border-0 p-0">
      <legend className="p-0 text-[13px] font-semibold text-mut">{labels.legend}</legend>
      <div className="mt-[10px] flex flex-wrap gap-[8px]">
        {WORDINGS.map((w) => (
          <label
            key={w}
            className="cursor-pointer rounded-pill border border-line bg-sf px-[12px] py-[7px] text-[13px] font-semibold text-ink hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-bg has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink"
          >
            <input type="radio" name="ordbruk" value={w} checked={wording === w} onChange={() => set(w)} className="sr-only" />
            {labels[w]}
          </label>
        ))}
      </div>
      <p className="mb-0 mt-[10px] max-w-[62ch] text-[14px] text-body">{labels.note}</p>
    </fieldset>
  )
}

/** A statement or count question in the wording chosen above */
export function Worded({ text, variants }: { text: string; variants?: WordingVariants }) {
  const { wording } = useContext(Current)
  return <>{pickWording(text, variants, wording)}</>
}
