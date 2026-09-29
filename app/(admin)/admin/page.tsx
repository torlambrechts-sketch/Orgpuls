import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Business } from '@/components/admin/Business'
import { Avatar, PageHead, Problem, Stat } from '@/components/admin/ui'
import { attention, auditList, isError, kpis, type AuditRow } from '@/lib/admin/api'
import { cmsPages, type CmsPage } from '@/lib/admin/cms'
import { catalogues, designedMeta } from '@/lib/admin/cmsSite'
import { crmStages } from '@/lib/admin/crm'
import { CMS_LOCALES, parseContent, pathOf, type CmsLocale } from '@/lib/cms/content'
import { designedPages } from '@/lib/cms/designed'

/**
 * Sentral's Overview (X-095, the design's `isOverview`): the site at a glance in four figures, what
 * needs an admin next, what admins did lately, how much of the site is in each language, and where
 * the pipeline stands. Every figure is read, none drawn: the design's money (monthly recurring,
 * deal value) is left out until billing exists (Tor, 2026-09-29), so the second card counts trials
 * and the pipeline counts companies. A block the caller's role cannot read is not drawn.
 */
const DAY = 86_400_000
const osloDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' })
const osloTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' })
const osloDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short' })
const VIZ = ['bg-viz1', 'bg-viz2', 'bg-viz3', 'bg-viz4', 'bg-viz5'] as const

