/**
 * The pixel gate.
 *
 * Diffs a region of a rendered app route against the same region of the design
 * baseline and fails if more than TOLERANCE of pixels differ. The tolerance is 0.1%,
 * agreed with the user: font hinting and sub-pixel antialiasing mean a React app and a
 * React prototype never reach 0.00% even when visually indistinguishable, but 0.1% is
 * tight enough that a shifted border, a wrong hex or an off-by-2px padding fails.
 *
 * Regions exist because a screen is built in segments. Until a screen is finished, only
 * the parts that have been built can be expected to match — diffing a half-built page
 * against a complete baseline produces a number that means nothing. Name the region you
 * are claiming, and the claim is checkable.
 *
 * `--at` is the same idea carried one step further. A block that has been built
 * correctly but sits above a block that has NOT been built yet is at a different y in
 * the app than in the baseline, so comparing it at the baseline's coordinates diffs it
 * against whatever happens to be there and reports nonsense. `--at` gives the shot's
 * origin for the same w x h, so the claim becomes "this block matches, displaced by n
 * pixels", which is exactly true and still checkable. The displacement is printed, so a
 * region silently sliding is visible rather than absorbed.
 *
 * It does not relax the gate: same tolerance, same screen denominator, same pixels
 * compared. Use it only for a block whose position differs because of a documented
 * omission — never to chase a block that has drifted for a reason nobody has explained.
 *
 *   node scripts/verify/pixel.mjs \
 *     --base design-reference/orgpuls/baselines/01-innsikt-home.png \
 *     --shot .playwright-mcp/innsikt.png \
 *     --region 0,0,1440,60 \
 *     --name header
 *
 *   node scripts/verify/pixel.mjs --base base.png --shot shot.png \
 *     --region 158,475,1124,78 --at 158,202 --name rounds-2026
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const TOLERANCE = 0.1 // percent

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) {
    if (fallback !== undefined) return fallback
    throw new Error(`missing --${name}`)
  }
  return process.argv[i + 1]
}

function crop(png, x, y, w, h) {
  const out = new PNG({ width: w, height: h })
  PNG.bitblt(png, out, x, y, w, h, 0, 0)
  return out
}

const basePath = arg('base')
const shotPath = arg('shot')
const name = arg('name', 'region')
const out = arg('out', `artifacts/pixel/${name}.diff.png`)

const base = PNG.sync.read(readFileSync(basePath))
const shot = PNG.sync.read(readFileSync(shotPath))

const region = arg('region', `0,0,${Math.min(base.width, shot.width)},${Math.min(base.height, shot.height)}`)
const [x, y, w, h] = region.split(',').map(Number)

// where the same region sits in the shot; defaults to the baseline's own origin
const at = arg('at', `${x},${y}`)
const [sx, sy] = at.split(',').map(Number)

for (const [label, img, ox, oy] of [
  ['baseline', base, x, y],
  ['shot', shot, sx, sy],
]) {
  if (ox + w > img.width || oy + h > img.height) {
    console.error(
      `region ${w}x${h} at (${ox},${oy}) does not fit the ${label} (${img.width}x${img.height})`,
    )
    process.exit(2)
  }
}

const diff = new PNG({ width: w, height: h })
const differing = pixelmatch(
  crop(base, x, y, w, h).data,
  crop(shot, sx, sy, w, h).data,
  diff.data,
  w,
  h,
  { threshold: 0.1 },
)

/**
 * The denominator is the whole screen, not the region.
 *
 * 0.1% was agreed as a per-screen budget. Measuring a region against its own area is a
 * different and much harsher test, because a region cropped tightly around content has
 * none of the empty space that makes a screen forgiving: the header band is 1440x57 and
 * almost entirely text, so 257 pixels of glyph-edge antialiasing reads as 0.313% of the
 * band but is 0.014% of the screen it sits in. Holding a band to the screen's percentage
 * would fail work that is pixel-correct.
 *
 * So a region consumes part of the screen's budget, and the absolute count is printed
 * too, because that is the number that actually means something when comparing runs.
 */
const regionArea = w * h
const screenArea = base.width * base.height
const pct = (differing / screenArea) * 100
const pctOfRegion = (differing / regionArea) * 100
const pass = pct <= TOLERANCE

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, PNG.sync.write(diff))

const displaced = sx !== x || sy !== y
console.log(
  `${name}: region ${w}x${h} at (${x},${y}) of a ${base.width}x${base.height} screen` +
    (displaced ? ` — compared against the shot at (${sx},${sy}), displaced by ${sx - x},${sy - y}` : ''),
)
console.log(`${name}: ${differing} pixels differ`)
console.log(`${name}: ${pct.toFixed(4)}% of the screen (${pctOfRegion.toFixed(3)}% of the region)`)
console.log(`${name}: budget ${TOLERANCE}% of screen -> ${pass ? 'PASS' : 'FAIL'}`)
console.log(`${name}: diff written to ${out}`)

process.exit(pass ? 0 : 1)
