import { z } from 'zod'
import type { Check } from '@/lib/crm/deliverability'
import type { DotTone } from './dots'
import { rate } from './magnets'

/**
 * Sentral › Admin › Deliverability (0144, D-185): the shapes public.admin_deliverability() returns,
 * and what the page computes from them. Pure, so tests/unit/growth-g4.test.ts runs it.
 *
 * Every rate is over the messages the stream sent in seven days, and only when the provider has
 * reported on at least one of them: a stream with no delivery event says so, rather than print
 * «0 %» delivered.
 */
export const STREAMS = ['transactional', 'marketing'] as const
export type StreamKey = (typeof STREAMS)[number]
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
export type AuthCheck = z.infer<typeof AuthCheck>

const Stream = z.object({
  key: z.enum(STREAMS),
  sender: z.string(),
  domain: z.string(),
  sent: num,
  /** of `sent`, how many the provider has reported anything on */
  reported: num,
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
      /** null where nothing records the send (Auth's hook) */
      sent: num.nullable(),
    }),
  ),
  daily_cap: num.nullable(),
})
export type Deliverability = z.infer<typeof Deliverability>

/** Why a stream's rates read «—», or null when they are real */
export function streamGap(s: Pick<Stream, 'sent' | 'reported'>): 'nothing_sent' | 'no_events' | null {
  if (!s.sent) return 'nothing_sent'
  if (!s.reported) return 'no_events'
  return null
}

/** A stream's three rates as the design prints them (delivered and bounce to a tenth, spam to a hundredth) */
export function streamRates(s: Stream) {
  if (streamGap(s)) return { delivered: null, spam: null, bounce: null }
  return { delivered: rate(s.delivered, s.sent, 1), spam: rate(s.spam, s.sent, 2), bounce: rate(s.bounced, s.sent, 1) }
}

/** The KPI row over both streams: counts only where the provider reported, rates only over a sent message */
export function deliverabilityKpis(streams: Stream[]) {
  const sum = (k: 'sent' | 'reported' | 'delivered' | 'spam' | 'hard_bounces') => streams.reduce((a, s) => a + s[k], 0)
  const all = { sent: sum('sent'), reported: sum('reported') }
  const gap = streamGap(all)
  return {
    sent: all.sent,
    gap,
    delivered: gap ? null : rate(sum('delivered'), all.sent, 1),
    spam: gap ? null : rate(sum('spam'), all.sent, 2),
    hardBounces: gap ? null : sum('hard_bounces'),
    complaints: gap ? null : sum('spam'),
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

/** The design's `dot` for a template's classification: service teal, marketing yellow */
export const classTone = (c: 'service' | 'marketing'): DotTone => (c === 'marketing' ? 'yellow' : 'teal')
