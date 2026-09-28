import type { Route } from 'next'
import Link from 'next/link'
import { createHash } from 'node:crypto'
import { getTranslations } from 'next-intl/server'
import { AutoApproveForm, MessagesApproveForm, TranslationApproveForm, TranslationImportForm } from '@/components/admin/TranslationForms'
import { Badge, Card, PageHead, Problem, Stat } from '@/components/admin/ui'
import { whoami } from '@/lib/admin/api'
import { autoRecord } from '@/lib/admin/auto'
import {
  ADMIN_LANGUAGES,
  autoApprove,
  isAdminLanguage,
  isScope,
  languageView,
  PLATFORM_CATALOGUE,
  platformView,
  SCOPE_SECTIONS,
  surveyTexts,
  type AdminLanguage,
  type LanguageView,
  type PlatformView,
  type Scope,
} from '@/lib/admin/translations'
import { isError } from '@/lib/admin/api'
import { LOCALE_REGISTRY } from '@/lib/i18n/locales'
import { shownText } from '@/lib/i18n/platform-package'
import type { Section } from '@/lib/i18n/survey-catalogue'
import { ORIGINS, standing } from '@/lib/i18n/translation-package'

/**
 * Translations (D-133, D-152). Two tabs — the questionnaire, and every page — and seven languages:
 * bokmål, the source; English, the platform's second language; and the survey languages a
 * respondent may pick. Each language goes out as a file for a translator (JSON, or XLIFF for an
 * agency) and comes back the same way; what is waiting is approved here, or by the auto-approve
 * switch while it is on. The admin itself stays English. Super-admin.
 */
type Props = { searchParams: Promise<{ view?: string; lang?: string; section?: string; show?: string; ns?: string; q?: string; page?: string }> }

type T = Awaited<ReturnType<typeof getTranslations<'admin'>>>
const SHOW = ['all', 'none', 'workflow', 'approved', 'stale'] as const
type Show = (typeof SHOW)[number]
const PAGE_SHOW = ['all', 'overridden', 'waiting'] as const
type PageShow = (typeof PAGE_SHOW)[number]
const PER_PAGE = 150

const pill = (active: boolean) =>
  `rounded-pill border px-[11px] py-[5px] font-semibold no-underline hover:no-underline ${active ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'}`
const tab = (active: boolean) =>
  `border-b-2 px-[4px] pb-[8px] text-[15px] font-semibold no-underline hover:no-underline ${active ? 'border-ink text-ink hover:text-ink' : 'border-transparent text-mut hover:text-ink'}`
const nameOf = (code: string) => (code === 'no' ? 'Norsk (bokmål)' : (LOCALE_REGISTRY.find((l) => l.code === code)?.nativeName ?? code))

