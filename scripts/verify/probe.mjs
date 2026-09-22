/**
 * Pixel forensics.
 *
 * When the pixel gate fails, the percentage tells you *that* something is wrong and
 * the diff image tells you roughly *where*. Neither tells you *what*, and guessing at
 * that is how you end up "fixing" a cause you never confirmed. This measures.
 *
 * It exists because it worked: the header diffed at 5.750%, and `--rows` showed the
 * design's bottom border at y=56 against the app's y=59. Three pixels, one cause —
 * Tailwind's preflight sets html{line-height:1.5} where the bundle sets none — and a
 * defect that would have skewed text metrics on every screen in the product.
 *
 * It also disproved a hypothesis, which is the more valuable use. The residual 257
 * pixels were blamed on next/font emitting static instances instead of the bundle's
 * variable fonts; `--text` showed identical glyph column runs before and after the
 * change, so the explanation was wrong and the comment asserting it got corrected
 * rather than left to mislead the next reader.
 *
 *   node scripts/verify/probe.mjs --a base.png --b shot.png --rows          # find a y offset
 *   node scripts/verify/probe.mjs --a base.png --b shot.png --edges 28      # control x positions
 *   node scripts/verify/probe.mjs --a base.png --b shot.png --text 18,40,880,1015
 */
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const px = (p, x, y) => {
  const i = (p.width * y + x) << 2
  return [p.data[i], p.data[i + 1], p.data[i + 2]]
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')
const isDark = (c) => c[0] < 140 && c[1] < 140 && c[2] < 140

const images = [
  ['A', PNG.sync.read(readFileSync(arg('a')))],
  ['B', PNG.sync.read(readFileSync(arg('b')))],
]

/**
 * Where does the surface stop being the surface? Scanning one column down from the top
 * finds a horizontal rule — a header's bottom border, a card's edge — and comparing the
 * y between two renders turns "it looks a bit off" into "three pixels taller".
 */
if (arg('rows')) {
  const surface = String(arg('surface', '#FFFDF6')).toUpperCase()
  const col = Number(arg('col', 700))
  const limit = Number(arg('limit', 200))
  for (const [label, p] of images) {
    let y = 0
    for (; y < Math.min(limit, p.height); y++) if (hex(px(p, col, y)) !== surface) break
    console.log(
      `${label}: ${p.width}x${p.height} — first non-${surface} row at x=${col} is y=${y} (${hex(px(p, col, y))})`,
    )
  }
}

/**
 * Colour transitions along one row. Control borders, fills and gaps all show up as
 * changes, so two renders whose transition x-values agree have identical layout even
 * when the pixels differ — which is how you tell a layout bug from font rasterisation.
 */
if (arg('edges')) {
  const row = Number(arg('edges'))
  const from = Number(arg('from', 0))
  const to = Number(arg('to', 0)) || undefined
  for (const [label, p] of images) {
    const end = to ?? p.width
    const out = []
    let prev = hex(px(p, from, row))
    for (let x = from + 1; x < end; x++) {
      const c = hex(px(p, x, row))
      if (c !== prev) {
        out.push(`${x}:${c}`)
        prev = c
      }
    }
    console.log(`${label}: row ${row} transitions — ${out.slice(0, 20).join('  ')}`)
  }
}

/**
 * Columns containing any dark pixel, collapsed into runs: the horizontal footprint of
 * the glyphs in a band. If two renders share a run's start and end, the text is in the
 * same place and only its edges are being rasterised differently.
 */
if (arg('text')) {
  const [y0, y1, x0, x1] = String(arg('text')).split(',').map(Number)
  for (const [label, p] of images) {
    const cols = []
    for (let x = x0; x < Math.min(x1, p.width); x++) {
      for (let y = y0; y < Math.min(y1, p.height); y++) {
        if (isDark(px(p, x, y))) {
          cols.push(x)
          break
        }
      }
    }
    const runs = []
    let start = cols[0]
    let prev = cols[0]
    for (const c of cols.slice(1)) {
      if (c !== prev + 1) {
        runs.push(`${start}-${prev}`)
        start = c
      }
      prev = c
    }
    if (cols.length) runs.push(`${start}-${prev}`)
    console.log(`${label}: dark column runs ${x0}-${x1} — ${runs.join(', ') || 'none'}`)
  }
}

if (!arg('rows') && !arg('edges') && !arg('text')) {
  console.error('pick one of --rows, --edges <row>, --text <y0,y1,x0,x1>')
  process.exit(2)
}
