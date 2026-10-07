import { describe, expect, it } from 'vitest'
import { renderLeadCopy } from '@/supabase/functions/_shared/lead-copy'

/** The e-mail copy of a lead (0209, D-242): every field the person gave, escaped, answered to them. */
describe('lead copy', () => {
  it('says what came in, from whom, with every field and Reply-To the person', () => {
    const m = renderLeadCopy({
      id: 1,
      kind: 'template.requested',
      payload: { template: 'tiltaksbank', name: 'Kari <b>', email: 'kari@firma.no', organisation: 'Firma AS', consent: false, lang: 'no' },
      created_at: '2026-10-07T11:07:52Z',
    })
    expect(m.subject).toBe('Ny nedlasting av gratis mal: tiltaksbank – Kari <b>')
    expect(m.text).toContain('Samtykke til e-post fra oss: nei')
    expect(m.text).toContain('Virksomhet: Firma AS')
    expect(m.html).toContain('Kari &lt;b&gt;')
    expect(m.html).not.toContain('<b>')
    expect(m.replyTo).toEqual({ email: 'kari@firma.no', name: 'Kari <b>' })
  })

  it('names a contact message and a demo request, and has no Reply-To without a valid address', () => {
    expect(renderLeadCopy({ id: 2, kind: 'contact.submitted', payload: { name: 'Ola', email: 'x' }, created_at: '2026-10-07T10:00:00Z' }).replyTo).toBeUndefined()
    expect(renderLeadCopy({ id: 3, kind: 'demo.requested', payload: { email: 'siri@firma.no' }, created_at: '2026-10-07T10:00:00Z' }).subject).toBe(
      'Ny demoforespørsel – siri@firma.no',
    )
  })
})
