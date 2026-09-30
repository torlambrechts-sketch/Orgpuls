/**
 * The admin pixel gate's judgement, kept apart from the browser so it can be tested (D-181):
 * how a render and a shot are cut into tiles and compared, which tiles a view passes, and whether
 * the run as a whole passes. sentral-run.mjs does the shooting and calls these.
 *
 * The run's verdict is read from its exit code, not its summary (the plan's QC loop), so every way
 * a run can check nothing is a failure here: a view with recorded claims that was skipped, a run in
 * which no view was judged or shot, a lost claim, a route that did not answer, a console error.
 */
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export const TILE = 100

/** the hosts the gate signs in to: it types the fixture's local admin password into the page */
export const LOCAL_BASE_HOSTS = ['localhost', '127.0.0.1']

/** The app's address, parsed, when it is this machine over http(s); otherwise it throws. */
export function assertLocalBase(url) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    throw new Error('sentral-run: --base does not parse; refusing')
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`sentral-run: --base ${u.protocol} is not http; refusing`)
  if (!LOCAL_BASE_HOSTS.includes(u.hostname)) {
    throw new Error(`sentral-run: --base host «${u.hostname}» is not local, and the run signs in with the local admin's password; refusing`)
  }
  if (u.username || u.password) throw new Error('sentral-run: --base carries credentials; refusing')
  return u
}

const crop = (png, x, y, w, h) => {
  const o = new PNG({ width: w, height: h })
  PNG.bitblt(png, o, x, y, w, h, 0, 0)
  return o
}

/**
 * Each tile of the render with its best diff within ±shift px up and down: ['y:x', differing
 * pixels]. The render decides which tiles exist: a tile the shot is too narrow or too short to hold
 * counts as wholly different (tile × tile), so a claim on it is lost, not silently dropped.
 */
export function tiles(basePng, shotPng, { shift = 40, tile = TILE } = {}) {
  const res = []
  for (let y = 0; y + tile <= basePng.height; y += tile) {
    for (let x = 0; x + tile <= basePng.width; x += tile) {
      if (x + tile > shotPng.width) {
        res.push([`${y}:${x}`, tile * tile])
        continue
      }
      const A = crop(basePng, x, y, tile, tile)
      let best = null
      for (const dy of [0, ...Array.from({ length: shift }, (_, i) => [i + 1, -(i + 1)]).flat()]) {
        if (y + dy < 0 || y + dy + tile > shotPng.height) continue
        const n = pixelmatch(A.data, crop(shotPng, x, y + dy, tile, tile).data, null, tile, tile, { threshold: 0.1 })
        if (best === null || n < best) best = n
        if (n === 0) break
      }
      res.push([`${y}:${x}`, best ?? tile * tile])
    }
  }
  return res
}

/** One view: the tiles that pass, the claimed tiles that no longer do, and the rows that differ */
export function judgeView(claimed, tileResults, limit) {
  const pass = tileResults.filter(([, n]) => n <= limit).map(([t]) => t)
  const passing = new Set(pass)
  const lost = (claimed ?? []).filter((t) => !passing.has(t))
  const rows = [...new Set(tileResults.filter(([, n]) => n > limit).map(([t]) => t.split(':')[0]))]
  return { pass, lost, rows }
}

/**
 * The run's verdict. `checked`: the views judged (1440) or shot (other widths); `skipped`: the
 * views not compared, each with why; `failures`: lines already counted as failed (a lost claim, a
 * route that did not answer, a page that scrolls sideways); `errors`: console and page errors;
 * `known`: every view the route map names — a claim under any other name is one no run can check
 * (a renamed slug, a removed route), so it fails the run instead of being silently kept.
 */
export function verdict({ claims = {}, checked = [], skipped = [], failures = [], errors = [], known }) {
  const reasons = [...failures]
  if (known) {
    const names = new Set(known)
    for (const [name, tiles] of Object.entries(claims)) {
      if (!names.has(name)) reasons.push(`${name} has ${tiles.length} claimed tiles but no route in VIEW_ROUTES, so nothing checks them`)
    }
  }
  for (const s of skipped) {
    if ((claims[s.name] ?? []).length) reasons.push(`${s.name} has ${claims[s.name].length} claimed tiles but was skipped: ${s.why}`)
  }
  if (!checked.length) reasons.push('no view was compared')
  if (errors.length) reasons.push(`${errors.length} console or page errors`)
  return { ok: reasons.length === 0, reasons }
}
