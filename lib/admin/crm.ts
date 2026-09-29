import 'server-only'
import { z } from 'zod'
import { LOCALES } from '@/lib/i18n/locales'
import { call } from './api'

/**
 * The CRM's reads (0055, D-101; 0056–0058, D-103). Each function checks the admin's role and second factor and
 * writes an audit row; this file parses what comes back.
 */
const num = z.coerce.number()
const tsn = z.string().nullable()

export const CONTACT_TYPES = ['prospect', 'trial', 'customer', 'former'] as const
export const CONTACT_ROLES = ['daglig_leder', 'hr', 'leder', 'verneombud', 'annet'] as const
export const CONTACT_SOURCES = ['user', 'newsletter', 'contact_form', 'import', 'manual', 'event', 'brreg'] as const
export const BASES = ['consent', 'customer', 'business', 'none'] as const
/** a stage's key (0093): the stages themselves are data, read with crmStages */
export const StageKey = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/)
export const STAGE_KINDS = ['open', 'won', 'lost', 'parked'] as const
/** «reply» (0093): an answer, logged by a person; it moves the company on */
export const ACTIVITY_KINDS = ['note', 'call', 'meeting', 'email', 'reply', 'task'] as const
export const BLOCK_TYPES = ['heading', 'text', 'button', 'article', 'bullets', 'image', 'divider', 'quote', 'event', 'ps'] as const
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
  basis: z.enum(BASES),
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
  company_id: z.string().nullable().optional(),
  lists: z.array(z.string()).optional(),
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
    lang: z.enum(LOCALES).optional(),
    min_employees: z.number().optional(),
    max_employees: z.number().optional(),
    nace: z.string().optional(),
    no_survey_days: z.number().optional(),
    mailable_only: z.boolean().optional(),
    stages: z.array(StageKey).optional(),
    lists: z.array(z.string()).optional(),
    bases: z.array(z.enum(BASES)).optional(),
  })
  .strict()
export type Filter = z.infer<typeof Filter>

const Segment = z.object({ id: z.string(), name: z.string(), filter: Filter, updated_at: z.string(), total: num, mailable: num })
export type Segment = z.infer<typeof Segment>
export const crmSegments = () => call('admin_crm_segments', {}, z.object({ rows: z.array(Segment) }))

const Stats = z.object({
  queued: num,
  held: num.optional(),
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
  list: z.string().nullable(),
  ab: z.boolean(),
  ab_winner: z.enum(['a', 'b']).nullable(),
  scheduled_at: tsn,
  finished_at: tsn,
  audience: num.nullable(),
  utm_campaign: z.string(),
  publish_web: z.boolean(),
  slug: z.string().nullable(),
  signups: num,
  stats: Stats,
})
export type CampaignRow = z.infer<typeof CampaignRow>
export const crmCampaigns = () => call('admin_crm_campaigns', {}, z.object({ rows: z.array(CampaignRow) }))

export const Block = z.object({
  type: z.enum(BLOCK_TYPES),
  text: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  label: z.string().optional(),
  alt: z.string().optional(),
  href: z.string().optional(),
})
export type Block = z.infer<typeof Block>

const Campaign = z.object({
  id: z.string(),
  number: num,
  name: z.string(),
  kind: z.enum(CAMPAIGN_KINDS),
  lang: z.enum(LOCALES),
  subject: z.string(),
  preheader: z.string(),
  blocks: z.array(Block),
  segment_id: z.string().nullable(),
  list_id: z.string().nullable(),
  template_key: z.string().nullable(),
  style: z.enum(['branded', 'letter']),
  signature: z.string(),
  subject_b: z.string(),
  ab_percent: num,
  ab_metric: z.enum(['open', 'click']),
  ab_wait_hours: num,
  ab_winner: z.enum(['a', 'b']).nullable(),
  ab_decided_at: tsn,
  publish_web: z.boolean(),
  slug: z.string().nullable(),
  web_description: z.string(),
  utm_campaign: z.string(),
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled']),
  scheduled_at: tsn,
  started_at: tsn,
  finished_at: tsn,
  audience: num.nullable(),
  created_at: z.string(),
  // 0093: the pipeline — the stage it goes to, the stage it moves companies to, the person it is
  // sent as, and the mail it follows up
  stage_target: z.string().nullable().default(null),
  stage_on_send: z.string().nullable().default(null),
  sender_id: z.string().nullable().default(null),
  follows_id: z.string().nullable().default(null),
  follow_days: num.nullable().default(null),
  // 0111: who a follow-up goes to, and whether it sends itself as each recipient comes due
  follow_when: z.enum(['no_reply', 'no_click', 'no_open']).default('no_reply'),
  follow_auto: z.boolean().default(false),
})
export type Campaign = z.infer<typeof Campaign>

