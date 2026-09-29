import { describe, expect, it } from 'vitest'
import { approvedLineByLine, docKey, lineDiff } from '@/lib/legal/documents'

describe('legal documents (X-096)', () => {
  it('puts an industry page, a module or a section of site, product or message texts in one document; the documents stay their own', () => {
    const u = (key: string, section: string, lang = 'no') => ({ key, section, lang }) as never
    expect(docKey(u('industry:handel:no:law:aml-4-3', 'industries'))).toBe('industry:handel:no')
    expect(docKey(u('industry:handel:en:claims', 'industries', 'en'))).toBe('industry:handel:en')
    expect(docKey(u('module:handel:no:f1', 'modules'))).toBe('module:handel:no')
    expect(docKey(u('msg:no:doc.privacy', 'documents'))).toBe('msg:no:doc.privacy')
    expect(docKey(u('msg:en:lp.lovkrav', 'site', 'en'))).toBe('group:en:site')
    expect(docKey(u('db:no:crm_template:velkommen', 'messages'))).toBe('group:no:messages')
  })

  it('shows what changed line by line, keeping what did not', () => {
    const d = lineDiff('a\nb\nc', 'a\nB\nc\nd')
    expect(d).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ])
    expect(lineDiff('x', 'x')).toEqual([{ kind: 'same', text: 'x' }])
  })

  it('counts a document as reviewed under the old line-by-line approvals only when every line is', () => {
    const doc = { units: [{ key: 'u1', hash: 'h1' }, { key: 'u2', hash: 'h2' }] } as never
    expect(approvedLineByLine(doc, new Map([['u1', 'h1'], ['u2', 'h2']]))).toBe(true)
    expect(approvedLineByLine(doc, new Map([['u1', 'h1'], ['u2', 'old']]))).toBe(false)
    expect(approvedLineByLine(doc, new Map([['u1', 'h1']]))).toBe(false)
  })
})
