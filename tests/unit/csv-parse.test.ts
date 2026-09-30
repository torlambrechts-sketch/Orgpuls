import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv } from '@/lib/csv/parse'

/**
 * The one CSV reader (D-76's backlog, D-172): the employee import on the server and in its
 * preview, and the admin contact import.
 */

describe('detectDelimiter', () => {
  it('finds a tab-separated paste, a semicolon export and a comma file', () => {
    expect(detectDelimiter('Navn\tE-post\tGruppe\nKari\tkari@x.no\tDrift')).toBe('\t')
    expect(detectDelimiter('Navn;E-post;Gruppe\nKari;kari@x.no;Drift')).toBe(';')
    expect(detectDelimiter('Navn,E-post,Gruppe\nKari,kari@x.no,Drift')).toBe(',')
  })

  it('is not fooled by a comma inside a name', () => {
    expect(detectDelimiter('Nordmann, Kari\tkari@x.no\tDrift\nHansen, Per\tper@x.no\tSalg')).toBe('\t')
    expect(detectDelimiter('Nordmann, Kari;kari@x.no;Drift')).toBe(';')
  })

  it('does not count delimiters inside quotes', () => {
    expect(detectDelimiter('"a;b;c;d",e,f\n"g;h;i",j,k')).toBe(',')
    expect(detectDelimiter('"a"";b;c",d,e')).toBe(',')
  })

  it('reads past a quote that nothing closes', () => {
    expect(detectDelimiter('"Kari;kari@x.no;Drift\nPer;per@x.no;Salg')).toBe(';')
  })

  it('reads a sheet with none of the three as comma-separated, and breaks a tie by tab, then semicolon', () => {
    expect(detectDelimiter('Kari Nordmann\nPer Hansen')).toBe(',')
    expect(detectDelimiter('a\tb;c')).toBe('\t')
    expect(detectDelimiter('a;b,c')).toBe(';')
  })
})

describe('parseCsv', () => {
  it('splits plain rows and trims every cell', () => {
    expect(parseCsv('Kari Nordmann , kari@x.no ,Drift\nPer Hansen,per@x.no,Salg')).toEqual([
      ['Kari Nordmann', 'kari@x.no', 'Drift'],
      ['Per Hansen', 'per@x.no', 'Salg'],
    ])
  })

  it('keeps the delimiter inside a quoted field', () => {
    expect(parseCsv('"Nordmann, Kari",kari@x.no,"Drift, nord"')).toEqual([['Nordmann, Kari', 'kari@x.no', 'Drift, nord']])
    expect(parseCsv('"Nordmann; Kari";kari@x.no;Drift')).toEqual([['Nordmann; Kari', 'kari@x.no', 'Drift']])
  })

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('"Kari ""KN"" Nordmann",kari@x.no')).toEqual([['Kari "KN" Nordmann', 'kari@x.no']])
    expect(parseCsv('"""",x')).toEqual([['"', 'x']])
  })

  it('keeps a line break inside a quoted field in its record', () => {
    expect(parseCsv('"Kari\nNordmann",kari@x.no\nPer,per@x.no')).toEqual([
      ['Kari\nNordmann', 'kari@x.no'],
      ['Per', 'per@x.no'],
    ])
  })

  it('reads CRLF, a lone CR and LF alike, and skips blank lines', () => {
    const rows = [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]
    expect(parseCsv('a,b\r\nc,d\r\ne,f\r\n')).toEqual(rows)
    expect(parseCsv('a,b\rc,d\re,f')).toEqual(rows)
    expect(parseCsv('\n\na,b\n\n  \nc,d\ne,f\n\n')).toEqual(rows)
    expect(parseCsv('"a",b\r\n"c",d\r\n"e",f')).toEqual(rows)
  })

  it('drops a byte-order mark, so the first header is its own name', () => {
    const rows = parseCsv('﻿Navn;E-post\nKari;kari@x.no')
    expect(rows[0]).toEqual(['Navn', 'E-post'])
    expect(rows[0]![0]).toHaveLength(4)
  })

  it('keeps empty cells in their columns', () => {
    expect(parseCsv('Kari\t\tDrift\t\t+47 900 00 000')).toEqual([['Kari', '', 'Drift', '', '+47 900 00 000']])
    expect(parseCsv('a,,c,')).toEqual([['a', '', 'c', '']])
    expect(parseCsv('"",b')).toEqual([['', 'b']])
  })

  it('is lenient: a quote inside a field, text after a closing quote, a quote never closed', () => {
    expect(parseCsv('Kari "KN" Nordmann,kari@x.no')).toEqual([['Kari "KN" Nordmann', 'kari@x.no']])
    expect(parseCsv('"Kari" Nordmann,kari@x.no')).toEqual([['Kari Nordmann', 'kari@x.no']])
    expect(parseCsv('"Kari,kari@x.no\nPer,per@x.no')).toEqual([
      ['"Kari', 'kari@x.no'],
      ['Per', 'per@x.no'],
    ])
  })

  it('uses the delimiter it is given', () => {
    expect(parseCsv('a,b;c', ';')).toEqual([['a,b', 'c']])
  })

  it('reads nothing as no rows', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('﻿')).toEqual([])
    expect(parseCsv('\n \r\n')).toEqual([])
  })

  it('reads the sheet the employee import is documented with', () => {
    const sheet =
      '﻿Navn;E-post;Gruppe;Leder;Mobil;Språk\r\n' +
      '"Nordmann, Kari";kari@nordvik.no;Drift;;"+47 900 00 001";no\r\n' +
      'Piotr Nowak;piotr@nordvik.no;"Verksted; hall 2";;;pl\r\n'
    expect(parseCsv(sheet)).toEqual([
      ['Navn', 'E-post', 'Gruppe', 'Leder', 'Mobil', 'Språk'],
      ['Nordmann, Kari', 'kari@nordvik.no', 'Drift', '', '+47 900 00 001', 'no'],
      ['Piotr Nowak', 'piotr@nordvik.no', 'Verksted; hall 2', '', '', 'pl'],
    ])
  })
})
