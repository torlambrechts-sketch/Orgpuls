/** Types for sentral-judge.mjs, so the unit tests can import the gate's judgement (D-181). */
type Png = { width: number; height: number; data: Uint8Array }

export const TILE: number
export const LOCAL_BASE_HOSTS: readonly string[]
export function assertLocalBase(url: unknown): URL
export function tiles(basePng: Png, shotPng: Png, opts?: { shift?: number; tile?: number }): [string, number][]
export function judgeView(
  claimed: readonly string[] | undefined,
  tileResults: readonly (readonly [string, number])[],
  limit: number,
): { pass: string[]; lost: string[]; rows: string[] }
export function verdict(input: {
  claims?: Record<string, readonly string[]>
  checked?: readonly string[]
  skipped?: readonly { name: string; why: string }[]
  failures?: readonly string[]
  errors?: readonly string[]
  known?: readonly string[]
}): { ok: boolean; reasons: string[] }
