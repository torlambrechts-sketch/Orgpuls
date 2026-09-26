import { getTranslations } from 'next-intl/server'
import { ALink, Badge, Card, day, PageHead, Problem, Stat, Table, Td, type BadgeTone } from '@/components/admin/ui'
import { accountHealth, isError, type HealthRow } from '@/lib/admin/api'

const TONE: Record<HealthRow['access'], BadgeTone> = { trial: 'yellow', grace: 'red', read_only: 'grey', active: 'green' }
const VIEWS = ['trials', 'customers', 'all'] as const
type View = (typeof VIEWS)[number]

/**
 * Account health (0060, D-105): every organisation scored 0–100 from activation (50), a recent
 * sign-in (25), the last round's response rate (15) and size (10), with the reasons beside the
 * number, so a score is never a black box. A qualified trial reached results, or sent a survey
 * and has ten or more employees: the trials worth a call. Counts only, never an answer.
 */
export default async function AdminHealth({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await searchParams
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : 'trials'
  const res = await accountHealth()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  const trials = res.rows.filter((r) => r.access === 'trial' || r.access === 'grace')
  const customers = res.rows.filter((r) => r.access === 'active')
  const rows = view === 'trials' ? trials : view === 'customers' ? customers : res.rows
  const daysAgo = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null)

  const why = (r: HealthRow) => {
    const steps = (['employees_uploaded', 'scheduled', 'sent', 'unlocked', 'measure'] as const).filter((k) => r[k])
    const ago = daysAgo(r.last_sign_in)
    return [
      steps.length ? t('health.why.steps', { count: steps.length, list: steps.map((k) => t(`health.step.${k}`)).join(', ') }) : t('health.why.noSteps'),
      ago === null ? t('health.why.neverSignedIn') : t('health.why.signedIn', { days: ago }),
      r.last_invited > 0 ? t('health.why.rate', { rate: Math.round((100 * r.last_answered) / r.last_invited) }) : null,
      r.employees ? t('health.why.size', { count: r.employees }) : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <>
      <PageHead title={t('health.title')} lead={t('health.lead')} />
      <div className="mb-[16px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <Stat label={t('health.qualified')} value={trials.filter((r) => r.qualified).length} hint={t('health.ofTrials', { count: trials.length })} />
        <Stat label={t('health.stalled')} value={trials.filter((r) => r.activation_points === 0).length} hint={t('health.stalledHint')} />
        <Stat label={t('health.atRisk')} value={customers.filter((r) => r.score < 40).length} hint={t('health.atRiskHint', { count: customers.length })} />
      </div>
      <nav aria-label={t('health.views')} className="mb-[12px] flex flex-wrap gap-[6px]">
        {VIEWS.map((v) => (
          <a
            key={v}
            href={`/admin/health?view=${v}`}
            aria-current={v === view ? 'page' : undefined}
            className={`inline-flex h-[32px] items-center rounded-pill border px-[13px] text-[12.5px] font-semibold no-underline hover:no-underline ${
              v === view ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'
            }`}
          >
            {t(`health.view.${v}`)}
          </a>
        ))}
      </nav>
      <Card>
        <Table
          head={[t('health.head.org'), t('health.head.status'), t('health.head.score'), t('health.head.why'), t('health.head.trialEnds')]}
          empty={rows.length ? undefined : t('common.none')}
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <ALink href={`/admin/orgs/${r.id}`}>{r.name}</ALink>
                {r.qualified ? (
                  <span className="ml-[6px]">
                    <Badge tone="ink">{t('health.pql')}</Badge>
                  </span>
                ) : null}
              </Td>
              <Td>
                <Badge tone={TONE[r.access]}>{t(`orgs.statusLabel.${r.access}`)}</Badge>
              </Td>
              <Td>
                <span className="flex items-center gap-[8px]">
                  <span className="w-[26px] text-right font-bold">{r.score}</span>
                  <span className="block h-[6px] w-[72px] overflow-hidden rounded-pill bg-track" aria-hidden="true">
                    <span
                      className="block h-full rounded-pill"
                      style={{ width: `${r.score}%`, background: r.score >= 60 ? '#5C9A55' : r.score >= 30 ? '#E0A21F' : '#A33A16' }}
                    />
                  </span>
                </span>
              </Td>
              <Td wrap className="min-w-[320px] text-[12.5px] text-body">
                {why(r)}
              </Td>
              <Td>{r.access === 'active' ? '—' : day(r.trial_ends_at)}</Td>
            </tr>
          ))}
        </Table>
        <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('health.note')}</p>
      </Card>
    </>
  )
}
