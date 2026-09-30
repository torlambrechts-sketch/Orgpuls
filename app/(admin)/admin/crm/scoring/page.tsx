import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { BTN, PageHead, Problem } from '@/components/admin/ui'
import { isError } from '@/lib/admin/api'
import { DOT_CLASS, type DotTone } from '@/lib/admin/dots'
import { leadScores, type Scored } from '@/lib/admin/growthCrm'
import { fmt, initials, strongestSignals } from '@/lib/admin/growthCrmView'

const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'
/** the route chip's dot, as the design's `rdot`: a founder task or a PQL teal, a trial yellow, nurture the line */
const routeTone = (s: Scored): DotTone => (s.route === 'founder' || s.route === 'pql' ? 'teal' : s.route === 'trial' ? 'yellow' : 'line')

/**
 * Lead scoring (design revision 3, `isScoring`; 0143, D-184): fit × intent, 0–100, for the contacts of
 * the companies in a working stage (a lead, or a trial).
 *
 *   fit     0–50 from Brønnøysund (report § 7.3), known before anyone signs up: the company's
 *           industry and size, a threshold crossed or a new general manager (the trigger engine),
 *           and whether it is active
 *   intent  0–50 from first-party signals after consent or signup. Of the design's six only the
 *           hand-raise has a source today (a demo request, or a sales question from the contact
 *           form); the others are named «no source yet» and score nothing, never a guess
 *   route   60 or more, or a hand-raise → a founder task on the one-hour SLA (app.lead_route makes
 *           it); a trial follows the PQL rule; the rest is nurture
 *
 * It replaces the points model this page read before (the account health score, 0060), which is
 * untouched and still read by /admin/health. The weights are the database's (app.fit_score,
 * app.lead_score); the rules panel lists them as the database applies them.
 */
