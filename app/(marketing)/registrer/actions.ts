'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { lookupOrgNumber } from '@/lib/brreg/lookup'

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
  | { status: 'found'; orgNumber: string; name: string; rows: { key: string; value: string }[] }
  | { status: 'problem'; problem: string }

export async function lookupCompany(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const parsed = z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{9}$/))
    .safeParse(String(formData.get('orgNumber') ?? ''))
  if (!parsed.success) return { status: 'problem', problem: 'invalid_org_number' }

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

  return { status: 'found', orgNumber: f.orgNumber, name: f.name, rows }
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

  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  })

  /*
   * The message is the same whether the address is already registered or the password was
   * rejected. A sign-up form that says "this e-mail already has an account" is an
   * enumeration oracle in the same way a sign-in form that distinguishes wrong-password
   * from no-such-user is, and this one is worse: it is answerable by anybody.
   */
  if (signUpError) return { status: 'problem', problem: 'signup_failed' }

  // no session means the project requires e-mail confirmation first
  if (!signUp.session) return { status: 'problem', problem: 'confirm_email' }

  const { data, error } = await supabase.rpc('create_organisation', {
    p_name: parsed.data.companyName,
    p_org_number: parsed.data.orgNumber,
    p_employee_count: parsed.data.employeeCount,
    p_full_name: parsed.data.fullName,
  })

  if (error) return { status: 'problem', problem: 'org_failed' }

  const outcome = z
    .union([
      z.object({ ok: z.literal(true) }),
      z.object({ ok: z.literal(false), error: z.string() }),
    ])
    .safeParse(data)

  if (!outcome.success) return { status: 'problem', problem: 'org_failed' }
  if (!outcome.data.ok) return { status: 'problem', problem: outcome.data.error }

  return { status: 'idle' }
}
