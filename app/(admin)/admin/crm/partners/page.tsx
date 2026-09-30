import { getTranslations } from 'next-intl/server'
import { KpiStrip, StatusChip } from '@/components/admin/growth'
import { PartnerDialog } from '@/components/admin/GrowthCrmForms'
import { BTN, PageHead, Problem, Stat } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { DOT_CLASS, dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { crmPartners, PARTNER_KINDS, PARTNER_STATUSES, SHARE_KINDS, type Partner } from '@/lib/admin/growthCrm'
import { fmt } from '@/lib/admin/growthCrmView'

const PANEL = 'rounded-panel border border-line bg-sf'
const CARD = `${PANEL} px-[20px] py-[20px] md:px-[26px] md:py-[24px]`
const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'
const MONO = '[font-family:ui-monospace,Menlo,monospace]'
const OPEN =
  'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-bar border border-line bg-transparent px-[10px] py-[6px] text-[12px] font-semibold leading-[normal] text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline'

/**
 * The partner kit, as it truly stands (D-184). The design's sample says the co-branded page is live;
 * /partner/[code] is not built (no design, plan § 7), so it is planned here. The referral code on the
 * organisation at signup is live (0143). The internal dashboard v0 is this page's trials per code.
 * The documents and the export are not in the product, so they are planned until they are.
 */
const KIT = [
  ['page', 'planned'],
  ['code', 'live'],
  ['checklist', 'planned'],
  ['newsletter', 'planned'],
  ['webinar', 'planned'],
  ['dashboard', 'live'],
  ['whitelabel', 'planned'],
] as const

/**
 * Sentral › CRM › Partners (design revision 3, `isPartners`; 0143, D-184). The partners, each with its
 * referral code and the trials attributed to it: an organisation whose signup carried `?ref=CODE`
 * (the site's beacon keeps it with the day's campaign tags, and the signup's source reads it back)
 * counts for that partner, on the organisation, never on a respondent. The public /partner/[code]
 * pages have no design and are not built, so no page is shown beside a code.
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const p = (k: string, v?: Record<string, string | number>) => t(`growth.g3.partners.${k}`, v)
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'crmPartners')) return <Problem text={t('common.notAllowed')} />
  const res = await crmPartners()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const dash = t('growth.g3.dash')
  const rows = res.rows
  const active = rows.filter((r) => r.status === 'pilot_signed').length
  const trials30 = rows.reduce((n, r) => n + r.trials_30, 0)
  const trials7 = rows.reduce((n, r) => n + r.trials_7, 0)
  const share = (r: Partner) => (r.share_kind ? p(`share.${r.share_kind}`, { pct: r.share_pct ?? '' }) : p('share.none'))
  const common = {
    cancel: t('growth.g3.cancel'),
    close: t('growth.g3.close'),
    saving: t('growth.g3.saving'),
    problems: t.raw('growth.g3.problem') as Record<string, string>,
  }
  const options = {
    kinds: PARTNER_KINDS.map((k) => ({ key: k, label: p(`kind.${k}`) })),
    shares: SHARE_KINDS.map((k) => ({ key: k, label: p(`shareOption.${k}`) })),
    statuses: PARTNER_STATUSES.map((k) => ({ key: k, label: p(`status.${k}`) })),
  }
  const form = (submit: string, title: string) => ({
    title,
    sub: p('form.sub'),
    name: p('form.name'),
    org: p('form.org'),
    kind: p('form.kind'),
    contact: p('form.contact'),
    code: p('form.code'),
    shareKind: p('form.shareKind'),
    sharePct: p('form.sharePct'),
    status: p('form.status'),
    none: p('form.none'),
    submit,
  })

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.crmPartners.title')} lead={t('growth.view.crmPartners.lead')} measure={false}>
        {canWrite ? (
          <PartnerDialog trigger={{ label: p('add'), className: `${BTN.primary} leading-[normal]` }} labels={form(p('form.create'), p('form.addTitle'))} options={options} common={common} />
        ) : null}
      </PageHead>

      <KpiStrip>
        <Stat label={p('kpi.active')} value={fmt(active)} hint={p('kpi.activeSub', { total: rows.length })} />
        <Stat label={p('kpi.trials')} value={fmt(trials30)} hint={p('kpi.trialsSub')} />
        <Stat label={p('kpi.week')} value={fmt(trials7)} hint={p('kpi.weekSub')} />
        <Stat label={p('kpi.share')} value={p('kpi.shareValue')} hint={p('kpi.shareSub')} />
      </KpiStrip>

      <div className="mt-[18px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <section className={`${PANEL} min-w-0 overflow-x-auto`}>
          <div role="table" aria-label={p('table')} className="min-w-[660px]">
            <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
              <span role="columnheader" className="flex-[2]">{p('head.partner')}</span>
              <span role="columnheader" className="flex-[1.2]">{p('head.code')}</span>
              <span role="columnheader" className="w-[70px] text-right">{p('head.trials')}</span>
              <span role="columnheader" className="flex-1">{p('head.share')}</span>
              <span role="columnheader" className="w-[150px]">{p('head.status')}</span>
              <span role="columnheader" className="w-[60px]" />
            </div>
            {rows.map((r) => (
              <div key={r.id} role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[12px] text-[13px]">
                <div role="cell" className="min-w-0 flex-[2]">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[12px] text-mut">{p('sub', { kind: p(`kind.${r.kind}`), contact: r.contact ?? dash })}</div>
                </div>
                <div role="cell" className={`min-w-0 flex-[1.2] text-[12px] ${MONO}`}>
                  <div className="font-bold">{r.code ?? dash}</div>
                  {/* no /partner/[code] page is built (no design): the design's path would point at nothing */}
                  <div className="text-mut">{dash}</div>
                </div>
                <b role="cell" className="w-[70px] text-right">
                  {fmt(r.trials_30)}
                </b>
                <span role="cell" className="flex-1 text-[12.5px]">
                  {share(r)}
                </span>
                <span role="cell" className="w-[150px]">
                  <StatusChip tone={dotTone('partner', r.status)}>{p(`status.${r.status}`)}</StatusChip>
                </span>
                <span role="cell" className="flex w-[60px] justify-end">
                  {canWrite ? (
                    <PartnerDialog
                      partner={{ id: r.id, name: r.name, org_number: r.org_number, kind: r.kind, contact: r.contact, code: r.code, share_kind: r.share_kind, share_pct: r.share_pct, status: r.status }}
                      trigger={{ label: t('growth.g3.open'), className: OPEN, ariaLabel: `${t('growth.g3.open')} ${r.name}` }}
                      labels={form(p('form.save'), p('form.editTitle', { name: r.name }))}
                      options={options}
                      common={common}
                    />
                  ) : null}
                </span>
              </div>
            ))}
            {rows.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{p('empty')}</p>}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <section className={CARD}>
            <h2 className="m-0 font-display text-[22px] font-medium">{p('kit.title')}</h2>
            <div className="mt-[4px] text-[12.5px] text-mut">{p('kit.sub')}</div>
            <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
              {KIT.map(([item, state]) => (
                <li key={item} className="flex items-center gap-[10px] border-b border-line py-[9px] text-[13px]">
                  <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${DOT_CLASS[dotTone('kit', state)]}`} />
                  <span className="flex-1 [text-wrap:pretty]">{p(`kit.item.${item}`)}</span>
                  <span className="text-[12px] text-mut">{p(`kit.state.${state}`)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={CARD}>
            <h2 className="m-0 font-display text-[22px] font-medium">{p('who.title')}</h2>
            <div className="mt-[12px] flex flex-col gap-[10px]">
              {(['accountants', 'bht', 'hms', 'bransje'] as const).map((key) => (
                <div key={key} className="rounded-cta border border-line bg-bg px-[14px] py-[12px] text-[13px] leading-[1.5] [text-wrap:pretty]">
                  {t.rich(`growth.g3.partners.who.${key}`, { b: (ch) => <b>{ch}</b>, mut: (ch) => <span className="text-mut">{ch}</span> })}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
