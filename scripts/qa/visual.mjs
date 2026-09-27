/**
 * `npm run qa:visual -- --step p1.2`   the screens of one step, saved and compared (§ 2.2)
 * `npm run qa:visual -- --all --compare` every screen against its baseline (G5)
 * `npm run qa:visual -- --step p0.2 --update` writes the baselines of a step, and only for a
 * new screen or an intended change — which the phase report must name, with its reason.
 */
import { spawnSync } from 'node:child_process'
import { qaEnv } from './env.mjs'

const args = process.argv.slice(2)
const at = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined)
const step = at('--step')
const all = args.includes('--all')
if (!step && !all) {
  console.error('qa:visual needs --step p{n}.{m} or --all')
  process.exit(2)
}
const pw = ['playwright', 'test']
if (step) pw.push('--grep', `@setup|@${step.replace('.', '\\.')}\\b`)
// the respondent flow (@flow, @pseudo) submits real answers and comments, and belongs to
// `npm run e2e`, which re-seeds around it; here it would put them in front of the manager screens
pw.push('--grep-invert', '@flow|@pseudo')
if (args.includes('--update')) pw.push('--update-snapshots=all')
const env = { ...qaEnv(), QA_STEP: step ?? 'all' }
const r = spawnSync('npx', pw, { env, stdio: 'inherit' })
process.exit(r.status ?? 1)
