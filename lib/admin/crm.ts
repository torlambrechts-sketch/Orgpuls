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
export const BLOCK_TYPES = [
  // the designed blocks first (0113, X-092), then the plain ones
  'hero', 'heading', 'text', 'button', 'features', 'steps', 'stats', 'article', 'bullets', 'image', 'quote', 'event', 'cta', 'divider', 'ps',
] as const
export const TEMPLATE_CATEGORIES = ['newsletter', 'product', 'event', 'sales', 'customer'] as const
export const CAMPAIGN_KINDS = ['newsletter', 'campaign', 'promotion', 'announcement'] as const
/** 0137: a sequence step sends its mail, or makes a call or LinkedIn task for the company's owner */
export const STEP_KINDS = ['mail', 'call', 'linkedin'] as const
export const TASK_STEP_KINDS = ['call', 'linkedin'] as const

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
  step_kind: z.enum(STEP_KINDS).default('mail'),
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
  image: z.string().optional(),
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
  // 0137: a call or LinkedIn step makes tasks instead of sending
  step_kind: z.enum(STEP_KINDS).default('mail'),
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
  // 0137: a call or LinkedIn step's tasks, by state
  step_kind: z.enum(STEP_KINDS).default('mail'),
  tasks: z.object({ made: num, open: num, done: num, skipped: num }).nullable().default(null),
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
  // 0119: the deal's yearly value, and who to talk to
  value_nok: num.nullable().default(null),
  contact_name: z.string().nullable().default(null),
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
  category: z.enum(TEMPLATE_CATEGORIES),
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

// ---------------------------------------------------------------- deals (0119, X-095)
/** Whom a deal may be given to: the admins who work the CRM */
export const crmOwners = () => call('admin_crm_owners', {}, z.object({ rows: z.array(z.object({ id: z.string(), email: z.string() })) }))

// ---------------------------------------------------------------- CRM II (0120, X-095)
const Journey = z.object({
  id: z.string(),
  number: num,
  name: z.string(),
  status: z.enum(['active', 'draft', 'done', 'cancelled']),
  stage_target: z.string().nullable(),
  stage_on_send: z.string().nullable(),
  mails: num,
  tasks: num.default(0),
  reached: num,
  in_journey: num,
  completed: num,
  moved: num,
  replied: num,
  first_sent: tsn,
  created_at: z.string(),
})
export type Journey = z.infer<typeof Journey>
/** The follow-up chains read as journeys: each first campaign aimed at a stage, with its mails and what they did */
export const crmJourneys = () => call('admin_crm_journeys', {}, z.object({ rows: z.array(Journey) }))

export const TASK_VIEWS = ['open', 'done', 'all'] as const
const TaskRow = z.object({
  id: z.string(),
  company_id: z.string(),
  company: z.string(),
  contact: z.string().nullable(),
  body: z.string(),
  due_at: tsn,
  done_at: tsn,
  created_at: z.string(),
  admin_email: z.string().nullable(),
  // 0137: the call or LinkedIn step that made it, and whether it was skipped
  skipped: z.boolean().default(false),
  campaign_id: z.string().nullable().default(null),
  step_kind: z.enum(STEP_KINDS).nullable().default(null),
  journey: z.string().nullable().default(null),
  // 0143: a task a rule or a Brønnøysund trigger made — its rule, kind and key — and a callback's SLA
  origin: z.enum(['rule', 'trigger']).nullable().default(null),
  rule: z.string().regex(/^R[0-9]{1,2}$/).nullable().default(null),
  task_kind: z.enum(['call', 'email', 'letter']).nullable().default(null),
  sla_due_at: tsn.default(null),
  sla_left: num.nullable().default(null),
  sla_met: z.boolean().nullable().default(null),
  trigger: z.enum(['threshold_5', 'threshold_30', 'company_new', 'manager_changed']).nullable().default(null),
  manager: z.string().nullable().default(null),
  // where a trigger's letter or email goes (the business address, the generic address), and whether an
  // objection stopped it
  to: z.string().nullable().default(null),
  stopped: z.boolean().default(false),
})
export type TaskRow = z.infer<typeof TaskRow>
/** What a rule's or a trigger's task is (its body is `auto:<key>`, 0143), worded by the admin's messages */
export const AUTO_TASKS = ['callback_hand_raise', 'callback_lead_score', 'pql_trial', 'outreach_phone', 'outreach_letter', 'outreach_email'] as const
export type AutoTask = (typeof AUTO_TASKS)[number]
export const autoTask = (body: string): AutoTask | null => {
  const key = body.startsWith('auto:') ? body.slice(5) : ''
  return (AUTO_TASKS as readonly string[]).includes(key) ? (key as AutoTask) : null
}
/** Tasks open by due date, and those done in the last 90 days */
export const crmTaskList = (view: (typeof TASK_VIEWS)[number]) =>
  call(
    'admin_crm_task_list',
    { p_view: view },
    z.object({
      counts: z.object({ open: num, done: num, all: num, journeys: num.default(0), automated: num.default(0), sla_open: num.default(0) }),
      rows: z.array(TaskRow),
    }),
  )

// ---------------------------------------------------------------- the pipeline in figures (0137)
const Totals = z.object({ count: num, valued: num, value: num })
/**
 * Every company, summed in the database: per stage and over the open stages, the deals, how many
 * carry a value and the sum of those; won this quarter; and the deals closed since `since` (the
 * quarter, or when the stage history began if later), for the win rate.
 */
export const crmPipelineSummary = () =>
  call(
    'admin_crm_pipeline_summary',
    { p_from: null },
    z.object({
      stages: z.array(Totals.extend({ key: StageKey })),
      open: Totals,
      won_quarter: Totals,
      closed: z.object({ won: num, lost: num }),
      since: z.string(),
      history_since: z.string(),
      quarter: z.string(),
    }),
  )
export type PipelineSummary = Exclude<Awaited<ReturnType<typeof crmPipelineSummary>>, { error: string }>
