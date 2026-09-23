import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'
import { StackedBar } from '@/components/ui/Risk'
import type { Role } from '@/lib/org/read'

/**
 * Innsikt, the rendering. Bundle lines 152-268.
 *
 * The landing screen answers one question — where does this organisation stand in its
 * duty cycle — and answers it in four blocks: the index and how it moved, the Sløyfen
 * (kartlagt → risikovurdert → tiltak → effekt, which is § 3-1 bokstav c as a diagram),
 * the year's scheduled points, and what is outstanding.
 *
 * Every figure comes from the reader. Nothing on this screen is computed from a
 * plausible rule: the loop's second step is a stored risk assessment and the third is a
 * count of measures at `pagar`, because a screen that infers "risikovurdert" from a low
 * index is asserting that somebody did work nobody recorded.
 *
 * What the design shows and this omits is listed in docs/DEVIATIONS.md D-25, with the
 * constraint named for each. The rule is the contract's: render the real state, render
 * nothing, or render the design's own empty treatment — never a plausible placeholder.
 */

export interface LoopStep {
  key: string
  /** '✓', a count, or nothing — what the design draws inside the disc */
  mark: string
  state: 'done' | 'current' | 'pending'
  when: string | null
  /** the design prints an overdue count in the danger colour */
  whenAlert?: boolean
}

export interface YearPoint {
  key: string
  month: string
  label: string
  sub: string
  state: 'done' | 'current' | 'pending'
}

export interface TodoItem {
  key: string
  tone: string
  title: string
  meta: string
  cta: string
  href: '/tiltak' | '/malinger' | '/resultat' | '/rapport'
  /** the design fills the first action and leaves the rest hairline */
  primary: boolean
}

export interface InnsiktView {
  orgName: string
  employeeCount: number
  role: Role | null
  index: number | null
  delta: number | null
  bands: { lav: number; middels: number; hoy: number } | null
  threshold: number
  /** null until the kartlegging this rests on has been assessed */
  riskAssessed: boolean
  loop: LoopStep[]
  year: YearPoint[]
  todo: TodoItem[]
  /** measures at `pagar`: what "løper" means, counted rather than asserted */
  running: number
}

/** The disc at each point of the Sløyfen and the year rail (bundle 4229, 4234). */
const DISC = {
  done: { background: '#CFE7E4', borderColor: '#2F5D2A', color: '#20431C' },
  current: { background: '#F5C64A', borderColor: '#191510', color: '#191510' },
  pending: { background: 'transparent', borderColor: '#C4BCA8', color: '#5F5849' },
}

/** The year rail's dots: fill, ring and size, the design's three states (bundle 4234). */
const DOT = {
  done: { background: '#2F5D2A', borderColor: '#2F5D2A', size: 15 },
  current: { background: '#F5C64A', borderColor: '#191510', size: 21 },
  pending: { background: '#FCF6E9', borderColor: '#C4BCA8', size: 15 },
}

