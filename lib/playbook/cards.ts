import { PLAYBOOK_KIND_BG, playbookFor } from '@/lib/playbook/registry'

/**
 * The playbook as a screen sees it: every string resolved, every fill chosen, so the
 * client components that draw the cards (components/playbook/PlaybookCards.tsx) carry no
 * translator and no registry — the same split every other client component here keeps.
 */

/** next-intl's translator, as far as this module needs it. */
export type Translate = (key: string, values?: Record<string, string | number>) => string

export interface PlaybookCard {
  key: string
  kindLabel: string
  kindBg: string
  time: string
  title: string
  how: string
  /** "Følg med på: «…»" — the statement the effect is read on, in the instrument's words */
  watchLine: string
  adopted: boolean
}

export interface PlaybookBlock {
  evidence: string
  cards: PlaybookCard[]
}

/** The block for one factor. `adopted` holds the playbook keys of the organisation's measures. */
export function playbookBlock(t: Translate, factorKey: string, adopted: ReadonlySet<string>): PlaybookBlock {
  return {
    evidence: t(`playbook.${factorKey}.ev`),
    cards: playbookFor(factorKey).map((e) => ({
      key: e.key,
      kindLabel: t(`playbook.kind.${e.kind}`),
      kindBg: PLAYBOOK_KIND_BG[e.kind],
      time: t(`playbook.${factorKey}.m${e.n}.time`),
      title: t(`playbook.${factorKey}.m${e.n}.title`),
      how: t(`playbook.${factorKey}.m${e.n}.how`),
      watchLine: t('playbook.watch', { statement: t(`factor.${factorKey}.s${e.watch}`) }),
      adopted: adopted.has(e.key),
    })),
  }
}

/** The labels the adopt button needs, resolved once per screen. */
export interface AdoptLabels {
  adopt: string
  adopted: string
  problems: Record<string, string>
}

export function adoptLabels(t: Translate): AdoptLabels {
  return {
    adopt: t('playbook.adopt'),
    adopted: t('playbook.adopted'),
    problems: Object.fromEntries(
      ['invalid', 'denied', 'noOrg'].map((k) => [k, t(`tiltak.problem.${k}`)]),
    ),
  }
}
