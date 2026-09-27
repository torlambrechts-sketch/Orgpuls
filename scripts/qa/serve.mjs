/**
 * Builds the app against the local stack (when the build is missing or --build is passed)
 * and serves it on the QA port. Playwright's webServer runs this.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { qaEnv, QA_PORT } from './env.mjs'

const env = qaEnv()
if (process.argv.includes('--build') || !existsSync('.next-qa/BUILD_ID')) {
  execFileSync('npx', ['next', 'build'], { env, stdio: 'inherit' })
}
// the server's own output is kept, so I3 can prove no token, IP or user agent reached a log
mkdirSync('test-results', { recursive: true })
const log = createWriteStream('test-results/qa-server.log', { flags: 'a' })
const child = spawn('npx', ['next', 'start', '-p', String(QA_PORT)], { env, stdio: ['ignore', 'pipe', 'pipe'] })
for (const stream of [child.stdout, child.stderr]) {
  stream.pipe(log, { end: false })
  stream.pipe(process.stdout, { end: false })
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s))
child.on('exit', (code) => process.exit(code ?? 0))
