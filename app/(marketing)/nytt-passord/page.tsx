import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { NewPasswordForm } from '@/components/start/NewPasswordForm'
import { createClient } from '@/lib/supabase/server'

/**
 * "Velg et nytt passord" — where a reset link ends. D-65.
 *
 * No design exists for it; like the other auth surfaces before the start bundle (D-03) it
 * is built from the sign-in panel's own classes, so it reads as the same place.
 *
 * Two states, decided by the session /auth/confirm set: signed in, the form; not signed
 * in — the link was used, expired or never valid — a plain explanation and the way back
 * to "Glemt passord?". It is a public path, so it must render the second state itself.
 */
export const dynamic = 'force-dynamic'

export default async function NewPasswordPage() {
  const t = await getTranslations('newPassword')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="animate-entry mx-auto max-w-[520px] px-[26px] pb-[70px] pt-[44px]">
      <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
        <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">
          {t('badge')}
        </span>
        <h1 className="mt-[13px] font-display text-[clamp(26px,3.6vw,31px)] font-semibold leading-[1.12]">
          {user ? t('title') : t('expiredTitle')}
        </h1>
        <p className="mt-[10px] max-w-[42ch] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">
          {user ? t('lead') : t('expiredLead')}
        </p>

        {user ? (
          <NewPasswordForm
            labels={{
              password: t('password'),
              repeat: t('repeat'),
              hint: t('hint'),
              submit: t('submit'),
              saving: t('saving'),
              tooShort: t('tooShort'),
              mismatch: t('mismatch'),
              failed: t('failed'),
            }}
          />
        ) : (
          <Link
            href="/logg-inn"
            className="mt-[20px] inline-flex h-[48px] items-center justify-center rounded-cta border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
          >
            {t('toSignIn')}
          </Link>
        )}
      </div>
    </main>
  )
}
