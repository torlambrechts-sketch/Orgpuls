import { FullLink } from '@/components/shell/FullLink'
import { BAND_BAR, RiskBadge, type Band } from '@/components/ui/Risk'
import type { AvansertView, FactorRowView } from '@/lib/innsikt/home'
import { TONE } from './Enkel'

/**
 * Innsikt, Avansert (Orgpuls.dc.html 249-330, D-244): where to spend the time. The index and its
 * bands, the factors placed by score and by how much they move with the whole (`results_importance`,
 * 0037), and every factor in a table grouped by risk, with the change from the year before and the
 * next step read from the measures. Importance needs enough answers; below that the map says so
 * and the column is left empty, never estimated.
 */

const SWATCH: Record<Band, string> = { lav: 'bg-mint', middels: 'bg-band', hoy: 'bg-peach2' }
const DOT: Record<Band, string> = { lav: 'bg-greenbar', middels: 'bg-amberbar', hoy: 'bg-rustbar' }
const NEXT: Record<FactorRowView['next']['kind'], string> = { measure: 'text-ink', suggest: 'text-link', keep: 'text-mut' }
const COLS = '[grid-template-columns:minmax(0,1.5fr)_minmax(0,1.1fr)_46px_54px_90px_78px_118px]'
const axis = 'text-[11px] font-bold uppercase tracking-[0.06em] text-mut'
const quadLabel = 'px-[12px] py-[10px] text-[11px] font-bold uppercase tracking-[0.06em]'
/** across the dumbbell: 20 to 90 (bundle 2995) */
const pos = (v: number) => `${(((Math.min(90, Math.max(20, v)) - 20) / 70) * 100).toFixed(1)}%`

