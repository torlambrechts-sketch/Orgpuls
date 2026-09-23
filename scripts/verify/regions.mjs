/**
 * Per-block pixel claims for a whole screen.
 *
 * `pixel.mjs` answers "does this region match?" once a region has been named. This names
 * them. A whole-page diff of a screen that omits one documented block (D-25, D-27, D-35…)
 * measures the displacement of everything under the omission rather than a colour or a
 * padding, so the number means nothing. This splits the baseline into the blocks the
 * design stacks — runs of rows with ink, separated by bands of bare canvas — and for each
 * block:
 *
 *   1. finds where it sits in the app's shot (row-profile search, then a pixel refine),
 *   2. diffs it there with the same pixelmatch settings as `pixel.mjs`,
 *   3. reports the differing pixels against the *screen's* area, which is the budget
 *      `pixel.mjs` spends (0.1% of the screen, agreed with the user).
 *
 * A block that matches somewhere else is displaced, and the displacement is printed so it
 * can be traced to a documented omission above it. A block that matches nowhere is a
 * difference to explain. The sum over matched blocks is the screen's like-for-like number.
 *
 *   node scripts/verify/regions.mjs --base design-reference/orgpuls/baselines/04-tiltak-tasks.png \
 *     --shot artifacts/shots/tiltak.png [--gap 14] [--json out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i === -1 ? d : process.argv[i + 1]
}

const base = PNG.sync.read(readFileSync(arg('base')))
const shot = PNG.sync.read(readFileSync(arg('shot')))
const GAP = Number(arg('gap', 14)) // canvas rows that still belong to one block
const CANVAS = [0xfc, 0xf6, 0xe9] // tailwind `bg`, the app canvas
const W = Math.min(base.width, shot.width)
const BUDGET = 0.1

/** Per row: how many pixels are not canvas. The shape a block leaves down the page. */
function profile(png) {
  const rows = new Float64Array(png.height)
  for (let y = 0; y < png.height; y++) {
    let n = 0
    for (let x = 0; x < W; x++) {
      const i = (png.width * y + x) << 2
      const d =
        Math.abs(png.data[i] - CANVAS[0]) + Math.abs(png.data[i + 1] - CANVAS[1]) + Math.abs(png.data[i + 2] - CANVAS[2])
      if (d > 10) n++
    }
    rows[y] = n
  }
  return rows
}

const pb = profile(base)
const ps = profile(shot)

// the blocks: runs of inked rows, bridged across short canvas gaps
const blocks = []
let start = -1
let lastInk = -1
for (let y = 0; y < base.height; y++) {
  if (pb[y] > 0) {
    if (start < 0) start = y
    lastInk = y
  } else if (start >= 0 && y - lastInk > GAP) {
    blocks.push({ y: start, h: lastInk - start + 1 })
    start = -1
  }
}
if (start >= 0) blocks.push({ y: start, h: lastInk - start + 1 })

function crop(png, x, y, w, h) {
  const out = new PNG({ width: w, height: h })
  PNG.bitblt(png, out, x, y, w, h, 0, 0)
  return out
}

/** Sampled pixel difference of a base block placed at shot row `sy`. */
function sampled(b, sy) {
  let bad = 0
  for (let j = 0; j < b.h; j += 2) {
    for (let x = 0; x < W; x += 3) {
      const ai = (base.width * (b.y + j) + x) << 2
      const si = (shot.width * (sy + j) + x) << 2
      const d =
        Math.abs(base.data[ai] - shot.data[si]) +
        Math.abs(base.data[ai + 1] - shot.data[si + 1]) +
        Math.abs(base.data[ai + 2] - shot.data[si + 2])
      if (d > 24) bad++
    }
  }
  return bad
}

const screenArea = base.width * base.height
const results = []
for (const b of blocks) {
  const hi = shot.height - b.h
  if (hi < 0) {
    results.push({ ...b, at: null, differing: b.h * W })
    continue
  }
  // coarse: compare row profiles at every offset, keep the best few
  const cands = []
  for (let sy = 0; sy <= hi; sy++) {
    let sad = 0
    for (let j = 0; j < b.h; j++) sad += Math.abs(pb[b.y + j] - ps[sy + j])
    cands.push([sad, sy])
  }
  cands.sort((a, c) => a[0] - c[0])
  // always consider the block's own position too, so an unmoved block is never outvoted
  const tries = [...new Set([b.y <= hi ? b.y : 0, ...cands.slice(0, 6).map((c) => c[1])])]
  let best = null
  for (const sy of tries) {
    for (let d = -2; d <= 2; d++) {
      const y = sy + d
      if (y < 0 || y > hi) continue
      const bad = sampled(b, y)
      if (!best || bad < best.bad || (bad === best.bad && Math.abs(y - b.y) < Math.abs(best.y - b.y)))
        best = { y, bad }
    }
  }
  const differing = pixelmatch(
    crop(base, 0, b.y, W, b.h).data,
    crop(shot, 0, best.y, W, b.h).data,
    null,
    W,
    b.h,
    { threshold: 0.1 },
  )
  results.push({ ...b, at: best.y, differing })
}

let matched = 0
console.log(`${arg('base')} vs ${arg('shot')}`)
console.log('  block (baseline y..)      shot y   shift   px differ   % screen   % block')
for (const r of results) {
  const pctScreen = (100 * r.differing) / screenArea
  const pctBlock = (100 * r.differing) / (r.h * W)
  const shift = r.at === null ? '  —  ' : String(r.at - r.y).padStart(5)
  console.log(
    `  ${String(r.y).padStart(5)}..${String(r.y + r.h - 1).padEnd(5)} h=${String(r.h).padEnd(5)} ${String(r.at ?? '—').padStart(6)} ${shift} ${String(r.differing).padStart(11)} ${pctScreen.toFixed(4).padStart(9)} ${pctBlock.toFixed(2).padStart(8)}`,
  )
  matched += r.differing
}
const total = (100 * matched) / screenArea
console.log(`  sum over blocks: ${matched} px = ${total.toFixed(4)}% of the screen (budget ${BUDGET}%)`)
if (arg('json')) writeFileSync(arg('json'), JSON.stringify({ blocks: results, screenArea }, null, 2))
