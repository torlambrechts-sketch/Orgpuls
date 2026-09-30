import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'

/**
 * The platform admin's reads (D-90), one per SECURITY DEFINER function in 0049. Each checks
 * the caller's admin role — with a second factor — and writes an audit row before it
 * returns anything; this file only calls them and parses what comes back. Nothing here
 * can reach a customer table directly: the anon-key client has no policy that would let it.
 */
export const ROLES = ['super_admin', 'support', 'finance', 'analyst', 'marketing', 'editor'] as const
export type AdminRole = (typeof ROLES)[number]

const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()

export async function call<T extends z.ZodTypeAny>(
  fn: string,
  args: Record<string, unknown>,
  schema: T,
): Promise<z.infer<T> | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (callFailed(fn, error)) return { error: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { error: 'failed' }
  if (!reply.data.ok) return { error: reply.data.error ?? 'failed' }
  const parsed = schema.safeParse(data)
  if (parseFailed(fn, parsed)) return { error: 'failed' }
  return parsed.data
}
export const isError = (x: unknown): x is { error: string } => typeof x === 'object' && x !== null && 'error' in x && !('ok' in x)

const ts = z.string()
const tsn = z.string().nullable()
const num = z.coerce.number()
const numn = z.coerce.number().nullable()

// ---------------------------------------------------------------- who
const Who = z.object({
  is_admin: z.boolean(),
  role: z.enum(ROLES).nullable(),
  mfa_enforced: z.boolean(),
  aal: z.string(),
  email: z.string().nullable(),
})
export type Who = z.infer<typeof Who>

/** Null when nobody is signed in. */
export async function whoami(): Promise<Who | null> {
  const supabase = await createClient()
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return null
  const { data, error } = await supabase.rpc('admin_whoami')
  if (callFailed('admin_whoami', error)) return null
  const parsed = Who.safeParse(data)
  if (parseFailed('admin_whoami', parsed)) return null
  return parsed.data
}

// ---------------------------------------------------------------- organisations
export const STATUSES = ['trial', 'grace', 'read_only', 'active'] as const
const OrgRow = z.object({
  id: z.string(),
  name: z.string(),
  org_number: z.string().nullable(),
  employee_count: num,
  created_at: ts,
  status: z.enum(STATUSES),
  plan: z.string().nullable(),
  trial_ends_at: ts,
  confirmed_at: tsn,
  mrr: numn,
  registered: num,
  users: num,
  last_sent: tsn,
  last_invited: num,
  last_answered: num,
  // 0118: the account owner, the daglig leder's name, the cancellation, the demo flag
  cancelled_at: tsn.default(null),
  cancel_effective_at: tsn.default(null),
  owner_id: z.string().nullable().default(null),
  owner_email: z.string().nullable().default(null),
  contact_name: z.string().nullable().default(null),
  demo: z.boolean().default(false),
})
export type OrgRow = z.infer<typeof OrgRow>

export const orgList = (search: string | null, status: string | null) =>
  call('admin_org_list', { p_search: search, p_status: status }, z.object({ rows: z.array(OrgRow) }))

const Round = z.object({
  id: z.string(),
  kind: z.string(),
  year: num,
  status: z.string(),
  opens_at: tsn,
  closes_at: tsn,
  invited: numn,
  answered: numn,
  groups_below_threshold: numn,
  reminders_sent: num,
  notices_sent: num,
  notices_failed: num,
  notices_pending: num,
})
const OrgDetail = z.object({
  org: z.object({
    id: z.string(),
    name: z.string(),
    org_number: z.string().nullable(),
    employee_count: num,
    threshold: num,
    created_at: ts,
    status: z.enum(STATUSES),
    registry_address: z.string().nullable(),
    registry_municipality: z.string().nullable(),
    registry_nace_code: z.string().nullable(),
    registry_nace_label: z.string().nullable(),
    registry_form_label: z.string().nullable(),
    registry_employees: numn,
    registry_fetched_at: tsn,
    mail_enabled: z.boolean().nullable(),
    sms_enabled: z.boolean().nullable(),
  }),
  billing: z
    .object({
      plan: z.string().nullable(),
      trial_started_at: ts,
      trial_ends_at: ts,
      trial_extended_at: tsn,
      invoice_email: z.string().nullable(),
      invoice_ref: z.string().nullable(),
      ehf: z.boolean(),
      confirmed_at: tsn,
      mrr: numn,
    })
    .nullable(),
  dpa: z.object({ version: z.string(), signed_at: ts, signer_name: z.string(), signer_title: z.string() }).nullable(),
  structure: z.object({ groups: num, employees: num, with_phone: num, locations: num }),
  users: z
    .array(
      z.object({
        user_id: z.string(),
        name: z.string().nullable(),
        email: z.string().nullable(),
        role: z.string(),
        active: z.boolean(),
        joined_at: ts,
        last_sign_in_at: tsn,
        mfa_factors: num,
      }),
    )
    .nullable(),
  rounds: z.array(Round).nullable(),
  measures: z.object({ total: num, open: num, closed: num, overdue: num }),
  timeline: z.array(z.object({ at: ts, event: z.string() })).nullable(),
  notes: z.array(z.object({ id: z.string(), body: z.string(), author_email: z.string().nullable(), created_at: ts })),
})
export type OrgDetail = z.infer<typeof OrgDetail>
export const orgDetail = (id: string) => call('admin_org_detail', { p_org: id }, OrgDetail)

