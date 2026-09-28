import { NextResponse, type NextRequest } from 'next/server'
import { isError, translationState } from '@/lib/admin/api'
import {
  currentRows,
  isPlatformLanguage,
  isRegistryLanguage,
  PLATFORM_CATALOGUE,
  platformView,
  SCOPE_SECTIONS,
  surveyTexts,
  type Scope,
} from '@/lib/admin/translations'
import { buildPlatformPackage } from '@/lib/i18n/platform-package'
import { buildPackage, toJson, toXliff, type Package } from '@/lib/i18n/translation-package'

/**
 * A translation file (D-133, D-152), for a translator, an agency or a proofreader.
 *
 *   /admin/translations/export?locale=pl&scope=questionnaire&format=json   a survey language's questions
 *   /admin/translations/export?locale=pl&scope=pages                       its survey pages and mails
 *   /admin/translations/export?locale=en&scope=questionnaire               English's questions (the registry)
 *   /admin/translations/export?locale=en&scope=pages[&ns=site]             English's pages (messages/ and overrides)
 *   /admin/translations/export?locale=no&scope=questionnaire|pages         bokmål, to proofread
 *   &format=xliff                                                          XLIFF 2.0, for a CAT tool
 *
 * Super-admin only: the database's admin readers answer no one else.
 */
export const dynamic = 'force-dynamic'

const file = (body: string, name: string, xliff: boolean) =>
  new NextResponse(body, {
    headers: {
      'content-type': xliff ? 'application/xliff+xml; charset=utf-8' : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  })

const refuse = (error: string) =>
  new NextResponse(error === 'not_allowed' ? 'Not allowed' : 'Failed', { status: error === 'not_allowed' ? 403 : 500 })

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const locale = q.get('locale')
  const xliff = q.get('format') === 'xliff'
  const scope: Scope = q.get('scope') === 'pages' ? 'pages' : 'questionnaire'
  const ns = q.get('ns')
  const now = new Date()
  const stamp = now.toISOString().slice(0, 10)
  const ext = xliff ? 'xlf' : 'json'

  // bokmål's questions and every bokmål or English page: messages/ with the overrides
  if (isPlatformLanguage(locale) && (locale === 'no' || scope === 'pages')) {
    const view = await platformView(locale)
    if (view === 'not_allowed' || view === 'failed') return refuse(view)
    const entries = PLATFORM_CATALOGUE.filter((e) => e.view === scope && (!ns || e.ns === ns))
    const pkg = buildPlatformPackage(locale, entries, view.own, view.bokmal, view.english, now.toISOString())
    const body = xliff ? toXliff(pkg as unknown as Package) : toJson(pkg as unknown as Package)
    return file(body, `orgpuls-${scope}-${locale}${ns ? `-${ns}` : ''}-${stamp}.${ext}`, xliff)
  }

  if (!isRegistryLanguage(locale)) return new NextResponse('Unknown language', { status: 400 })
  // English's pages are messages/ (above); in the registry it has its questions only
  if (locale === 'en' && scope === 'pages') return new NextResponse('Unknown scope', { status: 400 })
  const [state, catalogue] = await Promise.all([translationState(locale), surveyTexts()])
  if (isError(state)) return refuse(state.error)
  if (!catalogue) return refuse('failed')
  const sections = SCOPE_SECTIONS[scope]
  const pkg = buildPackage(locale, catalogue.filter((e) => sections.includes(e.section)), currentRows(state), now.toISOString())
  // English is the reference for the survey languages; for English itself it is the target
  if (locale === 'en') for (const e of pkg.entries) e.reference_en = null
  return file(xliff ? toXliff(pkg) : toJson(pkg), `orgpuls-${scope}-${locale}-${stamp}.${ext}`, xliff)
}
