import { getTranslations } from 'next-intl/server'
import { ContactActionForm, ContactForm, type CrmMessages } from '@/components/admin/CrmForms'
import { ContactListForms } from '@/components/admin/CrmPipelineForms'
import { CrmTabs } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, day, PageHead, Problem, Table, Td, when } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmContact, crmLists } from '@/lib/admin/crm'

/**
 * One contact (D-101): who they are, the consent we hold and where it came from, every mail
 * the CRM sent them with its delivery, opens and clicks, and the two ways to stop: an
 * unsubscribe on their behalf, or erasure.
 */
export default async function CrmContact({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const [data, who, lists] = await Promise.all([crmContact(id), whoami(), crmLists()])
  const listOptions = isError(lists) ? [] : lists.rows.filter((l) => !l.archived).map((l) => ({ id: l.id, key: l.key, name: l.name_no }))
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const c = data.contact
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex flex-wrap gap-x-[10px] border-b border-line py-[7px] text-[13px] last:border-b-0">
      <span className="w-[140px] flex-none text-mut">{k}</span>
      <span className="min-w-0 flex-1">{v}</span>
    </div>
  )

  return (
    <>
      <PageHead title={c.name ?? c.email} lead={c.name ? c.email : undefined}>
        <ALink href="/admin/crm/contacts">{m.contact.back}</ALink>
      </PageHead>
      <CrmTabs current="contacts" labels={m.tabs} />

      <div className="grid items-start gap-[14px] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={m.contact.details}>
          {row(m.col.type, m.type[c.type])}
          {row(m.contact.org, c.org_id ? <ALink href={`/admin/orgs/${c.org_id}`}>{c.org_name ?? '—'}</ALink> : (c.company ?? '—'))}
          {row(m.contactLists.company, c.company_id ? <ALink href={`/admin/crm/prospects/${c.company_id}`}>{c.company ?? '—'}</ALink> : m.contactLists.noCompany)}
          {row(m.add.orgNumber, c.org_number ?? '—')}
          {row(m.col.role, c.role ? m.roleName[c.role as keyof typeof m.roleName] : '—')}
          {row(m.col.source, m.source[c.source as keyof typeof m.source] ?? c.source)}
          {row(m.col.tags, c.tags.length ? c.tags.join(', ') : '—')}
          {row(m.add.lang, c.lang === 'en' ? 'English' : 'Norsk')}
          {row(m.col.added, day(c.created_at))}
          {row(m.col.engaged, when(c.last_engaged_at))}
          {row(
            m.col.status,
            <span className="flex flex-wrap gap-[4px]">
              <Badge>{m.status[c.status]}</Badge>
              {c.suppressed ? <Badge tone="red">{m.suppressedBadge}</Badge> : null}
              {c.mailable ? <Badge tone="green">{m.mailableBadge}</Badge> : <Badge>{m.notMailable}</Badge>}
            </span>,
          )}
        </Card>
        <Card title={m.contact.consent}>
          {row(m.col.basis, m.basis[c.basis])}
          {c.consent_at ? (
            <>
              {row(m.contact.consentAt, when(c.consent_at))}
              {row(m.contact.consentSource, c.consent_source ?? '—')}
            </>
          ) : (
            <p className="m-0 py-[7px] text-[13px] text-mut">{m.contact.consentNone}</p>
          )}
          {c.source === 'user' ? <p className="mb-0 mt-[10px] text-[12px] text-mut">{m.contact.accountNote}</p> : null}
        </Card>
      </div>

      <Card title={m.contactLists.title} className="mt-[16px]">
        {canWrite ? (
          <ContactListForms m={m} common={common} contact={c.id} lists={listOptions} member={c.lists ?? []} />
        ) : (
          <p className="m-0 text-[13px]">
            {(c.lists ?? []).map((k) => listOptions.find((l) => l.key === k)?.name ?? k).join(', ') || m.contactLists.none}
          </p>
        )}
      </Card>

      <Card title={m.contact.timeline} className="mt-[16px]">
        <Table
          head={[m.contact.col.mail, m.contact.col.status, m.contact.col.sent, m.contact.col.delivery, m.contact.col.opened, m.contact.col.clicked, m.contact.col.unsubscribed]}
          empty={data.timeline.length ? undefined : m.contact.timelineNone}
        >
          {data.timeline.map((s, i) => (
            <tr key={i}>
              <Td>
                {s.campaign_id ? <ALink href={`/admin/crm/campaigns/${s.campaign_id}`}>{s.campaign ?? '—'}</ALink> : null}
                <span className="block text-[12px] text-mut">{m.contact.kind[s.kind as keyof typeof m.contact.kind] ?? s.kind}</span>
              </Td>
              <Td>{s.status}</Td>
              <Td>{when(s.sent_at)}</Td>
              <Td>{s.delivery ?? '—'}</Td>
              <Td>{when(s.opened_at)}</Td>
              <Td>{when(s.clicked_at)}</Td>
              <Td>{when(s.unsubscribed_at)}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      {canWrite ? (
        <div className="mt-[16px] grid items-start gap-[14px] lg:[grid-template-columns:minmax(0,2fr)_minmax(0,1fr)]">
          <Card title={m.contact.edit}>
            <ContactForm m={m} common={common} contact={c} />
          </Card>
          <div className="flex flex-col gap-[14px]">
            {c.status !== 'unsubscribed' ? (
              <Card title={m.contact.unsubscribe}>
                <ContactActionForm m={m} common={common} id={c.id} kind="unsubscribe" />
              </Card>
            ) : null}
            <Card title={m.contact.erase}>
              <ContactActionForm m={m} common={common} id={c.id} kind="erase" />
            </Card>
          </div>
        </div>
      ) : null}
    </>
  )
}
