/**
 * Resultater's model: what the server hands the workspace, already k-gated and scoped.
 *
 * Every number here is a value an RPC returned (0034-0037); nothing is derived from
 * answers on this side. The page builds the model once per request
 * (`app/(app)/resultater/page.tsx`); the client workspace only chooses which part to
 * draw, so moving between cells and tabs never asks the server anything.
 *
 * Rows are addressed by id: `ORG` for the caller's whole scope when that scope is the
 * organisation, a group's name for a group. An avdelingsleder has no `ORG` row, because
 * `results_summary` answers them for their department, which is already a group row.
 */
export const ORG = '*'

export type RoundKind = 'grunnlinje' | 'puls'

export interface RoundRef {
  id: string
  kind: RoundKind
  /** the chip label: "2026" for a grunnlinje, "Mai 25" for a puls */
  label: string
  /** "Grunnlinje 2026", "Puls mai 2025" */
  title: string
  /** the time line's column: "Sep 26", "Mai 25" — the month it closed, or opens when planned */
  month: string
  year: number
  closesAt: string | null
  /** not closed yet: the Utvikling grid draws it dashed and empty */
  planned: boolean
  /** out now: answers are coming in, and nothing is shown until it closes */
  open: boolean
}

export type RowStatus = 'ok' | 'insufficient_data' | 'protected'

export interface ScoreRow {
  id: string
  name: string
  n: number
  status: RowStatus
}

/** factor key → index, for one row of one round; null when that row is withheld */
export type Scores = Record<string, number> | null

export interface Statement {
  ordinal: number
  index: number
}

export interface Suggestion {
  key: string
  adopted: boolean
}

export interface ResultaterModel {
  round: RoundRef
  /** the grunnlinje chosen under "Sammenlign med", or null for "Ingen" */
  compare: RoundRef | null
  /** the grunnlinje before this one, for "fra året før" when nothing is compared */
  previous: RoundRef | null
  threshold: number
  /** the round's factors, in the instrument's order */
  factors: string[]
  rows: ScoreRow[]
  /** round id → row id → scores. Every closed round the caller may read. */
  scores: Record<string, Record<string, Scores>>
  /** round id → the scope's overall index */
  overall: Record<string, number | null>
  /** round id → factor keys that round measured */
  measured: Record<string, string[]>
  /** every round on the time line, oldest first, planned ones last */
  timeline: RoundRef[]
  /** row id → factor key → statements, for the round in view */
  items: Record<string, Record<string, Statement[]>>
  /** factor key → r, whole organisation; null when not the caller's or too few answers */
  importance: Record<string, number> | null
  importanceMinimum: number | null
  /** this round's comments per factor (whole organisation, 0018) */
  comments: Record<string, { count: number; quote: string | null }>
  /** playbook keys this organisation has already made into measures (0031) */
  adopted: string[]
  /** a puls only: the running measures on the factors it measured, whose effect it reads */
  plan: PlanLine[]
  /** a puls only: how many statements it asked */
  questionCount: number
  /** the initial selection, from the URL */
  initial: { view: ViewKey; row: string; factor: string }
}

export interface PlanLine {
  id: string
  title: string
  factorKey: string
  owner: string | null
  step: 'pagar' | 'gjennomfort' | 'effekt_malt'
}

export const VIEWS = ['varmekart', 'prioritet', 'segment', 'sammenlign', 'utvikling'] as const
export type ViewKey = (typeof VIEWS)[number]

/** "Tillit til tallene" (D-72): the response rate decides, the groups over k are the evidence. */
export function trustLevel(pct: number): 'hoy' | 'middels' | 'lav' {
  if (pct >= 70) return 'hoy'
  if (pct >= 50) return 'middels'
  return 'lav'
}

export type Quadrant = 'fiks' | 'hold' | 'folg' | 'lav'

/**
 * Prioritet's quadrant (D4). The design splits on a score of 60 and an importance it drew
 * as a literal; here importance is a correlation, so it splits at the median r of the
 * factors in the round: "matters more than most" rather than a constant a correlation
 * has no natural reason to cross.
 */
export function quadrantOf(score: number, r: number, median: number): Quadrant {
  const important = r >= median
  if (score < 60) return important ? 'fiks' : 'folg'
  return important ? 'hold' : 'lav'
}

export function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  if (s.length === 0) return 0
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export const QUADRANT_TONE: Record<Quadrant, { bg: string; fg: string }> = {
  fiks: { bg: '#FBD5C4', fg: '#6B240C' },
  hold: { bg: '#CFE7E4', fg: '#20431C' },
  folg: { bg: '#F7EDD2', fg: '#5C4600' },
  lav: { bg: '#F2EAD6', fg: '#5F5849' },
}

/** The mean of a row's factors, rounded as the design's `avg` rounds. */
export function meanOf(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/** Later minus earlier, whichever of the two was chosen first (the design's `chron`). */
export function chronDelta(a: { v: number; at: string | null }, b: { v: number; at: string | null }): number {
  return (a.at ?? '') >= (b.at ?? '') ? a.v - b.v : b.v - a.v
}
