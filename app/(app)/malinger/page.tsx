import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { ArshjulTab } from '@/components/arshjulet/ArshjulTab'
import { Historikk, type HistoryRow } from '@/components/malinger/Historikk'
import { Kommende, type UpcomingRow } from '@/components/malinger/Kommende'
import { MalingerFrame, type MalingerTab } from '@/components/malinger/MalingerFrame'
import { Sporsmalssettet } from '@/components/malinger/Sporsmalssettet'
import type { RailCell, RailView } from '@/components/malinger/YearRail'
import { getExtraQuestions, getFactors } from '@/lib/instrument/read'
import { getViewerRole } from '@/lib/org/read'
import { getResultsDigest } from '@/lib/results/digest'
import { meanOf } from '@/lib/results/resultater'
import { roundNamer } from '@/lib/rounds/design-name'
import { getRoundFactorKeys, getRoundRows, withParticipation, type RoundListItem, type RoundRow } from '@/lib/rounds/read'
import { getWheel } from '@/lib/wheel/read'

/**
 * Målinger — design 3 (bundle `isMeasure`, v3 870-1330; logic `mData()`). D-74.
 *
 * One screen for everything measured: the year rail on top, then four tabs — Kommende,
 * Historikk, Årshjul (the Årshjulet screen, re-hosted) and Spørsmålssett. The tab and the
 * rail's year are the URL (`?fane=&ar=&maned=`), rendered here, so a mail that links to
 * `/arshjulet` lands on the Årshjul tab (308, next.config.ts).
 *
 * Every figure is a row or a gated reader: the rounds and their response rates
 * (`participation`), each closed round's index (the same `results_summary` Resultater
 * prints; a puls's is the mean of what it measured, labelled so there), both in one
 * `results_digest` call (0044), and the wheel's forankring month and its notice ladder.
 */
export const dynamic = 'force-dynamic'

const TABS = ['kommende', 'historikk', 'arshjul', 'sporsmal'] as const

const Params = z.object({
  fane: z.enum(TABS).optional().catch(undefined),
  ar: z.coerce.number().int().min(2020).max(2100).optional().catch(undefined),
  maned: z.coerce.number().int().min(1).max(12).optional().catch(undefined),
})

