import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Avatar, Badge, BTN, PageHead, Problem, type BadgeTone } from '@/components/admin/ui'
import { accountHealth, isError, type HealthRow } from '@/lib/admin/api'

/**
 * Lead scoring (X-095, the design's `isScoring`): the trials ranked by the health score (0060) —
 * points for what they have done in the product, how recently they signed in, how many answered
 * their last survey and how large they are. 70 and above is hot, 40 and above warm. The rules
 * panel is the score's own definition, point for point; it is not edited here.
 */
const band = (s: number): { key: 'hot' | 'warm' | 'cold'; tone: BadgeTone } =>
  s >= 70 ? { key: 'hot', tone: 'red' } : s >= 40 ? { key: 'warm', tone: 'yellow' } : { key: 'cold', tone: 'grey' }

/** The rules as admin_account_health (0060) computes them */
const RULES = [
  { key: 'employees', points: '+10' },
  { key: 'scheduled', points: '+10' },
  { key: 'sent', points: '+10' },
  { key: 'unlocked', points: '+10' },
  { key: 'measure', points: '+10' },
  { key: 'week', points: '+25' },
  { key: 'month', points: '+10' },
  { key: 'answered60', points: '+15' },
  { key: 'answered40', points: '+8' },
  { key: 'size20', points: '+10' },
  { key: 'size10', points: '+5' },
] as const

export default async function LeadScoring() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const s = (k: string, v?: Record<string, string | number>) => t(`crm.scoring.${k}`, v)
  const data = await accountHealth()
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const rows = data.rows.filter((r) => !r.demo && (r.access === 'trial' || r.access === 'grace')).sort((a, b) => b.score - a.score)
  const n = (k: 'hot' | 'warm' | 'cold') => rows.filter((r) => band(r.score).key === k).length
  const why = (r: HealthRow) =>
    [
      r.unlocked ? s('why.unlocked') : r.sent ? s('why.sent') : r.scheduled ? s('why.scheduled') : r.employees_uploaded ? s('why.employees') : null,
      r.measure ? s('why.measure') : null,
      r.recency_points >= 25 ? s('why.week') : r.recency_points > 0 ? s('why.month') : s('why.away'),
      r.response_points ? s('why.answered') : null,
      r.qualified ? s('why.qualified') : null,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <>
      <PageHead title={s('title')} lead={s('lead', { hot: n('hot'), warm: n('warm'), cold: n('cold') })}>
        <Link href={'/admin/health' as Route} className={BTN.secondary}>
          {s('health')}
        </Link>
      </PageHead>
      <div className="grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <section className="min-w-0 overflow-x-auto rounded-panel border border-line bg-sf">
          <div className="min-w-[620px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="flex-[2]">{s('col.trial')}</span>
              <span className="flex-[1.4]">{s('col.score')}</span>
              <span className="flex-[1.6]">{s('col.why')}</span>
              <span className="w-[70px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {rows.map((r) => {
                const b = band(r.score)
                const href = `/admin/orgs/${r.id}` as Route
                return (
                  <li key={r.id} className="relative flex items-center gap-[14px] border-b border-line px-[20px] py-[12px] hover:bg-bg">
                    <div className="flex min-w-0 flex-[2] items-center gap-[12px]">
                      <Avatar name={r.name} />
                      <div className="min-w-0">
                        <Link href={href} className="block text-[14px] font-semibold text-ink no-underline after:absolute after:inset-0 hover:text-ink hover:no-underline">
                          {r.name}
                        </Link>
                        <div className="text-[12.5px] text-mut">{r.trial_ends_at ? s('ends', { date: fmt.format(new Date(r.trial_ends_at)) }) : ''}</div>
                      </div>
                    </div>
                    <div className="flex flex-[1.4] items-center gap-[10px]">
                      <span aria-hidden="true" className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
                        <span className="block h-full rounded-pill bg-ac" style={{ width: `${Math.min(100, r.score)}%` }} />
                      </span>
                      <Badge tone={b.tone}>{`${r.score} · ${s(`band.${b.key}`)}`}</Badge>
                    </div>
                    <div className="min-w-0 flex-[1.6] text-[13px] text-mut">{why(r)}</div>
                    <div className="relative flex w-[70px] justify-end">
                      <Link href={href} className={BTN.row} tabIndex={-1} aria-hidden="true">
                        {s('open')}
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
            {rows.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{s('none')}</p>}
          </div>
        </section>
        <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
          <h2 className="m-0 font-display text-[22px] font-medium">{s('rules')}</h2>
          <p className="mb-0 mt-[4px] text-[12.5px] text-mut">{s('rulesLead')}</p>
          <ul className="m-0 mt-[12px] flex list-none flex-col p-0">
            {RULES.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-[12px] border-b border-line py-[10px]">
                <span className="min-w-0">
                  <span className="block text-[13.5px]">{s(`rule.${r.key}`)}</span>
                  <span className="block text-[12px] text-mut">{s(`rule.${r.key}Kind`)}</span>
                </span>
                <b className="text-[14px]">{r.points}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}

const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' })
