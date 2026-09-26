import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PRIORITY_TONE, STATUS_TONE } from '@/components/admin/tones'
import { FieldsForm, ReplyForm, RoundLink } from '@/components/admin/TicketForms'
import { ALink, Badge, Card, PageHead, Problem, when } from '@/components/admin/ui'
import { isError, ticket, TICKET_CATEGORIES, TICKET_IMPACTS, TICKET_QUEUES, TICKET_STATUSES, TICKET_TYPES } from '@/lib/admin/api'

/**
 * One ticket (D-92): the conversation with internal notes marked, a reply or a note, the
 * fields, what it is linked to, and its timeline. A service request is carried out where the
 * action already lives, on the organisation's page, and audited there.
 */
export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const d = await ticket(id)
  if (isError(d)) {
    if (d.error === 'not_found') notFound()
    return <Problem text={d.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const k = d.ticket
  const ctx = k.context as { role?: string; page?: string; browser?: string; verified?: boolean }
  const problems = {
    invalid_reply: t('tickets.problem.invalid_reply'),
    invalid: t('tickets.problem.invalid'),
    not_allowed: t('common.notAllowed'),
    failed: t('common.failed'),
  }
  const opts = (values: readonly string[], ns: string) => values.map((v) => ({ value: v, label: t(`tickets.${ns}.${v}`) }))
  // an id in a change is shown as what it names: an admin's address or a problem's number
  const names = new Map<string, string>([
    ...d.admins.map((a) => [a.id, a.email ?? a.id] as [string, string]),
    ...d.problems.map((p) => [p.id, `#${p.number}`] as [string, string]),
    ...(k.problem_id && k.problem_number ? [[k.problem_id, `#${k.problem_number}`] as [string, string]] : []),
  ])
  const name = (v: unknown) => (v === null || v === undefined ? '—' : (names.get(String(v)) ?? String(v)))
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid gap-[10px] border-b border-line py-[7px] text-[13px] last:border-0 [grid-template-columns:130px_minmax(0,1fr)]">
      <span className="text-mut">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  )

  return (
    <>
      <p className="m-0 mb-[8px] text-[12.5px]">
        <ALink href="/admin/tickets">← {t('tickets.back')}</ALink>
      </p>
      <PageHead title={`#${k.number} ${k.subject}`} lead={`${t(`tickets.channels.${k.channel}`)} · ${when(k.created_at)}`}>
        <span className="flex gap-[6px]">
          <Badge tone={PRIORITY_TONE[k.priority]}>{t(`tickets.priorities.${k.priority}`)}</Badge>
          <Badge tone={STATUS_TONE[k.status]}>{t(`tickets.statuses.${k.status}`)}</Badge>
        </span>
      </PageHead>

      <div className="grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          <Card title={t('tickets.conversation')}>
            <ol className="m-0 flex list-none flex-col gap-[10px] p-0">
              {d.messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-tile border px-[14px] py-[12px] ${m.internal ? 'border-line bg-sbg' : m.author_kind === 'customer' ? 'border-line bg-bg' : 'border-ink bg-sf'}`}
                >
                  <div className="mb-[6px] flex flex-wrap items-baseline justify-between gap-[8px] text-[12px] text-mut">
                    <span className="font-semibold text-ink">
                      {m.author_kind === 'system' ? t('tickets.system') : (m.author_email ?? '—')}
                      {m.internal ? ` · ${t('tickets.internalNote')}` : ''}
                    </span>
                    <span>
                      {when(m.created_at)}
                      {m.mail ? ` · ${t(`tickets.mail.${m.mail}`)}` : ''}
                    </span>
                  </div>
                  <p className="m-0 whitespace-pre-wrap break-words text-[13.5px] leading-[1.55]">{m.body}</p>
                </li>
              ))}
            </ol>
          </Card>

          <Card title={t('tickets.respond')}>
            <ReplyForm
              id={k.id}
              canned={d.canned}
              statuses={opts(['open', 'waiting_customer', 'waiting_us', 'resolved', 'closed'] as const, 'statuses')}
              labels={{
                reply: t('tickets.replyLabel', { email: k.requester_email }),
                canned: t('tickets.canned'),
                cannedNone: t('tickets.cannedNone'),
                internal: t('tickets.internal'),
                internalHint: t('tickets.internalHint'),
                thenStatus: t('tickets.thenStatus'),
                keepStatus: t('tickets.keepStatus'),
                send: t('tickets.send'),
                note: t('tickets.saveNote'),
                saving: t('common.saving'),
                done: t('common.done'),
                problems,
              }}
            />
          </Card>

          <Card title={t('tickets.timeline')}>
            <ol className="m-0 list-none p-0">
              {d.events.map((e, i) => (
                <li
                  key={i}
                  className="grid gap-[10px] border-b border-line py-[6px] text-[12.5px] last:border-0 [grid-template-columns:150px_minmax(0,1fr)]"
                >
                  <span className="text-mut">{when(e.at)}</span>
                  <span className="min-w-0 break-words">
                    <span className="font-semibold">{t(`tickets.events.${e.kind}`)}</span>
                    {e.actor_email ? <span className="text-mut"> · {e.actor_email}</span> : null}
                    {e.kind === 'updated' ? (
                      <span className="block text-mut">
                        {Object.entries(e.detail)
                          .map(([f, v]) => {
                            const c = v as { from?: unknown; to?: unknown }
                            return `${f.replace(/_id$/, '')}: ${name(c.from)} → ${name(c.to)}`
                          })
                          .join(' · ')}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-[14px]">
          <Card title={t('tickets.requester')}>
            <Row label={t('tickets.name')} value={k.requester_name ?? '—'} />
            <Row label={t('tickets.email')} value={k.requester_email} />
            {k.requester_org ? <Row label={t('tickets.company')} value={k.requester_org} /> : null}
            <Row
              label={t('tickets.org')}
              value={k.org_id ? <ALink href={`/admin/orgs/${k.org_id}`}>{k.org_name ?? k.org_id}</ALink> : '—'}
            />
            {ctx.verified === false && k.org_id ? (
              <Row label="" value={<span className="text-cautiondeep">{t('tickets.unverified')}</span>} />
            ) : null}
            {ctx.role ? <Row label={t('tickets.role')} value={ctx.role} /> : null}
            {ctx.page ? <Row label={t('tickets.page')} value={ctx.page} /> : null}
            {ctx.browser ? <Row label={t('tickets.browser')} value={<span className="text-[12px]">{ctx.browser}</span>} /> : null}
          </Card>

          <Card title={t('tickets.deadlines')}>
            <Row
              label={t('tickets.firstResponse')}
              value={
                k.first_responded_at ? t('tickets.respondedAt', { at: when(k.first_responded_at) }) : when(k.first_response_due)
              }
            />
            <Row
              label={t('tickets.resolveBy')}
              value={k.resolved_at ? t('tickets.resolvedAt', { at: when(k.resolved_at) }) : when(k.resolve_due)}
            />
            {k.legal_due ? <Row label={t('tickets.legalDue')} value={when(k.legal_due)} /> : null}
            <p className="mb-0 mt-[8px] text-[11.5px] text-mut">{t('tickets.slaNote')}</p>
          </Card>

          <Card title={t('tickets.fields')}>
            <FieldsForm
              key={[k.status, k.type, k.queue, k.category, k.impact, k.blocking, k.assignee_id, k.problem_id].join('|')}
              id={k.id}
              fields={[
                { name: 'status', label: t('tickets.col.status'), value: k.status, options: opts(TICKET_STATUSES, 'statuses') },
                { name: 'type', label: t('tickets.type'), value: k.type, options: opts(TICKET_TYPES, 'types') },
                { name: 'queue', label: t('tickets.queue'), value: k.queue, options: opts(TICKET_QUEUES, 'queues') },
                {
                  name: 'category',
                  label: t('tickets.category'),
                  value: k.category,
                  options: opts(TICKET_CATEGORIES, 'categories'),
                },
                { name: 'impact', label: t('tickets.impact'), value: k.impact, options: opts(TICKET_IMPACTS, 'impacts') },
                {
                  name: 'blocking',
                  label: t('tickets.blocking'),
                  value: k.blocking ? 'yes' : 'no',
                  options: [
                    { value: 'no', label: t('tickets.blockingNo') },
                    { value: 'yes', label: t('tickets.blockingYes') },
                  ],
                },
                {
                  name: 'assignee',
                  label: t('tickets.col.assignee'),
                  value: k.assignee_id ?? '',
                  options: [
                    { value: '', label: t('tickets.unassigned') },
                    ...d.admins.map((a) => ({ value: a.id, label: a.email ?? a.id })),
                  ],
                },
                {
                  name: 'problem',
                  label: t('tickets.problemLink'),
                  value: k.problem_id ?? '',
                  options: [
                    { value: '', label: t('tickets.noProblem') },
                    ...(k.problem_id && k.problem_number && !d.problems.some((p) => p.id === k.problem_id)
                      ? [{ value: k.problem_id, label: `#${k.problem_number}` }]
                      : []),
                    ...d.problems.map((p) => ({ value: p.id, label: `#${p.number} ${p.subject}` })),
                  ],
                },
              ]}
              labels={{ save: t('common.save'), saving: t('common.saving'), done: t('common.done'), problems }}
            />
            <p className="mb-0 mt-[8px] text-[11.5px] text-mut">{t('tickets.priorityNote')}</p>
          </Card>

          {k.type === 'service_request' && k.org_id ? (
            <Card title={t('tickets.serviceRequest')}>
              <p className="m-0 text-[12.5px] leading-[1.5] text-mut">{t('tickets.serviceRequestNote')}</p>
              <p className="mb-0 mt-[8px] text-[13px]">
                <ALink href={`/admin/orgs/${k.org_id}`}>{t('tickets.openOrg')} →</ALink>
              </p>
            </Card>
          ) : null}

          {d.rounds.length ? (
            <Card title={t('tickets.rounds')}>
              <div className="flex flex-wrap gap-[6px]">
                {d.rounds.map((r) => (
                  <RoundLink key={r.id} id={k.id} round={r.id} linked={r.linked} label={`${r.kind} ${r.year} · ${r.status}`} />
                ))}
              </div>
            </Card>
          ) : null}

          {d.incidents.length ? (
            <Card title={t('tickets.incidents')}>
              {d.incidents.map((i) => (
                <Row key={i.id} label={`#${i.number}`} value={<ALink href={`/admin/tickets/${i.id}`}>{i.subject}</ALink>} />
              ))}
            </Card>
          ) : null}

          <Card title={t('tickets.history')}>
            {d.history.length ? (
              d.history.map((h) => (
                <Row key={h.id} label={`#${h.number}`} value={<ALink href={`/admin/tickets/${h.id}`}>{h.subject}</ALink>} />
              ))
            ) : (
              <p className="m-0 text-[13px] text-mut">{t('common.none')}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
