import 'server-only'
import { z } from 'zod'
import { call } from './api'

/**
 * Sentral › CRM, design revision 3 (phase G3, 0143, D-184): the readers of the Consent, Brønnøysund
 * triggers, Partners and Lead scoring pages. Every row is parsed, never cast.
 */
const num = z.coerce.number()
const tsn = z.string().nullable()

// ---------------------------------------------------------------- consent
export const CONSENT_STATUSES = ['granted', 'withdrawn', 'lapsed', 'not_given', 'notice_given'] as const
export const CONSENT_BASES = ['consent', 'existing_customer_15_3', 'legit_interest_phone', 'business_address'] as const
export const CONSENT_METHODS = [
  'migrated', 'double_opt_in', 'one_click_unsubscribe', 'preference_centre', 'provider_complaint', 'provider_bounce',
  'provider_unsubscribe', 'admin', 'import', 'account_sync', 'demo_request', 'system', 'phone_notice',
] as const
export const SUPPRESSION_REASONS = ['unsubscribed', 'hard_bounce', 'invalid', 'spam', 'blocked', 'manual', 'erased'] as const
/** the reasons an admin may give when adding one (the design's Unsubscribe · Hard bounce · Complaint · Legal 410 · Manual) */
export const ADMIN_SUPPRESSION_REASONS = ['unsubscribed', 'hard_bounce', 'spam', 'erased', 'manual'] as const

const Purpose = z.string().regex(/^(marketing|phone_outreach|list:[a-z0-9-]{2,40})$/)
const ConsentRow = z.object({
  id: num,
  at: z.string(),
  contact_id: z.string().uuid().nullable(),
  company_id: z.string().uuid().nullable(),
  who: z.string().nullable(),
  purpose: Purpose,
  list: z.string().nullable(),
  status: z.enum(CONSENT_STATUSES),
  basis: z.enum(CONSENT_BASES).nullable(),
  method: z.enum(CONSENT_METHODS),
  doi_sent_at: tsn,
  doi_confirmed_at: tsn,
})
export type ConsentRow = z.infer<typeof ConsentRow>
const Consent = z.object({
  kpis: z.object({
    marketing: num,
    contacts: num,
    with_record: num,
    doi_confirmed: num,
    doi_pending: num,
    withdrawn_30d: num,
    sunset: num,
  }),
  rows: z.array(ConsentRow),
  purposes: z.array(z.object({ key: Purpose, list: z.string().nullable(), granted: num, consent: num, doi: num })),
  suppression: z.object({
    count: num,
    rows: z.array(z.object({ head: z.string().regex(/^[0-9a-f]{4}$/), tail: z.string().regex(/^[0-9a-f]{2}$/), reason: z.enum(SUPPRESSION_REASONS), at: z.string() })),
  }),
})
export type Consent = z.infer<typeof Consent>
/** The ledger's recent records, its figures, the purposes with their double opt-in and the suppression list's latest hashes */
export const consentLedger = () => call('admin_consent', {}, Consent)

const ExportRow = z.object({
  id: num,
  at: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  org_number: z.string().nullable(),
  purpose: Purpose,
  status: z.enum(CONSENT_STATUSES),
  basis: z.enum(CONSENT_BASES).nullable(),
  method: z.enum(CONSENT_METHODS),
  doi_sent_at: tsn,
  doi_confirmed_at: tsn,
  by: z.string().nullable(),
})
export type ConsentExportRow = z.infer<typeof ExportRow>
/** Every record, for the CSV (audited in the database) */
export const consentExport = () => call('admin_consent_export', {}, z.object({ rows: z.array(ExportRow) }))