const EmailRow = z.object({
  day: z.string(),
  kind: z.string(),
  channel: z.string().nullable(),
  audience: z.string(),
  total: num,
  sent: num,
  failed: num,
  pending: num,
  // after the provider accepted it (0053, D-97)
  delivered: num,
  soft: num,
  bounced: num,
  complaints: num,
})
export const emailLog = (org: string) =>
  call('admin_email_log', { p_org: org }, z.object({ rows: z.array(EmailRow), address_problems: num }))

/** What the provider last said about a message (0053), as record_mail_event stores it */
export const DELIVERY = ['delivered', 'soft_bounce', 'hard_bounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed', 'error'] as const
export type Delivery = (typeof DELIVERY)[number]

// each person a notice to a role reached, their address masked (0134, D-97)
const NoticeRecipient = z.object({
  id: num,
  kind: z.string(),
  audience: z.string().nullable(),
  masked: z.string(),
  sent_at: ts,
  delivery: z.enum(DELIVERY).nullable(),
  delivery_at: tsn,
  reason: z.string().nullable(),
})
export type NoticeRecipient = z.infer<typeof NoticeRecipient>
export const noticeRecipients = (org: string) =>
  call('admin_notice_recipients', { p_org: org }, z.object({ rows: z.array(NoticeRecipient) }))

const Deliverability = z.object({
  totals: z.object({
    events: num,
    delivered: num,
    soft: num,
    hard: num,
    blocked: num,
    spam: num,
    unsubscribed: num,
    unmatched: num,
  }),
  daily: z.array(z.object({ day: z.string(), delivered: num, bounced: num, complaints: num })),
  orgs: z.array(
    z.object({ org_id: z.string(), name: z.string(), delivered: num, bounced: num, complaints: num, address_problems: num }),
  ),
})
export type Deliverability = z.infer<typeof Deliverability>
export const deliverability = (days = 30) => call('admin_deliverability', { p_days: days }, Deliverability)

// ---------------------------------------------------------------- users
const UserRow = z.object({
  user_id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  created_at: ts,
  last_sign_in_at: tsn,
  mfa_factors: num,
  memberships: z.array(
    z.object({ org_id: z.string(), org_name: z.string(), role: z.string(), active: z.boolean(), joined_at: ts }),
  ),
  pending_invites: z.array(z.object({ org_name: z.string(), role: z.string(), created_at: ts, expires_at: tsn })),
})
export type UserRow = z.infer<typeof UserRow>
export const userSearch = (q: string) => call('admin_user_search', { p_q: q }, z.object({ rows: z.array(UserRow) }))

// ---------------------------------------------------------------- audit
const AuditRow = z.object({
  id: num,
  at: ts,
  admin_email: z.string().nullable(),
  admin_role: z.string().nullable(),
  action: z.string(),
  org_id: z.string().nullable(),
  org_name: z.string().nullable(),
  target_type: z.string().nullable(),
  target_id: z.string().nullable(),
  reason: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()).nullable(),
})
export type AuditRow = z.infer<typeof AuditRow>
export const auditList = (org: string | null, limit = 200) =>
  call('admin_audit_list', { p_org: org, p_limit: limit }, z.object({ rows: z.array(AuditRow) }))

// ---------------------------------------------------------------- operations
const Ops = z.object({
  runs: z.array(z.object({ ran_at: ts, opened: num, closed: num, queued: num, planned: num, note: z.string().nullable() })),
  queue: z.array(
    z.object({ kind: z.string(), channel: z.string().nullable(), sent: num, failed: num, due: num, scheduled: num }),
  ),
  failures: z.array(
    z.object({
      org_id: z.string(),
      org_name: z.string(),
      kind: z.string(),
      channel: z.string().nullable(),
      due_at: ts,
      attempts: num,
      failed_at: tsn,
      error: z.string(),
    }),
  ),
})
export type Ops = z.infer<typeof Ops>
export const ops = () => call('admin_ops', {}, Ops)

