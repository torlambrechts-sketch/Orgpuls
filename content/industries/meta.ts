/**
 * The industries Orgpuls has a page (and perhaps a module) for: what is not words. The page
 * copy is in content/industries/<slug>.ts; the module's wording is in modules/<key>/v*.json.
 *
 * `naceCodePrefixes` decides when Måleoppsett suggests the module: an organisation whose
 * industry code from Brønnøysund (`naeringskode1.kode`, organizations.registry_nace_code)
 * starts with one of them. Adding an industry is an entry here, never a change in code.
 */
export type IndustryMeta = {
  slug: 'bygg-og-anlegg' | 'helse-og-omsorg' | 'barnehage-og-skole' | 'kunnskap-og-kontor' | 'handel'
  naceCodePrefixes: string[]
  /** the module this industry's organisations are offered; its latest published version is used */
  moduleKey?: string
  /** the words the suggestion needs, in each UI language */
  label: { no: string; en: string }
  moduleLabel?: { no: string; en: string }
  /**
   * Where the industry comes in the registry's lists (innstillinger-og-forside.md § 6): by the number
   * of Norwegian undertakings with 5–100 employees, largest first (Brønnøysund, September 2026)
   */
  sortOrder: number
}

export const INDUSTRY_META: IndustryMeta[] = [
  // before helse og omsorg: SN2007 registers kindergartens as 88.911 and SFO as 88.913, inside
  // helse's 88 (the first prefix that matches wins); SN2025 moves them to 85
  {
    slug: 'barnehage-og-skole',
    sortOrder: 4,
    naceCodePrefixes: ['85', '88911', '88913'],
    moduleKey: 'barnehage-og-skole',
    label: { no: 'barnehage og skole', en: 'kindergartens and schools' },
    moduleLabel: { no: 'barnehage- og skolemodulen', en: 'the kindergarten and school module' },
  },
  {
    slug: 'bygg-og-anlegg',
    sortOrder: 3,
    naceCodePrefixes: ['41', '42', '43'],
    moduleKey: 'bygg-og-anlegg',
    label: { no: 'bygg og anlegg', en: 'construction' },
    moduleLabel: { no: 'bygg-modulen', en: 'the construction module' },
  },
  {
    // SN2025 divisions 58–66 and 68–74: publishing, IT, finance, real estate, consultancy (not 67 or 75)
    slug: 'kunnskap-og-kontor',
    sortOrder: 2,
    naceCodePrefixes: ['58', '59', '60', '61', '62', '63', '64', '65', '66', '68', '69', '70', '71', '72', '73', '74'],
    moduleKey: 'kunnskap-og-kontor',
    label: { no: 'kunnskap og kontor', en: 'knowledge and office work' },
    moduleLabel: { no: 'kontor-modulen', en: 'the office module' },
  },
  {
    // SN2025 divisions 46 (wholesale) and 47 (retail)
    slug: 'handel',
    sortOrder: 1,
    naceCodePrefixes: ['46', '47'],
    moduleKey: 'handel',
    label: { no: 'handel', en: 'retail and wholesale' },
    moduleLabel: { no: 'handel-modulen', en: 'the retail module' },
  },
  {
    slug: 'helse-og-omsorg',
    sortOrder: 5,
    naceCodePrefixes: ['86', '87', '88'],
    moduleKey: 'helse-og-omsorg',
    label: { no: 'helse og omsorg', en: 'health and care' },
    moduleLabel: { no: 'helse-modulen', en: 'the health and care module' },
  },
]

/**
 * The organisation's industry (0091, D-139): what its NACE code suggests, or what it chose in
 * Oppsett › Selskap. A choice to follow the code (`brreg`), and no choice at all, both follow the
 * code as it is now. A manual choice (null: «Ingen bransjemodul») stands when the code changes;
 * `changed` is the new suggestion to offer, once, where it differs from the one the choice was made
 * against.
 */
export type IndustrySetting = { source: 'brreg' | 'manual' | null; key: string | null; suggestedAtChoice: string | null }
export type ResolvedIndustry = {
  suggested: IndustryMeta | null
  chosen: IndustryMeta | null
  source: IndustrySetting['source']
  changed: IndustryMeta | null
}

export function resolveIndustry(nace: string | null | undefined, setting: IndustrySetting): ResolvedIndustry {
  const suggested = industryForNace(nace)
  if (setting.source !== 'manual') return { suggested, chosen: suggested, source: setting.source, changed: null }
  const chosen = INDUSTRY_META.find((i) => i.slug === setting.key) ?? null
  const changed =
    suggested && suggested.slug !== setting.suggestedAtChoice && suggested.slug !== setting.key ? suggested : null
  return { suggested, chosen, source: 'manual', changed }
}

/** The industries in the registry's order */
export const INDUSTRIES_IN_ORDER = [...INDUSTRY_META].sort((a, b) => a.sortOrder - b.sortOrder)

export const INDUSTRY_SLUGS = INDUSTRY_META.map((i) => i.slug) as [IndustryMeta['slug'], ...IndustryMeta['slug'][]]

/** The industry an organisation's code belongs to, if any. */
export function industryForNace(code: string | null | undefined): IndustryMeta | null {
  if (!code) return null
  const digits = code.replace(/\D/g, '')
  return INDUSTRY_META.find((i) => i.naceCodePrefixes.some((p) => digits.startsWith(p))) ?? null
}
