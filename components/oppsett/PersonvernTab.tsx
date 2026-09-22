import { getTranslations } from 'next-intl/server'

/**
 * Personvern. Bundle lines 2303-2322.
 *
 * Eight cards of plain statement about what is processed and why. The design's threshold
 * warning — shown when the threshold is under five — is unreachable here and the card is
 * therefore absent: `app.k_min()` is a function returning 5 and the column refuses
 * anything below it, so there is no state in which the warning could be true. Rendering it
 * would be rendering a warning about a configuration the database will not accept. D-31.
 *
 * The three document buttons are omitted rather than drawn dead. A "Last ned
 * databehandleravtale" that downloads nothing is worse than no button: it is a statement
 * that the agreement exists. D-33.
 */

const CARDS = [
  'basis',
  'stored',
  'special',
  'retention',
  'access',
  'processor',
  'dpia',
  'protocol',
] as const

export async function PersonvernTab({ threshold }: { threshold: number }) {
  const t = await getTranslations()

  return (
    <div className="mt-[20px] grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
      {CARDS.map((k) => (
        <div key={k} className="rounded-note border border-line bg-sf px-[22px] py-[20px]">
          <div className="text-[14.5px] font-bold">{t(`oppsett.personvern.${k}.head`)}</div>
          <div className="mt-[6px] text-[13px] leading-[1.6] text-body [text-wrap:pretty]">
            {k === 'dpia'
              ? t('oppsett.personvern.dpia.body', { threshold })
              : t(`oppsett.personvern.${k}.body`)}
          </div>
        </div>
      ))}
    </div>
  )
}
