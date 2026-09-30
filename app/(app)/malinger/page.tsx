import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { ArshjulTab } from '@/components/arshjulet/ArshjulTab'
import { Historikk, type HistoryRow } from '@/components/malinger/Historikk'
import { Kommende, type UpcomingRow } from '@/components/malinger/Kommende'
import { MalingerFrame, type MalingerTab } from '@/components/malinger/MalingerFrame'
import { ModuleChoices } from '@/components/malinger/ModuleChoices'
import { Sporsmalssettet } from '@/components/malinger/Sporsmalssettet'
import { getIndustry, pageIn } from '@/content/industries'
import { INDUSTRY_META } from '@/content/industries/meta'
import type { RailCell, RailView } from '@/components/malinger/YearRail'
import { getExtraQuestions, getFactors } from '@/lib/instrument/read'
import {
  getModulesById,
  getOrgModuleChoices,
  getOrgModuleItemsOff,
  getOrgModuleVariants,
  getOrgModuleWordings,
  getOrgIndustry,
  getPublishedModules,
  getRoundModules,
} from '@/lib/modules/read'
import { getCurrentOrgId } from '@/lib/org/current'
import { getViewerRole } from '@/lib/org/read'
import { getResultsDigest } from '@/lib/results/digest'
import { meanOf, notRelevantShare } from '@/lib/results/resultater'
import { getNotRelevant } from '@/lib/results/read'
import { roundNamer } from '@/lib/rounds/design-name'
import { getRoundFactorKeys, getRoundRows, withParticipation, type RoundListItem, type RoundRow } from '@/lib/rounds/read'
import { getWheel, getWheelMarks } from '@/lib/wheel/read'
import { getReminderStatus } from '@/lib/rounds/reminders'
import { Innstillinger } from '@/components/malinger/Innstillinger'
import { getOrganization } from '@/lib/org/read'
import { getSmsSettings } from '@/lib/settings/read'
import type { DefaultsValues } from '@/app/(app)/malinger/innstillinger-actions'
import { EXTRA_KEYS, PRODUCT_DEFAULTS, SCREENING, getDefaultsLog, getEntryCode, getInviteGreeting, getReach, getSurveyDefaults } from '@/lib/settings/survey'
import { GreetingCard } from '@/components/malinger/GreetingCard'

/**
 * Målinger — design 3 (bundle `isMeasure`, v3 870-1330; logic `mData()`). D-74.
 *
 * One screen for everything measured: the year rail on top, then four tabs — Kommende,
 * Historikk, Årshjul (the Årshjulet screen, re-hosted) and Spørsmålssett — and Innstillinger,
 * the organisation's standard for a survey (D-126). The tab and the
 * rail's year are the URL (`?fane=&ar=&maned=`), rendered here, so a mail that links to
 * `/arshjulet` lands on the Årshjul tab (308, next.config.ts).
 *
 * Every figure is a row or a gated reader: the rounds and their response rates
 * (`participation`), each closed round's index (the same `results_summary` Resultater
 * prints; a puls's is the mean of what it measured, labelled so there), both in one
 * `results_digest` call (0044), and the wheel's forankring month and its notice ladder.
 */
export const dynamic = 'force-dynamic'

