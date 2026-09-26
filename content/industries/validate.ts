import no from '@/messages/no.json'
import { INDUSTRIES } from './index'
import { moduleFile } from './modules'
import type { IndustryPage } from './types'

/**
 * What the build refuses (§ B2): a statement code the module file does not have, a core
 * statement that is not the instrument's, a {{cite:key}} with no source, an example that names
 * a factor or suggestion the module lacks — and a page launched before every law item on it has
 * been checked against Lovdata and Arbeidstilsynet. Called from the routes' generateStaticParams,
 * so `next build` fails, and from a unit test, so CI says which.
 */
const CITE = /\{\{cite:([a-z0-9_]+)\}\}/g

export function problemsOf(page: IndustryPage): string[] {
  const out: string[] = []
  const mod = page.module ? moduleFile(page.module.key, page.module.version) : null
  const codes = new Set(mod?.factors.flatMap((f) => f.items.map((i) => i.id)) ?? [])
  const factorKeys = new Set(mod?.factors.map((f) => f.id) ?? [])
  const sources = new Set([...(mod?.sources.map((s) => s.key) ?? []), ...(page.extraSources?.map((s) => s.key) ?? [])])
  const core = (no as unknown as { factor: Record<string, Record<string, string>> }).factor

  const cites = (text: string, where: string) => {
    for (const m of text.matchAll(CITE)) if (!sources.has(m[1] ?? '')) out.push(`${where}: no source "${m[1]}"`)
  }

  page.challenges.forEach((c, i) => {
    cites(c.body, `challenge ${i + 1}`)
    if (c.measuredBy.kind === 'module') {
      if (!mod) out.push(`challenge ${i + 1}: a module statement on a page without a module`)
      else if (!codes.has(c.measuredBy.itemCode)) out.push(`challenge ${i + 1}: no item ${c.measuredBy.itemCode} in the module`)
    } else if (!core[c.measuredBy.factorKey]?.[`s${c.measuredBy.ordinal}`]) {
      out.push(`challenge ${i + 1}: no core statement ${c.measuredBy.factorKey}.s${c.measuredBy.ordinal}`)
    }
  })
  if (page.moduleOverview) cites(page.moduleOverview.intro, 'module overview')
  for (const r of page.hero.preview?.rows ?? []) {
    if (!factorKeys.has(r.factorKey)) out.push(`preview: no factor ${r.factorKey}`)
    if (r.values.length !== page.hero.preview?.columns.length) out.push(`preview: ${r.factorKey} has the wrong number of values`)
  }
  if (page.loop) {
    const f = mod?.factors.find((x) => x.id === page.loop?.example.factorKey)
    if (!f) out.push(`loop: no factor ${page.loop.example.factorKey}`)
    else if (!f.action_suggestions.some((a) => a.type === page.loop?.example.actionType)) out.push('loop: no such suggestion')
  }
  if (mod && page.module && mod.version !== page.module.version) out.push('module version differs from the file')
  if (page.launched) {
    const open = page.law.items.filter((l) => !l.reviewed).map((l) => l.ref)
    if (open.length) out.push(`launched with law items not reviewed: ${open.join('; ')}`)
  }
  return out
}

export function assertIndustries(): void {
  const all = INDUSTRIES.flatMap((i) => (i.page ? problemsOf(i.page).map((p) => `${i.slug}: ${p}`) : []))
  if (all.length) throw new Error(`industry pages are not valid:\n  ${all.join('\n  ')}`)
}
