import { getTranslations } from 'next-intl/server'
import { RuleName } from '@/components/admin/GrowthDialogs'
import { StatusChip } from '@/components/admin/growth'
import { PageHead, Problem } from '@/components/admin/ui'
import { growthRules, isError, whoami } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'

const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'

/**
 * Sentral › Growth › Automation rules (design revision 3, `isRules`; 0142, D-183). R1–R12 are registry
 * rows, each bound to what implements it in Orgpuls. The switch shows the rule's state as the database
 * derives it — on only while the function, trigger, scheduled job or lifecycle mail that implements it
 * exists and is enabled — and is read-only: turning it would not turn off what implements the rule.
 * The rule's card (its condition, action, stream and implementation) opens from its name.
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'growthRules')) return <Problem text={t('common.notAllowed')} />
  const res = await growthRules()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const g = (k: string, v?: Record<string, string | number>) => t(`growth.g2.${k}`, v)
  const labels = { close: g('dialog.close') }

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.growthRules.title')} lead={t('growth.view.growthRules.lead')} measure={false} />
      <div className="relative overflow-x-auto rounded-panel border border-line bg-sf">
        <div role="table" aria-label={g('rules.table')} className="min-w-[760px]">
          <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
            <span role="columnheader" className="w-[150px]">{g('rules.head.rule')}</span>
            <span role="columnheader" className="flex-[1.3]">{g('rules.head.trigger')}</span>
            <span role="columnheader" className="flex-1">{g('rules.head.condition')}</span>
            <span role="columnheader" className="flex-[1.3]">{g('rules.head.action')}</span>
            <span role="columnheader" className="w-[130px]">{g('rules.head.stream')}</span>
            <span role="columnheader" className="w-[60px]">
              <span className="sr-only">{g('rules.head.state')}</span>
            </span>
          </div>
          {res.rules.map((r) => {
            const stream = g(`status.stream.${r.stream}`)
            const state = g('rules.state', { live: r.live ? 'yes' : 'no' })
            return (
              <div key={r.key} role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[12px] text-[13px]">
                <span role="cell" className="flex w-[150px] flex-none">
                  <RuleName
                    id={r.key}
                    name={r.name}
                    labels={labels}
                    dialog={{
                      title: g('rules.title', { id: r.key, name: r.name }),
                      sub: g('rules.sub', { trigger: r.trigger }),
                      sections: [
                        { h: g('rules.section.condition'), t: r.condition },
                        { h: g('rules.section.action'), t: r.action },
                        { h: g('rules.section.stream'), t: g('rules.streamNote', { kind: r.stream, stream }) },
                        { h: g('rules.section.impl'), t: g('rules.impl', { kind: r.impl_kind, ref: r.impl_ref ?? '', live: r.live ? 'yes' : 'no' }) },
                      ],
                    }}
                  />
                </span>
                <span role="cell" className="flex-[1.3] text-[11.5px] [font-family:ui-monospace,Menlo,monospace] [overflow-wrap:anywhere]">
                  {r.trigger}
                </span>
                <span role="cell" className="flex-1 text-[12.5px] text-mut">
                  {r.condition}
                </span>
                <span role="cell" className="flex-[1.3] text-[12.5px]">
                  {r.action}
                </span>
                <span role="cell" className="w-[130px]">
                  <StatusChip tone={dotTone('stream', r.stream)}>{stream}</StatusChip>
                </span>
                <span role="cell" className="flex w-[60px] justify-end">
                  {/* the rule's derived state: read-only, as nothing here switches what implements it */}
                  <span
                    role="switch"
                    aria-checked={r.live}
                    aria-readonly="true"
                    aria-label={g('rules.switch', { name: r.name, state })}
                    title={state}
                    className={`relative block h-[22px] w-[38px] flex-none rounded-pill ${r.live ? 'bg-ink' : 'bg-ink/15'}`}
                  >
                    <span className={`absolute top-[2px] block h-[18px] w-[18px] rounded-pill bg-sf ${r.live ? 'left-[18px]' : 'left-[2px]'}`} />
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
