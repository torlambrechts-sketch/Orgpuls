'use server'

import { z } from 'zod'
import { restoreLocale } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { lookupOrgNumber } from '@/lib/brreg/lookup'
import { lookupAllowed, networkOf } from '@/lib/brreg/throttle'
import { HEARD } from '@/lib/signup/heard'
import { completePendingSignup, PENDING_KEY } from '@/lib/signup/pending'

/**
 * Signing up.
 *
 * Two server actions and a deliberate order: the account is created first, the
 * organisation second, and the second only happens because the first produced a session.
 * `rpc.create_organisation` runs as the signed-in user and refuses a caller who already
 * belongs to one — see 0024 for why that guard is the one that matters.
 *
 * **The company lookup is separate from the account.** Step 1 asks Brønnøysund and shows
 * what came back; nothing is written until step 2 is submitted. That is not only a nicer
 * flow, it is the correct one: a registry lookup is a read of public data and should not
 * leave a row behind if somebody changes their mind.
 */

export type LookupState =
  | { status: 'idle' }
  | { status: 'found'; orgNumber: string; name: string; rows: { key: string; value: string }[]; employees: number | null }
  | { status: 'problem'; problem: string }

export async function lookupCompany(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const parsed = z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{9}$/))
    .safeParse(String(formData.get('orgNumber') ?? ''))
  if (!parsed.success) return { status: 'problem', problem: 'invalid_org_number' }

  // S5: an outbound request on a public page is an amplifier; see lib/brreg/throttle.ts
  const h = await headers()
  if (!lookupAllowed(networkOf(h.get('x-forwarded-for') ?? h.get('x-real-ip')))) {
    return { status: 'problem', problem: 'rate_limited' }
  }

  const result = await lookupOrgNumber(parsed.data)
  if (!result.ok) return { status: 'problem', problem: result.problem }

  const f = result.facts
  const rows = [
    ['address', f.address],
    ['form', f.formLabel],
    ['nace', f.naceLabel],
    ['employees', f.employees === null ? null : String(f.employees)],
  ]
    .filter(([, v]) => v !== null && v !== '')
    .map(([key, value]) => ({ key: key as string, value: value as string }))

  // the register's headcount preselects the size band (0 means none registered, not none employed)
  return { status: 'found', orgNumber: f.orgNumber, name: f.name, rows, employees: f.employees ? f.employees : null }
}

const SignUp = z.object({
  orgNumber: z.string().regex(/^\d{9}$/),
  companyName: z.string().trim().min(1).max(200),
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

export type SignUpState = { status: 'idle' } | { status: 'problem'; problem: string }

export async function createAccount(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = SignUp.safeParse({
    orgNumber: String(formData.get('orgNumber') ?? '').replace(/\s/g, ''),
    companyName: String(formData.get('companyName') ?? ''),
    employeeCount: Number(formData.get('employeeCount') ?? 0),
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    consent: formData.get('consent') === 'on',
  })
  if (!parsed.success) return { status: 'problem', problem: 'invalid' }

  const supabase = await createClient()

  // the company goes with the account, so the organisation can be made by the first confirmed
  // session when the project asks for e-mail confirmation (lib/signup/pending.ts, D-200)
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        [PENDING_KEY]: {
          orgNumber: parsed.data.orgNumber,
          companyName: parsed.data.companyName,
          employeeCount: parsed.data.employeeCount,
        },
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

  // no session means the project requires e-mail confirmation first: the link makes the organisation
  if (!signUp.session) return { status: 'problem', problem: 'confirm_email' }

  const made = await completePendingSignup(supabase)
  if (made.kind === 'failed') return { status: 'problem', problem: made.reason }
  if (made.kind === 'none') return { status: 'problem', problem: 'org_failed' }
  return { status: 'idle' }
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
