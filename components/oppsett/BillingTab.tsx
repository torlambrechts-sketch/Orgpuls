import { getFormatter, getTranslations } from 'next-intl/server'
import { CANCEL_REASONS, fittingPlan, GRACE_DAYS, PLAN_MAX, PLANS, type Billing } from '@/lib/billing/read'
import { BillingForm, CancelSubscription, ExtendTrialButton, WithdrawCancellation } from './BillingForms'

const DAY = 86_400_000

/**
 * Oppsett › Betaling (D-89): the trial, and what Orgpuls invoices when it ends.
 *
 * First the trial: how long is left, and — once, before a plan is confirmed — a button that
 * extends it by fifteen days. Then the plan, from the price list, with the ones the
 * organisation has outgrown shown but not selectable. Then the invoice details: an address,
 * an optional reference, and EHF when there is an organisation number to send it to.
 * Payment is by invoice; nothing here takes a card.
 *
 * The row is the daglig leder's alone (RLS). Anyone else is told who handles payment and
 * sees nothing of it.
 *
 * Last, cancelling (0066, D-110): the dates it would have, and the step itself; once
 * cancelled, the dates and a way to take it back until everything is deleted.
 */
export async function BillingTab({
  billing,
  canWrite,
  company,
  now,
}: {
  billing: Billing | null
  canWrite: boolean
  company: { name: string; orgNumber: string | null; employees: number }
  now: number
}) {
  const t = await getTranslations('oppsett.billing')
  const plansT = await getTranslations('start.plan')
  const format = await getFormatter()
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: 'Europe/Oslo' })

  if (!billing || !canWrite) {
    return (
      <section className="mt-[20px] rounded-panel border border-line bg-sf px-[22px] py-[20px]">
        <h2 className="m-0 text-[16px] font-bold">{t('head')}</h2>
        <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] text-mut">{t('onlyLeader')}</p>
      </section>
    )
  }

  const started = Date.parse(billing.trial_started_at)
  const ends = Date.parse(billing.trial_ends_at)
  const left = Math.max(0, Math.ceil((ends - now) / DAY))
  const total = Math.max(1, Math.round((ends - started) / DAY))
  const used = Math.min(1, Math.max(0, (now - started) / (ends - started)))
  const expired = ends <= now
  // after the trial, 14 days' grace; then read-only until a plan is confirmed (0052, D-94)
  const readOnlyFrom = ends + GRACE_DAYS * DAY
  const readOnly = now >= readOnlyFrom
  const graceLeft = Math.max(0, Math.ceil((readOnlyFrom - now) / DAY))
  const confirmed = billing.confirmed_at !== null
  const planKey = { small: 'small', usual: 'usual', group: 'group' } as const

  const pill = confirmed
    ? { text: t('pillConfirmed'), cls: 'bg-mint text-greendeep' }
    : readOnly
      ? { text: t('pillReadOnly'), cls: 'bg-peach text-dangerdeep' }
      : expired
        ? { text: t('pillGrace', { count: graceLeft }), cls: 'bg-peach text-dangerdeep' }
      : { text: t('pillLeft', { count: left }), cls: left <= 3 ? 'bg-peach text-dangerdeep' : 'bg-sbg text-ink' }

  // a cancellation now: a paid month runs out, a trial ends today (0066); both in Oslo's calendar
  const oslo = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date(ms))
  const today = oslo(now)
  const paying = confirmed && !readOnly
  const [y, m] = today.split('-').map(Number)
  const lastDay = paying ? new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10) : today
  // deletion begins at midnight 31 days after the last day (0065), so that is the day named
  const deleteDay = new Date(Date.parse(`${lastDay}T12:00:00Z`) + 31 * DAY).toISOString().slice(0, 10)
  const day = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { dateStyle: 'long', timeZone: 'Europe/Oslo' })
  const cancelled = billing.cancelled_at !== null && billing.cancel_effective_at !== null && billing.deletion_due_at !== null
  const cancelledLast = cancelled ? date(new Date(Date.parse(billing.cancel_effective_at!) - 1000).toISOString()) : ''

  const suggested = fittingPlan(company.employees)
  const plans = PLANS.map((p) => ({
    key: p,
    name: plansT(`${planKey[p]}.name`),
    who: plansT(`${planKey[p]}.who`),
    price: plansT(`${planKey[p]}.price`),
    unit: plansT(`${planKey[p]}.unit`),
    fits: company.employees <= PLAN_MAX[p],
    suggested: p === suggested,
  }))

  return (
    <div className="mt-[20px] flex flex-col gap-[16px]">
      {/* ------------------------------------------------------------ the trial */}
      <section
        aria-labelledby="billing-trial"
        className={`rounded-panel border px-[22px] py-[20px] ${!confirmed && (expired || left <= 3) ? 'border-ink bg-sbg' : 'border-line bg-sf'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <h2 id="billing-trial" className="m-0 text-[16px] font-bold">
            {confirmed ? t('subscriptionHead') : t('trialHead')}
          </h2>
          <span className={`rounded-pill px-[10px] py-[4px] text-[11.5px] font-bold ${pill.cls}`}>{pill.text}</span>
        </div>
        <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
          {confirmed
            ? t(billing.plan === 'group' ? 'confirmedGroupBody' : 'confirmedBody', {
                plan: billing.plan ? plansT(`${planKey[billing.plan]}.name`) : '',
                start: date(billing.trial_ends_at),
                mail: billing.invoice_email ?? '',
              })
            : readOnly
              ? t('readOnlyBody', { end: date(billing.trial_ends_at) })
              : expired
                ? t('graceBody', { end: date(billing.trial_ends_at), until: date(new Date(readOnlyFrom).toISOString()) })
                : t('trialBody', {
                    start: date(billing.trial_started_at),
                    end: date(billing.trial_ends_at),
                    total,
                    grace: GRACE_DAYS,
                  })}
        </p>
        {confirmed ? null : (
          <div
            role="progressbar"
            aria-label={t('progress')}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={total - left}
            className="mt-[12px] h-[8px] overflow-hidden rounded-pill bg-[rgba(25,21,16,.08)]"
          >
            <span
              className={`block h-full rounded-pill ${expired || left <= 3 ? 'bg-rustbar' : 'bg-ac'}`}
              style={{ width: `${used * 100}%` }}
            />
          </div>
        )}
        {confirmed ? null : billing.trial_extended_at ? (
          <p className="mb-0 mt-[12px] text-[12.5px] text-mut">{t('extendedOn', { when: date(billing.trial_extended_at) })}</p>
        ) : (
          <ExtendTrialButton
            labels={{
              submit: t('extend'),
              pending: t('extending'),
              note: t('extendNote'),
              problems: {
                already_extended: t('problem.already_extended'),
                already_subscribed: t('problem.already_subscribed'),
                not_allowed: t('problem.not_allowed'),
                failed: t('problem.failed'),
              },
            }}
          />
        )}
      </section>

      {/* ------------------------------------------------------ plan and invoice */}
      <section aria-labelledby="billing-plan" className="rounded-panel border border-line bg-sf px-[22px] py-[20px]">
        <h2 id="billing-plan" className="m-0 text-[16px] font-bold">
          {t('planHead')}
        </h2>
        <p className="mb-[16px] mt-[6px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('planLead', { name: company.name, orgnr: company.orgNumber ?? t('noOrgnr'), count: company.employees })}
        </p>
        <BillingForm
          plans={plans}
          initial={{
            plan: billing.plan,
            invoiceEmail: billing.invoice_email ?? '',
            invoiceRef: billing.invoice_ref ?? '',
            ehf: billing.ehf,
          }}
          orgNumber={company.orgNumber}
          confirmed={confirmed}
          labels={{
            planLegend: t('planLegend'),
            suggested: t('suggested'),
            tooMany: t('tooMany', { count: company.employees }),
            invoiceEmail: t('invoiceEmail'),
            invoiceEmailHint: t('invoiceEmailHint'),
            invoiceRef: t('invoiceRef'),
            invoiceRefHint: t('invoiceRefHint'),
            ehf: t('ehf', { orgnr: company.orgNumber ?? '' }),
            ehfNoOrgnr: t('ehfNoOrgnr'),
            // billing starts when the trial ends, or on the day of confirming if that is later
            terms: expired ? t('termsAfterTrial') : t('terms', { end: date(billing.trial_ends_at) }),
            save: confirmed ? t('saveChanges') : t('save'),
            confirm: t('confirm'),
            confirmGroup: t('confirmGroup'),
            saved: t('saved'),
            confirmedNow: t('confirmedNow'),
            pending: t('saving'),
            problems: {
              invalid_plan: t('problem.invalid_plan'),
              plan_too_small: t('problem.plan_too_small'),
              invalid_email: t('problem.invalid_email'),
              invalid_ref: t('problem.invalid_ref'),
              ehf_needs_orgnr: t('problem.ehf_needs_orgnr'),
              not_allowed: t('problem.not_allowed'),
              failed: t('problem.failed'),
            },
          }}
        />
      </section>

      {/* ------------------------------------------------------------ cancelling */}
      <section
        aria-labelledby="billing-cancel"
        className={`rounded-panel border px-[22px] py-[20px] ${cancelled ? 'border-ink bg-peach' : 'border-line bg-sf'}`}
      >
        <h2 id="billing-cancel" className="m-0 text-[16px] font-bold">
          {cancelled ? t('cancel.doneHead') : t('cancel.head')}
        </h2>
        {cancelled ? (
          <>
            <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
              {t('cancel.doneBody', { last: cancelledLast, deleted: date(billing.deletion_due_at!) })}
            </p>
            <WithdrawCancellation
              labels={{
                submit: t('cancel.withdraw'),
                pending: t('saving'),
                problems: { not_cancelled: t('cancel.problem.not_cancelled'), not_allowed: t('problem.not_allowed'), failed: t('problem.failed') },
              }}
            />
          </>
        ) : (
          <>
            <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
              {paying
                ? t('cancel.leadPaying', { last: day(lastDay), deleted: day(deleteDay) })
                : t('cancel.leadTrial', { deleted: day(deleteDay) })}
            </p>
            <CancelSubscription
              reasons={CANCEL_REASONS}
              labels={{
                open: t('cancel.open'),
                reasonLegend: t('cancel.reasonLegend'),
                reasons: Object.fromEntries(CANCEL_REASONS.map((r) => [r, t(`cancel.reason.${r}`)])),
                confirm: t('cancel.confirm', { org: company.name, deleted: day(deleteDay) }),
                download: t('cancel.download'),
                submit: t('cancel.submit'),
                pending: t('saving'),
                back: t('cancel.back'),
                problems: {
                  confirm_required: t('cancel.problem.confirm_required'),
                  already_cancelled: t('cancel.problem.already_cancelled'),
                  invalid_reason: t('problem.failed'),
                  not_allowed: t('problem.not_allowed'),
                  failed: t('problem.failed'),
                },
              }}
            />
          </>
        )}
      </section>
    </div>
  )
}