// ---------------------------------------------------------------- the business
const Kpis = z.object({
  orgs: num,
  paying: num,
  offers_requested: num,
  trials_active: num,
  trials_expiring_7d: num,
  trials_expired: num,
  mrr: num,
  arr: num,
  conversion: numn,
})
export type Kpis = z.infer<typeof Kpis>
export const kpis = () => call('admin_kpis', {}, Kpis)

const Cohort = z.object({
  cohort: z.string(),
  created: num,
  employees_uploaded: num,
  survey_scheduled: num,
  survey_sent: num,
  result_unlocked: num,
  results_viewed: num,
  measure_created: num,
  converted: num,
  median_hours_to_first_send: numn,
})
export type Cohort = z.infer<typeof Cohort>
export const funnel = (months = 12) => call('admin_funnel', { p_months: months }, z.object({ rows: z.array(Cohort) }))

// ---------------------------------------------------------------- admins
const AdminRow = z.object({
  user_id: z.string(),
  email: z.string().nullable(),
  role: z.enum(ROLES),
  active: z.boolean(),
  mfa_enforced: z.boolean(),
  created_at: ts,
  last_sign_in_at: tsn,
  mfa_factors: num,
})
export type AdminRow = z.infer<typeof AdminRow>
export const listAdmins = () => call('admin_list_admins', {}, z.object({ rows: z.array(AdminRow) }))

// ---------------------------------------------------------------- the public site (0050)
const Web = z.object({
  days: num,
  totals: z.object({ visitors: num, sessions: num, views: num, bounced: num, signups: num }),
  daily: z.array(z.object({ day: z.string(), visitors: num, sessions: num, views: num })),
  channels: z.array(z.object({ channel: z.string(), sessions: num, signups: num, activated: num, paid: num })),
  landing: z.array(z.object({ path: z.string(), sessions: num, bounced: num, signups: num })),
  pages: z.array(z.object({ path: z.string(), views: num })),
  campaigns: z.array(z.object({ campaign: z.string(), sessions: num, signups: num, paid: num })),
  funnel: z.object({ sessions: num, saw_offer: num, clicked: num, reached_signup: num, created: num }),
  // 0059 (D-104): what new organisations answered to "how did you hear of us"
  heard: z.array(z.object({ heard: z.string(), signups: num, activated: num, paid: num })),
  // 0054 (D-100): where visits came from, and the latest ones one by one
  countries: z.array(z.object({ country: z.string(), sessions: num, visitors: num })),
  cities: z.array(z.object({ country: z.string().nullable(), region: z.string().nullable(), city: z.string(), sessions: num })),
  recent: z.array(
    z.object({
      started_at: ts,
      channel: z.string(),
      referrer_host: z.string().nullable(),
      utm_source: z.string().nullable(),
      utm_medium: z.string().nullable(),
      utm_campaign: z.string().nullable(),
      landing: z.string().nullable(),
      views: num,
      clicked: z.boolean(),
      reached_signup: z.boolean(),
      country: z.string().nullable(),
      region: z.string().nullable(),
      city: z.string().nullable(),
      network: z.string().nullable(),
    }),
  ),
})
export type Web = z.infer<typeof Web>
export const web = (days: number) => call('admin_web', { p_days: days }, Web)

// 0121 (X-095): the Analytics pages — the period before, time on site, devices, per page, the funnel, goals
const Count = z.object({ n: numn, prev: numn })
const WebReport = z.object({
  days: num,
  from: z.string(),
  to: z.string(),
  avg_seconds: num,
  previous: z.object({ visitors: num }).nullable(),
  devices: z.array(z.object({ device: z.enum(['desktop', 'mobile', 'tablet']), visitors: num })),
  pages_total: num,
  views_total: num,
  pages: z.array(z.object({ path: z.string(), views: num, uniq: num, seconds: numn, exits: num, entries: num, signups: num })),
  funnel: z.object({ visitors: num, pricing: num, signup: num, trials: num, customers: num }),
  goals: z.object({ trials: Count, demos: Count, newsletter: Count, contact: Count }),
})
export type WebReport = z.infer<typeof WebReport>
export const webReport = (days: number) => call('admin_web_report', { p_days: days }, WebReport)

const Attribution = z.object({
  row: z
    .object({
      first_landing: z.string().nullable(),
      first_referrer: z.string().nullable(),
      first_source: z.string().nullable(),
      first_medium: z.string().nullable(),
      first_campaign: z.string().nullable(),
      last_source: z.string().nullable(),
      last_medium: z.string().nullable(),
      last_campaign: z.string().nullable(),
      channel: z.string(),
      heard: z.string().nullable(),
      recorded_at: ts,
    })
    .nullable(),
})
export type Attribution = z.infer<typeof Attribution>['row']
export const orgAttribution = (org: string) => call('admin_org_attribution', { p_org: org }, Attribution)

