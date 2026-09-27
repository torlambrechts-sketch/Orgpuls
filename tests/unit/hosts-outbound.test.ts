import { describe, expect, it } from 'vitest'
import { outboundBase } from '@/lib/hosts'

// a link that leaves the browser carries a host that works for whoever receives it
describe('outboundBase', () => {
  it('keeps a production host, over https', () => {
    expect(outboundBase('www.orgpuls.com', 'https')).toBe('https://www.orgpuls.com')
    expect(outboundBase('orgpuls.com', 'http')).toBe('https://www.orgpuls.com')
    expect(outboundBase('en.orgpuls.com', null)).toBe('https://en.orgpuls.com')
    expect(outboundBase('WWW.ORGPULS.COM:443', 'https')).toBe('https://www.orgpuls.com')
  })
  it('keeps a loopback host with its port, for local and QA runs', () => {
    expect(outboundBase('localhost:3100', 'http')).toBe('http://localhost:3100')
    expect(outboundBase('127.0.0.1:3000', null)).toBe('http://127.0.0.1:3000')
    expect(outboundBase('[::1]:3000', null)).toBe('http://[::1]:3000')
  })
  it('never prints a preview, a proxy or a spoofed host', () => {
    expect(outboundBase('orgpuls-git-main-tor.vercel.app', 'https')).toBe('https://www.orgpuls.com')
    expect(outboundBase('evil.example', 'https')).toBe('https://www.orgpuls.com')
    expect(outboundBase('localhost.evil.example', 'http')).toBe('https://www.orgpuls.com')
    expect(outboundBase('www.orgpuls.com.evil.example', 'https')).toBe('https://www.orgpuls.com')
    expect(outboundBase(null, null)).toBe('https://www.orgpuls.com')
    expect(outboundBase('evil.example, www.orgpuls.com', 'https')).toBe('https://www.orgpuls.com')
  })
})
