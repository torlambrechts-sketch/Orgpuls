import { getTranslations } from 'next-intl/server'
import { Badge, Card, day, PageHead, Problem, Table, Td } from '@/components/admin/ui'
import { isError, seo, SEO_PERIODS } from '@/lib/admin/api'

/**
 * Search and content (0061, D-106): which pages bring visitors, signups and customers, how
 * that moves against the period before, what Google shows us for once Search Console is
 * connected, which pages are losing traffic, which queries two of our pages compete for, and
 * who arrives from an AI assistant. Every figure is counted; nothing is estimated.
 */
const change = (now: number, before: number) => (before > 0 ? Math.round((100 * (now - before)) / before) : null)

export default async function AdminSeo({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const { d } = await searchParams
  const days = SEO_PERIODS.find((p) => String(p) === d) ?? 28
  const s = await seo(days)
  if (isError(s)) return <Problem text={s.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  const connected = s.status.gsc_last_ok !== null
  const gsc = s.status.gsc
  const idx = s.status.indexnow

  return (
    <>
      <PageHead title={t('seo.title')} lead={t('seo.lead')}>
        <nav aria-label={t('seo.period')} className="flex flex-wrap gap-[6px]">
          {SEO_PERIODS.map((p) => (
            <a
              key={p}
              href={`/admin/seo?d=${p}`}
              aria-current={p === days ? 'page' : undefined}
              className={`inline-flex h-[32px] items-center rounded-pill border px-[13px] text-[12.5px] font-semibold no-underline hover:no-underline ${
                p === days ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'
              }`}
            >
              {t('web.days', { count: p })}
            </a>
          ))}
        </nav>
      </PageHead>

      <div className="grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t('seo.gsc.title')}>
          {connected ? (
            <p className="m-0 text-[13.5px] leading-[1.6]">
              <Badge tone="green">{t('seo.gsc.connected')}</Badge>{' '}
              {t('seo.gsc.synced', { date: day(s.status.gsc_last_ok), rows: s.status.rows, latest: day(s.status.latest_day) })}
              {gsc && !gsc.ok ? <span className="block text-danger">{t('seo.gsc.lastFailed', { code: gsc.error ?? '' })}</span> : null}
            </p>
          ) : (
            <>
              <p className="m-0 text-[13.5px] leading-[1.6]">
                <Badge tone="grey">{t('seo.gsc.notConnected')}</Badge> {t('seo.gsc.why')}
              </p>
              <ol className="mb-0 mt-[10px] flex list-decimal flex-col gap-[4px] pl-[20px] text-[13px] leading-[1.55] text-body">
                {(['s1', 's2', 's3', 's4'] as const).map((k) => (
                  <li key={k}>{t(`seo.gsc.steps.${k}`)}</li>
                ))}
              </ol>
              {gsc && gsc.error && gsc.error !== 'not_configured' ? (
                <p className="mb-0 mt-[8px] text-[12.5px] text-danger">{t('seo.gsc.lastFailed', { code: gsc.error })}</p>
              ) : null}
            </>
          )}
        </Card>
        <Card title={t('seo.indexnow.title')}>
          <p className="m-0 text-[13.5px] leading-[1.6]">
            {idx
              ? idx.ok
                ? t('seo.indexnow.last', { date: day(idx.at), count: idx.count })
                : t('seo.indexnow.failed', { date: day(idx.at), code: idx.error ?? '' })
              : t('seo.indexnow.never')}
          </p>
          <p className="mb-0 mt-[8px] text-[12px] text-mut">{t('seo.indexnow.note')}</p>
        </Card>
      </div>

      <Card title={t('seo.pages.title')} className="mt-[14px]">
        <Table
          head={[
            t('seo.pages.page'),
            t('seo.pages.entries'),
            t('seo.pages.change'),
            t('seo.pages.organic'),
            t('seo.pages.clicks'),
            t('seo.pages.impressions'),
            t('seo.pages.position'),
            t('web.signups'),
            t('web.activated'),
            t('web.paid'),
          ]}
          empty={s.pages.length ? undefined : t('common.none')}
        >
          {s.pages.map((p) => {
            const c = change(p.entries, p.entries_prev)
            return (
              <tr key={p.page}>
                <Td className="font-semibold">{p.page}</Td>
                <Td>{p.entries}</Td>
                <Td className={c === null ? 'text-mut' : c < 0 ? 'text-danger' : 'text-greendeep'}>{c === null ? '—' : `${c > 0 ? '+' : ''}${c} %`}</Td>
                <Td>{p.organic}</Td>
                <Td>{p.clicks ?? '—'}</Td>
                <Td>{p.impressions ?? '—'}</Td>
                <Td>{p.position ?? '—'}</Td>
                <Td>{p.signups}</Td>
                <Td>{p.activated}</Td>
                <Td>{p.paid}</Td>
              </tr>
            )
          })}
        </Table>
        <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('seo.pages.note', { days })}</p>
      </Card>

      <div className="mt-[14px] grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t('seo.decay.title')}>
          <Table head={[t('seo.pages.page'), t('seo.decay.now'), t('seo.decay.before')]} empty={s.decaying.length ? undefined : t('seo.decay.none')}>
            {s.decaying.map((p) => (
              <tr key={p.page}>
                <Td className="font-semibold">{p.page}</Td>
                <Td>{t('seo.decay.pair', { entries: p.entries, clicks: p.clicks ?? '—' })}</Td>
                <Td>{t('seo.decay.pair', { entries: p.entries_prev, clicks: p.clicks_prev ?? '—' })}</Td>
              </tr>
            ))}
          </Table>
          <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('seo.decay.note')}</p>
        </Card>
        <Card title={t('seo.ai.title')}>
          <Table head={[t('seo.ai.source'), t('web.sessions')]} empty={s.ai.length ? undefined : t('seo.ai.none')}>
            {s.ai.map((a) => (
              <tr key={a.source}>
                <Td className="font-semibold">{a.source}</Td>
                <Td>{a.sessions}</Td>
              </tr>
            ))}
          </Table>
          <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('seo.ai.note', { count: s.ai_signups })}</p>
        </Card>
      </div>

      <div className="mt-[14px] grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title={t('seo.queries.title')}>
          <Table
            head={[t('seo.queries.query'), t('seo.pages.clicks'), t('seo.pages.impressions'), t('seo.queries.ctr'), t('seo.pages.position'), t('seo.queries.page')]}
            empty={s.queries.length ? undefined : connected ? t('common.none') : t('seo.queries.empty')}
          >
            {s.queries.map((q) => (
              <tr key={q.query}>
                <Td wrap className="min-w-[180px] font-semibold">
                  {q.query}
                </Td>
                <Td>{q.clicks}</Td>
                <Td>{q.impressions}</Td>
                <Td>{q.impressions ? `${((100 * q.clicks) / q.impressions).toFixed(1)} %` : '—'}</Td>
                <Td>{q.position ?? '—'}</Td>
                <Td>
                  {q.top_page}
                  {q.pages > 1 ? <span className="block text-[11.5px] text-mut">{t('seo.queries.more', { count: q.pages - 1 })}</span> : null}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={t('seo.cannibal.title')}>
          {s.cannibal.length ? (
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
              {s.cannibal.map((c) => (
                <li key={c.query} className="text-[13px] leading-[1.55]">
                  <span className="block font-semibold">{c.query}</span>
                  {c.pages.map((p) => (
                    <span key={p.page} className="block text-body">
                      {t('seo.cannibal.page', { page: p.page, impressions: p.impressions, position: p.position ?? '—' })}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-mut">{connected ? t('seo.cannibal.none') : t('seo.queries.empty')}</p>
          )}
          <p className="mb-0 mt-[10px] text-[12px] text-mut">{t('seo.cannibal.note')}</p>
        </Card>
      </div>
    </>
  )
}