const TABS = ['kommende', 'historikk', 'arshjul', 'sporsmal', 'innstillinger'] as const

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

  const [rows, wheel, factors, role, marks] = await Promise.all([getRoundRows(), getWheel(), getFactors(), getViewerRole(), getWheelMarks()])

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
        // 0133: a puls the leader added on the rail says so (v3 6103)
        r.kind === 'puls' && r.status === 'planlagt' && at && marks.get(`${at.y}-${at.m}`) === 'lagt_til'
          ? t('malinger.addedMeta')
          : null,
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
  // a wheel that is off opens nothing, so its months have nothing to change (0133 says no_wheel)
  const canChange = role === 'daglig_leder' && !!wheel?.active
  // the day the wheel sends in a month: its first Tuesday (app.first_tuesday, 0020)
  const firstTuesday = (y: number, m: number) => {
    const day = 1 + ((9 - new Date(Date.UTC(y, m - 1, 1)).getUTCDay()) % 7)
    return oslo(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`, { day: 'numeric', month: 'long' })
  }

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
      // 0133: the rail's month changes are a daglig leder's, for a month still ahead
      const ahead = canChange && (y > now.y || (y === now.y && m > now.m))
      const mark = marks.get(`${y}-${m}`) ?? null
      const monthName = oslo(`${y}-${String(m).padStart(2, '0')}-15T12:00:00Z`, { month: 'long' })
      const short = oslo(`${y}-${String(m).padStart(2, '0')}-15T12:00:00Z`, { month: 'short' }).replace(/\.$/, '')
      const base = {
        month: m,
        short: short.charAt(0).toLocaleUpperCase(locale) + short.slice(1),
        long: monthName,
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
          action: null,
        }
      }
      if (pl) {
        const row = upcomingRows.find((x) => x.id === pl.id)!
        const keys = upcomingKeys[upcoming.indexOf(pl)] ?? []
        const added = pl.status === 'planlagt' && mark === 'lagt_til'
        return {
          ...base,
          state: pl.status === 'apen' ? 'open' : 'planned',
          kind: row.kind,
          sub: pl.status === 'apen' ? t('malinger.state.apen') : added ? t('malinger.rail.added') : t('malinger.state.planlagt'),
          title: t('malinger.rail.plannedTitle', { kind: t(`malinger.kind.${row.kind}`), month: monthName, year: y }),
          text:
            row.kind === 'grunnlinje'
              ? t('malinger.rail.baselineText')
              : [
                  t('malinger.rail.pulseText', {
                    source: added ? 'added' : 'wheel',
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
          // the design's «Hopp over denne» / «Fjern pulsen»: a planned puls only (v3 6125)
          action: ahead && pl.status === 'planlagt' && row.kind === 'puls' ? (added ? 'remove' : 'skip') : null,
        }
      }
      const skipped = !past && mark === 'hoppet_over'
      return {
        ...base,
        state: 'empty',
        kind: m === forankring ? 'forankring' : null,
        sub: y === now.y && m === now.m ? t('malinger.rail.now') : skipped ? t('malinger.rail.skipped') : '',
        title: t('malinger.rail.monthTitle', { month: base.short, year: y }),
        text:
          m === forankring
            ? t('malinger.rail.forankring')
            : past
              ? t('malinger.rail.none')
              : skipped
                ? t('malinger.rail.skippedText')
                : ahead
                  ? t('malinger.rail.addText', { date: firstTuesday(y, m) })
                  : t('malinger.rail.nonePlanned'),
        roundId: null,
        compareWith: null,
        action: ahead ? (skipped ? 'restore' : 'add') : null,
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

  const counts: Partial<Record<MalingerTab, number>> = {
    kommende: upcoming.length,
    historikk: closed.length,
    arshjul: cellsOf(now.y).filter((c) => c.state !== 'empty').length,
    sporsmal: factors.length,
  }

  // ------------------------------------------------------------------ the open round
  // While a round is open the Deltakelse card is that round's (v3 4455-4493): its day, its
  // participation under D-123's rules, and «Lukk runden» and «Send påminnelse» (0133).
  const openRound = upcoming.find((r) => r.status === 'apen' && r.opensAt && r.closesAt) ?? null
  const live =
    tab === 'kommende' && openRound?.opensAt && openRound.closesAt
      ? await (async () => {
          const DAY = 86_400_000
          const opens = new Date(openRound.opensAt!).getTime()
          const closes = new Date(openRound.closesAt!).getTime()
          const days = Math.max(1, Math.round((closes - opens) / DAY))
          const day = Math.min(days, Math.max(1, Math.floor((Date.now() - opens) / DAY) + 1))
          return {
            id: openRound.id,
            title: upcomingRows.find((x) => x.id === openRound.id)?.title ?? name(openRound).title,
            sub: t('malinger.cardLiveSub', {
              day,
              days,
              date: oslo(openRound.closesAt!, { day: 'numeric', month: 'long' }),
              time: oslo(openRound.closesAt!, { hour: '2-digit', minute: '2-digit' }),
            }),
            participation: openRound.participation ?? null,
            reminders: await getReminderStatus(openRound.id),
          }
        })()
      : null

  return (
    <MalingerFrame tab={tab} counts={counts} rail={rail} nextPlannedId={firstPlanned?.id ?? null}>
      {tab === 'kommende' ? (
        <Kommende
          rows={upcomingRows}
          latest={latest}
          latestTitle={latest ? name(latest).title : null}
          canStart={role === 'daglig_leder'}
          roundOpen={upcoming.some((r) => r.status === 'apen')}
          live={live}
        />
      ) : null}
      {tab === 'historikk' ? <Historikk rows={[...history].reverse()} latestYear={latestG?.year ?? null} /> : null}
      {tab === 'arshjul' ? <ArshjulTab /> : null}
      {tab === 'sporsmal' ? <QuestionSet canEdit={role === 'daglig_leder'} /> : null}
      {tab === 'innstillinger' ? <Settings canEdit={role === 'daglig_leder'} /> : null}
    </MalingerFrame>
  )
}

/**
 * How many said «ikke relevant» to each module statement in the organisation's last closed
 * grunnlinje (0087, D-134), by module key and code, so the choice below can be made on it.
 * Empty for anyone but a daglig leder or verneombud, and wherever fewer than k marked it.
 */
async function lastNotRelevant(): Promise<{ year: number; byCode: Map<string, number> } | null> {
  const last = (await getRoundRows())
    .filter((r) => r.status === 'lukket' && r.kind === 'grunnlinje')
    .sort((a, b) => (a.closesAt ?? '').localeCompare(b.closesAt ?? ''))
    .at(-1)
  if (!last) return null
  const counts = await getNotRelevant(last.id)
  if (!Object.keys(counts).some((k) => k.startsWith('module:'))) return null
  const asked = await getRoundModules([last.id])
  const byCode = new Map<string, number>()
  for (const m of await getModulesById(asked.map((r) => r.moduleId)))
    for (const f of m.factors)
      for (const i of f.items) {
        const c = counts[`module:${i.id}`]
        if (c) byCode.set(`${m.key}:${i.code}`, Math.round(notRelevantShare(c) * 100))
      }
  return { year: last.year, byCode }
}

async function QuestionSet({ canEdit }: { canEdit: boolean }) {
  const t = await getTranslations()
  const locale = await getLocale()
  const org = await getCurrentOrgId()
  const [factors, extras, published, chosen, orgIndustry, wordings, off, lastNa, variants] = await Promise.all([
    getFactors(),
    getExtraQuestions(),
    getPublishedModules(org),
    org ? getOrgModuleChoices(org) : Promise.resolve(new Set<string>()),
    getOrgIndustry(),
    org ? getOrgModuleWordings(org) : Promise.resolve(new Map()),
    org ? getOrgModuleItemsOff(org) : Promise.resolve(new Map<string, Set<string>>()),
    lastNotRelevant(),
    org ? getOrgModuleVariants(org) : Promise.resolve(new Map()),
  ])
  // the published list is in the reader's language already (lib/modules/read.ts)
  // the organisation's industry, chosen or from its NACE code (0091)
  const industry = orgIndustry.chosen
  const lang = locale === 'en' ? 'en' : 'no'
  const cards = published
    .map((m) => {
      const slug = INDUSTRY_META.find((i) => i.moduleKey === m.key)?.slug
      const page = slug ? pageIn(getIndustry(slug), lang) : null
      const label = industry && industry.moduleKey === m.key ? industry.label[lang] : null
      // a module in variants (0089): the simplified and extended sets, and the organisation's choice
      const simple = m.variants.find((v) => v.key === 'forenklet')
      const extended = m.variants.find((v) => v.key === 'utvidet')
      const choice = variants.get(m.key)
      const own = simple ? m.factors.filter((f) => f.variant === 'forenklet') : m.factors
      return {
        key: m.key,
        name: m.name,
        description: m.description,
        meta: t('malinger.modules.meta', {
          factors: own.length,
          statements: own.reduce((n, f) => n + f.items.length, 0),
          minutes: simple?.estimatedMinutes ?? m.estimatedMinutes,
        }),
        provisional: m.provisional,
        variant:
          simple && extended
            ? {
                value: choice?.variant ?? ('forenklet' as const),
                factors: choice?.factors ?? m.factors.filter((f) => f.variant === 'utvidet' && !extended.defaultOff.includes(f.key)).map((f) => f.key),
                min: extended.minFactors ?? 1,
                simple: t('malinger.modules.variant.forenklet', {
                  statements: simple.lockedItems.length || own.reduce((n, f) => n + f.items.length, 0),
                  minutes: simple.estimatedMinutes,
                }),
              }
            : null,
        suggested: label ? t('malinger.modules.suggested', { industry: label }) : null,
        on: chosen.has(m.key),
        wording: m.worded && wordings.get(m.key) ? { value: wordings.get(m.key)!.wording, source: wordings.get(m.key)!.source } : null,
        factors: m.factors.map((f) => ({
          key: f.key,
          name: f.name,
          nameVariants: f.nameVariants,
          summary: f.summary,
          variant: f.variant,
          optional: f.optional,
          extendedOnly: f.extendedOnly,
          statements: f.items.map((i) => {
            const pct = lastNa?.byCode.get(`${m.key}:${i.code}`)
            return {
              code: i.code,
              text: i.text,
              variants: i.variants,
              core: i.core ?? false,
              off: off.get(m.key)?.has(i.code) ?? false,
              // what the last grunnlinje said about it (0087): only where at least k marked it
              notRelevant: pct === undefined ? null : t('malinger.modules.itemNa', { pct, year: lastNa!.year }),
            }
          }),
        })),
        href: page?.questionPage ? `/${page.slug}/sporsmal${page.launched ? '' : '?forhandsvis=1'}` : null,
        toggleLabel: t('malinger.modules.toggle', { module: m.name }),
        showLabel: t('malinger.modules.show', { count: own.length }),
        ...(simple ? { showLabelExtended: t('malinger.modules.show', { count: m.factors.filter((f) => f.variant === 'utvidet').length }) } : {}),
      }
    })
    .sort((a, b) => Number(!!b.suggested) - Number(!!a.suggested))
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
      <ModuleChoices
        heading={t('malinger.modules.heading')}
        lead={t('malinger.modules.lead')}
        cards={cards}
        canEdit={canEdit}
        labels={{
          on: t('malinger.modules.on'),
          off: t('malinger.modules.off'),
          onNote: t('malinger.modules.onNote'),
          offNote: t('malinger.modules.offNote'),
          readOnly: t('malinger.modules.readOnly'),
          none: t('malinger.modules.none'),
          failed: t('malinger.modules.failed'),
          seeAll: t('malinger.modules.seeAll'),
          items: {
            lead: t('malinger.modules.itemsLead'),
            off: t('malinger.modules.itemOff'),
            last: t('malinger.modules.itemLast'),
            failed: t('malinger.modules.itemFailed'),
          },
          variant: {
            legend: t('malinger.modules.variant.legend'),
            extended: t('malinger.modules.variant.utvidet'),
            recommend: t('malinger.modules.variant.recommend'),
            // filled in on the client as factors are chosen: {min}, {factors}, {statements}, {minutes}
            pick: t.raw('malinger.modules.variant.pick') as string,
            count: t.raw('malinger.modules.variant.count') as string,
            tooFew: t.raw('malinger.modules.variant.tooFew') as string,
            failed: t('malinger.modules.variant.failed'),
            factorToggle: t.raw('malinger.modules.variant.factorToggle') as string,
          },
          chip: {
            core: t('malinger.modules.chip.core'),
            optional: t('malinger.modules.chip.optional'),
            extendedOnly: t('malinger.modules.chip.extendedOnly'),
            provisional: t('malinger.modules.chip.provisional'),
          },
          provisionalNote: t('malinger.modules.provisionalNote'),
          wording: {
            legend: t('malinger.modules.wording.legend'),
            barnehage: t('malinger.modules.wording.barnehage'),
            skole: t('malinger.modules.wording.skole'),
            begge: t('malinger.modules.wording.begge'),
            suggested: t('malinger.modules.wording.suggested'),
            byDefault: t('malinger.modules.wording.byDefault'),
            chosen: t('malinger.modules.wording.chosen'),
            failed: t('malinger.modules.wording.failed'),
          },
        }}
      />
    </div>
  )
}

/**
 * Målinger › Innstillinger (D-126): the organisation's standard, or the product's before one
 * is saved, with the counts and states it depends on — who can be reached, the SMS rule, the
 * QR code, the threshold, the question sets that are on. Everything is read; nothing here is
 * a placeholder.
 */
async function Settings({ canEdit }: { canEdit: boolean }) {
  const t = await getTranslations()
  const locale = await getLocale()
  const org = await getCurrentOrgId()
  if (!org) return null
  const [saved, log, code, reach, sms, organization, extras, published, chosen, greeting] = await Promise.all([
    getSurveyDefaults(org),
    getDefaultsLog(org),
    getEntryCode(org),
    getReach(),
    getSmsSettings(),
    getOrganization(),
    getExtraQuestions(),
    getPublishedModules(org),
    getOrgModuleChoices(org),
    getInviteGreeting(org),
  ])
  const k = (key: string, values?: Record<string, string | number>) => t(`malinger.innstillinger.${key}`, values)
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', dateStyle: 'long' }).format(new Date(iso))
  const values = saved ?? PRODUCT_DEFAULTS
  const smsOn = sms?.enabled ?? false
  const reachable = reach.email + (smsOn ? reach.phoneOnly : 0)
  const on = published.filter((m) => chosen.has(m.key)).map((m) => m.name)
  const list = (xs: string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(xs)
  const field = (key: string) => (t.has(`malinger.innstillinger.field.${key}`) ? k(`field.${key}`) : key)

  return (
    <>
    <Innstillinger
      initial={{
        closeDaysGrunnlinje: values.closeDaysGrunnlinje,
        closeDaysPuls: values.closeDaysPuls,
        reminderDay: values.reminderDay,
        finalReminder: values.finalReminder,
        quietHours: values.quietHours,
        commentPolicy: values.commentPolicy,
        allowDialogue: values.allowDialogue,
        extras: values.extras.filter((x): x is DefaultsValues['extras'][number] => (EXTRA_KEYS as readonly string[]).includes(x)),
        extrasOffReason: values.extrasOffReason,
      }}
      canEdit={canEdit}
      entryCode={code}
      copy={{
        intro: k('intro'),
        status: saved ? k('statusSaved', { date: date(saved.updatedAt) }) : k('statusNone'),
        readOnly: k('readOnly'),
        s1: k('s1'),
        reachHead: k('reachHead'),
        reachLine: k('reachLine', { reachable, total: reach.total }),
        reachParts: [
          k('reachEmail', { count: reach.email }),
          k(smsOn ? 'reachPhoneSms' : 'reachPhoneNoSms', { count: reach.phoneOnly }),
          k('reachNeither', { count: reach.neither }),
        ],
        reachLink: k('reachLink'),
        channelsHead: k('channelsHead'),
        email: { label: k('email.label'), note: k('email.note') },
        sms: {
          label: k('sms.label'),
          note: smsOn ? k(`sms.on.${sms?.when ?? 'mangler'}`) : k('sms.off'),
          link: k(smsOn ? 'sms.change' : 'sms.setUp'),
        },
        qr: {
          label: k('qr.label'),
          note: k('qr.note'),
          make: k('qr.make'),
          open: k('qr.open'),
          renew: k('qr.renew'),
          renewNote: k('qr.renewNote'),
          none: k(canEdit ? 'qr.none' : 'qr.noneReadOnly'),
          failed: k('qr.failed'),
        },
        quiet: { label: k('quiet.label'), sub: k('quiet.sub') },
        s2: k('s2'),
        core: { label: k('core.label'), note: k('core.note'), link: k('core.link') },
        extrasHead: k('extrasHead'),
        extrasLead: k('extrasLead'),
        extras: extras.map((e) => ({
          key: e.key,
          label: t(`extra.${e.key}.label`),
          sub: (SCREENING as readonly string[]).includes(e.key) ? k('screening') : t(`extra.${e.key}.note`),
          screening: (SCREENING as readonly string[]).includes(e.key),
        })),
        reasonLabel: k('reasonLabel'),
        reasonNote: k('reasonNote'),
        commentHead: t('maleoppsett.commentHead'),
        commentLead: t('maleoppsett.commentLead'),
        comments: (['hvert', 'lave', 'slutt', 'av'] as const).map((c) => ({
          value: c,
          label: t(`maleoppsett.comment.${c}.label`),
          note: t(`maleoppsett.comment.${c}.note`),
        })),
        dialogue: t('maleoppsett.dialogue'),
        modules: {
          label: k('modules.label'),
          note: on.length ? k('modules.on', { modules: list(on) }) : k('modules.none'),
          link: k('modules.link'),
        },
        s3: k('s3'),
        closeHeadGrunnlinje: k('closeGrunnlinje'),
        closeHeadPuls: k('closePuls'),
        closeNote: k('closeNote'),
        closes: [5, 7, 14].map((d) => ({ value: d, label: t('maleoppsett.closeDays', { days: d }) })),
        reminderHead: t('maleoppsett.reminderHead'),
        reminders: [null, 2, 4].map((d) => ({
          value: d,
          label: d === null ? t('maleoppsett.reminderNone') : t('maleoppsett.reminderDay', { day: d }),
        })),
        final: { label: k('final.label'), sub: k('final.sub') },
        s4: k('s4'),
        threshold: k('threshold', { k: organization?.threshold ?? 5 }),
        thresholdLink: k('thresholdLink'),
        logHead: k('logHead'),
        log: log.map((l) => k('logLine', { date: date(l.at), fields: list(l.keys.map(field)) })),
        logNone: k('logNone'),
        save: k('save'),
        saving: k('saving'),
        saved: k('saved'),
        savedRounds: k('savedRounds'),
        problems: {
          reason_required: k('problem.reason_required'),
          invalid: k('problem.invalid'),
          not_allowed: k('problem.not_allowed'),
          failed: k('problem.failed'),
        },
      }}
    />
      {/* the invitation's greeting (0099, P1-1), below the standard it goes out with */}
      <div className="mt-[14px]">
      <GreetingCard
        initial={greeting}
        canEdit={canEdit}
        copy={{
          head: k('greeting.head'),
          lead: k('greeting.lead'),
          placeholder: k('greeting.placeholder'),
          save: k('greeting.save'),
          saved: k('greeting.saved'),
          cleared: k('greeting.cleared'),
          onlyLeader: k('greeting.onlyLeader'),
          failed: k('greeting.failed'),
        }}
      />
      </div>
    </>
  )
}
