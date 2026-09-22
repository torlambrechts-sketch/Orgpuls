'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * The searchable index. Bundle lines 1077-1108.
 *
 * Search is client-side over the articles the server already resolved, because there are
 * nineteen of them and a round trip per keystroke would be slower and noisier than the
 * work it saves. The server decided *which* articles exist for this organisation — law
 * mode filters three of them — so filtering here can only narrow that, never widen it.
 *
 * The count is the one string that changes as you type, so this component reads it from
 * the catalogue directly rather than taking a formatter it cannot be given across the
 * server boundary.
 */
export interface ArticleCard {
  key: string
  category: string
  categoryLabel: string
  title: string
  lead: string
  read: number
}

export function ArticleList({
  articles,
  categories,
  labels,
}: {
  articles: ArticleCard[]
  categories: { key: string; label: string }[]
  labels: {
    heading: string
    placeholder: string
    searchLabel: string
    all: string
    emptyTitle: string
    emptyLead: string
  }
}) {
  const t = useTranslations('hjelp')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('alle')

  const hits = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('no')
    return articles.filter((a) => {
      if (category !== 'alle' && a.category !== category) return false
      if (q === '') return true
      return `${a.title} ${a.lead} ${a.categoryLabel}`.toLocaleLowerCase('no').includes(q)
    })
  }, [articles, category, query])

  const chips = [{ key: 'alle', label: labels.all }, ...categories]

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-[14px]">
        <h2 className="m-0 font-display text-[21px] font-semibold">{labels.heading}</h2>
        <span className="text-[12px] text-mut">{t('hitCount', { count: hits.length })}</span>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={labels.searchLabel}
        placeholder={labels.placeholder}
        className="mt-[14px] box-border h-[44px] w-full rounded-cta border border-line bg-bg px-[15px] text-[14px] text-ink outline-none"
      />

      <div className="mt-[12px] flex flex-wrap gap-[7px]">
        {chips.map((c) => {
          const on = c.key === category
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              aria-pressed={on}
              className={`inline-flex h-[32px] flex-none cursor-pointer items-center rounded-pill border px-[13px] text-[12px] font-semibold ${
                on ? 'border-ink bg-ink text-bg' : 'border-line bg-transparent text-ink'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {hits.length === 0 ? (
        <div className="mt-[18px] rounded-opt border border-dashed border-rule px-[24px] py-[30px] text-center">
          <div className="text-[14.5px] font-semibold">{labels.emptyTitle}</div>
          <div className="mt-[5px] text-[13px] text-mut">{labels.emptyLead}</div>
        </div>
      ) : null}

      <div className="mt-[16px] flex flex-col gap-[9px]">
        {hits.map((a) => (
          <Link
            key={a.key}
            href={{ pathname: `/hjelp/${a.key}` }}
            className="block rounded-tile border border-line bg-bg px-[17px] py-[15px] text-ink no-underline hover:text-ink hover:no-underline"
          >
            <span className="flex flex-wrap items-baseline justify-between gap-[12px]">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-mut">
                {a.categoryLabel}
              </span>
              <span className="text-[11.5px] text-mut">{t('readMinutes', { count: a.read })}</span>
            </span>
            <span className="mt-[6px] block text-[15px] font-semibold [text-wrap:pretty]">
              {a.title}
            </span>
            <span className="mt-[4px] block text-[13px] leading-[1.5] text-mut [text-wrap:pretty]">
              {a.lead}
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}
