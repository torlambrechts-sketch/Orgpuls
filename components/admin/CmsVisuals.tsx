import type { ReactNode } from 'react'
import type { Block } from '@/lib/marketing/blocks'
import type { Layout } from '@/lib/cms/content'
import type { SeoCheck } from '@/lib/cms/seo'
import { scoreTone } from '@/lib/cms/seo'

/**
 * The CMS's drawings (X-094): a miniature of each template's layout for the gallery, a small
 * picture of each kind of section for the palette, the search score, and the page as Google and
 * a shared link will show it. Drawn with the product's tokens; none of them holds a figure that
 * is not the page's own.
 */
const line = (w: string, extra = '') => <span className={`block h-[3px] flex-none rounded-full bg-rule ${extra}`} style={{ width: w }} />

/** A template's layout, drawn small: where the headline, the sign-up, the picture and the sections go */
export function LayoutThumb({ layout, className = '' }: { layout: Layout; className?: string }) {
  const frame = `flex aspect-[16/10] w-full flex-col gap-[5px] overflow-hidden rounded-ctl border border-line bg-bg p-[9px] ${className}`
  const pic = <span className="block h-full w-full rounded-[5px] border border-line bg-sf" />
  const cards = (
    <span className="grid grid-cols-3 gap-[4px]">
      {[0, 1, 2].map((i) => (
        <span key={i} className="flex h-[18px] flex-col gap-[3px] rounded-[4px] border border-line bg-sf p-[3px]">
          {line('70%', 'bg-ink/70')}
          {line('90%')}
        </span>
      ))}
    </span>
  )
  switch (layout) {
    case 'landing':
      return (
        <span className={frame} aria-hidden="true">
          {line('24%')}
          <span className="grid flex-none grid-cols-[1.1fr_1fr] gap-[8px]">
            <span className="flex flex-col gap-[4px]">
              <span className="block h-[5px] w-[36%] rounded-pill bg-sbg" />
              {line('92%', 'h-[5px] bg-ink')}
              {line('70%', 'h-[5px] bg-ink')}
              {line('84%')}
              <span className="mt-[2px] flex gap-[3px]">
                <span className="block h-[8px] w-[55%] rounded-[3px] border border-line bg-sf" />
                <span className="block h-[8px] w-[26%] rounded-[3px] bg-ac" />
              </span>
            </span>
            <span className="h-[38px]">{pic}</span>
          </span>
          {cards}
          {line('40%', 'bg-ink/70')}
          {line('88%')}
        </span>
      )
    case 'splash':
      return (
        <span className={`${frame} bg-sbg`} aria-hidden="true">
          <span className="grid flex-none grid-cols-[1fr_1.1fr] gap-[8px]">
            <span className="flex flex-col justify-center gap-[4px]">
              {line('96%', 'h-[6px] bg-ink')}
              {line('74%', 'h-[6px] bg-ink')}
              {line('88%')}
              <span className="mt-[2px] block h-[9px] w-[60%] rounded-[3px] bg-ac" />
            </span>
            <span className="h-[46px]">{pic}</span>
          </span>
          {cards}
          <span className="mt-auto flex h-[16px] items-center justify-center rounded-[4px] bg-ink">{line('40%', 'bg-bg/80')}</span>
        </span>
      )
    case 'document':
      return (
        <span className={frame} aria-hidden="true">
          {line('24%')}
          {line('60%', 'h-[6px] bg-ink')}
          {line('80%')}
          {line('34%', 'mt-[3px] bg-ink/70')}
          {line('96%')}
          {line('92%')}
          {line('70%')}
          {line('30%', 'mt-[3px] bg-ink/70')}
          {line('94%')}
          {line('60%')}
        </span>
      )
    case 'article':
      return (
        <span className={`${frame} items-center`} aria-hidden="true">
          <span className="flex w-[70%] flex-col gap-[4px]">
            <span className="block h-[5px] w-[26%] rounded-pill bg-sbg" />
            {line('96%', 'h-[5px] bg-ink')}
            {line('66%', 'h-[5px] bg-ink')}
            {line('90%')}
            {line('40%', 'mt-[2px] bg-ink/70')}
            {line('96%')}
            {line('88%')}
            <span className="flex h-[14px] flex-col justify-center gap-[3px] rounded-[4px] bg-sbg px-[4px]">
              {line('50%', 'bg-ink/70')}
              {line('80%')}
            </span>
            {line('92%')}
          </span>
        </span>
      )
  }
}

