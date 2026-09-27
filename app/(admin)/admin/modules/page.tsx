import { getTranslations } from 'next-intl/server'
import { ModulePilotForm, ModuleStatusForm, ModuleValidationForm } from '@/components/admin/ModuleForms'
import { Badge, Card, day, PageHead, Problem, Table, Td } from '@/components/admin/ui'
import { isError, modules, whoami } from '@/lib/admin/api'

/**
 * Industry modules (0067, 0068, D-117): every version, its status, how many rounds asked it,
 * and which organisations pilot a draft; how many grunnlinjer in the last year asked a
 * module, by industry code. Drafts are written by the seed script from modules/*.json;
 * publishing, retiring and pilots are a super-admin's, each with a reason, audited. So is the
 * validation status (0092): «Validert» with the report's link, or back to «Foreløpig».
 */
export default async function AdminModules() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const [m, who] = await Promise.all([modules(), whoami()])
  if (isError(m)) return <Problem text={m.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const superAdmin = who?.role === 'super_admin'
  const problems = Object.fromEntries(
    ['not_allowed', 'reason_required', 'report_required', 'not_found', 'not_draft', 'in_use', 'invalid_transition', 'invalid', 'failed'].map((k) => [
      k,
      t(`modules.problem.${k}`),
    ]),
  )
  const common = { reason: t('modules.reason'), saving: t('modules.saving'), done: t('modules.done'), problems }

  return (
    <>
      <PageHead title={t('modules.title')} lead={t('modules.lead')} />
      <Card title={t('modules.versions')}>
        <Table
          head={[t('modules.col.module'), t('modules.col.status'), t('modules.validation.col'), t('modules.col.published'), t('modules.col.content'), t('modules.col.rounds'), t('modules.col.pilots')]}
          empty={t('modules.none')}
        >
          {m.modules.map((x) => (
            <tr key={`${x.key}@${x.version}`}>
              <Td>
                <b>{x.name}</b>
                <span className="block text-[12px] text-mut">
                  {x.key}@{x.version} · {x.content_hash.slice(0, 12)}
                </span>
              </Td>
              <Td>
                <Badge tone={x.status === 'published' ? 'green' : x.status === 'draft' ? 'yellow' : 'grey'}>{t(`modules.status.${x.status}`)}</Badge>
              </Td>
              <Td>
                <Badge tone={x.validation_status === 'validated' ? 'green' : x.validation_status === 'provisional' ? 'yellow' : 'grey'}>
                  {t(`modules.validation.${x.validation_status ?? 'unset'}`)}
                </Badge>
                {x.decision ? (
                  <span className="mt-[4px] block max-w-[260px] text-[12px] text-mut">
                    {t('modules.validation.decided', { date: day(x.decision.at), reason: x.decision.reason })}
                    {x.decision.report_url ? (
                      <>
                        {' · '}
                        <a href={x.decision.report_url} target="_blank" rel="noreferrer noopener" className="text-ink underline">
                          {t('modules.validation.report')}
                        </a>
                      </>
                    ) : null}
                  </span>
                ) : null}
              </Td>
              <Td>{x.published_at ? day(x.published_at) : '–'}</Td>
              <Td>{t('modules.content', { factors: x.factors, items: x.items })}</Td>
              <Td>{x.rounds}</Td>
              <Td>{x.pilots.length ? x.pilots.map((p) => p.name).join(', ') : '–'}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      {superAdmin
        ? m.modules
            .filter((x) => x.status !== 'retired')
            .map((x) => (
              <Card key={`act-${x.key}@${x.version}`} title={t('modules.actions', { name: x.name, version: x.version })}>
                <div className="grid gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                  {x.status === 'draft' ? (
                    <ModulePilotForm
                      moduleKey={x.key}
                      version={x.version}
                      labels={{ ...common, org: t('modules.pilotOrg'), add: t('modules.pilotAdd'), remove: t('modules.pilotRemove') }}
                    />
                  ) : null}
                  <ModuleValidationForm
                    moduleKey={x.key}
                    version={x.version}
                    to={x.validation_status === 'validated' ? 'provisional' : 'validated'}
                    labels={{
                      ...common,
                      report: t('modules.validation.reportLabel'),
                      submit: x.validation_status === 'validated' ? t('modules.validation.markProvisional') : t('modules.validation.markValidated'),
                      note: x.validation_status === 'validated' ? t('modules.validation.provisionalNote') : t('modules.validation.validatedNote'),
                    }}
                  />
                  <ModuleStatusForm
                    moduleKey={x.key}
                    version={x.version}
                    status={x.status === 'draft' ? 'published' : 'retired'}
                    labels={{
                      ...common,
                      submit: x.status === 'draft' ? t('modules.publish') : t('modules.retire'),
                      warning: x.status === 'draft' ? t('modules.publishWarning') : t('modules.retireWarning'),
                    }}
                  />
                </div>
              </Card>
            ))
        : null}

      {m.modules.some((x) => x.variants.length) ? (
        <Card title={t('modules.variants.title')}>
          <Table
            head={['module', 'variant', 'factors', 'items', 'min', 'off', 'rounds'].map((k) => t(`modules.variants.col.${k}`))}
            empty={t('modules.none')}
          >
            {m.modules.flatMap((x) =>
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

      <Card title={t('modules.adoption')}>
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
