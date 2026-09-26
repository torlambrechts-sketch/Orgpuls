import { getTranslations } from 'next-intl/server'
import type { Module } from '@/lib/modules/read'
import type { CountTotals, ModuleResults as Results } from '@/lib/modules/results'
import { heatTone } from '@/lib/results/tone'
import { ModuleSuggestions } from './ModuleSuggestions'

/**
 * A closed round's industry module (D-114), under the workspace.
 *
 * The design has no module, so this is built from Resultater's own parts: the card, the
 * heat palette the Varmekart colours its cells with, the band words. It sits beside the
 * core results rather than inside them, because the core index is the eleven QPS factors
 * and must stay comparable year to year (D-111): a module factor never enters it.
 *
 * Every number is the database's. A cell the release rule withheld arrives as null and is
 * drawn "–"; a count question fewer than k answered arrives with no numbers at all and is
 * drawn as the sentence that says so.
 */
export async function ModuleResults({
  roundId,
  results,
  totals,
  modules,
}: {
  roundId: string
  results: Results
  totals: CountTotals | null
  /** the registry rows, for each factor's sources */
  modules: Module[]
}) {
  const t = await getTranslations('resultater.module')
  const card = 'rounded-card border border-line bg-sf'

  return (
    <div className="mt-[18px] flex flex-col gap-[14px]">
      {results.modules.map((m) => {
        const reg = modules.find((r) => r.key === m.key && r.version === m.version)
        const groups = m.groups.filter((g) => g.status === 'ok' || g.status === 'protected' || g.status === 'insufficient_data')
        const columns = [
          ...(results.scope === 'org' ? [{ name: t('org'), cells: new Map(m.factors.map((f) => [f.key, f.index])) }] : []),
          ...groups.map((g) => ({
            name: t('groupN', { name: g.group_name, n: g.n }),
            cells: new Map((g.factors ?? []).map((f) => [f.key, f.index])),
          })),
        ]
        return (
          <section key={m.key} className={`${card} px-[22px] py-[20px]`} aria-labelledby={`modul-${m.key}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
              <div>
                <span className="inline-block rounded-pill bg-ac px-[11px] py-[4px] text-[11.5px] font-bold text-ink">
                  {t('pill', { name: m.name })}
                </span>
                <h2 id={`modul-${m.key}`} className="m-0 mt-[10px] font-display text-[22px] font-semibold leading-[1.2]">
                  {t('title', { name: m.name })}
                </h2>
              </div>
              <span className="text-[12px] text-mut">{t('version', { name: m.name, version: m.version })}</span>
            </div>
            <p className="m-0 mt-[6px] max-w-[640px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">
              {t('lead', { threshold: results.threshold })}
            </p>

            <div className="mt-[14px] overflow-x-auto" role="figure" aria-label={t('tableLabel', { name: m.name })}>
              <table className="w-full min-w-[420px] border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr>
                    <th scope="col" className="py-[6px] pr-[6px] text-left text-[12px] font-semibold text-mut">
                      {t('factor')}
                    </th>
                    {columns.map((c) => (
                      <th key={c.name} scope="col" className="whitespace-nowrap px-[6px] py-[6px] text-right text-[12px] font-semibold text-mut">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.factors.map((f) => (
                    <tr key={f.key}>
                      <th scope="row" className="border-t border-line py-[7px] pr-[6px] text-left font-semibold">
                        {f.name}
                      </th>
                      {columns.map((c) => {
                        const v = c.cells.get(f.key) ?? null
                        const tone = v === null ? null : heatTone(v)
                        return (
                          <td key={c.name} className="border-t border-line px-[6px] py-[7px] text-right tabular-nums">
                            {tone && v !== null ? (
                              <span
                                className="inline-block min-w-[34px] rounded-[7px] px-[6px] py-[3px] text-center font-bold"
                                style={{ background: tone.bg, color: tone.fg }}
                              >
                                {v}
                              </span>
                            ) : (
                              <span className="font-medium text-mut" aria-label={t('withheld')}>
                                –
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="m-0 mt-[8px] text-[12px] text-mut">{t('foot', { threshold: results.threshold })}</p>

            <div className="mt-[16px] flex flex-col">
              {m.factors.map((f) => {
                const regFactor = reg?.factors.find((x) => x.key === f.key)
                const sources = (regFactor?.rationaleSources ?? [])
                  .map((k) => reg?.sources.find((s) => s.key === k))
                  .filter((s): s is NonNullable<typeof s> => !!s)
                return (
                  <details key={f.key} className="border-t border-line py-[4px] last:border-b">
                    <summary className="cursor-pointer py-[10px] text-[14px] font-semibold">
                      {f.name}
                      {f.band ? <span className="ml-[8px] text-[12px] font-medium text-mut">{t(`band.${f.band}`)}</span> : null}
                    </summary>
                    <div className="pb-[14px] text-[13px] leading-[1.6] text-body">
                      <p className="m-0 font-semibold">{f.summary}</p>
                      <p className="m-0 mt-[6px] max-w-[680px] [text-wrap:pretty]">{f.rationale}</p>
                      {sources.length ? (
                        <ul className="m-0 mt-[8px] list-none p-0 text-[12.5px]">
                          {sources.map((s) => (
                            <li key={s.key}>
                              <a href={s.url} rel="noopener" target="_blank" className="text-link">
                                {s.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="mt-[10px] text-[12px] font-semibold text-mut">{t('legal')}</div>
                      <ul className="m-0 mt-[4px] pl-[18px]">
                        {f.legal_basis.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                      {regFactor?.actions.length ? (
                        <ModuleSuggestions
                          roundId={roundId}
                          suggestions={regFactor.actions.map((a) => ({
                            id: a.id,
                            type: a.type,
                            typeLabel: t(`actionType.${a.type}`),
                            title: a.title,
                            description: a.description,
                            remeasure: t('remeasure', { statement: a.remeasureItem.text }),
                          }))}
                          labels={{
                            head: t('suggestions'),
                            create: t('create'),
                            created: t('created'),
                            open: t('openTiltak'),
                            failed: t('createFailed'),
                          }}
                        />
                      ) : null}
                      <div className="mt-[10px] text-[12px] font-semibold text-mut">{t('statements')}</div>
                      <ul className="m-0 mt-[4px] list-none p-0">
                        {f.items.map((i) => (
                          <li key={i.code} className="flex gap-[10px] py-[3px]">
                            <span className="w-[64px] flex-none text-[12px] font-bold text-mut">{i.code}</span>
                            <span className="min-w-0 flex-1">{i.text}</span>
                            <span className="flex-none tabular-nums text-mut">{i.index ?? '–'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )
              })}
            </div>
          </section>
        )
      })}

      {totals && totals.items.length ? (
        <section className={`${card} px-[22px] py-[20px]`} aria-labelledby="telles">
          <h2 id="telles" className="m-0 font-display text-[20px] font-semibold leading-[1.2]">
            {t('countTitle')}
          </h2>
          <p className="m-0 mt-[6px] max-w-[640px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">{t('countLead')}</p>
          <ul className="m-0 mt-[12px] list-none p-0">
            {totals.items.map((i) => {
              const parts = [
                { label: i.options[0] ?? '', n: i.n_ja, bg: '#EC9B77' },
                { label: i.options[1] ?? '', n: i.n_nei, bg: '#B5DAD4' },
                { label: i.options[2] ?? '', n: i.n_vet_ikke, bg: '#E8DFC9' },
              ]
              return (
                <li key={i.code} className="border-t border-line py-[12px]">
                  <div className="text-[13.5px] font-semibold leading-[1.45] [text-wrap:pretty]">{i.text}</div>
                  {i.suppressed || i.n_total === null ? (
                    <div className="mt-[6px] text-[12.5px] text-mut">{t('countSuppressed', { threshold: totals.threshold })}</div>
                  ) : (
                    <>
                      <div className="mt-[8px] flex h-[10px] overflow-hidden rounded-pill bg-track" aria-hidden="true">
                        {parts.map((p) => (p.n ? <span key={p.label} style={{ flex: p.n, background: p.bg }} /> : null))}
                      </div>
                      <div className="mt-[6px] flex flex-wrap gap-x-[16px] gap-y-[4px] text-[12.5px] text-body">
                        {parts.map((p) => (
                          <span key={p.label}>
                            {p.label}: <b className="tabular-nums">{p.n ?? 0}</b>
                          </span>
                        ))}
                        <span className="text-mut">{t('countTotal', { n: i.n_total })}</span>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
