import { getTranslations } from 'next-intl/server'
import { KpiStrip, StatusChip } from '@/components/admin/growth'
import { MagnetOpen } from '@/components/admin/G4Controls'
import { PageHead, Problem, Stat } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { growthMagnets } from '@/lib/admin/growthG4'
import { allGuidance, dayMonth, doiRate, doneText, liveMagnets, magnetTone, shortOf, type GrowthMagnets, type Magnet } from '@/lib/admin/magnets'

const PANEL = 'rounded-panel border border-line bg-sf'
const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'
const CARD = 'rounded-panel border bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]'

/**
 * Sentral › Content › Tools & lead magnets (design revision 3, `isMagnets`; 0144, D-185).
 *
 *   the KPI row      completions, consent and trials are counted from a tool's sessions, and no tool
 *                    is live: «—» with why. Double opt-in is counted from the contacts' confirmations
 *   the registry     the report's seven magnets in its order, each with its TRUE status: six planned,
 *                    the newsletter live as long as its CRM list is (derived). «Open» shows what the
 *                    registry holds about it; nothing here writes
 *   gating, flow     the report's rule and the shared consent flow: copy, in messages; the flow's
 *                    double opt-in names the marketing stream's real domain
 *   Krav-sjekk       the rules' current versions, each with the day it was last checked
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'cmsMagnets')) return <Problem text={t('common.notAllowed')} />
  const res = await growthMagnets()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const m = (k: string, v?: Record<string, string | number>) => t(`growth.g4.magnets.${k}`, v)
  const live = liveMagnets(res)
  const doi = doiRate(res.doi)
  const none = m('none')

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.cmsMagnets.title')} lead={t('growth.view.cmsMagnets.lead')} measure={false} />
      <KpiStrip>
        <Stat label={m('kpi.completions')} value={none} hint={live ? undefined : m('kpi.completionsNone')} />
        <Stat label={m('kpi.consent')} value={none} hint={m('kpi.consentNone')} />
        <Stat label={m('kpi.trials')} value={<Why why={m('kpi.trialsWhy')}>{none}</Why>} hint={m('kpi.trialsNone')} />
        <Stat
          label={m('kpi.doi')}
          value={doi ? <Why why={m('kpi.doiOf', { confirmed: res.doi.confirmed, sent: res.doi.sent })}>{doi}</Why> : none}
          hint={doi ? m('kpi.doiSub') : m('kpi.doiNone')}
        />
      </KpiStrip>

      <div className="mt-[18px] grid items-start gap-[18px] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className={`${PANEL} min-w-0 overflow-x-auto`}>
          <div role="table" aria-label={m('table')} className="min-w-[920px]">
            <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
              <span role="columnheader" className="w-[26px]">{m('head.rank')}</span>
              <span role="columnheader" className="flex-[2.2]">{m('head.magnet')}</span>
              <span role="columnheader" className="w-[92px] text-right">{m('head.completions')}</span>
              <span role="columnheader" className="w-[96px] text-right">{m('head.consent')}</span>
              <span role="columnheader" className="w-[70px] text-right">{m('head.trials')}</span>
              <span role="columnheader" className="w-[150px]">{m('head.status')}</span>
              <span role="columnheader" className="w-[60px]" />
            </div>
            {res.magnets.map((x) => (
              <Row key={x.key} x={x} m={m} />
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <section className={`${CARD} border-ink`}>
            <h2 className="m-0 font-display text-[22px] font-medium">{m('gatingRule.title')}</h2>
            <div className="mt-[10px] text-[13px] leading-[1.55] [text-wrap:pretty]">
              {t.rich('growth.g4.magnets.gatingRule.text', { b: (c) => <b>{c}</b> })}
            </div>
          </section>

          <section className={`${CARD} border-line`}>
            <h2 className="m-0 font-display text-[22px] font-medium">{m('flow.title')}</h2>
            <ol className="m-0 mt-[12px] flex list-none flex-col gap-[8px] p-0 text-[13px] leading-[1.5]">
              {(['s1', 's2', 's3', 's4'] as const).map((s, i) => (
                <li key={s} className="flex gap-[10px]">
                  {/* as the design's: the number may give way to a long line (no flex-none), the line keeps its words */}
                  <span aria-hidden="true" className="w-[22px] font-bold text-mut">
                    {i + 1}
                  </span>
                  <span>
                    {t.rich(`growth.g4.magnets.flow.${s}`, {
                      domain: res.marketing_domain ?? none,
                      mut: (c) => <span className="text-mut">{c}</span>,
                    })}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <Rules res={res} m={m} />
        </div>
      </div>
    </div>
  )
}

