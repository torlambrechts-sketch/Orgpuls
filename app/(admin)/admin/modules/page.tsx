import { getTranslations } from 'next-intl/server'
import { ModulePilotForm, ModuleSwitchButton, ModuleSyncButton, ModuleValidationForm } from '@/components/admin/ModuleForms'
import { Badge, Card, day, PageHead, Problem, Table, Td, type BadgeTone } from '@/components/admin/ui'
import { MODULE_KEYS, moduleFile } from '@/content/industries/modules'
import { isError, modules, whoami, type AdminModules } from '@/lib/admin/api'
import { bodyHash } from '@/lib/modules/schema'

/**
 * Industry modules (X-096; 0067, 0068, 0092 before it). The file in modules/ is the module: change
 * it, deploy, and «Make live» — the database numbers the version, publishes it if the module was
 * live, moves planned surveys nobody has answered onto it, carries the translations of statements
 * that did not change, and keeps every version a survey has opened with, unchanged. One row per
 * module says whether what is deployed is what is asked. Pilots and the validation status are
 * under «More». Super-admin acts; the audit log keeps who and when.
 */
type Version = AdminModules['modules'][number]
type State = 'live' | 'changed' | 'draft' | 'draftChanged' | 'off' | 'missing'
const TONE: Record<State, BadgeTone> = { live: 'green', changed: 'yellow', draft: 'yellow', draftChanged: 'yellow', off: 'grey', missing: 'red' }
const semver = (v: string) => v.split('.').map(Number)
const newest = (a: Version, b: Version) => {
  const x = semver(a.version)
  const y = semver(b.version)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (y[i] ?? 0) - (x[i] ?? 0)
  return 0
}

