import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'
import respondentUi from '@/lib/i18n/respondent-ui.json'
import { legalInputs } from '@/lib/legal/inputs'
import { legalUnits } from '@/lib/legal/registry'
import { autoApprove, isError, legalApprovals } from './api'

/**
 * While the auto-approve switch is on (0101, D-152), what the database cannot see by itself is
 * approved from here: the legal texts as this build and the overrides render them, and the survey
 * pages' strings as this build hashes them (lib/i18n/respondent-ui.json). public.admin_auto_record
 * records both as automatic, and does nothing while the switch is off. Called when the switch is
 * turned on and whenever the legal review or the translations page is opened, so a deploy that
 * changes a text is approved at the next look — and a survey page never waits for it (0101
 * round_locale_state «auto»).
 */
export async function autoRecord(): Promise<{ legal: number; ui: number } | null> {
  const state = await autoApprove()
  if (isError(state) || !state.on) return null
  const [inputs, approvals] = await Promise.all([legalInputs(), legalApprovals()])
  if (isError(approvals)) return null
  const have = new Map(approvals.approvals.map((a) => [a.key, a.hash]))
  const legal = legalUnits(inputs)
    // a broken unit (a path that no longer resolves) is never approvable, by a person or the switch
    .filter((u) => !u.missing?.length && u.lines.length > 0 && have.get(u.key) !== u.hash)
    .map((u) => ({ key: u.key, hash: u.hash }))
  const ui = Object.entries(respondentUi as Record<string, string>).map(([locale, hash]) => ({ locale, hash }))
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_auto_record', { p_legal: legal, p_ui: ui })
  if (callFailed('admin_auto_record', error)) return null
  const r = z.object({ ok: z.literal(true), legal: z.coerce.number(), ui: z.coerce.number() }).safeParse(data)
  return r.success ? { legal: r.data.legal, ui: r.data.ui } : null
}
