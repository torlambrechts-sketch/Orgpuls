import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Every module file in the repository: `modules/<key>/v<major>.json`. */
export function moduleFiles(root = 'modules'): string[] {
  const out: string[] = []
  for (const dir of readdirSync(root)) {
    const d = join(root, dir)
    if (!statSync(d).isDirectory()) continue
    for (const f of readdirSync(d)) if (/^v\d+\.json$/.test(f)) out.push(join(d, f))
  }
  return out.sort()
}

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
