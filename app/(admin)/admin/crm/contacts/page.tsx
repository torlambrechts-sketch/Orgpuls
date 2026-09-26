import { getTranslations } from 'next-intl/server'
import { CrmTabs } from '@/components/admin/CrmTabs'
import { ContactForm, ImportForm, SettingsForm, type CrmMessages } from '@/components/admin/CrmForms'
import { ALink, Badge, Card, day, PageHead, Problem, Stat, Table, Td } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { CONTACT_TYPES, crmContacts } from '@/lib/admin/crm'

/**
 * The CRM's contacts (0055, D-101): people who sign in, synced from their accounts, and
 * prospects who said yes. Respondents are never here. Each row says what the person is,
 * where the contact came from, on what basis we may write, and whether a campaign would
 * reach them now.
 */
export default async function CrmContacts({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q, type } = await searchParams
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const kind = (CONTACT_TYPES as readonly string[]).includes(type ?? '') ? (type as string) : null
  const [data, who] = await Promise.all([crmContacts(q?.trim() || null, kind), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const c = data.counts

  return (
    <>
      <PageHead title={m.tabs.contacts} lead={m.lead} />
      <CrmTabs current="contacts" labels={m.tabs} />

      <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <Stat label={m.stats.total} value={c.total} hint={CONTACT_TYPES.map((k) => `${m.type[k]} ${c[k]}`).join(' · ')} />
        <Stat label={m.stats.mailable} value={c.mailable} hint={m.stats.mailableHint} />
        <Stat label={m.stats.pending} value={c.pending} />
        <Stat label={m.stats.unsubscribed} value={c.unsubscribed} />
        <Stat label={m.stats.suppressed} value={data.suppressed} />
        <Stat label={m.stats.waiting} value={data.waiting} hint={m.stats.waitingHint} />
      </div>

      <Card className="mt-[16px]">
        <form className="mb-[12px] flex flex-wrap items-end gap-[8px]" action="/admin/crm/contacts">
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder={m.search}
            aria-label={m.search}
            className="box-border h-[38px] min-w-[240px] flex-1 rounded-ctl border border-line bg-bg px-[12px] text-[13.5px]"
          />
          <select
            name="type"
            defaultValue={kind ?? ''}
            aria-label={m.col.type}
            className="box-border h-[38px] rounded-ctl border border-line bg-bg px-[10px] text-[13.5px]"
          >
            <option value="">{m.type.all}</option>
            {CONTACT_TYPES.map((k) => (
              <option key={k} value={k}>
                {m.type[k]}
              </option>
            ))}
          </select>
          <button type="submit" className="h-[38px] cursor-pointer rounded-ctl border border-ink bg-sf px-[14px] text-[13px] font-bold">
            {t('common.search')}
          </button>
        </form>
        <Table
          head={[m.col.contact, m.col.type, m.col.company, m.col.role, m.col.source, m.col.basis, m.col.status, m.col.added]}
          empty={data.rows.length ? undefined : t('common.none')}
        >
          {data.rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <ALink href={`/admin/crm/contacts/${r.id}`}>{r.name ?? r.email}</ALink>
                {r.name ? <span className="block text-[12px] text-mut">{r.email}</span> : null}
              </Td>
              <Td>{m.type[r.type]}</Td>
              <Td wrap>{r.company ?? '—'}</Td>
              <Td>{r.role ? m.roleName[r.role as keyof typeof m.roleName] : '—'}</Td>
              <Td>{m.source[r.source as keyof typeof m.source] ?? r.source}</Td>
              <Td>{m.basis[r.basis]}</Td>
              <Td>
                <span className="flex flex-wrap gap-[4px]">
                  {r.suppressed ? (
                    <Badge tone="red">{m.suppressedBadge}</Badge>
                  ) : r.mailable ? (
                    <Badge tone="green">{m.mailableBadge}</Badge>
                  ) : (
                    <Badge>{m.status[r.status]}</Badge>
                  )}
                </span>
              </Td>
              <Td>{day(r.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      {canWrite ? (
        <div className="mt-[16px] grid items-start gap-[14px] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
          <Card title={m.add.title}>
            <p className="mb-[10px] mt-0 text-[12.5px] leading-[1.5] text-mut">{m.add.lead}</p>
            <ContactForm m={m} common={common} />
          </Card>
          <Card title={m.import.title}>
            <ImportForm m={m} />
          </Card>
        </div>
      ) : null}

      <Card title={m.settings.title} className="mt-[16px]">
        <p className="mb-[10px] mt-0 max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">{m.settings.lead}</p>
        <p className="mb-[10px] mt-0 text-[13px] font-semibold">{data.customer_exception ? m.settings.on : m.settings.off}</p>
        {who?.role === 'super_admin' ? (
          <SettingsForm m={m} common={common} on={data.customer_exception} />
        ) : (
          <p className="m-0 text-[12px] text-mut">{m.settings.superOnly}</p>
        )}
      </Card>
    </>
  )
}
