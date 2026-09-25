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
export const ROLES = ['super_admin', 'support', 'finance', 'analyst'] as const
export type AdminRole = (typeof ROLES)[number]

const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()

async function call<T extends z.ZodTypeAny>(
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
})
export const emailLog = (org: string) => call('admin_email_log', { p_org: org }, z.object({ rows: z.array(EmailRow) }))

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
})
export type Web = z.infer<typeof Web>
export const WEB_PERIODS = [7, 30, 90, 365] as const
export const web = (days: number) => call('admin_web', { p_days: days }, Web)

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
    z.object({ counts: z.record(z.string(), num), rows: z.array(TicketRow) }),
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
    }),
  ),
  events: z.array(
    z.object({ at: ts, kind: z.string(), actor_email: z.string().nullable(), detail: z.record(z.string(), z.unknown()) }),
  ),
  rounds: z.array(z.object({ id: z.string(), kind: z.string(), year: num, status: z.string(), linked: z.boolean() })),
  incidents: z.array(z.object({ id: z.string(), number: num, subject: z.string(), status: z.string() })),
  problems: z.array(z.object({ id: z.string(), number: num, subject: z.string() })),
  admins: z.array(z.object({ id: z.string(), email: z.string().nullable() })),
  canned: z.array(z.object({ key: z.string(), title: z.string(), body: z.string() })),
  history: z.array(z.object({ id: z.string(), number: num, subject: z.string(), status: z.string(), created_at: ts })),
})
export type Ticket = z.infer<typeof Ticket>
export const ticket = (id: string) => call('admin_ticket', { p_id: id }, Ticket)

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
