import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed } from '@/lib/supabase/read'
import { COUNT_ANSWERS } from '@/lib/respond/answers'

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
            // a line under the statement (0089)
            help: z.string().nullish(),
            help_en: z.string().nullish(),
          }),
        ),
        count: z.array(
          z.object({
            item: z.string().uuid(),
            text: z.string(),
            // ja, nei, vet ikke, and where it does not apply to everyone a fourth that says so (0089)
            options: z.array(z.string()).min(3).max(4),
            text_en: z.string().nullish(),
            options_en: z.array(z.string().nullable()).nullish(),
            // the answer each option is stored as; handel's «Jobber aldri alene» is ikke_aktuelt (0090)
            answers: z.array(z.enum(COUNT_ANSWERS)).min(3).max(4),
          }).refine((q) => q.answers.length === q.options.length, 'one answer per option'),
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
  // the organisation's own questions (0095, D-145), in its own words: «skala» 1–5 or «fritekst»
  own: z
    .array(z.object({ id: z.string().uuid(), text: z.string(), kind: z.enum(['skala', 'fritekst']) }))
    .max(5)
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

/**
 * The languages the survey behind a token could be answered in (0079, D-127): per language
 * how many items lack an approved translation and which UI hashes were approved, the approved
 * wording for the complete ones, and the employee's own language. `null` when the token does
 * not open a form — the page has already said why, from respond_form — or the call fails,
 * which leaves the respondent in bokmål rather than stranded. Like respond_form, the error is
 * not logged: it could quote the token.
 */
const Locales = z.object({
  employee_lang: z.string().nullable(),
  // the organisation's language (0081); absent from a database without it
  org_lang: z.string().nullable().optional(),
  locales: z.record(z.string(), z.object({ missing: z.coerce.number(), ui: z.array(z.string()), pilot: z.boolean().optional() })),
  texts: z.record(z.string(), z.record(z.string(), z.string())),
  // a survey language's approved page strings with the source each was made from (0086, D-133)
  ui: z.record(z.string(), z.record(z.string(), z.object({ t: z.string(), h: z.string().nullable() }))).optional().default({}),
})
export type RespondLocales = z.infer<typeof Locales>

export async function getRespondLocales(token: string): Promise<RespondLocales | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('respond_locales', { p_token: token })
  if (error) return null
  const parsed = Locales.safeParse(data)
  return parsed.success ? parsed.data : null
}
