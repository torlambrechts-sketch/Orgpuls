import { describe, expect, it } from 'vitest'
import { lovdataHref } from '@/lib/marketing/lovdata'

describe('lovdataHref', () => {
  it('links a paragraph of the Working Environment Act', () => {
    expect(lovdataHref('AML § 4-3')).toBe('https://lovdata.no/lov/2005-06-17-62/%C2%A74-3')
    expect(lovdataHref('§ 9-2')).toBe('https://lovdata.no/lov/2005-06-17-62/%C2%A79-2')
  })

  it('links the paragraph, not the subsection or letter', () => {
    expect(lovdataHref('AML § 3-1 (2) c')).toBe('https://lovdata.no/lov/2005-06-17-62/%C2%A73-1')
    expect(lovdataHref('§ 3-1 c')).toBe('https://lovdata.no/lov/2005-06-17-62/%C2%A73-1')
  })

  it('links chapter 1A of the regulation', () => {
    expect(lovdataHref('Forskriften § 1A-2')).toBe('https://lovdata.no/forskrift/2011-12-06-1357/%C2%A71A-2')
  })

  it('links nothing it cannot read', () => {
    expect(lovdataHref('Arbeidstilsynet')).toBeNull()
  })
})