export default async function AdminModules() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const [m, who] = await Promise.all([modules(), whoami()])
  if (isError(m)) return <Problem text={m.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const superAdmin = who?.role === 'super_admin'
  const problems = Object.fromEntries(
    ['not_allowed', 'report_required', 'not_found', 'not_draft', 'in_use', 'invalid_transition', 'invalid', 'failed'].map((k) => [k, t(`modules.problem.${k}`)]),
  )
  const common = { saving: t('modules.saving'), done: t('modules.done'), problems }
  const s = (k: string, v?: Record<string, string | number>) => t(`modules.simple.${k}`, v)

  const keys = [...new Set([...MODULE_KEYS, ...m.modules.map((x) => x.key)])]
  const rows = keys.map((key) => {
    const file = MODULE_KEYS.includes(key) ? moduleFile(key) : null
    const hash = file ? bodyHash(file) : null
    const versions = m.modules.filter((x) => x.key === key).sort(newest)
    const latest = versions[0] ?? null
    const live = versions.find((x) => x.status === 'published') ?? null
    const state: State = !latest
      ? 'missing'
      : latest.status === 'published'
        ? latest.body_hash === hash
          ? 'live'
          : 'changed'
        : latest.status === 'draft'
          ? latest.body_hash === hash
            ? 'draft'
            : 'draftChanged'
          : 'off'
    return { key, name: file?.name ?? latest?.name ?? key, file, hash, versions, latest, live, state, rounds: versions.reduce((n, x) => n + x.rounds, 0) }
  })
  const waiting = rows.filter((r) => r.state === 'changed' || r.state === 'draftChanged' || r.state === 'missing').length

  return (
    <>
      <PageHead title={t('modules.title')} lead={s('lead', { waiting })} />

      <section className="overflow-x-auto rounded-panel border border-line bg-sf">
        <div className="min-w-[760px]">
          <div aria-hidden="true" className="flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] text-[11px] uppercase tracking-[0.09em] text-mut">
            <span className="flex-[2]">{s('col.module')}</span>
            <span className="w-[170px]">{s('col.state')}</span>
            <span className="w-[120px]">{s('col.validation')}</span>
            <span className="w-[70px] text-right">{s('col.rounds')}</span>
            <span className="w-[220px]" />
          </div>
          <ul className="m-0 list-none p-0">
            {rows.map((r) => (
              <li key={r.key} className="border-b border-line px-[20px] py-[14px] last:border-b-0">
                <div className="flex items-center gap-[14px]">
                  <div className="min-w-0 flex-[2]">
                    <div className="text-[13.5px] font-semibold">{r.name}</div>
                    <div className="text-[12px] text-mut">
                      {r.live ? s('liveVersion', { version: r.live.version, date: r.live.published_at ? day(r.live.published_at) : '–' }) : r.latest ? s('latestVersion', { version: r.latest.version }) : s('notInDb')}
                      {' · '}
                      {s('file', { key: r.key })}
                    </div>
                  </div>
                  <div className="w-[170px]">
                    <Badge tone={TONE[r.state]}>{s(`state.${r.state}`)}</Badge>
                  </div>
                  <div className="w-[120px]">
                    {r.latest ? (
                      <Badge tone={r.latest.validation_status === 'validated' ? 'green' : r.latest.validation_status === 'provisional' ? 'yellow' : 'grey'}>
                        {t(`modules.validation.${r.latest.validation_status ?? 'unset'}`)}
                      </Badge>
                    ) : (
                      '–'
                    )}
                  </div>
                  <div className="w-[70px] text-right text-[13px]">{r.rounds}</div>
                  <div className="flex w-[220px] justify-end">
                    {superAdmin && r.file && r.state !== 'live' && r.state !== 'draft' && r.state !== 'off' ? (
                      <ModuleSyncButton
                        moduleKey={r.key}
                        labels={{
                          ...common,
                          submit: s(r.state === 'changed' ? 'makeLive' : r.state === 'missing' ? 'addDraft' : 'updateDraft'),
                          result: (x) => s(`synced.${x.result}`, { version: x.version, rounds: x.rounds, translations: x.translations }),
                        }}
                      />
                    ) : superAdmin && r.state === 'draft' && r.latest ? (
                      <ModuleSwitchButton moduleKey={r.key} version={r.latest.version} on labels={{ ...common, submit: s('publish') }} />
                    ) : null}
                  </div>
                </div>
                <p className="mb-0 mt-[6px] max-w-[90ch] text-[12.5px] leading-[1.5] text-mut">{s(`explain.${r.state}`)}</p>

                {superAdmin && r.latest ? (
                  <details className="mt-[8px]">
                    <summary className="cursor-pointer text-[12.5px] font-semibold text-link">{s('more')}</summary>
                    <div className="mt-[10px] flex flex-col gap-[14px] rounded-ctl border border-line bg-bg px-[14px] py-[12px]">
                      <div>
                        <div className="mb-[6px] text-[12px] font-semibold">{s('validationTitle')}</div>
                        <ModuleValidationForm
                          moduleKey={r.key}
                          version={r.latest.version}
                          to={r.latest.validation_status === 'validated' ? 'provisional' : 'validated'}
                          labels={{
                            ...common,
                            report: t('modules.validation.reportLabel'),
                            submit: r.latest.validation_status === 'validated' ? t('modules.validation.markProvisional') : t('modules.validation.markValidated'),
                          }}
                        />
                      </div>
                      {r.latest.status === 'draft' ? (
                        <div>
                          <div className="mb-[6px] text-[12px] font-semibold">{s('pilotTitle', { names: r.latest.pilots.map((p) => p.name).join(', ') || '–' })}</div>
                          <ModulePilotForm
                            moduleKey={r.key}
                            version={r.latest.version}
                            labels={{ ...common, org: t('modules.pilotOrg'), add: t('modules.pilotAdd'), remove: t('modules.pilotRemove') }}
                          />
                        </div>
                      ) : null}
                      {r.live ? (
                        <div>
                          <div className="mb-[6px] text-[12px] font-semibold">{s('offTitle')}</div>
                          <ModuleSwitchButton moduleKey={r.key} version={r.live.version} on={false} labels={{ ...common, submit: s('turnOff') }} />
                        </div>
                      ) : null}
                      <div>
                        <div className="mb-[6px] text-[12px] font-semibold">{s('history')}</div>
                        <ul className="m-0 list-none p-0 text-[12.5px] leading-[1.7]">
                          {r.versions.map((v) => (
                            <li key={v.version}>
                              <b>{v.version}</b> · {t(`modules.status.${v.status}`)} · {s('versionLine', { rounds: v.rounds, items: v.items, date: v.published_at ? day(v.published_at) : '–' })}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {m.modules.some((x) => x.variants.length) ? (
        <Card title={t('modules.variants.title')} className="mt-[18px]">
          <Table head={['module', 'variant', 'factors', 'items', 'min', 'off', 'rounds'].map((k) => t(`modules.variants.col.${k}`))} empty={t('modules.none')}>
            {m.modules
              .filter((x) => x.status !== 'retired')
              .flatMap((x) =>
                x.variants.map((v) => (
                  <tr key={`${x.key}@${x.version}:${v.key}`}>
                    <Td>
                      {x.name} <span className="text-[12px] text-mut">{x.version}</span>
                    </Td>
                    <Td>
                      {v.code} v{v.version}
                    </Td>
                    <Td>{v.factors}</Td>
                    <Td>{v.items}</Td>
                    <Td>{v.min_factors ?? '–'}</Td>
                    <Td>{v.default_off.length ? v.default_off.join(', ') : '–'}</Td>
                    <Td>{v.rounds}</Td>
                  </tr>
                )),
              )}
          </Table>
        </Card>
      ) : null}

      <Card title={t('modules.adoption')} className="mt-[18px]">
        <Table head={[t('modules.col.nace'), t('modules.col.baselines'), t('modules.col.withModule')]} empty={t('modules.noAdoption')}>
          {m.adoption.map((a) => (
            <tr key={a.nace}>
              <Td>{a.nace}</Td>
              <Td>{a.rounds}</Td>
              <Td>
                {a.with_module} {a.rounds ? `(${Math.round((100 * a.with_module) / a.rounds)} %)` : ''}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
