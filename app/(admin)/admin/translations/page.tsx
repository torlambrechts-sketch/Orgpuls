import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { TranslationApproveForm, TranslationImportForm } from '@/components/admin/TranslationForms'
import { Badge, Card, PageHead, Problem, Stat } from '@/components/admin/ui'
import { whoami } from '@/lib/admin/api'
import { FIRST_SURVEY_LANGUAGE, isSurveyLanguage, languageView, SURVEY_LANGUAGES } from '@/lib/admin/translations'
import { LOCALE_REGISTRY } from '@/lib/i18n/locales'
import { SECTIONS, type Section } from '@/lib/i18n/survey-catalogue'
import { ORIGINS, standing } from '@/lib/i18n/translation-package'

/**
 * Translations (D-133): the survey in the languages a respondent may pick beyond bokmål and English
 * — Polish, Ukrainian, Lithuanian, Swedish, Danish. Every text a respondent can meet is listed with
 * its bokmål source and its translation's step; a language's texts go out as a file (JSON, or
 * XLIFF for an agency) and come back the same way; and what may be approved is approved here.
 * A language reaches respondents when every text is approved and its flag, or a pilot, is on.
 * Super-admin; the platform itself stays bokmål and English, and the admin English.
 */
type Props = { searchParams: Promise<{ lang?: string; section?: string; show?: string }> }

const SHOW = ['all', 'none', 'workflow', 'approved', 'stale'] as const
type Show = (typeof SHOW)[number]

