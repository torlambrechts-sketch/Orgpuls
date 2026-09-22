'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Submitting a response.
 *
 * The only write path in the product, and the only one a respondent has. Everything it
 * does is decided in the database by rpc.submit_response, in one transaction: the
 * invitation is marked answered and an unlinked response is inserted. This action
 * validates the shape and forwards it.
 *
 * Two rules it must not break.
 *
 * Nothing a respondent wrote may end up anywhere but the database. There is no logging
 * in this file, and there must not be: a console.error carrying the payload would put
 * free text into the server log, which is precisely the leak the whole design is built
 * to prevent. The Supabase error is inspected for a code, never echoed with its body.
 *
 * The server never learns who answered. The token is the credential; it is not resolved
 * to a person here and the RPC does not return the response id, so nothing in this
 * process can correlate a submission with a row.
 */
const Answer = z.object({
  factor: z.string().min(1).max(64),
  ordinal: z.number().int().min(1).max(9),
  // absent when the question was skipped; a comment may still accompany it
  value: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(4000).optional(),
})

const Extra = z.object({
  key: z.string().min(1).max(64),
  option: z.number().int().min(1).max(9).optional(),
  text: z.string().max(4000).optional(),
})

const Payload = z.object({
  token: z.string().min(16).max(512),
  answers: z.array(Answer).max(200),
  extra: z.array(Extra).max(50),
})

export type SubmitResult =
  | { ok: true; answers: number }
  | { ok: false; error: string }

export async function submitResponse(input: unknown): Promise<SubmitResult> {
  const parsed = Payload.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_payload' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_response', {
    p_token: parsed.data.token,
    p_answers: parsed.data.answers,
    p_extra: parsed.data.extra,
  })

  // the message is deliberately not read: it can quote the statement that failed
  if (error) return { ok: false, error: 'submit_failed' }

  const Result = z.union([
    z.object({ ok: z.literal(true), answers: z.coerce.number() }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ])
  const result = Result.safeParse(data)
  if (!result.success) return { ok: false, error: 'submit_failed' }
  return result.data
}
