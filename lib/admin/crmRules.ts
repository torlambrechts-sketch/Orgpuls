import 'server-only'
import { z } from 'zod'
import { call, isError } from './api'
import { ruleState, UNRESTRICTED, type CrmRuleState } from './crmRuleValue'

export type { CrmRuleState }

/**
 * The CRM rule settings (0192, D-208; docs/crm-enrichment INSTRUCTIONS.md R5, A9): every limit and rule
 * that can stop a CRM action, its value, its default and the last change. The database applies them;
 * the screens read them only to say beforehand what the database will ask for.
 */
// JSON numbers arrive as numbers; a coerced number would turn null (unlimited) into 0
const Value = z.union([z.string(), z.number(), z.null()])

export const RULE_AREAS = ['contacts', 'audit', 'limits'] as const

const Rule = z.object({
  key: z.string(),
  area: z.enum(RULE_AREAS),
  kind: z.enum(['choice', 'limit']),
  options: z.array(z.string()).nullable(),
  default: Value,
  value: Value,
  is_default: z.boolean(),
  applies_to: z.array(z.string()),
  changed_at: z.string().nullable(),
  changed_by: z.string().nullable(),
})
export type CrmRule = z.infer<typeof Rule>

const Rules = z.object({ may_change: z.boolean(), reason_required: z.boolean(), rules: z.array(Rule) })
export type CrmRules = z.infer<typeof Rules>

export const crmRules = () => call('admin_crm_rules', {}, Rules)

/** What a form should ask for. A refused read falls back to the defaults: the database still decides. */
export async function crmRuleState(): Promise<CrmRuleState> {
  const r = await crmRules()
  return isError(r) ? UNRESTRICTED : ruleState(r.reason_required, r.rules)
}
