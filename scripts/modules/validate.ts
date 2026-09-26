/**
 * npm run modules:validate — every module file under modules/ must parse.
 *
 * The file is what the survey asks and what the industry pages print, so a file that does
 * not parse fails CI here rather than in a respondent's hands. The directory must match the
 * module id, and the file name the major version, so a path always names what it holds.
 */
import { basename, dirname } from 'node:path'
import { contentHash, parseModule } from '../../lib/modules/schema'
import { moduleFiles, readJson } from './files'

let failed = 0
const files = moduleFiles()
for (const path of files) {
  try {
    const m = parseModule(readJson(path), path)
    if (basename(dirname(path)) !== m.module_id) throw new Error(`${path}: directory must be ${m.module_id}`)
    if (basename(path) !== `v${m.version.split('.')[0]}.json`) throw new Error(`${path}: file must be v${m.version.split('.')[0]}.json`)
    const items = m.factors.reduce((n, f) => n + f.items.length, 0)
    console.log(`ok  ${m.module_id}@${m.version}  ${m.factors.length} factors, ${items} statements, ${m.count_items.length} count, ${m.segments.length} segments  ${contentHash(m).slice(0, 12)}`)
  } catch (e) {
    failed++
    console.error(`FAIL ${(e as Error).message}`)
  }
}
if (!files.length) {
  console.error('no module files found under modules/')
  process.exit(1)
}
process.exit(failed ? 1 : 0)
