import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { missingEnvMessage, readSupabaseEnv } from '@/lib/supabase/env'

/**
 * Refreshes the auth session on every request and redirects anonymous visitors to
 * sign-in. getUser() is used rather than getSession() because it revalidates the token
 * with the auth server: getSession() trusts whatever is in the cookie, which is not a
 * basis for an access decision.
 *
 * Two rules about failure, both learned from a deployment that returned 500 on every
 * URL it had:
 *
 * 1. **A public path is decided before anything else happens.** `/s` is the respondent
 *    surface and must never require a session — the person opening it is an employee
 *    answering a survey, not a user of the application — and `/logg-inn` is where you go
 *    when something is wrong with auth. Building a Supabase client first coupled both to
 *    configuration they never use: with the two NEXT_PUBLIC_ variables absent,
 *    `createServerClient` throws, and middleware that throws takes down every URL,
 *    including the sign-in page you would fix it from and the one screen a respondent
 *    ever sees.
 *
 * 2. **Everything else fails closed, and says why.** A missing configuration or an auth
 *    server that cannot be reached is not permission to serve a protected page, so the
 *    request is redirected to sign-in. It is logged loudly, because "redirected to
 *    sign-in" looks like an expired session and the cause is not that.
 *
 * What rule 1 gives up: a public path no longer rotates the session cookie. Nothing
 * needs it to — every application route does it on the next request — and a respondent
 * has no session to rotate.
 */
const PUBLIC_PATHS = ['/logg-inn', '/auth', '/primitives', '/s']

const isPublic = (path: string) =>
  PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname

  // no session needed here, so nothing here may depend on one being obtainable
  if (isPublic(path)) return NextResponse.next({ request })

  const toSignIn = () => {
    const url = request.nextUrl.clone()
    url.pathname = '/logg-inn'
    return NextResponse.redirect(url)
  }

  const env = readSupabaseEnv()
  if ('missing' in env) {
    console.error(`[middleware] ${missingEnvMessage(env.missing)}`)
    return toSignIn()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return toSignIn()
  } catch (error) {
    console.error('[middleware] the auth check failed; refusing the request', error)
    return toSignIn()
  }

  return response
}
