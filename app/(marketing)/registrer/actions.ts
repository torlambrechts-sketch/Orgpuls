'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { HEARD } from '@/lib/signup/heard'
import { completePendingSignup, PENDING_KEY, type PendingOrg } from '@/lib/signup/pending'
import { myJoinRequest, signUpSeparately, type JoinRequest } from '@/lib/signup/organisation'
import { marketOfHost } from '@/lib/hosts'
import { authReturn } from '@/lib/auth/return'
import { orgNumberProblem } from '@/lib/markets'
import { normalizeOrgNumber, ORG_NUMBER_SHAPE, validOrgNumber } from '@/lib/org-number'

/**
 * Signing up (X-114, D-279).
 *
 * One form: the company's name, the person's name, a work address and a password; the organisation
 * number is optional. The account is created first and the organisation second, and the second only
 * happens because the first produced a session: `signup_organisation` runs as the signed-in user,
 * refuses a caller who already belongs to one, and looks for the company among those already here
 * before it makes one (0232). Finding it, it makes no second organisation: the person's request goes
 * to that organisation's daglig leder, and the form says so.
 *
 * Nothing is looked up before the account exists. The step that asked Brønnøysund for a typed number
 * is gone with the number's place at the front of the form; the company's register facts are fetched
 * in the product, under Oppsett, where the number can be added at any time.
 */

const SignUp = z.object({
  companyName: z.string().trim().min(1).max(200),
  // optional: empty is none; typed, the shape here and the market's rule below
  orgNumber: z.union([z.literal(''), z.string().regex(ORG_NUMBER_SHAPE)]),
  employeeCount: z.number().int().min(0).max(100_000),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  /**
   * Eight characters, and length is the only rule.
   *
   * Composition rules ("one number, one symbol") make passwords harder to remember and
   * not meaningfully harder to guess, which is NIST's own conclusion and the reason the
   * design's strength meter counts length twice and character classes once.
   */
  password: z.string().min(8).max(200),
  consent: z.literal(true),
})

export type SignUpState =
  | { status: 'idle' }
  | { status: 'created' }
  | { status: 'requested'; request: JoinRequest }
  | { status: 'problem'; problem: string }

export async function createAccount(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const h = await headers()
  // the host decides the market, never a form field (D-251)
  const market = marketOfHost(h.get('x-forwarded-host') ?? h.get('host'))
  const typed = String(formData.get('orgNumber') ?? '').trim()
  const parsed = SignUp.safeParse({
    companyName: String(formData.get('companyName') ?? ''),
    orgNumber: typed ? normalizeOrgNumber(typed, market) : '',
    employeeCount: Number(formData.get('employeeCount') ?? 0),
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    consent: formData.get('consent') === 'on',
  })
  if (typed && !parsed.success && parsed.error.issues.some((i) => i.path[0] === 'orgNumber')) {
    return { status: 'problem', problem: orgNumberProblem(market) }
  }
  if (!parsed.success) return { status: 'problem', problem: 'invalid' }
  const orgNumber = parsed.data.orgNumber || null
  if (orgNumber && !validOrgNumber(market, orgNumber)) return { status: 'problem', problem: orgNumberProblem(market) }

  const supabase = await createClient()

  // the company goes with the account, so the organisation can be made, or asked into, by the
  // first confirmed session when the project asks for e-mail confirmation (lib/signup/pending.ts,
  // D-200); the site and language go with it, so the confirmation comes from that site, in that
  // language (D-275)
  const back = await authReturn()
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: back.redirectTo,
      data: {
        full_name: parsed.data.fullName,
        lang: back.lang,
        [PENDING_KEY]: {
          orgNumber,
          companyName: parsed.data.companyName,
          employeeCount: parsed.data.employeeCount,
          market,
        } satisfies PendingOrg,
      },
    },
  })

  /*
   * The message is the same whether the address is already registered or the password was
   * rejected. A sign-up form that says "this e-mail already has an account" is an
   * enumeration oracle in the same way a sign-in form that distinguishes wrong-password
   * from no-such-user is, and this one is worse: it is answerable by anybody.
   */
  if (signUpError) return { status: 'problem', problem: 'signup_failed' }

  // no session means the project requires e-mail confirmation first: the link finishes the sign-up
  if (!signUp.session) return { status: 'problem', problem: 'confirm_email' }

  const made = await completePendingSignup(supabase)
  if (made.kind === 'failed') return { status: 'problem', problem: made.reason === 'invalid_org_number' ? orgNumberProblem(market) : made.reason }
  if (made.kind === 'none') return { status: 'problem', problem: 'org_failed' }
  if (made.kind === 'requested') {
    // the request as the waiting page reads it, so the form can offer the same way out; where it cannot
    // be read back, the company's name alone and no way out
    const request = await myJoinRequest(supabase)
    return {
      status: 'requested',
      request: request ?? { company: made.company, status: 'pending', typed: parsed.data.companyName, separable: false },
    }
  }
  return { status: 'created' }
}

/**
 * «Vi er en annen virksomhet» on the waiting page: the company found by its name or a colleague's
 * address is not theirs, so their own organisation is made from what they typed (0232). The database
 * refuses it where the number matched, and for anybody who already belongs to one.
 */
export async function separateCompany(): Promise<{ status: 'created' } | { status: 'problem'; problem: string }> {
  const supabase = await createClient()
  const made = await signUpSeparately(supabase)
  if (made.kind === 'created') return { status: 'created' }
  return { status: 'problem', problem: made.kind === 'failed' ? made.reason : 'org_failed' }
}

/**
 * "Hvordan hørte du om oss?" on the signup's last step (D-104): one of a fixed list, never
 * free text, saved beside the signup's source. Optional, and a failure is not shown: the
 * account exists either way.
 */
export async function saveHeard(heard: string): Promise<{ ok: boolean }> {
  const parsed = z.enum(HEARD).safeParse(heard)
  if (!parsed.success) return { ok: false }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('record_signup_heard', { p_heard: parsed.data })
  return { ok: !error && z.object({ ok: z.literal(true) }).safeParse(data).success }
}
