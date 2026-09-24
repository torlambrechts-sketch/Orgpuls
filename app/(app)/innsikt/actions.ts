'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { writeFailed } from '@/lib/supabase/write'

/**
 * Oversikt's "Gjør dette nå" checkbox. D-71.
 *
 * In the prototype the box only strikes the line through. Here a checked box has to mean
 * something, and the one thing it can honestly mean is the measure's own next fact: it has
 * been carried out. So checking moves a decided or running measure to `gjennomfort`, dated
 * today in the organisation's zone. That is not closing it: a measure closes only once its
 * effect is measured (0015), and checking a box does not measure anything.
 *
 * Unchecking undoes exactly that and nothing else: a measure still at `gjennomfort` goes
 * back to the step it came from, and the date is cleared. The previous step comes from the
 * page, so it is checked against the only two it can be. The write is conditional on the
 * step the row holds now, so a stale page cannot move a measure someone else has already
 * taken further. Row access is the measures' own RLS, as for every other measure write.
 *
 * Nothing is revalidated. Tiltak and Rapport are rendered per request, so they read the new
 * step on their next load. Revalidating from an action also re-renders the page that called
 * it, and the finished measure would vanish from under the pointer. The design keeps it on
 * the list, struck through, until the page is left.
 */
const Done = z.object({
  id: z.string().uuid(),
  done: z.enum(['true', 'false']),
  from: z.enum(['besluttet', 'pagar']),
})

export type DoneResult = { ok: true } | { ok: false }

export async function setMeasureDone(formData: FormData): Promise<DoneResult> {
  const parsed = Done.safeParse({ id: formData.get('id'), done: formData.get('done'), from: formData.get('from') })
  if (!parsed.success) return { ok: false }
  const { id, from } = parsed.data
  const done = parsed.data.done === 'true'

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date())
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('measures')
    .update(done ? { step: 'gjennomfort', completed_on: today } : { step: from, completed_on: null })
    .eq('id', id)
    .eq('step', done ? from : 'gjennomfort')
    .select('id')

  if (writeFailed('setMeasureDone', error, data)) return { ok: false }
  return { ok: true }
}
