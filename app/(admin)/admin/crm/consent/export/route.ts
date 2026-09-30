import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isError } from '@/lib/admin/api'
import { csvCell } from '@/lib/admin/audit'
import { consentExport, type ConsentExportRow } from '@/lib/admin/growthCrm'

/**
 * Sentral › Marketing › Consent › Export ledger (0143, D-184): every consent record, oldest first —
 * who, the purpose, the status, the lawful basis, the method, the double opt-in's two times, when and
 * by whom — which is what Forbrukertilsynet asks for. The CRM's writers only; the database logs each
 * export with its size (crm.consent_export). No cell can start a spreadsheet formula.
 */
export const dynamic = 'force-dynamic'

const COLUMNS = ['id', 'at', 'email', 'name', 'company', 'org_number', 'purpose', 'status', 'basis', 'method', 'doi_sent_at', 'doi_confirmed_at', 'by'] as const satisfies readonly (keyof ConsentExportRow)[]

export async function GET() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin.growth.g3.consent.csv' })
  const res = await consentExport()
  if (isError(res)) return new NextResponse(res.error === 'not_allowed' ? t('notAllowed') : t('failed'), { status: res.error === 'not_allowed' ? 403 : 500 })
  const out = [COLUMNS.map((k) => csvCell(t(k))).join(',')]
  for (const r of res.rows) out.push(COLUMNS.map((k) => csvCell(r[k])).join(','))
  return new NextResponse(`﻿${out.join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${t('file')}"`,
      'cache-control': 'no-store',
    },
  })
}
