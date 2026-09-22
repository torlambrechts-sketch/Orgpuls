import type { NextRequest } from 'next/server'
import { safeUpdateSession } from '@/lib/supabase/middleware'

/**
 * Middleware runs before every page, so anything it cannot survive, the site cannot
 * survive. `lib/supabase/middleware.ts` carries the four rules that keep that true; this
 * file's only job is to import nothing that could fail to load and to call the wrapper
 * that cannot throw.
 */
export async function middleware(request: NextRequest) {
  return safeUpdateSession(request)
}

export const config = {
  matcher: [
    // everything except static assets and image files
    '/((?!_next/static|_next/image|favicon.ico|tuva/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
}
