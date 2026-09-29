import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ExtendTrialForm, NoteForm } from '@/components/admin/ActionForms'
import { CancelForm, DeleteNowForm, WithdrawForm } from '@/components/admin/CancelForms'
import { EditCustomer } from '@/components/admin/CustomerForms'
import { ALink, Avatar, Badge, day, pct, Problem, Table, Td, when } from '@/components/admin/ui'
import { STATUS_TONE } from '@/components/admin/tones'
import { didKey, firstName, targetOf, when as whenShort } from '@/lib/admin/activity'
import { canSee } from '@/lib/admin/access'
import {
  accountHealth,
  auditList,
  emailLog,
  isError,
  orgAttribution,
  orgCancellation,
  orgDetail,
  orgLifecycle,
  orgOwner,
  orgTickets,
  whoami,
} from '@/lib/admin/api'
import { customerState, seats, STATE_DOT } from '@/lib/admin/customers'

/**
 * One customer (X-095, the design's `isCustomerDetail`; D-90 before it). The design's two columns:
 * on the left the seats against the plan, the organisation's structure, its billing and agreement,
 * a cancellation, its tickets and the trial mails; on the right the account's facts with its owner
 * and health, where it came from, the team's notes and what the team did. The wide tables — its
 * users, its surveys as metadata, its timeline and the mail sent to it as counts — follow below.
 * Opening it is itself written to the audit log.
 */