export default async function MalingerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const params = Params.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])))
  const tab: MalingerTab = params.fane ?? 'kommende'
  const t = await getTranslations()
  const locale = await getLocale()

  const [rows, wheel, factors, role] = await Promise.all([getRoundRows(), getWheel(), getFactors(), getViewerRole()])

  const oslo = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', ...opts }).format(new Date(iso))
  const ym = (iso: string) => {
    const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit' })
      .format(new Date(iso))
      .split('-')
    return { y: Number(y), m: Number(m) }
  }
  const now = ym(new Date().toISOString())
  const name = roundNamer(t, locale)

  const byClose = (a: RoundRow, b: RoundRow) => (a.closesAt ?? '').localeCompare(b.closesAt ?? '')
  const closedRows = rows.filter((r) => r.status === 'lukket').sort(byClose)
  const comingRows = rows
    .filter((r) => r.status === 'apen' || r.status === 'planlagt')
    .sort((a, b) => (a.opensAt ?? '￿').localeCompare(b.opensAt ?? '￿'))

  // every round's response rate and every closed round's index, in one call (0044)
  const [digest, upcomingKeys] = await Promise.all([
    getResultsDigest({ participation: rows.map((r) => r.id), summaries: closedRows.map((r) => r.id) }),
    Promise.all(comingRows.map((r) => getRoundFactorKeys(r.id))),
  ])
  const closed = withParticipation(closedRows, digest)
  const upcoming = withParticipation(comingRows, digest)
  const latest = closed.at(-1) ?? null
  const latestG = closed.filter((r) => r.kind === 'grunnlinje').at(-1) ?? null
  const summaries = digest.summaries
  const indexOf = (r: RoundListItem): number | null => {
    const s = summaries.get(r.id)
    if (s?.status !== 'ok') return null
    return r.kind === 'grunnlinje' ? s.index : meanOf(s.factors.map((f) => f.index))
  }
  const factorIndex = (r: RoundListItem): Record<string, number> => {
    const s = summaries.get(r.id)
    return s?.status === 'ok' ? Object.fromEntries(s.factors.map((f) => [f.key, f.index])) : {}
  }
  const keysOf = (r: RoundListItem): string[] => {
    const s = summaries.get(r.id)
    return s?.status === 'ok' ? s.factors.map((f) => f.key) : []
  }
  const list = (keys: string[]) =>
    new Intl.ListFormat(locale, { type: 'conjunction' }).format(keys.map((k) => t(`factor.${k}.short`).toLocaleLowerCase(locale)))

  // ------------------------------------------------------------------ history
  const history: HistoryRow[] = closed.map((r, i) => {
    const idx = indexOf(r)
    const before = closed
      .slice(0, i)
      .filter((p) => p.kind === r.kind)
      .at(-1)
    // a grunnlinje against the one before; a puls against the puls before, on the factors
    // both measured — two pulses asking about different things have no common mean
    const d = (() => {
      if (!before || idx === null) return null
      if (r.kind === 'grunnlinje') {
        const was = indexOf(before)
        return was === null ? null : idx - was
      }
      const a = factorIndex(r),
        b = factorIndex(before)
      const common = Object.keys(a).filter((k) => b[k] !== undefined)
      const ma = meanOf(common.map((k) => a[k]!)),
        mb = meanOf(common.map((k) => b[k]!))
      return ma === null || mb === null ? null : ma - mb
    })()
    const n = name(r)
    const keys = keysOf(r)
    return {
      id: r.id,
      kind: n.kind,
      year: r.year,
      title: n.title,
      closesAt: r.closesAt ?? '',
      meta: [
        t('malinger.closedOn', { date: r.closesAt ? oslo(r.closesAt, { day: 'numeric', month: 'long', year: 'numeric' }) : '' }),
        ...(r.kind === 'grunnlinje'
          ? [t('malinger.questionCount', { count: r.questionCount }), t('malinger.factorCount', { count: keys.length })]
          : keys.length
            ? [list(keys)]
            : []),
      ].join(' · '),
      answered: r.participation?.answered ?? null,
      headcount: r.participation?.headcount ?? null,
      pct: r.participation?.pct ?? null,
      index: idx,
      delta:
        d !== null
          ? r.kind === 'grunnlinje'
            ? t('malinger.hist.fromYear', { delta: d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0', year: before!.year })
            : t('malinger.hist.fromPulse', { delta: d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0' })
          : !before
            ? t(r.kind === 'grunnlinje' ? 'malinger.hist.firstBaseline' : 'malinger.hist.firstPulse')
            : null,
      deltaValue: d ?? 0,
      compareWith: r.kind === 'grunnlinje' && latestG && r.id !== latestG.id ? { id: latestG.id, year: latestG.year } : null,
      latest: r.id === latest?.id,
    }
  })

  // ------------------------------------------------------------------ upcoming
  const firstPlanned = upcoming.find((r) => r.status === 'planlagt')
  const upcomingRows: UpcomingRow[] = upcoming.map((r, i) => {
    const at = r.opensAt ? ym(r.opensAt) : null
    const keys = upcomingKeys[i] ?? []
    const month = r.opensAt ? oslo(r.opensAt, { month: 'long' }) : ''
    return {
      id: r.id,
      kind: r.kind === 'puls' ? 'puls' : 'grunnlinje',
      title:
        r.kind === 'puls'
          ? t('malinger.pulseListTitle', { kind: t('malinger.kind.puls'), month, year: r.year })
          : t('malinger.roundTitle', { kind: t('malinger.kind.grunnlinje'), year: r.year }),
      meta: [
        t(`malinger.audience.${r.audience}`),
        t('malinger.questionCount', { count: r.questionCount }),
        r.status === 'apen' && r.closesAt
          ? t('malinger.closesAt', { date: oslo(r.closesAt, { day: 'numeric', month: 'long' }) })
          : r.opensAt
            ? t('malinger.closesOn', { date: oslo(r.opensAt, { day: 'numeric', month: 'long' }) })
            : null,
        r.kind === 'puls' && keys.length ? list(keys) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      state: r.status === 'apen' ? 'apen' : r.id === firstPlanned?.id ? 'neste' : 'planlagt',
      answered: r.status === 'apen' ? (r.participation?.answered ?? 0) : null,
      headcount: r.participation?.headcount ?? null,
      pct: r.status === 'apen' ? (r.participation?.pct ?? 0) : null,
      at,
    }
  })

  // ------------------------------------------------------------------ the rail
  const years = [now.y - 1, now.y, now.y + 1]
  const year = params.ar && years.includes(params.ar) ? params.ar : now.y
  const forankring = wheel ? ((wheel.baselineMonth + 10) % 12) + 1 : null
  const lead = wheel?.ladder.find((s) => s.audience === 'verneombud')?.leadDays ?? null

  const cellsOf = (y: number): RailCell[] =>
    Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const done = closed.filter((r) => r.closesAt && ym(r.closesAt).y === y && ym(r.closesAt).m === m)
      const d = done.find((r) => r.kind === 'grunnlinje') ?? done.at(-1)
      const pl = d
        ? undefined
        : (upcoming.find((r) => r.opensAt && ym(r.opensAt).y === y && ym(r.opensAt).m === m && r.kind === 'grunnlinje') ??
          upcoming.find((r) => r.opensAt && ym(r.opensAt).y === y && ym(r.opensAt).m === m))
      const past = y < now.y || (y === now.y && m < now.m)
      const monthName = oslo(`${y}-${String(m).padStart(2, '0')}-15T12:00:00Z`, { month: 'long' })
      const short = oslo(`${y}-${String(m).padStart(2, '0')}-15T12:00:00Z`, { month: 'short' }).replace(/\.$/, '')
      const base = {
        month: m,
        short: short.charAt(0).toLocaleUpperCase(locale) + short.slice(1),
        isNow: y === now.y && m === now.m,
      }

      if (d) {
        const h = history.find((x) => x.id === d.id)!
        return {
          ...base,
          state: 'done',
          kind: h.kind,
          sub: h.index !== null ? t('malinger.rail.index', { index: h.index }) : '',
          title: h.title,
          text: [
            h.answered !== null
              ? t('malinger.rail.answered', { answered: h.answered, total: h.headcount ?? 0, pct: h.pct ?? 0 })
              : null,
            h.index !== null ? t('malinger.rail.indexText', { index: h.index }) : null,
            h.delta,
          ]
            .filter(Boolean)
            .join(' · '),
          roundId: d.id,
          compareWith: h.compareWith,
        }
      }
      if (pl) {
        const row = upcomingRows.find((x) => x.id === pl.id)!
        const keys = upcomingKeys[upcoming.indexOf(pl)] ?? []
        return {
          ...base,
          state: pl.status === 'apen' ? 'open' : 'planned',
          kind: row.kind,
          sub: t(pl.status === 'apen' ? 'malinger.state.apen' : 'malinger.state.planlagt'),
          title: t('malinger.rail.plannedTitle', { kind: t(`malinger.kind.${row.kind}`), month: monthName, year: y }),
          text:
            row.kind === 'grunnlinje'
              ? t('malinger.rail.baselineText')
              : [
                  t('malinger.rail.pulseText', {
                    count: pl.questionCount,
                    factors: keys.length ? list(keys) : t('malinger.rail.openMeasures'),
                    date: pl.opensAt ? oslo(pl.opensAt, { day: 'numeric', month: 'long' }) : '',
                    time: pl.opensAt ? oslo(pl.opensAt, { hour: '2-digit', minute: '2-digit' }) : '',
                  }),
                  lead !== null ? t('malinger.rail.leadText', { days: lead }) : null,
                ]
                  .filter(Boolean)
                  .join(' '),
          roundId: pl.id,
          compareWith: null,
        }
      }
      return {
        ...base,
        state: 'empty',
        kind: m === forankring ? 'forankring' : null,
        sub: y === now.y && m === now.m ? t('malinger.rail.now') : '',
        title: t('malinger.rail.monthTitle', { month: base.short, year: y }),
        text: m === forankring ? t('malinger.rail.forankring') : past ? t('malinger.rail.none') : t('malinger.rail.nonePlanned'),
        roundId: null,
        compareWith: null,
      }
    })

  const cells = cellsOf(year)
  const next = upcoming.find((r) => r.status === 'planlagt' && r.opensAt)
  const rail: RailView = {
    year,
    years,
    cells,
    selected: params.maned ?? (year === now.y ? now.m : (cells.find((c) => c.state !== 'empty')?.month ?? 1)),
    count: t('malinger.rail.count', {
      count: cells.filter((c) => c.state !== 'empty').length,
      year,
      done: cells.filter((c) => c.state === 'done').length,
    }),
    next: next?.opensAt
      ? t(ym(next.opensAt).y === now.y ? 'malinger.rail.nextIn' : 'malinger.rail.nextInYear', {
          kind: t(`malinger.kind.${next.kind === 'puls' ? 'puls' : 'grunnlinje'}`),
          month: oslo(next.opensAt, { month: 'long' }),
          year: ym(next.opensAt).y,
        })
      : null,
  }

  const counts: Record<MalingerTab, number> = {
    kommende: upcoming.length,
    historikk: closed.length,
    arshjul: cellsOf(now.y).filter((c) => c.state !== 'empty').length,
    sporsmal: factors.length,
  }

  return (
    <MalingerFrame tab={tab} counts={counts} rail={rail} nextPlannedId={firstPlanned?.id ?? null}>
      {tab === 'kommende' ? (
        <Kommende
          rows={upcomingRows}
          latest={latest}
          latestTitle={latest ? name(latest).title : null}
          canStart={role === 'daglig_leder'}
          roundOpen={upcoming.some((r) => r.status === 'apen')}
        />
      ) : null}
      {tab === 'historikk' ? <Historikk rows={[...history].reverse()} latestYear={latestG?.year ?? null} /> : null}
      {tab === 'arshjul' ? <ArshjulTab /> : null}
      {tab === 'sporsmal' ? <QuestionSet /> : null}
    </MalingerFrame>
  )
}

async function QuestionSet() {
  const t = await getTranslations()
  const [factors, extras] = await Promise.all([getFactors(), getExtraQuestions()])
  return (
    <div className="mt-[20px]">
      <Sporsmalssettet
        heading={t('malinger.sporsmalssettet')}
        lead={t('malinger.qsLead')}
        extraHeading={t('malinger.extraHeading')}
        factors={factors.map((f) => ({
          key: f.key,
          label: t(`factor.${f.key}.label`),
          lawRef: f.lawRef,
          count: t('malinger.statementCount', { count: f.ordinals.length }),
          description: t(`factor.${f.key}.desc`),
          // numbered from the ordinals the database holds, not from a fixed 1..3
          statements: f.ordinals.map((n) => t(`factor.${f.key}.s${n}`)),
        }))}
        extras={extras.map((e) => ({
          key: e.key,
          label: t(`extra.${e.key}.label`),
          count: t('malinger.extraCount', { count: 1 }),
          text: t(`extra.${e.key}.text`),
          note: t(`extra.${e.key}.note`),
        }))}
      />
    </div>
  )
}