// ---------------------------------------------------------------- tickets (0051)
export const TICKET_QUEUES = ['support', 'billing', 'sales', 'personvern'] as const
export const TICKET_VIEWS = ['open', 'mine', 'unassigned', 'overdue', 'resolved', 'all'] as const
export const TICKET_TYPES = ['question', 'service_request', 'incident', 'problem'] as const
export const TICKET_STATUSES = ['new', 'open', 'waiting_customer', 'waiting_us', 'resolved', 'closed'] as const
export const TICKET_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const
export const TICKET_IMPACTS = ['one_user', 'one_org', 'many_orgs'] as const
export const TICKET_CATEGORIES = [
  'getting_started',
  'survey_delivery',
  'results_anonymity',
  'tiltak',
  'billing',
  'bug',
  'feature_request',
  'sales',
  'personvern',
] as const

const TicketRow = z.object({
  id: z.string(),
  number: num,
  subject: z.string(),
  type: z.enum(TICKET_TYPES),
  status: z.enum(TICKET_STATUSES),
  priority: z.enum(TICKET_PRIORITIES),
  queue: z.enum(TICKET_QUEUES),
  category: z.enum(TICKET_CATEGORIES),
  channel: z.string(),
  requester_name: z.string().nullable(),
  requester_email: z.string(),
  org_name: z.string().nullable(),
  org_id: z.string().nullable(),
  assignee_email: z.string().nullable(),
  created_at: ts,
  first_response_due: ts,
  resolve_due: ts,
  first_responded_at: tsn,
  legal_due: tsn,
  overdue: z.boolean(),
  last_message_at: tsn,
})
export type TicketRow = z.infer<typeof TicketRow>
export const tickets = (queue: string | null, view: string, search: string | null) =>
  call(
    'admin_tickets',
    { p_queue: queue, p_view: view, p_search: search },
    // 0135: the caller's unseen @mentions, for the tabs' badge
    z.object({ counts: z.record(z.string(), num), rows: z.array(TicketRow), mentions_unseen: num }),
  )

const Ticket = z.object({
  ticket: z.object({
    id: z.string(),
    number: num,
    subject: z.string(),
    type: z.enum(TICKET_TYPES),
    status: z.enum(TICKET_STATUSES),
    priority: z.enum(TICKET_PRIORITIES),
    queue: z.enum(TICKET_QUEUES),
    category: z.enum(TICKET_CATEGORIES),
    impact: z.enum(TICKET_IMPACTS),
    blocking: z.boolean(),
    channel: z.string(),
    org_id: z.string().nullable(),
    org_name: z.string().nullable(),
    user_id: z.string().nullable(),
    requester_name: z.string().nullable(),
    requester_email: z.string(),
    requester_org: z.string().nullable(),
    context: z.record(z.string(), z.unknown()),
    assignee_id: z.string().nullable(),
    assignee_email: z.string().nullable(),
    problem_id: z.string().nullable(),
    problem_number: numn,
    first_response_due: ts,
    resolve_due: ts,
    legal_due: tsn,
    first_responded_at: tsn,
    resolved_at: tsn,
    created_at: ts,
  }),
  messages: z.array(
    z.object({
      id: z.string(),
      author_kind: z.enum(['customer', 'admin', 'system']),
      author_email: z.string().nullable(),
      body: z.string(),
      internal: z.boolean(),
      created_at: ts,
      mail: z.string().nullable(),
      // 0135: the reply carries a rating link; the admins a note mentions
      csat: z.boolean(),
      mentions: z.array(z.string()),
    }),
  ),
  // 0135: the rating links this ticket's resolutions carried, and what came back
  csat: z.array(
    z.object({ id: z.string(), created_at: ts, expires_at: ts, rating: numn, comment: z.string().nullable(), rated_at: tsn }),
  ),
  events: z.array(
    z.object({ at: ts, kind: z.string(), actor_email: z.string().nullable(), detail: z.record(z.string(), z.unknown()) }),
  ),
  rounds: z.array(z.object({ id: z.string(), kind: z.string(), year: num, status: z.string(), linked: z.boolean() })),
  incidents: z.array(z.object({ id: z.string(), number: num, subject: z.string(), status: z.string() })),
  problems: z.array(z.object({ id: z.string(), number: num, subject: z.string() })),
  admins: z.array(z.object({ id: z.string(), email: z.string().nullable() })),
  canned: z.array(z.object({ id: z.string(), key: z.string(), title: z.string(), body: z.string() })),
  history: z.array(z.object({ id: z.string(), number: num, subject: z.string(), status: z.string(), created_at: ts })),
})
export type Ticket = z.infer<typeof Ticket>
export const ticket = (id: string) => call('admin_ticket', { p_id: id }, Ticket)

