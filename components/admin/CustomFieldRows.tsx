import type { Route } from 'next'
import { Fragment, type ReactNode } from 'react'
import type { FieldMessages } from '@/components/admin/CustomFields'
import { ALink, day } from '@/components/admin/ui'
import { shownValue, type FieldDef } from '@/lib/admin/crmFieldTypes'

/**
 * A record's custom values on its page (0197, D-212; CUS-01, CUS-02): the fields shown on the page that hold a
 * value, and the important ones that do not yet (a nudge), in the registry's order. A reference to a company or a
 * contact links to it; one the viewer may not see shows as «—».
 */
export function customRows(
  fields: FieldDef[],
  values: Record<string, unknown>,
  refs: Record<string, string>,
  m: FieldMessages,
  row: (label: string, value: ReactNode) => ReactNode,
) {
  return fields
    .filter((f) => f.in_detail)
    .map((f) => {
      const v = values[f.key]
      const text = shownValue(f, v, refs, (iso) => day(iso))
      if (text === null) {
        return f.importance === 'important' || f.importance === 'required' ? (
          <Fragment key={f.key}>{row(f.label, <span className="font-semibold text-danger">{m.inputs.notFilled}</span>)}</Fragment>
        ) : null
      }
      const id = typeof v === 'string' ? v : ''
      const value =
        f.type === 'organization' && refs[id] ? (
          <ALink href={`/admin/crm/prospects/${id}` as Route}>{text}</ALink>
        ) : f.type === 'person' && refs[id] ? (
          <ALink href={`/admin/crm/contacts/${id}` as Route}>{text}</ALink>
        ) : f.type === 'large_text' ? (
          <span className="whitespace-pre-line">{text}</span>
        ) : (
          text
        )
      return <Fragment key={f.key}>{row(f.label, value)}</Fragment>
    })
}

/** The names a record's history gives its custom lines (custom.<key>): the fields' labels */
export const historyWords = (fields: FieldDef[]) => Object.fromEntries(fields.map((f) => [`custom.${f.key}`, f.label]))
