import type { Route } from 'next'
import Link from 'next/link'
import { Points, SectionHead } from './parts'

/**
 * The sections Hvorfor and Bruksområder are made of (D-88; Hvorfor.dc.html and
 * Bruksomrader.dc.html, the `sections` loop): the words on one side, a drawing of the product
 * on the other, alternating. The two pages share the markup, value for value.
 *
 * A drawing is one of six kinds. Its numbers and tones are code (the page's own table);
 * its words are messages. Every drawing is an illustration labelled by its own title, as the
 * design draws it: nobody's data.
 */

/** The heatmap's tone for an index, and the ink it is read in (the design's TONE and TFG). */
const tone = (v: number) => (v < 40 ? '#E38258' : v < 50 ? '#EC9B77' : v < 62 ? '#F5DC96' : v < 72 ? '#CFE7E4' : '#B5DAD4')
const toneInk = (v: number) => (v < 40 ? '#4A1706' : v < 50 ? '#5E1F09' : v < 62 ? '#5C4600' : '#20431C')

export type MockShape =
  | { kind: 'bars'; values: number[] }
  | { kind: 'heat'; rows: (number[] | null)[]; marks?: (number | undefined)[] }
  | { kind: 'wheel'; base: number; pulses: number[] }
  | { kind: 'steps'; states: ('done' | 'now' | '')[] }
  | { kind: 'cards'; tones: ('neg' | 'pos' | 'neu')[]; late?: boolean[] }
  | { kind: 'trend'; values: number[]; goal: number }

export type MockWords = {
  title: string
  note: string
  foot?: string
  rows?: string[]
  cols?: string[]
  teams?: string[]
  steps?: { t: string; d: string }[]
  cards?: { tag: string; t: string; meta: string }[]
  labels?: string[]
}

export type WheelWords = { months: string[]; base: string; pulse: string; holiday: string }

export function Overview({ items }: { items: { id: string; k: string; t: string }[] }) {
  return (
    <div className="mt-[36px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(min(245px,100%),1fr))]">
      {items.map((o, i) => (
        <a
          key={o.id}
          href={`#${o.id}`}
          className="flex flex-col gap-[6px] rounded-note border border-line bg-sf px-[20px] py-[18px] text-ink no-underline hover:text-ink hover:no-underline"
        >
          <span className="flex items-center gap-[9px]">
            <span
              className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-bar text-[12px] font-bold"
              style={{ background: ['#FBEBBE', '#CFE7E4', '#F2EAD6', '#FBD5C4'][i % 4] }}
            >
              {i + 1}
            </span>
            <span className="text-[11px] uppercase tracking-[0.1em] text-mut">{o.k}</span>
          </span>
          <span className="text-[15px] font-bold leading-[1.35] [text-wrap:pretty]">{o.t}</span>
        </a>
      ))}
    </div>
  )
}

