/**
 * The one CSV reader: Oppsett's employee import (its preview in the browser and the write on
 * the server, D-76) and the admin contact import read a sheet by these rules.
 *
 * What a spreadsheet actually produces:
 *   - a paste from Excel or Sheets is tab-separated; a Norwegian Excel export is
 *     semicolon-separated; everything else is comma-separated. The delimiter is the one of the
 *     three that occurs most often, outside quotes, in the first lines — so «Nordmann, Kari»
 *     in a tab-separated paste is one name, not two cells;
 *   - a field in double quotes may hold the delimiter, a line break, and `""` for a quote;
 *   - line ends are LF, CRLF or a lone CR, and a UTF-8 export may start with a byte-order mark.
 *
 * It is lenient where a strict reader would refuse a whole sheet over one cell: a quote in the
 * middle of a field is kept as a character, text after a closing quote is kept, and a quote
 * that is never closed is read as a character rather than swallowing the rest of the sheet.
 *
 * Every cell is trimmed, and a line with nothing in it is no record. Pure, so it runs anywhere.
 */

export const DELIMITERS = ['\t', ';', ','] as const
export type Delimiter = (typeof DELIMITERS)[number]

/** How many lines the delimiter is decided from. */
const SAMPLE_LINES = 10

/**
 * The delimiter of a sheet: the most frequent of tab, semicolon and comma outside quotes in its
 * first lines. A tie goes to the earlier in that list, and a sheet with none of them is read
 * as comma-separated (one column either way).
 */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { '\t': 0, ';': 0, ',': 0 }
  let quoted = false
  let unclosed = false
  let lines = 0
  for (let i = 0; i < text.length && lines < SAMPLE_LINES; i++) {
    const c = text[i]
    if (c === '"' && quoted) {
      if (text[i + 1] === '"') i += 1
      else quoted = false
    }
    // a quote nothing closes is a character, as parseCsv reads it
    else if (c === '"' && !unclosed) {
      if (closingQuote(text, i + 1) === -1) unclosed = true
      else quoted = true
    } else if (quoted) continue
    else if (c === '\n') lines += 1
    else if (c === '\t' || c === ';' || c === ',') counts[c] += 1
  }
  let best: Delimiter = ','
  let max = 0
  // in the list's order, and only a larger count replaces: a tie keeps the earlier
  for (const d of DELIMITERS) {
    if (counts[d] > max) {
      best = d
      max = counts[d]
    }
  }
  return best
}

/** Where the quoted field opened just before `from` closes, or -1 when nothing closes it. */
function closingQuote(text: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] !== '"') continue
    if (text[j + 1] === '"') j += 1
    else return j
  }
  return -1
}

/** A sheet as rows of trimmed cells. The delimiter is detected unless one is given. */
export function parseCsv(input: string, delimiter?: Delimiter): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const sep = delimiter ?? detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  // once a quote has been found that nothing closes, no later one closes either
  let unclosed = false

  const endRow = () => {
    row.push(cell.trim())
    cell = ''
    if (row.some((c) => c !== '')) rows.push(row)
    row = []
  }

  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '"' && !unclosed && cell.trim() === '') {
      const close = closingQuote(text, i + 1)
      if (close === -1) {
        unclosed = true
        cell += c
        i += 1
      } else {
        cell = text.slice(i + 1, close).replace(/""/g, '"')
        i = close + 1
      }
    } else if (c === sep) {
      row.push(cell.trim())
      cell = ''
      i += 1
    } else if (c === '\n' || c === '\r') {
      endRow()
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1
    } else {
      cell += c
      i += 1
    }
  }
  endRow()
  return rows
}
