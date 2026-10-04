/**
 * The admin's pages against the Phase A baseline (WP-0.7; the brief's A8, «the baseline screenshots of
 * existing admin pages do not change unless the change is intended and listed»).
 *
 * qa/e2e/admin-pages.spec.ts captures every admin page at 1440 (`admin`) and 390 (`admin-phone`) into
 * test-results/shots/admin/<project>/<name>.png; docs/crm-enrichment/screens/baseline/<width>/<name>.png
 * holds the same pages as they were before the CRM work began (03-IMPLEMENTED-TODAY.md). This lists,
 * per page and width, how much of it differs: pixels that differ over the height both share
 * (pixelmatch at 0.1, as pixel.mjs), plus every row one has and the other lacks. Data differs from
 * one stack to the next — dates, counts, the rows a test left — so the figure is not a gate: the list
 * is what a reviewer opens, page by page, to confirm that each change is one a deviation entry names.
 * The table goes to stdout and to test-results/admin-baseline-diff.md.
 *
 *   node scripts/verify/admin-baseline-diff.mjs [--shots test-results/shots/admin] [--min 0.5]
 *   --min: leave out pages that differ by less than this many per cent (default 0: list every page)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const argv = process.argv.slice(2)
const arg = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d)
const shots = arg('shots', 'test-results/shots/admin')
const min = Number(arg('min', 0))
const BASELINE = 'docs/crm-enrichment/screens/baseline'
const PROJECTS = { admin: 1440, 'admin-phone': 390 }

/** the share of `a` and `b` that differs, as a per cent of the taller one's area */
export function differs(a, b) {
  const width = Math.min(a.width, b.width)
  const height = Math.min(a.height, b.height)
  const crop = (png) => {
    const out = new PNG({ width, height })
    PNG.bitblt(png, out, 0, 0, width, height, 0, 0)
    return out
  }
  const shared = pixelmatch(crop(a).data, crop(b).data, null, width, height, { threshold: 0.1 })
  const area = Math.max(a.width, b.width) * Math.max(a.height, b.height)
  return (100 * (shared + (area - width * height))) / area
}

const rows = []
const missing = []
for (const [project, width] of Object.entries(PROJECTS)) {
  const dir = join(shots, project)
  if (!existsSync(dir)) continue
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.png')).sort()) {
    const base = join(BASELINE, String(width), file)
    if (!existsSync(base)) {
      missing.push(`${width}/${file}`)
      continue
    }
    const a = PNG.sync.read(readFileSync(base))
    const b = PNG.sync.read(readFileSync(join(dir, file)))
    rows.push({ width, page: file.replace(/\.png$/, ''), was: a.height, now: b.height, pct: differs(a, b) })
  }
}
if (!rows.length && !missing.length) {
  console.error(`no captures under ${shots}: run qa/e2e/admin-pages.spec.ts first`)
  process.exit(2)
}
const shown = rows.filter((r) => r.pct >= min).sort((x, y) => y.pct - x.pct)
const lines = [
  '| Width | Page | Height then → now | Differs |',
  '| --- | --- | --- | --- |',
  ...shown.map((r) => `| ${r.width} | ${r.page} | ${r.was} → ${r.now} px | ${r.pct.toFixed(2)} % |`),
  '',
  `${rows.length} pages compared${min ? `, ${rows.length - shown.length} under ${min} % left out` : ''}.`,
  missing.length ? `No baseline (pages added since Phase A): ${missing.join(', ')}.` : '',
]
const out = lines.join('\n') + '\n'
process.stdout.write(out)
writeFileSync('test-results/admin-baseline-diff.md', `# The admin against the Phase A baseline\n\n${out}`)
