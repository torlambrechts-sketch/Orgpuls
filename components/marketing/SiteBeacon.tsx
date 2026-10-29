'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { routeOf } from '@/lib/hosts'
import { sendBeacon, setBeaconSite, type BeaconSite } from '@/lib/marketing/beacon'
import { trackForm } from '@/lib/marketing/events'

/** a link or form that leads to sign-up, at its route or at the site's own address for it (Empvibe's /sign-up, D-274) */
const toSignup = (href: string | null, paths: BeaconSite['paths']) => {
  const path = href?.split(/[?#]/)[0]
  if (!path) return false
  return routeOf(paths, path) === '/registrer'
}

/**
 * Mounted on the public site only (D-248, as D-91 had it until D-230): counts each page view, and a
 * press on anything that leads to /registrer (or to the start band, #kom-i-gang), a link or the
 * organisation-number form, in Sentral (lib/marketing/beacon), and a press on a «Hvem er du?» card by its
 * persona (`data-persona`, D-277). It stores nothing on the device
 * (D-104), and sends nothing from a page that carries a capability.
 */
export function SiteBeacon({ counted, paths }: BeaconSite) {
  const pathname = usePathname()
  // the server's answer for this page's site (lib/marketing/beacon BeaconSite), before anything is sent
  setBeaconSite({ counted, paths })
  useEffect(() => {
    sendBeacon({ k: 'view' })
  }, [pathname])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null
      // a «Prøv gratis» to the page's start band counts as the press it replaced (/registrer, D-190)
      const href = link?.getAttribute('href') ?? null
      if (toSignup(href, paths) || href === '#kom-i-gang') sendBeacon({ k: 'cta', l: 'kom-i-gang' })
      const persona = link?.getAttribute('data-persona')
      if (persona) trackForm('persona_click', persona)
    }
    const onSubmit = (e: SubmitEvent) => {
      if (e.target instanceof HTMLFormElement && toSignup(e.target.getAttribute('action'), paths)) sendBeacon({ k: 'cta', l: 'orgnr' })
    }
    document.addEventListener('click', onClick, { capture: true })
    document.addEventListener('submit', onSubmit, { capture: true })
    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      document.removeEventListener('submit', onSubmit, { capture: true })
    }
  }, [paths])
  return null
}
