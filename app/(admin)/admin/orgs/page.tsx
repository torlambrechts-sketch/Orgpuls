import { getTranslations } from 'next-intl/server'
import { ALink, Badge, Card, day, nok, PageHead, pct, Problem, Table, Td, type BadgeTone } from '@/components/admin/ui'
import { isError, orgList, STATUSES } from '@/lib/admin/api'

const TONE: Record<(typeof STATUSES)[number], BadgeTone> = { trial: 'yellow', active: 'green', expired: 'red' }

/** Organisations (D-90): search and status, and the columns support and finance start from. */
export default async function AdminOrgs({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await searchParams
  const q = sp.q?.trim() || null
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as string) : null
  const res = await orgList(q, status)

  return (
    <>
      <PageHead title={t('orgs.title')} lead={t('orgs.lead')} />
      <form method="get" className="mb-[14px] flex flex-wrap items-end gap-[10px]">
        <label className="block min-w-[240px] flex-1">
          <span className="sr-only">{t('common.search')}</span>
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('orgs.placeholder')}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-sf px-[13px] text-[13.5px] text-ink outline-none"
          />
        </label>
        <label className="block">
          <span className="sr-only">{t('orgs.status')}</span>
          <select
            name="status"
            defaultValue={status ?? ''}
            className="h-[40px] rounded-ctl border border-line bg-sf px-[10px] text-[13.5px] text-ink"
          >
            <option value="">{t('common.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`orgs.statusLabel.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-[40px] cursor-pointer rounded-ctl border border-ink bg-ac px-[16px] text-[13.5px] font-bold text-ink"
        >
          {t('common.search')}
        </button>
      </form>
      {isError(res) ? (
        <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
      ) : (
        <Card aside={<span className="text-[12.5px] text-mut">{t('orgs.count', { count: res.rows.length })}</span>}>
          <Table
            head={[
              t('orgs.head.name'),
              t('orgs.head.orgnr'),
              t('orgs.head.status'),
              t('orgs.head.plan'),
              t('orgs.head.employees'),
              t('orgs.head.lastSent'),
              t('orgs.head.rate'),
              t('orgs.head.mrr'),
              t('orgs.head.signup'),
            ]}
            empty={res.rows.length ? undefined : t('common.none')}
          >
            {res.rows.map((o) => (
              <tr key={o.id}>
                <Td>
                  <ALink href={`/admin/orgs/${o.id}`}>{o.name}</ALink>
                </Td>
                <Td>{o.org_number ?? '—'}</Td>
                <Td>
                  <Badge tone={TONE[o.status]}>{t(`orgs.statusLabel.${o.status}`)}</Badge>
                  {o.status === 'trial' ? (
                    <span className="block text-[11.5px] text-mut">{t('orgs.trialEnds', { date: day(o.trial_ends_at) })}</span>
                  ) : null}
                </Td>
                <Td>{o.plan ?? '—'}</Td>
                <Td>{t('orgs.registered', { registered: o.registered, stated: o.employee_count })}</Td>
                <Td>{day(o.last_sent)}</Td>
                <Td>{pct(o.last_answered, o.last_invited)}</Td>
                <Td>{nok(o.mrr)}</Td>
                <Td>{day(o.created_at)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  )
}
