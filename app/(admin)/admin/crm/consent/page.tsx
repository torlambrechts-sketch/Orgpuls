import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { KpiStrip, StatusChip } from '@/components/admin/growth'
import { AddSuppressionDialog, PhoneNoticeDialog } from '@/components/admin/GrowthCrmForms'
import { BTN, PageHead, Problem, Stat } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { ADMIN_SUPPRESSION_REASONS, consentLedger, type ConsentRow } from '@/lib/admin/growthCrm'
import { dayLabel, fmt, pct, shortHash, stamp, stampAfter } from '@/lib/admin/growthCrmView'

const PANEL = 'rounded-panel border border-line bg-sf'
const CARD = `${PANEL} px-[20px] py-[20px] md:px-[26px] md:py-[24px]`
const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'
/**
 * the design's row «Open»: 6 × 10 at radius 9 (the table rows elsewhere use BTN.row's 7 × 12). The design's
 * controls are <button>s, whose line-height is the browser's normal, so each control here sets it too.
 */
const OPEN =
  'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-bar border border-line bg-transparent px-[10px] py-[6px] text-[12px] font-semibold leading-[normal] text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline'

/**
 * Sentral › Marketing › Consent (design revision 3, `isConsent`; 0141 + 0143, D-184). Everything is
 * read from G1's ledger as it stands:
 *
 *   the figures        marketing contacts (latest marketing record granted) and the share of contacts
 *                      with any record; double opt-ins confirmed against those still waiting; withdrawals
 *                      in 30 days; granted contacts without a click in 180 days (R8 is not built, and
 *                      the card says so)
 *   the ledger         the twenty latest records, newest first; a withdrawal is its own record. A phone
 *                      notice is a company's record (0143). «Open» goes to the contact or the company
 *   preference centre  each purpose with the contacts holding it and how many of those confirmed a
 *                      double opt-in
 *   suppression        the latest hashes (four and two characters of the SHA-256), reason and day
 *   the law            the design's three paragraphs, from the messages
 *
 * Export ledger (CSV), Add suppression (hashed) and Record phone notice are the CRM's writers' (the
 * database checks and logs each).
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const c = (k: string, v?: Record<string, string | number>) => t(`growth.g3.consent.${k}`, v)
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'crmConsent')) return <Problem text={t('common.notAllowed')} />
  const res = await consentLedger()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const now = new Date()
  const common = {
    cancel: t('growth.g3.cancel'),
    close: t('growth.g3.close'),
    saving: t('growth.g3.saving'),
    problems: t.raw('growth.g3.problem') as Record<string, string>,
  }
  const k = res.kpis
  const withRecord = pct(k.with_record, k.contacts)
  const doi = pct(k.doi_confirmed, k.doi_confirmed + k.doi_pending)
  const purposeName = (key: string, list: string | null) =>
    key === 'marketing' || key === 'phone_outreach' ? c(`purpose.${key}`) : (list ?? key.replace(/^list:/, ''))
  const doiText = (r: ConsentRow) => {
    if (r.purpose === 'phone_outreach') return c('doi.notApplicable')
    if (r.doi_confirmed_at && r.doi_sent_at)
      return c('doi.sentConfirmed', { sent: stamp(r.doi_sent_at, now, t('growth.g3.today').toLowerCase()), confirmed: stampAfter(r.doi_sent_at, r.doi_confirmed_at, now) })
    if (r.doi_confirmed_at) return c('doi.confirmed', { confirmed: stamp(r.doi_confirmed_at, now, t('growth.g3.today').toLowerCase()) })
    if (r.status === 'not_given' || !r.basis) return c('doi.none')
    return r.basis === 'consent' ? c('doi.none') : c('doi.notRequired')
  }
  const openHref = (r: ConsentRow) => (r.contact_id ? `/admin/crm/contacts/${r.contact_id}` : `/admin/crm/prospects/${r.company_id}`) as Route

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.crmConsent.title')} lead={t('growth.view.crmConsent.lead')} measure={false}>
        {canWrite ? (
          <div className="flex flex-wrap gap-[10px] leading-[normal]">
            {/* a file to save, from a route handler: a plain link (D-06), styled as the design's button */}
            <a href="/admin/crm/consent/export" download className={BTN.secondary}>
              {c('export')}
            </a>
            <PhoneNoticeDialog
              labels={{
                open: c('recordPhone'),
                title: c('phoneForm.title'),
                sub: c('phoneForm.sub'),
                org: c('phoneForm.org'),
                outcome: c('phoneForm.outcome'),
                notice: c('phoneForm.notice'),
                objected: c('phoneForm.objected'),
                submit: c('phoneForm.submit'),
              }}
              common={common}
            />
            <AddSuppressionDialog
              labels={{ open: c('addSup'), title: c('addSupForm.title'), sub: c('addSupForm.sub'), email: c('addSupForm.email'), reason: c('addSupForm.reason'), submit: c('addSupForm.submit') }}
              reasons={ADMIN_SUPPRESSION_REASONS.map((r) => ({ key: r, label: c(`sup.reason.${r}`) }))}
              common={common}
            />
          </div>
        ) : null}
      </PageHead>

      <KpiStrip>
        <Stat label={c('kpi.marketing')} value={fmt(k.marketing)} hint={withRecord === null ? c('kpi.marketingNone') : c('kpi.marketingSub', { pct: withRecord })} />
        <Stat label={c('kpi.doi')} value={doi === null ? t('growth.g3.dash') : `${doi} %`} hint={c('kpi.doiSub')} />
        <Stat label={c('kpi.withdrawn')} value={fmt(k.withdrawn_30d)} hint={c('kpi.withdrawnSub')} />
        <Stat label={c('kpi.sunset')} value={fmt(k.sunset)} hint={c('kpi.sunsetSub')} />
      </KpiStrip>

      <div className="mt-[18px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <section className={`${PANEL} min-w-0 overflow-x-auto`}>
          <div className="min-w-[680px]">
            <div className="px-[20px] pt-[20px]">
              <h2 className="m-0 font-display text-[22px] font-medium">{c('ledger.title')}</h2>
              <div className="mt-[4px] text-[12.5px] text-mut">{c('ledger.sub', { count: res.rows.length })}</div>
            </div>
            <div role="table" aria-label={c('ledger.table')}>
              <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
                <span role="columnheader" className="flex-[1.6]">{c('ledger.head.who')}</span>
                <span role="columnheader" className="flex-[1.4]">{c('ledger.head.basis')}</span>
                <span role="columnheader" className="flex-[1.2]">{c('ledger.head.doi')}</span>
                <span role="columnheader" className="w-[110px]">{c('ledger.head.status')}</span>
                <span role="columnheader" className="w-[60px]" />
              </div>
              {res.rows.map((r) => {
                const name = r.who ?? t('growth.g3.dash')
                return (
                  <div key={r.id} role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[12px] text-[13px]">
                    <div role="cell" className="min-w-0 flex-[1.6]">
                      <div className="font-semibold">{name}</div>
                      <div className="text-[12px] text-mut">
                        {c('ledger.whoLine', { purpose: purposeName(r.purpose, r.list), channel: c(`channel.${r.company_id ? 'phone' : 'email'}`) })}
                      </div>
                    </div>
                    <div role="cell" className="min-w-0 flex-[1.4] text-[12.5px]">
                      <div className="font-semibold">{c(`basis.${r.basis ?? 'none'}`)}</div>
                      <div className="text-[12px] text-mut">{c(`method.${r.method}`)}</div>
                    </div>
                    <div role="cell" className="min-w-0 flex-[1.2] text-[12px] text-mut">
                      {doiText(r)}
                    </div>
                    <div role="cell" className="w-[110px]">
                      <StatusChip tone={dotTone('consent', r.status)}>{c(`status.${r.status}`)}</StatusChip>
                    </div>
                    <div role="cell" className="flex w-[60px] justify-end">
                      <Link href={openHref(r)} className={OPEN} aria-label={c('ledger.openLabel', { who: name })}>
                        {t('growth.g3.open')}
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
            {res.rows.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{c('ledger.empty')}</p>}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <section className={CARD}>
            <h2 className="m-0 font-display text-[22px] font-medium">{c('pref.title')}</h2>
            <div className="mt-[4px] text-[12.5px] text-mut">{c('pref.sub')}</div>
            <div className="mt-[8px] flex flex-col">
              {res.purposes.map((p) => {
                const share = pct(p.doi, p.consent)
                return (
                  <div key={p.key} className="flex items-center gap-[10px] border-b border-line py-[10px] text-[13px]">
                    <span className="flex-1 font-semibold [text-wrap:pretty]">{purposeName(p.key, p.list)}</span>
                    <b>{fmt(p.granted)}</b>
                    <span className="min-w-[88px] text-right text-[12px] text-mut">
                      {share !== null ? c('pref.doi', { pct: share }) : p.granted ? c('pref.doiNotRequired') : c('pref.doiNone')}
                    </span>
                  </div>
                )
              })}
              {res.purposes.length ? null : <div className="py-[10px] text-[13px] text-mut">{c('pref.empty')}</div>}
            </div>
          </section>

          <section className={CARD}>
            <div className="flex items-baseline justify-between gap-[10px]">
              <h2 className="m-0 font-display text-[22px] font-medium">{c('sup.title')}</h2>
              <span className="text-[12.5px] text-mut">{c('sup.count', { count: fmt(res.suppression.count) })}</span>
            </div>
            <div className="mt-[8px] flex flex-col">
              {res.suppression.rows.map((x) => (
                <div key={`${x.head}${x.tail}${x.at}`} className="flex items-center gap-[10px] border-b border-line py-[10px] text-[13px]">
                  <span className="min-w-[70px] text-[12px] [font-family:ui-monospace,Menlo,monospace]">{shortHash(x.head, x.tail)}</span>
                  <span className="flex-1 [text-wrap:pretty]">{c(`sup.reason.${x.reason}`)}</span>
                  <span className="whitespace-nowrap text-[12px] text-mut">{dayLabel(x.at, { today: t('growth.g3.today'), yesterday: t('growth.g3.yesterday') }, now)}</span>
                </div>
              ))}
              {res.suppression.rows.length ? null : <div className="py-[10px] text-[13px] text-mut">{c('sup.empty')}</div>}
            </div>
            <div className="mt-[12px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{c('sup.foot')}</div>
          </section>

          <section className={CARD}>
            <h2 className="m-0 font-display text-[22px] font-medium">{c('law.title')}</h2>
            <div className="mt-[12px] flex flex-col gap-[10px] text-[13px] leading-[1.5] [text-wrap:pretty]">
              {(['named', 'customers', 'quality'] as const).map((key) => (
                <div key={key} className="rounded-cta border border-line bg-bg px-[14px] py-[12px]">
                  {t.rich(`growth.g3.consent.law.${key}`, { b: (ch) => <b>{ch}</b> })}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
