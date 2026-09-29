import { getTranslations } from 'next-intl/server'
import { MemberDialog } from '@/components/admin/MemberDialogs'
import { Avatar, day, PageHead, Problem, when } from '@/components/admin/ui'
import { isError, listAdmins, ROLES, type AdminRole } from '@/lib/admin/api'

/**
 * Admin › Users & roles (X-095, the design's `isUsers`; D-90, D-170): who can sign in to Sentral,
 * with their role, their second factor and when they last signed in, and what each role may do.
 * «Invite» and «Edit» grant, change or deactivate a role with a reason; the super-admin's alone.
 * The design's «Sites» column is the second factor here: there is one site (plan decision 1).
 */
const DAY = 86_400_000

export default async function AdminAdmins() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const res = await listAdmins()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const u = (k: string, v?: Record<string, string | number>) => t(`admins.v2.${k}`, v)
  const now = Date.now()
  const active = res.rows.filter((a) => a.active)
  const rows = [...active, ...res.rows.filter((a) => !a.active)]
  const roles = ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))
  const formLabels = {
    email: t('admins.email'),
    role: t('admins.roleLabel'),
    active: t('admins.active'),
    deactivate: t('admins.deactivate'),
    submit: t('admins.submit'),
    reason: t('common.reason'),
    reasonHint: t('common.reasonHint'),
    saving: t('common.saving'),
    done: t('common.done'),
    problems: Object.fromEntries(
      ['no_such_account', 'customer_account', 'not_yourself', 'invalid_role', 'reason_required', 'invalid', 'not_allowed', 'failed'].map((k) => [k, t(`admins.problem.${k}`)]),
    ),
  }
  // the order the design lists roles in: the owner first, then who does what with the customers, then the site
  const ORDER: AdminRole[] = ['super_admin', 'support', 'finance', 'marketing', 'analyst', 'editor']

  return (
    <>
      <PageHead title={u('title')} lead={u('lead', { count: active.length })}>
        <MemberDialog primary label={u('invite')} title={u('inviteTitle')} sub={u('inviteSub')} close={u('close')} roles={roles} labels={formLabels} />
      </PageHead>

      <div className="grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(300px,.9fr)]">
        <section className="relative min-w-0 overflow-x-auto rounded-panel border border-line bg-sf">
          <div className="min-w-[560px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="flex-[2.2]">{u('col.member')}</span>
              <span className="flex-[1.2]">{u('col.factor')}</span>
              <span className="w-[110px]">{u('col.last')}</span>
              <span className="w-[80px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {rows.map((a) => {
                const recent = a.last_sign_in_at && now - new Date(a.last_sign_in_at).getTime() < DAY
                return (
                  <li key={a.user_id} className={`flex items-center gap-[14px] border-b border-line px-[20px] py-[13px] last:border-b-0 ${a.active ? '' : 'opacity-60'}`}>
                    <div className="flex min-w-0 flex-[2.2] items-center gap-[12px]">
                      <Avatar name={(a.email ?? '?').split('@')[0] ?? '?'} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-[8px] font-semibold">
                          <span className="min-w-0 truncate">{a.email ?? '—'}</span>
                          <span className="rounded-pill border border-line px-[7px] py-[2px] text-[11px] font-semibold text-mut">{t(`role.${a.role}`)}</span>
                          {a.active ? null : <span className="rounded-pill border border-line px-[7px] py-[2px] text-[11px] font-semibold text-mut">{u('inactive')}</span>}
                        </div>
                        <div className="text-[12.5px] text-mut">{u('added', { date: day(a.created_at) })}</div>
                      </div>
                    </div>
                    <div className="flex-[1.2] text-[13px] text-mut">{a.mfa_factors > 0 ? u('factorYes') : u('factorNo')}</div>
                    <div className="flex w-[110px] items-center gap-[6px] text-[12.5px]">
                      <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${recent ? 'bg-teal' : 'bg-ac'}`} />
                      {a.last_sign_in_at ? when(a.last_sign_in_at) : u('never')}
                    </div>
                    <div className="flex w-[80px] justify-end">
                      <MemberDialog
                        label={u('edit')}
                        title={a.email ?? '—'}
                        sub={`${t(`role.${a.role}`)} · ${a.mfa_factors > 0 ? u('factorYes') : u('factorNo')}`}
                        close={u('close')}
                        roles={roles}
                        labels={formLabels}
                        initial={{ email: a.email ?? '', role: a.role, active: a.active }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
          <h2 className="m-0 font-display text-[22px] font-medium">{u('roles')}</h2>
          <div className="mt-[4px] text-[12.5px] text-mut">{u('rolesLead')}</div>
          <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
            {ORDER.map((r) => (
              <li key={r} className="flex gap-[12px] border-b border-line py-[11px] last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">{t(`role.${r}`)}</div>
                  <div className="text-[12.5px] text-mut">{u(`can.${r}`)}</div>
                </div>
                <span className="whitespace-nowrap text-[12.5px] text-mut">{u('people', { count: active.filter((a) => a.role === r).length })}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
