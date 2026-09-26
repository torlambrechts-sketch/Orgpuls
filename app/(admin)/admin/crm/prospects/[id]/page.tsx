import { getTranslations } from 'next-intl/server'
import { ContactForm, type CrmMessages } from '@/components/admin/CrmForms'
import { ActivityForm, CompanyForm, TaskToggle } from '@/components/admin/CrmPipelineForms'
import { CrmTabs, STAGE_TONE } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, day, PageHead, Problem, Table, Td, when } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmCompany } from '@/lib/admin/crm'

/**
 * One company (D-103): what the register says about it, its stage, owner and next step, the
 * people we know there, what our campaigns did with them, and the log of everything said
 * and planned.
 */
export default async function CrmProspect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const p = m.prospects
  const [data, who] = await Promise.all([crmCompany(id), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const c = data.company
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
      <PageHead title={c.name} lead={c.org_number ?? undefined}>
        <span className="flex items-center gap-[10px]">
          <Badge tone={STAGE_TONE[c.stage]}>{m.stage[c.stage]}</Badge>
          <ALink href="/admin/crm/prospects">{m.company.back}</ALink>
        </span>
      </PageHead>
      <CrmTabs current="prospects" labels={m.tabs} />

      <div className="grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={m.company.details}>
          {row(p.col.stage, `${m.stage[c.stage]} · ${day(c.stage_changed_at)}`)}
          {row(p.owner, c.owner_email ?? '—')}
          {row(p.nextStep, c.next_step ? `${c.next_step}${c.next_step_at ? ` · ${day(c.next_step_at)}` : ''}` : '—')}
          {row(p.col.industry, c.nace_label ? `${c.nace_label} (${c.nace_code})` : (c.nace_code ?? '—'))}
          {row(p.employees, c.employees ?? '—')}
          {row(p.municipality, c.municipality ?? '—')}
          {row(p.website, c.website ? <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} rel="noreferrer noopener" target="_blank">{c.website}</a> : '—')}
          {row(p.phone, c.phone ?? '—')}
          {row(m.company.registry, `${m.source[c.source as keyof typeof m.source] ?? c.source}${c.form_code ? ` · ${c.form_code}` : ''}`)}
          {c.tags.length ? row(p.tags, c.tags.join(', ')) : null}
          {c.lost_reason ? row(p.lostReason, c.lost_reason) : null}
          {c.org_id ? <p className="mb-0 mt-[10px]"><ALink href={`/admin/orgs/${c.org_id}`}>{m.company.orgLink}</ALink></p> : null}
        </Card>
        <Card title={m.company.mail}>
          <p className="m-0 text-[13.5px]">
            {m.company.mailLine.replace('{sent}', String(data.mail.sent)).replace('{opened}', String(data.mail.opened)).replace('{clicked}', String(data.mail.clicked))}
          </p>
          {data.mail.last_at ? <p className="mb-0 mt-[4px] text-[12px] text-mut">{when(data.mail.last_at)}</p> : null}
        </Card>
      </div>

      <Card title={m.company.contacts} className="mt-[16px]">
        <Table head={[m.col.contact, m.col.role, m.col.basis, m.col.status]} empty={data.contacts.length ? undefined : m.company.noContacts}>
          {data.contacts.map((k) => (
            <tr key={k.id}>
              <Td>
                <ALink href={`/admin/crm/contacts/${k.id}`}>{k.name ?? k.email}</ALink>
                {k.name ? <span className="block text-[12px] text-mut">{k.email}</span> : null}
              </Td>
              <Td>{k.role ? m.roleName[k.role as keyof typeof m.roleName] : '—'}</Td>
              <Td>{m.basis[k.basis]}</Td>
              <Td>{k.suppressed ? <Badge tone="red">{m.suppressedBadge}</Badge> : k.mailable ? <Badge tone="green">{m.mailableBadge}</Badge> : <Badge>{m.status[k.status]}</Badge>}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="mt-[16px] grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={m.company.activity}>
          {canWrite ? (
            <div className="mb-[14px]">
              <ActivityForm m={m} common={common} company={c.id} contacts={data.contacts.map((k) => ({ id: k.id, name: k.name ?? k.email }))} />
            </div>
          ) : null}
          {data.activities.length ? (
            <ol className="m-0 flex list-none flex-col gap-[10px] p-0">
              {data.activities.map((a) => (
                <li key={a.id} className="border-l-2 border-line pl-[10px] text-[13px]">
                  <span className="flex flex-wrap items-center gap-[6px] text-[12px] text-mut">
                    <Badge tone={a.kind === 'task' ? (a.done_at ? 'green' : 'yellow') : 'grey'}>{m.company.kind[a.kind]}</Badge>
                    {when(a.created_at)} · {a.admin_email ?? '—'}
                    {a.contact ? ` · ${a.contact}` : ''}
                    {a.due_at ? ` · ${m.company.due}: ${day(a.due_at)}` : ''}
                    {a.kind === 'task' && canWrite ? (
                      <TaskToggle id={a.id} company={c.id} done={Boolean(a.done_at)} labels={{ done: m.company.done, reopen: m.company.reopen }} />
                    ) : null}
                  </span>
                  <span className={`mt-[3px] block whitespace-pre-line ${a.done_at ? 'text-mut line-through' : ''}`}>{a.body}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 text-[13px] text-mut">{m.company.noActivity}</p>
          )}
        </Card>
        {canWrite ? (
          <div className="flex flex-col gap-[14px]">
            <Card title={m.company.edit}>
              <CompanyForm m={m} common={common} company={c} admins={data.admins} />
            </Card>
            <Card title={m.company.addContact}>
              <ContactForm m={m} common={common} companyId={c.id} />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  )
}
