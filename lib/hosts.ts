/**
 * The production hosts (D-90, D-98). Edge-safe: read by the middleware as well as the server.
 *
 *   www.orgpuls.com    the product and the Norwegian public site
 *   en.orgpuls.com     the same, in English: the host decides the language (lib/i18n/request)
 *   admin.orgpuls.com  the platform admin, and only the admin
 *
 * `ADMIN_HOST` and `EN_HOST` override the defaults, e.g. for a staging domain. Local and
 * preview builds match none of these, so /admin and the language switch work there on one host.
 */
export const MAIN_HOST = 'www.orgpuls.com'
export const ADMIN_HOST = process.env.ADMIN_HOST?.trim().toLowerCase() || 'admin.orgpuls.com'
export const EN_HOST = process.env.EN_HOST?.trim().toLowerCase() || 'en.orgpuls.com'

/** The hosts where /admin must not exist. */
export const PUBLIC_HOSTS: readonly string[] = [MAIN_HOST, 'orgpuls.com', EN_HOST]

export const hostOf = (value: string | null | undefined) => (value ?? '').split(':')[0]?.toLowerCase() ?? ''

export const MAIN_URL = `https://${MAIN_HOST}`
export const EN_URL = `https://${EN_HOST}`

const LOOPBACK = new Set(['localhost', '127.0.0.1'])

/**
 * The base of a link that leaves the browser — printed on a poster, mailed, texted, handed to
 * someone else — from the request's host (x-forwarded-host, then host). Such a link has to work
 * for whoever receives it, wherever it was made:
 *
 *   a production host (PUBLIC_HOSTS)  itself, over https; bare orgpuls.com becomes MAIN_URL
 *   a loopback host                   itself, with its port and protocol: local and QA only,
 *                                     where nothing is sent to anyone
 *   anything else                     MAIN_URL — a Vercel preview, a proxy, or a spoofed Host
 *                                     header never ends up on a poster or in someone's inbox
 */
export function outboundBase(host: string | null | undefined, proto: string | null | undefined): string {
  const raw = (host ?? '').split(',')[0]?.trim().toLowerCase() ?? ''
  const name = hostOf(raw)
  if (name === EN_HOST) return EN_URL
  if (PUBLIC_HOSTS.includes(name)) return MAIN_URL
  if (LOOPBACK.has(name) || raw.startsWith('[::1]')) return `${proto === 'https' ? 'https' : 'http'}://${raw}`
  return MAIN_URL
}
