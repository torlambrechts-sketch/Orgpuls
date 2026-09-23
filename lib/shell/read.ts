import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed, readFailed } from '@/lib/supabase/read'
import { onlyOrganisation } from '@/lib/org/current'

/**
 * What the header's "Kom i gang" panel ticks off, read from the rows that make each step
 * true rather than from a flag somebody set.
 *
 * The design's checklist (bundle 3140-3150) is four steps with the prototype's own
 * shortcuts behind them — "grupper" and "måling" hard-coded done, the register done at ten
 * people. Each is replaced by the fact the step is about:
 *
 *   register  every employee the organisation says it has is in the register — the same
 *             rule as Oppsett's "Registeret er komplett" — and there is at least one
 *   grupper   there is a group, and no active employee is outside one
 *   arshjul   the year wheel is switched on
 *   maling    a round has gone out: open now, or closed
 *
 * `null` when the answer is not knowable — no organisation, more than one, or a read that
 * failed. The panel then prints no checklist rather than four unticked steps, which would
 * be a claim about the organisation that nothing here established.
 *
 * Memoised per request: the header renders on every screen, so these are the reads every
 * page view pays for. They are counts, not rows.
 */
export interface SetupProgress {
  register: boolean
  grupper: boolean
  arshjul: boolean
  maling: boolean
}

export interface ShellContext {
  lawMode: boolean
  progress: SetupProgress | null
}

const OrgRow = z.object({
  id: z.string(),
  employee_count: z.coerce.number(),
  law_mode: z.boolean(),
})

export const getShellContext = cache(async (): Promise<ShellContext> => {
  const supabase = await createClient()
  const app = supabase.schema('app')

  const { data, error } = await app
    .from('organizations')
    .select('id, employee_count, law_mode')
    .limit(2)
  if (readFailed('getShellContext', error, data)) return { lawMode: true, progress: null }
  const parsed = z.array(OrgRow).safeParse(data)
  if (parseFailed('getShellContext', parsed)) return { lawMode: true, progress: null }
  const org = onlyOrganisation('getShellContext', parsed.data)
  if (!org) return { lawMode: true, progress: null }

  const count = { count: 'exact', head: true } as const
  const [employees, ungrouped, groups, wheel, rounds] = await Promise.all([
    app.from('employees').select('id', count).eq('org_id', org.id).eq('active', true),
    app.from('employees').select('id', count).eq('org_id', org.id).eq('active', true).is('group_id', null),
    app.from('groups').select('id', count).eq('org_id', org.id),
    app.from('year_wheels').select('active').eq('org_id', org.id).maybeSingle(),
    app.from('rounds').select('id', count).eq('org_id', org.id).in('status', ['apen', 'lukket']),
  ])

  if (
    callFailed('getShellContext.employees', employees.error) ||
    callFailed('getShellContext.ungrouped', ungrouped.error) ||
    callFailed('getShellContext.groups', groups.error) ||
    callFailed('getShellContext.wheel', wheel.error) ||
    callFailed('getShellContext.rounds', rounds.error)
  ) {
    return { lawMode: org.law_mode, progress: null }
  }

  const registered = employees.count ?? 0
  const wheelActive = z.object({ active: z.boolean() }).nullable().safeParse(wheel.data)

  return {
    lawMode: org.law_mode,
    progress: {
      register: registered > 0 && registered >= org.employee_count,
      grupper: (groups.count ?? 0) > 0 && (ungrouped.count ?? 0) === 0,
      arshjul: wheelActive.success && wheelActive.data?.active === true,
      maling: (rounds.count ?? 0) > 0,
    },
  }
})
