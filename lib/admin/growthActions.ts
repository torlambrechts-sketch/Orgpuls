'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'
import { EXPERIMENT_STATUSES, ITEM_SETTABLE } from './growthData'

/**
 * Sentral › Growth G2's writes (0142, D-183). The database decides who may (the Growth roles with a
 * second factor) and writes the audit row with what changed; these actions parse the form and name
 * the refusal. Nothing here sets «live»: a board item is live only when its live check holds.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()

async function rpc(fn: string, args: Record<string, unknown>): Promise<AdminResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  return { ok: true }
}

const Key = z.string().regex(/^[a-z0-9_]{1,30}$/)

/** A board item's status (building, planned, deferred) and owner (an admin, or nobody) */
export async function setGrowthItem(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ key: Key, status: z.enum(ITEM_SETTABLE), owner: z.union([z.literal(''), z.string().uuid()]) })
    .safeParse({ key: formData.get('key'), status: formData.get('status'), owner: formData.get('owner') ?? '' })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_growth_set_item', { p_key: parsed.data.key, p_status: parsed.data.status, p_owner: parsed.data.owner || null })
  if (r.ok) revalidatePath('/admin/growth')
  return r
}

/** An experiment's status: queued, running or done */
export async function setGrowthExperiment(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ key: z.string().regex(/^E[0-9]{1,2}$/), status: z.enum(EXPERIMENT_STATUSES) })
    .safeParse({ key: formData.get('key'), status: formData.get('status') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_growth_set_experiment', { p_key: parsed.data.key, p_status: parsed.data.status })
  if (r.ok) revalidatePath('/admin/growth/experiments')
  return r
}

/** «Decide»: an open decision's answer and who gave it */
export async function decideGrowth(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ n: z.coerce.number().int().min(1).max(99), value: z.string().trim().min(1).max(300), by: z.string().trim().min(1).max(120) })
    .safeParse({ n: formData.get('n'), value: formData.get('value'), by: formData.get('by') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_growth_decide', { p_n: parsed.data.n, p_value: parsed.data.value, p_by: parsed.data.by })
  if (r.ok) revalidatePath('/admin/growth/risks')
  return r
}
