/**
 * Cuts a band out of a PNG, for looking at one part of a tall full-page shot.
 *   node scripts/verify/crop.mjs <in.png> <out.png> <top> <height> [left] [width]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const [inp, out, top, height, left = '0', width] = process.argv.slice(2)
const src = PNG.sync.read(readFileSync(inp))
const x0 = Number(left)
const y0 = Math.min(Number(top), src.height - 1)
const w = Math.min(width ? Number(width) : src.width - x0, src.width - x0)
const h = Math.min(Number(height), src.height - y0)
const dst = new PNG({ width: w, height: h })
PNG.bitblt(src, dst, x0, y0, w, h, 0, 0)
writeFileSync(out, PNG.sync.write(dst))
console.log(`${out} ${w}x${h}`)
