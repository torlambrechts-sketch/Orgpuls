import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOCALE_REGISTRY, LOCALES, TRANSLATION_LOCALES, bcp47 } from '@/lib/i18n/locales'
import { RESPONDENT_LOCALES } from '@/lib/i18n/offered'

/**
 * The database keeps its own lists of languages, in check constraints and function bodies
 * (0001, 0079, 0082, 0084, 0085). Adding a language to lib/i18n/locales.ts without a migration
 * widening them would let the app offer what the database refuses to store — or the reverse.
 * This reads the latest definition of each from supabase/migrations and holds it to the registry.
 */
const DIR = 'supabase/migrations'
const migrations = readdirSync(DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort()
  .map((f) => ({ file: f, sql: readFileSync(`${DIR}/${f}`, 'utf8') }))

/** the latest migration's definition that `head` starts, up to its end (a function's `$fn$;`, a table's `);`) */
function latest(head: RegExp): { file: string; body: string } {
  for (const m of [...migrations].reverse()) {
    const at = m.sql.search(head)
    if (at < 0) continue
    const rest = m.sql.slice(at)
    const end = rest.search(/\$fn\$;|\n\);/)
    return { file: m.file, body: end < 0 ? rest : rest.slice(0, end) }
  }
  throw new Error(`no migration defines ${head}`)
}

const codes = (list: string) => [...list.matchAll(/'([a-z]{2,3})'/g)].map((x) => x[1]).sort()
const listIn = (body: string, re: RegExp) => {
  const m = re.exec(body)
  if (!m) throw new Error(`no list for ${re}`)
  return codes(m[1]!)
}

const survey = [...RESPONDENT_LOCALES].sort()
const translated = [...TRANSLATION_LOCALES].sort()

describe('the locale registry', () => {
  it('is one entry per code, bokmål the source and a platform and survey language', () => {
    expect(new Set(LOCALE_REGISTRY.map((l) => l.code)).size).toBe(LOCALE_REGISTRY.length)
    expect(LOCALES[0]).toBe('no')
    expect(survey).toContain('no')
    expect(translated).not.toContain('no')
    expect(bcp47('no')).toBe('nb')
    expect(bcp47('en')).toBe('en')
  })

  it('falls back only to platform languages, never to itself', () => {
    for (const l of LOCALE_REGISTRY) {
      for (const f of l.fallback) {
        expect(f).not.toBe(l.code)
        expect(LOCALES as readonly string[]).toContain(f)
      }
    }
  })
})

describe('the database’s language lists match the registry', () => {
  const cases: [string, RegExp, RegExp, string[]][] = [
    ['organizations.default_lang', /create table app\.organizations/, /default_lang[^\n]*check \(default_lang in \(([^)]*)\)\)/, [...LOCALES].sort()],
    ['employees.language', /add column language text check/, /language in \(([^)]*)\)/, survey],
    ['item_translations.locale', /create table app\.item_translations/, /\blocale\s+text not null check \(locale in \(([^)]*)\)\)/, translated],
    ['ui_translation_approvals.locale', /create table app\.ui_translation_approvals/, /\blocale\s+text not null check \(locale in \(([^)]*)\)\)/, translated],
    ['locale_pilots.locale', /create table app\.locale_pilots/, /\blocale\s+text not null check \(locale in \(([^)]*)\)\)/, translated],
    ['round_locale_state', /create (or replace )?function app\.round_locale_state/, /from \(values ((?:\('[a-z]+'\)(?:, )?)+)\)/, translated],
    ['admin_translations_approve', /create (or replace )?function public\.admin_translations_approve/, /not in \(([^)]*)\)/, translated],
    ['approve_ui_translation', /create (or replace )?function public\.approve_ui_translation/, /not in \(([^)]*)\)/, translated],
    ['admin_locale_pilot', /create (or replace )?function public\.admin_locale_pilot\(/, /not in \(([^)]*)\)/, translated],
  ]
  for (const [name, head, list, want] of cases) {
    it(name, () => {
      const { file, body } = latest(head)
      expect(listIn(body, list), `${name} in ${file}`).toEqual(want)
    })
  }
})
