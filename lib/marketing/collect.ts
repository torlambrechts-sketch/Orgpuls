/**
 * Where the public site's own visit counting goes (D-248): Sentral, the platform that steers Orgpuls
 * (X-105), through its `web-collect` edge function. Sentral runs on Supabase in Frankfurt
 * (eu-central-1), and the address pins the function to that region, so a visitor's address is read
 * nowhere else.
 *
 * Imported by next.config.ts for the CSP's `connect-src`, so it imports nothing.
 * `NEXT_PUBLIC_WEB_COLLECT_URL` replaces it for a test stack; set, it also lets the beacon send from a
 * host that is not a production one (lib/marketing/beacon).
 */
export const COLLECT_OVERRIDE = process.env.NEXT_PUBLIC_WEB_COLLECT_URL?.trim() || ''

export const COLLECT_URL =
  COLLECT_OVERRIDE || 'https://zuvqbaejoktpekfsiyyr.supabase.co/functions/v1/web-collect?forceFunctionRegion=eu-central-1'

export const COLLECT_ORIGIN = new URL(COLLECT_URL).origin
