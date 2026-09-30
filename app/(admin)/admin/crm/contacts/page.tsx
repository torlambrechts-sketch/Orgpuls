import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ImportDialog } from '@/components/admin/ContactDialogs'
import { ContactForm, SettingsForm, type CrmMessages } from '@/components/admin/CrmForms'
import { Icon } from '@/components/admin/icons'
import { Avatar, Badge, BTN, Card, PageHead, Problem, Segments, type BadgeTone } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { CONTACT_TYPES, crmContacts, crmLists, crmSegments, type Contact } from '@/lib/admin/crm'
import { AudienceTabs } from '@/components/admin/AudienceTabs'

/**
 * Contacts & lists (X-095, the design's `isContacts`; 0055, D-101 before it): people who sign in,
 * synced from their accounts, and prospects who said yes — respondents are never here. Each row says
 * who the person is, their company and role, their lifecycle stage and whether mail would reach them.
 * Beside them the lists: segments are rules, so people join and leave as their stage changes, and
 * the subscription lists people signed up to. Adding one contact, the import and the house rule on
 * customers follow below.
 */
const STAGE_DOT: Record<(typeof CONTACT_TYPES)[number], BadgeTone> = { prospect: 'yellow', trial: 'yellow', customer: 'green', former: 'grey' }

