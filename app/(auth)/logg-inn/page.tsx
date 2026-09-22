import { getTranslations } from 'next-intl/server'
import { Card } from '@/components/ui/Card'
import { Logo } from '@/components/shell/Logo'
import { SignInForm } from './SignInForm'

/**
 * Sign-in. Logged as deviation D-03: the design bundle contains no authentication
 * surface at all, but the application cannot be reached without one. It is built
 * strictly from primitives the bundle already defines — card surface, hairline border,
 * the primary button, the focus ring — so it introduces no new visual language, no new
 * colour and no new control class. It is the one screen with no pixel baseline.
 */
export default async function SignInPage() {
  const t = await getTranslations()

  return (
    <main className="animate-entry flex min-h-screen items-center justify-center px-[28px] py-[40px]">
      <Card className="w-full max-w-[380px]">
        <Logo />
        <h1 className="mt-[20px] font-display text-[24px] font-semibold leading-tight">
          {t('auth.title')}
        </h1>
        <p className="mt-[6px] text-[13px] leading-[1.55] text-mut">{t('auth.lead')}</p>
        <SignInForm
          labels={{
            email: t('auth.email'),
            password: t('auth.password'),
            submit: t('auth.submit'),
            error: t('auth.error'),
          }}
        />
      </Card>
    </main>
  )
}
