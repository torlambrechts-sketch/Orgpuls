'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  createAccount,
  lookupCompany,
  type LookupState,
  type SignUpState,
} from '@/app/(marketing)/registrer/actions'

/**
 * Sign-up. Orgpuls_Start.dc.html lines 276-434.
 *
 * Three steps, and the step is client state rather than a URL because nothing is written
 * until step 2 submits: a back button between steps must not be able to replay half a
 * registration, and the simplest way to guarantee that is for there to be nothing to
 * replay.
 *
 * **Two of the design's fields are collected and not stored.** "Hva er rollen din?" and
 * "Omtrent hvor mange ansatte er dere?" are useful to a sales team and this product has
 * no table for either — the first is not `app.org_role` (the account is daglig leder by
 * construction, being the one that created the organisation) and the second is a band
 * where `employee_count` is a number. The size band is therefore the only one kept, and
 * it is kept by turning it into that number; the role question is dropped. D-38.
 */

const SIZES = [
  { key: 'under25', count: 20 },
  { key: 'to50', count: 38 },
  { key: 'to100', count: 75 },
  { key: 'over100', count: 150 },
] as const

export function SignUpFlow() {
  const t = useTranslations('registrer')
  const router = useRouter()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [company, setCompany] = useState<{ orgNumber: string; name: string } | null>(null)
  const [size, setSize] = useState<(typeof SIZES)[number]['key']>('under25')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [, startTransition] = useTransition()

  const [lookup, lookupAction, lookingUp] = useActionState<LookupState, FormData>(
    lookupCompany,
    { status: 'idle' },
  )
  const [signUp, setSignUp] = useState<SignUpState>({ status: 'idle' })
  const [creating, setCreating] = useState(false)

  const found = lookup.status === 'found' ? lookup : null

  /** Length counts twice and a non-letter once — the design's own meter (line 551). */
  const strength =
    (password.length >= 8 ? 1 : 0) +
    (password.length >= 12 ? 1 : 0) +
    (/[^a-zA-ZæøåÆØÅ]/.test(password) ? 1 : 0)

  const canCreate =
    firstName.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) &&
    password.length >= 8 &&
    consent

  return (
    <div className="animate-entry mx-auto max-w-[1000px] px-[26px] pb-[70px] pt-[40px]">
      <ol className="m-0 flex list-none flex-wrap items-center gap-[7px] p-0">
        {([1, 2, 3] as const).map((n) => (
          <li key={n} className="flex items-center gap-[7px]">
            <span
              className="flex h-[23px] w-[23px] items-center justify-center rounded-pill border-[1.5px] text-[11px] font-bold"
              style={{
                background: step >= n ? '#F5C64A' : 'transparent',
                borderColor: step >= n ? '#191510' : '#C4BCA8',
                color: '#191510',
              }}
            >
              {step > n ? '✓' : n}
            </span>
            <span
              className={`text-[12.5px] ${step === n ? 'font-bold' : 'font-medium'}`}
              style={{ color: step >= n ? '#191510' : '#8A8272' }}
            >
              {t(`step${n}`)}
            </span>
            {n < 3 ? <span className="block h-[1.5px] w-[22px] bg-line" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-[26px] grid items-start gap-[22px] [grid-template-columns:minmax(0,1.25fr)_minmax(258px,0.75fr)]">
        <div className="min-w-0">
          {/* ------------------------------------------------------- step 1 */}
          {step === 1 ? (
            <form
              action={lookupAction}
              className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]"
            >
              <h1 className="m-0 max-w-[22ch] font-display text-[clamp(26px,3.6vw,32px)] font-semibold leading-[1.12] [text-wrap:balance]">
                {t('step1Title')}
              </h1>
              <p className="mt-[11px] max-w-[52ch] text-[14.5px] leading-[1.65] text-mut [text-wrap:pretty]">
                {t('step1Lead')}
              </p>

              <label className="mt-[22px] block max-w-[340px]">
                <span className="mb-[7px] block text-[13px] font-bold">{t('orgNumber')}</span>
                <input
                  name="orgNumber"
                  inputMode="numeric"
                  required
                  defaultValue={found?.orgNumber ?? ''}
                  placeholder={t('orgNumberPlaceholder')}
                  className="h-[50px] w-full rounded-tile border-[1.5px] bg-bg px-[16px] text-[19px] font-semibold tracking-[0.06em] text-ink outline-none"
                  style={{ borderColor: found ? '#191510' : '#E8DFC9' }}
                />
              </label>

              <div
                className="mt-[8px] max-w-[52ch] text-[12.5px] leading-[1.5] [text-wrap:pretty]"
                style={{ color: lookup.status === 'problem' ? '#A33A16' : '#5F5849' }}
              >
                {lookup.status === 'problem'
                  ? t(`problem.${lookup.problem}`)
                  : found
                    ? t('lookupAgain')
                    : t('orgNumberHint')}
              </div>

              {found ? (
                <>
                  <div className="mt-[18px] rounded-note border-[1.5px] border-ink bg-sbg px-[22px] py-[20px]">
                    <span className="block text-[11px] uppercase tracking-[0.1em] text-mut">
                      {t('foundHead')}
                    </span>
                    <span className="mt-[6px] block font-display text-[23px] font-semibold leading-[1.2]">
                      {found.name}
                    </span>
                    <span className="mt-[12px] flex flex-col gap-[5px]">
                      {found.rows.map((r) => (
                        <span key={r.key} className="flex gap-[12px] text-[13px]">
                          <span className="w-[94px] flex-none text-mut">{t(`fact.${r.key}`)}</span>
                          <span className="min-w-0 font-semibold">{r.value}</span>
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="mt-[16px] flex flex-wrap gap-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        setCompany({ orgNumber: found.orgNumber, name: found.name })
                        setStep(2)
                      }}
                      className="inline-flex h-[48px] cursor-pointer items-center rounded-tile border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink"
                    >
                      {t('confirmCompany')}
                    </button>
                    <button
                      type="submit"
                      name="orgNumber"
                      value=""
                      className="inline-flex h-[48px] cursor-pointer items-center rounded-tile border border-line bg-transparent px-[18px] text-[15px] font-semibold text-ink"
                    >
                      {t('tryAnother')}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="submit"
                  disabled={lookingUp}
                  className="mt-[16px] inline-flex h-[48px] cursor-pointer items-center rounded-tile border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink"
                >
                  {lookingUp ? t('looking') : t('lookUp')}
                </button>
              )}
            </form>
          ) : null}

          {/* ------------------------------------------------------- step 2 */}
          {step === 2 && company ? (
            <form
              className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]"
              action={(data) => {
                data.set('orgNumber', company.orgNumber)
                data.set('companyName', company.name)
                data.set('employeeCount', String(SIZES.find((s) => s.key === size)!.count))
                setCreating(true)
                startTransition(async () => {
                  const result = await createAccount({ status: 'idle' }, data)
                  setCreating(false)
                  setSignUp(result)
                  if (result.status === 'idle') setStep(3)
                })
              }}
            >
              <h1 className="m-0 max-w-[20ch] font-display text-[clamp(26px,3.6vw,32px)] font-semibold leading-[1.12] [text-wrap:balance]">
                {t('step2Title')}
              </h1>
              <p className="mt-[11px] max-w-[52ch] text-[14.5px] leading-[1.65] text-mut [text-wrap:pretty]">
                {t('step2Lead')}
              </p>

              <div className="mt-[22px] grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(215px,1fr))]">
                <label className="block">
                  <span className="mb-[7px] block text-[13px] font-bold">{t('name')}</span>
                  <input
                    name="fullName"
                    required
                    autoComplete="name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('namePlaceholder')}
                    className="h-[46px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[15px] text-ink outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-[7px] block text-[13px] font-bold">{t('email')}</span>
                  <input
                    name="email"
                    type="email"
                    required
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    className="h-[46px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[15px] text-ink outline-none"
                  />
                </label>
              </div>
              <div className="mt-[8px] max-w-[52ch] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                {t('emailHint')}
              </div>

              <label className="mt-[16px] block max-w-[340px]">
                <span className="mb-[7px] block text-[13px] font-bold">{t('password')}</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  className="h-[46px] w-full rounded-cta border-[1.5px] bg-bg px-[15px] text-[15px] text-ink outline-none"
                  style={{
                    borderColor:
                      password.length === 0 ? '#E8DFC9' : password.length < 8 ? '#D4633A' : '#191510',
                  }}
                />
              </label>
              <div className="mt-[9px] flex flex-wrap items-center gap-[9px]">
                <span className="flex flex-none gap-[3px]" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="block h-[5px] w-[28px] rounded-pill"
                      style={{
                        background:
                          i < strength
                            ? strength >= 3
                              ? '#5C9A55'
                              : strength === 2
                                ? '#E0A21F'
                                : '#D4633A'
                            : '#E8DFC9',
                      }}
                    />
                  ))}
                </span>
                <span
                  className="text-[12.5px] leading-[1.5]"
                  style={{
                    color: password.length > 0 && password.length < 8 ? '#A33A16' : '#5F5849',
                  }}
                >
                  {password.length === 0
                    ? t('pwHintEmpty')
                    : password.length < 8
                      ? t('pwHintShort', { count: password.length })
                      : strength >= 3
                        ? t('pwHintGood')
                        : t('pwHintOk')}
                </span>
              </div>

              <div className="mt-[20px]">
                <span className="mb-[9px] block text-[13px] font-bold">{t('sizeQuestion')}</span>
                <div className="flex flex-wrap gap-[7px]">
                  {SIZES.map((s) => (
                    <label key={s.key} className="inline-flex flex-none">
                      <input
                        type="radio"
                        name="size"
                        value={s.key}
                        checked={size === s.key}
                        onChange={() => setSize(s.key)}
                        className="peer absolute h-px w-px overflow-hidden opacity-0"
                      />
                      <span
                        className={`inline-flex cursor-pointer items-center rounded-pill border-[1.5px] px-[15px] py-[10px] text-[13.5px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                          size === s.key ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'
                        }`}
                      >
                        {t(`size.${s.key}`)}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-[8px] max-w-[52ch] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                  {t('sizeNote')}
                </div>
              </div>

              <label
                className="mt-[22px] flex w-full cursor-pointer items-start gap-[11px] rounded-tile border-[1.5px] bg-bg px-[16px] py-[14px] text-left"
                style={{ borderColor: consent ? '#191510' : '#E8DFC9' }}
              >
                <input
                  type="checkbox"
                  name="consent"
                  checked={consent}
                  onChange={() => setConsent((v) => !v)}
                  className="peer absolute h-px w-px overflow-hidden opacity-0"
                />
                <span
                  className="mt-[1px] flex h-[19px] w-[19px] flex-none items-center justify-center rounded-focus border-2 border-ink text-[11px] font-bold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
                  style={{
                    background: consent ? '#191510' : 'transparent',
                    color: consent ? '#FCF6E9' : 'transparent',
                  }}
                >
                  ✓
                </span>
                <span className="text-[13px] leading-[1.55] [text-wrap:pretty]">
                  {t('consent')}
                </span>
              </label>

              <div className="mt-[20px] flex flex-wrap gap-[10px]">
                <button
                  type="submit"
                  disabled={!canCreate || creating}
                  className="inline-flex h-[48px] cursor-pointer items-center rounded-tile border px-[22px] text-[15.5px] font-bold"
                  style={
                    canCreate
                      ? { borderColor: '#191510', background: '#F5C64A', color: '#191510' }
                      : { borderColor: '#E8DFC9', background: '#F1EADA', color: '#8A8272' }
                  }
                >
                  {creating ? t('creating') : t('createAccount')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex h-[48px] cursor-pointer items-center rounded-tile border border-line bg-transparent px-[18px] text-[15px] font-semibold text-ink"
                >
                  {t('back')}
                </button>
              </div>

              <div
                className="mt-[11px] max-w-[52ch] text-[12.5px] leading-[1.5] [text-wrap:pretty]"
                style={{ color: signUp.status === 'problem' ? '#A33A16' : '#5F5849' }}
              >
                {signUp.status === 'problem'
                  ? t(`problem.${signUp.problem}`)
                  : canCreate
                    ? t('ctaHintReady')
                    : t('ctaHintMissing')}
              </div>
            </form>
          ) : null}

          {/* ------------------------------------------------------- step 3 */}
          {step === 3 && company ? (
            <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-pill bg-mint text-[25px] text-greendeep">
                ✓
              </span>
              <h1 className="mt-[17px] max-w-[24ch] font-display text-[clamp(26px,3.6vw,32px)] font-semibold leading-[1.12] [text-wrap:balance]">
                {t('doneTitle', { name: firstName.trim().split(' ')[0] || t('doneFallbackName') })}
              </h1>
              <p className="mt-[12px] max-w-[54ch] text-[14.5px] leading-[1.65] text-body [text-wrap:pretty]">
                {t('doneLead', { company: company.name })}
              </p>

              <div className="mt-[22px] flex flex-col gap-[9px]">
                {(['people', 'threshold', 'send'] as const).map((k, i) => (
                  <div
                    key={k}
                    className="flex items-center gap-[13px] rounded-opt border border-line bg-bg px-[17px] py-[15px]"
                  >
                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill border border-line bg-sf text-[12px] font-bold">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">
                        {t(`todo.${k}.title`)}
                      </span>
                      <span className="mt-[2px] block text-[12.5px] text-mut">
                        {t(`todo.${k}.note`)}
                      </span>
                    </span>
                    <span className="flex-none text-[12px] font-bold text-mut">
                      {t(`todo.${k}.time`)}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => router.push('/oppsett?fane=ansatte')}
                className="mt-[22px] inline-flex h-[50px] cursor-pointer items-center rounded-tile border border-ink bg-ac px-[24px] text-[16px] font-bold text-ink"
              >
                {t('openOrgpuls')}
              </button>
            </div>
          ) : null}
        </div>

        <div className="sticky top-[76px] flex min-w-0 flex-col gap-[12px]">
          <div className="rounded-note border border-line bg-sf px-[22px] py-[20px]">
            <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">
              {t('inclHead')}
            </span>
            <span className="mt-[13px] flex flex-col gap-[9px]">
              {(['instrument', 'report', 'measures', 'conversations', 'users'] as const).map((k) => (
                <span key={k} className="flex items-start gap-[9px]">
                  <span className="mt-[2px] flex h-[16px] w-[16px] flex-none items-center justify-center rounded-focus bg-mint text-[9px] font-bold text-greendeep">
                    ✓
                  </span>
                  <span className="text-[13px] leading-[1.5] [text-wrap:pretty]">
                    {t(`incl.${k}`)}
                  </span>
                </span>
              ))}
            </span>
          </div>
          <div className="rounded-note border border-line bg-sbg px-[21px] py-[19px]">
            <span className="block text-[13.5px] leading-[1.6] [text-wrap:pretty]">
              {t(`reassure${step}`)}
            </span>
          </div>
          <p className="text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
            {t.rich('haveAccount', {
              link: (chunks) => <Link href="/logg-inn">{chunks}</Link>,
            })}
          </p>
        </div>
      </div>
    </div>
  )
}