export function StorySection({
  id,
  index,
  k,
  t,
  d,
  points,
  usesLabel,
  uses,
  source,
  shape,
  words,
  wheel,
}: {
  id: string
  index: number
  k: string
  t: string
  d: string
  points: string[]
  usesLabel: string
  uses: { href: string; label: string }[]
  source?: string
  shape: MockShape
  words: MockWords
  wheel: WheelWords
}) {
  const flip = index % 2 === 1
  return (
    <section
      id={id}
      className="mx-auto grid max-w-[1120px] scroll-mt-[118px] items-center gap-[36px] px-[26px] pt-[56px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]"
    >
      <div className={flip ? 'order-2' : 'order-1'}>
        <SectionHead k={k} t={t} d={d} pMax="max-w-[52ch]" />
        <Points items={points} />
        <div className="mt-[18px] flex flex-wrap items-center gap-[6px]">
          <span className="mr-[4px] text-[11px] uppercase tracking-[0.09em] text-mut">{usesLabel}</span>
          {uses.map((u) => (
            <Link
              key={u.href}
              href={u.href as Route}
              className="rounded-pill border border-line bg-sf px-[12px] py-[6px] text-[12.5px] font-semibold text-ink hover:text-ink"
            >
              {u.label} →
            </Link>
          ))}
        </div>
        {source ? (
          <span className="mt-[12px] inline-block rounded-pill bg-track px-[11px] py-[5px] text-[11.5px] font-semibold text-mut">
            {source}
          </span>
        ) : null}
      </div>
      <div className={`min-w-0 ${flip ? 'order-1' : 'order-2'}`}>
        <div className="rounded-card border border-line bg-sf px-[24px] py-[22px] shadow-[0_18px_40px_-32px_rgba(25,21,16,.4)]">
          <span className="flex flex-wrap items-baseline justify-between gap-[10px]">
            <span className="text-[15px] font-bold">{words.title}</span>
            <span className="text-[12px] text-mut">{words.note}</span>
          </span>
          <Mock shape={shape} words={words} wheel={wheel} />
          {words.foot ? (
            <div className="mt-[16px] rounded-cta bg-sbg px-[14px] py-[12px] text-[12.5px] leading-[1.55] [text-wrap:pretty]">
              {words.foot}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function Mock({ shape, words, wheel }: { shape: MockShape; words: MockWords; wheel: WheelWords }) {
  switch (shape.kind) {
    case 'bars':
      return (
        <div className="mt-[16px] flex flex-col gap-[10px]">
          {shape.values.map((v, i) => (
            <span key={i} className="grid items-center gap-[10px] text-[12.5px] [grid-template-columns:130px_minmax(0,1fr)_34px]">
              <span className="leading-[1.3] text-body">{words.rows?.[i]}</span>
              <span className="h-[10px] overflow-hidden rounded-pill bg-[rgba(25,21,16,.07)]">
                <span className="block h-full rounded-pill" style={{ width: `${v}%`, background: tone(v) }} />
              </span>
              <span className="text-right font-bold">{v}</span>
            </span>
          ))}
        </div>
      )
    case 'heat':
      return (
        <div className="mt-[16px] grid gap-[4px] text-[11px] [grid-template-columns:96px_repeat(5,minmax(0,1fr))]">
          <span />
          {(words.cols ?? []).map((c) => (
            <span key={c} className="text-center leading-[1.2] text-mut">
              {c}
            </span>
          ))}
          {shape.rows.map((cells, r) => (
            <HeatRow key={r} team={words.teams?.[r] ?? ''} cells={cells} mark={shape.marks?.[r]} />
          ))}
        </div>
      )
    case 'wheel':
      return (
        <div className="mt-[16px] grid gap-[4px] [grid-template-columns:repeat(12,minmax(0,1fr))]">
          {wheel.months.map((m, i) => {
            const base = shape.base === i
            const pulse = shape.pulses.includes(i)
            return (
              <span key={m} className="text-center">
                <span className="block text-[10px] font-bold text-mut">{m}</span>
                <span
                  className="mx-auto mt-[7px] block h-[20px] w-[20px] rounded-pill border-2"
                  style={{
                    background: base ? '#F5C64A' : pulse ? '#A8D5D2' : '#FFFDF6',
                    borderColor: base ? '#191510' : pulse ? '#2F5D2A' : '#E8DFC9',
                  }}
                />
                <span
                  className={`mt-[5px] block min-h-[12px] text-[9.5px] font-semibold ${base || pulse ? 'text-ink' : 'text-faint'}`}
                >
                  {base ? wheel.base : pulse ? wheel.pulse : i === 6 ? wheel.holiday : ''}
                </span>
              </span>
            )
          })}
        </div>
      )
    case 'steps':
      return (
        <div className="mt-[14px] flex flex-col gap-0">
          {shape.states.map((st, i) => (
            <span key={i} className="flex gap-[12px] border-t border-line py-[10px]">
              <span
                className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill border border-ink text-[11.5px] font-bold"
                style={{
                  background: st === 'done' ? '#2F5D2A' : st === 'now' ? '#F5C64A' : '#FFFDF6',
                  color: st === 'done' ? '#FCF6E9' : '#191510',
                }}
              >
                {st === 'done' ? '✓' : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-bold">{words.steps?.[i]?.t}</span>
                <span className="mt-[2px] block text-[12px] leading-[1.45] text-mut [text-wrap:pretty]">
                  {words.steps?.[i]?.d}
                </span>
              </span>
            </span>
          ))}
        </div>
      )
    case 'cards':
      return (
        <div className="mt-[14px] flex flex-col gap-[8px]">
          {shape.tones.map((tn, i) => {
            const c = words.cards?.[i]
            return (
              <span key={i} className="block rounded-cta border border-line bg-bg px-[14px] py-[12px]">
                <span className="flex flex-wrap items-center gap-[8px]">
                  <span
                    className="rounded-pill px-[9px] py-[2px] text-[10.5px] font-bold"
                    style={{
                      background: tn === 'neg' ? '#FBD5C4' : tn === 'pos' ? '#CFE7E4' : '#FBEBBE',
                      color: tn === 'neg' ? '#6B240C' : tn === 'pos' ? '#20431C' : '#5C4600',
                    }}
                  >
                    {c?.tag}
                  </span>
                  <span className={`ml-auto text-[11px] font-semibold ${shape.late?.[i] ? 'text-danger' : 'text-mut'}`}>
                    {c?.meta}
                  </span>
                </span>
                <span className="mt-[7px] block text-[13px] font-semibold leading-[1.5] [text-wrap:pretty]">{c?.t}</span>
              </span>
            )
          })}
        </div>
      )
    case 'trend': {
      const n = shape.values.length
      const x = (i: number) => Math.round(10 + i * (280 / (n - 1)))
      const y = (v: number) => Math.round(100 - (v - 20) * 1.2)
      const last = shape.values[n - 1] ?? 0
      return (
        <>
          <svg viewBox="0 0 300 110" width="100%" height="130" className="mt-[14px] block" aria-hidden="true">
            <line
              x1="0"
              y1={y(shape.goal)}
              x2="300"
              y2={y(shape.goal)}
              stroke="#2F5D2A"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
            <polyline
              points={shape.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none"
              stroke="#191510"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={x(n - 1)} cy={y(last)} r="6" fill="#F5C64A" stroke="#191510" strokeWidth="1.5" />
          </svg>
          <div className="mt-[4px] grid gap-[4px]" style={{ gridTemplateColumns: `repeat(${n},minmax(0,1fr))` }}>
            {shape.values.map((v, i) => (
              <span key={i} className="text-center text-[10.5px] leading-[1.3] text-mut">
                <strong className="block text-[12.5px] text-ink">{v}</strong>
                {words.labels?.[i]}
              </span>
            ))}
          </div>
        </>
      )
    }
  }
}

function HeatRow({ team, cells, mark }: { team: string; cells: number[] | null; mark?: number }) {
  return (
    <>
      <span className="flex items-center text-[12px] font-semibold">{team}</span>
      {cells
        ? cells.map((v, i) => (
            <span
              key={i}
              className="rounded-[7px] py-[11px] text-center font-bold"
              style={{
                background: tone(v),
                color: toneInk(v),
                outline: mark === i ? '2px solid #191510' : 'none',
                outlineOffset: -2,
              }}
            >
              {v}
            </span>
          ))
        : [0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="rounded-[7px] bg-[rgba(25,21,16,.05)] py-[11px] text-center font-bold text-faint">
              —
            </span>
          ))}
    </>
  )
}
