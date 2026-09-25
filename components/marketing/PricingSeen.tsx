'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/marketing/events'

/** Sends `pricing_viewed` once, the first time the plans are on screen. */
export function PricingSeen() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trackEvent('pricing_viewed')
          seen.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    seen.observe(el)
    return () => seen.disconnect()
  }, [])
  return <span ref={ref} hidden />
}
