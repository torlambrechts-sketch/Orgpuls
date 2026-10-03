import { describe, expect, it } from 'vitest'
import { ruleState, ruleValueFromForm, UNRESTRICTED } from '@/lib/admin/crmRuleValue'

describe('CRM rule form value (0192)', () => {
  it('passes a choice through and refuses an empty one', () => {
    expect(ruleValueFromForm('choice', 'source_and_basis', false, '')).toBe('source_and_basis')
    expect(ruleValueFromForm('choice', '', false, '')).toBeUndefined()
  })
  it('reads «unlimited» as null whatever the number field says', () => {
    expect(ruleValueFromForm('limit', '', true, '')).toBeNull()
    expect(ruleValueFromForm('limit', '', true, '25')).toBeNull()
  })
  it('takes a whole number of 1 or more, and nothing else', () => {
    expect(ruleValueFromForm('limit', '', false, '25')).toBe(25)
    expect(ruleValueFromForm('limit', '', false, '0')).toBeUndefined()
    expect(ruleValueFromForm('limit', '', false, '')).toBeUndefined()
    expect(ruleValueFromForm('limit', '', false, '2.5')).toBeUndefined()
    expect(ruleValueFromForm('limit', '', false, '-3')).toBeUndefined()
    expect(ruleValueFromForm('limit', '', false, '1234567890')).toBeUndefined()
  })
})

describe('CRM rule state for the forms (0192)', () => {
  it('asks for nothing with the defaults', () => {
    const defaults = [
      { key: 'contact_rule', value: 'none' },
      { key: 'typed_reason', value: 'off' },
      { key: 'limit_campaign_blocks', value: null },
    ]
    expect(ruleState(false, defaults)).toEqual(UNRESTRICTED)
  })
  it('follows each rule once it is switched on', () => {
    expect(ruleState(true, [{ key: 'contact_rule', value: 'source_and_basis' }])).toMatchObject({ reasonRequired: true, consentRequired: true, optInOnly: false })
    expect(ruleState(false, [{ key: 'contact_rule', value: 'opt_in_only' }])).toMatchObject({ consentRequired: false, optInOnly: true })
    expect(ruleState(false, [{ key: 'limit_campaign_blocks', value: 12 }]).maxBlocks).toBe(12)
  })
})
