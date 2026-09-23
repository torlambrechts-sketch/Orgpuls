import { NextResponse } from 'next/server'

/**
 * PROBE — not for merging.
 *
 * Production has returned `500 MIDDLEWARE_INVOCATION_FAILED` on every deployment this
 * project has ever had, through three rewrites of the real middleware, while the same
 * bundle runs clean in the edge-runtime sandbox locally. This branch deploys the smallest
 * possible middleware with the *same matcher* as production and nothing else.
 *
 * If this preview fails too, the cause is the Vercel project or the matcher, not the
 * handler. If it loads, the fault is somewhere in what the real handler imports or does,
 * and the next probe adds that back one piece at a time.
 */
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|tuva/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
}
