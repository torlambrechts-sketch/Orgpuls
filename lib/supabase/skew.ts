/**
 * PostgREST sometimes rejects a token Auth issued a moment ago as "issued at future".
 *
 * PGRST303 is raised when a JWT's `iat` is more than 30 s later than PostgREST's notion of
 * now. Up to v16.2 PostgREST did not read the clock per request: it served a time cached by
 * the auto-update library, and after an idle spell some of its threads stopped seeing the
 * cache's updates (PostgREST/postgrest#5159, #5196), so the first request such a thread
 * served was checked against a clock minutes old. v16.3 and v14.18 (September 2026) read
 * the system clock directly. Supabase's own reports of the same symptom: supabase/supabase
 * #49655, #50651, discussion #48123.
 *
 * CI found it: the smoke job signed in, opened /innsikt, and `getViewerRole` came back
 * `PGRST303 JWT issued at future`. The screen rendered as though the viewer had no role —
 * a refusal shown as a fact about the person, the same fault D-40 and S1 closed elsewhere.
 * Production has not logged it, but nothing in production prevents it.
 *
 * **Why a retry is safe here, for writes too.** PGRST303 is decided while PostgREST checks
 * the JWT, before it opens a transaction or runs any SQL. A request refused with it did
 * nothing, so sending it again cannot apply anything twice.
 *
 * **What is retried, and nothing else:** a 401 whose body carries code `PGRST303`, on a
 * request whose body can be sent again (none, or a string — which is what supabase-js
 * sends). Every other failure goes back to the caller untouched, to be reported by
 * `read.ts` and `write.ts` as before. If every attempt is refused the last response is
 * returned, and the caller logs it exactly as it would have without this wrapper.
 */

/*
 * 7.5 s in all, and only ever spent on a refusal. The first schedule stopped at 3.5 s, and
 * a CI runner on 2026-09-23 outlasted it; so did this one, the same day. Both were the
 * v16.2 defect above: a stale thread does not catch up, and a retry on the same kept-alive
 * connection reaches the same thread, so no schedule mends that case — CI now runs v16.3
 * instead. The wrapper stays for the ordinary skew a retry does mend, and because a refused
 * read otherwise renders as a fact about the person.
 */
export const SKEW_DELAYS_MS = [500, 1000, 2000, 4000] as const

type Fetch = typeof fetch

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function issuedAtFuture(response: Response): Promise<boolean> {
  if (response.status !== 401) return false
  try {
    const body: unknown = await response.clone().json()
    return typeof body === 'object' && body !== null && 'code' in body && body.code === 'PGRST303'
  } catch {
    return false
  }
}

const replayable = (init: RequestInit | undefined) =>
  init?.body === undefined || init.body === null || typeof init.body === 'string'

export function withIssuedAtRetry(
  inner: Fetch = fetch,
  sleep: (ms: number) => Promise<void> = pause,
): Fetch {
  return async (input, init) => {
    let response = await inner(input, init)
    if (!replayable(init)) return response

    for (const [attempt, delay] of SKEW_DELAYS_MS.entries()) {
      if (!(await issuedAtFuture(response))) return response
      // the code and the attempt only — no URL, which can carry filter values
      console.warn(`[skew] PGRST303 on a fresh token; retry ${attempt + 1} of ${SKEW_DELAYS_MS.length}`)
      await sleep(delay + Math.floor(Math.random() * 250))
      response = await inner(input, init)
    }
    return response
  }
}
