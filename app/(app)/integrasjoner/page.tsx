import {
  IntegrasjonerScreen,
  type IntegrasjonerView,
} from '@/components/integrasjoner/IntegrasjonerScreen'
import { countWithPhone, getRoster } from '@/lib/settings/read'
import { getQueueCounts } from '@/lib/wheel/read'

/**
 * Integrasjoner — the data half. Bundle lines 1143-1284.
 *
 * Three numbers, all of them real: how many of the register carry a mobile number, how
 * many people are in it, and how many notices the årshjul has queued that nothing has
 * sent. The last one is the whole point of the screen.
 */
export const dynamic = 'force-dynamic'

export default async function IntegrasjonerPage() {
  const [withPhone, roster, queue] = await Promise.all([
    countWithPhone(),
    getRoster(),
    getQueueCounts(),
  ])

  const view: IntegrasjonerView = {
    withPhone,
    total: roster.filter((p) => p.active).length,
    queued: queue.pending,
  }

  return <IntegrasjonerScreen view={view} />
}
