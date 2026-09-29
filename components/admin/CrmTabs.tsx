import type { BadgeTone } from './ui'

export const STATUS_TONE: Record<string, BadgeTone> = { draft: 'grey', scheduled: 'yellow', sending: 'yellow', sent: 'green', cancelled: 'red' }

/** A stage's badge (0093): by its kind, the plan's trial green, a new prospect grey */
export function stageTone(stage: { key: string; kind: string } | undefined): BadgeTone {
  if (!stage) return 'grey'
  if (stage.key === 'trial') return 'green'
  if (stage.kind === 'won') return 'ink'
  if (stage.kind === 'lost') return stage.key === 'lost' ? 'red' : 'grey'
  if (stage.kind === 'parked') return 'grey'
  return stage.key === 'new' ? 'grey' : 'yellow'
}
