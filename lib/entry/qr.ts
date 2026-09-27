import 'server-only'
import qrcode from 'qrcode-generator'

/**
 * A QR code as one SVG path, drawn in `currentColor`, for the entry poster (0076, D-126).
 * Error correction M: a poster in a break room gets creased, taped and photographed at an
 * angle, and M still reads with 15 % of it gone while keeping the modules large.
 *
 * `size` includes the four-module quiet zone the standard asks for, so the viewBox is the
 * whole scannable square and a caller only chooses how large to print it.
 */
export function qrPath(text: string): { size: number; d: string } {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  const quiet = 4
  const parts: string[] = []
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) parts.push(`M${col + quiet} ${row + quiet}h1v1h-1z`)
    }
  }
  return { size: n + quiet * 2, d: parts.join('') }
}
