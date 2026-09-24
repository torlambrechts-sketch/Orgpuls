import type { RoundRef } from '@/lib/results/resultater'
import type { RoundRow } from './read'

type Translate = (key: string, values?: Record<string, string | number>) => string

/**
 * How design 3 names a round: a grunnlinje by its year ("Grunnlinje 2026", chip "2026"), a
 * puls by the month it closed ("Puls mai 2025", chip "Mai 25"). Resultater and Kommentarer
 * both name rounds this way, so they share it. A round not closed yet is named by the
 * month it opens. Intl's short Norwegian month carries a full stop ("aug."), which the
 * design does not print.
 */
export function roundNamer(t: Translate, locale: string) {
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', ...opts })
  const shortFmt = fmt({ month: 'short' })
  const longFmt = fmt({ month: 'long' })
  const yearFmt = fmt({ year: 'numeric' })
  const short = (iso: string | null, year: number) => {
    if (!iso) return String(year)
    const m = shortFmt.format(new Date(iso)).replace(/\.$/, '')
    return `${m.charAt(0).toLocaleUpperCase(locale)}${m.slice(1)} ${yearFmt.format(new Date(iso)).slice(2)}`
  }
  const long = (iso: string | null) => (iso ? longFmt.format(new Date(iso)) : '')

  return (r: RoundRow): RoundRef => {
    const at = r.status === 'lukket' ? r.closesAt : r.opensAt
    const kind = r.kind === 'puls' ? 'puls' : 'grunnlinje'
    return {
      id: r.id,
      kind,
      label: kind === 'grunnlinje' ? String(r.year) : short(at, r.year),
      title:
        kind === 'grunnlinje'
          ? t('malinger.roundTitle', { kind: t('malinger.kind.grunnlinje'), year: r.year })
          : t('resultater.pulseTitle', { month: long(at), year: r.year }),
      year: r.year,
      closesAt: r.closesAt,
      month: short(at, r.year),
      planned: r.status !== 'lukket',
      open: r.status === 'apen',
    }
  }
}
