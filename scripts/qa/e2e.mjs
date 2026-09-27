/**
 * `npm run e2e [-- --grep @p1.2]`: the Playwright suite against the QA stack.
 *
 * The Lumio seed is applied before the run and again after it (`--no-seed` skips both). The
 * respondent-flow suite (@flow, @pseudo) submits real responses on the links the seed keeps
 * for it, so a second run would find them spent, and the round's counts would no longer be
 * the scenario's that the manager baselines were captured on. The seed is the only source of
 * those rows (CLAUDE.md, The fixture) and takes under a second.
 */
import { spawnSync } from 'node:child_process'
import { qaEnv } from './env.mjs'

const args = process.argv.slice(2)
const noSeed = args.includes('--no-seed')
if (noSeed) args.splice(args.indexOf('--no-seed'), 1)
const i = args.indexOf('--grep')
if (i >= 0) args[i + 1] = `@setup|${args[i + 1]}`
const env = qaEnv()

const seed = () => {
  const s = spawnSync('node', ['scripts/qa/seed.mjs', '--apply'], { env, stdio: ['ignore', 'ignore', 'inherit'] })
  if (s.status !== 0) {
    console.error('e2e: the QA seed failed')
    process.exit(s.status ?? 1)
  }
}

if (!noSeed) seed()
const r = spawnSync('npx', ['playwright', 'test', ...args], { env: { ...env, QA_STEP: process.env.QA_STEP ?? 'e2e' }, stdio: 'inherit' })
if (!noSeed) seed()
process.exit(r.status ?? 1)
