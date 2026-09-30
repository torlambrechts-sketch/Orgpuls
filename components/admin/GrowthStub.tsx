import { getTranslations } from 'next-intl/server'
import { PhaseEmpty } from '@/components/admin/growth'
import { PageHead, Problem } from '@/components/admin/ui'
import { canSee } from '@/lib/admin/access'
import { whoami } from '@/lib/admin/api'
import { GROWTH_VIEWS, type GrowthViewKey } from '@/lib/admin/growth'

/**
 * A view of design revision 3 before its phase builds it (D-181): the design's page head — its
 * title and sub-line, without the buttons nothing yet backs — and the design's empty treatment,
 * naming the phase that fills it. It shows no figure, no status and no sample row: nothing here
 * could be read as data.
 *
 * The menu offers the page only to a role that may see its section; an address typed by hand is
 * answered the same way.
 */
/** the views whose sub-line the design wraps with text-wrap: pretty; the others wrap plainly */
const PRETTY_LEAD: ReadonlySet<GrowthViewKey> = new Set(['growthBoard'])

export async function GrowthStub({ view }: { view: GrowthViewKey }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const v = GROWTH_VIEWS[view]
  const who = await whoami()
  if (!who?.role || !canSee(who.role, v.section)) return <Problem text={t('common.notAllowed')} />
  return (
    <div className="leading-[1.5]">
      <PageHead title={t(`growth.view.${view}.title`)} lead={t(`growth.view.${view}.lead`)} measure={false} pretty={PRETTY_LEAD.has(view)} />
      <PhaseEmpty title={t('growth.phase', { phase: v.phase })} text={t(`growth.view.${view}.empty`)} />
    </div>
  )
}
