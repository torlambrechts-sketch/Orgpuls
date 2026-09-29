import type { AuditRow } from '@/lib/admin/api'

/**
 * The audit log read as activity (X-095): what an admin changed, in a phrase, with who and when.
 * Reads are in the log too; an action without a phrase under `admin.dashboard.did` is not shown,
 * so six views of a list never crowd out a change.
 */
export const didKey = (action: string) => `dashboard.did.${action.replace(/\./g, '_')}`

const DAY = 86_400_000
const osloDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' })
const osloTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' })
const osloDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short' })

/** Today's changes show the time, yesterday's say so, older ones their date */
export function when(iso: string, t: (k: string, v?: Record<string, string>) => string, now = Date.now()) {
  const at = new Date(iso)
  const day = osloDay.format(at)
  const time = osloTime.format(at)
  if (day === osloDay.format(new Date(now))) return time
  if (day === osloDay.format(new Date(now - DAY))) return t('dashboard.activity.yesterday', { time })
  return `${osloDate.format(at)} ${time}`
}

/** Admins have no name field: the first word of the address's local part stands for it */
export const firstName = (email: string | null) => {
  const w = (email ?? '').split('@')[0]!.split(/[._-]+/)[0] ?? ''
  return w ? w[0]!.toUpperCase() + w.slice(1) : '—'
}

/** What the change was made to, where the row says so without reading anything more */
export function targetOf(a: AuditRow, pages: Map<string, string> = new Map()): string | null {
  const locale = typeof a.detail?.locale === 'string' ? ` (${a.detail.locale})` : ''
  switch (a.target_type) {
    case 'cms_page': {
      const path = a.target_id ? pages.get(a.target_id) : undefined
      return path ? `${path}${locale}` : null
    }
    case 'cms_redirect':
      return a.target_id ? (typeof a.detail?.to === 'string' ? `${a.target_id} → ${a.detail.to}` : a.target_id) : null
    case 'crm_stage':
    case 'legal_text':
      return a.target_id
    case 'locale':
      return a.target_id ? a.target_id.toUpperCase() : null
    default:
      return a.org_name
  }
}
