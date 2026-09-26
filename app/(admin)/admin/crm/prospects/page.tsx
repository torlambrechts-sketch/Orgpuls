import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { CompanyForm, RegistryPicker } from '@/components/admin/CrmPipelineForms'
import { CrmTabs, STAGE_TONE } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, day, PageHead, Problem, Table, Td } from '@/components/admin/ui'
import { isError, listAdmins, whoami } from '@/lib/admin/api'
import { crmCompanies, STAGES } from '@/lib/admin/crm'

/**
 * Prospects (D-103): every company we sell to or serve, by stage, with its owner and next
 * step, sorted so the next thing to do is at the top. New companies are added by hand or
 * picked from Brønnøysund's register.
 */
export default async function CrmProspects({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const { q, stage } = await searchParams
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const p = m.prospects
  const chosen = (STAGES as readonly string[]).includes(stage ?? '') ? (stage as string) : null
  const [data, who, admins] = await Promise.all([crmCompanies(q?.trim() || null, chosen), whoami(), listAdmins()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const owners = isError(admins)
    ? []
    : admins.rows.filter((a) => a.active && (a.role === 'super_admin' || a.role === 'marketing')).map((a) => ({ id: a.user_id, email: a.email }))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <PageHead title={p.title} lead={p.lead} />
      <CrmTabs current="prospects" labels={m.tabs} />

      <nav aria-label={p.col.stage} className="mb-[12px] flex flex-wrap gap-[6px]">
        <Link
          href={'/admin/crm/prospects' as Route}
          aria-current={chosen ? undefined : 'page'}
          className={`rounded-pill border px-[12px] py-[5px] text-[12.5px] font-semibold ${chosen ? 'border-line bg-sf text-ink hover:text-ink' : 'border-ink bg-ink text-bg hover:text-bg'}`}
        >
          {m.stage.all}
        </Link>
        {STAGES.map((s) => (
          <Link
            key={s}
            href={`/admin/crm/prospects?stage=${s}` as Route}
            aria-current={chosen === s ? 'page' : undefined}
            className={`rounded-pill border px-[12px] py-[5px] text-[12.5px] font-semibold ${chosen === s ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'}`}
          >
            {m.stage[s]} · {data.stages[s] ?? 0}
          </Link>
        ))}
      </nav>

      <Card>
        <form className="mb-[12px] flex flex-wrap items-end gap-[8px]" action="/admin/crm/prospects">
          {chosen ? <input type="hidden" name="stage" value={chosen} /> : null}
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder={p.search}
            aria-label={p.search}
            className="box-border h-[38px] min-w-[240px] flex-1 rounded-ctl border border-line bg-bg px-[12px] text-[13.5px]"
          />
          <button type="submit" className="h-[38px] cursor-pointer rounded-ctl border border-ink bg-sf px-[14px] text-[13px] font-bold">
            {t('common.search')}
          </button>
        </form>
        <Table
          head={[p.col.company, p.col.stage, p.col.owner, p.col.size, p.col.industry, p.col.place, p.col.nextStep, p.col.lastActivity, p.col.contacts]}
          empty={data.rows.length ? undefined : t('common.none')}
        >
          {data.rows.map((c) => (
            <tr key={c.id}>
              <Td>
                <ALink href={`/admin/crm/prospects/${c.id}`}>{c.name}</ALink>
                {c.org_number ? <span className="block text-[12px] text-mut">{c.org_number}</span> : null}
              </Td>
              <Td>
                <Badge tone={STAGE_TONE[c.stage]}>{m.stage[c.stage]}</Badge>
              </Td>
              <Td>{c.owner_email ?? '—'}</Td>
              <Td>{c.employees ?? '—'}</Td>
              <Td wrap>{c.nace_label ?? c.nace_code ?? '—'}</Td>
              <Td>{c.municipality ?? '—'}</Td>
              <Td wrap>
                {c.next_step ?? '—'}
                {c.next_step_at ? (
                  <span className={`block text-[12px] ${c.next_step_at <= today ? 'font-bold text-danger' : 'text-mut'}`}>{day(c.next_step_at)}</span>
                ) : null}
              </Td>
              <Td>{day(c.last_activity_at)}</Td>
              <Td>{c.contacts}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      {canWrite ? (
        <>
          <Card title={p.brreg.title} className="mt-[16px]">
            <RegistryPicker m={m} />
          </Card>
          <Card title={p.add} className="mt-[16px]">
            <CompanyForm m={m} common={common} admins={owners} />
          </Card>
        </>
      ) : null}
    </>
  )
}
