import { deflateRawSync, inflateRawSync } from 'node:zlib'

/**
 * The smallest XLSX writer and reader the translation sheets need (X-090): one sheet of text cells,
 * a bold header row that stays in view, wrapped text. Written with inline strings; read back from
 * what Excel, Numbers, LibreOffice or Google Sheets save, which is shared strings. No formulas, no
 * dates, no numbers: every cell is read as the text it shows.
 *
 * A spreadsheet rather than CSV because a comma CSV opens as one column in a Norwegian Excel, and
 * a translator's line breaks, quotes and semicolons survive a cell but not a CSV round trip.
 */

// ---------------------------------------------------------------- zip
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zip(files: { name: string; data: string }[]): Uint8Array {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const raw = Buffer.from(f.data, 'utf8')
    const packed = deflateRawSync(raw)
    const crc = crc32(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // names are UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt32LE(0, 10) // time, date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(0, 12)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, packed)
    centrals.push(central, name)
    offset += local.length + name.length + packed.length
  }
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, dir, end]))
}

export class SheetError extends Error {}

/** Every file in a zip, by name. Bounded: a file that would unpack past `max` bytes is refused. */
function unzip(bytes: Uint8Array, max: number): Map<string, string> {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new SheetError('not a spreadsheet (no zip directory)')
  const count = b.readUInt16LE(end + 10)
  let p = b.readUInt32LE(end + 16)
  const out = new Map<string, string>()
  let total = 0
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new SheetError('damaged zip directory')
    const method = b.readUInt16LE(p + 10)
    const size = b.readUInt32LE(p + 20)
    const nameLen = b.readUInt16LE(p + 28)
    const extraLen = b.readUInt16LE(p + 30)
    const commentLen = b.readUInt16LE(p + 32)
    const at = b.readUInt32LE(p + 42)
    const name = b.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (at + 30 > b.length || b.readUInt32LE(at) !== 0x04034b50) throw new SheetError('damaged zip entry')
    const start = at + 30 + b.readUInt16LE(at + 26) + b.readUInt16LE(at + 28)
    const packed = b.subarray(start, start + size)
    let data: Buffer
    if (method === 0) data = Buffer.from(packed)
    else if (method === 8) {
      try {
        data = inflateRawSync(packed, { maxOutputLength: Math.max(1, max - total) })
      } catch {
        throw new SheetError('the spreadsheet is too large or damaged')
      }
    } else throw new SheetError(`unsupported compression (${method})`)
    total += data.length
    if (total > max) throw new SheetError('the spreadsheet is too large')
    out.set(name, data.toString('utf8'))
  }
  return out
}

// ---------------------------------------------------------------- xml
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // characters XML 1.0 cannot carry at all
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
const unesc = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase()
    if (k === 'amp') return '&'
    if (k === 'lt') return '<'
    if (k === 'gt') return '>'
    if (k === 'quot') return '"'
    if (k === 'apos') return "'"
    return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10))
  })
/** Excel's own escape for a character XML cannot hold, `_x000D_` for a carriage return */
const unx = (s: string) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\r\n?/g, '\n')
/** the text of a <si> or <is>: its <t>s, run by run; phonetic runs (<rPh>) are not the text */
const textOf = (xml: string) =>
  unx([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => unesc(m[1] ?? '')).join(''))

const col = (i: number) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
const colIndex = (ref: string) => [...ref.replace(/\d+$/, '')].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

// ---------------------------------------------------------------- write
/**
 * A workbook of one sheet. The first row is the header: bold, frozen. `widths` in characters.
 */
export function writeXlsx(rows: readonly (readonly string[])[], opts: { sheet: string; widths?: readonly number[] }): Uint8Array {
  const sheetRows = rows
    .map((r, y) => {
      const cells = r.map((v, x) => `<c r="${col(x)}${y + 1}" t="inlineStr" s="${y === 0 ? 2 : 1}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')
      return `<row r="${y + 1}">${cells}</row>`
    })
    .join('')
  const cols = opts.widths?.length ? `<cols>${opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `${cols}<sheetData>${sheetRows}</sheetData></worksheet>`
  const name = esc(opts.sheet.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet1')
  return zip([
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    },
    {
      name: 'xl/styles.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
        '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
  ])
}

// ---------------------------------------------------------------- read
/**
 * The first sheet's cells as text, row by row; a missing cell is ''. Refuses anything that is not a
 * workbook, or that unpacks past `max` bytes (a zip bomb stops there).
 */
export function readXlsx(bytes: Uint8Array, max = 20_000_000): string[][] {
  const files = unzip(bytes, max)
  const workbook = files.get('xl/workbook.xml')
  if (!workbook) throw new SheetError('not a spreadsheet (no workbook)')
  const firstId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1] ?? /<sheet\b[^>]*\bid="([^"]+)"/.exec(workbook)?.[1]
  const rels = files.get('xl/_rels/workbook.xml.rels') ?? ''
  const target = firstId ? new RegExp(`<Relationship\\b[^>]*\\bId="${firstId}"[^>]*\\bTarget="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${firstId}"`).exec(rels)?.[1] : undefined
  const path = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target}`) : 'xl/worksheets/sheet1.xml'
  const sheet = files.get(path) ?? files.get('xl/worksheets/sheet1.xml')
  if (!sheet) throw new SheetError('the workbook has no sheet')
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => textOf(m[1] ?? ''))

  const rows: string[][] = []
  for (const r of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const attrs = r[1] ?? r[3] ?? ''
    const y = Number(/\br="(\d+)"/.exec(attrs)?.[1] ?? rows.length + 1) - 1
    const row: string[] = []
    let next = 0
    for (const c of (r[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ca = c[1] ?? ''
      const ref = /\br="([A-Z]+\d*)"/.exec(ca)?.[1]
      const x = ref ? colIndex(ref) : next
      next = x + 1
      const type = /\bt="([^"]+)"/.exec(ca)?.[1] ?? 'n'
      const body = c[2] ?? ''
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      const text =
        type === 's' ? (shared[Number(v)] ?? '')
        : type === 'inlineStr' ? textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
        : v !== undefined ? unesc(v)
        : ''
      while (row.length < x) row.push('')
      row[x] = text
    }
    while (rows.length < y) rows.push([])
    rows[y] = row
  }
  return rows
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
