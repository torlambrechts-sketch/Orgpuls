import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { platformView, sitePage } from '@/lib/admin/translations'
import { buildSiteSheet } from '@/lib/i18n/site-sheet'
import { writeXlsx, XLSX_TYPE } from '@/lib/xlsx'

/**
 * A page of the site as a bilingual spreadsheet (X-090): bokmål and English side by side, in the
 * order the page shows its texts, to correct and import back on the same page of admin › Translations.
 *
 *   /admin/translations/sheet?site=/priser     a page (lib/i18n/site-pages.json)
 *   /admin/translations/sheet?site=shared      the header and the footer
 *   /admin/translations/sheet?site=other       the site's texts no one page owns
 *
 * Super-admin only: the database's override readers answer no one else.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const page = sitePage(req.nextUrl.searchParams.get('site'))
  if (!page) return new NextResponse('Unknown page', { status: 400 })
  const view = await platformView('no')
  if (view === 'not_allowed') return new NextResponse('Not allowed', { status: 403 })
  if (view === 'failed') return new NextResponse('Failed', { status: 500 })
  const t = await getTranslations({ locale: 'en', namespace: 'admin.translations.sheet' })
  const rows = buildSiteSheet(page.entries, view.bokmal, view.english, {
    no: t('no'),
    en: t('en'),
    note: t('note'),
    waiting: t('waiting'),
    unreached: t('unreached'),
    hint: t('hint'),
  })
  const slug = page.id === '/' ? 'forside' : page.id.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')
  const body = writeXlsx(rows, { sheet: page.id, widths: [34, 60, 60, 30] })
  return new NextResponse(new Blob([body as Uint8Array<ArrayBuffer>], { type: XLSX_TYPE }), {
    headers: {
      'content-type': XLSX_TYPE,
      'content-disposition': `attachment; filename="orgpuls-site-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'cache-control': 'no-store',
    },
  })
}
