/**
 * The industries Orgpuls has a page (and perhaps a module) for: what is not words. The page
 * copy is in content/industries/<slug>.ts; the module's wording is in modules/<key>/v*.json.
 *
 * `naceCodePrefixes` decides when Måleoppsett suggests the module: an organisation whose
 * industry code from Brønnøysund (`naeringskode1.kode`, organizations.registry_nace_code)
 * starts with one of them. Adding an industry is an entry here, never a change in code.
 */
export type IndustryMeta = {
  slug: 'bygg-og-anlegg' | 'helse-og-omsorg'
  naceCodePrefixes: string[]
  /** the module this industry's organisations are offered; its latest published version is used */
  moduleKey?: string
  /** the words the suggestion needs, in each UI language */
  label: { no: string; en: string }
  moduleLabel?: { no: string; en: string }
}

export const INDUSTRY_META: IndustryMeta[] = [
  {
    slug: 'bygg-og-anlegg',
    naceCodePrefixes: ['41', '42', '43'],
    moduleKey: 'bygg-og-anlegg',
    label: { no: 'bygg og anlegg', en: 'construction' },
    moduleLabel: { no: 'bygg-modulen', en: 'the construction module' },
  },
  {
    slug: 'helse-og-omsorg',
    naceCodePrefixes: ['86', '87', '88'],
    moduleKey: 'helse-og-omsorg',
    label: { no: 'helse og omsorg', en: 'health and care' },
    moduleLabel: { no: 'helse-modulen', en: 'the health and care module' },
  },
]

/** The industry an organisation's code belongs to, if any. */
export function industryForNace(code: string | null | undefined): IndustryMeta | null {
  if (!code) return null
  const digits = code.replace(/\D/g, '')
  return INDUSTRY_META.find((i) => i.naceCodePrefixes.some((p) => digits.startsWith(p))) ?? null
}
