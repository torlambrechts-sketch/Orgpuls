/**
 * Diffs one region of two PNGs, as the pixel gates do (pixelmatch, threshold 0.1), for checking a
 * part of a page whose other parts are not yet built — the v3 chrome before the page bodies (D-190).
 *
 *   node scripts/verify/region-diff.mjs <baseline.png> <shot.png> <x> <y> <w> <h> [--by <y>] [--bottom] [--out diff.png]
 *
 * `--by` takes the region at another top in the second image (a band moved by the body above it).
 * `--bottom` measures both tops from each image's bottom edge (`y` is then the distance from the
 * bottom to the region's top), so a footer is compared with a footer whatever the page heights.
 * Prints the differing pixels, their share of the region and of a 1440x900 screen (the gates' unit).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const argv = process.argv.slice(2)
const opt = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i > -1 ? argv[i + 1] : undefined
}
const pos = argv.filter((a, i) => !a.startsWith('--') && !['--by', '--out'].includes(argv[i - 1]))
const [aPath, bPath, xs, ys, ws, hs] = pos
if (!hs) {
  console.error('usage: region-diff.mjs <a.png> <b.png> <x> <y> <w> <h> [--by <y>] [--bottom] [--out diff.png]')
  process.exit(2)
}
const a = PNG.sync.read(readFileSync(aPath))
const b = PNG.sync.read(readFileSync(bPath))
const fromBottom = argv.includes('--bottom')
const x = Number(xs)
const w = Math.min(Number(ws), a.width - x, b.width - x)
const h = Number(hs)
const top = (img, y) => (fromBottom ? img.height - y : y)
const ay = top(a, Number(ys))
const by = top(b, Number(opt('by') ?? ys))

const crop = (img, y0) => {
  const out = new PNG({ width: w, height: h })
  PNG.bitblt(img, out, x, Math.max(0, y0), w, Math.min(h, img.height - Math.max(0, y0)), 0, 0)
  return out
}
const ca = crop(a, ay)
const cb = crop(b, by)
const diff = new PNG({ width: w, height: h })
const n = pixelmatch(ca.data, cb.data, diff.data, w, h, { threshold: 0.1 })
const out = opt('out')
if (out) {
  // baseline | shot | diff, side by side
  const sheet = new PNG({ width: w * 3, height: h })
  PNG.bitblt(ca, sheet, 0, 0, w, h, 0, 0)
  PNG.bitblt(cb, sheet, 0, 0, w, h, w, 0)
  PNG.bitblt(diff, sheet, 0, 0, w, h, w * 2, 0)
  writeFileSync(out, PNG.sync.write(sheet))
}
console.log(
  `${n} px · ${((n / (w * h)) * 100).toFixed(3)}% of the ${w}x${h} region · ${((n / (1440 * 900)) * 100).toFixed(4)}% of a 1440x900 screen`,
)