// what happened to each reply the ticket sent, after the provider accepted it (0134, D-97)
const TicketMailRow = z.object({ message_id: z.string(), delivery: z.enum(DELIVERY), delivery_at: ts, reason: z.string().nullable() })
export type TicketMailRow = z.infer<typeof TicketMailRow>
export const ticketMail = (id: string) => call('admin_ticket_mail', { p_id: id }, z.object({ rows: z.array(TicketMailRow) }))

// ---------------------------------------------------------------- tickets, Phase 2 (0135)
/** Admin › Tickets › Canned replies: every reply, archived ones last */
const Canned = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  body: z.string(),
  sort: num,
  active: z.boolean(),
})
export type CannedReply = z.infer<typeof Canned>
export const cannedReplies = () => call('admin_canned_replies', {}, z.object({ rows: z.array(Canned), mentions_unseen: num }))

/** The caller's @mentions in internal notes: unseen ones, and those seen in the last fortnight */
const Mention = z.object({
  id: z.string(),
  ticket_id: z.string(),
  number: num,
  subject: z.string(),
  status: z.enum(TICKET_STATUSES),
  created_at: ts,
  seen_at: tsn,
  by_email: z.string().nullable(),
  excerpt: z.string(),
})
export type Mention = z.infer<typeof Mention>
export const ticketMentions = (all = false) =>
  call('admin_ticket_mentions', { p_all: all }, z.object({ rows: z.array(Mention), mentions_unseen: num }))

/** The report's windows, in weeks, as admin_ticket_report accepts them */
export const REPORT_WEEKS = [4, 12, 26, 52] as const
const Deadline = z.object({ met: num, missed: num, pending: num, median_hours: numn })
const Report = z.object({
  weeks: num,
  since: ts,
  total: num,
  mentions_unseen: num,
  weekly: z.array(z.object({ week: z.string(), n: num })),
  by_queue: z.record(z.string(), num),
  by_type: z.record(z.string(), num),
  first_reply: Deadline,
  resolution: Deadline,
  csat: z.object({ rated: num, average: numn, dist: z.record(z.string(), num), sent: num }),
})
export type TicketReport = z.infer<typeof Report>
export const ticketReport = (weeks: number) => call('admin_ticket_report', { p_weeks: weeks }, Report)

export const orgTickets = (org: string) =>
  call(
    'admin_org_tickets',
    { p_org: org },
    z.object({
      rows: z.array(
        z.object({ id: z.string(), number: num, subject: z.string(), status: z.string(), priority: z.string(), created_at: ts }),
      ),
    }),
  )

// ---------------------------------------------------------------- account health and trial mail (0060, D-105)
const HealthRow = z.object({
  id: z.string(),
  name: z.string(),
  created_at: ts,
  access: z.enum(STATUSES),
  trial_ends_at: tsn,
  employees: numn,
  employees_uploaded: z.boolean(),
  scheduled: z.boolean(),
  sent: z.boolean(),
  unlocked: z.boolean(),
  measure: z.boolean(),
  last_sign_in: tsn,
  last_invited: num,
  last_answered: num,
  activation_points: num,
  recency_points: num,
  response_points: num,
  size_points: num,
  score: num,
  qualified: z.boolean(),
  // 0120: a demo sandbox is a trial by its access, never a lead
  demo: z.boolean().default(false),
})
export type HealthRow = z.infer<typeof HealthRow>
export const accountHealth = () => call('admin_account_health', {}, z.object({ rows: z.array(HealthRow) }))

export const LIFECYCLE_STEPS = ['welcome', 'setup_help', 'first_sent', 'results_ready', 'trial_ending', 'trial_ended', 'read_only_soon'] as const
const LifecycleRow = z.object({
  step: z.enum(LIFECYCLE_STEPS),
  status: z.enum(['pending', 'sending', 'sent', 'failed', 'skipped']),
  created_at: ts,
  sent_at: tsn,
  last_error: z.string().nullable(),
})
export type LifecycleRow = z.infer<typeof LifecycleRow>
export const orgLifecycle = (org: string) => call('admin_org_lifecycle', { p_org: org }, z.object({ rows: z.array(LifecycleRow) }))

