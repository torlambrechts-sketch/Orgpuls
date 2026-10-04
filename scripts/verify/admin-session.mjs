/**
 * The local admin's session, shared by the two harnesses that sign in as it: the admin's pixel
 * gate (sentral-run.mjs) and the Playwright admin projects (qa/e2e/admin.setup.ts, WP-0.7).
 *
 * Both sign in as the one admin scripts/seed/sentral-fixture.mjs writes, and each run's
 * closeAdmin, like the next run's openAdmin, deletes the second factor every other run holds; so
 * two runs at once would sign each other out. The lock below keeps them apart, machine-wide: a
 * directory under the system's temp dir, made atomically, holding its owner's pid. One whose
 * owner has gone is taken over. The owner is the process whose life the session lasts: the
 * script itself for sentral-run, the Playwright runner (the setup worker's parent) for the
 * admin projects, whose teardown releases it.
 */
import { createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** RFC 6238 with SHA-1, 30 s steps, 6 digits — what the admin's authenticator enrolment issues */
export function totp(secret, at = Date.now()) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = secret
    .replace(/=+$/, '')
    .toUpperCase()
    .split('')
    .map((c) => A.indexOf(c).toString(2).padStart(5, '0'))
    .join('')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const ctr = Buffer.alloc(8)
  ctr.writeBigUInt64BE(BigInt(Math.floor(at / 30000)))
  const h = createHmac('sha1', key).update(ctr).digest()
  const o = h[19] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0')
}

const LOCK = join(tmpdir(), 'orgpuls-sentral-run.lock')
const LOCK_PID = join(LOCK, 'pid')

function lockAlive() {
  let pid
  try {
    pid = Number(readFileSync(LOCK_PID, 'utf8'))
  } catch {
    // made a moment ago, its pid not written yet
    try {
      return Date.now() - statSync(LOCK).mtimeMs < 10000
    } catch {
      return false
    }
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

/** Waits for the lock and takes it for `owner` (a pid), up to `maxMs` */
export async function acquireAdminLock({ owner = process.pid, maxMs = 45 * 60000 } = {}) {
  const t0 = Date.now()
  let told = false
  for (;;) {
    try {
      mkdirSync(LOCK)
      writeFileSync(LOCK_PID, String(owner))
      return
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }
    if (!lockAlive()) {
      rmSync(LOCK, { recursive: true, force: true })
      continue
    }
    if (Date.now() - t0 > maxMs) throw new Error(`another run has held ${LOCK} for ${Math.round(maxMs / 60000)} minutes`)
    if (!told) console.log(`waiting for another run signed in as the local admin to finish (${LOCK})`)
    told = true
    await new Promise((r) => setTimeout(r, 2000))
  }
}

/** Gives the lock back, if `owner` holds it */
export function releaseAdminLock(owner = process.pid) {
  try {
    if (Number(readFileSync(LOCK_PID, 'utf8')) === owner) rmSync(LOCK, { recursive: true, force: true })
  } catch {
    // not ours, or already gone
  }
}
