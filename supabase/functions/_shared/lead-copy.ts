/**
 * The e-mail copy of a lead (0209, D-242): what the person gave, as the platform event carries it, to
 * the address in ORGPULS_LEAD_COPY_TO. Reply-To is the person, so answering the copy answers them. A copy
 * for the owner's mailbox, in Norwegian; the platform remains where leads are worked.
 */
export type LeadEvent = { id: number; kind: string; payload: Record<string, unknown>; created_at: string }

const KIND: Record<string, string> = {
  'contact.submitted': 'Ny melding fra kontaktskjemaet',
  'demo.requested': 'Ny demoforespørsel',
  'template.requested': 'Ny nedlasting av gratis mal',
}

const LABEL: Record<string, string> = {
  name: 'Navn',
  email: 'E-post',
  organisation: 'Virksomhet',
  company: 'Virksomhet',
  role: 'Rolle',
  topic: 'Emne',
  template: 'Mal',
  consent: 'Samtykke til e-post fra oss',
  lang: 'Språk',
  message: 'Melding',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const value = (v: unknown) => (typeof v === 'boolean' ? (v ? 'ja' : 'nei') : String(v))
const isAddress = (s: unknown): s is string => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 254

export function renderLeadCopy(lead: LeadEvent) {
  const p = lead.payload ?? {}
  const what = KIND[lead.kind] ?? lead.kind
  const who = typeof p.name === 'string' && p.name ? p.name : typeof p.email === 'string' ? p.email : ''
  const subject = `${what}${p.template ? `: ${value(p.template)}` : ''}${who ? ` – ${who}` : ''}`
  const when = new Date(lead.created_at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'long', timeStyle: 'short' })
  const rows = Object.entries(p)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => [LABEL[k] ?? k, value(v)] as const)
  const note = 'Kopi for sikkerhets skyld. Henvendelsen er også sendt til plattformen. Svarer du på denne e-posten, går svaret til avsenderen.'
  const text = [what, when, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', note].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#191510">
<p style="margin:0 0 4px;font-size:16px;font-weight:bold">${esc(what)}</p>
<p style="margin:0 0 16px;color:#5F5849">${esc(when)}</p>
<table cellpadding="6" style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="vertical-align:top;color:#5F5849;white-space:nowrap">${esc(k)}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join('')}</table>
<p style="margin:16px 0 0;font-size:12px;color:#5F5849">${esc(note)}</p></div>`
  return { subject, text, html, replyTo: isAddress(p.email) ? { email: p.email, name: typeof p.name === 'string' ? p.name : undefined } : undefined }
}
