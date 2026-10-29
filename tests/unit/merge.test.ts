import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mergeMessages, type Tree } from '@/lib/i18n/merge'
import { mergeMessages as scriptMerge } from '@/scripts/lib/merge.mjs'
import { mergeTree as mailMerge } from '@/supabase/functions/_shared/mail'

/**
 * One rule for laying a catalogue over another (lib/i18n/merge.ts): the request config's, the
 * scripts' (scripts/lib/merge.mjs) and the mail's (supabase/functions/_shared/mail.ts mergeTree).
 */
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Tree

describe('laying one catalogue over another', () => {
  const lower = { a: 'A', list: ['one', 'two', 'three'], cards: [{ t: 'T1', b: 'B1' }, { t: 'T2', b: 'B2' }], deep: { x: 'X', y: 'Y' } }

  it('takes what the upper one leaves out, or holds as null, from the lower one', () => {
    expect(mergeMessages(lower, { deep: { y: 'y' } })).toEqual({ ...lower, deep: { x: 'X', y: 'y' } })
    expect(mergeMessages(lower, { a: null })).toEqual(lower)
  })

  it('merges a list of the same length item by item, null keeping the lower item', () => {
    expect(mergeMessages(lower, { list: [null, 'deux', null] }).list).toEqual(['one', 'deux', 'three'])
    expect(mergeMessages(lower, { cards: [null, { b: 'b2' }] }).cards).toEqual([{ t: 'T1', b: 'B1' }, { t: 'T2', b: 'b2' }])
  })

  it('takes a list of another length whole: a market with a bullet more or fewer', () => {
    expect(mergeMessages(lower, { list: ['only'] }).list).toEqual(['only'])
  })

  it('is the same rule in the scripts and in the mail, on every pack there is', () => {
    const en = read('messages/en.json')
    for (const market of readdirSync('messages/market'))
      for (const file of readdirSync(`messages/market/${market}`)) {
        const base = file === 'en.json' ? en : mergeMessages(en, read(`messages/${file}`))
        const pack = read(`messages/market/${market}/${file}`)
        const app = mergeMessages(base, pack)
        expect(scriptMerge(base, pack), `${market}/${file}`).toEqual(app)
        expect(mailMerge(base, pack), `${market}/${file}`).toEqual(app)
      }
  })
})
