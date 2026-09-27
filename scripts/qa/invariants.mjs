/**
 * `npm run test:invariants`: I1–I7 (engagement-phases.md § 2.7). The SQL half on the local
 * QA stack, then I3 in the browser. Either failing fails the gate.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { qaEnv } from './env.mjs'

const env = qaEnv()
try {
  const out = execFileSync('psql', [env.QA_DATABASE_URL, '-q', '-v', 'ON_ERROR_STOP=1', '-f', 'tests/invariants/invariants.sql'], { encoding: 'utf8' })
  process.stdout.write(out)
} catch (e) {
  process.stdout.write(String(e.stdout ?? ''))
  process.stderr.write(String(e.stderr ?? ''))
  process.exit(1)
}
const r = spawnSync('npx', ['playwright', 'test', '--grep', '@invariants'], { env: { ...env, QA_STEP: 'invariants' }, stdio: 'inherit' })
process.exit(r.status ?? 1)
