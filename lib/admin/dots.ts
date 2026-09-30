/**
 * The colour of a status dot, as design revision 3 of Sentral colours it (D-181). The design keeps
 * one map per kind of status — its `dot()` for the shared states, and one in each Growth view —
 * and every colour in them is a token already in tailwind.config.ts:
 *
 *   teal   #A8D5D2  done, live, granted, service
 *   yellow #F5C64A  in progress, draft, marketing, the default
 *   peach  #FBD5C4  overdue, missing, withdrawn, high risk
 *   mut    #5F5849  off, churned, deferred, skipped
 *   line   #E8DFC9  planned, next, low
 *   green  #DCEBD3  internal, notice given, company-level PII
 *
 * Keys are the statuses as the database will hold them (lower snake case), never the English
 * label: the label comes from the messages, the colour from here.
 */
export const DOT_TONES = ['teal', 'yellow', 'peach', 'mut', 'line', 'green', 'ink'] as const
export type DotTone = (typeof DOT_TONES)[number]

/**
 * The class that paints a dot of each tone; literal, so Tailwind keeps every one. This is the
 * admin's one dot registry: ui.tsx's `Badge` names its tones by meaning (green, red, grey) and
 * paints them from here.
 */
export const DOT_CLASS: Record<DotTone, string> = {
  teal: 'bg-teal',
  yellow: 'bg-ac',
  peach: 'bg-peach',
  mut: 'bg-mut',
  line: 'bg-line',
  green: 'bg-viz2',
  ink: 'bg-ink',
}

/** The design's `dot()`: the shared states of customers, pages, invoices, deals and translations */
const SHARED: Record<string, DotTone> = {
  active: 'teal',
  live: 'teal',
  published: 'teal',
  paid: 'teal',
  won: 'teal',
  indexed: 'teal',
  done: 'teal',
  trial: 'yellow',
  draft: 'yellow',
  scheduled: 'yellow',
  open: 'yellow',
  onboarding: 'yellow',
  in_review: 'yellow',
  past_due: 'peach',
  overdue: 'peach',
  missing: 'peach',
  blocked: 'peach',
  off: 'mut',
  churned: 'mut',
  archived: 'mut',
}

/** Each Growth view's own map, as its `…Vals()` in the design spells it */
const BY_KIND = {
  shared: SHARED,
  // the board's items (gwVals `st`)
  board: { live: 'teal', building: 'yellow', planned: 'line', deferred: 'mut' },
  // the 90-day plan's blocks (`pst`)
  plan: { done: 'teal', in_progress: 'yellow', next: 'line', planned: 'line' },
  // the coverage review (`cdot`)
  coverage: { built: 'teal', partial: 'yellow', missing: 'peach', skipped: 'mut' },
  // a risk's likelihood (`ldot`)
  likelihood: { high: 'peach', medium: 'yellow', low_medium: 'yellow', low: 'line', low_severe: 'peach' },
  // an experiment (`est`)
  experiment: { running: 'teal', queued: 'yellow', done: 'mut' },
  // a rule's or a template's stream (`sdot`)
  stream: { service: 'teal', marketing: 'yellow', internal: 'green', system: 'mut', service_internal: 'teal' },
  // an event's PII level (`piiDot`); the catalogue's `org` is the design's «company», `user` its yellow default
  pii: { none: 'teal', aggregate: 'teal', count_only: 'teal', role_only: 'teal', company: 'green', org: 'green', anonymous: 'green' },
  // a customer's health score in the lowest-first list (gwVals `health`: ≥ 70 teal, ≥ 45 yellow, else peach)
  health: { good: 'teal', fair: 'yellow', poor: 'peach' },
  // an anonymity firewall rule, as it stands
  firewall: { pass: 'teal', fail: 'peach' },
  // a consent record (consentVals `sd`)
  consent: { granted: 'teal', notice_given: 'green', withdrawn: 'peach', lapsed: 'yellow', not_given: 'mut' },
  // a recommendation's priority (`pdot`)
  priority: { now: 'peach', next: 'yellow', later: 'line' },
  // a Brønnøysund outreach row (the trigger queue's `sdot`); «Print run Fri» is a queued print run
  outreach: { queued: 'yellow', print_run: 'yellow', sent: 'teal', holdout: 'line', do_not_contact: 'mut' },
  // a partner's status (Partners' `sdot`)
  partner: { pilot_signed: 'teal', in_talks: 'yellow', kit_sent: 'yellow', member_offer_drafted: 'line', phase_2: 'mut' },
  // a partner kit's or a lead magnet's state (Partners' `kdot`)
  kit: { live: 'teal', done: 'teal', draft: 'yellow', building: 'yellow', planned: 'line' },
} as const satisfies Record<string, Record<string, DotTone>>

export type DotKind = keyof typeof BY_KIND

/** The tone of a status of a kind; yellow for one the map does not name, as the design's `||'#F5C64A'` */
export function dotTone(kind: DotKind, status: string): DotTone {
  const map: Record<string, DotTone> = BY_KIND[kind]
  return map[status] ?? 'yellow'
}
