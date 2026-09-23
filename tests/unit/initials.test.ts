import { describe, expect, it } from 'vitest'
import { initialsOf } from '@/lib/shell/initials'

describe('initialsOf — the account chip, from the viewer\'s own profile', () => {
  it('first and last name', () => {
    expect(initialsOf('Tuva Berg')).toBe('TB')
    expect(initialsOf('Bjørn Vidar Haug')).toBe('BH')
  })
  it('one name, one letter; Norwegian letters kept', () => {
    expect(initialsOf('Demobruker')).toBe('D')
    expect(initialsOf('øyvind ås')).toBe('ØÅ')
  })
  it('no name is no letters, never a placeholder', () => {
    expect(initialsOf(null)).toBeNull()
    expect(initialsOf('   ')).toBeNull()
  })
})
