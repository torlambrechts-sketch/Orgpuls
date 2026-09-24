import { describe, expect, it } from 'vitest'
import { displayPhone, normalizePhone, smsContent, smsLength } from '@/supabase/functions/_shared/sms'

describe('normalizePhone', () => {
  it('reads Norwegian mobiles the ways people type them', () => {
    for (const input of ['91234567', '912 34 567', '+47 912 34 567', '0047 91234567', '47 91 23 45 67', '(+47) 912-34-567']) {
      expect(normalizePhone(input), input).toBe('+4791234567')
    }
    expect(normalizePhone('41234567')).toBe('+4741234567')
  })

  it('refuses what cannot receive an SMS rather than guessing', () => {
    // a landline, a short number, letters, an eight-digit number that is not a mobile range
    for (const input of ['22000000', '+4722000000', '1234', 'ring meg', '51234567', '', null, undefined]) {
      expect(normalizePhone(input), String(input)).toBeNull()
    }
  })

  it('keeps an international number in E.164', () => {
    expect(normalizePhone('+46 70 123 45 67')).toBe('+46701234567')
    expect(normalizePhone('0046701234567')).toBe('+46701234567')
  })

  it('shows a Norwegian number the way Norwegians write it', () => {
    expect(displayPhone('+4791234567')).toBe('912 34 567')
    expect(displayPhone('+46701234567')).toBe('+46701234567')
  })
})

describe('smsLength', () => {
  it('counts æøå as ordinary characters, as GSM-7 does', () => {
    expect(smsLength('Hei! Svar på undersøkelsen, blåbærsyltetøy.')).toMatchObject({ unicode: false, parts: 1 })
  })

  it('bills 160, then 153 per part', () => {
    expect(smsLength('a'.repeat(160)).parts).toBe(1)
    expect(smsLength('a'.repeat(161)).parts).toBe(2)
    expect(smsLength('a'.repeat(306)).parts).toBe(2)
    expect(smsLength('a'.repeat(307)).parts).toBe(3)
  })

  it('counts an extended character twice', () => {
    expect(smsLength('€').chars).toBe(2)
  })

  it('switches to unicode for an emoji, and bills 70 per message', () => {
    const r = smsLength('Hei 👋')
    expect(r.unicode).toBe(true)
    expect(smsLength('😀'.repeat(71)).parts).toBe(2)
  })

  it('puts the link after the text, with one space', () => {
    expect(smsContent('Hei! Svar her: ', 'https://x/s/1')).toBe('Hei! Svar her: https://x/s/1')
    expect(smsContent('   ', 'https://x/s/1')).toBe('https://x/s/1')
  })

  it('makes the default Norwegian invitation two billed messages with the real link', () => {
    const link = `https://www.orgpuls.com/s/${'a'.repeat(64)}`
    const text = 'Hei! Nordvik Anlegg AS spør hvordan du har det på jobb. Svaret er helt anonymt:'
    expect(smsLength(smsContent(text, link)).parts).toBe(2)
  })
})
