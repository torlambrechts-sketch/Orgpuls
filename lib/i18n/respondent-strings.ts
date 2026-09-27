import { createHash } from 'node:crypto'

/**
 * The respondent pages' strings in one language, as scripts/i18n/respondent-ui.mjs defines them
 * (the `respond` namespace, and the factor and extra labels printed above a question), and
 * their hash. The admin's English approval (D-130) shows these strings and approves this hash;
 * tests/unit/legal-registry.test.ts holds it equal to lib/i18n/respondent-ui.json, so the page
 * cannot show one set of strings and approve another.
 */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

const sorted = (v: Json): Json =>
  Array.isArray(v)
    ? v.map(sorted)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, Json>)[k]!)]))
      : v

export function respondentStrings(messages: Record<string, unknown>): Json {
  const labels = (ns: string) =>
    Object.fromEntries(
      Object.entries((messages[ns] ?? {}) as Record<string, { label?: string } | undefined>).map(([k, v]) => [k, v?.label ?? null]),
    )
  return sorted({ respond: (messages.respond ?? null) as Json, factor: labels('factor'), extra: labels('extra') })
}

export const respondentHash = (messages: Record<string, unknown>) =>
  createHash('sha256').update(JSON.stringify(respondentStrings(messages))).digest('hex')

/** The strings as lines, for reading: every leaf under its path */
export function respondentLines(messages: Record<string, unknown>): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const walk = (v: Json, path: string) => {
    if (typeof v === 'string') out.push({ path, text: v })
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k)
  }
  walk(respondentStrings(messages), '')
  return out
}
