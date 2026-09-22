import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { bandCounts, getResultsSummary } from '@/lib/results/read'
import { Card } from '@/components/ui/Card'
import { MaskedCell, StackedBar } from '@/components/ui/Risk'

/**
 * Innsikt.
 *
 * Every figure on this page is read from the database through results_summary, which
 * applies k-anonymity before returning anything. Nothing here is a literal.
 *
 * What is deliberately NOT rendered yet, because the schema does not hold it:
 *   - "Bransjesnitt anlegg: 64" — there is no benchmarks table, and an invented
 *     industry average printed next to a real index is exactly the fabrication the
 *     contract forbids. It arrives when benchmarks do.
 *   - Sløyfen, the årshjul rail, the Tuva note and "Venter på deg" — these read from
 *     duties, schedules and tasks, none of which exist yet.
 *
 * Rendering the shell of those blocks with placeholder values would make this screen
 * look finished and be wrong. An empty region is honest and obvious; a plausible fake
 * number survives review and ends up in a screenshot as though it were true.
 */
export const dynamic = 'force-dynamic'

export default async function InnsiktPage() {
  const t = await getTranslations()
  const supabase = await createClient()

  const { data: org } = await supabase
    .schema('app')
    .from('organizations')
    .select('id, name, employee_count')
    .limit(1)
    .maybeSingle()

  // the two most recent closed rounds: current, and the one we compare against
  const { data: rounds } = await supabase
    .schema('app')
    .from('rounds')
    .select('id, status, measurements!inner(year)')
    .eq('status', 'lukket')
    .order('closes_at', { ascending: false })
    .limit(2)

  const current = rounds?.[0]
  const previous = rounds?.[1]

  const summary = current ? await getResultsSummary(current.id) : null
  const prior = previous ? await getResultsSummary(previous.id) : null

  const delta =
    summary?.status === 'ok' && prior?.status === 'ok' ? summary.index - prior.index : null

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[28px] py-[34px]">
      {org ? (
        <p className="text-[11px] uppercase tracking-[0.11em] text-mut">
          {org.name} · {t('innsikt.ansatte', { count: org.employee_count })}
        </p>
      ) : null}

      <Card className="mt-[18px] max-w-[560px]">
        <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">
          {t('innsikt.indexLabel')}
        </span>

        {summary?.status === 'ok' ? (
          <>
            <div className="mt-[10px] flex items-end gap-[16px]">
              <span className="font-display text-[54px] font-semibold leading-none tabular-nums">
                {summary.index}
              </span>
              <span className="pb-[6px]">
                {delta !== null ? (
                  <span
                    className={`block text-[13px] font-semibold ${
                      delta < 0 ? 'text-danger' : 'text-link'
                    }`}
                  >
                    {t('innsikt.delta', { delta: delta > 0 ? `+${delta}` : String(delta) })}
                  </span>
                ) : null}
                <span className="block text-[12.5px] text-mut">
                  {t('innsikt.svarte', { n: summary.n, total: org?.employee_count ?? summary.n })}
                </span>
              </span>
            </div>

            {(() => {
              const counts = bandCounts(summary.factors)
              return (
                <div className="mt-[20px]">
                  <StackedBar
                    segments={[
                      { key: 'lav', flex: counts.lav, background: '#CFE7E4' },
                      { key: 'middels', flex: counts.middels, background: '#F5DC96' },
                      { key: 'hoy', flex: counts.hoy, background: '#F0B9A0' },
                    ]}
                  />
                  <div className="mt-[8px] flex justify-between text-[11.5px] text-mut">
                    <span>{t('innsikt.forsvarlig', { count: counts.lav })}</span>
                    <span>{t('innsikt.folgesOpp', { count: counts.middels })}</span>
                    <span>{t('innsikt.hoyRisiko', { count: counts.hoy })}</span>
                  </div>
                </div>
              )
            })()}
          </>
        ) : (
          <div className="mt-[14px] flex items-center gap-[10px]">
            <MaskedCell threshold={summary?.threshold ?? 5} />
            <span className="text-[12.5px] text-mut">
              {t('innsikt.insufficient', { threshold: summary?.threshold ?? 5 })}
            </span>
          </div>
        )}
      </Card>
    </main>
  )
}
