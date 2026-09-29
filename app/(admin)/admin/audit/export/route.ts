import { NextResponse, type NextRequest } from 'next/server'
import { auditList, isError } from '@/lib/admin/api'
import { AUDIT_AREAS, areaOf, csvCell, type AuditArea } from '@/lib/admin/audit'

/**
 * Admin › Audit log › Export CSV (X-095, D-170): the entries the page lists — the latest thousand,
 * in the chosen area — one per line. The same reader as the page, so the same people may (the
 * super-admin; support per organisation is not offered here). A reason is an admin's own words;
 * no cell can start a spreadsheet formula.
 *
 *   /admin/audit/export?area=content
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('area')
  const area = (AUDIT_AREAS as readonly string[]).includes(q ?? '') ? (q as AuditArea) : null
  const res = await auditList(null, 1000)
  if (isError(res)) return new NextResponse(res.error === 'not_allowed' ? 'Not allowed' : 'Failed', { status: res.error === 'not_allowed' ? 403 : 500 })
  const rows = res.rows.filter((a) => !area || areaOf(a.action) === area)
  const out = [['At', 'Admin', 'Role', 'Area', 'Action', 'Organisation', 'Target type', 'Target', 'Reason', 'Detail'].map(csvCell).join(',')]
  for (const a of rows)
    out.push(
      [a.at, a.admin_email, a.admin_role, areaOf(a.action), a.action, a.org_name, a.target_type, a.target_id, a.reason, a.detail ? JSON.stringify(a.detail) : null].map(csvCell).join(','),
    )
  return new NextResponse(`﻿${out.join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="orgpuls-audit${area ? `-${area}` : ''}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