type M = (k: string, v?: Record<string, string | number>) => string

/** A figure with what stands behind it: a tooltip, and the same words for a screen reader */
function Why({ why, children }: { why: string; children: string }) {
  return (
    <span title={why}>
      {children}
      <span className="sr-only"> ({why})</span>
    </span>
  )
}

function Row({ x, m }: { x: Magnet; m: M }) {
  const desc = m(`item.${x.key}`)
  const kind = x.gated === 'pdf_ics' ? m('kindFormat', { kind: m(`kind.${x.kind}`), format: m('format.pdf_ics') }) : m(`kind.${x.kind}`)
  const status = m(`status.${x.status}`)
  const done = doneText(x.completions)
  const consent = x.doi ? doiRate(x.doi) : null
  // a tool records nothing yet; the newsletter's subscribers are real, its trials have no attribution
  const noneWhy = m(x.kind === 'newsletter' ? 'noneWhy.newsletter' : 'noneWhy.tool')
  return (
    <div role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[12px] text-[13px]">
      <span role="cell" className="w-[26px] font-bold text-mut">
        {x.rank}
      </span>
      <div role="cell" className="min-w-0 flex-[2.2]">
        <div className="flex flex-wrap items-center gap-[8px] font-semibold">
          {x.name}
          <span className="rounded-pill border border-line px-[7px] py-[2px] text-[11px] font-semibold text-mut">{kind}</span>
        </div>
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-mut" title={desc}>
          {shortOf(desc)}
        </div>
      </div>
      <b role="cell" className="w-[92px] text-right" title={done ? undefined : x.kind === 'newsletter' ? undefined : noneWhy}>
        {done ?? m('none')}
      </b>
      <span role="cell" className="w-[96px] text-right text-[12.5px]" title={consent ? undefined : noneWhy}>
        {consent ? m('doiShare', { rate: consent }) : m('none')}
      </span>
      <b role="cell" className="w-[70px] text-right" title={noneWhy}>
        {m('none')}
      </b>
      <span role="cell" className="w-[150px]">
        <StatusChip tone={magnetTone(x.status)}>{status}</StatusChip>
      </span>
      <span role="cell" className="flex w-[60px] justify-end">
        <MagnetOpen
          label={m('open')}
          title={x.name}
          sub={m('dialog.sub', { kind, status })}
          closeLabel={m('close')}
          sections={[
            { h: m('dialog.what'), t: desc },
            { h: m('dialog.gating'), t: m(`dialog.gate.${x.gated}`) },
            { h: m('dialog.state'), t: x.derived ? m('dialog.why.derived', { status }) : m(`dialog.why.${x.status}`) },
          ]}
        />
      </span>
    </div>
  )
}

function Rules({ res, m }: { res: GrowthMagnets; m: M }) {
  return (
    <section className={`${CARD} border-line`}>
      <h2 className="m-0 font-display text-[22px] font-medium">{m('krav.title')}</h2>
      <div className="mt-[8px] flex flex-col text-[13px]">
        {res.rules.map((r) => {
          const date = dayMonth(r.checked_on)
          const value =
            r.key === 'verneombud'
              ? m('krav.value.verneombud', { n: r.threshold ?? 0, date })
              : r.key === 'amu'
                ? m('krav.value.amu', { n: r.threshold ?? 0, from: r.on_demand_from ?? 0, date })
                : r.key === 'bht'
                  ? m('krav.value.bht', { reference: r.reference })
                  : m('krav.value.wording_4_3', { say: r.say ?? '', never: r.never_say ?? '' })
          return (
            <div
              key={r.key}
              title={m('krav.tip', { reference: r.reference, version: r.version, date, source: r.checked_against, guidance: r.guidance ? 'yes' : 'no' })}
              className="flex justify-between gap-[10px] border-b border-line py-[9px]"
            >
              <span className="text-mut">{m(`krav.label.${r.key}`)}</span>
              <b className="text-right">{value}</b>
            </div>
          )
        })}
      </div>
      <div className="mt-[12px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
        {m('krav.footer', { version: res.ruleset_version, guidance: allGuidance(res) ? 'yes' : 'no' })}
      </div>
    </section>
  )
}
