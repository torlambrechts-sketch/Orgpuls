import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

/**
 * Security headers. S2 in docs/CODE_REVIEW_2026-09-23.md.
 *
 * The product shipped with none of these. For a dashboard that would be ordinary
 * carelessness; here `/s/[token]` is a public page that carries a capability in its URL
 * and collects the most sensitive text in the product, and two of these headers are about
 * exactly that page.
 *
 * **`frame-ancestors 'none'` and `X-Frame-Options` are the ones that matter most.** Without
 * them the respondent survey can be framed: an employer could host a page that frames the
 * real form under a transparent overlay, or simply frame it to watch how long someone
 * spends on the krenkende atferd question. The product's promise is that no single answer
 * can be traced to a person, and a framed survey is a way around that which owes nothing
 * to the database.
 *
 * **`Referrer-Policy: no-referrer` closes the token leak permanently.** The token is in the
 * path, so any external subresource the page loads would receive it in `Referer`. Today no
 * page loads anything external — the fonts are self-hosted from `public/fonts` for the
 * reason D-07 gives — so there is no live leak. That is a property of the current code
 * rather than a control, and the first CDN script would undo it silently. This makes it a
 * control.
 *
 * **The CSP can be strict precisely because nothing is loaded from a CDN.** `connect-src`
 * needs the Supabase origin, because the browser talks to PostgREST and to auth directly.
 * `'unsafe-inline'` in `script-src` is a concession to Next's inlined bootstrap; removing
 * it needs a per-request nonce threaded through the middleware, which is worth doing and is
 * its own piece of work. It does not weaken the three headers above, which is why this
 * ships now rather than waiting for the nonce.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}`.trim(),
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // the QA tenant builds against the local stack into its own directory (scripts/qa/serve.mjs),
  // so a QA build never overwrites the one that talks to the hosted project
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typedRoutes: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  /**
   * Design 3 renames two screens (P1, D-70): Resultat is Resultater and Samtaler is
   * Kommentarer. The old addresses are in mail that has already gone out and in people's
   * bookmarks, so they answer with a permanent redirect rather than a 404. The query string
   * travels with it: `/resultat?maling=…&avdeling=…` lands on the same round and group.
   */
  async redirects() {
    return [
      { source: '/resultat', destination: '/resultater', permanent: true },
      { source: '/samtaler', destination: '/kommentarer', permanent: true },
      // Årshjulet became a tab of Målinger (D-74); a mail's link still opens it
      { source: '/arshjulet', destination: '/malinger?fane=arshjul', permanent: true },
      // Om oss was removed (D-95); its contact form is on /kontakt
      { source: '/om-oss', destination: '/kontakt', permanent: true },
    ]
  },
  // The dev overlay's badge is painted into full-page screenshots, in the left margin at
  // the viewport's bottom edge. It is not part of the design, and a pixel region that
  // happens to reach that margin fails on a control the product does not ship.
  devIndicators: false,
}

export default withNextIntl(nextConfig)
