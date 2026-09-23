import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Why a failed read is logged rather than quietly returned as nothing.
 *
 * Every read in this application ends `if (error || !data) return []`, which is the right
 * behaviour for a screen — a page that cannot reach the database should render its empty
 * state, not a stack trace. What it is not is the right behaviour for a *deployment*: an
 * empty list is exactly what a genuinely empty table returns, so a broken query and a
 * quiet Tuesday look identical from the outside.
 *
 * That is not hypothetical. Migration 0023 added `measures.effect_round_id`, a second
 * foreign key from `app.measures` to `app.rounds`. PostgREST then refused the
 * `rounds(...)` embed in `getMeasures` with `PGRST201 — Could not embed because more than
 * one relationship was found`, and the call site turned that into `[]`. Tiltak printed
 * "Ingen tiltak i denne visningen" over seven measures that were sitting in the database,
 * and Innsikt printed "Ingen tiltak løper" and left the third step of the sløyfe
 * unticked. Nothing failed, nothing logged, and every gate stayed green, because a
 * migration cannot break a SQL suite by breaking a PostgREST embed and the pixel gate
 * could not run. It was found by looking at the screen.
 *
 * The rule the product already has for this is **never fabricate data in the UI**. An
 * invented count is forbidden because it is indistinguishable from a real one. An invented
 * *absence* is the same error with the sign flipped, and it is the more dangerous of the
 * two here, because "there is nothing to do" is the answer a leader is most willing to
 * accept without checking.
 *
 * **What is logged, and what is not.** Invariant 7 — no respondent free text in logs —
 * decides the shape of these lines. A PostgREST read error carries a code, a message about
 * schema and relationships, and a hint; none of them is a row, and the filters these reads
 * send are ids and enum values rather than anything a person wrote. `details` is dropped
 * anyway, because it is the field that echoes values. A Zod failure logs the **path and
 * the code only** — never `message`, which on some issue kinds quotes what was received,
 * and never the row. A schema mismatch is located by which column disagreed, which the
 * path gives.
 */
const say = (where: string, what: string) => console.error(`[read] ${where}: ${what}`)

/** For a table read: `if (readFailed('getMeasures', error, data)) return []` */
export function readFailed(where: string, error: PostgrestError | null, data: unknown): boolean {
  if (!error && data !== null && data !== undefined) return false
  if (error) {
    say(where, `${error.code ?? 'no code'} ${error.message}${error.hint ? ` — ${error.hint}` : ''}`)
  } else {
    say(where, 'the query succeeded and returned nothing at all, not even an empty set')
  }
  return true
}

/** For an RPC, whose payload may legitimately be falsy: `if (callFailed('x', error)) return null` */
export function callFailed(where: string, error: PostgrestError | null): boolean {
  if (!error) return false
  say(where, `${error.code ?? 'no code'} ${error.message}${error.hint ? ` — ${error.hint}` : ''}`)
  return true
}

/**
 * For the Zod boundary: `if (parseFailed('getMeasures', parsed)) return []`
 *
 * It is a type predicate rather than a plain boolean so that `parsed.data` is still
 * narrowed to the success arm after the guard — otherwise swapping `!parsed.success` for
 * a call would cost every call site a non-null assertion, and an assertion is the thing
 * CLAUDE.md's "parsed, not cast" rule is about.
 *
 * Structurally typed rather than typed to Zod's own result, so it accepts whatever shape
 * `safeParse` returns across versions and cannot be the thing that breaks on an upgrade.
 */
type ParseFail = { success: false; error?: { issues: readonly { path: PropertyKey[]; code: string }[] } }

export function parseFailed<T>(
  where: string,
  parsed: { success: true; data: T } | ParseFail,
): parsed is ParseFail {
  if (parsed.success) return false
  const columns = (parsed.error?.issues ?? [])
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'} [${i.code}]`)
    .join('; ')
  say(where, `the rows did not match the schema — ${columns || 'no issues reported'}`)
  return true
}
