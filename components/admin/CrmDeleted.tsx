import type { CrmMessages } from '@/components/admin/CrmForms'
import { RestoreActions } from '@/components/admin/CrmTrash'
import { ALink, Card, PageHead } from '@/components/admin/ui'

type Common = { reason: string; reasonHint: string; saving: string; done: string }

/**
 * A company's or a contact's page while it is in the restore list (0195, D-210): what that means, the
 * restore, and the way to the list. Restored, the page shows the record again.
 */
export function CrmDeleted({
  entity,
  id,
  back,
  backText,
  canWrite,
  reasonRequired,
  m,
  common,
}: {
  entity: 'company' | 'contact'
  id: string
  back: string
  backText: string
  canWrite: boolean
  reasonRequired: boolean
  m: CrmMessages
  common: Common
}) {
  const x = m.trash.notice
  return (
    <>
      <PageHead title={x.title}>
        <ALink href={back}>{backText}</ALink>
      </PageHead>
      <Card>
        <p className="mb-[12px] mt-0 text-[13.5px] leading-[1.5]">{x[entity]}</p>
        <RestoreActions entity={entity} id={id} restorable mayWrite={canWrite} mayPurge={false} m={m} common={common} reasonRequired={reasonRequired} />
        <p className="mb-0 mt-[12px]">
          <ALink href="/admin/crm/restore">{x.open}</ALink>
        </p>
      </Card>
    </>
  )
}
