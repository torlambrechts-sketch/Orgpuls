/**
 * Matches named baseline regions against a shot at the vertical offset where they fit best.
 *
 * `pixel.mjs --at` needs the offset up front, and `regions.mjs` finds blocks by bands of
 * bare canvas, which merges cards that touch. This takes a region per card and searches a
 * range of offsets, printing the best one and the pixels that still differ there, so a card
 * pushed down by a longer card above it (D-71's eleven factors against the design's nine)
 * is still checked like for like.
 *
 *   node scripts/verify/cardmatch.mjs <baseline.png> <shot.png> name,x,y,w,h,minShift,maxShift ...
 */
import { PNG } from 'pngjs'; import pm from 'pixelmatch'; import fs from 'node:fs'
const [,, basePath, shotPath, ...specs] = process.argv
const a = PNG.sync.read(fs.readFileSync(basePath)), b = PNG.sync.read(fs.readFileSync(shotPath))
const crop = (p, x, y, w, h) => { const o = new PNG({ width: w, height: h }); PNG.bitblt(p, o, x, y, w, h, 0, 0); return o }
for (const spec of specs) {
  const [name, x, y, w, h, lo, hi] = spec.split(','); const X = +x, Y = +y, W = +w, H = +h
  let r = null
  for (let dy = +lo; dy <= +hi; dy++) {
    if (Y + dy < 0 || Y + dy + H > b.height) continue
    const A = crop(a, X, Y, W, H), B = crop(b, X, Y + dy, W, H)
    const n = pm(A.data, B.data, null, W, H, { threshold: 0.1 })
    if (!r || n < r.n) r = { dy, n }
  }
  console.log(`${name.padEnd(18)} shift ${String(r.dy).padStart(4)}  ${String(r.n).padStart(6)} px  ${(r.n / (1440 * 900) * 100).toFixed(4)}% of a screen`)
}