/** A section kind, drawn small for the palette */
export function BlockThumb({ t }: { t: Block['t'] }) {
  const frame = 'flex h-[34px] w-[48px] flex-none justify-center gap-[3px] overflow-hidden rounded-[7px] border border-line p-[5px]'
  const col = `${frame} flex-col bg-sf`
  switch (t) {
    case 'h2':
      return <span className={col}>{line('80%', 'h-[5px] bg-ink')}{line('60%')}</span>
    case 'h3':
      return <span className={col}>{line('60%', 'h-[4px] bg-ink/80')}{line('80%')}</span>
    case 'p':
      return <span className={col}>{line('95%')}{line('88%')}{line('70%')}</span>
    case 'ul':
    case 'ol':
      return (
        <span className={col}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-[3px]">
              <span className={`block h-[4px] w-[4px] flex-none ${t === 'ol' ? 'rounded-[1px] bg-ink' : 'rounded-full bg-ink/70'}`} />
              {line(`${80 - i * 12}%`)}
            </span>
          ))}
        </span>
      )
    case 'quote':
      return (
        <span className={`${frame} flex-row items-stretch bg-sf`}>
          <span className="block w-[3px] flex-none rounded-full bg-ac" />
          <span className="flex flex-1 flex-col justify-center gap-[3px]">{line('90%')}{line('60%', 'bg-ink/60')}</span>
        </span>
      )
    case 'law':
      return (
        <span className={col}>
          {[0, 1].map((i) => (
            <span key={i} className="flex items-center gap-[3px]">
              <span className="block h-[4px] w-[9px] flex-none rounded-[1px] bg-ink" />
              {line('70%')}
            </span>
          ))}
        </span>
      )
    case 'box':
      return <span className={`${frame} flex-col bg-sbg`}>{line('60%', 'bg-ink/70')}{line('90%', 'bg-bg')}{line('70%', 'bg-bg')}</span>
    case 'cards':
      return (
        <span className={`${frame} flex-row items-center bg-sf`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-[18px] flex-1 rounded-[3px] border border-line bg-bg" />
          ))}
        </span>
      )
    case 'table':
      return (
        <span className={`${frame} flex-col bg-sf`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`grid grid-cols-3 gap-[2px] ${i === 0 ? '' : 'opacity-70'}`}>
              {[0, 1, 2].map((j) => (
                <span key={j} className={`block h-[4px] rounded-[1px] ${i === 0 ? 'bg-ink/80' : 'bg-rule'}`} />
              ))}
            </span>
          ))}
        </span>
      )
    case 'links':
      return (
        <span className={`${frame} flex-row items-center bg-sf`}>
          {[0, 1].map((i) => (
            <span key={i} className="flex h-[18px] flex-1 flex-col justify-end rounded-[3px] border border-line bg-bg p-[2px]">
              <span className="block h-[3px] w-[60%] rounded-full bg-link" />
            </span>
          ))}
        </span>
      )
    case 'plans':
      return (
        <span className={`${frame} flex-row items-end bg-sf`}>
          {[12, 18, 14].map((h, i) => (
            <span key={i} className={`block flex-1 rounded-[2px] ${i === 1 ? 'bg-ac' : 'bg-track'}`} style={{ height: h }} />
          ))}
        </span>
      )
    case 'image':
      return (
        <span className={`${frame} items-end bg-sf`}>
          <span className="relative block h-[20px] w-full overflow-hidden rounded-[3px] bg-sbg">
            <span className="absolute bottom-0 left-[2px] block h-0 w-0 border-x-[7px] border-b-[10px] border-x-transparent border-b-ink/50" />
            <span className="absolute bottom-0 left-[12px] block h-0 w-0 border-x-[9px] border-b-[14px] border-x-transparent border-b-ink/70" />
            <span className="absolute right-[4px] top-[3px] block h-[5px] w-[5px] rounded-pill bg-ac" />
          </span>
        </span>
      )
    case 'shot':
      return (
        <span className={`${frame} items-center bg-sf`}>
          <span className="flex h-[20px] w-[34px] flex-col gap-[2px] rounded-[3px] border border-ink/60 bg-bg p-[2px]">
            <span className="block h-[2px] w-[40%] rounded-full bg-ink/60" />
            <span className="grid flex-1 grid-cols-3 gap-[1px]">
              <span className="bg-mint" />
              <span className="bg-sbg" />
              <span className="bg-peach" />
            </span>
          </span>
        </span>
      )
  }
}

const RING = { green: 'text-greenbar', yellow: 'text-amberbar', red: 'text-rustbar' } as const

