'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { writeFailed } from '@/lib/supabase/write'
import { asciiQuotes } from '@/lib/sms/gsm7'
import { SMS_TEXT_MAX } from '@/supabase/functions/_shared/sms'

/**
 * The SMS screen's one write: on or off, when, and the text (0033, D-66).
 *
 * `org_update` admits the daglig leder only; anybody else updates nothing and is told so.
 * A blank text is stored as null, which means the default — so the default can change
 * without leaving organisations on a stale copy of it.
 *
 * Typographic quotes become ASCII before the text is stored. A text pasted from Word or
 * typed on a phone arrives with ‘ ’ “ ” or « », none of which is in GSM-7, and one of them
 * sends every invitation as UCS-2: 70 characters a part instead of 160, so the organisation
 * pays for more messages over a character nobody chose.
 */
const Sms = z.object({
  enabled: z.enum(['true', 'false']),
  when: z.enum(['mangler', 'paaminn', 'alle']),
  text: z.string().max(SMS_TEXT_MAX).transform(asciiQuotes),
})

export type SmsResult = { ok: true } | { ok: false; problem: 'invalid' | 'denied' | 'noOrg' }

export async function saveSms(formData: FormData): Promise<SmsResult> {
  const parsed = Sms.safeParse({
    enabled: formData.get('enabled'),
    when: formData.get('when'),
    text: String(formData.get('text') ?? ''),
  })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('organizations')
    .update({
      sms_enabled: parsed.data.enabled === 'true',
      sms_when: parsed.data.when,
      sms_text: parsed.data.text.trim() === '' ? null : parsed.data.text.trim(),
    })
    .eq('id', orgId)
    .select('id')

  if (writeFailed('saveSms', error, data)) return { ok: false, problem: 'denied' }
  revalidatePath('/integrasjoner/sms')
  revalidatePath('/integrasjoner')
  revalidatePath('/oppsett')
  return { ok: true }
}
