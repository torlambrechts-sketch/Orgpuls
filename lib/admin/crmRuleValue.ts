/**
 * Pure helpers for the CRM rule settings (0192, D-208), shared by the server action and the reader and
 * tested on their own (tests/unit/crm-rules.test.ts).
 */
export type RuleValue = string | number | null

/** A rule form's fields as the value admin_crm_rule_set takes; undefined when the form is not valid. */
export function ruleValueFromForm(kind: 'choice' | 'limit', choice: string, unlimited: boolean, limit: string): RuleValue | undefined {
  if (kind === 'choice') return choice ? choice : undefined
  if (unlimited) return null
  if (!/^[0-9]{1,9}$/.test(limit)) return undefined
  const n = Number(limit)
  return n >= 1 ? n : undefined
}

export type RuleRow = { key: string; value: RuleValue }
export type CrmRuleState = { reasonRequired: boolean; consentRequired: boolean; optInOnly: boolean; maxBlocks: number | null }
export const UNRESTRICTED: CrmRuleState = { reasonRequired: false, consentRequired: false, optInOnly: false, maxBlocks: null }

/** What the forms should ask for, from the rules in force. */
export function ruleState(reasonRequired: boolean, rules: RuleRow[]): CrmRuleState {
  const value = (key: string) => rules.find((x) => x.key === key)?.value ?? null
  const blocks = value('limit_campaign_blocks')
  return {
    reasonRequired,
    consentRequired: value('contact_rule') === 'source_and_basis',
    optInOnly: value('contact_rule') === 'opt_in_only',
    maxBlocks: typeof blocks === 'number' ? blocks : null,
  }
}
