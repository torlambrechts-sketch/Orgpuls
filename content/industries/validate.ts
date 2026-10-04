import { getIndustry, INDUSTRIES, pageIn } from './index'
import { LANDINGS, landingFor } from './landing'
import { moduleFile, type PageLang } from './modules'
import type { IndustryPage } from './types'

/**
 * What the build refuses (§ B2): a page on a module the files do not have, an English page on a
 * module without an English translation (the English question page quotes what an English
 * respondent is asked, D-120), a launch that disagrees with the landing page's, and a «Ny» date that
 * is not one. Called from the routes' generateStaticParams, so `next build` fails, and from a unit
 * test, so CI says which.
 */
export function problemsOf(page: IndustryPage, lang: PageLang = 'no'): string[] {
  const out: string[] = []
  if (page.module) {
    try {
      moduleFile(page.module.key)
      if (lang === 'en' && !moduleFile(page.module.key).translations?.en) out.push('an English page on a module without an English translation')
    } catch {
      out.push(`no module file for ${page.module.key}`)
    }
  }
  if (page.questionPage && !page.module) out.push('a question page without a module')
  const landing = landingFor(page.slug)
  if (landing && landing.live[lang] !== page.launched) out.push(`launched ${page.launched} but the landing page is live ${landing.live[lang]}`)
  const until = page.card?.newUntil
  if (until !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(until)))) {
    out.push(`card: «Ny» until "${until}" is not an ISO date`)
  }
  return out
}

/** Two pages of one industry must describe the same thing: the same slug and the same module */
export function twinProblems(no: IndustryPage, en: IndustryPage): string[] {
  const out: string[] = []
  if (no.slug !== en.slug) out.push('English page has another slug')
  if (JSON.stringify(no.module) !== JSON.stringify(en.module)) out.push('English page is on another module')
  return out
}

export function assertIndustries(): void {
  const all = [
    ...INDUSTRIES.flatMap((i) => [
      ...(i.page ? problemsOf(i.page).map((p) => `${i.slug}: ${p}`) : []),
      ...(i.pageEn ? problemsOf(i.pageEn, 'en').map((p) => `${i.slug} (en): ${p}`) : []),
      ...(i.page && i.pageEn ? twinProblems(i.page, i.pageEn).map((p) => `${i.slug} (en): ${p}`) : []),
    ]),
    // a landing page live in a language whose entry has no page there: no menu entry, no question page
    ...LANDINGS.flatMap((l) =>
      (['no', 'en'] as const).filter((lang) => l.live[lang] && !pageIn(getIndustry(l.slug), lang)).map((lang) => `${l.slug} (${lang}): live without a page`),
    ),
  ]
  if (all.length) throw new Error(`industry pages are not valid:\n  ${all.join('\n  ')}`)
}
