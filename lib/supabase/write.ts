import type { PostgrestError } from '@supabase/supabase-js'

/**
 * A write that changed nothing is a write that was refused.
 *
 * This is the write-side of `lib/supabase/read.ts`, and it exists for the same reason:
 * PostgREST reports a refusal as an absence, and an absence reads like success.
 *
 * Row-level security does not raise on an `UPDATE` or `DELETE` it filters down to zero
 * rows. It narrows the statement's scope, the statement runs, and nothing matches.
 * PostgREST answers `204 No Content` with an empty body and `supabase-js` sets
 * `error: null`. Every action in this application decided success from `error` alone, so a
 * caller without the policy was told their change had been saved: a verneombud could open
 * Årshjulet, change the cadence, press Lagre, be shown a success message, and watch the
 * screen re-render with the old value — because `wheel_write` admits daglig leder only.
 *
 * `docs/CODE_REVIEW_2026-09-23.md` proved this against the live project rather than
 * inferring it: `PATCH /rest/v1/year_wheels?id=eq.<no such row>` answers `204` and no
 * error. Eighteen mutations across four action files had the same shape. S1.
 *
 * **The rule this belongs to.** *Never fabricate data in the UI* forbids rendering a value
 * that looks like data, because an invented value is indistinguishable from a real one.
 * D-40 recorded the same fault one layer down, where a failed read rendered as a genuine
 * empty state. This is the third face of it and the worst, because the person *acted*:
 * they are not merely shown something untrue, they are told that something they did took
 * effect when it did not.
 *
 * **How to use it.** Every mutation must ask for what it wrote. `.select(...)` on an
 * update, insert or delete sets `Prefer: return=representation`, so the response body
 * carries the rows that were actually affected, and zero rows is then visible:
 *
 *     const { data, error } = await supabase
 *       .schema('app')
 *       .from('year_wheels')
 *       .update({ … })
 *       .eq('id', id)
 *       .select('id')
 *
 *     if (writeFailed('saveWheel', error, data)) return { ok: false, problem: 'denied' }
 *
 * **The precedent is `app/(app)/samtaler/actions.ts`**, which was never affected. It writes
 * through `reply_to_thread` and `set_thread`, RPCs that return `{ok, error}`, and it parses
 * and checks that payload. Where an RPC already reports its own verdict, keep checking the
 * verdict; this helper is for the table writes that have none.
 *
 * **What is logged, and what is not.** Invariant 7 — no respondent free text in logs —
 * decides this as it decides the read helper. The log line carries the caller's name for
 * the operation, the PostgREST code and message, and nothing from the payload. The writes
 * this guards carry employee names (`oppsett`), measure titles and goals (`tiltak`) and
 * consultation counterparts (`maleoppsett`); none of that goes to a log. `details` is
 * dropped for the same reason — on a constraint violation it is the field that quotes the
 * value that violated it.
 */
const say = (where: string, what: string) => console.error(`[write] ${where}: ${what}`)

/**
 * `true` when the write did not happen, for either reason.
 *
 * Pass the `data` from a mutation that ended in `.select(...)`. Without that the array is
 * always null and every write would report as refused, which is why the call sites and this
 * helper have to change together.
 *
 * It is a type predicate rather than a plain boolean so the rows are narrowed to non-null
 * after the guard, and a caller that wants to report *how many* rows it wrote can do so
 * without an assertion — which is what the employee import needs, and what "parsed, not
 * cast" means on this side of the boundary too.
 */
export function writeFailed<T>(
  where: string,
  error: PostgrestError | null,
  rows: T[] | null,
): rows is null {
  if (error) {
    say(where, `${error.code ?? 'no code'} ${error.message}${error.hint ? ` — ${error.hint}` : ''}`)
    return true
  }
  if (!rows || rows.length === 0) {
    say(where, 'no row was affected — the policy refused the write')
    return true
  }
  return false
}