export default async function AdminTranslations(props: Props) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await props.searchParams
  const view: Scope = isScope(sp.view) ? sp.view : 'questionnaire'
  const lang: AdminLanguage = isAdminLanguage(sp.lang) ? sp.lang : 'no'

  const who = await whoami()
  if (who?.role !== 'super_admin') return <Problem text={t('common.notAllowed')} />
  // while the switch is on, what this build shows is approved as it is opened (0101)
  const auto = await autoApprove()
  if (!isError(auto) && auto.on) await autoRecord()

  const href = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams()
    const merged = { view, lang, ...next }
    for (const [k, v] of Object.entries(merged)) if (v && !(k === 'view' && v === 'questionnaire') && !(k === 'lang' && v === 'no')) q.set(k, v)
    return `/admin/translations${q.size ? `?${q}` : ''}` as Route
  }

  let body: React.ReactNode
  if (view === 'questionnaire' && lang === 'no') body = await bokmalQuestionnaire(t, sp, href)
  else if (view === 'pages' && (lang === 'no' || lang === 'en')) body = await platformPages(t, lang, sp, href)
  else {
    const v = await languageView(lang as Exclude<AdminLanguage, 'no'>, view)
    body = v === 'not_allowed' ? <Problem text={t('common.notAllowed')} /> : v === 'failed' ? <Problem text={t('common.failed')} /> : registryPanel(t, v, sp, href)
  }

  return (
    <>
      <PageHead title={t('translations.title')} lead={t('translations.lead')} />

      {isError(auto) ? null : (
        <Card
          title={t('translations.auto.title')}
          aside={<Badge tone={auto.on ? 'yellow' : 'grey'}>{t(auto.on ? 'translations.auto.on' : 'translations.auto.off')}</Badge>}
          className="mb-[16px]"
        >
          <p className="mb-[10px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-mut">{t('translations.auto.lead')}</p>
          {auto.on && auto.by ? (
            <p className="mb-[10px] mt-0 text-[12.5px] text-mut">{t('translations.auto.since', { by: auto.by, at: (auto.at ?? '').slice(0, 16).replace('T', ' ') })}</p>
          ) : null}
          <AutoApproveForm
            on={auto.on}
            labels={{
              turnOn: t('translations.auto.turnOn'),
              turnOff: t('translations.auto.turnOff'),
              confirm: t('translations.auto.confirm'),
              saving: t('legal.saving'),
              done: t('translations.auto.done'),
              problems: { not_allowed: t('translations.problem.not_allowed'), failed: t('translations.problem.failed'), invalid: t('translations.problem.invalid') },
            }}
          />
        </Card>
      )}

      <nav aria-label={t('translations.tabs')} className="mb-[14px] flex gap-[22px] border-b border-line">
        {(['questionnaire', 'pages'] as const).map((s) => (
          <Link key={s} href={href({ view: s, section: undefined, show: undefined, ns: undefined, q: undefined, page: undefined })} aria-current={s === view ? 'page' : undefined} className={tab(s === view)}>
            {t(`translations.tab.${s}`)}
          </Link>
        ))}
      </nav>
      <p className="mb-[12px] mt-0 max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">{t(`translations.tabLead.${view}`)}</p>

      <nav aria-label={t('translations.languages')} className="mb-[18px] flex flex-wrap items-center gap-[6px] text-[13px]">
        {ADMIN_LANGUAGES.map((l) => (
          <Link key={l} href={href({ lang: l, section: undefined, show: undefined, ns: undefined, q: undefined, page: undefined })} aria-current={l === lang ? 'page' : undefined} className={pill(l === lang)} lang={l === 'no' ? 'nb' : l}>
            {nameOf(l)}
          </Link>
        ))}
      </nav>

      {body}
    </>
  )
}

const problemsOf = (t: T) =>
  Object.fromEntries(
    ['not_allowed', 'invalid', 'no_file', 'too_large', 'bad_file', 'wrong_language', 'stale', 'confirm_required', 'failed'].map((k) => [k, t(`translations.problem.${k}`)]),
  )

const CODES = ['unknown_key', 'syntax', 'placeholders', 'plural', 'stale', 'approved_capped', 'step', 'sms_long', 'questionnaire'] as const

function importLabels(t: T) {
  return {
    file: t('translations.file'),
    origin: t('translations.origin'),
    origins: Object.fromEntries(ORIGINS.map((o) => [o, t(`translations.origins.${o}`)])),
    check: t('translations.check'),
    apply: t('translations.apply'),
    checking: t('translations.checking'),
    summary: t('translations.summary'),
    outside: t('translations.outside'),
    written: t('translations.written'),
    removed: t('translations.removed'),
    nothing: t('translations.nothing'),
    codes: Object.fromEntries(CODES.map((c) => [c, t(`translations.code.${c}`)])),
    problems: problemsOf(t),
    problemsHead: t('translations.problemsHead'),
  }
}

