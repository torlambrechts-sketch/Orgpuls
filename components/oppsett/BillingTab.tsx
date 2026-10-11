import { getFormatter, getTranslations } from 'next-intl/server'
import { ANNUAL_MONTHS, CANCEL_REASONS, fittingPlan, GRACE_DAYS, PLAN_MAX, PLANS, type Billing } from '@/lib/billing/read'
import { planPrices, priceDigits, yearly as yearPrice } from '@/lib/site/pricing'
import { requestMarket } from '@/lib/i18n/market'
import { BillingForm, CancelSubscription, DowngradeToFree, ExtendTrialButton, WithdrawCancellation, WithdrawDowngrade } from './BillingForms'
import { dateFormat } from '@/lib/i18n/dates'
import { getDates } from '@/lib/i18n/dates-server'

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
 * Each plan is paid monthly, or yearly at ten months' price (0201, D-217). Past the trial and its
 * grace, unconfirmed, the organisation is on the free plan, and this says what that covers.
 *
 * The row is the daglig leder's alone (RLS). Anyone else is told who handles payment and
 * sees nothing of it.
 *
 * A paying customer may move to the free plan instead (0202, D-226): the paid period runs out first,
 * nothing is deleted, and until the day it begins the move can be taken back.
 *
 * Last, cancelling (0066, D-110): the dates it would have, and the step itself; once
 * cancelled, the dates and a way to take it back until everything is deleted.
 *
 * The prices are the organisation's market's list (lib/site/pricing.ts, X-113): kroner in Norway,
 * pounds in the United Kingdom, whose pack words the amounts and the reverse charge. A UK
 * organisation is invoiced by e-mail, so it has no EHF; it gives its VAT registration number in that
 * place instead (0227, D-274).
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
  const market = await requestMarket()
  const prices = planPrices(market)
  // the reverse-charged invoice of a UK organisation carries its VAT number; EHF is Norway's (0227)
  const uk = market === 'gb'
  // the organisation's clock and the reader's form of a date (lib/i18n/dates.ts, D-273)
  const dates = await getDates()
  const date = (iso: string) => dateFormat(dates, { dateStyle: 'long' }).format(new Date(iso))

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
  // after the trial, 14 days' grace; then the free plan until a plan is confirmed (0052, 0201)
  const freeFrom = ends + GRACE_DAYS * DAY
  // a paying customer's chosen move to the free plan (0202): pending until its day, then the free plan
  const chosenFree = billing.free_from ? Date.parse(billing.free_from) : null
  const downgraded = chosenFree !== null && now >= chosenFree
  const pendingFree = chosenFree !== null && now < chosenFree
  const confirmed = billing.confirmed_at !== null && !downgraded
  const free = downgraded || (!confirmed && now >= freeFrom)
  const graceLeft = Math.max(0, Math.ceil((freeFrom - now) / DAY))
  const planKey = { small: 'small', usual: 'usual', group: 'group' } as const

  const pill = confirmed
    ? pendingFree
      ? { text: t('pillFreeFrom', { date: date(billing.free_from!) }), cls: 'bg-sbg text-ink' }
      : { text: t('pillConfirmed'), cls: 'bg-mint text-greendeep' }
    : free
      ? { text: t('pillFree'), cls: 'bg-sbg text-ink' }
      : expired
        ? { text: t('pillGrace', { count: graceLeft }), cls: 'bg-peach text-dangerdeep' }
      : { text: t('pillLeft', { count: left }), cls: left <= 3 ? 'bg-peach text-dangerdeep' : 'bg-sbg text-ink' }

  // a cancellation now: a paid month or year runs out, a trial or the free plan ends today (0066,
  // 0201); all in Oslo's calendar, as cancel_subscription counts
  const oslo = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date(ms))
  const today = oslo(now)
  const paying = confirmed
  const yearly = billing.billing_interval === 'year'
  const [y, m] = today.split('-').map(Number)
  const lastDay = !paying ? today : yearly ? paidYearEnd(oslo(Math.max(ends, Date.parse(billing.confirmed_at!))), today) : new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10)
  // moving to the free plan (0202): the paid period runs out, or the trial if nothing is invoiced yet
  const trialLast = oslo(ends - DAY)
  const paidLast = paying ? (today <= trialLast ? trialLast : lastDay) : today
  const freeFirst = new Date(Date.parse(`${paidLast}T12:00:00Z`) + DAY).toISOString().slice(0, 10)
  // deletion begins at midnight 31 days after the last day (0065), so that is the day named
  const deleteDay = new Date(Date.parse(`${lastDay}T12:00:00Z`) + 31 * DAY).toISOString().slice(0, 10)
  const day = (d: string) => dateFormat(dates, { dateStyle: 'long' }).format(new Date(`${d}T12:00:00Z`))
  const cancelled = billing.cancelled_at !== null && billing.cancel_effective_at !== null && billing.deletion_due_at !== null
  const cancelledLast = cancelled ? date(new Date(Date.parse(billing.cancel_effective_at!) - 1000).toISOString()) : ''

  const suggested = fittingPlan(company.employees)
  const kroner = (n: number) => t('kroner', { n: format.number(n) })
  const plans = PLANS.map((p) => {
    const monthly = p === 'group' ? null : prices[p]
    return {
      key: p,
      name: plansT(`${planKey[p]}.name`),
      who: plansT(`${planKey[p]}.who`),
      // the plan by agreement has no list price, in either interval
      price: {
        month: monthly === null ? plansT(`${planKey[p]}.price`) : kroner(monthly),
        year: monthly === null ? plansT(`${planKey[p]}.price`) : kroner(monthly * ANNUAL_MONTHS),
      },
      unit: { month: monthly === null ? '' : t('perMonth'), year: monthly === null ? '' : t('perYear') },
      // whole kroner; pounds to the penny, where a whole pound would be a different price (D-275)
      perMonth:
        monthly === null
          ? null
          : t('yearPerMonth', {
              price: format.number(yearPrice(monthly, priceDigits(market)).perMonth, { minimumFractionDigits: priceDigits(market), maximumFractionDigits: priceDigits(market) }),
            }),
      fits: company.employees <= PLAN_MAX[p],
      suggested: p === suggested,
    }
  })

  return (
    <div className="mt-[20px] flex flex-col gap-[16px]">
      {/* ------------------------------------------------------------ the trial */}
      <section
        aria-labelledby="billing-trial"
        className={`rounded-panel border px-[22px] py-[20px] ${!confirmed && !free && (expired || left <= 3) ? 'border-ink bg-sbg' : 'border-line bg-sf'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <h2 id="billing-trial" className="m-0 text-[16px] font-bold">
            {confirmed ? t('subscriptionHead') : free ? t('freeHead') : t('trialHead')}
          </h2>
          <span className={`rounded-pill px-[10px] py-[4px] text-[11.5px] font-bold ${pill.cls}`}>{pill.text}</span>
        </div>
        <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
          {confirmed
            ? t(billing.plan === 'group' ? 'confirmedGroupBody' : 'confirmedBody', {
                plan: billing.plan ? plansT(`${planKey[billing.plan]}.name`) : '',
                interval: billing.billing_interval,
                start: date(new Date(Math.max(ends, Date.parse(billing.confirmed_at!))).toISOString()),
                mail: billing.invoice_email ?? '',
              })
            : free
              ? downgraded
                ? t('freeBodyChosen', { date: date(billing.free_from!) })
                : t('freeBody', { end: date(billing.trial_ends_at) })
              : expired
                ? t('graceBody', { end: date(billing.trial_ends_at), until: date(new Date(freeFrom).toISOString()) })
                : t('trialBody', {
                    start: date(billing.trial_started_at),
                    end: date(billing.trial_ends_at),
                    total,
                    grace: GRACE_DAYS,
                  })}
        </p>
        {confirmed && pendingFree ? (
          <>
            <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
              {t('downgrade.pendingBody', { first: date(billing.free_from!), last: date(new Date(chosenFree! - 1000).toISOString()) })}
            </p>
            <WithdrawDowngrade
              labels={{
                submit: t('downgrade.withdraw'),
                pending: t('saving'),
                problems: {
                  not_chosen: t('downgrade.problem.not_chosen'),
                  not_allowed: t('problem.not_allowed'),
                  failed: t('problem.failed'),
                },
              }}
            />
          </>
        ) : null}
        {confirmed || free ? null : (
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
        {confirmed || free ? null : billing.trial_extended_at ? (
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
            interval: billing.billing_interval,
            invoiceEmail: billing.invoice_email ?? '',
            invoiceRef: billing.invoice_ref ?? '',
            ehf: billing.ehf,
          }}
          vat={
            uk
              ? { initial: billing.vat_number ?? '', label: t('vatNumber'), hint: t('vatNumberHint') }
              : null
          }
          orgNumber={company.orgNumber}
          confirmed={confirmed}
          labels={{
            planLegend: t('planLegend'),
            intervalLegend: t('intervalLegend'),
            intervals: { month: t('interval.month'), year: t('interval.year') },
            suggested: t('suggested'),
            tooMany: t('tooMany', { count: company.employees }),
            invoiceEmail: t('invoiceEmail'),
            invoiceEmailHint: t('invoiceEmailHint'),
            invoiceRef: t('invoiceRef'),
            invoiceRefHint: t('invoiceRefHint'),
            ehf: t('ehf', { orgnr: company.orgNumber ?? '' }),
            ehfNoOrgnr: t('ehfNoOrgnr'),
            // billing starts when the trial ends, or on the day of confirming if that is later
            terms: {
              month: expired ? t('termsAfterTrial', { interval: 'month' }) : t('terms', { interval: 'month', end: date(billing.trial_ends_at) }),
              year: expired ? t('termsAfterTrial', { interval: 'year' }) : t('terms', { interval: 'year', end: date(billing.trial_ends_at) }),
            },
            save: confirmed ? t('saveChanges') : t('save'),
            confirm: t('confirm'),
            confirmGroup: t('confirmGroup'),
            saved: t('saved'),
            confirmedNow: t('confirmedNow'),
            pending: t('saving'),
            problems: {
              invalid_plan: t('problem.invalid_plan'),
              invalid_interval: t('problem.invalid_plan'),
              plan_too_small: t('problem.plan_too_small'),
              invalid_email: t('problem.invalid_email'),
              invalid_ref: t('problem.invalid_ref'),
              ehf_needs_orgnr: t('problem.ehf_needs_orgnr'),
              ehf_not_offered: t('problem.ehf_not_offered'),
              invalid_vat_number: t('problem.invalid_vat_number'),
              business_evidence_needed: t('problem.business_evidence_needed'),
              not_allowed: t('problem.not_allowed'),
              failed: t('problem.failed'),
            },
          }}
        />
      </section>

      {/* ------------------------------------------------- moving to the free plan */}
      {confirmed && !pendingFree && !cancelled ? (
        <section aria-labelledby="billing-free" className="rounded-panel border border-line bg-sf px-[22px] py-[20px]">
          <h2 id="billing-free" className="m-0 text-[16px] font-bold">
            {t('downgrade.head')}
          </h2>
          <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
            {t('downgrade.lead', { last: day(paidLast), first: day(freeFirst) })}
          </p>
          <DowngradeToFree
            labels={{
              open: t('downgrade.open'),
              confirm: t('downgrade.confirm', { org: company.name, first: day(freeFirst) }),
              submit: t('downgrade.submit'),
              pending: t('saving'),
              back: t('cancel.back'),
              problems: {
                confirm_required: t('downgrade.problem.confirm_required'),
                already_chosen: t('downgrade.problem.already_chosen'),
                not_subscribed: t('downgrade.problem.not_subscribed'),
                cancelled: t('downgrade.problem.cancelled'),
                not_allowed: t('problem.not_allowed'),
                failed: t('problem.failed'),
              },
            }}
          />
        </section>
      ) : null}

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
                ? `${t('cancel.leadPaying', { interval: billing.billing_interval, last: day(lastDay), deleted: day(deleteDay) })}${pendingFree ? '' : ` ${t('cancel.orFree')}`}`
                : free
                  ? t('cancel.leadFree', { deleted: day(deleteDay) })
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

/**
 * The last day of the paid year a yearly subscription is in today: the day before the next
 * anniversary of its start (YYYY-MM-DD, Oslo). Before the first paid day nothing runs out. Mirrors
 * cancel_subscription (0201).
 */
function paidYearEnd(start: string, today: string): string {
  if (today < start) return today
  const [sy, sm, sd] = start.split('-').map(Number)
  let years = Number(today.slice(0, 4)) - sy!
  if (today.slice(5) >= start.slice(5)) years += 1
  const next = new Date(Date.UTC(sy! + years, sm! - 1, sd!))
  return new Date(next.getTime() - DAY).toISOString().slice(0, 10)
}
