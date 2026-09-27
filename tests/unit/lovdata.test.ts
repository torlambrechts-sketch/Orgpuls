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

  it('links the regulation named in English, and chapter 1A wherever it is named', () => {
    expect(lovdataHref('Regulation § 1A-2')).toBe('https://lovdata.no/forskrift/2011-12-06-1357/%C2%A71A-2')
    expect(lovdataHref('The regulations § 1A-1')).toBe('https://lovdata.no/forskrift/2011-12-06-1357/%C2%A71A-1')
    expect(lovdataHref('§ 1A-3')).toBe('https://lovdata.no/forskrift/2011-12-06-1357/%C2%A71A-3')
  })

  it('links no other act or regulation to the Working Environment Act', () => {
    expect(lovdataHref('Forskrift om organisering § 13-1')).toBeNull()
    expect(lovdataHref('Opplæringsloven § 13-3')).toBeNull()
    expect(lovdataHref('Likestillings- og diskrimineringsloven § 13-1')).toBeNull()
  })

  it('links nothing it cannot read', () => {
    expect(lovdataHref('Arbeidstilsynet')).toBeNull()
  })
})
