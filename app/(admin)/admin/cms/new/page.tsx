import { getTranslations } from 'next-intl/server'
import { CmsCreateForm } from '@/components/admin/CmsForms'
import type { CmsMessages } from '@/components/admin/CmsEditor'
import { ALink, Card, PageHead, Problem } from '@/components/admin/ui'
import { isError } from '@/lib/admin/api'
import { cmsTemplates } from '@/lib/admin/cms'

/** A new page from a template (X-094): the gallery, the address, the search it should answer */
export default async function CmsNew({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('cms') as CmsMessages
  const templates = await cmsTemplates()
  if (isError(templates)) return <Problem text={templates.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const { template } = await searchParams
  return (
    <>
      <p className="m-0 mb-[8px] text-[12.5px]">
        <ALink href="/admin/cms">← {m.editor.back}</ALink>
      </p>
      <PageHead title={m.create.title} lead={m.create.lead} />
      <Card>
        <CmsCreateForm
          templates={templates.rows.map((x) => ({ key: x.key, name: x.name, description: x.description, kind: x.kind, layout: x.layout }))}
          chosen={template ?? null}
          m={m}
        />
      </Card>
    </>
  )
}
