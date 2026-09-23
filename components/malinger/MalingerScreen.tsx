import { getLocale, getTranslations } from 'next-intl/server'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Sporsmalssettet } from '@/components/malinger/Sporsmalssettet'
import { WheelStrip, type WheelStripView } from '@/components/malinger/WheelStrip'
import type { ExtraQuestion, Factor } from '@/lib/instrument/read'
import { rateColour, type Participation } from '@/lib/participation/read'
import type { RoundListItem, RoundState } from '@/lib/rounds/read'
import { roundTitle } from '@/lib/rounds/title'

/**
 * Målinger, the rendering. Bundle lines 502-658.
 *
 * Split out of the page for the reason the other screens are split: a rendering that
 * takes a value can be pointed at the pixel gate without a signed-in session, and the
 * data half stays a list of reads. The markup is unchanged from the version that was
 * measured against 02-malinger-measure.png.
 *
 * The Årshjulet card and the planned-pulse rows D-05 omitted are both rendered now that
 * the year wheel stores a schedule and plans rounds (D-53, D-46).
 */

/** Status pill and row actions per state. The hexes are the design's (bundle 4249-4263). */
const STATE_STYLE: Record<RoundState, { background: string; color: string }> = {
  lukket: { background: '#CFE7E4', color: '#20431C' },
  arkivert: { background: 'rgba(25,21,16,.07)', color: '#5F5849' },
  neste: { background: '#FBEBBE', color: '#5C4600' },
  planlagt: { background: 'rgba(25,21,16,.05)', color: '#5F5849' },
  // the design has no open round on this list; it takes "Neste"'s amber, the design's
  // colour for the round that is live next, rather than a colour of its own (D-46)
  apen: { background: '#FBEBBE', color: '#5C4600' },
}

/**
 * The order the design lists rounds in (bundle 4249-4267): the latest result, then what is
 * coming in the order it comes, then the archive. A round taking answers now goes first —
 * the design has none, and it is the one thing on the list that is happening.
 */
const STATE_ORDER: RoundState[] = ['apen', 'lukket', 'neste', 'planlagt', 'arkivert']

function listOrder(rounds: RoundListItem[]): RoundListItem[] {
  const opening = (r: RoundListItem) => r.opensAt ?? '\uffff'
  return [...rounds].sort((a, b) => {
    const byState = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state)
    if (byState !== 0) return byState
    // planned rounds come in the order they open; everything else newest first, which is
    // the order getRounds already holds them in
    return a.state === 'planlagt' ? opening(a).localeCompare(opening(b)) : 0
  })
}

export interface MalingerView {
  rounds: RoundListItem[]
  /** the round the Deltakelse card describes: the most recent one */
  current: RoundListItem | null
  participation: Participation | null
  factors: Factor[]
  extras: ExtraQuestion[]
  /** the Årshjulet card, or null when the organisation has no wheel */
  strip: WheelStripView | null
  /** the next round the wheel has planned, which "＋ Ny måling" opens the setup of */
  nextPlannedId: string | null
  /** each puls's factors, from app.round_factors — the design names them on the row */
  pulseFactors: Record<string, string[]>
}

