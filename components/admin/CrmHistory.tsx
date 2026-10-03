import type { Route } from 'next'
import Link from 'next/link'
import { Card, day, when } from '@/components/admin/ui'
import type { CrmHistory as History } from '@/lib/admin/crm'
import { shownValue, type FieldDef } from '@/lib/admin/crmFieldTypes'

/**
 * History on a company or contact page (0194, D-209; PIP-04): every change to a tracked field — what it was,
 * what it became, who and from where — newest first, a page at a time, under the record's own events
 * (created, stage changes, completed tasks). Values are shown as stored; a link to another record is said to
 * have changed rather than shown as an id; a field the page has words for (who sees a company) shows those.
 * A custom value (0197) reads as on the record's page: option labels, kroner, dates, an address in its order, the
 * name behind a reference, or «—» for one the viewer may not see.
 */
type Labels = {
  title: string
  lead: string
  empty: string
  older: string
  newest: string
  created: string
  createdBy: string
  updatedBy: string
  unknown: string
  linked: string
  none: string
  source: Record<string, string>
  event: Record<string, string>
  field: Record<string, string>
}
/** Words for a field's stored values, where the page has them (0196: who sees a company) */
type Values = Record<string, Record<string, string>>

function shown(v: unknown, l: Labels, words?: Record<string, string>): string {
  if (v === null || v === undefined || v === '') return l.none
  if (typeof v === 'string' && words?.[v]) return words[v]
  if (Array.isArray(v)) return v.length ? v.map((x) => words?.[String(x)] ?? String(x)).join(', ') : l.none
  if (typeof v === 'object') {
    // 0197: a custom value of several parts — an amount, a range, an address — read as text
    const o = v as Record<string, unknown>
    if (typeof o.amount === 'number') return `${o.amount.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} ${String(o.currency ?? '')}`.trim()
    if ('from' in o || 'to' in o) return `${String(o.from ?? '')}–${String(o.to ?? '')}`
    return Object.values(o).filter((x) => x !== null && x !== '').map(String).join(', ')
  }
  return String(v)
}

export function CrmHistory({
  data,
  labels: l,
  base,
  before,
  values,
  fields = [],
}: {
  data: History
  labels: Labels
  base: string
  before: number | null
  values?: Values
  /** the record's custom fields (0197), so their lines read as the page shows them */
  fields?: FieldDef[]
}) {
  const lastId = data.changes.length ? data.changes[data.changes.length - 1]!.id : null
  const text = (field: string, v: unknown) => {
    const f = field.startsWith('custom.') ? fields.find((x) => `custom.${x.key}` === field) : undefined
    return f ? (shownValue(f, v, data.refs, (iso) => day(iso)) ?? l.none) : shown(v, l, values?.[field])
  }
  return (
    <Card title={l.title}>
      <p className="m-0 text-[12.5px] leading-[1.5] text-mut">
        {l.lead}
        {data.created_by ? ` ${l.createdBy.replace('{by}', data.created_by)}` : ''}
        {data.updated_by ? ` ${l.updatedBy.replace('{by}', data.updated_by)}` : ''}
      </p>
      {before === null && data.events.length ? (
        <ul className="m-0 mt-[12px] flex list-none flex-col gap-[6px] p-0">
          {data.events.map((e, i) => (
            <li key={`${e.name}-${e.at}-${i}`} className="text-[12.5px]">
              <span className="font-semibold">{l.event[e.name] ?? e.name}</span>
              <span className="text-mut">
                {' · '}
                {when(e.at)} · {e.by ?? l.source[e.source] ?? e.source}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {data.changes.length ? (
        <ol className="m-0 mt-[12px] flex list-none flex-col p-0">
          {data.changes.map((c) => (
            <li key={c.id} className="border-b border-line py-[10px] text-[13px] last:border-b-0">
              <div className="font-semibold">{l.field[c.field] ?? c.field}</div>
              <div className="mt-[2px] break-words [overflow-wrap:anywhere]">
                {c.field.endsWith('_id') ? (
                  l.linked
                ) : (
                  <>
                    <span className="text-mut line-through decoration-ink/30">{text(c.field, c.old)}</span>
                    {' → '}
                    <span>{text(c.field, c.new)}</span>
                  </>
                )}
              </div>
              <div className="mt-[2px] text-[12px] text-mut">
                {when(c.at)} · {c.by ?? l.unknown} · {l.source[c.source] ?? c.source}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-0 mt-[12px] text-[13px] text-mut">{l.empty}</p>
      )}
      <div className="mt-[10px] flex flex-wrap gap-[14px] text-[12.5px] font-semibold">
        {before !== null ? (
          <Link href={base as Route} className="text-link">
            {l.newest}
          </Link>
        ) : null}
        {data.more && lastId !== null ? (
          <Link href={`${base}?before=${lastId}` as Route} className="text-link">
            {l.older}
          </Link>
        ) : null}
      </div>
    </Card>
  )
}