export default async function AdminTranslations(props: Props) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await props.searchParams
  const lang = isSurveyLanguage(sp.lang) ? sp.lang : FIRST_SURVEY_LANGUAGE
  const section: Section | 'all' = (SECTIONS as readonly string[]).includes(sp.section ?? '') ? (sp.section as Section) : 'all'
  const show: Show = (SHOW as readonly string[]).includes(sp.show ?? '') ? (sp.show as Show) : 'all'

  const who = await whoami()
  if (who?.role !== 'super_admin') return <Problem text={t('common.notAllowed')} />
  const view = await languageView(lang)
  if (view === 'not_allowed') return <Problem text={t('common.notAllowed')} />
  if (view === 'failed') return <Problem text={t('common.failed')} />

  const nameOf = (code: string) => LOCALE_REGISTRY.find((l) => l.code === code)?.nativeName ?? code
  const href = (next: { lang?: string; section?: string; show?: string }) => {
    const q = new URLSearchParams()
    const l = next.lang ?? lang
    const s = next.section ?? section
    const w = next.show ?? show
    if (l !== FIRST_SURVEY_LANGUAGE) q.set('lang', l)
    if (s !== 'all') q.set('section', s)
    if (w !== 'all') q.set('show', w)
    return `/admin/translations${q.size ? `?${q}` : ''}` as Route
  }
  const pill = (active: boolean) =>
    `rounded-pill border px-[11px] py-[5px] font-semibold no-underline hover:no-underline ${active ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'}`
  const rows = view.catalogue.filter(
    (e) => (section === 'all' || e.section === section) && (show === 'all' || standing(e, view.current.get(e.key)) === show),
  )
  const problems = Object.fromEntries(
    ['not_allowed', 'invalid', 'no_file', 'too_large', 'bad_file', 'wrong_language', 'stale', 'confirm_required', 'failed'].map((k) => [k, t(`translations.problem.${k}`)]),
  )
  const total = SECTIONS.reduce((n, s) => n + view.counts[s].total, 0)
  const approved = SECTIONS.reduce((n, s) => n + view.counts[s].approved, 0)
  const live = view.ready && (view.flagOn || view.pilots > 0)

  return (
    <>
      <PageHead title={t('translations.title')} lead={t('translations.lead')} />

      <nav aria-label={t('translations.languages')} className="mb-[18px] flex flex-wrap items-center gap-[6px] text-[13px]">
        {SURVEY_LANGUAGES.map((l) => (
          <Link key={l} href={href({ lang: l, section: 'all', show: 'all' })} aria-current={l === lang ? 'page' : undefined} className={pill(l === lang)} lang={l}>
            {nameOf(l)}
          </Link>
        ))}
      </nav>

      <Card
        title={t('translations.statusTitle', { language: nameOf(lang) })}
        aside={<Badge tone={live ? 'green' : view.ready ? 'yellow' : 'red'}>{t(live ? 'translations.live' : view.ready ? 'translations.readyOff' : 'translations.notReady')}</Badge>}
      >
        <ul className="m-0 list-disc pl-[18px] text-[13px] leading-[1.7]">
          <li>{t('translations.approvedOf', { approved, total })}</li>
          <li>{t(view.flagOn ? 'translations.flagOn' : 'translations.flagOff', { flag: `locale_${lang}` })}</li>
          <li>{t('translations.pilots', { n: view.pilots })}</li>
        </ul>
        <p className="mb-0 mt-[8px] max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">{t('translations.rule')}</p>
      </Card>

      <div className="my-[16px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {SECTIONS.map((s) => (
          <Stat
            key={s}
            label={t(`translations.section.${s}`)}
            value={`${view.counts[s].approved} / ${view.counts[s].total}`}
            hint={t('translations.countHint', { workflow: view.counts[s].workflow, stale: view.counts[s].stale })}
          />
        ))}
      </div>

      <div className="grid gap-[16px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t('translations.exportTitle')}>
          <p className="mb-[10px] mt-0 text-[13px] leading-[1.55] text-mut">{t('translations.exportLead')}</p>
          <span className="flex flex-wrap gap-[10px] text-[13px]">
            <a href={`/admin/translations/export?locale=${lang}&format=json`} className="font-semibold text-link">
              {t('translations.exportJson')}
            </a>
            <a href={`/admin/translations/export?locale=${lang}&format=xliff`} className="font-semibold text-link">
              {t('translations.exportXliff')}
            </a>
          </span>
        </Card>
        <Card title={t('translations.approveTitle')}>
          {view.approvable ? (
            <>
              <p className="mb-[10px] mt-0 text-[13px] leading-[1.55] text-mut">{t('translations.approveLead', { n: view.approvable })}</p>
              <TranslationApproveForm
                key={view.state.digest}
                locale={lang}
                digest={view.state.digest}
                labels={{ read: t('translations.approveRead'), submit: t('translations.approveSubmit', { n: view.approvable }), saving: t('legal.saving'), done: t('translations.approveDone'), problems }}
              />
            </>
          ) : (
            <p className="m-0 text-[13px] leading-[1.55] text-mut">{t('translations.approveNone')}</p>
          )}
        </Card>
      </div>

      <Card title={t('translations.importTitle')} className="mt-[16px]">
        <p className="mb-[10px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-mut">{t('translations.importLead')}</p>
        <TranslationImportForm
          key={lang}
          locale={lang}
          labels={{
            file: t('translations.file'),
            origin: t('translations.origin'),
            origins: Object.fromEntries(ORIGINS.map((o) => [o, t(`translations.origins.${o}`)])),
            check: t('translations.check'),
            apply: t('translations.apply'),
            checking: t('translations.checking'),
            summary: t('translations.summary'),
            written: t('translations.written'),
            nothing: t('translations.nothing'),
            codes: Object.fromEntries(['unknown_key', 'syntax', 'placeholders', 'plural', 'stale', 'approved_capped', 'step', 'sms_long'].map((c) => [c, t(`translations.code.${c}`)])),
            problems,
            problemsHead: t('translations.problemsHead'),
          }}
        />
      </Card>

      <nav aria-label={t('translations.filter')} className="my-[18px] flex flex-wrap items-center gap-[6px] text-[13px]">
        {(['all', ...SECTIONS] as const).map((s) => (
          <Link key={s} href={href({ section: s })} aria-current={s === section ? 'page' : undefined} className={pill(s === section)}>
            {s === 'all' ? t('translations.allSections') : t(`translations.section.${s}`)}
          </Link>
        ))}
        <span aria-hidden="true" className="mx-[6px] h-[18px] w-px bg-line" />
        {SHOW.map((w) => (
          <Link key={w} href={href({ show: w })} aria-current={w === show ? 'page' : undefined} className={pill(w === show)}>
            {t(`translations.show.${w}`)}
          </Link>
        ))}
      </nav>

      <Card title={t('translations.textsTitle', { n: rows.length })}>
        {rows.length ? (
          <ul className="m-0 list-none p-0">
            {rows.map((e) => {
              const c = view.current.get(e.key)
              const s = standing(e, c)
              return (
                <li key={e.key} className="border-t border-line py-[10px]">
                  <span className="flex flex-wrap items-center gap-[6px]">
                    <Badge tone={s === 'approved' ? 'green' : s === 'stale' ? 'yellow' : s === 'workflow' ? 'grey' : 'red'}>
                      {c && s === 'workflow' ? t(`translations.step.${c.status}`) : t(`translations.show.${s}`)}
                    </Badge>
                    <span className="break-all font-mono text-[11px] text-mut">{e.key}</span>
                    {c ? <span className="text-[11.5px] text-mut">{t(`translations.origins.${c.source}`)}</span> : null}
                  </span>
                  <div className="mt-[6px] grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-mut">{t('translations.bokmal')}</span>
                      <p lang="nb" className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55]">{e.source}</p>
                      {e.en ? (
                        <p lang="en" className="m-0 mt-[4px] whitespace-pre-wrap text-[12px] leading-[1.5] text-mut">
                          {t('translations.english')}: {e.en}
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-mut">{nameOf(lang)}</span>
                      {c ? (
                        <p lang={lang} className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55]">{c.text}</p>
                      ) : (
                        <p className="m-0 text-[13px] italic text-mut">{t('translations.untranslated')}</p>
                      )}
                      {c?.notes ? <p className="m-0 mt-[4px] whitespace-pre-wrap text-[12px] leading-[1.5] text-mut">{t('translations.notes')}: {c.notes}</p> : null}
                    </div>
                  </div>
                  <p className="m-0 mt-[4px] text-[11.5px] text-mut">{e.context}</p>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-mut">{t('translations.none')}</p>
        )}
      </Card>
    </>
  )
}
