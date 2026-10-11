import { track } from '@vercel/analytics'
import { sendBeacon } from './beacon'
import { currentUtm } from './utm'

/**
 * The public site's three conversion events. They go to Vercel Web Analytics, the same
 * first-party, cookieless analytics the site already loads (components/shell/SiteAnalytics),
 * so nothing new is loaded and there is nothing to ask consent for.
 *
 * The same event goes to the site's own counting in Sentral (lib/marketing/beacon, D-248), where
 * Vekst › Analytics draws the funnel from it.
 *
 * An event says which page it happened on and which campaign brought the visit, never who:
 * no organisation number, no name, no address.
 */
export type SiteEvent = 'signup_started' | 'signup_completed' | 'pricing_viewed'

export function trackEvent(name: SiteEvent): void {
  track(name, { page: window.location.pathname, ...currentUtm() })
  sendBeacon({ k: 'event', e: name })
}

/**
 * Where the signup form was left (D-277): the step reached and the error met, as codes the form itself
 * chooses (`step2_shown`, `lookup_not_found`). They go to Sentral only, which counts them per visit and shows
 * each attempt's steps; a value that is not a code (anything typed) is never sent.
 */
export type FormEvent = 'signup_step' | 'signup_error' | 'persona_click'

export function trackForm(name: FormEvent, code: string): void {
  sendBeacon({ k: 'form', e: name, l: code.toLowerCase().slice(0, 40) })
}
