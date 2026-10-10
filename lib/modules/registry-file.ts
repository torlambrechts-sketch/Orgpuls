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
})
export type RegistryFile = z.infer<typeof RegistryFile>
