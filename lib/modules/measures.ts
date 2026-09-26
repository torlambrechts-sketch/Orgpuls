import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'
import type { MeasureStep } from '@/lib/measures/read'
import { getModulesById } from './read'

/**
 * Measures on a module factor (0071, D-115). The same rows and lifecycle as every measure;
 * read here because they name a module factor and its re-measure statement rather than a
 * core factor, and every core reader skips them.
 */
const Row = z.object({
  id: z.string().uuid(),
  title: z.string(),
  goal: z.string().nullable(),
  due_date: z.string().nullable(),
  step: z.enum(['foreslatt', 'besluttet', 'pagar', 'gjennomfort', 'effekt_malt', 'lukket']),
  owner_employee_id: z.string().uuid().nullable(),
  module_factor_id: z.string().uuid(),
  remeasure_item_id: z.string().uuid(),
  created_at: z.string(),
})
const FactorRow = z.object({ id: z.string().uuid(), module_id: z.string().uuid() })

export type ModuleMeasure = {
  id: string
  title: string
  goal: string | null
  dueDate: string | null
  step: MeasureStep
  ownerId: string | null
  moduleName: string
  moduleVersion: string
  factorKey: string
  factorName: string
  legalBasis: string[]
  statement: { code: string; text: string }
}

export const getModuleMeasures = cache(async (): Promise<ModuleMeasure[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('measures')
    .select('id, title, goal, due_date, step, owner_employee_id, module_factor_id, remeasure_item_id, created_at')
    .not('module_factor_id', 'is', null)
    .order('created_at', { ascending: true })
  if (readFailed('getModuleMeasures', error, data)) return []
  const parsed = z.array(Row).safeParse(data)
  if (parseFailed('getModuleMeasures', parsed) || !parsed.data.length) return []

  const factorIds = [...new Set(parsed.data.map((r) => r.module_factor_id))]
  const { data: fdata, error: ferror } = await supabase
    .schema('app')
    .from('module_factors')
    .select('id, module_id')
    .in('id', factorIds)
  if (readFailed('getModuleMeasures.factors', ferror, fdata)) return []
  const factors = z.array(FactorRow).safeParse(fdata)
  if (parseFailed('getModuleMeasures.factors', factors)) return []
  const modules = await getModulesById([...new Set(factors.data.map((f) => f.module_id))])

  return parsed.data.flatMap((r) => {
    const mod = modules.find((m) => m.factors.some((f) => f.id === r.module_factor_id))
    const factor = mod?.factors.find((f) => f.id === r.module_factor_id)
    const item = factor?.items.find((i) => i.id === r.remeasure_item_id)
    if (!mod || !factor || !item) return []
    return [
      {
        id: r.id,
        title: r.title,
        goal: r.goal,
        dueDate: r.due_date,
        step: r.step,
        ownerId: r.owner_employee_id,
        moduleName: mod.name,
        moduleVersion: mod.version,
        factorKey: factor.key,
        factorName: factor.name,
        legalBasis: factor.legalBasis,
        statement: { code: item.code, text: item.text },
      },
    ]
  })
})
