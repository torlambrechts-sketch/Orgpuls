import 'server-only'
import { resolveCname, resolveTxt } from 'node:dns/promises'
import type { Check } from '@/lib/crm/deliverability'

/**
 * The sending domain's authentication, as the receiving side sees it (X-092). Since February 2024
 * Gmail and Yahoo refuse bulk mail from a domain without DKIM and a DMARC record, and Microsoft
 * followed in 2025; SPF is the older third leg. Looked up in public DNS, never from our own
 * records, so what the admin sees is what a mailbox provider sees.
 *
 *   dkim   Brevo's keys: brevo1/brevo2._domainkey CNAMEs, or the older mail._domainkey TXT
 *   dmarc  _dmarc on the domain, else on its organisational domain (DMARC inherits); p=none is
 *          monitoring only, so it passes the providers' rule but protects nothing: a warning
 *   spf    a v=spf1 TXT on the domain that includes Brevo
 *
 * Cached for ten minutes per domain, so a page load does not wait on DNS each time.
 */
const TTL = 10 * 60_000
const cache = new Map<string, { at: number; checks: Check[] }>()

const txt = (name: string) =>
  Promise.race([
    resolveTxt(name).then((r) => r.map((x) => x.join(''))),
    new Promise<string[]>((_, no) => setTimeout(() => no(new Error('timeout')), 4000)),
  ]).catch((e: NodeJS.ErrnoException) => (e.code === 'ENOTFOUND' || e.code === 'ENODATA' ? [] : null))
const cname = (name: string) =>
  Promise.race([resolveCname(name), new Promise<string[]>((_, no) => setTimeout(() => no(new Error('timeout')), 4000))]).catch(
    (e: NodeJS.ErrnoException) => (e.code === 'ENOTFOUND' || e.code === 'ENODATA' ? [] : null),
  )

/** example.co.uk is not handled; the product's domains are two-label */
const orgDomain = (d: string) => d.split('.').slice(-2).join('.')

export async function domainChecks(domain: string | null, opts: { fresh?: boolean } = {}): Promise<Check[]> {
  if (!domain) return [{ id: 'domain_unknown', level: 'warn' }]
  const hit = cache.get(domain)
  // «Run authentication check» (Deliverability, D-185) asks DNS again rather than read the cache
  if (hit && !opts.fresh && Date.now() - hit.at < TTL) return hit.checks
  const [b1, b2, legacy, own, parent, spf] = await Promise.all([
    cname(`brevo1._domainkey.${domain}`),
    cname(`brevo2._domainkey.${domain}`),
    txt(`mail._domainkey.${domain}`),
    txt(`_dmarc.${domain}`),
    domain === orgDomain(domain) ? Promise.resolve([] as string[]) : txt(`_dmarc.${orgDomain(domain)}`),
    txt(domain),
  ])
  if ([b1, b2, legacy, own, parent, spf].some((x) => x === null)) return [{ id: 'domain_lookup', level: 'warn', vars: { host: domain } }]
  const checks: Check[] = []
  const dkim = (b1 ?? []).length > 0 || (b2 ?? []).length > 0 || (legacy ?? []).some((r) => /k=rsa|p=/.test(r))
  checks.push({ id: 'dkim', level: dkim ? 'pass' : 'fail', vars: { host: domain } })
  const dmarc = [...(own ?? []), ...(parent ?? [])].find((r) => /^v=DMARC1/i.test(r.trim()))
  const policy = dmarc?.match(/;\s*p=(\w+)/i)?.[1]?.toLowerCase()
  checks.push({ id: 'dmarc', level: !dmarc ? 'fail' : policy === 'none' ? 'warn' : 'pass', vars: { host: domain, policy: policy ?? '' } })
  const spfRecord = (spf ?? []).find((r) => /^v=spf1/i.test(r))
  checks.push({ id: 'spf', level: spfRecord && /brevo|sendinblue/i.test(spfRecord) ? 'pass' : 'warn', vars: { host: domain } })
  cache.set(domain, { at: Date.now(), checks })
  return checks
}

export const domainOf = (email: string | null | undefined) => email?.split('@')[1]?.toLowerCase() ?? null
