import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // The dev overlay's badge is painted into full-page screenshots, in the left margin at
  // the viewport's bottom edge. It is not part of the design, and a pixel region that
  // happens to reach that margin fails on a control the product does not ship.
  devIndicators: false,
}

export default withNextIntl(nextConfig)