// ---------------------------------------------------------------- sequences (0111)
const SequenceStep = z.object({
  id: z.string(),
  number: num,
  name: z.string(),
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled']),
  step: num,
  subject: z.string(),
  follow_days: num.nullable(),
  follow_when: z.enum(['no_reply', 'no_click', 'no_open']),
  follow_auto: z.boolean(),
  scheduled_at: tsn,
  finished_at: tsn,
  stats: Stats,
  replied: num,
  waiting: num.nullable(),
})
export type SequenceStep = z.infer<typeof SequenceStep>
/** The chain a campaign belongs to, first mail first, each step's funnel and the answers it brought */
export const crmSequence = (id: string) => call('admin_crm_sequence', { p_id: id }, z.object({ steps: z.array(SequenceStep) }))
/** The day's sending: the cap, what has gone today, and whether automatic follow-ups are sending now */
export const crmSending = () => call('admin_crm_sending', {}, z.object({ daily_cap: num.nullable(), sent_today: num, business_hours: z.boolean() }))
export const crmCampaign = (id: string) =>
  call(
    'admin_crm_campaign',
    { p_id: id },
    z.object({
      campaign: Campaign,
      stats: Stats,
      variants: z.array(z.object({ variant: z.enum(['a', 'b']), sent: num, opened: num, clicked: num })),
      links: z.array(z.object({ url: z.string(), content: z.string(), unique_clicks: num, clicks: num })),
      timeline: z.array(z.object({ hour: num, opened: num, clicked: num })),
      benchmark: z.object({ campaigns: num, open_rate: num.nullable(), click_rate: num.nullable(), unsubscribe_rate: num.nullable() }),
      web: z.object({ sessions: num, views: num, signups: num, paid: num }),
      tests: num,
      list: z.object({ id: z.string(), name: z.string() }).nullable(),
    }),
  )

// ---------------------------------------------------------------- stages and senders (0093)
const Stage = z.object({
  key: StageKey,
  name: z.string(),
  sort: num,
  kind: z.enum(STAGE_KINDS),
  managed: z.boolean(),
  archived: z.boolean(),
  // 0112: what the buyer did to reach it, shown on the board
  exit_criterion: z.string().nullable().default(null),
  companies: num,
  campaigns: num,
})
export type Stage = z.infer<typeof Stage>

// ---------------------------------------------------------------- the inbox (0112)
const InboxRow = z.object({
  kind: z.enum(['trial', 'contact_form', 'demo']),
  company_id: z.string().nullable(),
  contact_id: z.string().nullable(),
  company: z.string().nullable(),
  person: z.string().nullable(),
  employees: num.nullable(),
  stage: z.string().nullable(),
  created_at: z.string(),
  answered_at: tsn,
})
export type InboxRow = z.infer<typeof InboxRow>
/** Inbound leads of the last days, each with when it came and when it was first answered */
export const crmInbox = (days: number) =>
  call(
    'admin_crm_inbox',
    { p_days: days },
    z.object({
      sla_minutes: num,
      awaiting: num,
      week: z.object({ leads: num, trials: num, answered: num, median_minutes: num.nullable(), within_sla: num }),
      rows: z.array(InboxRow),
    }),
  )
export const crmStages = () => call('admin_crm_stages', {}, z.object({ reply_stage: StageKey, rows: z.array(Stage) }))

const Sender = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  reply_to: z.string(),
  signature: z.string(),
  archived: z.boolean(),
  campaigns: num,
})
export type Sender = z.infer<typeof Sender>
export const crmSenders = () => call('admin_crm_senders', {}, z.object({ rows: z.array(Sender) }))