// ---------------------------------------------------------------- search and content (0061, D-106)
const SeoRun = z.object({ at: ts, kind: z.string(), ok: z.boolean(), count: num, error: z.string().nullable() }).nullable()
const Seo = z.object({
  days: num,
  status: z.object({ gsc: SeoRun, gsc_last_ok: tsn, indexnow: SeoRun, rows: num, latest_day: z.string().nullable() }),
  pages: z.array(
    z.object({
      page: z.string(),
      entries: num,
      entries_prev: num,
      organic: num,
      signups: num,
      activated: num,
      paid: num,
      clicks: numn,
      impressions: numn,
      position: numn,
      clicks_prev: numn,
    }),
  ),
  decaying: z.array(z.object({ page: z.string(), entries: num, entries_prev: num, clicks: numn, clicks_prev: numn, lost: num })),
  queries: z.array(z.object({ query: z.string(), clicks: num, impressions: num, position: numn, pages: num, top_page: z.string() })),
  cannibal: z.array(z.object({ query: z.string(), impressions: num, pages: z.array(z.object({ page: z.string(), impressions: num, position: numn })) })),
  ai: z.array(z.object({ source: z.string(), sessions: num })),
  ai_signups: num,
})
export type Seo = z.infer<typeof Seo>
export const SEO_PERIODS = [28, 90] as const
export const seo = (days: number) => call('admin_seo', { p_days: days }, Seo)

// ---------------------------------------------------------------- trends and cost per customer (0062, D-107)
const Trends = z.object({
  daily: z.array(z.object({ day: z.string(), mrr: num, paying: num, trials: num, grace: num, read_only: num, signups: num, visitors: num, sessions: num })),
  weekly: z.array(z.object({ week: z.string(), signups: num, converted: num, visitors: num })),
})
export type Trends = z.infer<typeof Trends>
export const trends = (weeks = 26) => call('admin_trends', { p_weeks: weeks }, Trends)

export const SPEND_CHANNELS = ['paid', 'social', 'email', 'organic', 'referral', 'campaign', 'ai', 'direct', 'other'] as const
const Acquisition = z.object({
  rows: z.array(z.object({ month: z.string(), channel: z.string(), spend: numn, signups: num, paid: num })),
  entries: z.array(
    z.object({
      id: z.string(),
      month: z.string(),
      channel: z.string(),
      campaign: z.string().nullable(),
      amount_nok: num,
      note: z.string().nullable(),
      entered_at: ts,
      entered_by: z.string().nullable(),
    }),
  ),
})
export type Acquisition = z.infer<typeof Acquisition>
export const acquisition = (months = 12) => call('admin_acquisition', { p_months: months }, Acquisition)

// ---------------------------------------------------------------- cancellation and deletion (0064, D-108)
const Cancellation = z.object({
  row: z
    .object({
      cancelled_at: tsn,
      cancelled_by: z.string().nullable(),
      effective_at: tsn,
      deletion_due_at: tsn,
      org_number: z.string().nullable(),
      // 0066 (D-110): who cancelled, and the answer a customer gave
      source: z.enum(['admin', 'customer']).nullable().optional(),
      reason: z.string().nullable().optional(),
    })
    .nullable(),
})
export type Cancellation = z.infer<typeof Cancellation>['row']
export const orgCancellation = (org: string) => call('admin_org_cancellation', { p_org: org }, Cancellation)

// rows per table: what the run would delete, or did (0136)
const TableCounts = z.record(z.string(), z.coerce.number())
const Deletions = z.object({
  pending: z.array(
    z.object({
      org_id: z.string(),
      name: z.string(),
      org_number: z.string().nullable(),
      cancelled_at: ts,
      effective_at: ts,
      deletion_due_at: ts,
      due: z.boolean(),
      tables: TableCounts,
    }),
  ),
  done: z.array(
    z.object({
      org_number: z.string().nullable(),
      name: z.string(),
      cancelled_at: tsn,
      deletion_due_at: tsn,
      deleted_at: ts,
      run_by: z.enum(['schedule', 'admin']),
      admin: z.string().nullable(),
      counts: z.record(z.string(), z.coerce.number()),
      tables: TableCounts,
    }),
  ),
})
export type Deletions = z.infer<typeof Deletions>
export const deletions = () => call('admin_deletions', {}, Deletions)

