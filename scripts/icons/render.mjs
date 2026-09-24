/**
 * Renders app/icon.svg to the raster icons Next.js serves beside it, and packs the ICO.
 *
 *   node scripts/icons/render.mjs
 *
 * Writes app/favicon.ico (16 and 32 px, PNG-encoded entries) and app/apple-icon.png
 * (180 px on the app canvas, since iOS composites nothing behind it). Chromium does the
 * rendering so the raster is exactly what the browser draws from the SVG; the ICO is
 * packed here because an ICO is only a header, a directory and the PNG bytes.
 */
import { chromium } from 'playwright-core'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('app/icon.svg', 'utf8')
const executablePath = ['/opt/pw-browsers/chromium', process.env.CHROMIUM].find((p) => p && existsSync(p))
const browser = await chromium.launch(executablePath ? { executablePath } : {})

async function render(size, background) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(
    `<html><body style="margin:0;background:${background ?? 'transparent'}">${svg.replace(
      /width="32" height="32"/,
      `width="${size}" height="${size}"`,
    )}</body></html>`,
  )
  const png = await page.screenshot({ omitBackground: !background, clip: { x: 0, y: 0, width: size, height: size } })
  await page.close()
  return png
}

/** ICO container around PNG entries (Vista and later, every current browser). */
function ico(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach(({ size, png }, i) => {
    const o = 16 * i
    dir.writeUInt8(size === 256 ? 0 : size, o) // width
    dir.writeUInt8(size === 256 ? 0 : size, o + 1) // height
    dir.writeUInt8(0, o + 2) // palette
    dir.writeUInt8(0, o + 3) // reserved
    dir.writeUInt16LE(1, o + 4) // planes
    dir.writeUInt16LE(32, o + 6) // bits per pixel
    dir.writeUInt32LE(png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)])
}

const [p16, p32, apple] = await Promise.all([render(16), render(32), render(180, '#FCF6E9')])
writeFileSync('app/favicon.ico', ico([{ size: 16, png: p16 }, { size: 32, png: p32 }]))
writeFileSync('app/apple-icon.png', apple)
await browser.close()
console.log(`favicon.ico ${16}+${32} px (${p16.length + p32.length + 6 + 32} bytes), apple-icon.png 180 px (${apple.length} bytes)`)
