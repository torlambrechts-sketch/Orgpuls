'use client'

import Link from '@/components/site/SitePaths'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { countFor, SIZES, type SizeKey } from '@/lib/start/size'
import { K_DEFAULT, K_FLOOR } from '@/lib/org/threshold'
import { useTranslations } from 'next-intl'
import { createAccount, separateCompany } from '@/app/(marketing)/registrer/actions'
import type { JoinRequest } from '@/lib/signup/organisation'
import { GoogleButton, GoogleDivider } from '@/components/start/GoogleButton'
import { MicrosoftButton } from '@/components/start/MicrosoftButton'
import { trackEvent, trackForm } from '@/lib/marketing/events'
import { HeardAbout } from '@/components/start/HeardAbout'

/**
 * Sign-up. Orgpuls_Start.dc.html lines 276-434, as one form since X-114 (D-279).
 *
 * The design's three steps asked for the organisation number first and looked it up in the register.
 * A person who does not own the company, or does not have the number to hand, stopped there. The form
 * now asks for the company's name, the person's name, a work address and a password; the number is
 * optional. The design's fields, controls and styles are kept, in one card: the company field takes
 * the number field's place, and the size chips, the password meter, the consent and the providers are
 * the design's step 2 unchanged. The indicator counts two steps: the form, then what comes next.
 *
 * What comes next is one of two (`signup_organisation`, 0232):
 *  - **created** — the company was not here, so it is made and the person is its daglig leder: the
 *    design's step 3;
 *  - **waiting** — the company is already here, found by its number, its name or a colleague's work
 *    address. Nothing is made and nobody is let in: the company's daglig leder is asked, and the card
 *    says so, with the company's name. Where it was found by name or address, the person can say it is
 *    another company with the same name, and their own is made from what they typed. A declined request
 *    reads as declined, with the same way out.
 *
 * **Two of the design's fields are collected and not stored** (D-38): the role question is dropped, and
 * the size band is kept by turning it into a number.
 *
 * **Google (D-102) and Microsoft (D-201):** the providers create the account instead of a password; the
 * company and the consent go with the form, and the callback lands back here, created (`?ferdig=1`) or
 * waiting (`?venter=1`).
 *
 * **Where the form is left (D-277):** the state shown, the provider chosen, a request filed and every
 * error met go to Sentral as codes (`form_shown`, `join_requested`, `form_signup_failed`), never what was
 * typed.
 */
