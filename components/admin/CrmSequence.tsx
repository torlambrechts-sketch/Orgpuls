import type { Route } from 'next'
import Link from 'next/link'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { STATUS_TONE } from '@/components/admin/CrmTabs'
import { Badge } from '@/components/admin/ui'
import type { SequenceStep } from '@/lib/admin/crm'

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '—')

/**
 * A campaign's sequence (0111, X-091): every mail in its chain, first mail first, each with its
 * funnel. Answers and clicks lead; opens are shown muted, a lower bound since Apple's automatic
 * opens are not counted. The page you are on is marked.
 */
export function SequenceSteps({ steps, current, m }: { steps: SequenceStep[]; current: string; m: CrmMessages }) {
  const q = m.sequence
  if (steps.length < 2) return <p className="m-0 text-[13px] text-mut">{q.none}</p>
  return (
    <ol className="m-0 flex list-none flex-col gap-[10px] p-0">
      {steps.map((s) => {
        const sent = s.stats.sent
        const here = s.id === current
        return (
          <li key={s.id} className={`rounded-ctl border px-[14px] py-[10px] ${here ? 'border-ink bg-sbg' : 'border-line bg-bg'}`}>
            <span className="flex flex-wrap items-center gap-[8px]">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-mut">{q.step.replace('{n}', String(s.step))}</span>
              {here ? (
                <span className="text-[13.5px] font-bold">{s.name}</span>
              ) : (
                <Link href={`/admin/crm/campaigns/${s.id}` as Route} className="text-[13.5px] font-bold text-link">
                  {s.name}
                </Link>
              )}
              <Badge tone={STATUS_TONE[s.status]}>{m.campaigns.status[s.status]}</Badge>
            </span>
            <span className="mt-[2px] block text-[12px] text-mut">
              {s.step === 1
                ? q.first
                : `${q.after.replace('{days}', String(s.follow_days ?? '')).replace('{when}', m.pipeline.when[s.follow_when])} · ${s.follow_auto ? q.auto : q.manual}`}
              {s.waiting ? ` · ${q.waiting.replace('{n}', String(s.waiting))}` : ''}
            </span>
            <dl className="m-0 mt-[8px] grid gap-x-[14px] gap-y-[4px] text-[12.5px] [grid-template-columns:repeat(auto-fit,minmax(92px,1fr))]">
              <Fig k={q.sent} v={String(sent)} />
              <Fig k={q.replied} v={`${s.replied} · ${pct(s.replied, sent)}`} strong />
              <Fig k={q.clicked} v={`${s.stats.clicked} · ${pct(s.stats.clicked, sent)}`} strong />
              <Fig k={q.opened} v={`${s.stats.opened} · ${pct(s.stats.opened, sent)}`} muted />
              <Fig k={q.delivered} v={String(s.stats.delivered)} />
              <Fig k={q.bounced} v={String(s.stats.bounced)} />
              <Fig k={q.unsubscribed} v={String(s.stats.unsubscribed)} />
            </dl>
          </li>
        )
      })}
    </ol>
  )
}

function Fig({ k, v, strong = false, muted = false }: { k: string; v: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-mut">{k}</dt>
      <dd className={`m-0 tabular-nums ${strong ? 'font-bold text-ink' : muted ? 'text-mut' : 'text-ink'}`}>{v}</dd>
    </div>
  )
}
