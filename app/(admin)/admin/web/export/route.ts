import { NextResponse, type NextRequest } from 'next/server'
import { bars, periodOf } from '@/lib/admin/analytics'
import { isError, web, webReport } from '@/lib/admin/api'
import { pageNames } from '@/lib/admin/pageNames'

/**
 * Analytics › Export report (X-095): the figures the three Analytics pages show, for the same
 * period, as one CSV a spreadsheet opens — the four figures, the visitors per day, sources, devices,
 * pages, the funnel and the goals, one block after another. Admins only: the readers answer no one
 * else. Nothing in it is typed by a visitor; paths are the beacon's cleaned ones.
 *
 *   /admin/web/export?d=14
 */
export const dynamic = 'force-dynamic'

const cell = (v: string | number | null) => {
  const s = v === null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const line = (...v: (string | number | null)[]) => v.map(cell).join(',')

export async function GET(req: NextRequest) {
  const days = periodOf(req.nextUrl.searchParams.get('d') ?? undefined)
  const [r, w, names] = await Promise.all([webReport(days), web(days), pageNames()])
  if (isError(r) || isError(w)) {
    const e = [r, w].find(isError)
    return new NextResponse(e?.error === 'not_allowed' ? 'Not allowed' : 'Failed', { status: e?.error === 'not_allowed' ? 403 : 500 })
  }
  const out: string[] = []
  out.push(line('Orgpuls web analytics', `${r.from} to ${r.to}`, `${r.days} days`), '')
  out.push(line('Figure', 'Value', 'Previous period'))
  out.push(line('Visitors (per day)', w.totals.visitors, r.previous?.visitors ?? null))
  out.push(line('Sessions', w.totals.sessions, null))
  out.push(line('Pageviews', w.totals.views, null))
  out.push(line('Bounced sessions', w.totals.bounced, null))
  out.push(line('Average seconds on site', r.avg_seconds, null), '')

  const chart = bars(r.from, r.to, w.daily)
  out.push(line(chart.per === 'day' ? 'Day' : 'Week from', 'Visitors'))
  for (const b of chart.bars) out.push(line(b.key, b.n))
  out.push('')

  out.push(line('Source', 'Sessions', 'Sign-ups', 'Activated', 'Paid'))
  for (const c of w.channels) out.push(line(c.channel, c.sessions, c.signups, c.activated, c.paid))
  out.push('')

  out.push(line('Device', 'Visitors'))
  for (const d of r.devices) out.push(line(d.device, d.visitors))
  out.push('')

  out.push(line('Path', 'Title', 'Views', 'Unique', 'Seconds on page', 'Exits', 'Entries', 'Sign-ups'))
  for (const p of r.pages) out.push(line(p.path, names.get(p.path)?.title ?? null, p.views, p.uniq, p.seconds, p.exits, p.entries, p.signups))
  out.push('')

  out.push(line('Funnel step', 'Count'))
  for (const [k, v] of Object.entries(r.funnel)) out.push(line(k, v))
  out.push('')

  out.push(line('Goal', 'Count', 'Previous period'))
  for (const [k, v] of Object.entries(r.goals)) out.push(line(k, v.n, v.prev))

  return new NextResponse(`﻿${out.join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="orgpuls-analytics-${r.from}-${r.to}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