export default async function CrmContacts({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q, type } = await searchParams
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const cl = (k: string, v?: Record<string, string | number>) => t(`crm.contactsPage.${k}`, v)
  const kind = (CONTACT_TYPES as readonly string[]).includes(type ?? '') ? (type as (typeof CONTACT_TYPES)[number]) : null
  const query = q?.trim().slice(0, 100) || null
  const [data, who, segments, lists] = await Promise.all([crmContacts(query, kind), whoami(), crmSegments(), crmLists()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const c = data.counts
  const href = (k: string | null) => {
    const qs = new URLSearchParams(Object.entries({ q: query ?? '', type: k ?? '' }).filter(([, v]) => v)).toString()
    return `/admin/crm/contacts${qs ? `?${qs}` : ''}`
  }

  return (
    <>
      <PageHead title={cl('title')} lead={cl('lead', { count: c.total, site: t('nav.siteName'), not: c.total - c.mailable })}>
        {canWrite ? (
          <div className="flex gap-[10px]">
            <Link href={'/admin/crm/segments?new' as Route} className={BTN.secondary}>
              {cl('newList')}
            </Link>
            <ImportDialog m={m} label={cl('import')} title={m.import.title} sub={cl('importSub')} close={cl('close')} />
          </div>
        ) : null}
      </PageHead>
      <AudienceTabs on="contacts" />

      <div className="grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <section className="min-w-0 rounded-panel border border-line bg-sf">
          <div className="flex flex-wrap items-center gap-[10px] px-[20px] py-[16px]">
            <form method="get" action="/admin/crm/contacts" role="search" className="flex h-[38px] items-center gap-[8px] rounded-ctl border border-line bg-bg px-[13px]">
              <span className="flex-none text-mut">
                <Icon name="search" size={14} />
              </span>
              <input name="q" defaultValue={query ?? ''} placeholder={cl('search')} aria-label={cl('searchLabel')} className="box-border w-[200px] max-w-full border-0 bg-transparent text-[13px] text-ink outline-none" />
              {kind ? <input type="hidden" name="type" value={kind} /> : null}
            </form>
            <Segments
              label={cl('segments')}
              items={[
                { key: 'all', label: cl('stage.all'), n: c.total, href: href(null), on: !kind },
                ...CONTACT_TYPES.map((k) => ({ key: k, label: cl(`stage.${k}`), n: c[k], href: href(k), on: kind === k })),
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div aria-hidden="true" className="flex items-center gap-[14px] border-y border-line px-[20px] pb-[10px] pt-[12px] text-[11px] uppercase tracking-[0.09em] text-mut">
                <span className="flex-[2.2]">{cl('col.contact')}</span>
                <span className="flex-[1.6]">{cl('col.company')}</span>
                <span className="w-[96px]">{cl('col.stage')}</span>
                <span className="w-[118px]">{cl('col.consent')}</span>
                <span className="w-[70px]" />
              </div>
              <ul className="m-0 list-none p-0">
                {data.rows.map((r) => (
                  <Row key={r.id} r={r} m={m} labels={{ stage: cl(`stage.${r.type}`), consent: consentLabel(r, cl), open: cl('open') }} />
                ))}
              </ul>
              {data.rows.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{query || kind ? cl('noMatch') : t('common.none')}</p>}
            </div>
          </div>
        </section>

        <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
          <h2 className="m-0 font-display text-[22px] font-medium">{cl('lists')}</h2>
          <p className="mb-0 mt-[4px] text-[12.5px] text-mut">{cl('listsLead')}</p>
          <ul className="m-0 mt-[16px] flex list-none flex-col gap-[8px] p-0">
            {isError(segments)
              ? null
              : segments.rows.map((s) => (
                  <ListCard key={s.id} href={`/admin/crm/segments?id=${s.id}`} name={s.name} n={s.mailable} note={s.total > s.mailable ? cl('excluded', { count: s.total - s.mailable }) : cl('everyone')} />
                ))}
            {isError(lists)
              ? null
              : lists.rows
                  .filter((l) => !l.archived)
                  .map((l) => (
                    <ListCard key={l.id} href="/admin/crm/lists" name={l.name_en || l.name_no} n={l.subscribed} note={l.unsubscribed ? cl('unsubscribed', { count: l.unsubscribed }) : cl('everyone')} />
                  ))}
          </ul>
          {(isError(segments) || !segments.rows.length) && (isError(lists) || !lists.rows.length) ? <p className="mb-0 mt-[12px] text-[13px] text-mut">{cl('noLists')}</p> : null}
        </section>
      </div>

      {canWrite ? (
        <Card title={m.add.title} className="mt-[18px]">
          <p className="mb-[10px] mt-0 text-[12.5px] leading-[1.5] text-mut">{m.add.lead}</p>
          <ContactForm m={m} common={common} />
        </Card>
      ) : null}

      <Card title={m.settings.title} className="mt-[18px]">
        <p className="mb-[10px] mt-0 max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">{m.settings.lead}</p>
        <p className="mb-[10px] mt-0 text-[13px] font-semibold">{data.customer_exception ? m.settings.on : m.settings.off}</p>
        {who?.role === 'super_admin' ? <SettingsForm m={m} common={common} on={data.customer_exception} /> : <p className="m-0 text-[12px] text-mut">{m.settings.superOnly}</p>}
      </Card>
    </>
  )
}

/** Whether mail would reach the person, and why not: suppressed after a bounce, unsubscribed, waiting for a confirmation */
function consentLabel(r: Contact, cl: (k: string) => string): { text: string; dot: string } {
  if (r.suppressed) return { text: cl('consent.suppressed'), dot: 'bg-peach' }
  if (r.status === 'unsubscribed') return { text: cl('consent.unsubscribed'), dot: 'bg-peach' }
  if (r.status === 'pending') return { text: cl('consent.pending'), dot: 'bg-ac' }
  if (r.mailable) return { text: cl('consent.reachable'), dot: 'bg-teal' }
  return { text: cl('consent.noBasis'), dot: 'bg-mut' }
}

function Row({ r, m, labels }: { r: Contact; m: CrmMessages; labels: { stage: string; consent: { text: string; dot: string }; open: string } }) {
  const href = `/admin/crm/contacts/${r.id}` as Route
  return (
    <li className="relative flex items-center gap-[14px] border-b border-line px-[20px] py-[12px] hover:bg-bg">
      <div className="flex min-w-0 flex-[2.2] items-center gap-[12px]">
        <Avatar name={r.name ?? r.email} />
        <div className="min-w-0">
          <Link href={href} className="block text-[13.5px] font-semibold text-ink no-underline after:absolute after:inset-0 hover:text-ink hover:no-underline">
            {r.name ?? r.email}
          </Link>
          <div className="truncate text-[12px] text-mut">{r.email}</div>
        </div>
      </div>
      <div className="min-w-0 flex-[1.6] text-[13px]">
        <div className="font-semibold">{r.company ?? r.org_name ?? '—'}</div>
        <div className="text-[12px] text-mut">{r.role ? m.roleName[r.role as keyof typeof m.roleName] : ''}</div>
      </div>
      <div className="w-[96px]">
        <Badge tone={STAGE_DOT[r.type]}>{labels.stage}</Badge>
      </div>
      <div className="flex w-[118px] items-center gap-[6px] text-[12.5px]">
        <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${labels.consent.dot}`} />
        {labels.consent.text}
      </div>
      <div className="relative flex w-[70px] justify-end">
        <Link href={href} className={BTN.row} tabIndex={-1} aria-hidden="true">
          {labels.open}
        </Link>
      </div>
    </li>
  )
}

function ListCard({ href, name, n, note }: { href: string; name: string; n: number; note: string }) {
  return (
    <li>
      <Link href={href as Route} className="flex items-center gap-[12px] rounded-[12px] border border-line bg-bg px-[14px] py-[12px] text-ink no-underline hover:border-ink hover:text-ink hover:no-underline">
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">{name}</span>
          <span className="block text-[12px] text-mut">{note}</span>
        </span>
        <span className="text-[20px] font-bold">{n}</span>
      </Link>
    </li>
  )
}
