'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { sendBeacon } from '@/lib/marketing/beacon'
import { rememberFirstTouch, rememberUtm } from '@/lib/marketing/utm'

const toSignup = (href: string | null) => href === '/registrer' || !!href?.startsWith('/registrer?')

/**
 * Mounted on the public site only (D-91): remembers the visit's campaign tags and first page
 * (lib/marketing/utm), counts each page view, and counts a press on anything that leads to
 * /registrer, a link or the organisation-number form. It is never on the respondent's pages.
 */
export function SiteBeacon() {
  const pathname = usePathname()
  useEffect(() => {
    rememberUtm()
    rememberFirstTouch()
    sendBeacon('view')
  }, [pathname])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null
      if (link && toSignup(link.getAttribute('href'))) sendBeacon('cta', 'kom-i-gang')
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
