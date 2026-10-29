import { z } from 'zod'

/**
 * A module's survey translations as they ship with it (D-263): modules/<key>/registry/<locale>.json,
 * keyed by the file's own codes, which scripts/modules/registry.ts resolves to a database's ids.
 */
const Text = z.string().trim().min(1)
/** a worded module's two wordings of one text (0083): «barna» in a kindergarten, «elevene» in a school */
const Wordings = z.object({ barnehage: Text, skole: Text })

export const RegistryFile = z.object({
  locale: z.enum(['en', 'pl', 'uk', 'lt', 'sv', 'da', 'de']),
  factors: z.record(z.string(), Text),
  items: z.record(z.string(), Text),
  counts: z.record(z.string(), z.object({ text: Text, options: z.array(Text) })),
  /** a module's segment questions (0067), by the database's code (<prefix>-S-<id>), each with its options */
  segments: z.record(z.string(), z.object({ text: Text, options: z.array(Text).min(2) })).optional(),
  /** an instrument's answer scales (0224), by the module file's scale key; written to each statement that names one */
  scales: z.record(z.string(), z.array(Text).length(5)).optional(),
  /** an instrument's prefaces (0224), by the code of the statement they stand before */
  prefaces: z.record(z.string(), Text).optional(),
  /** a worded module (0083, D-292): the kindergarten and school wording of a statement or count question, by code */
  variants: z.record(z.string(), Wordings).optional(),
  /** and of a factor name, by the factor's key */
  factorVariants: z.record(z.string(), Wordings).optional(),
  /**
   * The sections taken verbatim from the instrument's own published translation (HSE's Polish), stored
   * as origin «official»; every other text in the file is a machine draft (X-089, X-112).
   */
  official: z.array(z.enum(['factors', 'items', 'counts', 'segments', 'scales', 'prefaces', 'variants'])).optional(),
})
export type RegistryFile = z.infer<typeof RegistryFile>
