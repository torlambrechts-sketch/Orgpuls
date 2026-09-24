import {
  IntegrasjonerScreen,
  type IntegrasjonerView,
} from '@/components/integrasjoner/IntegrasjonerScreen'
import { getOrganization } from '@/lib/org/read'
import { countWithPhone, getRoster, getSmsSettings } from '@/lib/settings/read'
import { getQueueCounts } from '@/lib/wheel/read'

/**
 * Integrasjoner — the data half. Bundle lines 1143-1284.
 *
 * The numbers are all real: how many of the register carry a mobile number, how many
 * people are in it, and the outbox's own counts — waiting, sent, given up — with the
 * organisation's mail switch deciding how they are described (0032, D-65).
 */
export const dynamic = 'force-dynamic'

export default async function IntegrasjonerPage() {
  const [withPhone, roster, queue, org, sms] = await Promise.all([
    countWithPhone(),
    getRoster(),
    getQueueCounts(),
    getOrganization(),
    getSmsSettings(),
  ])

  const view: IntegrasjonerView = {
    withPhone,
    total: roster.filter((p) => p.active).length,
    queue,
    mailOn: org?.mail_enabled ?? false,
    smsOn: sms?.enabled ?? false,
  }

  return <IntegrasjonerScreen view={view} />
}
