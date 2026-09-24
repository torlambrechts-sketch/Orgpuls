import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { PLAYBOOK, PLAYBOOK_KINDS, playbookEntry, playbookFor } from '@/lib/playbook/registry'

/**
 * The registry and the messages are two halves of one thing; this holds them together.
 * A suggestion whose words are missing in either language would render as a bare key,
 * and a `watch` pointing past the factor's statements would print nothing to follow.
 */
const FACTORS = Object.keys(no.factor) as Array<keyof typeof no.factor>

const pick = (m: object, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), m)

describe('the playbook registry', () => {
  it('gives every factor exactly three suggestions, and no other factor any', () => {
    for (const f of FACTORS) expect(playbookFor(f).map((e) => e.n)).toEqual([1, 2, 3])
    expect(PLAYBOOK).toHaveLength(FACTORS.length * 3)
    expect(new Set(PLAYBOOK.map((e) => e.factorKey))).toEqual(new Set(FACTORS))
  })

  it('names each suggestion once, in the shape the database checks', () => {
    const keys = PLAYBOOK.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^[a-z]+\.[1-3]$/)
    expect(playbookEntry('ytring.1')?.factorKey).toBe('ytring')
    expect(playbookEntry('ytring.4')).toBeNull()
    expect(playbookEntry('nothing.1')).toBeNull()
  })

  it('follows up on a statement the factor actually has, in both languages', () => {
    for (const e of PLAYBOOK) {
      for (const m of [no, en]) {
        expect(pick(m, `factor.${e.factorKey}.s${e.watch}`), `${e.key} watch`).toBeTypeOf('string')
      }
    }
  })

  it('has words for every suggestion, its kind and its evidence, in both languages', () => {
    for (const m of [no, en]) {
      for (const k of PLAYBOOK_KINDS) expect(pick(m, `playbook.kind.${k}`)).toBeTypeOf('string')
      for (const e of PLAYBOOK) {
        expect(pick(m, `playbook.${e.factorKey}.ev`), `${e.factorKey} ev`).toBeTypeOf('string')
        for (const field of ['title', 'time', 'how']) {
          expect(pick(m, `playbook.${e.factorKey}.m${e.n}.${field}`), `${e.key} ${field}`).toBeTypeOf('string')
        }
      }
    }
  })
})