// ---------------------------------------------------------------- industry modules (0067, 0068, D-117)
const Modules = z.object({
  ok: z.literal(true),
  modules: z.array(
    z.object({
      key: z.string(),
      version: z.string(),
      name: z.string(),
      status: z.enum(['draft', 'published', 'retired']),
      published_at: tsn,
      retired_at: tsn,
      content_hash: z.string(),
      // 0122 (X-096): what the version says, without its number; the file is live when it matches
      body_hash: z.string().nullable().default(null),
      // 0092: the status, and the last decision that set it
      validation_status: z.enum(['provisional', 'validated']).nullable().default(null),
      decision: z
        .object({ status: z.enum(['provisional', 'validated']), report_url: z.string().nullable(), reason: z.string(), at: ts })
        .nullable()
        .default(null),
      variants: z
        .array(
          z.object({
            key: z.string(),
            code: z.string(),
            version: z.string(),
            min_factors: num.nullable(),
            default_off: z.array(z.string()),
            factors: num,
            items: num,
            rounds: num,
          }),
        )
        .default([]),
      factors: num,
      items: num,
      rounds: num,
      pilots: z.array(z.object({ org_id: z.string().uuid(), name: z.string() })).default([]),
    }),
  ),
  adoption: z.array(z.object({ nace: z.string(), rounds: num, with_module: num })),
})
export type AdminModules = z.infer<typeof Modules>
export const modules = () => call('admin_modules', {}, Modules)

// ---------------------------------------------------------------- legal review (0082, D-130)
const LegalApprovals = z.object({
  approvals: z.array(z.object({ key: z.string(), hash: z.string(), at: ts, by: z.string().nullable(), auto: z.boolean().default(false) })),
})
export type LegalApproval = z.infer<typeof LegalApprovals>['approvals'][number]
/** Every current approval of a legal text, by the hash approved. Super-admin. */
export const legalApprovals = () => call('admin_legal_approvals', {}, LegalApprovals)

// 0122 (X-096): documents reviewed, each with the text as it was read
const LegalReviews = z.object({
  rows: z.array(z.object({ key: z.string(), hash: z.string(), text: z.string(), at: ts, by: z.string().nullable() })),
})
export type LegalReview = z.infer<typeof LegalReviews>['rows'][number]
export const legalReviews = () => call('admin_legal_reviews', {}, LegalReviews)

const LegalSources = z.object({
  templates: z.array(z.object({ key: z.string(), name: z.string(), subject: z.string(), preheader: z.string(), blocks: z.array(z.unknown()) })),
  lists: z.array(
    z.object({
      key: z.string(),
      name_no: z.string(),
      name_en: z.string(),
      description_no: z.string(),
      description_en: z.string(),
      public: z.boolean(),
      archived: z.boolean(),
    }),
  ),
})
/** The legal texts that live in the database: the CRM's templates and lists (0082). Super-admin, not audited. */
export const legalSources = () => call('admin_legal_sources', {}, LegalSources)

const Translations = z.object({
  /** what approving would approve: the unapproved rows the page shows (0082 app.translation_digest) */
  digest: z.string(),
  /** items any survey could ask with no approved translation: what the offered rule counts */
  missing: num,
  items: z.array(
    z.object({
      item: z.string(),
      text: z.string(),
      source: z.string(),
      approved: z.boolean(),
      at: tsn,
      // 0084, 0086: the workflow step, the version, the notes and the source it was made from
      status: z.string().default('draft'),
      version: num.default(1),
      notes: z.string().nullable().default(null),
      source_hash: z.string().nullable().default(null),
      approvable: z.boolean().default(false),
      // 0101: approved by the auto-approve switch rather than a person
      auto: z.boolean().default(false),
    }),
  ),
  ui: z.array(z.object({ hash: z.string(), at: ts })),
})
export type TranslationState = z.infer<typeof Translations>

const LocalePilots = z.object({
  pilots: z.array(z.object({ locale: z.string(), org_id: z.string().uuid(), name: z.string(), at: ts })),
})
export type LocalePilot = z.infer<typeof LocalePilots>['pilots'][number]

const Localized = z.record(z.string(), z.string().optional())
const TranslationSources = z.object({
  modules: z.array(
    z.object({
      key: z.string(),
      version: z.string(),
      name: z.string(),
      factors: z.array(z.object({ id: z.string().uuid(), name: z.string(), i18n: z.record(z.string(), z.object({ name: z.string().optional() }).passthrough().optional()).nullable() })),
      items: z.array(
        z.object({
          id: z.string().uuid(),
          code: z.string(),
          kind: z.enum(['likert5', 'count', 'segment']),
          factor: z.string().uuid().nullable(),
          text: Localized,
          options: z.array(Localized).nullable(),
        }),
      ),
    }),
  ),
})
/** Every published module's items and factors with their bokmål, for admin › Translations (0086). Super-admin. */
export const translationSources = () => call('admin_translation_sources', {}, TranslationSources)
/** The organisations offered a survey language before its flag is on for everyone (0085). Super-admin. */
export const localePilots = () => call('admin_locale_pilots', {}, LocalePilots)
/** A language's survey translations (0079) and the page-string hashes approved for it. Super-admin. */
export const translationState = (locale: string) => call('admin_translations', { p_locale: locale }, Translations)

