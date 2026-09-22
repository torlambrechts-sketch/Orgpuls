import { Fragment } from 'react'
import { getTranslations } from 'next-intl/server'

/**
 * Roller og tilgang. Bundle lines 2266-2300.
 *
 * **This matrix is a claim about the database, so it is filled from the database's
 * behaviour and not from the design's.** Four cells and one whole row differ from the
 * bundle, every one of them because the schema does something else. Printing the design's
 * version would put a privacy promise on screen that nothing enforces — the worst kind of
 * wrong, because a reader has no way to check it. D-33 lists the differences.
 *
 * What each mark means, exactly:
 *   ✓     the role may read it for the whole undertaking
 *   Eget  only for the department that membership names (`app.memberships.group_id`)
 *   Egne  only their own — an employee's own comment thread, opened with the key they
 *         were given at submit and which nobody else can compute
 *   —     nothing
 *
 * Every ✓ and every "Eget" is still subject to k. A leader of a four-person department
 * gets `insufficient_data` for their own team: leading it is not a reason the four are
 * identifiable to them.
 */

type Cell = 'yes' | 'own_group' | 'own' | 'no'

const COLUMNS = ['ownNumbers', 'wholeHouse', 'comments', 'risk', 'roster', 'settings'] as const

/**
 * Transcribed from what the policies and RPCs do after migration 0022, not from the
 * bundle. `tillitsvalgt` is all "no" because it is not an `app.org_role`: the act names
 * them as the counterpart for the § 9-2 drøfting, and this product grants them no read at
 * all. Recording somebody as tillitsvalgt on the register is a duty, not a login.
 */
const MATRIX: { role: string; cells: Cell[] }[] = [
  { role: 'daglig_leder', cells: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes'] },
  { role: 'avdelingsleder', cells: ['own_group', 'no', 'own_group', 'yes', 'yes', 'no'] },
  { role: 'verneombud', cells: ['yes', 'yes', 'no', 'yes', 'yes', 'no'] },
  { role: 'tillitsvalgt', cells: ['no', 'no', 'no', 'no', 'no', 'no'] },
  { role: 'ansatt', cells: ['no', 'no', 'own', 'no', 'no', 'no'] },
]

/** Bundle 3603: the three fills, and nothing between them. */
const TONE: Record<Cell, { background: string; color: string }> = {
  yes: { background: '#CFE7E4', color: '#20431C' },
  own_group: { background: '#FBEBBE', color: '#5C4600' },
  own: { background: '#FBEBBE', color: '#5C4600' },
  no: { background: 'rgba(25,21,16,.04)', color: '#8A8272' },
}

export async function RollerTab() {
  const t = await getTranslations()

  return (
    <>
      <section className="mt-[20px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
        <h2 className="m-0 font-display text-[21px] font-semibold">{t('oppsett.roller.title')}</h2>
        <p className="mt-[6px] max-w-[680px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('oppsett.roller.lead')}
        </p>

        <div className="mt-[18px] overflow-x-auto">
          <div className="grid min-w-[720px] gap-[4px] text-[11.5px] [grid-template-columns:150px_repeat(6,1fr)]">
            <span />
            {COLUMNS.map((c) => (
              <span key={c} className="text-center leading-[1.25] text-mut">
                {t(`oppsett.roller.col.${c}`)}
              </span>
            ))}
            {MATRIX.map((row) => (
              <Fragment key={row.role}>
                <span className="flex items-center text-[13px] font-semibold">
                  {t(`oppsett.roller.role.${row.role}`)}
                </span>
                {row.cells.map((cell, i) => (
                  <span
                    key={COLUMNS[i]}
                    className="rounded-[7px] py-[12px] text-center font-bold"
                    style={TONE[cell]}
                  >
                    {cell === 'yes'
                      ? '✓'
                      : cell === 'no'
                        ? '—'
                        : t(`oppsett.roller.mark.${cell}`)}
                  </span>
                ))}
              </Fragment>
            ))}
          </div>
        </div>

        <p className="mt-[16px] max-w-[680px] text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('oppsett.roller.matrixNote')}
        </p>
        <p className="mt-[8px] max-w-[680px] text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('oppsett.roller.writeNote')}
        </p>
      </section>

      <div className="mt-[16px] grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {['daglig_leder', 'avdelingsleder', 'verneombud'].map((role) => (
          <div key={role} className="rounded-row border border-line bg-sf px-[20px] py-[18px]">
            <div className="text-[14px] font-bold">{t(`oppsett.roller.role.${role}`)}</div>
            <div className="mt-[5px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
              {t(`oppsett.roller.can.${role}`)}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
