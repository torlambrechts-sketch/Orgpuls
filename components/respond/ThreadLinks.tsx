'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * After "Send inn": the way back to each comment's conversation (D-78).
 *
 * The key is in the fragment (`/s/samtale#<key>`), which a browser never sends to a
 * server, so it reaches no access log and no Referer header. It exists in plaintext only
 * here and in whatever the person saves; the database keeps a digest. Nothing is stored
 * for them — the screen says so, because a lost link cannot be sent again.
 */
export function ThreadLinks({ keys }: { keys: string[] }) {
  const t = useTranslations('respond.keys')
  const [copied, setCopied] = useState<number | null>(null)
  if (keys.length === 0) return null
  const href = (k: string) => `/s/samtale#${k}`
  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

  return (
    <div className="mx-[22px] mb-[24px] rounded-card border border-line bg-sf px-[18px] py-[18px] text-left">
      <div className="text-[15px] font-bold">{t('title', { count: keys.length })}</div>
      <p className="mb-0 mt-[6px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">{t('lead')}</p>
      <div className="mt-[12px] flex flex-col gap-[8px]">
        {keys.map((k, i) => (
          <div key={k} className="flex flex-wrap items-center gap-[8px]">
            <a
              href={href(k)}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex h-[40px] items-center rounded-opt border border-ink bg-ink px-[16px] text-[13.5px] font-bold text-bg no-underline ${focus}`}
            >
              {t('open', { count: keys.length, n: i + 1 })}
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(new URL(href(k), window.location.origin).toString())
                setCopied(i)
              }}
              className={`h-[40px] cursor-pointer rounded-opt border border-line bg-transparent px-[14px] text-[13px] font-semibold text-ink ${focus}`}
            >
              {copied === i ? t('copied') : t('copy')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
