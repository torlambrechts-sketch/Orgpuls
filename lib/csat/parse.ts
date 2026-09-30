import { z } from 'zod'

/**
 * The rating page's boundary (0135, /vurdering): what may reach csat_open and csat_submit, and
 * what their answers may be. Pure, so tests/unit/csat.test.ts holds it.
 *
 * The key is 64 lowercase hex characters — 256 random bits minted by the dispatcher's claim —
 * and anything else is refused here without a call. The database answers a malformed, unknown,
 * expired or used key with the same `invalid`, and this keeps that: every one of them becomes
 * the one «the link does not work» the page shows.
 */
export const CSAT_KEY = /^[0-9a-f]{64}$/

export function parseKey(raw: unknown): string | null {
  return typeof raw === 'string' && CSAT_KEY.test(raw) ? raw : null
}

export const COMMENT_MAX = 2000

export type CsatProblem = 'invalid' | 'invalid_rating' | 'too_long' | 'rate_limited' | 'failed'
export type CsatResult = { ok: true } | { ok: false; problem: CsatProblem }

const Input = z.object({
  key: z.string().regex(CSAT_KEY),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z
    .string()
    .max(COMMENT_MAX * 2)
    .transform((v) => v.trim())
    .pipe(z.string().max(COMMENT_MAX))
    .transform((v) => (v === '' ? null : v)),
})
export type CsatInput = z.output<typeof Input>

/** The form's fields; the refusal names the field that failed, never what was typed */
export function parseCsatForm(fd: FormData): { ok: true; data: CsatInput } | { ok: false; problem: CsatProblem } {
  const parsed = Input.safeParse({ key: fd.get('key'), rating: fd.get('rating') ?? '', comment: fd.get('comment') ?? '' })
  if (parsed.success) return { ok: true, data: parsed.data }
  const field = String(parsed.error.issues[0]?.path[0] ?? '')
  return { ok: false, problem: field === 'rating' ? 'invalid_rating' : field === 'comment' ? 'too_long' : 'invalid' }
}

const Answer = z.object({ ok: z.boolean(), error: z.string().optional(), number: z.coerce.number().int().positive().optional() })
const KNOWN: readonly CsatProblem[] = ['invalid', 'invalid_rating', 'too_long', 'rate_limited']

/** csat_submit's answer; anything unexpected is `failed` */
export function readSubmit(data: unknown): CsatResult {
  const a = Answer.safeParse(data)
  if (!a.success) return { ok: false, problem: 'failed' }
  if (a.data.ok) return { ok: true }
  const e = a.data.error as CsatProblem | undefined
  return { ok: false, problem: e && KNOWN.includes(e) ? e : 'failed' }
}

export type CsatOpen = { ok: true; number: number } | { ok: false; problem: 'invalid' | 'rate_limited' | 'failed' }

/** csat_open's answer: the case number while the key may be used */
export function readOpen(data: unknown): CsatOpen {
  const a = Answer.safeParse(data)
  if (!a.success) return { ok: false, problem: 'failed' }
  if (a.data.ok) return a.data.number ? { ok: true, number: a.data.number } : { ok: false, problem: 'failed' }
  return { ok: false, problem: a.data.error === 'rate_limited' ? 'rate_limited' : a.data.error === 'invalid' ? 'invalid' : 'failed' }
}
