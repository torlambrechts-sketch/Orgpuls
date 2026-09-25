import { getTranslations } from 'next-intl/server'
import { LoginForm } from '@/components/admin/AuthForms'

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ idle?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const idle = (await searchParams).idle === '1'
  return (
    <>
      <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('title')}</span>
      <h1 className="m-0 mt-[6px] font-display text-[26px] font-semibold">{t('login.title')}</h1>
      <p className="mb-[18px] mt-[6px] text-[13px] leading-[1.55] text-mut">{t('login.lead')}</p>
      {idle ? <p className="mb-[14px] mt-0 rounded-ctl bg-sbg px-[12px] py-[9px] text-[12.5px]">{t('login.idle')}</p> : null}
      <LoginForm
        labels={{
          email: t('login.email'),
          password: t('login.password'),
          submit: t('login.submit'),
          pending: t('login.pending'),
          invalid: t('login.invalid'),
        }}
      />
    </>
  )
}
