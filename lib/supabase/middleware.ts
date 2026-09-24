import { NextResponse, type NextRequest } from 'next/server'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * Refreshes the auth session on every request and redirects anonymous visitors to
 * sign-in. getUser() is used rather than getSession() because it revalidates the token
 * with the auth server: getSession() trusts whatever is in the cookie, which is not a
 * basis for an access decision.
 *
 * Three rules about failure, all of them learned from a deployment that returned
 * `500 MIDDLEWARE_INVOCATION_FAILED` on every URL it had. Middleware runs before every
 * page, so anything it cannot survive, the whole site cannot survive.
 *
 * 1. **A public path is decided before anything else happens.** `/s` is the respondent
 *    surface and must never require a session — the person opening it is an employee
 *    answering a survey, not a user of the application — and `/logg-inn` is where you go
 *    when something is wrong with auth. Neither may depend on configuration it does not
 *    use.
 *
 * 2. **Nothing else here may throw.** Two ways it did: `createServerClient` throws when
 *    the URL or key is absent, and the Supabase client throws `Invalid supabaseUrl` when
 *    the value is not a URL — which a trailing newline in a dashboard field is enough to
 *    cause. Both are now a redirect to sign-in and a log line, because refusing a
 *    request is a decision and a 500 is not.
 *
 * 3. **The auth call is bounded.** It is a network request to another service on every
 *    page view. If it hangs, the platform kills the function and reports the same
 *    failure — and a timeout cannot be caught, so it has to be prevented. Five seconds,
 *    then treat the request as unauthenticated.
 *
 * 4. **Nothing is imported at module scope that could fail to load.** A `try` inside the
 *    handler cannot catch a module that throws while the runtime is evaluating it: the
 *    handler never runs, the platform reports a failed *invocation*, and every URL
 *    returns 500 with no log line from this file. `@supabase/ssr` is therefore loaded
 *    with a dynamic `import()` from inside the try. The cost is one extra microtask per
 *    protected request.
 *
 *    **A correction to the record.** This rule was written believing it explained the
 *    `MIDDLEWARE_INVOCATION_FAILED` that took every URL down on a green build. It did
 *    not. The runtime log, when it finally arrived, showed `/var/task/middleware.js:1`
 *    failing on `import { safeUpdateSession } …` with `Cannot use import statement
 *    outside a module` — Vercel was running the *uncompiled source* of `middleware.ts` as
 *    a plain Node function, through its framework-agnostic Routing Middleware feature,
 *    instead of the bundle Next had built. No amount of care inside this file could have
 *    helped, because this file was never what ran. The fix is `vercel.json` declaring
 *    `"framework": "nextjs"`, which hands the file back to Next's builder. D-43.
 *
 *    The rule stays because it is still true and still cheap. It just was not the cause.
 *
 * All three fail closed: no session, no protected page. That is the safe direction, and
 * it is logged loudly because "redirected to sign-in" otherwise looks like an expired
 * session, which is the one thing it is not.
 */
// '/bli-med' is an invitation link (0028): opened before the invitee has an account
const PUBLIC_PATHS = ['/', '/logg-inn', '/registrer', '/auth', '/primitives', '/s', '/bli-med', '/nytt-passord']

/** Long enough for a healthy round trip, short enough that the platform never gets there. */
const AUTH_TIMEOUT_MS = 5000

/**
 * `AbortSignal.timeout` is in every runtime this ships to, but referencing it is the kind
 * of thing that is true until it is not, and the consequence of being wrong is the outage
 * this whole file exists to prevent. An unbounded call is worse than no bound, so the
 * fallback is a signal that aborts on its own timer rather than no signal at all.
 */
function deadline(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

const isPublic = (path: string) =>
  PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

export async function updateSession(request: NextRequest) {
  // no session needed here, so nothing here may depend on one being obtainable
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next({ request })

  try {
    return await guard(request)
  } catch (error) {
    console.error('[middleware] refusing the request: the access check failed', error)
    return toSignIn(request)
  }
}

/**
 * The last resort, and the only code here that is allowed to be dull.
 *
 * If `toSignIn` itself cannot build a URL — a malformed request line, a runtime without
 * `URL` — there is nothing left to do but let the request through to a page that will
 * decide for itself. That is the one place this file does not fail closed, and it is
 * deliberate: a page with no session renders its own sign-in, whereas a 500 renders
 * nothing and says nothing.
 */
export async function safeUpdateSession(request: NextRequest) {
  try {
    return await updateSession(request)
  } catch (error) {
    console.error('[middleware] the middleware itself failed; passing the request on', error)
    return NextResponse.next()
  }
}

function toSignIn(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = '/logg-inn'
  return NextResponse.redirect(url)
}

async function guard(request: NextRequest) {
  // inside the try, on purpose — see rule 4 above
  const { createServerClient } = await import('@supabase/ssr')

  const env = readSupabaseEnv()
  if ('problem' in env) {
    console.error(`[middleware] refusing the request: ${env.problem}`)
    return toSignIn(request)
  }
  for (const warning of env.warnings) console.warn(`[middleware] ${warning}`)

  let response = NextResponse.next({ request })

  const supabase = createServerClient(env.url, env.key, {
    global: {
      // an unbounded call here is an outage waiting for a slow day
      fetch: (input, init) => fetch(input, { ...init, signal: deadline(AUTH_TIMEOUT_MS) }),
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data, error } = await supabase.auth.getUser()

  /*
   * "There is no session" is the ordinary case for every anonymous visitor, and the
   * client reports it as an error. Logging it would put a line in the deployment's log
   * for every page view by someone who is not signed in, which is how a real error goes
   * unnoticed. Anything else — an auth server that cannot answer, a call that timed out
   * — is worth knowing about and reads the same to the visitor: no session, no page.
   */
  if (error && error.name !== 'AuthSessionMissingError') {
    console.error('[middleware] refusing the request: the auth check failed', error.message)
    return toSignIn(request)
  }
  if (!data.user) return toSignIn(request)

  return response
}
