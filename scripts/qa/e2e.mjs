/** `npm run e2e [-- --grep @p1.2]`: the Playwright suite against the QA stack. */
import { spawnSync } from 'node:child_process'
import { qaEnv } from './env.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--grep')
if (i >= 0) args[i + 1] = `@setup|${args[i + 1]}`
const r = spawnSync('npx', ['playwright', 'test', ...args], { env: { ...qaEnv(), QA_STEP: process.env.QA_STEP ?? 'e2e' }, stdio: 'inherit' })
process.exit(r.status ?? 1)
