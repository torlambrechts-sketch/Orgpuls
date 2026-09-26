import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed } from '@/lib/supabase/read'

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
  // the round's industry module (0069): its wording is the registry's, not a message key
  modules: z
    .array(
      z.object({
        name: z.string(),
        minutes: z.coerce.number(),
        // English beside the Norwegian where the module has it (0072); the page picks by locale
        statements: z.array(
          z.object({
            item: z.string().uuid(),
            factor: z.string(),
            text: z.string(),
            factor_en: z.string().nullish(),
            text_en: z.string().nullish(),
          }),
        ),
        count: z.array(
          z.object({
            item: z.string().uuid(),
            text: z.string(),
            options: z.array(z.string()).length(3),
            text_en: z.string().nullish(),
            options_en: z.array(z.string().nullable()).nullish(),
          }),
        ),
        segments: z.array(
          z.object({
            item: z.string().uuid(),
            text: z.string(),
            options: z.array(z.string()).min(2),
            text_en: z.string().nullish(),
            options_en: z.array(z.string().nullable()).nullish(),
          }),
        ),
      }),
    )
    .default([]),
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

  /*
   * A transport failure is not a verdict on the token, but there is nothing to show.
   *
   * This is the one read in the application that does NOT log its error, and the token is
   * why. `respond_form` takes the plaintext capability as an argument, and a Postgres
   * error can quote the argument it choked on — `invalid input syntax for ...` is exactly
   * that shape. Invariant 3 keeps the plaintext out of every column; putting it in a
   * deployment log instead would be the same exposure through a different door, and a log
   * is copied to more places than a table. A respondent's form failing to open is visible
   * to the respondent, which is who needs to know.
   */
  if (error) return { refused: 'invalid_token' }

  const refusal = Refusal.safeParse(data)
  if (refusal.success) return { refused: refusal.data.error }

  const parsed = Form.safeParse(data)
  if (parseFailed('getRespondForm', parsed)) return { refused: 'invalid_token' }
  return { form: parsed.data }
}
