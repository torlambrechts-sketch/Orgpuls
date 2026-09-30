import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { growthExportBoard, growthExportPlan, growthExportReview, isError } from '@/lib/admin/api'
import { csvCell } from '@/lib/admin/audit'
import { EXPORT_KINDS, type ExportKind } from '@/lib/admin/growthData'
import { growthCsv } from '@/lib/admin/growthCsv'

/**
 * Sentral › Growth › Export board / plan / review (0142, D-183): the registry as CSV. The database
 * decides who may (the Growth roles with a second factor) and logs each export as `growth.export`
 * with its kind; a board item's status is the derived one, as the page shows it. No cell can start a
 * spreadsheet formula (csvCell).
 *
 *   /admin/growth/export?kind=board | plan | review
 */
export const dynamic = 'force-dynamic'

/** The kind's rows, read through its own audited export and laid out as CSV */
async function read(kind: ExportKind, tr: (k: string, v?: Record<string, string | number>) => string) {
  if (kind === 'board') {
    const r = await growthExportBoard()
    return isError(r) ? r : growthCsv('board', r, tr)
  }
  if (kind === 'plan') {
    const r = await growthExportPlan()
    return isError(r) ? r : growthCsv('plan', r, tr)
  }
  const r = await growthExportReview()
  return isError(r) ? r : growthCsv('review', r, tr)
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('kind')
  if (!(EXPORT_KINDS as readonly string[]).includes(q ?? '')) return new NextResponse('Not found', { status: 404 })
  const kind = q as ExportKind
  const t = await getTranslations({ locale: 'en', namespace: 'admin.growth.g2' })
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v)
  const rows = await read(kind, tr)
  if (isError(rows)) return new NextResponse(rows.error === 'not_allowed' ? 'Not allowed' : 'Failed', { status: rows.error === 'not_allowed' ? 403 : 500 })
  return new NextResponse(`﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="orgpuls-growth-${kind}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
