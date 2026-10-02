import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import no from '@/messages/no.json'
import { SignInPanel } from '@/components/start/SignInPanel'
import { microsoftEnabled } from '@/lib/auth/microsoft'
import {
  BindResult,
  BindStart,
  ConsentAnswer,
  EntraStatus,
  SignInCheck,
  adminConsentUrl,
  bindProblemFrom,
  entraClientIdFrom,
  entraGate,
  providerEnabled,
  signInProblem,
  type EntraStatus as Status,
} from '@/lib/entra/schema'

/**
 * Microsoft Entra ID sign-in and the tenant binding (0155, D-201): the TypeScript half. The
 * database half — every rule, refusal and policy — is supabase/tests/entra_signin_invariants.sql.
 */
const TENANT = '11111111-1111-4111-8111-111111111111'
const CLIENT = '0f0e0d0c-0b0a-4908-8706-050403020100'

describe('providerEnabled (/auth/v1/settings)', () => {
  it('is on only when the provider is exactly true', () => {
    expect(providerEnabled({ external: { azure: true, google: false } }, 'azure')).toBe(true)
    expect(providerEnabled({ external: { azure: false } }, 'azure')).toBe(false)
    expect(providerEnabled({ external: { azure: 'true' } }, 'azure')).toBe(false)
    expect(providerEnabled({ external: { google: true } }, 'azure')).toBe(false)
    expect(providerEnabled({}, 'azure')).toBe(false)
    expect(providerEnabled(null, 'azure')).toBe(false)
    expect(providerEnabled('nonsense', 'azure')).toBe(false)
  })
})

describe('microsoftEnabled', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-for-tests')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
  const answer = (body: unknown, ok = true) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))

  it('reads external.azure from the project settings', async () => {
    answer({ external: { azure: true } })
    expect(await microsoftEnabled()).toBe(true)
  })
  it('is off when the provider is off, the answer fails, or the request throws', async () => {
    answer({ external: { azure: false, google: true } })
    expect(await microsoftEnabled()).toBe(false)
    answer({ external: { azure: true } }, false)
    expect(await microsoftEnabled()).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('down'))))
    expect(await microsoftEnabled()).toBe(false)
  })
})

describe('entraClientIdFrom (ENTRA_CLIENT_ID)', () => {
  it('takes a GUID, trimmed and lower-cased, and nothing else', () => {
    expect(entraClientIdFrom(` ${CLIENT.toUpperCase()}\n`)).toBe(CLIENT)
    expect(entraClientIdFrom(undefined)).toBeNull()
    expect(entraClientIdFrom('')).toBeNull()
    expect(entraClientIdFrom('my-app')).toBeNull()
  })
})

describe('SignInCheck', () => {
  it('parses the three shapes the database answers', () => {
    expect(SignInCheck.parse({ ok: true, microsoft: false })).toEqual({ ok: true, microsoft: false })
    expect(SignInCheck.parse({ ok: true, microsoft: true, bound_now: true }).ok).toBe(true)
    expect(SignInCheck.parse({ ok: false, microsoft: true, error: 'tenant_mismatch' }).ok).toBe(false)
  })
  it('refuses a code it does not know, and a payload that is not one', () => {
    expect(SignInCheck.safeParse({ ok: false, error: 'something_new' }).success).toBe(false)
    expect(SignInCheck.safeParse({ ok: 'true' }).success).toBe(false)
    expect(SignInCheck.safeParse(null).success).toBe(false)
  })
})

describe('signInProblem', () => {
  it('collapses every refusal that would tell whether an account exists into one message', () => {
    for (const c of ['no_membership', 'tenant_mismatch', 'identity_mismatch', 'email_unverified', 'identity_ambiguous', 'personal_account'] as const)
      expect(signInProblem(c)).toBe('microsoft_refused')
  })
  it('reports a platform admin and a failure as a failed sign-in', () => {
    expect(signInProblem('platform_admin')).toBe('microsoft_failed')
    expect(signInProblem('not_signed_in')).toBe('microsoft_failed')
    expect(signInProblem(null)).toBe('microsoft_failed')
  })
  it('has a message in Norwegian for both', () => {
    expect(no.auth.microsoftProblem.microsoft_failed.length).toBeGreaterThan(10)
    expect(no.auth.microsoftProblem.microsoft_refused.length).toBeGreaterThan(10)
  })
})

const status = (over: Partial<Status> = {}): Status =>
  EntraStatus.parse({
    ok: true,
    bound: false,
    tenant_id: null,
    bound_at: null,
    daglig_leder: true,
    microsoft: true,
    own_tenant: TENANT,
    me_bound_at: '2026-10-02T10:00:00+00:00',
    last_event: null,
    ...over,
  })

