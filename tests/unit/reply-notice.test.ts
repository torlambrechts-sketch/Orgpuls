import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import {
  noticeLang,
  renderReplyNotice,
  replyNoticeSms,
  threadLink,
  type MailCatalogue,
  type ReplyNoticeJob,
} from '@/supabase/functions/_shared/mail'

/**
 * The notice to a person who asked to be told when management answers their comment (0204,
 * X-103). The database's side — who may be asked, the seal, the queue, forgetting — is
 * supabase/tests/reply_notice_invariants.sql.
 */
const KEY = '0123456789abcdef'.repeat(4)
const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
const job = (over: Partial<ReplyNoticeJob> = {}): ReplyNoticeJob => ({
  id: 'n1',
  reason: 'svar',
  channel: 'email',
  email: 'p@example.com',
  phone: null,
  lang: 'no',
  org: 'Nordvik AS',
  key: KEY,
  ...over,
})

describe('the conversation link', () => {
  it('carries the key in the fragment, and only a well-formed key', () => {
    expect(threadLink('https://app.orgpuls.com/', KEY)).toBe(`https://app.orgpuls.com/s/samtale#${KEY}`)
    expect(() => threadLink('https://app.orgpuls.com', KEY.slice(1))).toThrow()
    expect(() => threadLink('https://app.orgpuls.com', `${KEY.slice(0, 63)}G`)).toThrow()
  })
})

describe('the notice', () => {
  it('says that an answer came and links the conversation as text, never as a tracked link', () => {
    const r = renderReplyNotice(cat, job(), 'https://app.orgpuls.com')
    expect(r.subject).toBe(no.mail.svarvarsel.subject)
    expect(r.text).toContain('Ledelsen i Nordvik AS har svart')
    expect(r.text).toContain(`/s/samtale#${KEY}`)
    expect(r.html).not.toContain(`href="https://app.orgpuls.com/s/samtale#${KEY}"`)
    expect(r.text).toContain(no.mail.svarvarsel.why)
  })

  it('says a leader would like to talk when that is why it was sent', () => {
    const r = renderReplyNotice(cat, job({ reason: 'kontakt' }), 'https://app.orgpuls.com')
    expect(r.text).toContain('vil gjerne snakke med deg direkte')
  })

  it('is in English for an English speaker, and in bokmål for a language without its texts', () => {
    expect(renderReplyNotice(cat, job({ lang: 'en' }), 'https://app.orgpuls.com').subject).toBe(en.mail.svarvarsel.subject)
    expect(noticeLang(cat, 'pl')).toBe('no')
    expect(noticeLang({ ...cat, pl: { svarvarsel: { subject: 'Nowa wiadomość' } } } as MailCatalogue, 'pl')).toBe('pl')
  })

  it('by SMS: the organisation and one line, the link after it', () => {
    expect(replyNoticeSms(cat, job({ channel: 'sms' }))).toBe('Nordvik AS: Ledelsen har svart i samtalen din. Les her:')
    expect(replyNoticeSms(cat, job({ channel: 'sms', reason: 'kontakt' }))).toContain('snakke med deg')
  })
})
