import 'server-only'
import { z } from 'zod'
import { call } from './api'

/**
 * The CRM's reads (0055, D-101). Each function checks the admin's role and second factor and
 * writes an audit row; this file parses what comes back.
 */
const num = z.coerce.number()
const tsn = z.string().nullable()

export const CONTACT_TYPES = ['prospect', 'trial', 'customer', 'former'] as const
export const CONTACT_ROLES = ['daglig_leder', 'hr', 'leder', 'verneombud', 'annet'] as const
export const CONTACT_SOURCES = ['user', 'newsletter', 'contact_form', 'import', 'manual', 'event'] as const
export const CAMPAIGN_KINDS = ['newsletter', 'campaign', 'promotion', 'announcement'] as const

const Contact = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  org_number: z.string().nullable(),
  org_id: z.string().nullable(),
  org_name: z.string().nullable(),
  role: z.string().nullable(),
  source: z.string(),
  basis: z.enum(['consent', 'customer', 'none']),
  status: z.enum(['pending', 'active', 'unsubscribed']),
  type: z.enum(CONTACT_TYPES),
  mailable: z.boolean(),
  suppressed: z.boolean(),
  consent_at: tsn,
  consent_source: z.string().nullable(),
  tags: z.array(z.string()),
  lang: z.string(),
  last_engaged_at: tsn,
  created_at: z.string(),
})
export type Contact = z.infer<typeof Contact>

const Contacts = z.object({
  counts: z.object({
    total: num,
    prospect: num,
    trial: num,
    customer: num,
    former: num,
    mailable: num,
    pending: num,
    unsubscribed: num,
  }),
  suppressed: num,
  customer_exception: z.boolean(),
  waiting: num,
  rows: z.array(Contact),
})
export const crmContacts = (q: string | null, type: string | null) =>
  call('admin_crm_contacts', { p_q: q, p_type: type, p_limit: 300 }, Contacts)

const TimelineRow = z.object({
  kind: z.string(),
  campaign_id: z.string().nullable(),
  campaign: z.string().nullable(),
  status: z.string(),
  created_at: z.string(),
  sent_at: tsn,
  delivery: z.string().nullable(),
  opened_at: tsn,
  clicked_at: tsn,
  unsubscribed_at: tsn,
})
export type TimelineRow = z.infer<typeof TimelineRow>
export const crmContact = (id: string) => call('admin_crm_contact', { p_id: id }, z.object({ contact: Contact, timeline: z.array(TimelineRow) }))

export const Filter = z
  .object({
    types: z.array(z.enum(CONTACT_TYPES)).optional(),
    roles: z.array(z.enum(CONTACT_ROLES)).optional(),
    sources: z.array(z.enum(CONTACT_SOURCES)).optional(),
    tags: z.array(z.string()).optional(),
    lang: z.enum(['no', 'en']).optional(),
    min_employees: z.number().optional(),
    max_employees: z.number().optional(),
    nace: z.string().optional(),
    no_survey_days: z.number().optional(),
    mailable_only: z.boolean().optional(),
  })
  .strict()
export type Filter = z.infer<typeof Filter>

const Segment = z.object({ id: z.string(), name: z.string(), filter: Filter, updated_at: z.string(), total: num, mailable: num })
export type Segment = z.infer<typeof Segment>
export const crmSegments = () => call('admin_crm_segments', {}, z.object({ rows: z.array(Segment) }))

const Stats = z.object({
  queued: num,
  sent: num,
  failed: num,
  skipped: num,
  delivered: num,
  bounced: num,
  opened: num,
  clicked: num,
  unsubscribed: num,
  complaints: num,
})
export type Stats = z.infer<typeof Stats>

const CampaignRow = z.object({
  id: z.string(),
  number: num,
  name: z.string(),
  kind: z.enum(CAMPAIGN_KINDS),
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled']),
  subject: z.string(),
  segment: z.string().nullable(),
  scheduled_at: tsn,
  finished_at: tsn,
  audience: num.nullable(),
  utm_campaign: z.string(),
  stats: Stats,
})
export type CampaignRow = z.infer<typeof CampaignRow>
export const crmCampaigns = () => call('admin_crm_campaigns', {}, z.object({ rows: z.array(CampaignRow) }))

export const Block = z.object({
  type: z.enum(['heading', 'text', 'button']),
  text: z.string(),
  url: z.string().optional(),
})
export type Block = z.infer<typeof Block>

const Campaign = z.object({
  id: z.string(),
  number: num,
  name: z.string(),
  kind: z.enum(CAMPAIGN_KINDS),
  lang: z.enum(['no', 'en']),
  subject: z.string(),
  preheader: z.string(),
  blocks: z.array(Block),
  segment_id: z.string().nullable(),
  utm_campaign: z.string(),
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled']),
  scheduled_at: tsn,
  started_at: tsn,
  finished_at: tsn,
  audience: num.nullable(),
  created_at: z.string(),
})
export type Campaign = z.infer<typeof Campaign>
export const crmCampaign = (id: string) =>
  call(
    'admin_crm_campaign',
    { p_id: id },
    z.object({
      campaign: Campaign,
      stats: Stats,
      web: z.object({ sessions: num, views: num, signups: num, paid: num }),
      tests: num,
    }),
  )