describe('entraGate: the binding button exists in one state only', () => {
  it('offers the button to a daglig leder in a Microsoft session, with a client id', () => {
    expect(entraGate(status(), CLIENT)).toBe('can_bind')
  })
  it('hides it when the client id is missing', () => {
    expect(entraGate(status(), null)).toBe('not_configured')
    expect(entraGate(null, null)).toBe('not_configured')
  })
  it('hides it from anybody but the daglig leder', () => {
    expect(entraGate(status({ daglig_leder: false }), CLIENT)).toBe('not_leader')
    expect(entraGate(null, CLIENT)).toBe('not_leader')
  })
  it('hides it outside a Microsoft session', () => {
    expect(entraGate(status({ microsoft: false, own_tenant: null }), CLIENT)).toBe('needs_microsoft')
  })
  it('says bound only over a binding', () => {
    expect(entraGate(status({ bound: true, tenant_id: TENANT, bound_at: '2026-10-02T10:00:00+00:00' }), null)).toBe('bound')
  })
})

describe('EntraStatus', () => {
  it('refuses a tenant id that is not a GUID', () => {
    expect(EntraStatus.safeParse({ ...status(), tenant_id: 'contoso.onmicrosoft.com' }).success).toBe(false)
  })
})

describe('the consent round trip', () => {
  it('asks the leader’s own tenant’s admin-consent endpoint', () => {
    const url = new URL(adminConsentUrl({ tenant: TENANT, clientId: CLIENT, redirectUri: 'https://www.orgpuls.com/integrasjoner/entra/callback', state: 'a'.repeat(64) }))
    expect(url.origin + url.pathname).toBe(`https://login.microsoftonline.com/${TENANT}/v2.0/adminconsent`)
    expect(url.searchParams.get('client_id')).toBe(CLIENT)
    expect(url.searchParams.get('scope')).toBe('https://graph.microsoft.com/.default')
    expect(url.searchParams.get('redirect_uri')).toBe('https://www.orgpuls.com/integrasjoner/entra/callback')
    expect(url.searchParams.get('state')).toBe('a'.repeat(64))
  })
  it('parses Microsoft’s answer, never its error description', () => {
    const ok = ConsentAnswer.parse({ state: 'b'.repeat(64), tenant: TENANT, admin_consent: 'True', scope: 'x' })
    expect(ok).toEqual({ state: 'b'.repeat(64), tenant: TENANT, admin_consent: 'True' })
    const refused = ConsentAnswer.parse({ state: 'b'.repeat(64), error: 'access_denied', error_description: 'AADSTS65004: a person wrote this' })
    expect(refused).not.toHaveProperty('error_description')
    expect(ConsentAnswer.safeParse({ state: 'not-a-nonce', admin_consent: 'True' }).success).toBe(false)
  })
  it('parses the start and the result', () => {
    expect(BindStart.parse({ ok: true, nonce: 'c'.repeat(64), tenant: TENANT }).ok).toBe(true)
    expect(BindStart.safeParse({ ok: true, nonce: 'short', tenant: TENANT }).success).toBe(false)
    expect(BindResult.parse({ ok: false, error: 'tenant_taken' }).ok).toBe(false)
  })
  it('keeps only its own codes from the address bar', () => {
    expect(bindProblemFrom('tenant_taken')).toBe('tenant_taken')
    expect(bindProblemFrom('not_configured')).toBe('not_configured')
    expect(bindProblemFrom('<script>')).toBeNull()
    expect(bindProblemFrom(undefined)).toBeNull()
  })
  it('has a message for every code, in Norwegian', () => {
    for (const code of ['not_signed_in', 'not_allowed', 'not_microsoft', 'already_bound', 'tenant_taken', 'tenant_mismatch', 'consent_refused', 'nonce_invalid', 'nonce_used', 'nonce_expired', 'not_bound', 'not_configured', 'failed'])
      expect((no.integrasjoner.entraSetup.problem as Record<string, string>)[code]).toBeTruthy()
  })
})

describe('SignInPanel', () => {
  const render = (props: { google?: boolean; microsoft?: boolean; problem?: string | null }) =>
    renderToStaticMarkup(
      createElement(NextIntlClientProvider, { locale: 'no', messages: no, timeZone: 'Europe/Oslo', children: createElement(SignInPanel, props) }),
    )

  it('shows «Fortsett med Microsoft» and the design’s hint only when the provider is on', () => {
    const off = render({ google: true, microsoft: false })
    expect(off).not.toContain(no.auth.microsoft)
    expect(off).not.toContain(no.auth.hintMicrosoft)
    expect(off).toContain(no.auth.google)

    const on = render({ google: true, microsoft: true })
    expect(on).toContain(no.auth.microsoft)
    expect(on).toContain(no.auth.hintMicrosoft)
    // the design's first alternative, above Google
    expect(on.indexOf(no.auth.microsoft)).toBeLessThan(on.indexOf(no.auth.google))
  })
  it('renders no divider and no alternative when neither provider is on', () => {
    const none = render({})
    expect(none).not.toContain('h-[46px]')
    expect(none).not.toContain(no.auth.microsoft)
  })
  it('prints the refusal message', () => {
    expect(render({ microsoft: true, problem: 'microsoft_refused' })).toContain('Vi kunne ikke logge deg inn med denne Microsoft-kontoen')
  })
})