export default async function Overview() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const d = (k: string, v?: Record<string, string | number>) => t(`dashboard.${k}`, v)
  const [k, att, pages, stages, audit, cat] = await Promise.all([kpis(), attention(), cmsPages(), crmStages(), auditList(null, 200), catalogues()])
  const now = Date.now()
  const daysTo = (iso: string) => Math.max(1, Math.ceil((new Date(iso).getTime() - now) / DAY))

  // ---------------------------------------------------------------- the site's pages
  const site = isError(pages) ? null : pageFacts(pages.rows, cat)

  // ---------------------------------------------------------------- needs attention
  type Item = { key: string; text: string; why: string; action: string; href: string }
  const items: Item[] = []
  if (!isError(att)) {
    for (const x of att.trials)
      items.push({
        key: `trial-${x.org_id}`,
        text: d('attention.trial', { name: x.name, days: daysTo(x.ends_at) }),
        why: d('attention.trialWhy', { count: x.employees }),
        action: d('attention.openCustomer'),
        href: `/admin/orgs/${x.org_id}`,
      })
    for (const x of att.deletions)
      items.push({
        key: `del-${x.org_id}`,
        text: d('attention.deletion', { name: x.name, days: daysTo(x.due_at) }),
        why: d('attention.deletionWhy', { date: osloDate.format(new Date(x.due_at)) }),
        action: d('attention.openCustomer'),
        href: `/admin/orgs/${x.org_id}`,
      })
    for (const x of att.tickets)
      items.push({
        key: `ticket-${x.id}`,
        text: d('attention.ticket', { number: x.number, subject: x.subject }),
        why: x.org_name ? d('attention.ticketWhyOrg', { org: x.org_name, time: when(x.due_at, t) }) : d('attention.ticketWhy', { time: when(x.due_at, t) }),
        action: d('attention.openTicket'),
        href: `/admin/tickets/${x.id}`,
      })
    if (att.failures)
      items.push({ key: 'failures', text: d('attention.failures', { count: att.failures }), why: d('attention.failuresWhy'), action: d('attention.openOps'), href: '/admin/ops' })
    if (att.tasks)
      items.push({ key: 'tasks', text: d('attention.tasks', { count: att.tasks }), why: d('attention.tasksWhy'), action: d('attention.openCrm'), href: '/admin/crm' })
  }
  if (site?.missing)
    items.push({ key: 'langs', text: d('attention.langs', { count: site.missing }), why: d('attention.langsWhy'), action: d('attention.openPages'), href: '/admin/cms' })
  if (site?.nodesc)
    items.push({ key: 'desc', text: d('attention.desc', { count: site.nodesc }), why: d('attention.descWhy'), action: d('attention.openPages'), href: '/admin/cms?f=attention' })

  // ---------------------------------------------------------------- recent activity: changes, not reads
  const titles = new Map(isError(pages) ? [] : pages.rows.map((p) => [p.id, pathOf(p.kind, p.slug)]))
  const recent = isError(audit) ? null : audit.rows.filter((a) => t.has(`dashboard.did.${a.action.replace(/\./g, '_')}`)).slice(0, 6)

  // ---------------------------------------------------------------- the pipeline
  const open = isError(stages) ? [] : stages.rows.filter((s) => s.kind === 'open' && !s.archived).sort((a, b) => a.sort - b.sort)
  const inOpen = open.reduce((n, s) => n + s.companies, 0)
  const won = isError(stages) ? 0 : stages.rows.filter((s) => s.kind === 'won').reduce((n, s) => n + s.companies, 0)
  const maxStage = Math.max(1, ...open.map((s) => s.companies))

  return (
    <>
      <PageHead title={d('glance', { site: t('nav.siteName') })} lead={k && !isError(k) ? d('tag', { count: k.orgs, domain: t('nav.siteDomain') }) : undefined} />

      <div className="grid gap-[16px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {isError(k) ? null : (
          <>
            <Stat label={d('kpi.active')} value={k.paying} hint={d('kpi.activeSub', { trial: k.trials_active, expired: k.trials_expired })} />
            <Stat label={d('kpi.trials')} value={k.trials_active} hint={d('kpi.trialsSub', { count: k.trials_expiring_7d })} />
          </>
        )}
        {isError(stages) ? null : <Stat label={d('kpi.pipeline')} value={inOpen} hint={d('kpi.pipelineSub', { stages: open.length, won })} />}
        {site ? (
          <Stat
            label={d('kpi.pages')}
            value={d('kpi.pagesValue', { live: site.live, total: site.total })}
            hint={d('kpi.pagesSub', { drafts: site.drafts, scheduled: site.scheduled })}
          />
        ) : null}
      </div>
      {isError(k) && k.error !== 'not_allowed' ? (
        <div className="mt-[12px]">
          <Problem text={t('common.failed')} />
        </div>
      ) : null}

      <div className="mt-[18px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(300px,.9fr)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Panel>
            <div className="flex items-baseline justify-between gap-[12px]">
              <h2 className="m-0 font-display text-[22px] font-medium">{d('attention.title')}</h2>
              <span className="text-[12.5px] text-mut">{d('attention.count', { count: items.length })}</span>
            </div>
            {items.length ? (
              <ul className="m-0 mt-[16px] flex list-none flex-col gap-[8px] p-0">
                {items.map((a) => (
                  <li key={a.key} className="flex items-center gap-[12px] rounded-[12px] border border-line bg-bg px-[14px] py-[12px]">
                    <span aria-hidden="true" className="block h-[6px] w-[6px] flex-none rounded-pill bg-peach" />
                    <div className="min-w-0 flex-1 text-[13.5px]">
                      {a.text}
                      <span className="block text-[12px] text-mut">{a.why}</span>
                    </div>
                    <Link
                      href={a.href as Route}
                      className="whitespace-nowrap rounded-bar border border-line px-[12px] py-[7px] text-[12px] font-semibold text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline"
                    >
                      {a.action}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-[16px] text-[13px] text-mut">{d('attention.none')}</p>
            )}
          </Panel>

          {recent ? (
            <Panel>
              <div className="flex items-baseline justify-between gap-[12px]">
                <h2 className="m-0 font-display text-[22px] font-medium">{d('activity.title')}</h2>
                <Link href={'/admin/audit' as Route} className="text-[12.5px] font-semibold text-ink no-underline hover:text-ink hover:underline">
                  {d('activity.open')}
                </Link>
              </div>
              {recent.length ? (
                <ul className="m-0 mt-[10px] flex list-none flex-col p-0">
                  {recent.map((a) => {
                    const target = targetOf(a, titles)
                    return (
                      <li key={a.id} className="flex items-center gap-[12px] border-b border-line py-[11px]">
                        <Avatar name={a.admin_email ?? '·'} />
                        <div className="min-w-0 flex-1 text-[13.5px]">
                          <span className="font-semibold">{firstName(a.admin_email)}</span> {d(`did.${a.action.replace(/\./g, '_')}`)}
                          {target ? <span className="font-semibold"> {target}</span> : null}
                        </div>
                        <span className="whitespace-nowrap text-[12px] text-mut">{when(a.at, t)}</span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mb-0 mt-[10px] text-[13px] text-mut">{d('activity.none')}</p>
              )}
            </Panel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-[18px]">
          {site ? (
            <Panel>
              <h2 className="m-0 font-display text-[22px] font-medium">{d('coverage.title')}</h2>
              <p className="mb-0 mt-[4px] text-[12.5px] text-mut">{d('coverage.lead')}</p>
              <div className="mt-[16px] flex flex-col gap-[12px]">
                {CMS_LOCALES.map((l) => (
                  <BarRow
                    key={l}
                    name={d(`coverage.lang.${l}`)}
                    pct={site.published ? Math.round((100 * site.byLang[l]) / site.published) : 0}
                    colour="bg-ac"
                    figure={<><b>{site.published ? Math.round((100 * site.byLang[l]) / site.published) : 0} %</b> <span className="text-mut">{`${site.byLang[l]}/${site.published}`}</span></>}
                  />
                ))}
              </div>
            </Panel>
          ) : null}

          {isError(stages) ? null : (
            <Panel>
              <h2 className="m-0 font-display text-[22px] font-medium">{d('pipeline.title')}</h2>
              <p className="mb-0 mt-[4px] text-[12.5px] text-mut">{d('pipeline.lead', { count: inOpen, stages: open.length })}</p>
              <div className="mt-[16px] flex flex-col gap-[12px]">
                {open.map((s, i) => (
                  <BarRow
                    key={s.key}
                    name={s.name}
                    pct={Math.round((100 * s.companies) / maxStage)}
                    colour={VIZ[i % VIZ.length]!}
                    figure={<><b>{s.companies}</b> <span className="text-mut">{d('pipeline.companies', { count: s.companies })}</span></>}
                  />
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <Business t={t} />
    </>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">{children}</section>
}

function BarRow({ name, pct, colour, figure }: { name: string; pct: number; colour: string; figure: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[12px]">
      <span className="w-[92px] flex-none text-[13px] font-semibold">{name}</span>
      <span className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]" aria-hidden="true">
        <span className={`block h-full rounded-pill ${colour}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="min-w-[78px] whitespace-nowrap text-right text-[12.5px]">{figure}</span>
    </div>
  )
}

/** Today's changes show the time, yesterday's say so, older ones their date */
function when(iso: string, t: (k: string, v?: Record<string, string>) => string) {
  const at = new Date(iso)
  const day = osloDay.format(at)
  const time = osloTime.format(at)
  if (day === osloDay.format(new Date())) return time
  if (day === osloDay.format(new Date(Date.now() - DAY))) return t('dashboard.activity.yesterday', { time })
  return `${osloDate.format(at)} ${time}`
}

const firstName = (email: string | null) => {
  const w = (email ?? '').split('@')[0]!.split(/[._-]+/)[0] ?? ''
  return w ? w[0]!.toUpperCase() + w.slice(1) : '—'
}

/** What the change was made to, where the row says so without reading anything more */
function targetOf(a: AuditRow, pages: Map<string, string>): string | null {
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

/** Published, draft and scheduled pages, and each language's share of the published ones */
function pageFacts(rows: CmsPage[], cat: Awaited<ReturnType<typeof catalogues>>) {
  const byLang: Record<CmsLocale, number> = { no: 0, en: 0 }
  let published = 0
  let missing = 0
  let nodesc = 0
  for (const p of designedPages()) {
    const meta = designedMeta(p, cat)
    const langs = CMS_LOCALES.filter((l) => meta[l])
    if (!langs.length) continue
    published++
    for (const l of langs) byLang[l]++
    if (langs.length < CMS_LOCALES.length) missing++
    if (langs.some((l) => !meta[l]!.description.trim())) nodesc++
  }
  const made = rows.filter((p) => !p.archived)
  let drafts = 0
  let scheduled = 0
  for (const p of made) {
    const live = p.locales.filter((l) => l.current)
    if (p.locales.some((l) => l.pending_at && new Date(l.pending_at) > new Date())) scheduled++
    if (!live.length) {
      drafts++
      continue
    }
    published++
    for (const l of live) byLang[l.locale]++
    if (live.length < CMS_LOCALES.length) missing++
    if (live.some((l) => !parseContent(l.current)?.description.trim())) nodesc++
  }
  return { byLang, published, missing, nodesc, drafts, scheduled, live: published, total: published + drafts }
}