export function Avansert({ view: v }: { view: AvansertView }) {
  return (
    <div className="flex flex-col gap-[18px] px-[16px] pb-[60px] pt-[18px] md:px-[28px]">
      <div className="flex flex-wrap items-end justify-between gap-x-[20px] gap-y-[16px]">
        <div>
          {v.kicker ? <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{v.kicker}</div> : null}
          <h1 className="m-0 mt-[6px] font-display text-[34px] font-semibold leading-[1.1]">{v.h1}</h1>
          <p className="m-0 mt-[8px] max-w-[620px] text-[14.5px] leading-[1.6] text-mut">{v.lead}</p>
        </div>
        {v.roundLabel ? (
          <span className="flex gap-[3px] rounded-cta bg-well p-[4px]">
            <span className="rounded-bar bg-sf px-[14px] py-[8px] text-[13px] font-bold shadow-[0_1px_2px_rgba(25,21,16,.12)]">{v.roundLabel}</span>
            {v.compare ? (
              <FullLink
                href={v.compare.href}
                className="rounded-bar px-[14px] py-[8px] text-[13px] font-semibold text-mut no-underline hover:text-ink hover:no-underline"
              >
                {v.compare.label}
              </FullLink>
            ) : null}
          </span>
        ) : null}
      </div>

      {v.empty ? (
        <p className="m-0 rounded-panel border border-line bg-sf px-[24px] py-[22px] text-[14px] text-mut">{v.empty}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-stretch gap-[18px]">
            {v.index ? (
              <div className="flex max-w-full flex-[1_1_300px] flex-col rounded-panel bg-ink p-[24px] text-bg">
                <div className="text-[11px] uppercase tracking-[0.11em] opacity-70">{v.index.label}</div>
                <div className="mt-[10px] flex items-end gap-[12px]">
                  <span className="font-display text-[66px] font-semibold leading-[.85]">{v.index.value}</span>
                  {v.index.delta ? (
                    <span
                      className={`pb-[6px] text-[14px] font-bold ${v.index.tone === 'good' ? 'text-mint' : v.index.tone === 'danger' ? 'text-peach2' : 'opacity-70'}`}
                    >
                      {v.index.delta}
                    </span>
                  ) : null}
                </div>
                <div className="mt-[22px] flex h-[26px] gap-[3px] overflow-hidden rounded-[8px]">
                  {v.bands.map((b) => (b.count > 0 ? <span key={b.key} className={`block ${SWATCH[b.key]}`} style={{ flex: b.count }} /> : null))}
                </div>
                <div className="mt-[12px] flex flex-col gap-[6px]">
                  {v.bands.map((b) => (
                    <span key={b.key} className="flex items-center gap-[8px] text-[12.5px]">
                      <span aria-hidden="true" className={`block h-[10px] w-[10px] rounded-[3px] ${SWATCH[b.key]}`} />
                      {b.label}
                    </span>
                  ))}
                </div>
                {v.rate || v.enps ? (
                  <div className="mt-auto grid grid-cols-2 gap-[12px] border-t border-[rgba(252,246,233,.18)] pt-[18px]">
                    {[v.rate, v.enps].map((x, i) =>
                      x ? (
                        <span key={i}>
                          <span className="block text-[11px] opacity-70">{x.label}</span>
                          <span className="mt-[2px] block text-[22px] font-bold">{x.value}</span>
                        </span>
                      ) : (
                        <span key={i} />
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="min-w-0 flex-[999_1_620px] overflow-x-auto rounded-panel border border-line bg-sf px-[24px] py-[22px]">
              {/* the labels are placed for a map about 700px wide: on a phone it scrolls, like the table */}
              <div className="grid min-w-[640px] gap-[8px] [grid-template-columns:22px_minmax(0,1fr)]">
                <span className={`rotate-180 text-center [writing-mode:vertical-rl] ${axis}`}>{v.quad.labels.y}</span>
                <div>
                  <div className="relative h-[380px] overflow-hidden rounded-cta">
                    <div className="absolute inset-0 grid [grid-template-columns:54.5%_45.5%] [grid-template-rows:50%_50%]">
                      <span className={`bg-qprio text-dangerdeep ${quadLabel}`}>{v.quad.labels.prioriter}</span>
                      <span className={`bg-qkeep text-right text-greendeep ${quadLabel}`}>{v.quad.labels.behold}</span>
                      <span className={`border-t border-dashed border-[rgba(25,21,16,.15)] bg-qwatch text-cautiondeep ${quadLabel}`}>
                        {v.quad.labels.folg}
                      </span>
                      <span className={`border-t border-dashed border-[rgba(25,21,16,.15)] bg-qok text-right text-mut ${quadLabel}`}>
                        {v.quad.labels.rute}
                      </span>
                    </div>
                    {v.quad.points.some((q) => Math.abs(q.ly - q.y) > 3) ? (
                      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {v.quad.points
                          .filter((q) => Math.abs(q.ly - q.y) > 3)
                          .map((q) => (
                            <line
                              key={q.key}
                              x1={q.x}
                              y1={q.y}
                              x2={q.x + (q.left ? -1.2 : 1.2)}
                              y2={q.ly}
                              stroke="#C4BCA8"
                              strokeWidth={1}
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                      </svg>
                    ) : null}
                    {v.quad.points.map((q) => (
                      <span key={q.key}>
                        <span
                          aria-hidden="true"
                          className="absolute -ml-[7px] -mt-[7px] block h-[14px] w-[14px] rounded-pill border-2 border-sf shadow-[0_1px_3px_rgba(25,21,16,.35)]"
                          style={{ left: `${q.x.toFixed(1)}%`, top: `${q.y.toFixed(1)}%`, background: BAND_BAR[q.band] }}
                        />
                        <span
                          className="absolute whitespace-nowrap text-[12px] font-bold"
                          style={{
                            left: `${q.x.toFixed(1)}%`,
                            top: `${q.ly.toFixed(1)}%`,
                            transform: q.left ? 'translate(calc(-100% - 14px),-50%)' : 'translate(14px,-50%)',
                          }}
                        >
                          {q.label} <span className="font-semibold text-mut">{q.index}</span>
                        </span>
                      </span>
                    ))}
                    {v.quad.empty ? (
                      <p className="absolute inset-x-[24px] top-1/2 m-0 -translate-y-1/2 rounded-tile bg-sf px-[18px] py-[14px] text-center text-[13px] leading-[1.55] text-body shadow-[0_1px_3px_rgba(25,21,16,.12)]">
                        {v.quad.empty}
                      </p>
                    ) : null}
                  </div>
                  <div className={`mt-[8px] flex justify-between ${axis}`}>
                    <span>{v.quad.labels.low}</span>
                    <span>{v.quad.labels.x}</span>
                    <span>{v.quad.labels.high}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-panel border border-line bg-sf">
            <div className="min-w-[780px]">
              <div className={`grid gap-[12px] bg-bg px-[24px] py-[13px] text-[10.5px] uppercase tracking-[0.09em] text-mut ${COLS}`}>
                <span>{v.table.head.factor}</span>
                <span>{v.table.head.change}</span>
                <span className="text-right">{v.table.head.index}</span>
                <span className="text-right">{v.table.head.delta}</span>
                <span>{v.table.head.importance}</span>
                <span>{v.table.head.risk}</span>
                <span>{v.table.head.next}</span>
              </div>
              {v.table.groups.map((g) => (
                <div key={g.key}>
                  <div className="flex items-baseline gap-[12px] border-t border-line px-[24px] pb-[8px] pt-[14px]">
                    <span aria-hidden="true" className={`block h-[10px] w-[10px] rounded-pill ${DOT[g.key]}`} />
                    <span className="text-[14px] font-bold">{g.title}</span>
                    <span className="text-[12.5px] text-mut">{g.note}</span>
                  </div>
                  {g.rows.map((r) => (
                    <Row key={r.key} row={r} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ row: r }: { row: FactorRowView }) {
  const a = r.prev === null ? r.index : Math.min(r.index, r.prev)
  const b = r.prev === null ? r.index : Math.max(r.index, r.prev)
  return (
    <div className={`grid items-center gap-[12px] px-[24px] py-[11px] ${COLS}`}>
      <span>
        <span className="block text-[14px] font-semibold">{r.label}</span>
        <span className="mt-[1px] block text-[11.5px] text-mut">{r.law}</span>
      </span>
      <span aria-hidden="true" className="relative block h-[18px]">
        <span className="absolute inset-x-0 top-[8px] block h-[2px] bg-well" />
        {r.prev !== null ? (
          <>
            <span
              className={`absolute top-[7px] block h-[4px] rounded-pill ${r.index < r.prev ? 'bg-rustbar' : 'bg-greenbar'}`}
              style={{ left: pos(a), width: `${(((b - a) / 70) * 100).toFixed(1)}%` }}
            />
            <span
              className="absolute top-[3px] -ml-[6px] block h-[12px] w-[12px] rounded-pill border-2 border-rule bg-sf"
              style={{ left: pos(r.prev) }}
            />
          </>
        ) : null}
        <span className="absolute top-[3px] -ml-[6px] block h-[12px] w-[12px] rounded-pill bg-ink" style={{ left: pos(r.index) }} />
      </span>
      <span className="text-right text-[17px] font-bold">{r.index}</span>
      <span className={`text-right text-[13px] font-bold ${TONE[r.tone]}`}>{r.delta ?? ''}</span>
      {r.importance !== null ? (
        <span className="block h-[7px] overflow-hidden rounded-pill bg-well">
          <span className="block h-full rounded-pill bg-ink" style={{ width: `${r.importance}%` }} />
        </span>
      ) : (
        <span />
      )}
      <span>
        <RiskBadge band={r.band} label={r.bandLabel} size="row" />
      </span>
      <FullLink
        href={r.next.href}
        className={`justify-self-start text-left text-[12.5px] font-semibold no-underline hover:no-underline ${NEXT[r.next.kind]}`}
      >
        {r.next.text} →
      </FullLink>
    </div>
  )
}
