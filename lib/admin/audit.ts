/**
 * Admin › Audit log (X-095, the design's `isAudit`; D-170): which area an entry belongs to, read
 * from its action's prefix (app.admin_log's 'area.verb'), for the design's type chips. Reads are
 * logged too (D-90), so looking at figures is an area of its own. Pure: the page, the CSV export and
 * the unit test import it.
 */
export const AUDIT_AREAS = ['content', 'customers', 'crm', 'tickets', 'admin', 'reads', 'other'] as const
export type AuditArea = (typeof AUDIT_AREAS)[number]

const BY_PREFIX: Record<string, AuditArea> = {
  cms: 'content',
  media: 'content',
  site: 'content',
  legal: 'content',
  module: 'content',
  translations: 'content',
  org: 'customers',
  orgs: 'customers',
  trial: 'customers',
  note: 'customers',
  users: 'customers',
  deletions: 'customers',
  lifecycle: 'customers',
  health: 'customers',
  email_log: 'customers',
  crm: 'crm',
  deliverability: 'crm',
  ticket: 'tickets',
  tickets: 'tickets',
  admin: 'admin',
  admins: 'admin',
  settings: 'admin',
  web: 'reads',
  funnel: 'reads',
  trends: 'reads',
  kpis: 'reads',
  acquisition: 'reads',
  spend: 'reads',
  attribution: 'reads',
  seo: 'reads',
  ops: 'reads',
}

export const areaOf = (action: string): AuditArea => BY_PREFIX[action.split('.')[0] ?? ''] ?? 'other'

/** One CSV cell: quoted when it must be, and never read as a formula by a spreadsheet */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n;']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
