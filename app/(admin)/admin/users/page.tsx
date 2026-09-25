import { getTranslations } from 'next-intl/server'
import { ALink, Card, day, PageHead, Problem, Table, Td, when } from '@/components/admin/ui'
import { isError, userSearch } from '@/lib/admin/api'

/** Users (D-90): people who sign in, across organisations. Respondents are never here. */
export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const q = (await searchParams).q?.trim() ?? ''
  const res = q.length >= 2 ? await userSearch(q) : null

  return (
    <>
      <PageHead title={t('users.title')} lead={t('users.lead')} />
      <form method="get" className="mb-[14px] flex flex-wrap gap-[10px]">
        <label className="block min-w-[240px] flex-1">
          <span className="sr-only">{t('common.search')}</span>
          <input
            name="q"
            defaultValue={q}
            placeholder={t('users.placeholder')}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-sf px-[13px] text-[13.5px] text-ink outline-none"
          />
        </label>
        <button
          type="submit"
          className="h-[40px] cursor-pointer rounded-ctl border border-ink bg-ac px-[16px] text-[13.5px] font-bold text-ink"
        >
          {t('common.search')}
        </button>
      </form>
      {!res ? (
        <p className="m-0 text-[13px] text-mut">{t('users.empty')}</p>
      ) : isError(res) ? (
        <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
      ) : (
        <Card>
          <Table
            head={[
              t('users.head.email'),
              t('users.head.name'),
              t('users.head.orgs'),
              t('users.head.invites'),
              t('users.head.lastSignIn'),
              t('users.head.mfa'),
              t('users.head.created'),
            ]}
            empty={res.rows.length ? undefined : t('common.none')}
          >
            {res.rows.map((u) => (
              <tr key={u.user_id}>
                <Td>{u.email ?? '—'}</Td>
                <Td>{u.name ?? '—'}</Td>
                <Td>
                  {u.memberships.length
                    ? u.memberships.map((m) => (
                        <span key={m.org_id} className="block">
                          <ALink href={`/admin/orgs/${m.org_id}`}>{m.org_name}</ALink> · {m.role}
                          {m.active ? null : ` · ${t('org.inactive')}`}
                        </span>
                      ))
                    : '—'}
                </Td>
                <Td>
                  {u.pending_invites.length
                    ? u.pending_invites.map((i, n) => (
                        <span key={n} className="block">
                          {i.org_name} · {i.role} · {day(i.expires_at)}
                        </span>
                      ))
                    : '—'}
                </Td>
                <Td>{when(u.last_sign_in_at)}</Td>
                <Td>{u.mfa_factors > 0 ? t('org.yes') : t('org.no')}</Td>
                <Td>{day(u.created_at)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  )
}
