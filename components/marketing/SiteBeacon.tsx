'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { sendBeacon } from '@/lib/marketing/beacon'

const toSignup = (href: string | null) => href === '/registrer' || !!href?.startsWith('/registrer?')

/**
 * Mounted on the public site only (D-91): counts each page view with its address's campaign
 * tags, and counts a press on anything that leads to /registrer (or to the start band, #kom-i-gang), a link or the
 * organisation-number form. It stores nothing on the device (D-104). It is never on the
 * respondent's pages.
 */
export function SiteBeacon() {
  const pathname = usePathname()
  useEffect(() => {
    sendBeacon('view')
  }, [pathname])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null
      // a «Prøv gratis» to the page's start band counts as the press it replaced (/registrer, D-190)
      const href = link?.getAttribute('href') ?? null
      if (toSignup(href) || href === '#kom-i-gang') sendBeacon('cta', 'kom-i-gang')
    }
    const onSubmit = (e: SubmitEvent) => {
      if (e.target instanceof HTMLFormElement && toSignup(e.target.getAttribute('action'))) sendBeacon('cta', 'orgnr')
    }
    document.addEventListener('click', onClick, { capture: true })
    document.addEventListener('submit', onSubmit, { capture: true })
    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      document.removeEventListener('submit', onSubmit, { capture: true })
    }
  }, [])
  return null
}
