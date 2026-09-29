import type { CrmMessages } from '@/components/admin/CrmForms'
import type { Stats } from '@/lib/admin/crm'

/**
 * A campaign's funnel (X-092): sent, delivered, opened, clicked, each as a bar against what was
 * sent, with the count and the share. Opens are drawn muted: a lower bound, since many programs
 * block the pixel. Nothing is drawn for a campaign that has sent nothing: no bars over zero.
 */
export function Funnel({ stats, m, compact = false }: { stats: Stats; m: CrmMessages; compact?: boolean }) {
  const c = m.campaign
  if (!stats.sent) return <p className="m-0 text-[12.5px] text-mut">{m.studio.list.noSends}</p>
  const steps = [
    { k: c.sent, v: stats.sent, tone: 'bg-ink' },
    { k: c.delivered, v: stats.delivered, tone: 'bg-greenbar' },
    { k: c.opened, v: stats.opened, tone: 'bg-sage' },
    { k: c.clicked, v: stats.clicked, tone: 'bg-ac' },
  ]
  return (
    <figure className="m-0" aria-label={m.studio.list.funnel}>
      {compact ? null : <figcaption className="mb-[8px] text-[12px] font-semibold text-mut">{m.studio.list.funnel}</figcaption>}
      <dl className={`m-0 grid ${compact ? 'gap-[4px]' : 'gap-[7px]'}`}>
        {steps.map((x) => {
          const pct = Math.round((100 * x.v) / stats.sent)
          return (
            <div key={x.k} className="grid items-center gap-[8px] [grid-template-columns:76px_minmax(0,1fr)_78px]">
              <dt className="text-[12px] text-mut">{x.k}</dt>
              <dd className="m-0 h-[10px] overflow-hidden rounded-full bg-track">
                <span className={`block h-full rounded-full ${x.tone}`} style={{ width: `${Math.max(x.v ? 2 : 0, pct)}%` }} />
              </dd>
              <dd className="m-0 text-right text-[12px] font-semibold tabular-nums">
                {x.v} · {pct} %
              </dd>
            </div>
          )
        })}
      </dl>
    </figure>
  )
}
