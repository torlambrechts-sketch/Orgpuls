import { z } from 'zod'

/**
 * Sentral › Growth G2 (0142, D-183): the shapes public.admin_growth_view() and admin_growth_export()
 * return, parsed, never cast. The report's registry is data: each status here is a key the database
 * holds, worded by the messages (`admin.growth.g2`) and coloured by lib/admin/dots.ts.
 *
 * Kept free of `server-only` so the unit tests parse real payloads with the same schemas the pages use.
 */
export const GROWTH_READS = ['board', 'plan', 'funnel', 'rules', 'experiments', 'risks', 'coverage'] as const
export type GrowthRead = (typeof GROWTH_READS)[number]

/** A board item's status as shown: «live» is derived from its live check, the others are the team's */
export const ITEM_STATUSES = ['live', 'building', 'planned', 'deferred'] as const
/** What an admin may set: «live» is never set, only derived */
export const ITEM_SETTABLE = ['building', 'planned', 'deferred'] as const
/** «gates_open»: the block's weeks are past and a gate is unmet or not measured, so it is not «done» */
export const PLAN_STATUSES = ['done', 'gates_open', 'in_progress', 'next', 'planned'] as const
/** A gate read live (app.growth_gate_state); «unmeasured» where nothing in the schema records it yet */
export const GATE_STATES = ['met', 'unmet', 'unmeasured'] as const
export const EXPERIMENT_STATUSES = ['queued', 'running', 'done'] as const
export const STREAMS = ['service', 'marketing', 'internal', 'system', 'service_internal'] as const
export const IMPL_KINDS = ['none', 'function', 'trigger', 'cron', 'lifecycle'] as const
export const LIKELIHOODS = ['high', 'medium', 'low_medium', 'low', 'low_severe'] as const
export const COVERAGE_STATUSES = ['built', 'partial', 'missing', 'skipped'] as const
export const PRIORITIES = ['now', 'next', 'later'] as const
export const EXPORT_KINDS = ['board', 'plan', 'review'] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]

const num = z.coerce.number()
const numn = z.coerce.number().nullable()
/** an admin route, as the registry's CHECK allows it */
const Href = z
  .string()
  .regex(/^\/admin(\/[a-z0-9_-]+)*$/)
  .nullable()
const Person = z.object({ id: z.string().uuid(), email: z.string().nullable() })

export const BoardItem = z.object({
  key: z.string(),
  tier: z.string(),
  rank: z.string(),
  name: z.string(),
  why: z.string(),
  build: z.string(),
  kpi: z.string(),
  guardrail: z.string(),
  effort: z.string(),
  impact: z.string(),
  score: z.string().nullable(),
  status: z.enum(ITEM_STATUSES),
  /** what the team set; shown when it differs from the derived status */
  stored: z.enum(ITEM_SETTABLE),
  live_check: z.string().nullable(),
  href: Href,
  owner: Person.nullable(),
})
export type BoardItem = z.infer<typeof BoardItem>

export const PlanState = z.object({
  start: z.string().nullable(),
  /** the current week, 1-based; null before the plan has a start date */
  week: numn,
  weeks: num,
  gate: z.string().nullable(),
})
export type PlanState = z.infer<typeof PlanState>

export const GrowthBoard = z.object({
  tiers: z.array(z.object({ key: z.string(), name: z.string(), why: z.string() })),
  items: z.array(BoardItem),
  admins: z.array(Person),
  plan: PlanState,
})
export type GrowthBoard = z.infer<typeof GrowthBoard>

export const PlanBlock = z.object({
  key: z.string(),
  from: num,
  to: num,
  foundation: z.string(),
  lead: z.string(),
  status: z.enum(PLAN_STATUSES),
  gates: z.array(z.object({ gate: z.string(), state: z.enum(GATE_STATES) })),
})
export const GrowthPlan = z.object({ plan: PlanState, blocks: z.array(PlanBlock) })
export type GrowthPlan = z.infer<typeof GrowthPlan>

export const GrowthFunnel = z.object({
  month: z.string(),
  /** the month's trials (organisations created, never a demo): the lead math's «now» */
  trials: num,
  /** n is null where nothing in the schema counts the stage */
  stages: z.array(z.object({ key: z.string(), stage: z.string(), event: z.string(), definition: z.string(), n: numn })),
  /** now is null where the attribution cannot name the source */
  lead: z.array(z.object({ key: z.string(), source: z.string(), base: num, stretch: num, needs: z.string(), now: numn })),
  assumptions: z.array(z.string()),
  benchmarks: z.array(z.object({ metric: z.string(), value: z.string(), source: z.string() })),
})
export type GrowthFunnel = z.infer<typeof GrowthFunnel>

export const Rule = z.object({
  key: z.string(),
  name: z.string(),
  trigger: z.string(),
  condition: z.string(),
  action: z.string(),
  stream: z.enum(STREAMS),
  impl_kind: z.enum(IMPL_KINDS),
  impl_ref: z.string().nullable(),
  live: z.boolean(),
})
export type Rule = z.infer<typeof Rule>
export const GrowthRules = z.object({ rules: z.array(Rule) })

export const Experiment = z.object({
  key: z.string(),
  hypothesis: z.string(),
  metric: z.string(),
  impact: num,
  confidence: num,
  ease: num,
  status: z.enum(EXPERIMENT_STATUSES),
})
export type Experiment = z.infer<typeof Experiment>
export const GrowthExperiments = z.object({ experiments: z.array(Experiment) })

export const Decision = z.object({
  n: num,
  question: z.string(),
  default: z.string(),
  decided: z.string().nullable(),
  by: z.string().nullable(),
  at: z.string().nullable(),
})
export type Decision = z.infer<typeof Decision>
export const GrowthRisks = z.object({
  guardrails: z.array(z.object({ title: z.string(), body: z.string() })),
  risks: z.array(z.object({ risk: z.string(), likelihood: z.enum(LIKELIHOODS), mitigation: z.string() })),
  decisions: z.array(Decision),
})
export type GrowthRisks = z.infer<typeof GrowthRisks>

export const CoverageRow = z.object({ feature: z.string(), status: z.enum(COVERAGE_STATUSES), note: z.string(), href: Href })
export type CoverageRow = z.infer<typeof CoverageRow>
export const GrowthCoverage = z.object({
  coverage: z.array(CoverageRow),
  recommendations: z.array(z.object({ n: num, priority: z.enum(PRIORITIES), title: z.string(), body: z.string() })),
  cuts: z.array(z.string()),
})
export type GrowthCoverage = z.infer<typeof GrowthCoverage>

export const EXPORT_SCHEMA = {
  board: z.object({ rows: z.array(BoardItem.extend({ tier_name: z.string() })) }),
  plan: z.object({ rows: z.array(PlanBlock.omit({ key: true })) }),
  review: GrowthCoverage,
} as const satisfies Record<ExportKind, z.ZodTypeAny>