export async function InnsiktScreen({ view }: { view: InnsiktView }) {
  const t = await getTranslations()

  const head = view.role ? t(`innsikt.head.${view.role}`) : t('innsikt.head.daglig_leder')
  const lead = view.role ? t(`innsikt.lead.${view.role}`, {
    running: view.running,
    assessed: view.riskAssessed ? 'yes' : 'no',
  }) : t('innsikt.lead.daglig_leder', {
    running: view.running,
    assessed: view.riskAssessed ? 'yes' : 'no',
  })

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[16px] md:px-[28px] pb-[60px] pt-[30px]">
      <div className="flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
            {view.orgName} · {t('innsikt.ansatte', { count: view.employeeCount })}
          </div>
          <h1 className="mt-[6px] font-display text-[34px] font-semibold leading-[1.1]">{head}</h1>
          <p className="mt-[9px] max-w-[520px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {lead}
          </p>
        </div>
        <ButtonLink href="/resultat" size="lg" tone="primary">
          {t('innsikt.seeResult')}
        </ButtonLink>
      </div>

      <div className="mt-[24px] grid items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <section className="rounded-card border border-line bg-sf p-[26px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
            {t('innsikt.indexLabel')}
          </div>

          {view.index !== null && view.bands ? (
            <>
              <div className="mt-[10px] flex flex-wrap items-end gap-[16px]">
                <span className="font-display text-[62px] font-semibold leading-[0.85] tabular-nums">
                  {view.index}
                </span>
                {view.delta !== null ? (
                  <span className="pb-[9px]">
                    <span className="block text-[14px] font-bold text-danger">
                      {t('innsikt.delta', {
                        delta: view.delta > 0 ? `+${view.delta}` : `−${Math.abs(view.delta)}`,
                      })}
                    </span>
                  </span>
                ) : null}
              </div>

              <div className="mt-[20px]">
                <StackedBar
                  segments={[
                    { key: 'lav', flex: view.bands.lav, background: '#CFE7E4' },
                    { key: 'middels', flex: view.bands.middels, background: '#F5DC96' },
                    { key: 'hoy', flex: view.bands.hoy, background: '#F0B9A0' },
                  ]}
                />
                <div className="mt-[8px] flex flex-wrap justify-between gap-[10px] text-[11.5px] text-mut">
                  <span>{t('innsikt.forsvarlig', { count: view.bands.lav })}</span>
                  <span>{t('innsikt.folgesOpp', { count: view.bands.middels })}</span>
                  <span>{t('innsikt.hoyRisiko', { count: view.bands.hoy })}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-[10px] max-w-[400px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
              {t('innsikt.insufficient', { threshold: view.threshold })}
            </p>
          )}

          <div className="mt-[24px] border-t border-line pt-[20px]">
            <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
              {t('innsikt.loopHead')}
            </div>
            <div className="mt-[14px] flex items-start">
              {view.loop.map((step) => (
                <span key={step.key} className="min-w-0 flex-1 text-center">
                  <span
                    className="mx-auto flex h-[32px] w-[32px] items-center justify-center rounded-pill border-2 text-[13px] font-bold"
                    style={DISC[step.state]}
                  >
                    {step.mark}
                  </span>
                  <span className="mt-[8px] block text-[11.5px] font-semibold leading-[1.3]">
                    {t(`innsikt.loop.${step.key}`)}
                  </span>
                  {step.when ? (
                    <span
                      className={`mt-[2px] block text-[10.5px] ${
                        step.whenAlert ? 'text-danger' : 'text-mut'
                      }`}
                    >
                      {step.when}
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-card border border-line bg-sf p-[26px]">
          <div className="flex flex-wrap items-start justify-between gap-[14px]">
            {/*
              The design makes this a button that opens Årshjulet. That screen is not
              built, so there is nowhere to send anyone: a link to a route that does not
              exist is worse than no link. The label stays, styled as the design styles
              it, and the entry point arrives with the screen. D-25.
            */}
            <span className="text-[11px] uppercase tracking-[0.11em] text-mut underline">
              {t('innsikt.yearLink')}
            </span>

            {/*
              Not a Button: none of the scale's sizes is this control. The bundle draws a
              two-line chip that sizes to its content (8px 13px, radius 12, mint on a
              #2F5D2A hairline), and forcing it through the size map produced a button
              whose tone class fought the fill — `bg-transparent` and `bg-mint` have equal
              specificity, so which one wins is Tailwind's emit order rather than the one
              written last. The same trap the Button's own `pad` comment records. Styled
              as the bundle styles it, and a link because it goes somewhere.

              It renders only when there is an assessment to open. "Dokumentert" is a
              claim about the record; with no row behind it, it would be a false one, and
              the design has no other treatment for this chip. D-25.
            */}
            {view.riskAssessed ? (
              <Link
                href="/rapport"
                className="flex-none rounded-cta border px-[13px] py-[8px] text-left no-underline hover:no-underline"
                style={{ borderColor: '#2F5D2A', background: '#CFE7E4', color: '#20431C' }}
              >
                <span className="block text-[10.5px] font-semibold">
                  {t('innsikt.documentedHead')}
                </span>
                <span className="mt-[1px] block text-[13px] font-bold">
                  {t('innsikt.documentedCta')}
                </span>
              </Link>
            ) : null}
          </div>

          <div className="pb-[2px] pt-[18px]">
            <div
              className="grid gap-[6px] text-center text-[10.5px] font-bold"
              style={{ gridTemplateColumns: `repeat(${view.year.length}, 1fr)` }}
            >
              {view.year.map((p) => (
                <span key={p.key} className={p.state === 'current' ? 'text-ink' : 'text-mut'}>
                  {p.month}
                </span>
              ))}
            </div>

            <div className="relative mt-[8px] h-[26px]">
              <span className="absolute inset-x-0 top-1/2 block h-[3px] -translate-y-1/2 rounded-pill bg-line" />
              <span
                className="absolute left-0 top-1/2 block h-[3px] -translate-y-1/2 rounded-pill bg-link"
                style={{ width: railDone(view.year) }}
              />
              <div
                className="relative grid h-full place-items-center gap-[6px]"
                style={{ gridTemplateColumns: `repeat(${view.year.length}, 1fr)` }}
              >
                {view.year.map((p) => (
                  <span
                    key={p.key}
                    className="block rounded-pill border-2"
                    style={{
                      width: `${DOT[p.state].size}px`,
                      height: `${DOT[p.state].size}px`,
                      background: DOT[p.state].background,
                      borderColor: DOT[p.state].borderColor,
                    }}
                  />
                ))}
              </div>
            </div>

            <div
              className="mt-[9px] grid gap-[6px] text-center text-[11.5px] leading-[1.3]"
              style={{ gridTemplateColumns: `repeat(${view.year.length}, 1fr)` }}
            >
              {view.year.map((p) => (
                <span key={p.key}>
                  <span
                    className={`block ${p.state === 'current' ? 'font-bold' : 'font-semibold'}`}
                  >
                    {p.label}
                  </span>
                  <span className="block text-mut">{p.sub}</span>
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-[26px]">
        <div className="flex flex-wrap items-baseline justify-between gap-[14px]">
          <h2 className="m-0 font-display text-[22px] font-semibold">{t('innsikt.todoHead')}</h2>
          <span className="text-[12.5px] text-mut">
            {t(`innsikt.todoScope.${view.role ?? 'daglig_leder'}`)}
          </span>
        </div>

        <div className="mt-[14px] flex flex-col gap-[10px]">
          {view.todo.length === 0 ? (
            <div className="rounded-row border border-dashed border-rule bg-sf px-[26px] py-[30px] text-center">
              <div className="text-[14.5px] font-semibold">{t('innsikt.todoEmpty')}</div>
            </div>
          ) : null}

          {view.todo.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-[14px] rounded-row border border-line bg-sf px-[18px] py-[15px]"
            >
              <span
                className="block min-h-[38px] w-[7px] flex-none self-stretch rounded-pill"
                style={{ background: item.tone }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold [text-wrap:pretty]">
                  {item.title}
                </span>
                <span className="mt-[2px] block text-[12.5px] text-mut [text-wrap:pretty]">
                  {item.meta}
                </span>
              </span>
              <ButtonLink
                href={item.href}
                size="sm"
                tone={item.primary ? 'primary' : 'quiet'}
                pad={16}
                className={item.primary ? '' : 'bg-transparent'}
              >
                {item.cta}
              </ButtonLink>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

/**
 * How far along the rail the green runs.
 *
 * The design draws it to the middle of the current point — `width:50%` over five points,
 * which is the third of five. Expressed as a fraction of the track rather than as that
 * literal, so it stays correct when the rail holds a different number of points.
 */
function railDone(points: YearPoint[]): string {
  const i = points.findIndex((p) => p.state === 'current')
  const at = i === -1 ? points.filter((p) => p.state === 'done').length - 1 : i
  if (at < 0) return '0%'
  return `${((at + 0.5) / points.length) * 100}%`
}
