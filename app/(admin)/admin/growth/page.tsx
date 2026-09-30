import { getTranslations } from 'next-intl/server'
import { BoardItem } from '@/components/admin/GrowthDialogs'
import { Board, ExportButton, KpiStrip, TierColumn } from '@/components/admin/growth'
import { PageHead, Problem, Stat } from '@/components/admin/ui'
import { growthBoard, isError, whoami } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { ITEM_SETTABLE, ITEM_STATUSES } from '@/lib/admin/growthData'
import { countBy, mayFollow, planWeek } from '@/lib/admin/growthMath'

/** the board's column templates: one per tier, as Board spells them */
const COLUMNS = [3, 4, 5, 6] as const
type Columns = (typeof COLUMNS)[number]

/**
 * Sentral › Growth › Board (design revision 3, `isGboard`; 0142, D-183). The report's tiers and
 * items are registry rows; the KPI row counts them. An item is «Live» only when its live check holds
 * (the database derives it); the others show the status the team set, and each card opens the item's
 * build, KPI and guardrail with its status and owner to change (an audited write). The «Week» card
 * reads the plan's start date: without one the plan has not started, and the card says so.
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'growthBoard')) return <Problem text={t('common.notAllowed')} />
  const res = await growthBoard()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const g = (k: string, v?: Record<string, string | number>) => t(`growth.g2.${k}`, v)
  const n = countBy(res.items, ITEM_STATUSES)
  const week = planWeek(res.plan.week, res.plan.weeks)
  const columns = (COLUMNS as readonly number[]).includes(res.tiers.length) ? (res.tiers.length as Columns) : 5
  const owners = res.admins.map((a) => ({ value: a.id, label: a.email ?? a.id }))
  const statuses = ITEM_SETTABLE.map((s) => ({ value: s, label: g(`status.item.${s}`) }))
  const labels = {
    cancel: g('dialog.cancel'),
    close: g('dialog.close'),
    save: g('dialog.save'),
    saving: g('dialog.saving'),
    failed: g('dialog.failed'),
    status: g('board.status'),
    owner: g('board.owner'),
    nobody: g('board.nobody'),
    open: g('board.open'),
  }

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.growthBoard.title')} lead={t('growth.view.growthBoard.lead')} measure={false} pretty>
        <ExportButton kind="board" label={g('export.board')} />
      </PageHead>
      <KpiStrip>
        <Stat label={g('board.kpi.live')} value={n.live} hint={g('board.kpi.liveSub')} />
        <Stat label={g('board.kpi.building')} value={n.building} hint={g('board.kpi.buildingSub')} />
        <Stat label={g('board.kpi.planned')} value={n.planned} hint={g('board.kpi.plannedSub')} />
        <Stat
          label={g('board.kpi.week')}
          value={week.kind === 'week' ? g('board.kpi.weekValue', { week: week.week, weeks: week.weeks }) : g(`board.kpi.${week.kind === 'finished' ? 'finished' : 'notStarted'}`)}
          hint={
            week.kind === 'week'
              ? res.plan.gate
                ? g('board.kpi.gate', { gate: res.plan.gate })
                : undefined
              : week.kind === 'finished'
                ? g('board.kpi.finishedSub', { weeks: week.weeks })
                : g('board.kpi.notStartedSub')
          }
        />
      </KpiStrip>
      <Board columns={columns} className="mt-[22px]">
        {res.tiers.map((tier) => {
          const items = res.items.filter((i) => i.tier === tier.key)
          return (
            <TierColumn key={tier.key} name={tier.name} count={items.length} why={tier.why}>
              {items.map((it) => (
                <BoardItem
                  key={it.key}
                  card={{
                    rank: it.rank,
                    name: it.name,
                    why: it.why,
                    status: { tone: dotTone('board', it.status), label: g(`status.item.${it.status}`) },
                    meta: g('board.meta', { effort: it.effort, impact: it.impact }),
                    owner: it.owner ? (it.owner.email ?? it.owner.id) : null,
                  }}
                  dialog={{
                    title: it.name,
                    sub: g('board.sub', { rank: it.rank, why: it.why }),
                    sections: [
                      { h: g('board.section.build'), t: it.build },
                      { h: g('board.section.kpi'), t: it.kpi },
                      { h: g('board.section.guardrail'), t: it.guardrail },
                      {
                        h: g('board.section.effort', { scored: it.score ? 'yes' : 'no' }),
                        t: g('board.effortText', { effort: it.effort, impact: it.impact, score: it.score ?? '', scored: it.score ? 'yes' : 'no' }),
                      },
                    ],
                    note: it.live_check
                      ? g(it.status === 'live' ? 'board.liveNow' : 'board.liveOnce', { reason: g(`board.live.${it.live_check}`) })
                      : null,
                    openHref: mayFollow(who?.role, it.href) ? it.href : null,
                  }}
                  form={{ key: it.key, status: it.stored, owner: it.owner?.id ?? '', statuses, owners }}
                  labels={labels}
                />
              ))}
            </TierColumn>
          )
        })}
      </Board>
    </div>
  )
}
