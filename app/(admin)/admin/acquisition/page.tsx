import { getTranslations } from 'next-intl/server'
import { DeleteSpend, SpendForm } from '@/components/admin/SpendForms'
import { Card, nok, PageHead, Problem, Table, Td } from '@/components/admin/ui'
import { acquisition, isError, SPEND_CHANNELS, whoami } from '@/lib/admin/api'

/**
 * Cost per customer (0062, D-107): what each channel cost in a month, against the signups
 * and paying customers whose first touch was that channel and who signed up that month.
 * Where no spend is entered the cost is "—", never zero: organic search is not free, its
 * cost is the writing, and only the person who knows it can enter it.
 */
export default async function AdminAcquisition() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const [a, who] = await Promise.all([acquisition(12), whoami()])
  if (isError(a)) return <Problem text={a.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'finance' || who?.role === 'marketing'
  const per = (spend: number | null, n: number) => (spend === null || n === 0 ? '—' : nok(Math.round(spend / n)))
  const month = (iso: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))
  const channels: Record<string, string> = {
    ...Object.fromEntries(SPEND_CHANNELS.map((c) => [c, t(`acquisition.channel.${c}`)])),
    unknown: t('web.channel.unknown'),
  }
  const thisMonth = new Date().toISOString().slice(0, 7)

  // the whole period, per channel
  const totals = [...SPEND_CHANNELS, 'unknown'].map((c) => {
    const rows = a.rows.filter((r) => r.channel === c)
    const spent = rows.some((r) => r.spend !== null) ? rows.reduce((s, r) => s + (r.spend ?? 0), 0) : null
    return { channel: c, spend: spent, signups: rows.reduce((s, r) => s + r.signups, 0), paid: rows.reduce((s, r) => s + r.paid, 0) }
  }).filter((r) => r.spend !== null || r.signups > 0)

  return (
    <>
      <PageHead title={t('acquisition.title')} lead={t('acquisition.lead')} />

      <Card title={t('acquisition.totals')}>
        <Table
          head={[t('acquisition.head.channel'), t('acquisition.head.spend'), t('web.signups'), t('web.paid'), t('acquisition.head.perSignup'), t('acquisition.head.perCustomer')]}
          empty={totals.length ? undefined : t('common.none')}
        >
          {totals.map((r) => (
            <tr key={r.channel}>
              <Td className="font-semibold">{channels[r.channel]}</Td>
              <Td>{r.spend === null ? '—' : nok(r.spend)}</Td>
              <Td>{r.signups}</Td>
              <Td>{r.paid}</Td>
              <Td>{per(r.spend, r.signups)}</Td>
              <Td>{per(r.spend, r.paid)}</Td>
            </tr>
          ))}
        </Table>
        <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('acquisition.note')}</p>
      </Card>

      <Card title={t('acquisition.byMonth')} className="mt-[14px]">
        <Table
          head={[t('acquisition.head.month'), t('acquisition.head.channel'), t('acquisition.head.spend'), t('web.signups'), t('web.paid'), t('acquisition.head.perCustomer')]}
          empty={a.rows.length ? undefined : t('common.none')}
        >
          {a.rows.map((r) => (
            <tr key={r.month + r.channel}>
              <Td>{month(r.month)}</Td>
              <Td className="font-semibold">{channels[r.channel] ?? r.channel}</Td>
              <Td>{r.spend === null ? '—' : nok(r.spend)}</Td>
              <Td>{r.signups}</Td>
              <Td>{r.paid}</Td>
              <Td>{per(r.spend, r.paid)}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="mt-[14px] grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1.2fr)]">
        {canWrite ? (
          <Card title={t('acquisition.add')}>
            <SpendForm
              channels={SPEND_CHANNELS}
              thisMonth={thisMonth}
              labels={{
                month: t('acquisition.form.month'),
                channel: t('acquisition.head.channel'),
                campaign: t('acquisition.form.campaign'),
                amount: t('acquisition.form.amount'),
                note: t('acquisition.form.note'),
                submit: t('acquisition.form.submit'),
                saving: t('common.saving'),
                done: t('acquisition.form.done'),
                channels,
                problems: { invalid: t('acquisition.form.invalid'), not_allowed: t('common.notAllowed'), failed: t('common.failed') },
              }}
            />
          </Card>
        ) : null}
        <Card title={t('acquisition.entries')}>
          <Table
            head={[t('acquisition.head.month'), t('acquisition.head.channel'), t('acquisition.head.spend'), t('acquisition.form.note'), t('acquisition.head.by'), '']}
            empty={a.entries.length ? undefined : t('acquisition.noEntries')}
          >
            {a.entries.map((e) => (
              <tr key={e.id}>
                <Td>{month(e.month)}</Td>
                <Td className="font-semibold">
                  {channels[e.channel] ?? e.channel}
                  {e.campaign ? <span className="block text-[11.5px] font-normal text-mut">{e.campaign}</span> : null}
                </Td>
                <Td>{nok(e.amount_nok)}</Td>
                <Td wrap className="min-w-[140px] text-[12.5px]">
                  {e.note ?? '—'}
                </Td>
                <Td className="text-[12.5px]">{e.entered_by ?? '—'}</Td>
                <Td>
                  {canWrite ? (
                    <DeleteSpend id={e.id} label={t('acquisition.delete')} problems={{ not_found: t('common.failed'), failed: t('common.failed') }} />
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  )
}
