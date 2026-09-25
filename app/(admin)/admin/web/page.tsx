import { getTranslations } from 'next-intl/server'
import { Card, PageHead, pct, Problem, Stat, Table, Td } from '@/components/admin/ui'
import { isError, web, WEB_PERIODS } from '@/lib/admin/api'

/**
 * The public site (D-91): traffic, where it came from, the pages visits start on, and the
 * site's funnel down to an organisation created — then, per source, how many of those
 * organisations sent a survey and paid. Counted by the site's own beacon (0050): no cookie,
 * and a visitor hash that changes every day, so visitors are counted per day and summed.
 */
export default async function AdminWeb({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams
  const days = WEB_PERIODS.find((p) => String(p) === d) ?? 30
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const w = await web(days)
  if (isError(w)) return <Problem text={w.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  const max = Math.max(1, ...w.daily.map((x) => x.visitors))
  const f = w.funnel
  const steps = [
    { key: 'sessions', n: f.sessions },
    { key: 'sawOffer', n: f.saw_offer },
    { key: 'clicked', n: f.clicked },
    { key: 'reachedSignup', n: f.reached_signup },
    { key: 'created', n: f.created },
  ] as const

  return (
    <>
      <PageHead title={t('web.title')} lead={t('web.lead')}>
        <nav aria-label={t('web.period')} className="flex gap-[6px]">
          {WEB_PERIODS.map((p) => (
            <a
              key={p}
              href={`/admin/web?d=${p}`}
              aria-current={p === days ? 'page' : undefined}
              className={`rounded-pill border px-[12px] py-[5px] text-[12.5px] font-semibold ${
                p === days ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'
              }`}
            >
              {t('web.days', { count: p })}
            </a>
          ))}
        </nav>
      </PageHead>

      <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <Stat label={t('web.visitors')} value={w.totals.visitors} hint={t('web.visitorsHint')} />
        <Stat label={t('web.sessions')} value={w.totals.sessions} />
        <Stat
          label={t('web.perSession')}
          value={w.totals.sessions ? (w.totals.views / w.totals.sessions).toFixed(1) : '—'}
          hint={t('web.views', { count: w.totals.views })}
        />
        <Stat label={t('web.bounce')} value={pct(w.totals.bounced, w.totals.sessions)} />
        <Stat label={t('web.signups')} value={w.totals.signups} />
      </div>

      <Card title={t('web.daily')} className="mt-[16px]">
        {w.daily.length ? (
          <div className="flex h-[120px] items-end gap-[3px]" role="img" aria-label={t('web.dailyLabel')}>
            {w.daily.map((x) => (
              <span
                key={x.day}
                title={`${x.day}: ${x.visitors} · ${x.sessions} · ${x.views}`}
                className="min-w-[3px] max-w-[28px] flex-1 rounded-t-[3px] bg-ac"
                style={{ height: `${Math.max(3, (100 * x.visitors) / max)}%` }}
              />
            ))}
          </div>
        ) : (
          <p className="m-0 text-[13px] text-mut">{t('common.none')}</p>
        )}
      </Card>

      <Card title={t('web.funnel')} className="mt-[16px]">
        <Table head={[t('web.step'), t('web.count'), t('web.ofSessions')]}>
          {steps.map((s) => (
            <tr key={s.key}>
              <Td className="font-semibold">{t(`web.funnelStep.${s.key}`)}</Td>
              <Td>{s.n}</Td>
              {/* signups are all of the period's, not a subset of counted sessions */}
              <Td>{s.key === 'created' ? '—' : pct(s.n, f.sessions)}</Td>
            </tr>
          ))}
        </Table>
        <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('web.funnelNote')}</p>
      </Card>

      <div className="mt-[16px] grid items-start gap-[14px] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t('web.channels')}>
          <Table
            head={[t('web.channel.title'), t('web.sessions'), t('web.signups'), t('web.activated'), t('web.paid')]}
            empty={w.channels.length ? undefined : t('common.none')}
          >
            {w.channels.map((c) => (
              <tr key={c.channel}>
                <Td className="font-semibold">{t(`web.channel.${c.channel}`)}</Td>
                <Td>{c.sessions}</Td>
                <Td>{c.signups}</Td>
                <Td>{c.activated}</Td>
                <Td>{c.paid}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={t('web.campaigns')}>
          <Table
            head={[t('web.campaign'), t('web.sessions'), t('web.signups'), t('web.paid')]}
            empty={w.campaigns.length ? undefined : t('common.none')}
          >
            {w.campaigns.map((c) => (
              <tr key={c.campaign}>
                <Td className="font-semibold">{c.campaign}</Td>
                <Td>{c.sessions}</Td>
                <Td>{c.signups}</Td>
                <Td>{c.paid}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={t('web.landing')}>
          <Table
            head={[t('web.page'), t('web.sessions'), t('web.bounce'), t('web.signups')]}
            empty={w.landing.length ? undefined : t('common.none')}
          >
            {w.landing.map((l) => (
              <tr key={l.path}>
                <Td>{l.path}</Td>
                <Td>{l.sessions}</Td>
                <Td>{pct(l.bounced, l.sessions)}</Td>
                <Td>{l.signups}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={t('web.pages')}>
          <Table head={[t('web.page'), t('web.viewsCol')]} empty={w.pages.length ? undefined : t('common.none')}>
            {w.pages.map((p) => (
              <tr key={p.path}>
                <Td>{p.path}</Td>
                <Td>{p.views}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      <p className="mb-0 mt-[16px] text-[12px] text-mut">{t('web.privacy')}</p>
    </>
  )
}
