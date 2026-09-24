import { getTranslations } from 'next-intl/server'
import { ThresholdPicker } from '@/components/oppsett/ThresholdPicker'
import type { OppsettView } from '@/components/oppsett/OppsettScreen'

/**
 * Grupper. Bundle lines 2246-2264.
 *
 * Each row's second number is how many of that group answered the last round that closed:
 * a count per group from `participation`, never per person and never from an answer.
 *
 * The badge is what that round released for the group, read from `results_by_group` rather
 * than worked out here from the count. A group is never merged into another (the design's
 * "Slås sammen" and «Øvrige» described something the product does not do): under the
 * threshold it has no figures of its own and counts only in the whole, and a group over it
 * can be held back too, when the small ones would otherwise be the whole minus the rest
 * (0034). With no closed round there is nothing to say, and no badge is drawn.
 *
 * A group with nobody in it still prints. The design shows only populated groups because
 * its fixture has no empty ones; hiding an empty group would hide the reason a department's
 * results never appear.
 */
export async function GrupperTab({ view }: { view: OppsettView }) {
  const t = await getTranslations()

  return (
    <>
      <section className="mt-[20px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
        <h2 className="m-0 font-display text-[21px] font-semibold">{t('oppsett.grupper.title')}</h2>
        <p className="mt-[6px] max-w-[680px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('oppsett.grupper.lead')}
        </p>

        <div className="mt-[16px] flex flex-col gap-[9px]">
          {view.groupStats.map((g) => {
            const status =
              view.lastClosedRound === null ? null : (view.groupRelease[g.name] ?? 'insufficient_data')
            return (
              <div
                key={g.id}
                className="grid items-center gap-[14px] rounded-tile border border-line bg-bg px-[16px] py-[14px] grid-cols-2 md:[grid-template-columns:minmax(0,1fr)_130px_130px_140px]"
              >
                <span className="text-[14.5px] font-semibold">{g.name}</span>
                <span className="text-[12.5px] text-mut">
                  {t('oppsett.grupper.headcount', { count: g.headcount })}
                </span>
                <span className="text-[12.5px] text-mut">
                  {view.lastClosedRound === null
                    ? t('oppsett.grupper.noRound')
                    : t('oppsett.grupper.answered', { count: g.answered })}
                </span>
                <span className="text-right">
                  {status ? (
                    <span
                      className="inline-block rounded-pill px-[12px] py-[5px] text-[11.5px] font-bold"
                      style={
                        status === 'ok'
                          ? { background: '#CFE7E4', color: '#20431C' }
                          : { background: '#FBEBBE', color: '#5C4600' }
                      }
                    >
                      {t(`oppsett.grupper.release.${status}`)}
                    </span>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>

        <p className="mt-[14px] max-w-[680px] text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('oppsett.grupper.rule', { threshold: view.company.threshold })}
        </p>
      </section>

      <section className="mt-[16px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
        <div className="text-[16px] font-semibold">{t('oppsett.terskel.title')}</div>
        <p className="mt-[6px] max-w-[620px] text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('oppsett.terskel.lead')}
        </p>
        <ThresholdPicker
          value={view.company.threshold}
          canWrite={view.canWrite}
          labels={{
            floorNote: t('oppsett.terskel.floorNote'),
            denied: t('oppsett.problem.denied'),
            saved: t('oppsett.saved'),
          }}
        />
      </section>
    </>
  )
}
