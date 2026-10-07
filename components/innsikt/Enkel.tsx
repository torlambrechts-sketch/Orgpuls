import { FullLink } from '@/components/shell/FullLink'
import type { Dot, EnkelView, Tone, WheelPoint } from '@/lib/innsikt/home'

/**
 * Innsikt, Enkel (Orgpuls.dc.html 144-248, D-244): where the organisation stands, what happened
 * since last time, what waits, what goes well, where to improve, and the year. The figures are the
 * reader's (lib/innsikt/home.ts); a block with nothing behind it renders its empty line or nothing.
 */

export const TONE: Record<Tone, string> = { danger: 'text-danger', good: 'text-link', muted: 'text-mut' }
const DOT: Record<Dot | 'grey', string> = { red: 'bg-rustbar', yellow: 'bg-ac', green: 'bg-greenbar', grey: 'bg-rule' }
const COLS: Record<number, string> = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5' }

const card = 'rounded-panel border border-line bg-sf px-[24px] py-[22px]'
const h2 = 'm-0 font-display text-[21px] font-semibold'
const kicker = 'text-[11px] uppercase tracking-[0.11em] text-mut'
const plain = 'text-ink no-underline hover:text-ink hover:no-underline'

export function Enkel({ view: v }: { view: EnkelView }) {
  return (
    <div className="flex flex-col gap-[18px] px-[16px] pb-[60px] pt-[18px] md:px-[28px]">
      <div className="flex flex-wrap items-end justify-between gap-x-[20px] gap-y-[16px]">
        <div>
          <div className={kicker}>{v.kicker}</div>
          <h1 className="m-0 mt-[6px] font-display text-[34px] font-semibold leading-[1.1]">{v.greeting}</h1>
          <p className="m-0 mt-[8px] max-w-[560px] text-[14.5px] leading-[1.6] text-mut">{v.lead}</p>
        </div>
        <span className="flex gap-[9px]">
          <FullLink
            href="/rapport"
            className={`inline-flex h-[42px] items-center rounded-btn border border-line bg-transparent px-[18px] text-[14px] font-semibold ${plain}`}
          >
            {v.reportCta}
          </FullLink>
          {v.hasResult ? (
            <FullLink
              href="/resultater"
              className={`inline-flex h-[42px] items-center rounded-btn border border-ink bg-ac px-[18px] text-[14px] font-bold ${plain}`}
            >
              {v.resultCta}
            </FullLink>
          ) : null}
        </span>
      </div>

      {v.kpis.length > 0 ? (
        <div className={`grid grid-cols-2 gap-[12px] ${COLS[v.kpis.length] ?? 'md:grid-cols-5'}`}>
          {v.kpis.map((k) => (
            <div key={k.key} className="rounded-note border border-line bg-sf px-[20px] py-[18px]">
              <div className="text-[11px] uppercase tracking-[0.1em] text-mut">{k.label}</div>
              <div className="mt-[10px] text-[clamp(26px,2.6vw,36px)] font-bold leading-none tracking-[-0.03em]">{k.value}</div>
              <div className={`mt-[8px] text-[12.5px] font-semibold ${TONE[k.tone]}`}>{k.sub}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]">
        <section className={card}>
          <div className="flex items-baseline justify-between gap-[12px]">
            <h2 className={h2}>{v.feedTitle}</h2>
            {v.lastSeen ? <span className="text-[12.5px] text-mut">{v.lastSeen}</span> : null}
          </div>
          <div className="mt-[12px] flex flex-col">
            {v.feed.length === 0 ? (
              <p className="m-0 border-t border-well py-[12px] text-[13px] text-mut">{v.feedEmpty}</p>
            ) : (
              v.feed.map((e) => (
                <div
                  key={e.key}
                  className="grid items-baseline gap-[12px] border-t border-well py-[12px] [grid-template-columns:58px_14px_minmax(0,1fr)]"
                >
                  <span className="text-[12px] font-bold text-mut">{e.date}</span>
                  <span aria-hidden="true" className={`block h-[9px] w-[9px] rounded-pill ${DOT[e.dot]}`} />
                  <span>
                    <span className="block text-[14px] font-semibold">{e.title}</span>
                    {e.meta ? <span className="mt-[2px] block text-[12.5px] text-mut">{e.meta}</span> : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={card}>
          <h2 className={h2}>{v.todoTitle}</h2>
          <div className="mt-[14px] flex flex-col gap-[10px]">
            {v.todos.length === 0 ? (
              <p className="m-0 text-[13px] text-mut">{v.todoEmpty}</p>
            ) : (
              v.todos.map((t) => (
                <div key={t.key} className="flex gap-[12px] rounded-tile border border-line bg-bg p-[14px]">
                  <span aria-hidden="true" className={`block w-[5px] flex-none rounded-pill ${DOT[t.tone]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{t.title}</span>
                    <span className="mt-[2px] block text-[12.5px] text-mut">{t.meta}</span>
                  </span>
                  <FullLink
                    href={t.href}
                    className={`inline-flex h-[32px] flex-none items-center self-center rounded-bar border border-ink px-[13px] text-[12px] font-bold ${
                      t.primary ? 'bg-ac' : 'bg-transparent'
                    } ${plain}`}
                  >
                    {t.cta}
                  </FullLink>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {v.strengths.length > 0 || v.improve.length > 0 ? (
        <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]">
          {v.strengths.length > 0 ? (
            <section className={card}>
              <div className="flex items-center gap-[9px]">
                <span aria-hidden="true" className="block h-[10px] w-[10px] rounded-pill bg-greenbar" />
                <h2 className={h2}>{v.strengthsTitle}</h2>
              </div>
              <div className="mt-[14px] flex flex-col gap-[8px]">
                {v.strengths.map((s) => (
                  <div key={s.key} className="flex items-center gap-[14px] rounded-cta bg-mintwash px-[14px] py-[12px]">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{s.label}</span>
                      {s.why ? <span className="mt-[2px] block text-[12.5px] text-body">{s.why}</span> : null}
                    </span>
                    <span className="text-[22px] font-bold">{s.index}</span>
                    <span className={`w-[44px] text-right text-[12.5px] font-bold ${TONE[s.tone]}`}>{s.delta ?? ''}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {v.improve.length > 0 ? (
            <section className={card}>
              <div className="flex items-center gap-[9px]">
                <span aria-hidden="true" className="block h-[10px] w-[10px] rounded-pill bg-ac" />
                <h2 className={h2}>{v.improveTitle}</h2>
              </div>
              <div className="mt-[14px] flex flex-col gap-[8px]">
                {v.improve.map((s) => (
                  <FullLink
                    key={s.key}
                    href="/tiltak"
                    className={`flex w-full items-center gap-[14px] rounded-cta bg-butter px-[14px] py-[12px] text-left ${plain}`}
                  >
                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-ink text-[12px] font-bold text-bg">
                      {s.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{s.title}</span>
                      <span className="mt-[2px] block text-[12.5px] text-body">{s.meta}</span>
                    </span>
                  </FullLink>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {v.wheel.length > 0 || v.laws.length > 0 ? (
        <div className="grid items-center gap-x-[28px] gap-y-[20px] rounded-panel border border-line bg-sf px-[24px] py-[20px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]">
          {v.wheel.length > 0 ? (
            <div>
              <div className={kicker}>{v.wheelTitle}</div>
              <div className="mt-[14px] flex">
                {v.wheel.map((w) => (
                  <WheelDot key={w.key} point={w} />
                ))}
              </div>
            </div>
          ) : null}
          {v.lawTitle && v.laws.length > 0 ? (
            <div>
              <div className={kicker}>{v.lawTitle}</div>
              <div className="mt-[12px] flex flex-wrap gap-[7px]">
                {v.laws.map((l) => (
                  <span
                    key={l.key}
                    className={`rounded-pill px-[11px] py-[6px] text-[12px] font-bold ${l.done ? 'bg-mint text-greendeep' : 'bg-sbg text-cautiondeep'}`}
                  >
                    {l.text}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const WHEEL = {
  done: 'h-[14px] w-[14px] border-link bg-link',
  current: 'h-[20px] w-[20px] border-ink bg-ac',
  pending: 'h-[14px] w-[14px] border-rule bg-sf',
}

function WheelDot({ point: w }: { point: WheelPoint }) {
  return (
    <span className="min-w-0 flex-1 text-center">
      <span aria-hidden="true" className={`mx-auto block rounded-pill border-2 ${WHEEL[w.state]}`} />
      <span className={`mt-[7px] block text-[11px] font-bold ${w.state === 'current' ? 'text-ink' : 'text-mut'}`}>{w.month}</span>
      <span className="mt-[1px] block text-[12px] font-semibold">{w.label}</span>
    </span>
  )
}
