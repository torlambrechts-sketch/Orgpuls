import { z } from 'zod'
import type { Check } from '@/lib/crm/deliverability'
import type { AdminRole } from './api'
import type { DotTone } from './dots'
import { rate } from './magnets'

/**
 * Sentral › Admin › Deliverability (0144, D-185): the shapes public.admin_deliverability() returns,
 * and what the page computes from them. Pure, so tests/unit/growth-g4.test.ts runs it.
 *
 * Every rate is over the messages the provider has reported on, never over one it has not: a
 * message with no report yet is not a message that failed, and the invitation tests keep no
 * provider id, so nothing can ever report on them. A stream with no delivery event says so,
 * rather than print «0 %» delivered, and the figures say how many of the sent were reported.
 */
export const STREAMS = ['transactional', 'marketing'] as const
export const AUTH_LEVELS = ['pass', 'warn', 'fail', 'unknown'] as const
export type AuthLevel = (typeof AUTH_LEVELS)[number]
export const TEMPLATE_SOURCES = ['notice', 'ticket', 'lifecycle', 'auth', 'crm'] as const

const num = z.coerce.number()
const AuthCheck = z.object({
  checked_at: z.string(),
  domain: z.string(),
  spf: z.enum(AUTH_LEVELS),
  dkim: z.enum(AUTH_LEVELS),
  dmarc: z.enum(AUTH_LEVELS),
  dmarc_policy: z.enum(['none', 'quarantine', 'reject']).nullable(),
})

const Stream = z.object({
  key: z.enum(STREAMS),
  sender: z.string(),
  domain: z.string(),
  /**
   * a personal notice on this stream is below k: its messages are in none of this stream's figures
   * (a total that held them would give their count back by subtraction), and this says so, never how many
   */
  withheld: z.boolean(),
  sent: num,
  /** of `sent`, how many the provider has reported on (a deferred message is still in flight): every rate's denominator */
  reported: num,
  /** of `sent`, the invitation tests, which keep no provider id and are never reported */
  tests: num,
  /** delivered, or a state only a delivered message reaches (a complaint, an unsubscribe) */
  delivered: num,
  spam: num,
  bounced: num,
  hard_bounces: num,
  last_event_at: z.string().nullable(),
  check: AuthCheck.nullable(),
})
export type Stream = z.infer<typeof Stream>

export const Deliverability = z.object({
  streams: z.array(Stream),
  templates: z.array(
    z.object({
      key: z.string(),
      source: z.enum(TEMPLATE_SOURCES),
      ref: z.string(),
      classification: z.enum(['service', 'marketing']),
      stream: z.enum(STREAMS),
      locales: z.array(z.string()),
      version: num,
      /** null where nothing records the send (Auth's hook), or where a personal notice's count is below k */
      sent: num.nullable(),
      /** a personal notice counted fewer than k times in 7 days: its count is withheld */
      withheld: z.boolean(),
    }),
  ),
  daily_cap: num.nullable(),
  /** k (app.k_min()): a personal notice counted fewer times than this has its count withheld */
  k: num,
})
export type Deliverability = z.infer<typeof Deliverability>

/**
 * Who may run the authentication check: the roles that write in the CRM (app.crm_can_write), as
 * admin_deliverability_claim checks. The analyst reads the page and is not offered the button.
 */
export const mayRunAuthCheck = (role: AdminRole | null | undefined) => role === 'super_admin' || role === 'marketing'

/** Why a stream's rates read «—», or null when they are real */
export function streamGap(s: Pick<Stream, 'sent' | 'reported'>): 'nothing_sent' | 'no_events' | null {
  if (!s.sent) return 'nothing_sent'
  if (!s.reported) return 'no_events'
  return null
}

/**
 * A stream's three rates as the design prints them (delivered and bounce to a tenth, spam to a
 * hundredth), over the messages the provider reported on
 */
export function streamRates(s: Stream) {
  if (streamGap(s)) return { delivered: null, spam: null, bounce: null }
  return { delivered: rate(s.delivered, s.reported, 1), spam: rate(s.spam, s.reported, 2), bounce: rate(s.bounced, s.reported, 1) }
}

/**
 * The KPI row over both streams, on the same footing as each stream's card: rates over the
 * messages the provider reported on, so a stream with sends and no report adds nothing to a
 * denominator; counts only once anything was reported. `reported` of `sent` is the sub-line.
 */
export function deliverabilityKpis(streams: Stream[]) {
  const sum = (k: 'sent' | 'reported' | 'delivered' | 'spam' | 'hard_bounces') => streams.reduce((a, s) => a + s[k], 0)
  const all = { sent: sum('sent'), reported: sum('reported') }
  const gap = streamGap(all)
  return {
    sent: all.sent,
    reported: all.reported,
    gap,
    delivered: gap ? null : rate(sum('delivered'), all.reported, 1),
    spam: gap ? null : rate(sum('spam'), all.reported, 2),
    hardBounces: gap ? null : sum('hard_bounces'),
    complaints: gap ? null : sum('spam'),
    /** a personal notice below k is left out of these figures, on some stream */
    withheld: streams.some((s) => s.withheld),
  }
}

/** The dot of a check line: pass teal, a warning yellow, a failure peach, never checked the hairline colour */
export function levelTone(level: AuthLevel | null): DotTone {
  return level === 'pass' ? 'teal' : level === 'warn' ? 'yellow' : level === 'fail' ? 'peach' : 'line'
}

/**
 * What lib/admin/mailDomain.ts found for one domain, as the levels app.mail_auth_checks keeps. A
 * lookup that failed or timed out is `unknown` for all three, never a failure the domain does not have.
 */
export function levelsOf(checks: Check[]): { spf: AuthLevel; dkim: AuthLevel; dmarc: AuthLevel; dmarc_policy: 'none' | 'quarantine' | 'reject' | null } {
  const unknown = checks.some((c) => c.id === 'domain_lookup' || c.id === 'domain_unknown')
  const at = (id: string): AuthLevel => {
    if (unknown) return 'unknown'
    const c = checks.find((x) => x.id === id)
    return c ? c.level : 'unknown'
  }
  const p = String(checks.find((c) => c.id === 'dmarc')?.vars?.policy ?? '').toLowerCase()
  return {
    spf: at('spf'),
    dkim: at('dkim'),
    dmarc: at('dmarc'),
    dmarc_policy: !unknown && (p === 'none' || p === 'quarantine' || p === 'reject') ? p : null,
  }
}

/** A template's locales as the design lists them: «no · en» */
export const localeList = (l: string[]) => l.join(' · ')

/**
 * A registry key as it may break: after a '.', '_' or '-' only, never inside a word
 * («notice.|siste_|paminnelse»). The parts, each ending at its separator, for the page to join
 * with <wbr>.
 */
export const keyParts = (key: string) => key.match(/[^._-]+[._-]?|[._-]/g) ?? [key]
