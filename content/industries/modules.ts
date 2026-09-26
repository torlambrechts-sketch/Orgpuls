import byggV1 from '@/modules/bygg-og-anlegg/v1.json'
import { parseModule, type ModuleFile } from '@/lib/modules/schema'

/**
 * The module files the public pages read, parsed with the same schema the seed script uses.
 * A page's statements come from here by code, so the site and the survey cannot word them
 * differently. A new version is a new entry.
 */
const FILES: Record<string, unknown> = {
  'bygg-og-anlegg@1.0.0': byggV1,
}

export function moduleFile(key: string, version: string): ModuleFile {
  const raw = FILES[`${key}@${version}`]
  if (!raw) throw new Error(`no module file for ${key}@${version}`)
  return parseModule(raw, `${key}@${version}`)
}
