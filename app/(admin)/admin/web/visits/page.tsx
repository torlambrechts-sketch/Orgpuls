import { getTranslations } from 'next-intl/server'
import { AnalyticsHead } from '@/components/admin/Analytics'
import { Card, pct, Problem, Table, Td } from '@/components/admin/ui'
import { periodOf } from '@/lib/admin/analytics'
import { isError, web } from '@/lib/admin/api'

/**
 * Analytics › Sources & visits (X-095, behind «More»; the Web page of D-91 before it): what the
 * design's three pages do not draw. The site's funnel by visit down to an organisation created;
 * then, per source, how many of those organisations sent a survey and paid; what they said when
 * asked how they heard of Orgpuls; the campaigns and the pages visits start on.
 *
 * Since 0054 (D-100): countries, cities and the latest visits one by one, with time, source,
 * landing page, location and network. The network is the address cut to /24 or /48.
 */
export default async function AnalyticsVisits({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams
  const days = periodOf(d)
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const w = await web(days)
  if (isError(w)) return <Problem text={w.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  const regions = new Intl.DisplayNames(['en'], { type: 'region' })
  const countryName = (c: string | null) => {
    if (!c || c === '??') return t('web.unknownPlace')
    try {
      return regions.of(c) ?? c
    } catch {
      return c
    }
  }
  const place = (v: { city: string | null; region: string | null; country: string | null }) =>
    v.country ? [v.city, v.region, countryName(v.country)].filter(Boolean).join(', ') : t('web.unknownPlace')
  const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' })

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
      <AnalyticsHead
        title={t('analytics.visits.title')}
        lead={t('analytics.visits.lead')}
        path="/admin/web/visits"
        days={days}
        labels={{ period: t('analytics.period'), days: (n) => t('analytics.days', { count: n }), export: t('analytics.export') }}
      />

      <Card title={t('web.funnel')}>
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

      <div className="mt-[16px] grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
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

        <Card title={t('web.heardTitle')}>
          <Table
            head={[t('web.heardAnswer'), t('web.signups'), t('web.activated'), t('web.paid')]}
            empty={w.heard.length ? undefined : t('common.none')}
          >
            {w.heard.map((h) => (
              <tr key={h.heard}>
                <Td className="font-semibold">{t(`web.heard.${h.heard}`)}</Td>
                <Td>{h.signups}</Td>
                <Td>{h.activated}</Td>
                <Td>{h.paid}</Td>
              </tr>
            ))}
          </Table>
          <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('web.heardNote')}</p>
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

        <Card title={t('web.countries')}>
          <Table head={[t('web.country'), t('web.sessions'), t('web.visitors')]} empty={w.countries.length ? undefined : t('common.none')}>
            {w.countries.map((c) => (
              <tr key={c.country}>
                <Td className="font-semibold">{countryName(c.country)}</Td>
                <Td>{c.sessions}</Td>
                <Td>{c.visitors}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={t('web.cities')}>
          <Table head={[t('web.city'), t('web.sessions')]} empty={w.cities.length ? undefined : t('common.none')}>
            {w.cities.map((c) => (
              <tr key={`${c.country}-${c.region}-${c.city}`}>
                <Td>{place(c)}</Td>
                <Td>{c.sessions}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card title={t('web.recent')} className="mt-[16px]">
        <p className="mb-[10px] mt-0 text-[12.5px] text-mut">{t('web.recentLead')}</p>
        <Table
          head={[t('web.time'), t('web.source'), t('web.page'), t('web.viewsCol'), t('web.location'), t('web.network'), t('web.outcome')]}
          empty={w.recent.length ? undefined : t('common.none')}
        >
          {w.recent.map((r) => (
            <tr key={`${r.started_at}-${r.network}-${r.landing}`}>
              <Td>{when.format(new Date(r.started_at))}</Td>
              <Td>
                <span className="font-semibold">{t(`web.channel.${r.channel}`)}</span>
                {r.utm_source || r.referrer_host ? (
                  <span className="block text-[12px] text-mut">
                    {[r.utm_source ?? r.referrer_host, r.utm_medium, r.utm_campaign].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </Td>
              <Td>{r.landing ?? '—'}</Td>
              <Td>{r.views}</Td>
              <Td>{place(r)}</Td>
              <Td className="font-mono text-[12px]">{r.network ?? '—'}</Td>
              <Td>{r.reached_signup ? t('web.outcomeSignup') : r.clicked ? t('web.outcomeClicked') : t('web.outcomeNone')}</Td>
            </tr>
          ))}
        </Table>
        <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('web.networkHint')}</p>
      </Card>
      <p className="mb-0 mt-[16px] text-[12px] text-mut">{t('web.privacy')}</p>
    </>
  )
}
