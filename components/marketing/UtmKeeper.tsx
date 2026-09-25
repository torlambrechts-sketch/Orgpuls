'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { rememberUtm } from '@/lib/marketing/utm'

/** Remembers a campaign's tags when a visit arrives with them (lib/marketing/utm). */
export function UtmKeeper() {
  const pathname = usePathname()
  useEffect(rememberUtm, [pathname])
  return null
}