const Overrides = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      text: z.string(),
      status: z.string(),
      source: z.string(),
      notes: z.string().nullable(),
      source_hash: z.string().nullable(),
      // the file text it replaced (0109): absent from a database before it
      file_hash: z.string().nullable().optional(),
      approved_at: tsn,
      auto: z.boolean(),
      by: z.string().nullable(),
      updated_at: ts,
    }),
  ),
})
export type OverrideRow = z.infer<typeof Overrides>['items'][number]
/** Every bokmål or English override, approved or waiting (0101). Super-admin. */
export const messageOverrideRows = (locale: 'no' | 'en') => call('admin_message_overrides', { p_locale: locale }, Overrides)

const AutoApprove = z.object({ on: z.boolean(), at: tsn, by: z.string().nullable() })
export type AutoApprove = z.infer<typeof AutoApprove>
/** The auto-approve switch (0101): whether it is on, since when, and who set it. */
export const autoApprove = () => call('admin_auto_approve', {}, AutoApprove)

// ---------------------------------------------------------------- needs attention (0116, X-095)
const Attention = z.object({
  trials: z.array(z.object({ org_id: z.string(), name: z.string(), ends_at: ts, employees: num })),
  deletions: z.array(z.object({ org_id: z.string(), name: z.string(), due_at: ts })),
  tickets: z.array(z.object({ id: z.string(), number: num, subject: z.string(), org_name: z.string().nullable(), due_at: ts })),
  failures: num,
  tasks: num,
})
export type Attention = z.infer<typeof Attention>
/** What an admin should do next, each item for the roles whose pages it leads to */
export const attention = () => call('admin_attention', {}, Attention)

// ---------------------------------------------------------------- the account owner (0118, X-095)
const OrgOwner = z.object({
  owner: z.object({ id: z.string(), email: z.string(), set_at: ts }).nullable(),
  can_set: z.boolean(),
  candidates: z.array(z.object({ id: z.string(), email: z.string(), role: z.enum(ROLES) })),
})
export type OrgOwner = z.infer<typeof OrgOwner>
export const orgOwner = (org: string) => call('admin_org_owner', { p_org: org }, OrgOwner)

// ---------------------------------------------------------------- Admin › Site settings (0126, D-170)
const SiteSettings = z.object({
  allow_indexing: z.boolean(),
  indexing_at: tsn,
  indexing_by: z.string().nullable(),
  auto_approve: z.boolean(),
  notice_on: z.boolean(),
  admins: num,
  admins_without_factor: num,
})
export type SiteSettings = z.infer<typeof SiteSettings>
export const siteSettings = () => call('admin_site_settings', {}, SiteSettings)

// ---------------------------------------------------------------- Growth › Event catalogue (0141, D-182)
export const EVENT_GROUPS = ['signup', 'setup', 'survey', 'value', 'trial', 'billing', 'support', 'consent', 'lead'] as const
export const PII_LEVELS = ['none', 'org', 'user'] as const
export const HEALTH_PARTS = ['survey_cycle', 'action_items', 'logins', 'response_rate', 'nps', 'p1_tickets'] as const
export const FIREWALL_RULES = [
  'no_link_to_respondents',
  'catalogue_has_no_respondent_props',
  'no_role_reads_answers',
  'no_employee_is_a_contact',
  'no_event_names_a_respondent',
  'nothing_attached_to_answers',
  'growth_tables_closed',
] as const
const FirewallEvidence = z.object({ names: z.array(z.string()).default([]) }).catchall(num)
const GrowthEvents = z.object({
  events: z.array(
    z.object({
      name: z.string(),
      version: num,
      group: z.enum(EVENT_GROUPS),
      pii: z.enum(PII_LEVELS),
      props: z.array(z.string()),
      description: z.string(),
      /** what emits it: the product table or the tick */
      source: z.string(),
      n7: num,
    }),
  ),
  /** each health component with its maximum; `no_source` where nothing in the schema can score it (NPS) */
  parts: z.array(z.object({ key: z.enum(HEALTH_PARTS), max: num, no_source: z.boolean() })),
  /** the highest score any customer can reach while a component has no source */
  reachable: num,
  health: z.array(z.object({ org_id: z.string(), name: z.string(), total: num, missing: z.array(z.enum(HEALTH_PARTS)) })),
  /** each rule's evidence is structured — counts, and database object names as data — and worded by the page */
  firewall: z.array(z.object({ rule: z.enum(FIREWALL_RULES), pass: z.boolean(), evidence: FirewallEvidence })),
})
export type GrowthEvents = z.infer<typeof GrowthEvents>
/** The event catalogue with 7-day counts, health score v1 lowest first, and the anonymity firewall's rules as they stand */
export const growthEvents = () => call('admin_growth_events', {}, GrowthEvents)
