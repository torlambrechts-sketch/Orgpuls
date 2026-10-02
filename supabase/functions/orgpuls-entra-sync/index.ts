/**
 * orgpuls-entra-sync — employees and groups from Microsoft Entra ID, kept in sync (D-202).
 *
 * Called by pg_cron through pg_net nightly (app.entra_sync_cron, migration 0165) and by «Synkroniser
 * nå» (public.entra_sync_now), both with the dispatcher's secret in `x-dispatch-secret`, the way
 * orgpuls-brreg-triggers is called: a caller that can start a sync and nothing else. The service
 * role exists only inside this runtime, and only the run's own RPCs use it (entra_sync_due, _begin,
 * _apply, _fail — granted to service_role alone). The group picker (`?op=groups`) is called with
 * the daglig leder's own access token instead, and its role check is an RPC run as them.
 *
 * Graph is read with application permissions User.Read.All and GroupMember.Read.All, by client
 * credentials with a certificate: ENTRA_CLIENT_ID, ENTRA_CERT_PRIVATE_KEY (a PKCS#8 PEM) and
 * ENTRA_CERT_THUMBPRINT (hex). Without them every run ends as `not_configured`.
 *
 * What a run does and the rules it keeps are in ../_shared/entra.ts and in the migration; log lines
 * carry organisation and run ids, codes and counts — never a name, an address or a Graph payload.
 * `verify_jwt` is off (scripts/functions/deploy.mjs), as for the other functions: pg_net sends no
 * JWT, and the picker's token is checked by the database itself.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleRequest, type AppCredentials } from '../_shared/entra.ts'
import { normalizePhone } from '../_shared/sms.ts'

const BUDGET_MS = 110_000 // new work starts only within this; the Edge wall-clock limit is 150 s on the smallest plan

function credentials(): AppCredentials | null {
  const clientId = Deno.env.get('ENTRA_CLIENT_ID') ?? ''
  const privateKeyPem = Deno.env.get('ENTRA_CERT_PRIVATE_KEY') ?? ''
  const thumbprint = Deno.env.get('ENTRA_CERT_THUMBPRINT') ?? ''
  return clientId && privateKeyPem && thumbprint ? { clientId, privateKeyPem, thumbprint } : null
}

Deno.serve((req) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  return handleRequest(req, {
    secret: Deno.env.get('ORGPULS_DISPATCH_SECRET') ?? '',
    credentials: credentials(),
    fetch: (u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(20_000) }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    rpc: async (fn, args) => {
      const { data, error } = await svc.rpc(fn, args)
      return { data, error }
    },
    userRpc: async (jwt, fn, args) => {
      const user = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } })
      const { data, error } = await user.rpc(fn, args)
      return { data, error }
    },
    phoneOf: normalizePhone,
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    log: (line) => console.log(JSON.stringify(line)),
    budgetMs: BUDGET_MS,
  })
})
