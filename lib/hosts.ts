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