export default async function LeadScoring() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const s = (k: string, v?: Record<string, string | number>) => t(`crm.scoring.${k}`, v)
  const data = await leadScores()
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const rows = data.rows
  const hot = rows.filter((r) => r.route === 'founder').length
  const nurture = rows.filter((r) => r.route === 'nurture').length
  const trial = rows.filter((r) => r.stage === 'trial').length
  // the rules as the database scores them (app.fit_score, app.intent_score)
  const fitPoints = data.fit_rules
  const intentPoints = data.intent_rules
  const unsourced = intentPoints.filter((p) => !p.sourced)
  const reachable = intentPoints.filter((p) => p.sourced).reduce((n, p) => n + p.points, 0)
  const why = (r: Scored) => {
    const top = strongestSignals(r.fit_parts, r.intent_parts)
    if (!top.keys.length) return s('fitOnly')
    return [...top.keys.map((k) => s(`short.${k}`)), ...(top.more > 0 ? [s('more', { n: top.more })] : [])].join(' · ')
  }

  return (
    <div className="leading-[1.5]">
      <PageHead title={s('title')} lead={s('lead', { hot, nurture, trial })} measure={false} />
      <div className="grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <section className="min-w-0 overflow-x-auto rounded-panel border border-line bg-sf">
          <div role="table" aria-label={s('table')} className="min-w-[860px]">
            <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
              <span role="columnheader" className="flex-[2.2]">{s('head.contact')}</span>
              <span role="columnheader" className="flex-[1.6]">{s('head.score')}</span>
              <span role="columnheader" className="flex-[1.6]">{s('head.why')}</span>
              <span role="columnheader" className="w-[230px]">{s('head.route')}</span>
            </div>
            {rows.map((r) => (
              <div key={r.id} role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[12px]">
                <div role="cell" className="flex min-w-0 flex-[2.2] items-center gap-[12px]">
                  <span aria-hidden="true" className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-pill bg-sbg text-[11px] font-bold">
                    {initials(r.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">{r.name}</div>
                    <div className="text-[12px] text-mut">
                      {s('sub', {
                        company: r.company,
                        stage: s(`stage.${r.stage}`),
                        brreg: r.nace && r.employees !== null ? s('brreg', { nace: r.nace, employees: fmt(r.employees) }) : s('brregNone'),
                      })}
                    </div>
                  </div>
                </div>
                <div role="cell" className="flex flex-[1.6] flex-col gap-[5px]">
                  {(
                    [
                      ['fit', r.fit, 'bg-teal'],
                      ['intent', r.intent, 'bg-ac'],
                    ] as const
                  ).map(([key, n, fill]) => (
                    <div key={key} className="flex items-center gap-[8px]">
                      <span className="w-[38px] text-[11px] text-mut">{s(key)}</span>
                      <span aria-hidden="true" className="block h-[7px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
                        {/* the design's bar: the points as a per cent of the track (45 of 50 fills 45 %) */}
                        <span className={`block h-full rounded-pill ${fill}`} style={{ width: `${Math.min(100, n)}%` }} />
                      </span>
                      <b className="min-w-[44px] text-right text-[12px]">{s('of50', { n })}</b>
                    </div>
                  ))}
                </div>
                <div role="cell" className="min-w-0 flex-[1.6] text-[12.5px] text-mut">
                  {why(r)}
                </div>
                <div role="cell" className="flex w-[230px] flex-none items-center justify-end gap-[8px]">
                  <span className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill bg-sbg px-[10px] py-[5px] text-[11.5px] font-bold">
                    <span aria-hidden="true" className={`block h-[6px] w-[6px] rounded-pill ${DOT_CLASS[routeTone(r)]}`} />
                    {/* the design's chip holds three runs (total, dot, route), each a flex item 6 px apart */}
                    <span>{r.total}</span>
                    <span aria-hidden="true">·</span>
                    <span>{s(`route.${r.route}`)}</span>
                  </span>
                  <Link href={`/admin/crm/contacts/${r.id}` as Route} className={`${BTN.row} leading-[normal]`} aria-label={s('openLabel', { name: r.name })}>
                    {s('open')}
                  </Link>
                </div>
              </div>
            ))}
            {rows.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{s('none')}</p>}
          </div>
        </section>

        <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
          <h2 className="m-0 font-display text-[22px] font-medium">{s('fitTitle')}</h2>
          <div className="mt-[4px] text-[12.5px] text-mut">{s('fitSub')}</div>
          <div className="mt-[8px] flex flex-col">
            {fitPoints.map((p) => (
              <div key={p.key} className="flex items-center gap-[12px] border-b border-line py-[10px] text-[13.5px]">
                <div className="min-w-0 flex-1">{s(`part.${p.key}`)}</div>
                <b className="min-w-[36px] text-right">{s('points', { n: p.points })}</b>
              </div>
            ))}
          </div>
          <h2 className="m-0 mt-[22px] font-display text-[22px] font-medium">{s('intentTitle')}</h2>
          <div className="mt-[4px] text-[12.5px] text-mut">
            {s('intentSub')}
            {unsourced.length ? (
              <span className="block">{s('intentCap', { n: reachable, count: unsourced.length, total: intentPoints.length })}</span>
            ) : null}
          </div>
          <div className="mt-[8px] flex flex-col">
            {intentPoints.map((p) => (
              <div key={p.key} className="flex items-center gap-[12px] border-b border-line py-[10px] text-[13.5px]">
                <div className="min-w-0 flex-1">{p.sourced ? s(`part.${p.key}`) : s('noSource', { part: s(`part.${p.key}`) })}</div>
                <b className={`min-w-[36px] text-right ${p.sourced ? '' : 'text-mut'}`}>{s('points', { n: p.points })}</b>
              </div>
            ))}
          </div>
          <div className="mt-[16px] rounded-cta border border-line bg-bg px-[16px] py-[14px] text-[13px] leading-[1.55] [text-wrap:pretty]">
            {t.rich('crm.scoring.routing', { b: (ch) => <b>{ch}</b> })}
          </div>
        </section>
      </div>
    </div>
  )
}
