import { getTranslations } from 'next-intl/server'
import { RedirectAddForm, RedirectDeleteForm } from '@/components/admin/CmsForms'
import type { CmsMessages } from '@/components/admin/CmsEditor'
import { Badge, Card, day, PageHead, Problem, Table, Td, when } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { cmsRedirects } from '@/lib/admin/cms'

/** Old addresses and where they go now (X-094), with how many visitors each still sends on */
export default async function CmsRedirects() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('cms') as CmsMessages
  const r = m.redirects
  const [rows, who] = await Promise.all([cmsRedirects(), whoami()])
  if (isError(rows)) return <Problem text={rows.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  return (
    <>
      <PageHead title={r.title} lead={r.lead} />
      {canWrite ? (
        <Card title={r.add} className="mb-[14px]">
          <RedirectAddForm m={m} />
        </Card>
      ) : null}
      <Card>
        <Table head={[r.from, r.to, r.type, r.hits, r.lastHit, r.created, '']} empty={rows.rows.length ? undefined : r.empty}>
          {rows.rows.map((x) => (
            <tr key={x.from}>
              <Td className="font-mono text-[12.5px]">{x.from}</Td>
              <Td className="font-mono text-[12.5px]">{x.to}</Td>
              <Td>
                <Badge tone={x.permanent ? 'green' : 'yellow'}>{x.permanent ? '301' : '302'}</Badge>
              </Td>
              <Td>{x.hits}</Td>
              <Td className="text-mut">{x.last_hit_at ? when(x.last_hit_at) : '—'}</Td>
              <Td className="text-mut">{day(x.created_at)}</Td>
              <Td>{canWrite ? <RedirectDeleteForm from={x.from} m={m} /> : null}</Td>
            </tr>
          ))}
        </Table>
        <p className="mb-0 mt-[10px] text-[12px] text-mut">{r.note}</p>
      </Card>
    </>
  )
}