function exportCard(t: T, locale: string, scope: Scope, lead: string, ns?: string) {
  const base = `/admin/translations/export?locale=${locale}&scope=${scope}${ns ? `&ns=${ns}` : ''}`
  return (
    <Card title={t('translations.exportTitle')}>
      <p className="mb-[10px] mt-0 text-[13px] leading-[1.55] text-mut">{lead}</p>
      <span className="flex flex-wrap gap-[10px] text-[13px]">
        <a href={`${base}&format=json`} className="font-semibold text-link">
          {t('translations.exportJson')}
        </a>
        <a href={`${base}&format=xliff`} className="font-semibold text-link">
          {t('translations.exportXliff')}
        </a>
      </span>
    </Card>
  )
}

// ---------------------------------------------------------------- bokmål's questions: the source
async function bokmalQuestionnaire(t: T, sp: Awaited<Props['searchParams']>, href: (n: Record<string, string | undefined>) => Route) {
  const catalogue = await surveyTexts()
  if (!catalogue) return <Problem text={t('common.failed')} />
  const sections = SCOPE_SECTIONS.questionnaire
  const section = sections.includes(sp.section as Section) ? (sp.section as Section) : 'all'
  const all = catalogue.filter((e) => sections.includes(e.section))
  const rows = all.filter((e) => section === 'all' || e.section === section)
  return (
    <>
      <div className="mb-[16px] grid gap-[16px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t('translations.sourceTitle')}>
          <p className="m-0 text-[13px] leading-[1.55] text-mut">{t('translations.sourceLead')}</p>
        </Card>
        {exportCard(t, 'no', 'questionnaire', t('translations.exportLeadSource'))}
      </div>
      <nav aria-label={t('translations.filter')} className="my-[18px] flex flex-wrap items-center gap-[6px] text-[13px]">
        {(['all', ...sections] as const).map((s) => (
          <Link key={s} href={href({ section: s === 'all' ? undefined : s })} aria-current={s === section ? 'page' : undefined} className={pill(s === section)}>
            {s === 'all' ? t('translations.allSections') : `${t(`translations.section.${s}`)} · ${all.filter((e) => e.section === s).length}`}
          </Link>
        ))}
      </nav>
      <Card title={t('translations.textsTitle', { n: rows.length })}>
        <ul className="m-0 list-none p-0">
          {rows.map((e) => (
            <li key={e.key} className="border-t border-line py-[10px]">
              <span className="break-all font-mono text-[11px] text-mut">{e.key}</span>
              <div className="mt-[6px] grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                <Column label={t('translations.bokmal')} lang="nb" text={e.source} />
                <Column label={t('translations.english')} lang="en" text={e.en} empty={t('translations.untranslated')} />
              </div>
              <p className="m-0 mt-[4px] text-[11.5px] text-mut">{e.context}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

function Column({ label, lang, text, empty, note }: { label: string; lang: string; text: string | null; empty?: string; note?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-mut">{label}</span>
      {text ? (
        <p lang={lang} className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55]">
          {text}
        </p>
      ) : (
        <p className="m-0 text-[13px] italic text-mut">{empty}</p>
      )}
      {note}
    </div>
  )
}

// ---------------------------------------------------------------- English and the survey languages: the registry
function registryPanel(t: T, view: LanguageView, sp: Awaited<Props['searchParams']>, href: (n: Record<string, string | undefined>) => Route) {
  const { locale: lang, sections } = view
  const section: Section | 'all' = sections.includes(sp.section as Section) ? (sp.section as Section) : 'all'
  const show: Show = (SHOW as readonly string[]).includes(sp.show ?? '') ? (sp.show as Show) : 'all'
  const rows = view.catalogue.filter(
    (e) => (section === 'all' || e.section === section) && (show === 'all' || standing(e, view.current.get(e.key)) === show),
  )
  const total = sections.reduce((n, s) => n + view.counts[s].total, 0)
  const approved = sections.reduce((n, s) => n + view.counts[s].approved, 0)
  const live = view.ready && (view.flagOn || view.pilots > 0)
  const problems = problemsOf(t)

  return (
    <>
      <Card
        title={t('translations.statusTitle', { language: nameOf(lang) })}
        aside={<Badge tone={live ? 'green' : view.ready ? 'yellow' : 'red'}>{t(live ? 'translations.live' : view.ready ? 'translations.readyOff' : 'translations.notReady')}</Badge>}
      >
        <ul className="m-0 list-disc pl-[18px] text-[13px] leading-[1.7]">
          <li>{t('translations.approvedOf', { approved, total })}</li>
          {view.auto.size ? <li>{t('translations.autoCount', { n: view.auto.size })}</li> : null}
          <li>{t(view.flagOn ? 'translations.flagOn' : 'translations.flagOff', { flag: `locale_${lang}` })}</li>
          {lang === 'en' ? null : <li>{t('translations.pilots', { n: view.pilots })}</li>}
        </ul>
        <p className="mb-0 mt-[8px] max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">{t(lang === 'en' ? 'translations.ruleEn' : 'translations.rule')}</p>
      </Card>

      <div className="my-[16px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {sections.map((s) => (
          <Stat
            key={s}
            label={t(`translations.section.${s}`)}
            value={`${view.counts[s].approved} / ${view.counts[s].total}`}
            hint={t('translations.countHint', { workflow: view.counts[s].workflow, stale: view.counts[s].stale })}
          />
        ))}
      </div>

      <div className="grid gap-[16px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        {exportCard(t, lang, view.scope, t('translations.exportLead'))}
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
        <TranslationImportForm key={`${lang}-${view.scope}`} locale={lang} scope={view.scope} labels={importLabels(t)} />
      </Card>

      <nav aria-label={t('translations.filter')} className="my-[18px] flex flex-wrap items-center gap-[6px] text-[13px]">
        {(['all', ...sections] as const).map((s) => (
          <Link key={s} href={href({ section: s === 'all' ? undefined : s, show: show === 'all' ? undefined : show })} aria-current={s === section ? 'page' : undefined} className={pill(s === section)}>
            {s === 'all' ? t('translations.allSections') : t(`translations.section.${s}`)}
          </Link>
        ))}
        <span aria-hidden="true" className="mx-[6px] h-[18px] w-px bg-line" />
        {SHOW.map((w) => (
          <Link key={w} href={href({ section: section === 'all' ? undefined : section, show: w === 'all' ? undefined : w })} aria-current={w === show ? 'page' : undefined} className={pill(w === show)}>
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
                    {view.auto.has(e.key) && s === 'approved' ? <Badge tone="yellow">{t('translations.autoBadge')}</Badge> : null}
                    <span className="break-all font-mono text-[11px] text-mut">{e.key}</span>
                    {c ? <span className="text-[11.5px] text-mut">{t(`translations.origins.${c.source}`)}</span> : null}
                  </span>
                  <div className="mt-[6px] grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                    <Column
                      label={t('translations.bokmal')}
                      lang="nb"
                      text={e.source}
                      note={
                        e.en && lang !== 'en' ? (
                          <p lang="en" className="m-0 mt-[4px] whitespace-pre-wrap text-[12px] leading-[1.5] text-mut">
                            {t('translations.english')}: {e.en}
                          </p>
                        ) : null
                      }
                    />
                    <Column
                      label={nameOf(lang)}
                      lang={lang}
                      text={c?.text ?? null}
                      empty={t('translations.untranslated')}
                      note={c?.notes ? <p className="m-0 mt-[4px] whitespace-pre-wrap text-[12px] leading-[1.5] text-mut">{t('translations.notes')}: {c.notes}</p> : null}
                    />
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

// ---------------------------------------------------------------- bokmål and English pages: messages/ and overrides
async function platformPages(t: T, lang: 'no' | 'en', sp: Awaited<Props['searchParams']>, href: (n: Record<string, string | undefined>) => Route) {
  const v = await platformView(lang)
  if (v === 'not_allowed') return <Problem text={t('common.notAllowed')} />
  if (v === 'failed') return <Problem text={t('common.failed')} />
  const pages = PLATFORM_CATALOGUE.filter((e) => e.view === 'pages')
  const namespaces = [...new Set(pages.map((e) => e.ns))].sort()
  const ns = namespaces.includes(sp.ns ?? '') ? sp.ns! : undefined
  const show: PageShow = (PAGE_SHOW as readonly string[]).includes(sp.show ?? '') ? (sp.show as PageShow) : 'all'
  const q = (sp.q ?? '').trim().toLowerCase().slice(0, 100)
  const matches = pages.filter((e) => {
    if (ns && e.ns !== ns) return false
    const o = v.own.get(e.path)
    if (show === 'overridden' && !o) return false
    if (show === 'waiting' && (!o || o.status === 'approved')) return false
    if (q && !`${e.path}\n${e.no}\n${e.en ?? ''}\n${o?.text ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
  const pageNo = Math.max(1, Math.min(Math.ceil(matches.length / PER_PAGE) || 1, Number(sp.page) || 1))
  const rows = matches.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE)
  const approvedCount = v.rows.filter((r) => r.status === 'approved').length
  const autoCount = v.rows.filter((r) => r.auto).length
  const keep = { ns, show: show === 'all' ? undefined : show, q: q || undefined }
  const pendingItems = v.pending.map((r) => ({ key: r.key, hash: createHash('sha256').update(r.text, 'utf8').digest('hex') }))

  return (
    <>
      <Card title={t('translations.platformTitle', { language: nameOf(lang) })}>
        <ul className="m-0 list-disc pl-[18px] text-[13px] leading-[1.7]">
          <li>{t('translations.platformCount', { n: pages.length, namespaces: namespaces.length })}</li>
          <li>{t('translations.overrideCount', { approved: approvedCount, waiting: v.pending.length })}</li>
          {autoCount ? <li>{t('translations.autoCount', { n: autoCount })}</li> : null}
        </ul>
        <p className="mb-0 mt-[8px] max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">{t(`translations.platformRule.${lang}`)}</p>
      </Card>

      <div className="mt-[16px] grid gap-[16px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-[16px]">
          {exportCard(t, lang, 'pages', t(`translations.exportLeadPlatform.${lang}`))}
          {ns ? exportCard(t, lang, 'pages', t('translations.exportNs', { ns }), ns) : null}
        </div>
        <Card title={t('translations.approveTitle')}>
          {pendingItems.length ? (
            <>
              <p className="mb-[10px] mt-0 text-[13px] leading-[1.55] text-mut">{t('translations.approveOverrides', { n: pendingItems.length })}</p>
              <MessagesApproveForm
                key={pendingItems.map((i) => i.hash).join('')}
                locale={lang}
                items={pendingItems}
                labels={{ read: t('translations.approveRead'), submit: t('translations.approveSubmit', { n: pendingItems.length }), saving: t('legal.saving'), done: t('translations.approveDone'), problems: problemsOf(t) }}
              />
            </>
          ) : (
            <p className="m-0 text-[13px] leading-[1.55] text-mut">{t('translations.approveNoneOverrides')}</p>
          )}
        </Card>
      </div>

      <Card title={t('translations.importTitle')} className="mt-[16px]">
        <p className="mb-[10px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-mut">{t('translations.importLeadPlatform')}</p>
        <TranslationImportForm key={`${lang}-pages`} locale={lang} scope="pages" platform labels={importLabels(t)} />
      </Card>

      <nav aria-label={t('translations.namespaces')} className="mt-[18px] flex flex-wrap items-center gap-[6px] text-[12.5px]">
        <Link href={href({ ...keep, ns: undefined, page: undefined })} aria-current={!ns ? 'page' : undefined} className={pill(!ns)}>
          {t('translations.allNamespaces')}
        </Link>
        {namespaces.map((n) => (
          <Link key={n} href={href({ ...keep, ns: n, page: undefined })} aria-current={n === ns ? 'page' : undefined} className={pill(n === ns)}>
            {n} · {pages.filter((e) => e.ns === n).length}
          </Link>
        ))}
      </nav>
      <div className="my-[14px] flex flex-wrap items-center gap-[6px] text-[13px]">
        {PAGE_SHOW.map((w) => (
          <Link key={w} href={href({ ...keep, show: w === 'all' ? undefined : w, page: undefined })} aria-current={w === show ? 'page' : undefined} className={pill(w === show)}>
            {t(`translations.pageShow.${w}`)}
          </Link>
        ))}
        <form method="get" action="/admin/translations" className="ml-auto flex items-center gap-[6px]">
          <input type="hidden" name="view" value="pages" />
          {lang !== 'no' ? <input type="hidden" name="lang" value={lang} /> : null}
          {ns ? <input type="hidden" name="ns" value={ns} /> : null}
          {show !== 'all' ? <input type="hidden" name="show" value={show} /> : null}
          <label className="sr-only" htmlFor="tr-q">
            {t('translations.search')}
          </label>
          <input id="tr-q" name="q" defaultValue={q} placeholder={t('translations.search')} className="h-[34px] w-[16rem] max-w-full rounded-ctl border border-line bg-bg px-[10px] text-[13px] outline-none focus-visible:border-ink" />
        </form>
      </div>

      <PlatformRows t={t} v={v} rows={rows} />

      {matches.length > PER_PAGE ? (
        <nav aria-label={t('translations.pagination')} className="mt-[12px] flex flex-wrap items-center gap-[6px] text-[13px]">
          {Array.from({ length: Math.ceil(matches.length / PER_PAGE) }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={href({ ...keep, page: p === 1 ? undefined : String(p) })} aria-current={p === pageNo ? 'page' : undefined} className={pill(p === pageNo)}>
              {p}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  )
}

function PlatformRows({ t, v, rows }: { t: T; v: PlatformView; rows: typeof PLATFORM_CATALOGUE }) {
  if (!rows.length) {
    return (
      <Card title={t('translations.textsTitle', { n: 0 })}>
        <p className="m-0 text-[13px] text-mut">{t('translations.none')}</p>
      </Card>
    )
  }
  const side = (e: (typeof rows)[number], l: 'no' | 'en') => {
    const map = l === 'no' ? v.bokmal : v.english
    const o = map.get(e.path)
    const shown = shownText(e, l, map)
    return (
      <Column
        label={l === 'no' ? t('translations.bokmal') : t('translations.english')}
        lang={l === 'no' ? 'nb' : 'en'}
        text={shown}
        empty={t('translations.untranslated')}
        note={
          o ? (
            <p className="m-0 mt-[4px] text-[11.5px] leading-[1.5] text-mut">
              {o.status === 'approved' ? t('translations.overridden') : `${t('translations.waiting')}: ${o.text}`}
            </p>
          ) : null
        }
      />
    )
  }
  return (
    <Card title={t('translations.textsTitle', { n: rows.length })}>
      <ul className="m-0 list-none p-0">
        {rows.map((e) => {
          const o = v.own.get(e.path)
          return (
            <li key={e.key} className="border-t border-line py-[10px]">
              <span className="flex flex-wrap items-center gap-[6px]">
                {o ? (
                  <Badge tone={o.status === 'approved' ? 'green' : 'grey'}>{t(`translations.step.${o.status}`)}</Badge>
                ) : (
                  <Badge tone="grey">{t('translations.fileText')}</Badge>
                )}
                {o?.auto ? <Badge tone="yellow">{t('translations.autoBadge')}</Badge> : null}
                <span className="break-all font-mono text-[11px] text-mut">{e.path}</span>
              </span>
              <div className="mt-[6px] grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                {side(e, 'no')}
                {side(e, 'en')}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
