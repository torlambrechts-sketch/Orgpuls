import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { BulletRow, StatusChip } from '@/components/admin/growth'
import { PageHead, Problem } from '@/components/admin/ui'
import { growthEvents, isError, whoami } from '@/lib/admin/api'
import { DOT_CLASS, dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'

/** the design's `fmt`: thousands grouped with a space */
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** a customer's score as the design colours it: 70 and over teal, 45 and over yellow, else peach */
const band = (total: number) => (total >= 70 ? 'good' : total >= 45 ? 'fair' : 'poor')

/** the time the firewall was computed, as the design's «· 06:00» */
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' })

const PANEL = 'rounded-panel border border-line bg-sf'
const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'

/**
 * Sentral › Growth › Event catalogue (design revision 3, `isEvents`; 0141, D-182). Three blocks, each
 * read from the database as it stands:
 *
 *   the catalogue      every event Orgpuls emits, its group and PII level, the props it may carry (the
 *                      design's `{recipient_count}`) and how many fell in the last seven days
 *   health score v1    the six components and their points (app.health_parts), then the customers in
 *                      a trial or on a plan, lowest first, with the components they fall short on. A
 *                      component with no source (NPS) says so on its row and in the card's line, with
 *                      the maximum a customer can reach while it has none; it is no one's shortfall
 *   the firewall       app.growth_firewall()'s rules, computed when the page is read: never a
 *                      hard-coded «passing». Each rule's evidence arrives as counts and object names
 *                      and is worded here, through next-intl; the chip names the time it was computed
 *
 * «Used by» names the funnel stages that count the event (0142, D-183); an event nothing reads shows
 * the design's own «—».
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'growthEvents')) return <Problem text={t('common.notAllowed')} />
  const res = await growthEvents()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const failing = res.firewall.filter((f) => !f.pass).length
  const checked = clock.format(new Date(res.checked_at))
  // a component nothing in the schema can score (NPS): named on its row and in the card's line, never
  // counted as a customer's shortfall
  const unsourced = res.parts.filter((p) => p.no_source)

  return (
    <div className="leading-[1.5]">
      <PageHead
        title={t('growth.view.growthEvents.title')}
        lead={t('growth.view.growthEvents.lead', { count: res.events.length })}
        measure={false}
      />
      <div className="grid items-start gap-[18px] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className={`${PANEL} min-w-0 overflow-x-auto`}>
          <div role="table" aria-label={t('growth.events.table')} className="min-w-[640px]">
            <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
              <span role="columnheader" className="flex-[2.2]">{t('growth.events.head.event')}</span>
              <span role="columnheader" className="w-[90px]">{t('growth.events.head.group')}</span>
              <span role="columnheader" className="w-[120px]">{t('growth.events.head.pii')}</span>
              <span role="columnheader" className="flex-[1.4]">{t('growth.events.head.used')}</span>
              <span role="columnheader" className="w-[70px] text-right">{t('growth.events.head.n7')}</span>
            </div>
            {res.events.map((e) => (
              <div key={e.name} role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[11px] text-[13px]">
                <span
                  role="cell"
                  title={t('growth.events.tip', { description: e.description, source: e.source, version: e.version })}
                  className="min-w-0 flex-[2.2] text-[12px] font-semibold [font-family:ui-monospace,Menlo,monospace] [overflow-wrap:anywhere]"
                >
                  {e.props.length ? t('growth.events.withProps', { name: e.name, props: e.props.join(', ') }) : e.name}
                </span>
                <span role="cell" className="w-[90px] text-[12.5px] text-mut">
                  {t(`growth.events.group.${e.group}`)}
                </span>
                <span role="cell" className="flex w-[120px] items-center gap-[6px] text-[12px]">
                  <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${DOT_CLASS[dotTone('pii', e.pii)]}`} />
                  {t(`growth.events.pii.${e.pii}`)}
                </span>
                <span role="cell" className="min-w-0 flex-[1.4] text-[12.5px] text-mut">
                  {e.used.length ? t('growth.events.usedBy', { stages: e.used.join(' · ') }) : t('growth.events.unused')}
                </span>
                <b role="cell" className="w-[70px] text-right">
                  {fmt(e.n7)}
                </b>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <section className={`${PANEL} px-[20px] py-[20px] md:px-[26px] md:py-[24px]`}>
            <h2 className="m-0 font-display text-[22px] font-medium">{t('growth.events.health.title')}</h2>
            <div className="mt-[4px] text-[12.5px] text-mut">
              {t('growth.events.health.sub', {
                capped: unsourced.length ? 'yes' : 'no',
                reachable: res.reachable,
                unsourced: unsourced.map((p) => t(`growth.events.health.part.${p.key}`)).join(', '),
              })}
            </div>
            <div className="mt-[8px] flex flex-col">
              {res.parts.map((p) => (
                <div key={p.key} className="flex justify-between gap-[10px] border-b border-line py-[9px] text-[13px]">
                  <span>
                    {p.no_source
                      ? t('growth.events.health.noSource', { part: t(`growth.events.health.part.${p.key}`) })
                      : t(`growth.events.health.part.${p.key}`)}
                  </span>
                  <b className={p.no_source ? 'text-mut' : undefined}>{p.max}</b>
                </div>
              ))}
            </div>
            <div className={`mt-[16px] ${HEAD}`}>{t('growth.events.health.lowest')}</div>
            {res.health.length ? (
              <div className="mt-[8px] flex flex-col gap-[8px]">
                {res.health.map((c) => (
                  <Link
                    key={c.org_id}
                    href={`/admin/orgs/${c.org_id}` as Route}
                    className="flex items-center gap-[12px] rounded-cta border border-line bg-bg px-[12px] py-[10px] text-left leading-[normal] text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold">{c.name}</div>
                      <div className="text-[11.5px] text-mut [text-wrap:pretty]">
                        {c.missing.length
                          ? t('growth.events.health.missing', { list: c.missing.map((k) => t(`growth.events.health.part.${k}`)).join(' · ') })
                          : t('growth.events.health.allMet')}
                      </div>
                    </div>
                    <StatusChip tone={dotTone('health', band(c.total))} size="md" inButton>
                      {c.total}
                    </StatusChip>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-[8px] text-[12.5px] text-mut">{t('growth.events.health.none')}</div>
            )}
          </section>

          <section className={`${PANEL} px-[20px] py-[20px] md:px-[26px] md:py-[24px]`}>
            <div className="flex items-center justify-between gap-[10px]">
              <h2 className="m-0 font-display text-[22px] font-medium">{t('growth.events.firewall.title')}</h2>
              <StatusChip tone={dotTone('firewall', failing ? 'fail' : 'pass')}>
                {failing ? t('growth.events.firewall.failing', { count: failing, time: checked }) : t('growth.events.firewall.passing', { time: checked })}
              </StatusChip>
            </div>
            <div className="mt-[4px] text-[12.5px] text-mut">{t('growth.events.firewall.sub')}</div>
            <div className="mt-[12px] flex flex-col gap-[8px]">
              {res.firewall.map((f) => (
                <BulletRow key={f.rule} tone={dotTone('firewall', f.pass ? 'pass' : 'fail')} small pretty>
                  {t.rich('growth.events.firewall.line', {
                    rule: t(`growth.events.firewall.rule.${f.rule}`),
                    evidence: t(`growth.events.firewall.evidence.${f.rule}`, { ...f.evidence, names: f.evidence.names.join(', ') }),
                    mut: (chunks) => <span className="text-mut">{chunks}</span>,
                  })}
                  {f.pass ? null : <span className="sr-only"> {t('growth.events.firewall.failed')}</span>}
                </BulletRow>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
