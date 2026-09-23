import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * Reading the risk assessment.
 *
 * Like a measure and unlike a result, this is not anonymous data: it is a judgement a
 * named person made on a date, and § 3-1 bokstav c is the reason it is kept. So it is an
 * ordinary org-scoped read through RLS rather than an RPC — `risk_assessment_read`
 * admits any member, and there is nothing here to withhold per cell.
 *
 * Nothing in this file derives a band from an index. The prototype does exactly that
 * (bundle line 3294: `sanns: f.idx < 45 ? "Høy" : "Middels"`), and that is the reason
 * section 4 of the report went unprinted until the table existed — a probability
 * computed from a mean is not a risk assessment, however plausible it reads. Every value
 * here was written by somebody.
 *
 * Rows are parsed rather than cast, for the reason lib/rounds/read.ts gives: the type
 * generator does not emit the `app` schema, so a cast asserts a shape nothing checks.
 */
const PROBABILITY = ['lav', 'middels', 'hoy'] as const
const CONSEQUENCE = ['liten', 'moderat', 'alvorlig'] as const
const CONCLUSION = ['forsvarlig', 'krever_tiltak', 'uforsvarlig_uten_tiltak'] as const

export type RiskProbability = (typeof PROBABILITY)[number]
export type RiskConsequence = (typeof CONSEQUENCE)[number]
export type RiskConclusion = (typeof CONCLUSION)[number]

const AssessmentRow = z.object({
  id: z.string(),
  round_id: z.string(),
  assessed_on: z.string(),
  summary: z.string().nullable(),
  employees: z.object({ id: z.string(), full_name: z.string() }).nullable(),
  risk_factor_assessments: z.array(
    z.object({
      factor_key: z.string(),
      probability: z.enum(PROBABILITY),
      consequence: z.enum(CONSEQUENCE),
      assessment: z.string(),
      conclusion: z.enum(CONCLUSION),
      factors: z.object({ sort_order: z.coerce.number() }),
    }),
  ),
})

export interface RiskFactor {
  factorKey: string
  probability: RiskProbability
  consequence: RiskConsequence
  /** the reasoning, which is the half of the row that cannot be computed */
  assessment: string
  conclusion: RiskConclusion
}

export interface RiskAssessment {
  id: string
  roundId: string
  assessedOn: string
  /** the § 4-1 "samlet" half: what the factors amount to together */
  summary: string | null
  assessor: { id: string; name: string } | null
  /** in the instrument's order, not the order they were written in */
  factors: RiskFactor[]
}

/**
 * The standing assessment of one kartlegging, or null.
 *
 * Null is a real state, not a failure: a round that closed yesterday has not been
 * assessed yet, and the screens say so rather than filling the gap in.
 */
export async function getRiskAssessment(roundId: string): Promise<RiskAssessment | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('risk_assessments')
    .select(
      'id, round_id, assessed_on, summary, employees(id, full_name),' +
        ' risk_factor_assessments(factor_key, probability, consequence, assessment, conclusion,' +
        ' factors(sort_order))',
    )
    .eq('round_id', roundId)
    .maybeSingle()

  if (readFailed('getRiskAssessment', error, data)) return null
  const parsed = AssessmentRow.safeParse(data)
  if (parseFailed('getRiskAssessment', parsed)) return null
  const a = parsed.data

  return {
    id: a.id,
    roundId: a.round_id,
    assessedOn: a.assessed_on,
    summary: a.summary,
    assessor: a.employees ? { id: a.employees.id, name: a.employees.full_name } : null,
    factors: a.risk_factor_assessments
      .slice()
      .sort((x, y) => x.factors.sort_order - y.factors.sort_order)
      .map((f) => ({
        factorKey: f.factor_key,
        probability: f.probability,
        consequence: f.consequence,
        assessment: f.assessment,
        conclusion: f.conclusion,
      })),
  }
}

/**
 * "2 av 2 ferdig" — how much of the assessment the kartlegging asked for is done.
 *
 * The denominator is the factors the round found to be high risk, because those are the
 * ones § 3-1 obliges the employer to assess; the numerator is how many of them carry a
 * row. Both come from data, so the pair moves when a factor's band moves and nobody has
 * to remember to edit a caption. A factor assessed that was *not* high risk — the design
 * assesses one middels factor as well — counts towards neither, which is why the design
 * prints "2 av 2" over three printed assessments.
 */
export function assessedOfRequired(
  assessment: RiskAssessment | null,
  highRiskFactorKeys: string[],
): { done: number; required: number } {
  const assessed = new Set(assessment?.factors.map((f) => f.factorKey) ?? [])
  return {
    done: highRiskFactorKeys.filter((k) => assessed.has(k)).length,
    required: highRiskFactorKeys.length,
  }
}
