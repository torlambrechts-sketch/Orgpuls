import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { onlyOrganisation } from '@/lib/org/current'
import { formatOrgNumber, getViewerRole } from '@/lib/org/read'
import { getCompany, getGroupStats, getRoster, type DutyRole } from '@/lib/settings/read'
import { getExtraQuestions, getFactors } from '@/lib/instrument/read'
import { getWheel, type WheelCadence } from '@/lib/wheel/read'
import { callFailed, parseFailed, readFailed } from '@/lib/supabase/read'
import { offeredDays } from '@/lib/wizard/days'

/**
 * The Veiviser's reads (P7, D-76).
 *
 * Every value the wizard prints is read here from the rows the steps write to: the
 * organisation and its register facts, the people and their groups, the threshold, law
 * mode, the wheel and its notice ladder, and whether a first round exists. Nothing is
 * kept for the wizard alone except `app.setup_progress`, which says where to resume and
 * nothing about the organisation itself.
 */

export const WIZARD_STEPS = [
  'velkommen',
  'virksomheten',
  'ansatte',
  'grupper',
  'verneombud',
  'maling',
  'rytme',
  'utsending',
  'klart',
] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

const ProgressRow = z.object({
  step: z.coerce.number().int().min(0).max(8),
  completed_at: z.string().nullable(),
  skipped_at: z.string().nullable(),
})

const OrgRow = z.object({
  id: z.string(),
  timezone: z.string().nullable(),
  mail_enabled: z.boolean(),
  sms_enabled: z.boolean(),
})

export interface WizardGate {
  /** a daglig leder: the only role every step's write admits */
  canRun: boolean
  /** first run: no round at all, and the wizard neither finished nor put aside */
  autoOpen: boolean
}

/**
 * Read on every page, so it is two small reads: the progress row and whether any round
 * exists. Anyone but a daglig leder gets `canRun: false` without either.
 */
export const getWizardGate = cache(async (): Promise<WizardGate> => {
  const role = await getViewerRole()
  if (role !== 'daglig_leder') return { canRun: false, autoOpen: false }

  const supabase = await createClient()
  const app = supabase.schema('app')
  const [progress, rounds] = await Promise.all([
    app.from('setup_progress').select('step, completed_at, skipped_at').limit(2),
    app.from('rounds').select('id', { count: 'exact', head: true }),
  ])
  if (readFailed('getWizardGate', progress.error, progress.data) || callFailed('getWizardGate.rounds', rounds.error)) {
    return { canRun: true, autoOpen: false }
  }
  const parsed = z.array(ProgressRow).safeParse(progress.data)
  if (parseFailed('getWizardGate', parsed)) return { canRun: true, autoOpen: false }
  const row = onlyOrganisation('getWizardGate', parsed.data)
  const done = !!row && (row.completed_at !== null || row.skipped_at !== null)
  return { canRun: true, autoOpen: !done && (rounds.count ?? 0) === 0 }
})

export interface WizardModel {
  /** where to open: the step saved, or the start once it was finished */
  step: number
  org: {
    name: string
    orgNumber: string | null
    fetched: boolean
    address: string | null
    industry: string | null
    registryEmployees: number | null
    employeeCount: number
  }
  /** active people in the register */
  people: number
  employees: { id: string; name: string; dutyRole: DutyRole | null }[]
  groups: { id: string; name: string; headcount: number }[]
  threshold: number
  lawMode: boolean
  factorKeys: string[]
  /** statements over every factor plus the questions outside the index: a grunnlinje */
  questions: number
  wheel: {
    cadence: WheelCadence
    baselineMonth: number
    skipFellesferie: boolean
    /** the verneombud's own lead, or null with no ladder written yet */
    voLead: number | null
    leaderLead: number | null
  } | null
  send: {
    measured: boolean
    /** the grunnlinje already planned, as an ISO instant */
    planned: string | null
    /** three Tuesdays at least a week out, as YYYY-MM-DD in the organisation's zone */
    days: string[]
    sms: boolean
  }
  timezone: string
}

const PlannedRow = z.object({
  status: z.enum(['planlagt', 'apen', 'lukket']),
  opens_at: z.string().nullable(),
  measurements: z.object({ kind: z.string() }),
})

export async function getWizard(): Promise<WizardModel | null> {
  const supabase = await createClient()
  const app = supabase.schema('app')

  const [company, orgRes, progress, roster, groups, factors, extras, wheel, rounds] = await Promise.all([
    getCompany(),
    app.from('organizations').select('id, timezone, mail_enabled, sms_enabled').limit(2),
    app.from('setup_progress').select('step, completed_at, skipped_at').limit(2),
    getRoster(),
    getGroupStats(null),
    getFactors(),
    getExtraQuestions(),
    getWheel(),
    app.from('rounds').select('status, opens_at, measurements!inner(kind)').order('opens_at'),
  ])
  if (!company) return null
  if (readFailed('getWizard.org', orgRes.error, orgRes.data)) return null
  const orgs = z.array(OrgRow).safeParse(orgRes.data)
  if (parseFailed('getWizard.org', orgs)) return null
  const org = onlyOrganisation('getWizard.org', orgs.data)
  if (!org) return null

  const prog = z.array(ProgressRow).safeParse(progress.data ?? [])
  const row = prog.success ? onlyOrganisation('getWizard.progress', prog.data) : null
  const step = row && row.completed_at === null ? row.step : 0

  if (readFailed('getWizard.rounds', rounds.error, rounds.data)) return null
  const rs = z.array(PlannedRow).safeParse(rounds.data)
  if (parseFailed('getWizard.rounds', rs)) return null

  const tz = org.timezone ?? 'Europe/Oslo'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const active = roster.filter((p) => p.active)
  const lead = (a: string) => wheel?.ladder.find((n) => n.audience === a)?.leadDays ?? null

  return {
    step,
    org: {
      name: company.name,
      orgNumber: formatOrgNumber(company.org_number),
      fetched: company.registry_fetched_at !== null,
      address: company.registry_address,
      industry: company.registry_nace_code ? `${company.registry_nace_code} ${company.registry_nace_label ?? ''}`.trim() : null,
      registryEmployees: company.registry_employees,
      employeeCount: company.employee_count,
    },
    people: active.length,
    employees: active.map((p) => ({ id: p.id, name: p.name, dutyRole: p.dutyRole })),
    groups: groups.map((g) => ({ id: g.id, name: g.name, headcount: g.headcount })),
    threshold: company.threshold,
    lawMode: company.law_mode,
    factorKeys: factors.map((f) => f.key),
    questions: factors.reduce((n, f) => n + f.ordinals.length, 0) + extras.length,
    wheel: wheel
      ? {
          cadence: wheel.cadence,
          baselineMonth: wheel.baselineMonth,
          skipFellesferie: wheel.skipFellesferie,
          voLead: lead('verneombud'),
          leaderLead: lead('daglig_leder'),
        }
      : null,
    send: {
      measured: rs.data.some((r) => r.status !== 'planlagt'),
      planned: rs.data.find((r) => r.status === 'planlagt' && r.measurements.kind === 'grunnlinje')?.opens_at ?? null,
      days: offeredDays(today),
      sms: org.sms_enabled,
    },
    timezone: tz,
  }
}
