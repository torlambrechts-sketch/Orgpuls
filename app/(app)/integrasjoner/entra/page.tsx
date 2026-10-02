import { notFound } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'
import { EntraGroupsAndSync, EntraSyncButtons, type EntraGroupLabels } from '@/components/integrasjoner/EntraImport'
import { getCurrentOrgId } from '@/lib/org/current'
import { entraClientId, getEntraStatus } from '@/lib/entra/read'
import { SKIP_REASONS, getEntraSync } from '@/lib/entra/import'
import { bindProblemFrom, entraGate } from '@/lib/entra/schema'
import { startEntraBinding, unbindEntra } from './actions'

/**
 * Integrasjoner › Microsoft Entra ID — the design's connection screen, `isEntra` branch
 * (Orgpuls_v3.dc.html lines 1803-1874, data 4558-4640). D-201.
 *
 * **What is built is the first half of the design's wizard.** Card 1 («Katalogen deres») and
 * card 2 («Hva vi ber om») are real: the tenant is the one the leader is signed in from — read
 * from their Microsoft identity, never typed, because a typed tenant is exactly what must not
 * be authorised on — and the permissions are the ones the consent covers. «Godkjenn og koble
 * til» sends a daglig leder, signed in with Microsoft, to Microsoft's admin consent; the binding
 * is made by the database when the answer comes back (0155).
 *
 * Cards 3 and 4 (groups, synchronisation) are the import (0165, D-202): the tenant's groups to
 * tick and rank, the mode and the phone opt-in, and on the right the last run as the database
 * recorded it, with «Synkroniser nå». Before a run the result says there has been none; a count
 * is shown only as a run wrote it. They appear once a tenant is bound, and to the daglig leder
 * only, since entra_sync_status answers nobody else. «Tilkoblet» only when the binding row exists.
 *
 * Without ENTRA_CLIENT_ID in the environment there is no application to consent to: the screen
 * says the connection is not set up yet and offers no button.
 */
export const dynamic = 'force-dynamic'

const PERMS = ['signin', 'profile', 'users', 'groups', 'never'] as const
const COUNTS = ['added', 'linked', 'updated', 'deactivated', 'moved', 'deferred', 'renamed'] as const
/** a run's error code as the screen words it */
const errorKey = (code: string) =>
  ['not_configured', 'consent_missing', 'permission_missing', 'throttled', 'deadline'].includes(code)
    ? code
    : code.startsWith('cert_')
      ? 'cert'
      : 'other'

