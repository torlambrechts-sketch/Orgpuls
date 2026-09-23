/**
 * PostgREST sometimes rejects a token Auth issued a moment ago as "issued at future".
 *
 * PGRST303 is raised when a JWT's `iat` is later than PostgREST's notion of now. PostgREST
 * does not read the wall clock per request: it serves a cached time that is meant to lag by
 * at most a second, and in the versions this project meets it can lag by more — the first
 * request after a sign-in or a refresh then carries a token that looks like it comes from
 * the future. Upstream: supabase/supabase#49655, #50651, discussion #48123; the configurable
 * skew that would end it (PostgREST/postgrest#5199) has not landed.
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

export const SKEW_DELAYS_MS = [500, 1000, 2000] as const

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
