'use client'

import { usePathname } from 'next/navigation'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { isRespondentPath, scrubUrl } from '@/lib/analytics/scrub'

/**
 * Vercel Web Analytics and Speed Insights, for the pages people use to run the product —
 * never for the pages people answer on.
 *
 * On a respondent's page neither component renders, so no script loads and nothing is
 * sent; `scrubUrl` drops any event from there as a second line, and strips query strings
 * and fragments from everything else. Both scripts are served from this origin
 * (`/_vercel/…`), so the CSP's `'self'` covers them and nothing is loaded from a CDN.
 *
 * Mounted by the root layout only when the app runs on Vercel: anywhere else — `next
 * start` in CI's smoke job, a local server — `/_vercel/…` does not exist, and the 404 would
 * be a console error on every screen. D-49.
 */
export function SiteAnalytics() {
  const pathname = usePathname()
  if (isRespondentPath(pathname)) return null

  return (
    <>
      <Analytics
        beforeSend={(event) => {
          const url = scrubUrl(event.url)
          return url ? { ...event, url } : null
        }}
      />
      <SpeedInsights
        beforeSend={(event) => {
          const url = scrubUrl(event.url)
          return url ? { ...event, url } : null
        }}
      />
    </>
  )
}