/** The score in a ring: its colour is the tone, its number the score */
export function ScoreRing({ score, size = 76, label }: { score: number; size?: number; label: string }) {
  const r = 15.5
  const c = 2 * Math.PI * r
  const tone = scoreTone(score)
  return (
    <span className="relative inline-flex flex-none items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${score}/100`}>
      <svg viewBox="0 0 36 36" width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.4" className="stroke-track" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.4" strokeLinecap="round" stroke="currentColor" className={RING[tone]} strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className="absolute font-display font-semibold leading-none" style={{ fontSize: size * 0.3 }} aria-hidden="true">
        {score}
      </span>
    </span>
  )
}

const PILL = { green: 'bg-mint text-greendeep', yellow: 'bg-sbg text-cautiondeep', red: 'bg-peach text-dangerdeep' } as const
/** The score as a pill, for a row in a table */
export function ScorePill({ score, label }: { score: number; label: string }) {
  return (
    <span className={`inline-flex min-w-[42px] justify-center rounded-pill px-[9px] py-[3px] text-[11.5px] font-bold ${PILL[scoreTone(score)]}`} title={label}>
      <span className="sr-only">{label}: </span>
      {score}
    </span>
  )
}

const MARK = { good: 'bg-greenbar', warn: 'bg-amberbar', bad: 'bg-rustbar' } as const
/** Each check with its verdict, the ones to fix first */
export function SeoChecklist({ checks, text }: { checks: SeoCheck[]; text: (c: SeoCheck) => string }) {
  const order = { bad: 0, warn: 1, good: 2 } as const
  const sorted = [...checks].sort((a, b) => order[a.level] - order[b.level])
  return (
    <ul className="m-0 flex list-none flex-col gap-[7px] p-0">
      {sorted.map((c) => (
        <li key={c.id} className="flex items-start gap-[9px] text-[13px] leading-[1.45]">
          <span className={`mt-[5px] block h-[9px] w-[9px] flex-none rounded-full ${MARK[c.level]}`} aria-hidden="true" />
          <span className={c.level === 'good' ? 'text-mut' : 'text-ink'}>{text(c)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Cuts a text where Google would, on a word, with an ellipsis */
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n) > n * 0.6 ? s.lastIndexOf(' ', n) : n).trimEnd()} …`)

/** The page as a Google result: the address as a trail, the title, the description */
export function SerpPreview({ host, path, title, description, empty }: { host: string; path: string; title: string; description: string; empty: string }) {
  const trail = [host, ...path.split('/').filter(Boolean)].join(' › ')
  return (
    <div className="rounded-ctl border border-line bg-sf px-[16px] py-[14px]">
      <div className="flex items-center gap-[9px]">
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-line bg-bg">
          <span className="block h-[10px] w-[10px] rounded-full bg-ac" />
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] leading-[1.3] text-ink">Orgpuls</span>
          <span className="block truncate text-[11.5px] leading-[1.3] text-mut">{trail}</span>
        </span>
      </div>
      <p className="mb-0 mt-[7px] text-[17px] leading-[1.3] text-link">{title ? cut(title, 60) : empty}</p>
      <p className="mb-0 mt-[4px] text-[13px] leading-[1.5] text-body">{description ? cut(description, 160) : empty}</p>
    </div>
  )
}

/** The page as a shared link: the site's card, the title, the description */
export function SocialCard({ host, title, description, image }: { host: string; title: string; description: string; image: string }) {
  return (
    <div className="overflow-hidden rounded-ctl border border-line bg-sf">
      {/* eslint-disable-next-line @next/next/no-img-element -- the site's own card, drawn at its size */}
      <img src={image} alt="" width={1200} height={630} className="block aspect-[1200/630] h-auto w-full border-b border-line object-cover" />
      <div className="px-[14px] py-[10px]">
        <span className="block text-[11px] uppercase tracking-[0.06em] text-mut">{host}</span>
        <span className="mt-[3px] block truncate text-[14px] font-bold">{title}</span>
        <span className="mt-[2px] block text-[12.5px] leading-[1.45] text-mut [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">{description}</span>
      </div>
    </div>
  )
}

const CHIP = {
  live: 'bg-mint text-greendeep',
  changed: 'bg-sbg text-cautiondeep',
  scheduled: 'bg-pulse text-greendeep',
  draft: 'bg-track text-mut',
  archived: 'bg-track text-mut',
} as const
/** A language and its state, as one chip: NO · Live */
export function StateChip({ lang, state, label }: { lang: string; state: keyof typeof CHIP; label: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-pill px-[8px] py-[2px] text-[11px] font-bold ${CHIP[state]}`}>
      <span className="uppercase">{lang}</span>
      <span aria-hidden="true">·</span>
      {label}
    </span>
  )
}
