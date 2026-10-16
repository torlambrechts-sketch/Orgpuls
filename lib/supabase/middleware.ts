import { NextResponse, type NextRequest } from 'next/server'
import { readSupabaseEnv } from '@/lib/supabase/env'
import { hostGate, PAGE_LANG_HEADER } from '@/lib/hosts'

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
// '/bli-med' is an invitation link (0028): opened before the invitee has an account.
// The landing pages, the articles, the sitemap and robots.txt are the public site; the
// same list of pages is in lib/marketing/site.ts, which this file does not import (rule 4).
const PUBLIC_PATHS = [
  '/',
  '/logg-inn',
  '/registrer',
  '/auth',
  '/primitives',
  '/s',
  // the QR poster's page (0076, D-126): asks for a number or address, sends the person's own link
  '/inn',
  // «Dette sa dere, dette gjør vi» (0100, D-151): a closed round's page, the link its only key
  '/r',
  // an organisation's logo, by its address (0104, D-154): shown in the survey and in mails
  '/logo',
  '/bli-med',
  '/nytt-passord',
  '/lovkrav',
  '/verneombud',
  '/smaa-bedrifter',
  '/verktoy-for-medarbeiderundersokelse',
  '/psykososialt-arbeidsmiljo',
  '/bygg-og-anlegg',
  '/helse-og-omsorg',
  '/barnehage-og-skole',
  '/kunnskap-og-kontor',
  '/handel',
  '/plattform',
  '/hvorfor',
  '/bruksomrader',
  '/bransjer',
  '/priser',
  '/sikkerhet',
  '/anonymitet',
  '/kontakt',
  '/personvernerklaering',
  '/vilkar',
  '/artikler',
  // the free templates and their files (D-241); a file is served only to a browser that asked for it
  '/maler',
  '/sitemap.xml',
  '/robots.txt',
  // the site as a reading list for AI search (llmstxt.org), the same pages as the sitemap
  '/llms.txt',
  // the IndexNow key (D-234): search engines fetch it to check that a URL submission is ours
  '/6eae893c3286a989d0a624bd3b86edc1.txt',
  // choosing a language on this host, then back to the page (D-109)
  '/api/sprak',
  // the approved site texts, public as the pages that show them, for the weekly fold-back (X-090)
  '/api/i18n/overrides',
  // the demo (D-143): the request form, and the start its login link leads to, which checks
  // the session itself and sends a visitor without one back to the form
  '/demo',
]

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

/**
 * The product's own roots (app/(app)) and the API: the addresses that need a session. Any other
 * address of the site's own shape is the public site's: a page or a 404, never a sign-in.
 * tests/unit/app-roots.test.ts keeps this list equal to app/(app)'s routes, so a new screen of
 * the product cannot become public by being forgotten here.
 */
export const APP_ROOTS = ['forhandsvis', 'hjelp', 'innsikt', 'integrasjoner', 'kommentarer', 'maleoppsett', 'malinger', 'oppsett', 'rapport', 'resultater', 'tiltak', 'api']
const SITE_ADDRESS = /^\/[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9_-]+)*$/
const isSiteAddress = (path: string) => SITE_ADDRESS.test(path) && !APP_ROOTS.includes(path.split('/')[1] ?? '')

const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) || isSiteAddress(path)

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname

  // a site of its own (D-270, D-276) shows its pages at its own addresses; a moved host (D-275) and a
  // reserved one (D-258) send every address where an English reader goes. Pure string work on the
  // host: it cannot throw.
  const read = request.method === 'GET' || request.method === 'HEAD'
  const gate = hostGate(request.headers.get('x-forwarded-host') ?? request.headers.get('host'), path, isPublic(path), request.nextUrl.search, read)
  // a site of its own's page is in its own language (D-276): the request config reads it from here.
  // No request carries on a value the visitor sent, public or the product's (guard), and the request
  // config takes the value only where it names the site's own language
  const headers = new Headers(request.headers)
  headers.delete(PAGE_LANG_HEADER)
  if (gate.lang) headers.set(PAGE_LANG_HEADER, gate.lang)
  // a site of its own (D-270): a page asked for by its Norwegian address goes to the site's own
  // address, permanently and with its query; only a page load, so a form posted there still lands
  if (gate.canonical) {
    if (!read) return noindex(await route(request, path, headers), gate.noindex)
    const url = request.nextUrl.clone()
    url.pathname = gate.redirect!
    return NextResponse.redirect(url, 308)
  }
  if (gate.redirect) {
    // a moved or reserved host's redirect is absolute and carries the query, permanently from a moved
    // host (308, which keeps a form's method)
    return noindex(NextResponse.redirect(new URL(gate.redirect), gate.permanent ? 308 : 307), true)
  }
  // on a site of its own (D-270, D-276), a page at its own address, or the 404 for a page it does not serve
  if (gate.rewrite) {
    const url = request.nextUrl.clone()
    url.pathname = gate.rewrite
    return noindex(NextResponse.rewrite(url, { request: { headers } }), gate.noindex)
  }
  return noindex(await route(request, path, headers), gate.noindex)
}

const noindex = (response: NextResponse, on: boolean) => {
  if (on) response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

async function route(request: NextRequest, path: string, headers: Headers) {
  // no session needed here, so nothing here may depend on one being obtainable
  if (isPublic(path)) return NextResponse.next({ request: { headers } })

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
  url.search = ''
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

  // the request as it came, with the session's cookies as refreshed below, and never a page language
  // the visitor sent (D-276): only the gate names one, and only for a site's own page
  const forwarded = () => {
    const headers = new Headers(request.headers)
    headers.delete(PAGE_LANG_HEADER)
    return headers
  }
  const pass = () => NextResponse.next({ request: { headers: forwarded() } })
  let response = pass()

  const supabase = createServerClient(env.url, env.key, {
    global: {
      // an unbounded call here is an outage waiting for a slow day
      fetch: (input, init) => fetch(input, { ...init, signal: deadline(AUTH_TIMEOUT_MS) }),
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = pass()
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
