import type { Route } from 'next'
import Link from 'next/link'
import { Card, when } from '@/components/admin/ui'
import type { CrmHistory as History } from '@/lib/admin/crm'

/**
 * History on a company or contact page (0194, D-209; PIP-04): every change to a tracked field — what it was,
 * what it became, who and from where — newest first, a page at a time, under the record's own events
 * (created, stage changes, completed tasks). Values are shown as stored; a link to another record is said to
 * have changed rather than shown as an id.
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

function shown(v: unknown, l: Labels): string {
  if (v === null || v === undefined || v === '') return l.none
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(', ') : l.none
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function CrmHistory({ data, labels: l, base, before }: { data: History; labels: Labels; base: string; before: number | null }) {
  const lastId = data.changes.length ? data.changes[data.changes.length - 1]!.id : null
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
                    <span className="text-mut line-through decoration-ink/30">{shown(c.old, l)}</span>
                    {' → '}
                    <span>{shown(c.new, l)}</span>
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
