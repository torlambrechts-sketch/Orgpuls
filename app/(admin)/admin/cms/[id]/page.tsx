import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CmsEditor, type CmsMessages } from '@/components/admin/CmsEditor'
import { Problem, when } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { cmsPage, cmsTemplates, cmsTraffic } from '@/lib/admin/cms'
import { pathOf } from '@/lib/cms/content'
import { ADMIN_HOST, EN_HOST, EN_URL, hostOf, MAIN_HOST, MAIN_URL } from '@/lib/hosts'

/**
 * A page in the editor (X-094). On the admin's own host the preview frames the public site, the
 * Norwegian draft on www and the English one on en.orgpuls.com, as readers will get them; locally
 * and on a preview deployment the admin and the site share a host.
 */
const DAYS = 30

export default async function CmsEdit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('cms') as CmsMessages
  const [data, traffic, templates, who] = await Promise.all([cmsPage(id), cmsTraffic(DAYS), cmsTemplates(), whoami()])
  if (isError(data)) {
    if (data.error === 'not_found') notFound()
    return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const { page, revisions } = data
  const path = pathOf(page.kind, page.slug)
  const row = isError(traffic) ? null : (traffic.rows.find((r) => r.path === path) ?? null)
  const templateName = isError(templates) ? page.template : (templates.rows.find((x) => x.key === page.template)?.name ?? page.template)

  const host = (await headers()).get('host') ?? ''
  const onAdmin = hostOf(host) === ADMIN_HOST
  const origins = onAdmin ? { no: MAIN_URL, en: EN_URL } : { no: '', en: '' }
  const hosts = onAdmin ? { no: MAIN_HOST, en: EN_HOST } : { no: host, en: host }

  // dates drawn on the server, in Oslo time, so the browser shows what the server does
  const stamps: Record<string, string> = {}
  for (const l of page.locales) {
    if (l.live_at) stamps[`${l.locale}:live`] = when(l.live_at)
    if (l.pending_at) stamps[`${l.locale}:pending`] = when(l.pending_at)
  }
  for (const r of revisions) stamps[`rev:${r.id}`] = when(r.at)

  return (
    <CmsEditor
      page={page}
      revisions={revisions}
      traffic={row}
      days={DAYS}
      templateName={templateName}
      origins={origins}
      hosts={hosts}
      canWrite={who?.role === 'super_admin' || who?.role === 'marketing'}
      m={m}
      when={stamps}
    />
  )
}