// ---------------------------------------------------------------- Brønnøysund triggers
export const TRIGGER_KINDS = ['threshold_5', 'threshold_30', 'company_new', 'manager_changed'] as const
export const OUTREACH_CHANNELS = ['phone', 'letter', 'email'] as const
export const OUTREACH_STATUSES = ['queued', 'assigned', 'sent', 'holdout', 'do_not_contact'] as const
/** The engine's rules as it applies them (app.brreg_rules): the law's employee thresholds, the target NACE divisions as ranges, the fit minimum */
const Rules = z.object({
  thresholds: z.array(num).min(1),
  industries: z.array(z.tuple([num, num])).min(1),
  fit_min: num,
})
const Triggers = z.object({
  dry_run: z.boolean(),
  rules: Rules,
  last: z.object({ id: num, finished_at: z.string(), changes: num.nullable() }).nullable(),
  pending: z.boolean(),
  kpis: z.object({ raised: num, matched: num, queued: num, held_out: num, dnc: num, purged: num }),
  types: z.array(z.object({ kind: z.enum(TRIGGER_KINDS), n: num, fit: num, tasks: num, hold: num })),
  queue: z.array(
    z.object({
      id: z.string().uuid(),
      org: z.string(),
      org_number: z.string().regex(/^[0-9]{9}$/),
      kind: z.enum(TRIGGER_KINDS),
      from: num.nullable(),
      to: num.nullable(),
      nace: z.string().nullable(),
      fit: num,
      channel: z.enum(OUTREACH_CHANNELS).nullable(),
      email_local: z.string().nullable(),
      status: z.enum(OUTREACH_STATUSES),
      company_id: z.string().uuid().nullable(),
    }),
  ),
  results: z.array(z.object({ channel: z.enum(OUTREACH_CHANNELS), contacts: num, trials: num })),
  holdout: z.object({ contacts: num, trials: num }),
})
export type Triggers = z.infer<typeof Triggers>
export const brregTriggers = () => call('admin_brreg_triggers', {}, Triggers)

// ---------------------------------------------------------------- partners
export const PARTNER_KINDS = ['accounting', 'bht', 'hms', 'bransje'] as const
export const PARTNER_STATUSES = ['in_talks', 'kit_sent', 'pilot_signed', 'member_offer_drafted', 'phase_2'] as const
export const SHARE_KINDS = ['recurring', 'client_discount', 'affiliate', 'member_discount'] as const
/** the share kinds that are a per cent (the partners table's CHECK: these need one, the others none) */
export const PCT_SHARE_KINDS = ['recurring', 'client_discount', 'affiliate'] as const
const Partner = z.object({
  id: z.string().uuid(),
  name: z.string(),
  org_number: z.string().nullable(),
  kind: z.enum(PARTNER_KINDS),
  contact: z.string().nullable(),
  code: z.string().nullable(),
  share_kind: z.enum(SHARE_KINDS).nullable(),
  share_pct: num.nullable(),
  status: z.enum(PARTNER_STATUSES),
  trials_30: num,
  trials_7: num,
})
export type Partner = z.infer<typeof Partner>
/** The partner kit's one part the product holds, the referral code at signup: a presence check of its path, by the database */
const Kit = z.object({ code: z.boolean() })
export const crmPartners = () => call('admin_crm_partners', {}, z.object({ kit: Kit, rows: z.array(Partner) }))

// ---------------------------------------------------------------- lead scoring
export const FIT_PARTS = ['industry', 'size', 'crossed', 'manager', 'active'] as const
export const INTENT_PARTS = ['tool', 'pdf', 'pricing', 'industry_twice', 'webinar', 'hand_raise'] as const
export const ROUTES = ['founder', 'pql', 'trial', 'nurture'] as const
const FitPart = z.object({ key: z.enum(FIT_PARTS), points: num, on: z.boolean() })
const IntentPart = z.object({ key: z.enum(INTENT_PARTS), points: num, on: z.boolean(), sourced: z.boolean() })
const Scored = z.object({
  id: z.string().uuid(),
  name: z.string(),
  company: z.string(),
  company_id: z.string().uuid(),
  fit: num,
  intent: num,
  total: num,
  fit_parts: z.array(FitPart),
  intent_parts: z.array(IntentPart),
  hand_raised_at: tsn,
  pql: z.enum(['activated', 'response_day7', 'verneombud_tier']).nullable(),
  route: z.enum(ROUTES),
  stage: z.enum(['lead', 'trial']),
  nace: z.string().nullable(),
  employees: num.nullable(),
})
export type Scored = z.infer<typeof Scored>
/** The contacts scored, highest first, and the rules as the database scores them (the target industries app.brreg_rules') */
export const leadScores = () =>
  call(
    'admin_lead_scores',
    {},
    z.object({ fit_rules: z.array(FitPart), intent_rules: z.array(IntentPart), industries: Rules.shape.industries, rows: z.array(Scored) }),
  )