export default async function EntraPage({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string; koblet?: string; frakoblet?: string }>
}) {
  const t = await getTranslations('integrasjoner.entraSetup')
  const ti = await getTranslations('entraImport')
  const tn = await getTranslations()
  const format = await getFormatter()
  const params = await searchParams
  const orgId = await getCurrentOrgId()
  if (!orgId) notFound()
  const [status, sync] = await Promise.all([getEntraStatus(orgId), getEntraSync(orgId)])
  const clientId = entraClientId()
  const gate = entraGate(status, clientId)
  const problem = bindProblemFrom(params.feil)
  const date = (iso: string | null | undefined) => (iso ? format.dateTime(new Date(iso), { dateStyle: 'long' }) : '')
  const when = (iso: string | null | undefined) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' }) : ''
  // the import: only once a tenant is bound, and only for the daglig leder (entra_sync_status)
  const importing = Boolean(status?.bound && sync)
  const run = sync?.run ?? null
  const lastDone = run?.status === 'done' ? run.finished_at : null
  const memberLabels: Record<string, string> = {}
  for (const g of sync?.groups ?? []) memberLabels[String(g.members)] = ti('members', { count: g.members })
  const groupLabels: EntraGroupLabels = {
    step3: ti('step3'),
    search: ti('search'),
    searchPlaceholder: ti('searchPlaceholder'),
    searchButton: ti('searchButton'),
    loading: ti('loading'),
    fromDirectory: ti('fromDirectory'),
    members: memberLabels,
    more: ti('more'),
    noMatch: ti('noMatch'),
    order: ti('order'),
    orderNote: ti('orderNote'),
    up: ti.raw('up') as string,
    down: ti.raw('down') as string,
    saveGroups: ti('saveGroups'),
    saved: ti('saved'),
    groupNote: ti('groupNote'),
    step4: ti('step4'),
    modes: {
      nightly: { label: ti('mode.nightly'), note: ti('mode.nightlyNote') },
      manual: { label: ti('mode.manual'), note: ti('mode.manualNote') },
    },
    phone: ti('phone'),
    phoneNote: ti('phoneNote'),
    leaverNote: ti('leaverNote'),
    roundNote: ti('roundNote'),
    pending: ti('pending'),
    readOnly: ti('readOnly'),
    problems: Object.fromEntries(
      ['not_allowed', 'no_tenant', 'not_set_up', 'no_groups', 'busy', 'rate_limited', 'not_configured', 'name_taken',
        'consent_missing', 'permission_missing', 'invalid', 'denied', 'noOrg', 'unavailable'].map((k) => [k, ti(`problem.${k}`)]),
    ),
  }

  const tenant = status?.tenant_id ?? status?.own_tenant ?? ''
  const card = 'rounded-panel border border-line bg-sf px-[24px] py-[22px]'
  const head = 'text-[11px] uppercase tracking-[0.11em] text-mut'

  return (
    <main className="animate-entry mx-auto max-w-page px-[16px] pb-[60px] pt-[26px] md:px-[28px]">
      <ButtonLink href={{ pathname: '/oppsett', query: { fane: 'integrasjoner' } }} size="xxs" tone="ghost">
        {t('back')}
      </ButtonLink>

      <div className="mt-[16px] flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-[11px]">
            <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">
              {tn('oppsett.integrasjoner.entra.name')}
            </h1>
            <span
              className="rounded-pill px-[12px] py-[4px] text-[11.5px] font-bold"
              style={status?.bound ? { background: '#CFE7E4', color: '#20431C' } : { background: '#FBEBBE', color: '#5C4600' }}
            >
              {status?.bound ? t('statusOn') : t('statusOff')}
            </span>
          </span>
          <p className="mt-[9px] max-w-[620px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">{t('lead')}</p>
        </div>
      </div>

      <div className="mt-[24px] grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.55fr)_minmax(280px,.9fr)]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          {/* 1 · Katalogen deres */}
          <section className={card}>
            <div className={head}>{t('step1')}</div>
            <label className="mt-[13px] block max-w-[360px]">
              <span className="mb-[6px] block text-[12.5px] text-mut">{t('tenantLabel')}</span>
              <input
                value={tenant}
                readOnly
                placeholder={t('tenantPlaceholder')}
                aria-describedby="entra-tenant-note"
                className="box-border h-[42px] w-full rounded-btn border border-line bg-bg px-[14px] text-[14px] text-ink outline-none"
              />
            </label>
            <div id="entra-tenant-note" className="mt-[9px] max-w-[560px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
              {status?.bound
                ? t('tenantBound', { date: date(status.bound_at) })
                : status?.own_tenant
                  ? t('tenantOwn')
                  : t('tenantNone')}
            </div>
            {importing && sync ? (
              <div className="mt-[6px] max-w-[560px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                {lastDone
                  ? ti('found', { people: sync.synced, groups: sync.groups.length, when: when(lastDone) })
                  : ti('foundNone')}
              </div>
            ) : null}
          </section>

          {/* 2 · Hva vi ber om */}
          <section className={card}>
            <div className={head}>{t('step2')}</div>
            <div className="mt-[13px] flex flex-col gap-[8px]">
              {PERMS.map((k) => (
                <div
                  key={k}
                  className="grid gap-[4px] rounded-cta border border-line bg-bg px-[14px] py-[12px] md:items-center md:gap-[14px] md:[grid-template-columns:150px_minmax(0,1fr)_128px]"
                >
                  <span className="font-mono text-[12.5px] font-bold">{t(`perm.${k}.scope`)}</span>
                  <span className="text-[12.5px] leading-[1.5] [text-wrap:pretty]">{t(`perm.${k}.what`)}</span>
                  <span className="text-[11.5px] text-mut md:text-right">{t(`perm.${k}.kind`)}</span>
                </div>
              ))}
            </div>
            <div className="mt-[12px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{t('permNote')}</div>
          </section>

          {/* 3 · Hvilke grupper skal med, 4 · Synkronisering: the import (D-202) */}
          {importing && sync ? (
            <EntraGroupsAndSync
              chosen={sync.groups.map((g) => ({ id: g.entra_group_id, name: g.entra_name ?? g.name, members: sync.run ? g.members : null }))}
              mode={sync.mode}
              includePhone={sync.include_phone}
              canWrite={Boolean(status?.daglig_leder) && clientId !== null}
              labels={groupLabels}
            />
          ) : (
            (['step3', 'step4'] as const).map((k) => (
              <section key={k} className={card}>
                <div className={head}>{ti(k)}</div>
                <div className="mt-[10px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
                  {status?.bound ? ti('readOnly') : ti('bindFirst')}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-[14px] md:sticky md:top-[78px]">
          {importing && sync ? (
            <>
              <section className="rounded-panel border border-line bg-sf p-[20px]" aria-labelledby="entra-result">
                <div id="entra-result" className={head}>{ti('result')}</div>
                <div className="mt-[11px] text-[13.5px] font-bold">
                  {run ? ti(`run.${run.status}`, { when: when(run.status === 'running' ? run.started_at : run.finished_at) }) : ti('never')}
                </div>
                {sync.requested_at ? (
                  <div className="mt-[4px] text-[12.5px] text-mut">{ti('run.requested', { when: when(sync.requested_at) })}</div>
                ) : null}
                {run?.status === 'failed' && run.error ? (
                  <p role="alert" className="mb-0 mt-[8px] text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
                    {ti(`error.${errorKey(run.error)}`)}
                  </p>
                ) : null}
                {run?.status === 'done' ? (
                  COUNTS.some((k) => (run.counts[k] ?? 0) > 0) ? (
                    <dl className="m-0 mt-[10px] flex flex-col gap-[4px]">
                      {COUNTS.filter((k) => (run.counts[k] ?? 0) > 0).map((k) => (
                        <div key={k} className="flex items-baseline justify-between gap-[12px] text-[12.5px]">
                          <dt className="text-mut">{ti(`count.${k}`)}</dt>
                          <dd className="m-0 font-bold">{run.counts[k]}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <div className="mt-[6px] text-[12.5px] text-mut">{ti('noChanges')}</div>
                  )
                ) : null}

                {sync.deferred.length ? (
                  <div className="mt-[14px] border-t border-line pt-[12px]">
                    <div className="text-[12.5px] font-bold">{ti('deferredHead')}</div>
                    <ul className="m-0 mt-[6px] flex list-none flex-col gap-[3px] p-0 text-[12.5px] leading-[1.5]">
                      {sync.deferred.map((d) => (
                        <li key={d.employee_id}>{ti('deferredRow', { name: d.name, from: d.from ?? ti('noGroup'), to: d.to })}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {sync.conflicts.length ? (
                  <div className="mt-[14px] border-t border-line pt-[12px]">
                    <div className="text-[12.5px] font-bold">{ti('conflictsHead')}</div>
                    <ul className="m-0 mt-[6px] flex list-none flex-col gap-[3px] p-0 text-[12.5px] leading-[1.5]">
                      {sync.conflicts.map((c) => (
                        <li key={c.employee_id}>
                          {ti('conflictRow', { name: c.name, groups: format.list(c.groups ?? [], { type: 'conjunction' }), chosen: c.chosen ?? '' })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {SKIP_REASONS.some((r) => (sync.skipped[r] ?? 0) > 0) ? (
                  <div className="mt-[14px] border-t border-line pt-[12px]">
                    <div className="text-[12.5px] font-bold">{ti('skippedHead')}</div>
                    <dl className="m-0 mt-[6px] flex flex-col gap-[3px]">
                      {SKIP_REASONS.filter((r) => (sync.skipped[r] ?? 0) > 0).map((r) => (
                        <div key={r} className="flex items-baseline justify-between gap-[12px] text-[12.5px]">
                          <dt className="text-mut">{ti(`skip.${r}`)}</dt>
                          <dd className="m-0 font-bold">{sync.skipped[r]}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </section>
              {status?.daglig_leder ? (
                <EntraSyncButtons
                  canSync={clientId !== null && sync.function_ready && sync.groups.length > 0}
                  canDisconnect={sync.set_up}
                  labels={{
                    syncNow: ti('syncNow'),
                    syncNote: ti(`syncNote.${sync.mode}`),
                    functionNotReady: clientId === null ? ti('error.not_configured') : sync.function_ready ? null : ti('functionNotReady'),
                    requestedNow: ti('requestedNow'),
                    disconnect: ti('disconnect'),
                    disconnectConfirm: ti('disconnectConfirm'),
                    pending: ti('pending'),
                    problems: groupLabels.problems,
                  }}
                />
              ) : null}
            </>
          ) : null}
          {params.koblet === '1' && status?.bound ? (
            <div role="status" className="rounded-note bg-mint px-[20px] py-[16px] text-[13px] leading-[1.55] text-greendeep [text-wrap:pretty]">
              {t('done')}
            </div>
          ) : null}
          {params.frakoblet === '1' && !status?.bound ? (
            <div role="status" className="rounded-note border border-line bg-sf px-[20px] py-[16px] text-[13px] leading-[1.55] [text-wrap:pretty]">
              {t('undone')}
            </div>
          ) : null}
          {problem ? (
            <p role="alert" className="m-0 text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
              {t(`problem.${problem}`)}
            </p>
          ) : null}

          {gate === 'can_bind' ? (
            <form action={startEntraBinding} className="flex flex-col">
              <button type="submit" className="h-[46px] cursor-pointer rounded-cta border border-ink bg-ac text-[15px] font-bold text-ink">
                {t('connect')}
              </button>
            </form>
          ) : gate === 'bound' && status?.daglig_leder ? (
            <form action={unbindEntra} className="flex flex-col">
              <button type="submit" className="h-[46px] cursor-pointer rounded-cta border border-ink bg-transparent text-[15px] font-bold text-ink">
                {t('disconnect')}
              </button>
            </form>
          ) : gate !== 'bound' ? (
            <div className="rounded-note border border-line bg-sbg px-[20px] py-[18px] text-[12.5px] leading-[1.6] text-body [text-wrap:pretty]">
              {t(`gate.${gate}`)}
            </div>
          ) : null}

          <div className="text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
            {status?.bound ? t('boundNote') : t('toggleNote')} {t('mfaNote')}
          </div>
          {status?.last_event ? (
            <div className="text-[12px] leading-[1.5] text-mut">
              {t(`lastEvent.${status.last_event.event}`, { date: date(status.last_event.happened_at) })}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
