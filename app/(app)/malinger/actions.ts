'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrgId } from '@/lib/org/current'
import { callFailed } from '@/lib/supabase/read'
import { createClient } from '@/lib/supabase/server'

/**
 * "Start neste puls nå" (0038). The guards are the function's: only a daglig leder, never
 * while a round is open, never within 14 days of the last one closing. This side passes
 * the organisation and reads the answer; it re-checks nothing, so it cannot disagree with
 * the database about who may.
 */
const Result = z.union([
  z.object({ ok: z.literal(true), round_id: z.string().uuid() }),
  z.object({
    error: z.enum(['not_available', 'round_open', 'too_soon', 'no_factors', 'read_only']),
    available_from: z.string().optional(),
  }),
])

export type StartResult =
  | { ok: true }
  | { ok: false; problem: 'not_available' | 'round_open' | 'too_soon' | 'no_factors' | 'read_only'; from?: string }

export async function startNextPulse(): Promise<StartResult> {
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_available' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('start_next_pulse', { p_org: org })
  if (callFailed('startNextPulse', error)) return { ok: false, problem: 'not_available' }

  const parsed = Result.safeParse(data)
  if (!parsed.success) return { ok: false, problem: 'not_available' }
  if ('error' in parsed.data) return { ok: false, problem: parsed.data.error, from: parsed.data.available_from }

  revalidatePath('/malinger')
  revalidatePath('/innsikt')
  revalidatePath('/resultater')
  return { ok: true }
}

/**
 * Turning an industry question set on or off for the organisation (0074, D-124). The
 * function checks the role and that the module may be used, records the choice and applies
 * it to the planned grunnlinjer; this side passes the organisation and reads the answer.
 */
const ModuleResult = z.union([
  z.object({ ok: z.literal(true), enabled: z.boolean(), planned_rounds: z.coerce.number() }),
  z.object({ error: z.enum(['not_allowed', 'not_available']) }),
])
const ModuleKey = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

export type ModuleChoiceResult = { ok: true; enabled: boolean } | { ok: false; problem: 'not_allowed' | 'not_available' }

export async function setOrgModule(key: string, enabled: boolean): Promise<ModuleChoiceResult> {
  const org = await getCurrentOrgId()
  const k = ModuleKey.safeParse(key)
  if (!org || !k.success || typeof enabled !== 'boolean') return { ok: false, problem: 'not_available' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_org_module', { p_org: org, p_key: k.data, p_enabled: enabled })
  if (callFailed('setOrgModule', error)) return { ok: false, problem: 'not_available' }
  const parsed = ModuleResult.safeParse(data)
  if (!parsed.success) return { ok: false, problem: 'not_available' }
  if ('error' in parsed.data) return { ok: false, problem: parsed.data.error }

  revalidatePath('/malinger')
  revalidatePath('/maleoppsett')
  return { ok: true, enabled: parsed.data.enabled }
}

/**
 * One statement of an industry module in or out of the organisation's grunnlinjer (0088, D-136).
 * set_org_module_item checks the role (daglig leder), keeps at least one statement, logs the change
 * and applies it to the planned grunnlinjer. The reason, when there is one, is what the screen
 * showed the leader: how many said «ikke relevant» last time.
 */
const ItemResult = z.union([
  z.object({ ok: z.literal(true), asked: z.boolean(), planned_rounds: z.coerce.number() }),
  z.object({ error: z.enum(['not_allowed', 'not_available', 'invalid', 'last_statement']) }),
])

export type ItemChoiceResult = { ok: true; asked: boolean } | { ok: false; problem: 'not_allowed' | 'not_available' | 'invalid' | 'last_statement' }

export async function setOrgModuleItem(key: string, code: string, asked: boolean, reason: string | null): Promise<ItemChoiceResult> {
  const org = await getCurrentOrgId()
  const input = z
    .object({
      key: ModuleKey,
      code: z.string().regex(/^[A-Za-z0-9]+(-[A-Za-z0-9]+)+$/).max(40),
      asked: z.boolean(),
      reason: z.string().trim().min(1).max(500).nullable(),
    })
    .safeParse({ key, code, asked, reason })
  if (!org || !input.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_org_module_item', {
    p_org: org,
    p_key: input.data.key,
    p_code: input.data.code,
    p_asked: input.data.asked,
    p_reason: input.data.reason,
  })
  if (callFailed('setOrgModuleItem', error)) return { ok: false, problem: 'not_available' }
  const parsed = ItemResult.safeParse(data)
  if (!parsed.success) return { ok: false, problem: 'not_available' }
  if ('error' in parsed.data) return { ok: false, problem: parsed.data.error }

  revalidatePath('/malinger')
  revalidatePath('/maleoppsett')
  return { ok: true, asked: parsed.data.asked }
}

/**
 * The wording a worded module is asked in (0083, D-131): barnehage, skole or begge, or null to
 * go back to the one the registered industry suggests. set_org_module_wording checks the role
 * and applies it to the planned rounds; an open round keeps its own.
 */
const WordingResult = z.union([
  z.object({ ok: z.literal(true), wording: z.enum(['barnehage', 'skole', 'begge']) }),
  z.object({ error: z.enum(['not_allowed', 'not_available', 'invalid']) }),
])

export type WordingChoiceResult = { ok: true; wording: 'barnehage' | 'skole' | 'begge' } | { ok: false }

export async function setOrgModuleWording(key: string, wording: string | null): Promise<WordingChoiceResult> {
  const org = await getCurrentOrgId()
  const k = ModuleKey.safeParse(key)
  const w = z.enum(['barnehage', 'skole', 'begge']).nullable().safeParse(wording)
  if (!org || !k.success || !w.success) return { ok: false }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_org_module_wording', { p_org: org, p_key: k.data, p_wording: w.data })
  if (callFailed('setOrgModuleWording', error)) return { ok: false }
  const parsed = WordingResult.safeParse(data)
  if (!parsed.success || 'error' in parsed.data) return { ok: false }

  revalidatePath('/malinger')
  revalidatePath('/maleoppsett')
  return { ok: true, wording: parsed.data.wording }
}
