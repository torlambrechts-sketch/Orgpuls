'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  requestReset,
  signIn,
  type ResetState,
  type SignInState,
} from '@/app/(marketing)/logg-inn/actions'

/**
 * Sign-in. Orgpuls_Start.dc.html lines 435-500.
 *
 * **The two alternative buttons are not rendered.** The design offers "Fortsett med
 * Microsoft" and "Fortsett med BankID"; neither provider is configured on this project,
 * and a sign-in button that cannot sign anybody in is the worst place in a product to put
 * a dead control — it is the one screen where a person who cannot get in has no way to
 * tell whether the fault is theirs. The divider above them goes with them. D-38.
 *
 * "Glemt passord?" is real and sends through Supabase. Its answer does not depend on
 * whether the address exists, because this endpoint is answerable by anybody.
 */
export function SignInPanel() {
  const t = useTranslations('auth')
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')

  const [signInState, signInAction, signingIn] = useActionState<SignInState, FormData>(signIn, {})
  const [resetState, resetAction, resetting] = useActionState<ResetState, FormData>(requestReset, {
    status: 'idle',
  })

  return (
    <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
      <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">
        {t('badge')}
      </span>
      <h1 className="mt-[13px] font-display text-[clamp(26px,3.6vw,31px)] font-semibold leading-[1.12]">
        {mode === 'forgot' ? t('forgotTitle') : t('title')}
      </h1>
      <p className="mt-[10px] max-w-[42ch] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">
        {mode === 'forgot' ? t('forgotLead') : t('lead')}
      </p>

      {mode === 'forgot' && resetState.status === 'sent' ? (
        <>
          <div className="mt-[20px] rounded-row bg-mint px-[22px] py-[20px]">
            <span className="block text-[15px] font-bold text-greendeep">{t('sentHead')}</span>
            <span className="mt-[6px] block text-[13.5px] leading-[1.6] text-greendeep [text-wrap:pretty]">
              {t('sentNote')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMode('signin')}
            className="mt-[15px] inline-flex h-[42px] cursor-pointer items-center rounded-btn border border-line bg-transparent px-[17px] text-[13.5px] font-semibold text-ink"
          >
            {t('backToSignIn')}
          </button>
        </>
      ) : mode === 'forgot' ? (
        <form action={resetAction}>
          <label className="mt-[20px] block">
            <span className="mb-[7px] block text-[13px] font-bold">{t('email')}</span>
            <input
              name="email"
              type="email"
              required
              inputMode="email"
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              className="h-[48px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[15px] text-ink outline-none"
            />
          </label>
          {resetState.status === 'invalid' ? (
            <p role="alert" className="mt-[9px] text-[12.5px] text-danger">
              {t('invalidEmail')}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={resetting}
            className="mt-[14px] inline-flex h-[48px] w-full cursor-pointer items-center justify-center rounded-cta border border-ink bg-ac text-[15.5px] font-bold text-ink"
          >
            {t('sendReset')}
          </button>
          <button
            type="button"
            onClick={() => setMode('signin')}
            className="mt-[12px] cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-link underline"
          >
            {t('backToSignIn')}
          </button>
        </form>
      ) : (
        <form action={signInAction}>
          <label className="mt-[20px] block">
            <span className="mb-[7px] block text-[13px] font-bold">{t('email')}</span>
            <input
              name="email"
              type="email"
              required
              inputMode="email"
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              className="h-[48px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[15px] text-ink outline-none"
            />
          </label>

          <label className="mt-[14px] block">
            <span className="mb-[7px] flex items-baseline justify-between gap-[10px]">
              <span className="text-[13px] font-bold">{t('password')}</span>
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold text-link underline"
              >
                {t('forgot')}
              </button>
            </span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              placeholder={t('passwordPlaceholder')}
              className="h-[48px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[15px] text-ink outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={signingIn}
            className="mt-[14px] inline-flex h-[48px] w-full cursor-pointer items-center justify-center rounded-cta border border-ink bg-ac text-[15.5px] font-bold text-ink"
          >
            {t('submit')}
          </button>

          {signInState.error ? (
            <p role="alert" className="mt-[9px] text-[12.5px] leading-[1.5] text-danger">
              {t('error')}
            </p>
          ) : (
            <div className="mt-[9px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
              {t('hint')}
            </div>
          )}
        </form>
      )}

      <div className="mt-[22px] border-t border-line pt-[18px] text-[13px] text-mut">
        {t.rich('noAccount', {
          link: (chunks) => <Link href="/registrer">{chunks}</Link>,
        })}
      </div>
    </div>
  )
}
