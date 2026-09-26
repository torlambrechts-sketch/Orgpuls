/**
 * Builds the app against the local stack (when the build is missing or --build is passed)
 * and serves it on the QA port. Playwright's webServer runs this.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { qaEnv, QA_PORT } from './env.mjs'

const env = qaEnv()
if (process.argv.includes('--build') || !existsSync('.next-qa/BUILD_ID')) {
  execFileSync('npx', ['next', 'build'], { env, stdio: 'inherit' })
}
const child = spawn('npx', ['next', 'start', '-p', String(QA_PORT)], { env, stdio: 'inherit' })
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s))
child.on('exit', (code) => process.exit(code ?? 0))
