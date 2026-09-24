import { getTranslations } from 'next-intl/server'
import { ImportForm } from '@/components/oppsett/ImportForm'
import { RosterTable } from '@/components/oppsett/RosterTable'
import { DUTY_ROLES } from '@/lib/settings/read'
import type { OppsettView } from '@/components/oppsett/OppsettScreen'

/**
 * Ansatte. Bundle lines 2110-2244.
 *
 * Two cards: where people come from, and the register itself.
 *
 * **The source picker is two choices, not four.** The design offers manual entry, a
 * spreadsheet paste, an HR system and Microsoft Entra. The last two are integrations that
 * do not exist — the Integrasjoner tab says so in the same words — and a radio that
 * selects a source nothing can read from is a radio that does nothing. D-33.
 *
 * **On the register being readable by every member.** `employee_read` admits any member of
 * the organisation, so a verneombud or an avdelingsleder sees every colleague's name and
 * e-mail here. That is a decision taken deliberately (D-30) rather than an oversight, and
 * it is worth being exact about what it costs: knowing who works here has never been what
 * this product protects. What it protects is the join between a person and an answer, and
 * that join does not exist as a column anywhere in the schema.
 */
export async function AnsatteTab({
  view,
  missingGroup,
}: {
  view: OppsettView
  missingGroup: number
}) {
  const t = await getTranslations()

  const registered = view.roster.length
  const short = view.company.employee_count - registered

  return (
    <>
      <section className="mt-[20px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
        <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
          {t('oppsett.ansatte.sourceHead')}
        </div>

        <ImportForm
          canWrite={view.canWrite}
          groups={view.groups}
          labels={{
            sourceManual: t('oppsett.ansatte.sourceManual'),
            sourceManualNote: t('oppsett.ansatte.sourceManualNote'),
            sourceCsv: t('oppsett.ansatte.sourceCsv'),
            sourceCsvNote: t('oppsett.ansatte.sourceCsvNote'),
            pasteHead: t('oppsett.ansatte.pasteHead'),
            pasteLead: t('oppsett.ansatte.pasteLead'),
            pastePlaceholder: t('oppsett.ansatte.pastePlaceholder'),
            colName: t('oppsett.ansatte.colName'),
            colEmail: t('oppsett.ansatte.colEmail'),
            colGroup: t('oppsett.ansatte.colGroup'),
            colLeader: t('oppsett.ansatte.colLeader'),
            colMobile: t('oppsett.ansatte.colMobile'),
            allGood: t('oppsett.ansatte.allGood'),
            reset: t('oppsett.ansatte.reset'),
            addHead: t('oppsett.ansatte.addHead'),
            name: t('oppsett.ansatte.name'),
            namePlaceholder: t('oppsett.ansatte.namePlaceholder'),
            email: t('oppsett.ansatte.email'),
            emailPlaceholder: t('oppsett.ansatte.emailPlaceholder'),
            group: t('oppsett.ansatte.group'),
            noGroup: t('oppsett.ansatte.noGroup'),
            add: t('oppsett.ansatte.add'),
            emailNote: t('oppsett.ansatte.emailNote'),
            phone: t('oppsett.ansatte.phone'),
            phonePlaceholder: t('oppsett.ansatte.phonePlaceholder'),
            problems: Object.fromEntries(
              ['invalid', 'empty', 'too_many', 'denied', 'phone'].map((k) => [
                k,
                t(`oppsett.ansatte.problem.${k}`),
              ]),
            ),
          }}
        />
      </section>

      <section className="mt-[16px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
        <div className="flex flex-wrap items-baseline justify-between gap-[14px]">
          <span className="font-display text-[21px] font-semibold">
            {t('oppsett.ansatte.registerTitle')}
          </span>
          <span className="text-[12.5px] font-bold">
            {t('oppsett.ansatte.registerCount', { count: registered })}
          </span>
        </div>

        <div
          className="mt-[6px] max-w-[680px] text-[12.5px] leading-[1.55] [text-wrap:pretty]"
          style={{ color: short === 0 ? '#2F5D2A' : '#A33A16' }}
        >
          {short === 0
            ? t('oppsett.ansatte.registerMatches')
            : t('oppsett.ansatte.registerShort', {
                registered,
                stated: view.company.employee_count,
              })}
        </div>

        {missingGroup > 0 ? (
          <div className="mt-[5px] text-[12.5px] text-danger">
            {t('oppsett.ansatte.missingGroup', { count: missingGroup })}
          </div>
        ) : null}

        <RosterTable
          roster={view.roster.map((p) => ({
            ...p,
            groupLabel: t('oppsett.ansatte.groupFor', { name: p.name }),
            roleLabel: t('oppsett.ansatte.roleFor', { name: p.name }),
          }))}
          groups={view.groups}
          canWrite={view.canWrite}
          dutyRoles={[...DUTY_ROLES]}
          labels={{
            name: t('oppsett.ansatte.colName'),
            email: t('oppsett.ansatte.colEmail'),
            group: t('oppsett.ansatte.colGroup'),
            role: t('oppsett.ansatte.colRole'),
            status: t('oppsett.ansatte.colStatus'),
            noGroup: t('oppsett.ansatte.noGroup'),
            noEmail: t('oppsett.ansatte.noEmail'),
            employee: t('oppsett.ansatte.dutyNone'),
            active: t('oppsett.ansatte.statusActive'),
            inactive: t('oppsett.ansatte.statusInactive'),
            duty: Object.fromEntries(
              DUTY_ROLES.map((r) => [r, t(`oppsett.ansatte.duty.${r}`)]),
            ),
            denied: t('oppsett.problem.denied'),
          }}
        />

        <p className="mt-[14px] max-w-[680px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
          {t('oppsett.ansatte.dutyNote')}
        </p>
      </section>
    </>
  )
}