// ---------------------------------------------------------------- companies (0056)
const Company = z.object({
  id: z.string(),
  org_number: z.string().nullable(),
  name: z.string(),
  form_code: z.string().nullable(),
  nace_code: z.string().nullable(),
  nace_label: z.string().nullable(),
  employees: num.nullable(),
  municipality: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  source: z.string(),
  stage: StageKey,
  stage_changed_at: z.string(),
  owner_id: z.string().nullable(),
  owner_email: z.string().nullable(),
  next_step: z.string().nullable(),
  next_step_at: tsn,
  lost_reason: z.string().nullable(),
  tags: z.array(z.string()),
  org_id: z.string().nullable(),
  // the register's general manager (0110): absent from a database before it
  manager_name: z.string().nullable().optional(),
  manager_role: z.enum(['DAGL', 'INNH']).nullable().optional(),
  manager_seen_at: tsn.optional(),
  last_activity_at: tsn,
  created_at: z.string(),
  contacts: num,
  open_tasks: num,
})
export type Company = z.infer<typeof Company>

export const crmCompanies = (q: string | null, stage: string | null) =>
  call(
    'admin_crm_companies',
    { p_q: q, p_stage: stage, p_owner: null },
    z.object({ stages: z.record(z.string(), num), tasks_due: num, rows: z.array(Company) }),
  )

const Activity = z.object({
  id: z.string(),
  kind: z.enum(['note', 'call', 'meeting', 'email', 'reply', 'task', 'stage']),
  body: z.string(),
  due_at: tsn,
  done_at: tsn,
  admin_email: z.string().nullable(),
  created_at: z.string(),
  contact: z.string().nullable(),
})
export type Activity = z.infer<typeof Activity>

export const crmCompany = (id: string) =>
  call(
    'admin_crm_company',
    { p_id: id },
    z.object({
      company: Company,
      contacts: z.array(Contact),
      activities: z.array(Activity),
      mail: z.object({ sent: num, opened: num, clicked: num, last_at: tsn }),
      admins: z.array(z.object({ id: z.string(), email: z.string().nullable() })),
    }),
  )

export const crmTasks = () =>
  call(
    'admin_crm_tasks',
    {},
    z.object({
      rows: z.array(z.object({ id: z.string(), company_id: z.string(), company: z.string(), body: z.string(), due_at: tsn, admin_email: z.string().nullable() })),
    }),
  )

// ---------------------------------------------------------------- lists and templates (0056)
const List = z.object({
  id: z.string(),
  key: z.string(),
  name_no: z.string(),
  name_en: z.string(),
  description_no: z.string(),
  description_en: z.string(),
  public: z.boolean(),
  archived: z.boolean(),
  subscribed: num,
  pending: num,
  unsubscribed: num,
  joined_30d: num,
  left_30d: num,
  campaigns: num,
  open_rate: num.nullable(),
  click_rate: num.nullable(),
})
export type List = z.infer<typeof List>
export const crmLists = () => call('admin_crm_lists', {}, z.object({ rows: z.array(List) }))

const Template = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(CAMPAIGN_KINDS),
  style: z.enum(['branded', 'letter']),
  subject: z.string(),
  preheader: z.string(),
  blocks: z.array(Block),
  sort: num,
})
export type Template = z.infer<typeof Template>
export const crmTemplates = () => call('admin_crm_templates', {}, z.object({ rows: z.array(Template) }))

// ---------------------------------------------------------------- overview (0056)
export const crmOverview = () =>
  call(
    'admin_crm_overview',
    {},
    z.object({
      mail: z.object({
        campaigns: num,
        sent: num,
        open_rate: num.nullable(),
        click_rate: num.nullable(),
        ctor: num.nullable(),
        unsubscribe_rate: num.nullable(),
        bounce_rate: num.nullable(),
      }),
      subscribers: z.object({ total: num, joined_30d: num, left_30d: num }),
      pipeline: z.record(z.string(), num),
      won_90d: num,
      trials_90d: num,
      tasks_due: num,
      signups_from_email: num,
    }),
  )
