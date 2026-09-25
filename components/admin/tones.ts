import type { BadgeTone } from './ui'

/** How a ticket's priority and status are coloured in the admin (D-92). */
export const PRIORITY_TONE: Record<string, BadgeTone> = { urgent: 'red', high: 'yellow', normal: 'grey', low: 'grey' }
export const STATUS_TONE: Record<string, BadgeTone> = {
  new: 'ink',
  open: 'yellow',
  waiting_customer: 'grey',
  waiting_us: 'yellow',
  resolved: 'green',
  closed: 'grey',
}