export async function MalingerScreen({ view }: { view: MalingerView }) {
  const t = await getTranslations()
  const locale = await getLocale()
  const { current, participation, factors, extras } = view
  const rounds = listOrder(view.rounds)

  // "ytringsklima og arbeidsmengde": the factors' compact names, in running text
  const factorList = (keys: string[]) =>
    keys.length === 0
      ? null
      : new Intl.ListFormat(locale, { type: 'conjunction' }).format(
          keys.map((k) => t(`factor.${k}.short`).toLocaleLowerCase(locale)),
        )

  const closedOn = (iso: string | null, year: number) => {
    if (!iso) return null
    // the year is printed only for a past year, as the design does: "lukket 11. september
    // 2025", but "lukket 14. september" this year and "går ut 12. mars" for a 2027 puls,
    // whose title already carries its year
    const showYear = year < new Date().getFullYear()
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Oslo',
      ...(showYear ? { year: 'numeric' } : {}),
    }).format(new Date(iso))
  }

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[16px] md:px-[28px] pb-[60px] pt-[30px]">
      <div className="flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">
            {t('malinger.title')}
          </h1>
          <p className="mt-[9px] max-w-[600px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('malinger.lead')}
          </p>
        </div>
        <span className="flex flex-none flex-wrap gap-[9px]">
          {/*
            Both are the design's buttons, as the links they are (D-06). The preview opens
            the round employees would meet next; "Ny måling" opens the setup of the next
            round the year wheel has planned, which is where a new measurement is made
            in this product — the wheel creates rounds, Måleoppsett shapes them (D-58).
          */}
          <ButtonLink href={{ pathname: '/forhandsvis' }} tone="secondary">
            {t('malinger.previewAsEmployee')}
          </ButtonLink>
          <ButtonLink
            href={
              view.nextPlannedId
                ? { pathname: '/maleoppsett', query: { runde: view.nextPlannedId } }
                : { pathname: '/maleoppsett', query: { type: 'grunnlinje' } }
            }
            tone="primary"
          >
            {t('malinger.newMeasurement')}
          </ButtonLink>
        </span>
      </div>

      {view.strip ? <WheelStrip view={view.strip} /> : null}

      <div className="mt-[24px] flex flex-col gap-[12px]">
        {rounds.map((round) => (
          <RoundRow
            key={round.id}
            round={round}
            date={closedOn(round.closesAt, round.year)}
            factors={factorList(view.pulseFactors[round.id] ?? [])}
            month={
              round.opensAt
                ? new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'Europe/Oslo' }).format(
                    new Date(round.opensAt),
                  )
                : null
            }
            t={t}
          />
        ))}
      </div>

      {current ? (
        <section className="mt-[28px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
          <div className="flex flex-wrap items-start justify-between gap-[18px]">
            <span className="min-w-0">
              <h2 className="m-0 font-display text-[21px] font-semibold">
                {t('malinger.deltakelse')}
              </h2>
              <span className="mt-[4px] block text-[13px] text-mut">
                {t('malinger.cardRoundTitle', { title: roundTitle(t, current) })}
                {' · '}
                {t('malinger.cardRoundSub', {
                  date: closedOn(current.closesAt, current.year) ?? '',
                })}
              </span>
            </span>
            {participation ? (
              <span className="flex-none text-right">
                <span className="block font-display text-[32px] font-semibold leading-none">
                  {t('malinger.percent', { pct: participation.pct })}
                </span>
                <span className="mt-[2px] block text-[12px] text-mut">
                  {t('malinger.rateLine', {
                    answered: participation.answered,
                    total: participation.headcount,
                  })}
                </span>
              </span>
            ) : null}
          </div>

          {participation ? (
            <>
              <div className="mt-[18px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
                {[...participation.groups]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((g) => (
                    <div
                      key={g.group_name}
                      className="rounded-tile border border-line bg-bg px-[16px] py-[14px]"
                    >
                      <div className="flex items-baseline justify-between gap-[10px]">
                        <span className="text-[13.5px] font-semibold">{g.group_name}</span>
                        <span className="text-[13px] font-bold">
                          {t('malinger.percent', { pct: g.pct })}
                        </span>
                      </div>
                      <span
                        className="mt-[9px] block h-[7px] overflow-hidden rounded-pill"
                        style={{ background: 'rgba(25,21,16,.08)' }}
                      >
                        <span
                          className="block h-full rounded-pill"
                          style={{ width: `${g.pct}%`, background: rateColour(g.pct) }}
                        />
                      </span>
                      <div className="mt-[6px] text-[11.5px] text-mut">
                        {t('malinger.groupLine', { answered: g.answered, total: g.headcount })}
                      </div>
                      {g.thin ? (
                        <div className="mt-[4px] text-[11px] leading-[1.4] text-caution [text-wrap:pretty]">
                          {t('malinger.thinNote')}
                        </div>
                      ) : null}
                    </div>
                  ))}
              </div>

              <div className="mt-[18px] flex flex-wrap items-start justify-between gap-[18px] border-t border-line pt-[16px]">
                <span className="min-w-[280px] max-w-[600px] flex-1">
                  <span className="block text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
                    {t('malinger.privacy')}
                  </span>
                  <span className="mt-[8px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                    {t('malinger.reminderClosed')}
                  </span>
                </span>
                {/*
                  The design's live round offers "Lukk runden" and "Send påminnelse".
                  Both rounds in the database are closed, so the design's own closed
                  state applies: a single "Start neste puls nå".
                */}
                <span className="flex flex-none flex-wrap gap-[9px]">
                  <Button size="panel" tone="primary">
                    {t('malinger.startNextPulse')}
                  </Button>
                </span>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

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
    </main>
  )
}

function RoundRow({
  round,
  date,
  factors,
  month,
  t,
}: {
  round: RoundListItem
  /** a puls's factors in running text, or null */
  factors: string | null
  /** the round's closing date, formatted: "lukket …" once closed, "går ut …" before */
  date: string | null
  /** the month it opens, for a puls's list title — "Puls · desember 2026" */
  month: string | null
  t: Awaited<ReturnType<typeof getTranslations>>
}) {
  const archived = round.state === 'arkivert'
  const closed = round.status === 'lukket'
  const planned = round.status === 'planlagt'
  // a planned round has been sent to nobody; the design prints "Ikke sendt" and "—" for it
  // rather than a 0 % over a roster nobody was asked (bundle 4262)
  const p = planned ? null : round.participation

  /**
   * An archived row's bar is the neutral rule colour, not its rate colour — the design
   * prints #C4BCA8 for the 2025 round even though 77 % would otherwise be amber. The
   * muting is the point: an archived rate is history, not something to act on.
   */
  const bar = archived ? '#C4BCA8' : p ? rateColour(p.pct) : '#C4BCA8'

  const title =
    round.kind === 'puls' && month
      ? t('malinger.pulseListTitle', { kind: t('malinger.kind.puls'), month, year: round.year })
      : roundTitle(t, round)

  const setupHref = { pathname: '/maleoppsett', query: { runde: round.id } }

  return (
    <div
      className="grid items-center gap-[16px] rounded-note border border-line bg-sf px-[22px] py-[18px] md:[grid-template-columns:minmax(0,2fr)_minmax(0,1.3fr)_118px_250px]"
    >
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold">{title}</span>
        <span className="mt-[3px] block text-[12.5px] text-mut">
          {[
            t(`malinger.audience.${round.audience}`),
            t('malinger.questionCount', { count: round.questionCount }),
            date ? t(closed ? 'malinger.closedOn' : 'malinger.closesOn', { date }) : null,
            factors,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>

      <span className="min-w-0">
        <span className="block text-[12.5px] text-mut">
          {p
            ? t('malinger.rateLabel', { answered: p.answered, total: p.headcount })
            : t('malinger.notSent')}
        </span>
        <span className="mt-[6px] flex items-center gap-[9px]">
          <span
            className="h-[7px] flex-1 overflow-hidden rounded-pill"
            style={{ background: 'rgba(25,21,16,.08)' }}
          >
            <span
              className="block h-full rounded-pill"
              style={{ width: `${p?.pct ?? 0}%`, background: bar }}
            />
          </span>
          <span className="flex-none text-[12.5px] font-bold">
            {p ? t('malinger.percent', { pct: p.pct }) : '—'}
          </span>
        </span>
      </span>

      <span>
        <span
          className="inline-block rounded-pill px-[12px] py-[5px] text-[11.5px] font-bold"
          style={STATE_STYLE[round.state]}
        >
          {t(`malinger.state.${round.state}`)}
        </span>
      </span>

      <span className="flex flex-wrap justify-start gap-[8px] md:justify-end">
        {closed ? (
          <>
            <ButtonLink href={setupHref} size="sm" tone="secondary" pad={14}>
              {t(archived ? 'malinger.viewSetup' : 'malinger.setup')}
            </ButtonLink>
            {/*
              The result of a round has an address, so the control that opens it is a link
              and not a button — the documented control substitution (D-06), styled exactly
              as the bundle styles this button.
            */}
            <ButtonLink
              href={{ pathname: '/resultat', query: { maling: round.id } }}
              size="sm"
              tone={archived ? 'secondary' : 'primary'}
              pad={15}
            >
              {t(archived ? 'malinger.compare' : 'malinger.viewResult')}
            </ButtonLink>
          </>
        ) : (
          <>
            {/* the design's second control on a coming round is the respondent preview */}
            <ButtonLink
              href={{ pathname: '/forhandsvis', query: { runde: round.id } }}
              size="sm"
              tone="secondary"
              pad={14}
            >
              {t('malinger.preview')}
            </ButtonLink>
            {/*
              A coming round's action opens its setup (bundle 4264, `openPlan`), which has an
              address — a link for the reason the result link is one (D-06). "Definer pulsen"
              on the next puls, as the design words it; "Se oppsett" on everything else.
            */}
            <ButtonLink
              href={setupHref}
              size="sm"
              tone={round.state === 'planlagt' ? 'secondary' : 'primary'}
              pad={15}
            >
              {t(
                round.state === 'neste' && round.kind === 'puls'
                  ? 'malinger.definePulse'
                  : 'malinger.seeSetup',
              )}
            </ButtonLink>
          </>
        )}
      </span>
    </div>
  )
}
