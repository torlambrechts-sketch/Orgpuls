import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ExtendTrialForm, NoteForm } from '@/components/admin/ActionForms'
import { ALink, Badge, Card, day, nok, PageHead, pct, Problem, Table, Td, when, type BadgeTone } from '@/components/admin/ui'
import { canSee } from '@/lib/admin/access'
import { auditList, emailLog, isError, orgAttribution, orgDetail, orgTickets, STATUSES, whoami } from '@/lib/admin/api'
import { STATUS_TONE } from '@/components/admin/tones'

const TONE: Record<(typeof STATUSES)[number], BadgeTone> = { trial: 'yellow', grace: 'red', read_only: 'grey', active: 'green' }

/**
 * One organisation (D-90): the company, its billing and agreement, its structure, the people
 * who sign in, its surveys as metadata, a timeline, the notices it has been sent (as counts),
 * internal notes, and its audit trail. Opening it is itself written to that trail.
 */
export default async function AdminOrg({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  const [d, source] = await Promise.all([orgDetail(id), orgAttribution(id)])
  if (isError(d)) {
    if (d.error === 'not_found') notFound()
    return <Problem text={d.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const support = who?.role === 'super_admin' || who?.role === 'support'
  const [mail, trail, cases] = support
    ? await Promise.all([emailLog(id), auditList(id, 100), orgTickets(id)])
    : [null, null, null]
  const o = d.org
  const b = d.billing
  const problems = {
    reason_required: t('org.problem.reason_required'),
    invalid_days: t('org.problem.invalid_days'),
    not_in_trial: t('org.problem.not_in_trial'),
    invalid_note: t('org.problem.invalid_note'),
    not_allowed: t('org.problem.not_allowed'),
    failed: t('org.problem.failed'),
  }
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="grid gap-[10px] border-b border-line py-[7px] text-[13px] last:border-0 [grid-template-columns:150px_minmax(0,1fr)]">
      <span className="text-mut">{k}</span>
      <span className="min-w-0 break-words">{v}</span>
    </div>
  )

  return (
    <>
      <p className="m-0 mb-[8px] text-[12.5px]">
        <ALink href="/admin/orgs">← {t('org.back')}</ALink>
      </p>
      <PageHead title={o.name} lead={`${t('org.orgnr')} ${o.org_number ?? '—'} · ${day(o.created_at)}`}>
        <Badge tone={TONE[o.status]}>{t(`orgs.statusLabel.${o.status}`)}</Badge>
      </PageHead>

      <div className="grid items-start gap-[14px] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t('org.facts')}>
          <Row k={t('org.form')} v={o.registry_form_label ?? '—'} />
          <Row k={t('org.nace')} v={o.registry_nace_code ? `${o.registry_nace_code} ${o.registry_nace_label ?? ''}` : '—'} />
          <Row k={t('org.address')} v={[o.registry_address, o.registry_municipality].filter(Boolean).join(', ') || '—'} />
          <Row k={t('org.stated')} v={o.employee_count} />
          <Row k={t('org.brreg')} v={o.registry_employees ?? '—'} />
          <Row k={t('org.fetched')} v={day(o.registry_fetched_at)} />
          <Row k={t('org.threshold')} v={o.threshold} />
          <Row
            k={t('org.channels')}
            v={`${t('org.mail')} ${o.mail_enabled ? t('org.on') : t('org.off')} · ${t('org.sms')} ${o.sms_enabled ? t('org.on') : t('org.off')}`}
          />
          {isError(source) ? null : (
            <div className="mt-[10px]">
              <h3 className="m-0 mb-[4px] text-[13.5px] font-bold">{t('org.source.title')}</h3>
              {source.row ? (
                <>
                  <Row k={t('org.source.channel')} v={t(`web.channel.${source.row.channel}`)} />
                  <Row k={t('org.source.landing')} v={source.row.first_landing ?? '—'} />
                  <Row k={t('org.source.referrer')} v={source.row.first_referrer ?? '—'} />
                  <Row
                    k={t('org.source.first')}
                    v={
                      [source.row.first_source, source.row.first_medium, source.row.first_campaign].filter(Boolean).join(' / ') ||
                      '—'
                    }
                  />
                  <Row
                    k={t('org.source.last')}
                    v={
                      [source.row.last_source, source.row.last_medium, source.row.last_campaign].filter(Boolean).join(' / ') ||
                      '—'
                    }
                  />
                </>
              ) : (
                <p className="m-0 text-[13px] text-mut">{t('org.source.none')}</p>
              )}
            </div>
          )}
        </Card>

        <Card title={t('org.billing')}>
          {b ? (
            <>
              <Row k={t('org.plan')} v={b.plan ? `${b.plan} · ${nok(b.mrr)}` : '—'} />
              <Row k={t('org.trial')} v={t('org.trialRange', { start: day(b.trial_started_at), end: day(b.trial_ends_at) })} />
              {b.trial_extended_at ? <Row k="" v={t('org.extended', { date: day(b.trial_extended_at) })} /> : null}
              <Row
                k={t('org.confirmation')}
                v={b.confirmed_at ? t('org.confirmed', { date: when(b.confirmed_at) }) : t('org.unconfirmed')}
              />
              <Row k={t('org.invoiceTo')} v={b.invoice_email ?? '—'} />
              <Row k={t('org.ref')} v={b.invoice_ref ?? '—'} />
              <Row k={t('org.ehf')} v={b.ehf ? t('org.yes') : t('org.no')} />
            </>
          ) : (
            <p className="m-0 text-[13px] text-mut">{t('common.none')}</p>
          )}
          <div className="mt-[10px]">
            <Row
              k={t('org.dpa')}
              v={
                d.dpa
                  ? t('org.dpaSigned', {
                      version: d.dpa.version,
                      date: day(d.dpa.signed_at),
                      name: d.dpa.signer_name,
                      title: d.dpa.signer_title,
                    })
                  : t('org.dpaUnsigned')
              }
            />
          </div>
          {support && b && !b.confirmed_at ? (
            <div className="mt-[14px] border-t border-line pt-[12px]">
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
        </Card>

        <Card title={t('org.structure')}>
          <Row k={t('org.groups')} v={d.structure.groups} />
          <Row k={t('org.registered')} v={d.structure.employees} />
          <Row k={t('org.withPhone')} v={d.structure.with_phone} />
          <Row k={t('org.locations')} v={d.structure.locations} />
          <Row
            k={t('org.measures')}
            v={t('org.measuresLine', {
              open: d.measures.open,
              overdue: d.measures.overdue,
              closed: d.measures.closed,
              total: d.measures.total,
            })}
          />
        </Card>

        <Card title={t('org.notes')}>
          <NoteForm
            org={o.id}
            labels={{
              placeholder: t('org.notePlaceholder'),
              submit: t('org.addNote'),
              saving: t('common.saving'),
              done: t('common.done'),
              problems,
            }}
          />
          <ul className="m-0 mt-[12px] flex list-none flex-col gap-[8px] p-0">
            {d.notes.map((n) => (
              <li key={n.id} className="rounded-ctl bg-bg px-[12px] py-[9px]">
                <span className="block whitespace-pre-wrap text-[13px] leading-[1.5]">{n.body}</span>
                <span className="mt-[4px] block text-[11.5px] text-mut">
                  {n.author_email ?? '—'} · {when(n.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {cases && !isError(cases) ? (
        <Card title={t('org.tickets')} className="mt-[14px]">
          <Table
            head={[t('tickets.col.number'), t('tickets.col.subject'), t('tickets.col.status'), t('tickets.col.created')]}
            empty={cases.rows.length ? undefined : t('common.none')}
          >
            {cases.rows.map((c) => (
              <tr key={c.id}>
                <Td className="font-semibold">
                  <ALink href={`/admin/tickets/${c.id}`}>#{c.number}</ALink>
                </Td>
                <Td wrap className="min-w-[240px]">
                  <ALink href={`/admin/tickets/${c.id}`}>{c.subject}</ALink>
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[c.status] ?? 'grey'}>{t(`tickets.statuses.${c.status}`)}</Badge>
                </Td>
                <Td>{when(c.created_at)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      {d.users ? (
        <Card title={t('org.users')} className="mt-[14px]">
          <Table
            head={[
              t('org.usersHead.name'),
              t('org.usersHead.email'),
              t('org.usersHead.role'),
              t('org.usersHead.lastSignIn'),
              t('org.usersHead.mfa'),
              t('org.usersHead.joined'),
            ]}
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
        </Card>
      ) : null}

      {d.rounds ? (
        <Card title={t('org.rounds')} className="mt-[14px]">
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
        </Card>
      ) : null}

      {d.timeline ? (
        <Card title={t('org.timeline')} className="mt-[14px]">
          <ol className="m-0 flex list-none flex-col gap-[6px] p-0">
            {d.timeline.map((e, i) => (
              <li key={i} className="grid gap-[10px] text-[13px] [grid-template-columns:170px_minmax(0,1fr)]">
                <span className="text-mut">{when(e.at)}</span>
                <span>{t.has(`org.event.${e.event}`) ? t(`org.event.${e.event}`) : e.event}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {mail && !isError(mail) ? (
        <Card
          title={t('org.emailLog')}
          className="mt-[14px]"
          aside={
            mail.address_problems ? (
              <span className="text-[12.5px] font-semibold text-danger">
                {t('org.addressProblems', { count: mail.address_problems })}
              </span>
            ) : undefined
          }
        >
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
        </Card>
      ) : null}

      {trail && !isError(trail) && who?.role && canSee(who.role, 'orgs') ? (
        <Card title={t('org.audit')} className="mt-[14px]">
          <Table
            head={[t('audit.head.at'), t('audit.head.who'), t('audit.head.action'), t('audit.head.reason')]}
            empty={trail.rows.length ? undefined : t('common.none')}
          >
            {trail.rows.map((a) => (
              <tr key={a.id}>
                <Td>{when(a.at)}</Td>
                <Td>{a.admin_email ?? '—'}</Td>
                <Td>{a.action}</Td>
                <Td>{a.reason ?? '—'}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </>
  )
}
