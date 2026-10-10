import { z } from 'zod'

/**
 * A module's survey translations as they ship with it (D-263): modules/<key>/registry/<locale>.json,
 * keyed by the file's own codes, which scripts/modules/registry.ts resolves to a database's ids.
 */
export const RegistryFile = z.object({
  locale: z.enum(['en', 'pl', 'uk', 'lt', 'sv', 'da']),
  factors: z.record(z.string(), z.string().trim().min(1)),
  items: z.record(z.string(), z.string().trim().min(1)),
  counts: z.record(z.string(), z.object({ text: z.string().trim().min(1), options: z.array(z.string().trim().min(1)) })),
  /** an instrument's answer scales (0224), by the module file's scale key; written to each statement that names one */
  scales: z.record(z.string(), z.array(z.string().trim().min(1)).length(5)).optional(),
  /** an instrument's prefaces (0224), by the code of the statement they stand before */
  prefaces: z.record(z.string(), z.string().trim().min(1)).optional(),
  /**
   * The sections taken verbatim from the instrument's own published translation (HSE's Polish), stored
   * as origin «official»; every other text in the file is a machine draft (X-089, X-112).
   */
  official: z.array(z.enum(['factors', 'items', 'counts', 'scales', 'prefaces'])).optional(),
})
export type RegistryFile = z.infer<typeof RegistryFile>