export function SignUpFlow({
  google = false,
  microsoft = false,
  problem = null,
  done = null,
  waiting = null,
  registry = true,
  floor = K_FLOOR,
  legal = true,
  numberInput = 'numeric',
}: {
  google?: boolean
  microsoft?: boolean
  problem?: string | null
  done?: { firstName: string; company: string } | null
  /** the request filed, or declined, when the company was already here (0232) */
  waiting?: JoinRequest | null
  /** whether the market's register can be asked (lib/markets.ts REGISTRY_LOOKUP): the number's placeholder */
  registry?: boolean
  /** the market's anonymity floor (lib/markets.ts MARKET_K_FLOOR): Norway's note names three */
  floor?: number
  /** whether the market's law and report are built (lib/markets.ts LEGAL_PACK): no report promised otherwise */
  legal?: boolean
  /** the keyboard the market's number needs (lib/org-number.ts orgNumberInput): a UK prefix is letters */
  numberInput?: 'numeric' | 'text'
}) {
  const t = useTranslations('registrer')
  const router = useRouter()

  const [phase, setPhase] = useState<'form' | 'created' | 'waiting'>(done ? 'created' : waiting ? 'waiting' : 'form')
  const [request, setRequest] = useState<JoinRequest | null>(waiting)
  const [createdName, setCreatedName] = useState(done?.company ?? '')

  // Arriving from a landing page's form (SignupStart, OrgStart) with ?firma= or ?orgnr=: the field is
  // filled in, so the visitor carries on from what they typed there (D-270).
  const params = useSearchParams()
  const prefillName = (params.get('firma') ?? '').trim().slice(0, 200)
  const prefillNumber = (params.get('orgnr') ?? '').replace(/\s/g, '')
  const prefilled = registry
    ? /^\d{9}$/.test(prefillNumber) ? prefillNumber : ''
    : /^[0-9A-Za-z-]{1,12}$/.test(prefillNumber) ? prefillNumber.toUpperCase() : ''

  // controlled, so a refused submit does not empty the form (React resets a form's uncontrolled fields
  // after its action)
  const [companyName, setCompanyName] = useState(prefillName)
  const [orgNumber, setOrgNumber] = useState(prefilled)
  const [size, setSize] = useState<SizeKey>('under25')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState(done?.firstName ?? '')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [, startTransition] = useTransition()
  const [formProblem, setFormProblem] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [separating, setSeparating] = useState(false)
  const [separateProblem, setSeparateProblem] = useState<string | null>(null)

  // a provider's sign-up, or a confirmation link, is only complete when it lands back here with the
  // organisation made
  const counted = useRef(false)
  useEffect(() => {
    if (!done || counted.current) return
    counted.current = true
    trackEvent('signup_completed')
  }, [done])

  // where the form was left (D-277): the state shown and the error met, as codes only
  useEffect(() => {
    trackForm('signup_step', `${phase}_shown`)
  }, [phase])
  useEffect(() => {
    // a provider's sign-in came back with an error (?feil=)
    if (problem) trackForm('signup_error', problem)
  }, [problem])

  // a sign-up typed here starts at the first field touched; one begun on a landing page was counted there
  const started = useRef(Boolean(prefillName || prefilled))
  const markStarted = () => {
    if (started.current) return
    started.current = true
    trackEvent('signup_started')
  }

  /** Length counts twice and a non-letter once — the design's own meter (line 551). */
  const strength =
    (password.length >= 8 ? 1 : 0) +
    (password.length >= 12 ? 1 : 0) +
    (/[^a-zA-ZæøåÆØÅ]/.test(password) ? 1 : 0)

  const canCreate =
    companyName.trim().length > 0 &&
    firstName.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) &&
    password.length >= 8 &&
    consent

  const steps = [t('stepAccount'), t(phase === 'waiting' ? 'stepWaiting' : 'step3')]
  const reached = phase === 'form' ? 1 : 2
  const inputClass = 'h-[46px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[15px] text-[16px] text-ink outline-none'

  return (
    <div className="animate-entry mx-auto max-w-[1000px] px-[26px] pb-[70px] pt-[40px]">
      <ol className="m-0 flex list-none flex-wrap items-center gap-[7px] p-0">
        {steps.map((label, i) => {
          const n = i + 1
          return (
            <li key={n} className="flex items-center gap-[7px]">
              <span
                className="flex h-[23px] w-[23px] items-center justify-center rounded-pill border-[1.5px] text-[11px] font-bold"
                style={{
                  background: reached >= n ? '#F5C64A' : 'transparent',
                  borderColor: reached >= n ? '#191510' : '#C4BCA8',
                  color: '#191510',
                }}
              >
                {reached > n ? '✓' : n}
              </span>
              <span
                className={`text-[12.5px] ${reached === n ? 'font-bold' : 'font-medium'}`}
                style={{ color: reached >= n ? '#191510' : '#8A8272' }}
              >
                {label}
              </span>
              {n < steps.length ? <span className="block h-[1.5px] w-[22px] bg-line" /> : null}
            </li>
          )
        })}
      </ol>

      <div className="mt-[26px] grid items-start gap-[22px] md:[grid-template-columns:minmax(0,1.25fr)_minmax(258px,0.75fr)]">
        <div className="min-w-0">
          {problem && phase === 'form' ? (
            <p role="alert" className="mb-[12px] mt-0 text-[13.5px] leading-[1.55] text-danger [text-wrap:pretty]">
              {t.has(`problem.${problem}`)
                ? t(`problem.${problem}`)
                : t(problem.startsWith('microsoft_') ? 'problem.microsoft_failed' : 'problem.google_failed')}
            </p>
          ) : null}

          {/* ------------------------------------------------------- the form */}
          {phase === 'form' ? (
            <form
              className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]"
              onChange={markStarted}
              action={(data) => {
                data.set('companyName', companyName)
                data.set('orgNumber', orgNumber)
                data.set('employeeCount', String(countFor(size, null)))
                setCreating(true)
                setFormProblem(null)
                startTransition(async () => {
                  const result = await createAccount({ status: 'idle' }, data)
                  setCreating(false)
                  if (result.status === 'problem') {
                    setFormProblem(result.problem)
                    trackForm('signup_error', `form_${result.problem}`)
                  } else if (result.status === 'requested') {
                    trackForm('signup_step', 'join_requested')
                    setRequest(result.request)
                    setPhase('waiting')
                  } else if (result.status === 'created') {
                    trackEvent('signup_completed')
                    setCreatedName(companyName.trim())
                    setPhase('created')
                  }
                })
              }}
            >
              <h1 className="m-0 max-w-[22ch] font-display text-[clamp(26px,3.6vw,32px)] font-semibold leading-[1.12] [text-wrap:balance]">
                {t('formTitle')}
              </h1>
              <p className="mt-[11px] max-w-[52ch] text-[14.5px] leading-[1.65] text-mut [text-wrap:pretty]">
                {t('formLead')}
              </p>

              <label className="mt-[22px] block max-w-[420px]">
                <span className="mb-[7px] block text-[13px] font-bold">{t('companyName')}</span>
                <input
                  name="companyName"
                  required
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t('companyNamePlaceholder')}
                  className={inputClass}
                />
              </label>
              <div className="mt-[8px] max-w-[52ch] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                {t('companyHint')}
              </div>

              <label className="mt-[16px] block max-w-[340px]">
                <span className="mb-[7px] block text-[13px] font-bold">
                  {t('orgNumber')} <span className="font-medium text-mut">{t('optional')}</span>
                </span>
                <input
                  name="orgNumber"
                  inputMode={numberInput}
                  autoCapitalize={numberInput === 'text' ? 'characters' : undefined}
                  value={orgNumber}
                  onChange={(e) => setOrgNumber(e.target.value)}
                  placeholder={t(registry ? 'orgNumberPlaceholder' : 'orgNumberPlaceholderManual')}
                  className={inputClass}
                />
              </label>
              <div className="mt-[8px] max-w-[52ch] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                {t(registry ? 'orgNumberOptionalHint' : 'orgNumberOptionalHintManual')}
              </div>

              <div className="mt-[16px] grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(215px,1fr))]">
                <label className="block">
                  <span className="mb-[7px] block text-[13px] font-bold">{t('name')}</span>
                  <input
                    name="fullName"
                    required
                    autoComplete="name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('namePlaceholder')}
                    className={inputClass}
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
                    className={inputClass}
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
                  className="h-[46px] w-full rounded-cta border-[1.5px] bg-bg px-[15px] text-[16px] text-ink outline-none"
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
              </div>

              <div
                role={formProblem ? 'alert' : undefined}
                className="mt-[11px] max-w-[52ch] text-[12.5px] leading-[1.5] [text-wrap:pretty]"
                style={{ color: formProblem ? '#A33A16' : '#5F5849' }}
              >
                {formProblem
                  ? t.has(`problem.${formProblem}`)
                    ? t(`problem.${formProblem}`)
                    : t('problem.org_failed')
                  : canCreate
                    ? t('ctaHintReady')
                    : t('ctaHintMissing')}
              </div>

              {google || microsoft ? (
                <>
                  <GoogleDivider label={t('googleOr')} />
                  <input type="hidden" name="flow" value="signup" />
                  <input type="hidden" name="employeeCount" value={String(countFor(size, null))} />
                  <div className="flex flex-col gap-[9px]">
                    {microsoft ? <MicrosoftButton inForm label={t('microsoft')} disabled={!consent || !companyName.trim()} onClick={() => trackForm('signup_step', 'sso_microsoft')} /> : null}
                    {google ? <GoogleButton inForm label={t('google')} disabled={!consent || !companyName.trim()} onClick={() => trackForm('signup_step', 'sso_google')} /> : null}
                  </div>
                  <div className="mt-[9px] max-w-[52ch] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                    {microsoft ? t('providerHint') : t('googleHint')}
                  </div>
                </>
              ) : null}
            </form>
          ) : null}

          {/* ------------------------------------------------------- created */}
          {phase === 'created' ? (
            <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-pill bg-mint text-[25px] text-greendeep">
                ✓
              </span>
              <h1 className="mt-[17px] max-w-[24ch] font-display text-[clamp(26px,3.6vw,32px)] font-semibold leading-[1.12] [text-wrap:balance]">
                {t('doneTitle', { name: firstName.trim().split(' ')[0] || t('doneFallbackName') })}
              </h1>
              <p className="mt-[12px] max-w-[54ch] text-[14.5px] leading-[1.65] text-body [text-wrap:pretty]">
                {t('doneLead', { company: createdName })}
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
                        {k === 'threshold' && floor > K_FLOOR
                          ? t('todo.threshold.noteAt', { standard: Math.max(K_DEFAULT, floor), floor })
                          : t(`todo.${k}.note`)}
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

              <HeardAbout />
            </div>
          ) : null}

          {/* ------------------------------------------------------- waiting */}
          {phase === 'waiting' ? (
            <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
              <h1 className="m-0 max-w-[24ch] font-display text-[clamp(26px,3.6vw,32px)] font-semibold leading-[1.12] [text-wrap:balance]">
                {request
                  ? t(request.status === 'dismissed' ? 'declinedTitle' : 'waitingTitle', { company: request.company })
                  : t('waitingTitleGeneric')}
              </h1>
              <p className="mt-[12px] max-w-[54ch] text-[14.5px] leading-[1.65] text-body [text-wrap:pretty]">
                {t(request?.status === 'dismissed' ? 'declinedLead' : 'waitingLead')}
              </p>
              {request?.status === 'dismissed' ? null : (
                <p className="mt-[10px] max-w-[54ch] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
                  {t('waitingNote')}
                </p>
              )}

              {request?.separable ? (
                <div className="mt-[22px] rounded-note border border-line bg-bg px-[20px] py-[18px]">
                  <span className="block text-[14px] font-semibold">{t('separateTitle')}</span>
                  <span className="mt-[4px] block max-w-[54ch] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">
                    {t('separateLead', { typed: request.typed })}
                  </span>
                  <button
                    type="button"
                    disabled={separating}
                    onClick={() => {
                      setSeparating(true)
                      setSeparateProblem(null)
                      startTransition(async () => {
                        const result = await separateCompany()
                        setSeparating(false)
                        if (result.status === 'created') {
                          trackForm('signup_step', 'separate_created')
                          trackEvent('signup_completed')
                          setCreatedName(request.typed)
                          setPhase('created')
                        } else {
                          setSeparateProblem(result.problem)
                          trackForm('signup_error', `separate_${result.problem}`)
                        }
                      })
                    }}
                    className="mt-[14px] inline-flex h-[44px] cursor-pointer items-center rounded-tile border border-ink bg-transparent px-[18px] text-[14.5px] font-bold text-ink"
                  >
                    {separating ? t('creating') : t('separateButton', { typed: request.typed })}
                  </button>
                  {separateProblem ? (
                    <p role="alert" className="mb-0 mt-[9px] text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
                      {t.has(`problem.${separateProblem}`) ? t(`problem.${separateProblem}`) : t('problem.org_failed')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Link
                href="/logg-inn"
                className="mt-[22px] inline-flex h-[48px] items-center rounded-tile border border-line bg-transparent px-[18px] text-[15px] font-semibold text-ink no-underline"
              >
                {t('waitingSignIn')}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="sticky top-[76px] flex min-w-0 flex-col gap-[12px]">
          <div className="rounded-note border border-line bg-sf px-[22px] py-[20px]">
            <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">
              {t('inclHead')}
            </span>
            <span className="mt-[13px] flex flex-col gap-[9px]">
              {(['instrument', 'report', 'measures', 'conversations', 'users'] as const)
                // the report is written for Norway's law: not promised where the market's is not built (D-256)
                .filter((k) => legal || k !== 'report')
                .map((k) => (
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
              {t(phase === 'form' ? 'reassure2' : 'reassure3')}
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
