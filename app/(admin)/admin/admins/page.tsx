import { getTranslations } from 'next-intl/server'
import { SetAdminForm } from '@/components/admin/ActionForms'
import { Badge, Card, day, PageHead, Problem, Table, Td, when } from '@/components/admin/ui'
import { isError, listAdmins, ROLES } from '@/lib/admin/api'

/** Admin accounts (D-90): the super-admin grants, changes and deactivates roles, with a reason. */
export default async function AdminAdmins() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const res = await listAdmins()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  return (
    <>
      <PageHead title={t('admins.title')} lead={t('admins.lead')} />
      <Card>
        <Table
          head={[
            t('admins.head.email'),
            t('admins.head.role'),
            t('admins.head.active'),
            t('admins.head.mfa'),
            t('admins.head.lastSignIn'),
            t('admins.head.created'),
          ]}
          empty={res.rows.length ? undefined : t('common.none')}
        >
          {res.rows.map((a) => (
            <tr key={a.user_id}>
              <Td>{a.email ?? '—'}</Td>
              <Td>
                <Badge tone="ink">{t(`role.${a.role}`)}</Badge>
              </Td>
              <Td>{a.active ? t('org.yes') : t('org.no')}</Td>
              <Td>{a.mfa_factors > 0 ? t('org.yes') : t('org.no')}</Td>
              <Td>{when(a.last_sign_in_at)}</Td>
              <Td>{day(a.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={t('admins.grant')} className="mt-[14px]">
        <p className="mb-[12px] mt-0 text-[12.5px] leading-[1.5] text-mut">{t('admins.grantLead')}</p>
        <SetAdminForm
          roles={ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))}
          labels={{
            email: t('admins.email'),
            role: t('admins.roleLabel'),
            active: t('admins.active'),
            deactivate: t('admins.deactivate'),
            submit: t('admins.submit'),
            reason: t('common.reason'),
            reasonHint: t('common.reasonHint'),
            saving: t('common.saving'),
            done: t('common.done'),
            problems: {
              no_such_account: t('admins.problem.no_such_account'),
              customer_account: t('admins.problem.customer_account'),
              not_yourself: t('admins.problem.not_yourself'),
              invalid_role: t('admins.problem.invalid_role'),
              reason_required: t('admins.problem.reason_required'),
              invalid: t('admins.problem.invalid'),
              not_allowed: t('admins.problem.not_allowed'),
              failed: t('admins.problem.failed'),
            },
          }}
        />
      </Card>
    </>
  )
}
