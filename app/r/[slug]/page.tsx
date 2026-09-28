import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { RiskBadge } from '@/components/ui/Risk'
import { getRoundPage, type RoundPage } from '@/lib/results/page'

/**
 * «Dette sa dere, dette gjør vi» (gap analysis P1-3, 0100, D-151): one closed round, for everyone
 * who was asked. Public like the respondent page: no session, no cookie that identifies anyone,
 * and the link is the only key. Nothing here is logged per view.
 *
 * The design has no screen for it; it is built from the respondent surface's own parts — the
 * column, the card, the pill — so a person who answered the survey recognises where they are.
 * What it shows is what public.round_page returns: the whole organisation only, k applied in the
 * database, the measures decided from the round.
 */
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

const TOP = 3

export default async function RoundPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = await getTranslations()
  const page = await getRoundPage(slug)

  if (!page) {
    return (
      <main className="animate-entry mx-auto min-h-screen max-w-[560px] px-[20px] py-[60px]">
        <div className="rounded-card border border-line bg-sf px-[22px] py-[26px]">
          <h1 className="m-0 font-display text-[24px] font-semibold leading-[1.2]">{t('roundPage.missingTitle')}</h1>
          <p className="mt-[10px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">{t('roundPage.missingLead')}</p>
        </div>
      </main>
    )
  }

  return <Page page={page} t={t} locale={await getLocale()} />
}

type T = Awaited<ReturnType<typeof getTranslations>>

function Page({ page, t, locale }: { page: RoundPage; t: T; locale: string }) {
  const date = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : ''
  const month = page.round.closes_at
    ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', month: 'long' }).format(new Date(page.round.closes_at))
    : ''
  const round =
    page.round.kind === 'grunnlinje'
      ? t('malinger.roundTitle', { kind: t('malinger.kind.grunnlinje'), year: page.round.year })
      : t('resultater.pulseTitle', { month, year: page.round.year })
  const factorName = (key: string) => (t.has(`factor.${key}.label`) ? t(`factor.${key}.label`) : null)
  const pct = page.asked > 0 ? Math.round((100 * page.answered) / page.asked) : null

  const strongest = [...page.factors].sort((a, b) => b.index - a.index || a.sort_order - b.sort_order).slice(0, TOP)
  // what is being worked on is what a measure was decided for — not a ranking of our own
  const working = [...new Set(page.measures.map((m) => m.factor).filter((f): f is string => !!f && !!factorName(f)))]
    .map((key) => page.factors.find((f) => f.key === key) ?? { key, index: null, band: null })

  return (
    <main className="animate-entry mx-auto min-h-screen max-w-[560px] bg-bg px-[20px] pb-[48px] pt-[28px]">
      <div className="text-[11.5px] font-semibold text-mut">{page.org}</div>
      <h1 className="m-0 mt-[10px] font-display text-[28px] font-medium leading-[1.15] [text-wrap:balance]">{t('roundPage.title')}</h1>
      <p className="mt-[10px] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">
        {t('roundPage.lead', { round, date: date(page.round.closes_at) })}
      </p>

      <section aria-labelledby="rp-answers" className="mt-[22px] rounded-card border border-line bg-sf px-[22px] py-[20px]">
        <h2 id="rp-answers" className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-mut">{t('roundPage.answersHead')}</h2>
        <div className="mt-[8px] font-display text-[22px] font-medium leading-[1.25]">
          {pct === null
            ? t('roundPage.answeredOnly', { answered: page.answered })
            : t('roundPage.answered', { answered: page.answered, asked: page.asked, pct })}
        </div>
        <p className="mb-0 mt-[8px] text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">{t('roundPage.anonymous', { k: page.threshold })}</p>
      </section>

      {page.status === 'insufficient_data' || page.index === null || !page.band ? (
        <section className="mt-[14px] rounded-card border border-line bg-sf px-[22px] py-[20px]">
          <p className="m-0 text-[14px] leading-[1.6] [text-wrap:pretty]">{t('roundPage.insufficient', { k: page.threshold })}</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="rp-index" className="mt-[14px] rounded-card border border-line bg-sf px-[22px] py-[20px]">
            <h2 id="rp-index" className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-mut">{t('roundPage.indexHead')}</h2>
            <div className="mt-[8px] flex flex-wrap items-center gap-[12px]">
              <span className="font-display text-[40px] font-medium leading-none">{page.index}</span>
              <RiskBadge band={page.band} label={t(`resultater.module.band.${page.band}`)} />
            </div>
            <p className="mb-0 mt-[10px] text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">{t('roundPage.indexNote')}</p>
          </section>

          {strongest.length > 0 ? (
            <FactorList id="rp-strong" head={t('roundPage.strongHead')} rows={strongest} name={factorName} t={t} />
          ) : null}
        </>
      )}

      {working.length > 0 ? <FactorList id="rp-working" head={t('roundPage.workingHead')} rows={working} name={factorName} t={t} /> : null}

      <section aria-labelledby="rp-measures" className="mt-[14px] rounded-card border border-line bg-sf px-[22px] py-[20px]">
        <h2 id="rp-measures" className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-mut">{t('roundPage.measuresHead')}</h2>
        {page.measures.length === 0 ? (
          <p className="mb-0 mt-[10px] text-[14px] leading-[1.6] [text-wrap:pretty]">{t('roundPage.measuresEmpty')}</p>
        ) : (
          <ul className="m-0 mt-[6px] list-none p-0">
            {page.measures.map((m, i) => (
              <li key={i} className="border-b border-line py-[12px] last:border-b-0 last:pb-0">
                <div className="text-[14.5px] font-semibold leading-[1.45] [text-wrap:pretty]">{m.title}</div>
                <div className="mt-[6px] flex flex-wrap items-center gap-x-[10px] gap-y-[4px] text-[12.5px] text-mut">
                  <span className="inline-flex items-center rounded-pill bg-sbg px-[10px] py-[3px] text-[11px] font-bold leading-none text-ink">
                    {t(`tiltak.step.${m.step}`)}
                  </span>
                  {m.factor && factorName(m.factor) ? <span>{factorName(m.factor)}</span> : null}
                  {m.done ? (
                    <span>{t('tiltak.completedOn', { date: date(m.done) })}</span>
                  ) : m.due ? (
                    <span>{t('tiltak.due', { date: date(m.due) })}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mb-0 mt-[14px] text-[12.5px] leading-[1.6] text-mut [text-wrap:pretty]">{t('roundPage.measuresNote')}</p>
      </section>
    </main>
  )
}

function FactorList({
  id,
  head,
  rows,
  name,
  t,
}: {
  id: string
  head: string
  rows: { key: string; index: number | null; band: 'lav' | 'middels' | 'hoy' | null }[]
  name: (key: string) => string | null
  t: T
}) {
  return (
    <section aria-labelledby={id} className="mt-[14px] rounded-card border border-line bg-sf px-[22px] py-[20px]">
      <h2 id={id} className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-mut">{head}</h2>
      <ul className="m-0 mt-[6px] list-none p-0">
        {rows.map((f) => (
          <li key={f.key} className="flex items-center justify-between gap-[12px] border-b border-line py-[10px] last:border-b-0 last:pb-0">
            <span className="text-[14.5px] font-semibold">{name(f.key)}</span>
            {f.index !== null && f.band ? (
              <span className="flex items-center gap-[10px]">
                <span className="text-[14.5px] font-bold tabular-nums">{f.index}</span>
                <RiskBadge band={f.band} label={t(`resultater.module.band.${f.band}`)} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
