import { describe, expect, it } from 'vitest'
import { beaconBody } from '@/lib/marketing/beacon'
import { referrerHost } from '@/lib/marketing/utm'

describe('site beacon (D-91)', () => {
  it('sends a referring host, never the referring URL', () => {
    expect(referrerHost('https://www.google.no/search?q=arbeidsmilj%C3%B8&email=x@y.no', 'www.orgpuls.com')).toBe('www.google.no')
  })

  it('drops the site itself and anything that is not a URL', () => {
    expect(referrerHost('https://www.orgpuls.com/priser', 'www.orgpuls.com')).toBeUndefined()
    expect(referrerHost('', 'www.orgpuls.com')).toBeUndefined()
    expect(referrerHost('not a url', 'www.orgpuls.com')).toBeUndefined()
  })

  it('carries only kind, path, host, tags and label', () => {
    const body = beaconBody('cta', '/lovkrav', 'https://kvasir.no/', 'www.orgpuls.com', { utm_source: 'google' }, 'kom-i-gang')
    expect(body).toEqual({ k: 'cta', p: '/lovkrav', r: 'kvasir.no', u: { utm_source: 'google' }, l: 'kom-i-gang' })
    expect(Object.keys(beaconBody('view', '/', '', 'www.orgpuls.com', {}))).toEqual(['k', 'p'])
  })
})
