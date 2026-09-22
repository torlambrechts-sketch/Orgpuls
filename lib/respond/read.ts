import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Reading the respondent form.
 *
 * Everything goes through rpc.respond_form, because the person opening the link is anon
 * and anon has no grant on app.invitations and no RLS policy that would give one. That
 * is the point: a public page cannot be allowed to read the table that knows who was
 * invited. The token is validated in the database and the function returns the form or
 * a reason it cannot be shown.
 *
 * What comes back carries no round id, no invitation id, no employee and no group. Do
 * not add them. Each would be a handle on the person the link was sent to, and none of
 * them is needed to answer a question.
 */
const Form = z.object({
  org: z.string(),
  threshold: z.coerce.number(),
  questions: z.array(z.object({ factor: z.string(), ordinal: z.coerce.number() })),
  extra: z.array(
    z.object({
      key: z.string(),
      kind: z.enum(['scale', 'choice', 'free_text']),
      options: z.coerce.number(),
    }),
  ),
})

/**
 * The reasons a form cannot be shown. They are the screen's real states — "you have
 * already answered" has to be sayable or people answer twice and conclude the product
 * is broken — and they are exactly the reasons submit_response already distinguishes,
 * so nothing is revealed here that was not already.
 */
const Refusal = z.object({
  error: z.enum(['invalid_token', 'already_responded', 'expired', 'round_closed']),
})

export type RespondForm = z.infer<typeof Form>
export type RespondRefusal = z.infer<typeof Refusal>['error']

export async function getRespondForm(
  token: string,
): Promise<{ form: RespondForm } | { refused: RespondRefusal }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('respond_form', { p_token: token })

  // a transport failure is not a verdict on the token, but there is nothing to show
  if (error) return { refused: 'invalid_token' }

  const refusal = Refusal.safeParse(data)
  if (refusal.success) return { refused: refusal.data.error }

  const parsed = Form.safeParse(data)
  if (!parsed.success) return { refused: 'invalid_token' }
  return { form: parsed.data }
}
