import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { MfaPanel } from '@/components/admin/AuthForms'
import { whoami } from '@/lib/admin/api'
import { adminSignOut } from '@/lib/admin/actions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** The second factor (D-90): enrol an authenticator on first sign-in, then a code every time. */
export default async function AdminMfaPage() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!who) redirect('/admin/login')
  if (!who.is_admin) {
    return (
      <>
        <h1 className="m-0 font-display text-[24px] font-semibold">{t('notAdmin.title')}</h1>
        <p className="mb-[16px] mt-[8px] text-[13.5px] leading-[1.55] text-mut">{t('notAdmin.body')}</p>
        <form action={adminSignOut}>
          <button type="submit" className="cursor-pointer text-[13px] font-semibold text-link underline">
            {t('nav.signOut')}
          </button>
        </form>
      </>
    )
  }
  if (who.aal === 'aal2' || !who.mfa_enforced) redirect('/admin')

  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.listFactors()
  const verified = data?.totp.find((f) => f.status === 'verified') ?? null

  return (
    <>
      <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('title')}</span>
      <h1 className="m-0 mb-[14px] mt-[6px] font-display text-[26px] font-semibold">{t('mfa.title')}</h1>
      <MfaPanel
        factorId={verified?.id ?? null}
        labels={{
          enrollLead: t('mfa.enrollLead'),
          enrollStart: t('mfa.enrollStart'),
          secret: t('mfa.secret'),
          verifyLead: t('mfa.verifyLead'),
          code: t('mfa.code'),
          submit: t('mfa.submit'),
          pending: t('mfa.pending'),
          problems: { invalid_code: t('mfa.invalid_code'), failed: t('mfa.failed'), already_enrolled: t('mfa.already_enrolled') },
        }}
      />
    </>
  )
}
