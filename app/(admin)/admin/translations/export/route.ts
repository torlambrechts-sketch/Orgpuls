import { NextResponse, type NextRequest } from 'next/server'
import { isError, translationState } from '@/lib/admin/api'
import { currentRows, isSurveyLanguage, surveyTexts } from '@/lib/admin/translations'
import { buildPackage, toJson, toXliff } from '@/lib/i18n/translation-package'

/**
 * A survey language's translation file (D-133): every text a respondent can meet, with its bokmål
 * source, the English as a reference, and the translation as the registry holds it.
 *
 *   /admin/translations/export?locale=pl&format=json    the recommended format
 *   /admin/translations/export?locale=pl&format=xliff   XLIFF 2.0, for an agency's CAT tool
 *
 * Super-admin only: the database's admin_translations answers no one else.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const locale = req.nextUrl.searchParams.get('locale')
  const format = req.nextUrl.searchParams.get('format') === 'xliff' ? 'xliff' : 'json'
  if (!isSurveyLanguage(locale)) return new NextResponse('Unknown language', { status: 400 })
  const [state, catalogue] = await Promise.all([translationState(locale), surveyTexts()])
  if (isError(state)) return new NextResponse(state.error === 'not_allowed' ? 'Not allowed' : 'Failed', { status: state.error === 'not_allowed' ? 403 : 500 })
  if (!catalogue) return new NextResponse('Failed', { status: 500 })
  const now = new Date()
  const pkg = buildPackage(locale, catalogue, currentRows(state), now.toISOString())
  const body = format === 'xliff' ? toXliff(pkg) : toJson(pkg)
  const name = `orgpuls-survey-${locale}-${now.toISOString().slice(0, 10)}.${format === 'xliff' ? 'xlf' : 'json'}`
  return new NextResponse(body, {
    headers: {
      'content-type': format === 'xliff' ? 'application/xliff+xml; charset=utf-8' : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  })
}
