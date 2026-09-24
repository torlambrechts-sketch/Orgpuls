import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import type { CompanyRow, GroupStat, Location, RosterPerson } from '@/lib/settings/read'
import type { Group } from '@/lib/org/read'
import { SelskapTab } from '@/components/oppsett/SelskapTab'
import { AnsatteTab } from '@/components/oppsett/AnsatteTab'
import { GrupperTab } from '@/components/oppsett/GrupperTab'
import { RollerTab } from '@/components/oppsett/RollerTab'
import { IntegrasjonerTab } from '@/components/oppsett/IntegrasjonerTab'
import { PersonvernTab } from '@/components/oppsett/PersonvernTab'
import { RegelverkTab } from '@/components/oppsett/RegelverkTab'
import { WizardButton } from '@/components/veiviser/WizardProvider'

/**
 * Oppsett. Bundle lines 1958-2472.
 *
 * Seven tabs where the design has eight. "Assistenten" configures an assistant this build
 * does not have anywhere — not on Innsikt, not on the report, not in the årshjul — and a
 * tab whose every control is dead is not a tab. The list is data, so dropping one entry is
 * a row rather than a component change. D-32.
 *
 * The tab lives in the URL rather than in state. Each tab is then an ordinary server
 * render of the rows it needs, the browser's back button works, and a leader can send a
 * colleague a link to the register rather than to "Oppsett, then the second chip".
 */

export const TABS = [
  'selskap',
  'ansatte',
  'grupper',
  'roller',
  'integrasjoner',
  'personvern',
  'regelverk',
] as const

export type Tab = (typeof TABS)[number]

export interface OppsettView {
  tab: Tab
  company: CompanyRow
  locations: Location[]
  groups: Group[]
  groupStats: GroupStat[]
  roster: RosterPerson[]
  /** how many of the register carry a mobile number — the only thing SMS turns on */
  withPhone: number
  /** whether the dispatcher sends this organisation's notices (0032) */
  mailOn: boolean
  /** whether this organisation has SMS on (0033) */
  smsOn: boolean
  baselineMonth: number | null
  /** the names the register records as verneombud — a duty, never a grant (0021) */
  verneombud: string[]
  /** the instrument's factor keys, so the coverage list checks itself against the seed */
  factorKeys: string[]
  /** the round the group counts are "svar sist" from — null before anything has closed */
  lastClosedRound: { kind: string; year: number } | null
  canWrite: boolean
  /** the Roller tab's member panel, built by the page only when that tab is open (D-51) */
  members?: ReactNode
}

export async function OppsettScreen({ view }: { view: OppsettView }) {
  const t = await getTranslations()

  const registered = view.roster.length
  const missingGroup = view.roster.filter((p) => p.groupId === null).length
  const short = Math.max(0, view.company.employee_count - registered)

  return (
    <main className="animate-entry mx-auto max-w-page px-[16px] md:px-[28px] pb-[60px] pt-[30px]">
      <div className="grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[14px]">
            <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">{t('oppsett.title')}</h1>
            <WizardButton className="h-[34px] cursor-pointer rounded-ctl border border-ink bg-sbg px-[14px] text-[12.5px] font-bold leading-[normal] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              {t('veiviser.run')}
            </WizardButton>
          </div>
          <p className="mt-[9px] max-w-[620px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('oppsett.lead')}
          </p>
        </div>

        {/*
          The badge is a reconciliation, not a decoration: it compares the register against
          the headcount every response rate divides by. A register short of the stated
          headcount means people will not be asked, and that is worth a red chip.
        */}
        <div className="min-w-0 rounded-panel border border-line bg-sf px-[20px] py-[18px]">
          <div className="flex items-baseline justify-between gap-[12px]">
            <span className="text-[11px] uppercase tracking-[0.11em] text-mut">
              {t('oppsett.orgHead')}
            </span>
            <span
              className="rounded-pill px-[10px] py-[4px] text-[11px] font-bold"
              style={
                short > 0
                  ? { background: '#FBD5C4', color: '#6B240C' }
                  : { background: '#CFE7E4', color: '#20431C' }
              }
            >
              {short > 0 ? t('oppsett.rosterShort', { count: short }) : t('oppsett.rosterComplete')}
            </span>
          </div>
          <div className="mt-[13px] grid grid-cols-3 gap-[10px]">
            {[
              { value: registered, label: t('oppsett.statRegistered') },
              { value: view.groups.length, label: t('oppsett.statGroups') },
              { value: view.company.threshold, label: t('oppsett.statThreshold') },
            ].map((s) => (
              <span key={s.label} className="block">
                <span className="block text-[19px] font-bold leading-[1.1]">{s.value}</span>
                <span className="mt-[3px] block text-[11.5px] text-mut">{s.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-[20px] flex flex-wrap gap-[8px]">
        {TABS.map((tab) => {
          const on = tab === view.tab
          return (
            <Link
              key={tab}
              href={{ pathname: '/oppsett', query: { fane: tab } }}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex h-[38px] flex-none items-center rounded-pill border px-[16px] text-[13px] font-semibold no-underline hover:no-underline ${
                on
                  ? 'border-ink bg-ink text-bg hover:text-bg'
                  : 'border-line bg-transparent text-ink hover:text-ink'
              }`}
            >
              {t(`oppsett.tab.${tab}`)}
            </Link>
          )
        })}
      </div>

      {view.tab === 'selskap' ? (
        <SelskapTab view={view} />
      ) : view.tab === 'ansatte' ? (
        <AnsatteTab view={view} missingGroup={missingGroup} />
      ) : view.tab === 'grupper' ? (
        <GrupperTab view={view} />
      ) : view.tab === 'roller' ? (
        <RollerTab members={view.members} />
      ) : view.tab === 'integrasjoner' ? (
        <IntegrasjonerTab roster={view.roster} withPhone={view.withPhone} mailOn={view.mailOn} smsOn={view.smsOn} />
      ) : view.tab === 'personvern' ? (
        <PersonvernTab threshold={view.company.threshold} />
      ) : (
        <RegelverkTab factorKeys={view.factorKeys} />
      )}
    </main>
  )
}