export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const c = (k: string, v?: Record<string, string | number>) => t(`customers.${k}`, v)
  const who = await whoami()
  const [d, source, owner, health] = await Promise.all([orgDetail(id), orgAttribution(id), orgOwner(id), accountHealth()])
  if (isError(d)) {
    if (d.error === 'not_found') notFound()
    return <Problem text={d.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const support = who?.role === 'super_admin' || who?.role === 'support'
  const billingRole = support || who?.role === 'finance'
  const cancel = billingRole ? await orgCancellation(id) : null
  const [mail, trail, cases, life] = support
    ? await Promise.all([emailLog(id), auditList(id, 100), orgTickets(id), orgLifecycle(id)])
    : [null, null, null, null]
  const o = d.org
  const b = d.billing
  const cx = cancel && !isError(cancel) ? cancel.row : null
  const state = customerState({ status: o.status, cancelled_at: cx?.cancelled_at ?? null, cancel_effective_at: cx?.effective_at ?? null, demo: false })
  const seat = seats(b?.plan ?? null, o.employee_count, d.structure.employees)
  const leader = d.users?.find((u) => u.role === 'daglig_leder' && u.active) ?? null
  const score = isError(health) ? null : (health.rows.find((h) => h.id === o.id) ?? null)
  const acts = trail && !isError(trail) ? trail.rows.filter((a) => t.has(didKey(a.action))).slice(0, 8) : null
  const problems = {
    reason_required: t('org.problem.reason_required'),
    invalid_days: t('org.problem.invalid_days'),
    not_in_trial: t('org.problem.not_in_trial'),
    invalid_note: t('org.problem.invalid_note'),
    not_allowed: t('org.problem.not_allowed'),
    failed: t('org.problem.failed'),
  }
  const planName = c(`plans.${seat.plan}`)

  return (
    <>
      <nav aria-label={c('crumbs')} className="flex items-center gap-[8px] text-[12.5px] text-mut md:px-[18px]">
        <Link href={'/admin/orgs' as Route} className="text-mut underline-offset-2 hover:text-ink">
          {c('title')}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          →
        </span>
        <span aria-current="page" className="font-semibold text-ink">
          {o.name}
        </span>
      </nav>
      <div className="mt-[10px] flex flex-wrap items-end justify-between gap-[16px] md:px-[18px]">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[28px] font-medium leading-[1.15]">{o.name}</h1>
          <div className="mt-[6px] flex flex-wrap items-center gap-[10px] text-[13px] text-mut">
            <Badge tone={STATE_DOT[state]}>{c(`state.${state}`)}</Badge>
            {leader ? `${leader.name ?? leader.email ?? ''}${leader.name && leader.email ? ` · ${leader.email}` : ''}` : `${t('org.orgnr')} ${o.org_number ?? '—'}`}
          </div>
        </div>
        {!isError(owner) && owner.can_set ? (
          <EditCustomer
            org={o.id}
            owner={owner.owner?.id ?? null}
            candidates={owner.candidates}
            labels={{
              open: c('edit.open'),
              title: c('edit.title', { name: o.name }),
              sub: c('edit.sub'),
              owner: c('owner'),
              nobody: c('noOwner'),
              save: c('edit.save'),
              cancel: c('edit.cancel'),
              close: c('edit.close'),
              saving: t('common.saving'),
              failed: t('common.failed'),
            }}
          />
        ) : null}
      </div>

      <div className="mt-[22px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(300px,.9fr)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Panel title={c('seats.title')} aside={seat.chosen ? c('seats.plan', { plan: planName }) : c('seats.fits', { plan: planName })}>
            {seat.pct === null ? (
              <p className="mb-0 mt-[16px] text-[13px] text-mut">
                <b className="text-[32px] leading-none text-ink">{seat.used}</b> {c('seats.noCeiling')}
              </p>
            ) : (
              <div className="mt-[16px] flex items-center gap-[14px]">
                <span className="text-[32px] font-bold leading-none">{seat.pct} %</span>
                <span className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]" aria-hidden="true">
                  <span className="block h-full rounded-pill bg-ac" style={{ width: `${seat.pct}%` }} />
                </span>
                <span className="text-[13px] text-mut">{c('seats.of', { used: seat.used, max: seat.max ?? 0 })}</span>
              </div>
            )}
          </Panel>

          <Panel title={t('org.structure')} aside={c('groups', { count: d.structure.groups })}>
            <Facts
              rows={[
                [t('org.registered'), d.structure.employees],
                [t('org.withPhone'), d.structure.with_phone],
                [t('org.locations'), d.structure.locations],
                [t('org.measures'), t('org.measuresLine', { open: d.measures.open, overdue: d.measures.overdue, closed: d.measures.closed, total: d.measures.total })],
              ]}
            />
          </Panel>

          <Panel title={t('org.billing')}>
            {b ? (
              <Facts
                rows={[
                  [t('org.trial'), t('org.trialRange', { start: day(b.trial_started_at), end: day(b.trial_ends_at) })],
                  ...(b.trial_extended_at ? [[c('extended'), day(b.trial_extended_at)] as [string, string]] : []),
                  [t('org.confirmation'), b.confirmed_at ? t('org.confirmed', { date: when(b.confirmed_at) }) : t('org.unconfirmed')],
                  [t('org.invoiceTo'), b.invoice_email ?? '—'],
                  [t('org.ref'), b.invoice_ref ?? '—'],
                  [t('org.ehf'), b.ehf ? t('org.yes') : t('org.no')],
                  [
                    t('org.dpa'),
                    d.dpa
                      ? t('org.dpaSigned', { version: d.dpa.version, date: day(d.dpa.signed_at), name: d.dpa.signer_name, title: d.dpa.signer_title })
                      : t('org.dpaUnsigned'),
                  ],
                ]}
              />
            ) : (
              <p className="mb-0 mt-[8px] text-[13px] text-mut">{t('common.none')}</p>
            )}
            {support && b && !b.confirmed_at ? (
              <div className="mt-[16px] border-t border-line pt-[14px]">
                <h3 className="m-0 mb-[6px] text-[13.5px] font-bold">{t('org.extend')}</h3>
                <ExtendTrialForm
                  org={o.id}
                  labels={{
                    lead: t('org.extendLead'),
                    days: t('org.days'),
                    submit: t('org.extendSubmit'),
                    reason: t('common.reason'),
                    reasonHint: t('common.reasonHint'),
                    saving: t('common.saving'),
                    done: t('common.done'),
                    problems,
                  }}
                />
              </div>
            ) : null}
          </Panel>

          {cx ? (
            <Panel title={t('org.cancel.title')}>
              {cx.cancelled_at && cx.effective_at && cx.deletion_due_at ? (
                <>
                  <Facts
                    rows={[
                      [t('org.cancel.registered'), `${when(cx.cancelled_at)} · ${t(`org.cancel.source.${cx.source ?? 'admin'}`)}${cx.cancelled_by ? ` (${cx.cancelled_by})` : ''}`],
                      ...(cx.reason ? [[t('org.cancel.why'), t(`org.cancel.reason.${cx.reason}`)] as [string, string]] : []),
                      [t('org.cancel.lastDay'), day(new Date(new Date(cx.effective_at).getTime() - 1000).toISOString())],
                      [t('org.cancel.deletion'), day(cx.deletion_due_at)],
                    ]}
                  />
                  <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('org.cancel.after')}</p>
                  <div className="mt-[14px] flex flex-col gap-[16px]">
                    <div>
                      <h3 className="m-0 mb-[6px] text-[13.5px] font-bold">{t('org.cancel.withdraw')}</h3>
                      <WithdrawForm
                        org={o.id}
                        labels={{
                          submit: t('org.cancel.withdrawSubmit'),
                          reason: t('common.reason'),
                          reasonHint: t('common.reasonHint'),
                          saving: t('common.saving'),
                          done: t('common.done'),
                          problems: { ...problems, not_cancelled: t('org.cancel.problem.not_cancelled') },
                        }}
                      />
                    </div>
                    {who?.role === 'super_admin' ? (
                      <DeleteNowForm
                        org={o.id}
                        labels={{
                          lead: t('org.cancel.nowLead', { number: cx.org_number ?? o.name }),
                          confirm: t('org.cancel.confirm'),
                          submit: t('org.cancel.nowSubmit'),
                          reason: t('common.reason'),
                          reasonHint: t('common.reasonHint'),
                          saving: t('common.saving'),
                          done: t('common.done'),
                          problems: { ...problems, confirm_mismatch: t('org.cancel.problem.confirm_mismatch'), not_cancelled: t('org.cancel.problem.not_cancelled') },
                        }}
                      />
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="mt-[12px]">
                  <CancelForm
                    org={o.id}
                    defaultEnds={endOfMonth()}
                    labels={{
                      lead: t('org.cancel.lead'),
                      ends: t('org.cancel.ends'),
                      submit: t('org.cancel.submit'),
                      reason: t('common.reason'),
                      reasonHint: t('common.reasonHint'),
                      saving: t('common.saving'),
                      done: t('common.done'),
                      problems: { ...problems, invalid_date: t('org.cancel.problem.invalid_date'), already_cancelled: t('org.cancel.problem.already_cancelled') },
                    }}
                  />
                </div>
              )}
            </Panel>
          ) : null}

          {cases && !isError(cases) ? (
            <Panel title={t('org.tickets')} aside={c('openTickets', { count: cases.rows.filter((x) => x.status !== 'resolved' && x.status !== 'closed').length })}>
              {cases.rows.length ? (
                <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
                  {cases.rows.map((x) => (
                    <li key={x.id} className="flex items-center gap-[12px] border-b border-line py-[11px] text-[13.5px]">
                      <span className="min-w-0 flex-1">
                        <ALink href={`/admin/tickets/${x.id}`}>#{x.number}</ALink> {x.subject}
                      </span>
                      <span className="whitespace-nowrap text-[12.5px] text-mut">{day(x.created_at)}</span>
                      <Badge tone={STATUS_TONE[x.status] ?? 'grey'}>{t(`tickets.statuses.${x.status}`)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title={c('noTickets')} lead={c('noTicketsLead')} />
              )}
            </Panel>
          ) : null}

          {life && !isError(life) ? (
            <Panel title={t('org.lifecycle.title')}>
              {life.rows.length ? (
                <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
                  {life.rows.map((r) => (
                    <li key={r.step + r.created_at} className="flex items-center gap-[12px] border-b border-line py-[11px] text-[13.5px]">
                      <span className="min-w-0 flex-1 font-semibold">{t(`org.lifecycle.steps.${r.step}`)}</span>
                      <span className="whitespace-nowrap text-[12.5px] text-mut">{r.sent_at ? when(r.sent_at) : when(r.created_at)}</span>
                      <Badge tone={r.status === 'sent' ? 'green' : r.status === 'failed' ? 'red' : r.status === 'skipped' ? 'grey' : 'yellow'}>
                        {t(`org.lifecycle.statuses.${r.status}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-0 mt-[8px] text-[13px] text-mut">{t('org.lifecycle.none')}</p>
              )}
              <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('org.lifecycle.note')}</p>
            </Panel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <Panel title={c('account')}>
            <Facts
              rows={[
                [t('org.plan'), seat.chosen ? planName : c('noPlan')],
                b?.confirmed_at ? [c('since'), day(b.confirmed_at)] : [c('trialEndsLabel'), b ? day(b.trial_ends_at) : '—'],
                [c('owner'), isError(owner) ? '—' : (owner.owner?.email ?? c('noOwner'))],
                ...(score ? [[c('health'), c('healthScore', { score: score.score })] as [string, string]] : []),
                [t('org.orgnr'), o.org_number ?? '—'],
                [c('signedUp'), day(o.created_at)],
                [t('org.nace'), o.registry_nace_code ? `${o.registry_nace_code} ${o.registry_nace_label ?? ''}` : '—'],
                [t('org.form'), o.registry_form_label ?? '—'],
                [t('org.address'), [o.registry_address, o.registry_municipality].filter(Boolean).join(', ') || '—'],
                [t('org.stated'), o.employee_count],
                [t('org.brreg'), o.registry_employees ?? '—'],
                [t('org.threshold'), o.threshold],
                [t('org.channels'), `${t('org.mail')} ${o.mail_enabled ? t('org.on') : t('org.off')} · ${t('org.sms')} ${o.sms_enabled ? t('org.on') : t('org.off')}`],
              ]}
            />
          </Panel>

          {isError(source) ? null : (
            <Panel title={t('org.source.title')}>
              {source.row ? (
                <Facts
                  rows={[
                    [t('org.source.channel'), t(`web.channel.${source.row.channel}`)],
                    [t('org.source.landing'), source.row.first_landing ?? '—'],
                    [t('org.source.heard'), source.row.heard ? t(`web.heard.${source.row.heard}`) : '—'],
                    [t('org.source.referrer'), source.row.first_referrer ?? '—'],
                    [t('org.source.first'), [source.row.first_source, source.row.first_medium, source.row.first_campaign].filter(Boolean).join(' / ') || '—'],
                    [t('org.source.last'), [source.row.last_source, source.row.last_medium, source.row.last_campaign].filter(Boolean).join(' / ') || '—'],
                  ]}
                />
              ) : (
                <p className="mb-0 mt-[8px] text-[13px] text-mut">{t('org.source.none')}</p>
              )}
            </Panel>
          )}

          <Panel title={t('org.notes')}>
            <div className="mt-[12px]">
              <NoteForm org={o.id} labels={{ placeholder: t('org.notePlaceholder'), submit: t('org.addNote'), saving: t('common.saving'), done: t('common.done'), problems }} />
            </div>
            {d.notes.length ? (
              <ul className="m-0 mt-[12px] flex list-none flex-col gap-[8px] p-0">
                {d.notes.map((n) => (
                  <li key={n.id} className="rounded-[12px] border border-line bg-bg px-[14px] py-[10px]">
                    <span className="block whitespace-pre-wrap text-[13px] leading-[1.5]">{n.body}</span>
                    <span className="mt-[4px] block text-[11.5px] text-mut">
                      {n.author_email ?? '—'} · {when(n.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          {acts ? (
            <Panel title={c('activity')}>
              {acts.length ? (
                <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
                  {acts.map((a) => {
                    const target = targetOf(a)
                    return (
                      <li key={a.id} className="flex gap-[12px] border-b border-line py-[11px]">
                        <Avatar name={a.admin_email ?? '·'} />
                        <div className="min-w-0 flex-1 text-[13.5px]">
                          <span className="font-semibold">{firstName(a.admin_email)}</span> {t(didKey(a.action))}
                          {target && target !== o.name ? ` ${target}` : ''}
                          <span className="block text-[12px] text-mut">
                            {whenShort(a.at, t)}
                            {a.reason ? ` · ${a.reason}` : ''}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <Empty title={c('noActivity')} lead={c('noActivityLead')} />
              )}
            </Panel>
          ) : null}
        </div>
      </div>

      {d.users ? (
        <Panel title={t('org.users')} className="mt-[18px]">
          <div className="mt-[8px]">
            <Table
              head={[t('org.usersHead.name'), t('org.usersHead.email'), t('org.usersHead.role'), t('org.usersHead.lastSignIn'), t('org.usersHead.mfa'), t('org.usersHead.joined')]}
              empty={d.users.length ? undefined : t('common.none')}
            >
              {d.users.map((u) => (
                <tr key={u.user_id}>
                  <Td>{u.name ?? '—'}</Td>
                  <Td>{u.email ?? '—'}</Td>
                  <Td>
                    {u.role}
                    {u.active ? null : ` · ${t('org.inactive')}`}
                  </Td>
                  <Td>{when(u.last_sign_in_at)}</Td>
                  <Td>{u.mfa_factors > 0 ? t('org.yes') : t('org.no')}</Td>
                  <Td>{day(u.joined_at)}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </Panel>
      ) : null}

      {d.rounds ? (
        <Panel title={t('org.rounds')} className="mt-[18px]">
          <div className="mt-[8px]">
            <Table
              head={[
                t('org.roundsHead.kind'),
                t('org.roundsHead.status'),
                t('org.roundsHead.opens'),
                t('org.roundsHead.closes'),
                t('org.roundsHead.invited'),
                t('org.roundsHead.answered'),
                t('org.roundsHead.rate'),
                t('org.roundsHead.below'),
                t('org.roundsHead.reminders'),
                t('org.roundsHead.notices'),
              ]}
              empty={d.rounds.length ? undefined : t('common.none')}
            >
              {d.rounds.map((r) => (
                <tr key={r.id}>
                  <Td>
                    {r.kind} {r.year}
                  </Td>
                  <Td>{r.status}</Td>
                  <Td>{day(r.opens_at)}</Td>
                  <Td>{day(r.closes_at)}</Td>
                  <Td>{r.invited ?? 0}</Td>
                  <Td>{r.answered ?? 0}</Td>
                  <Td>{pct(r.answered, r.invited)}</Td>
                  <Td>{r.groups_below_threshold ?? 0}</Td>
                  <Td>{r.reminders_sent}</Td>
                  <Td>
                    {r.notices_sent} / {r.notices_failed} / {r.notices_pending}
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        </Panel>
      ) : null}

      {d.timeline ? (
        <Panel title={t('org.timeline')} className="mt-[18px]">
          <ol className="m-0 mt-[8px] flex list-none flex-col p-0">
            {d.timeline.map((e, i) => (
              <li key={i} className="flex justify-between gap-[12px] border-b border-line py-[10px] text-[13.5px]">
                <span>{t.has(`org.event.${e.event}`) ? t(`org.event.${e.event}`) : e.event}</span>
                <span className="whitespace-nowrap text-[12.5px] text-mut">{when(e.at)}</span>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      {mail && !isError(mail) ? (
        <Panel
          title={t('org.emailLog')}
          className="mt-[18px]"
          aside={mail.address_problems ? <span className="font-semibold text-danger">{t('org.addressProblems', { count: mail.address_problems })}</span> : undefined}
        >
          <div className="mt-[8px]">
            <Table
              head={[
                t('org.emailHead.day'),
                t('org.emailHead.kind'),
                t('org.emailHead.channel'),
                t('org.emailHead.audience'),
                t('org.emailHead.total'),
                t('org.emailHead.sent'),
                t('org.emailHead.failed'),
                t('org.emailHead.pending'),
                t('org.emailHead.delivered'),
                t('org.emailHead.bounced'),
                t('org.emailHead.complaints'),
              ]}
              empty={mail.rows.length ? undefined : t('common.none')}
            >
              {mail.rows.map((m, i) => (
                <tr key={i}>
                  <Td>{m.day}</Td>
                  <Td>{m.kind}</Td>
                  <Td>{m.channel ?? '—'}</Td>
                  <Td>{m.audience}</Td>
                  <Td>{m.total}</Td>
                  <Td>{m.sent}</Td>
                  <Td className={m.failed ? 'font-bold text-danger' : ''}>{m.failed}</Td>
                  <Td>{m.pending}</Td>
                  <Td>{m.delivered}</Td>
                  <Td className={m.bounced ? 'font-bold text-danger' : ''}>{m.bounced}</Td>
                  <Td className={m.complaints ? 'font-bold text-danger' : ''}>{m.complaints}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </Panel>
      ) : null}

      {trail && !isError(trail) && who?.role && canSee(who.role, 'orgs') ? (
        <Panel title={t('org.audit')} className="mt-[18px]">
          <div className="mt-[8px]">
            <Table head={[t('audit.head.at'), t('audit.head.who'), t('audit.head.action'), t('audit.head.reason')]} empty={trail.rows.length ? undefined : t('common.none')}>
              {trail.rows.map((a) => (
                <tr key={a.id}>
                  <Td>{when(a.at)}</Td>
                  <Td>{a.admin_email ?? '—'}</Td>
                  <Td>{a.action}</Td>
                  <Td wrap>{a.reason ?? '—'}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </Panel>
      ) : null}
    </>
  )
}

/** The design's panel: a display-face heading, a muted note beside it, its content under it */
function Panel({ title, aside, className = '', children }: { title: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px] ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
        <h2 className="m-0 font-display text-[22px] font-medium">{title}</h2>
        {aside ? <span className="text-[12.5px] text-mut">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

/** The design's account facts: the key muted on the left, the value on the right */
function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="m-0 mt-[8px] flex flex-col">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-[12px] border-b border-line py-[10px] text-[13.5px]">
          <dt className="text-mut">{k}</dt>
          <dd className="m-0 min-w-0 break-words text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The design's empty state inside a panel: a dashed box with what will appear there */
function Empty({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="mt-[14px] rounded-[12px] border border-dashed border-line bg-bg p-[22px] text-center">
      <div className="text-[14px] font-semibold">{title}</div>
      <div className="mt-[4px] text-[12.5px] text-mut">{lead}</div>
    </div>
  )
}

/** The last day of this month in Oslo: "at the end of the current month", the usual notice (docs/legal/vilkar-utkast.md § 10). */
function endOfMonth(): string {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0))
  return last.toISOString().slice(0, 10)
}
