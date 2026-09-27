/**
 * Builds the app against the local stack (when the build is missing or --build is passed)
 * and serves it on the QA port. Playwright's webServer runs this, twice: the QA server on
 * 3100, and the pseudo-locale server on 3101 (ORGPULS_PSEUDO=1), which serves the same build
 * with the pseudo catalogue (scripts/i18n/pseudo.mjs, lib/i18n/pseudo.ts).
 *
 *   node scripts/qa/serve.mjs                 serve (building first if there is no build)
 *   node scripts/qa/serve.mjs --build         rebuild, then serve
 *   node scripts/qa/serve.mjs --build-only    rebuild and exit
 */
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { qaEnv, QA_PORT } from './env.mjs'

const env = qaEnv()
const buildOnly = process.argv.includes('--build-only')
if (buildOnly || process.argv.includes('--build') || !existsSync(`${env.NEXT_DIST_DIR}/BUILD_ID`)) {
  execFileSync('npx', ['next', 'build'], { env, stdio: 'inherit' })
}
if (buildOnly) process.exit(0)
// the pseudo catalogue is generated, never committed: write it from today's messages/no.json
if (env.ORGPULS_PSEUDO === '1') execFileSync('node', ['scripts/i18n/pseudo.mjs'], { env, stdio: 'inherit' })
// the server's own output is kept, so I3 can prove no token, IP or user agent reached a log
mkdirSync('test-results', { recursive: true })
const log = createWriteStream(QA_PORT === 3100 ? 'test-results/qa-server.log' : `test-results/qa-server-${QA_PORT}.log`, { flags: 'a' })
const child = spawn('npx', ['next', 'start', '-p', String(QA_PORT)], { env, stdio: ['ignore', 'pipe', 'pipe'] })
for (const stream of [child.stdout, child.stderr]) {
  stream.pipe(log, { end: false })
  stream.pipe(process.stdout, { end: false })
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s))
child.on('exit', (code) => process.exit(code ?? 0))
