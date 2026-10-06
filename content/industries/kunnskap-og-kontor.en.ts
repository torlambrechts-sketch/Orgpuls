import type { IndustryPage } from './types'

/**
 * en.orgpuls.com/kunnskap-og-kontor beyond its landing page (D-212, D-214): the menu name, whether
 * it is live, the module, and the question page's own words (/kunnskap-og-kontor/sporsmal,
 * statements from modules/kunnskap-og-kontor/v1.json, its `translations.en` for both variants).
 * The Norwegian file's words, in the English the construction and health pages use.
 */
export const kunnskapOgKontorEn: IndustryPage = {
  slug: 'kunnskap-og-kontor',
  navLabel: 'Knowledge and office work',
  launched: true,
  card: { newUntil: '2027-01-01' },
  module: { key: 'kunnskap-og-kontor' },
  moduleName: 'The office module',
  questionPage: {
    crumb: 'The question set',
    metaTitle: 'Work environment survey questions for office work | Orgpuls',
    metaDescription: 'Extended has 15 factors and up to 62 statements, simplified 8 factors with 3 each. Every factor with a rationale, legal basis and suggested measures.',
    h1: 'The question set for knowledge and office work',
    lead: 'Extended has 15 factors and up to 62 statements. Simplified has 8 factors with 3 statements each – all core statements that are also part of extended. Every factor has a rationale from research or the regulations, a legal basis and 3 suggested measures you can measure again in the pulse.',
    scaleNote: 'Each person gets the statements in random order. The wording is fixed, so you can compare the figures from one survey to the next.',
    countTitle: 'Four questions that are only counted',
    countIntro: 'Some questions do not fit in an index, but say a lot about availability and working from home. They are only shown as counts for the whole organisation.',
    segmentsTitle: 'Background questions',
    segmentsIntro: 'Optional, to see the difference between ways of working and how much time goes to client work. Management role and type of position are not used, because they give groups that are too small.',
    rulesTitle: 'How the answers are reported',
    rules: [
      { title: 'At least 5 answers by default', text: 'No group or segment is shown until at least 5 have answered. The threshold can be raised to 10. Small teams can lower it to 3; a round keeps the threshold it started with.' },
      { title: 'No working backwards', text: 'If a group could be worked out from the total and the other groups, one more group is held back.' },
      {
        title: 'The yes/no questions',
        text: 'KK-T-1 to KK-T-4 are only shown as counts for the whole organisation, never per team or segment. «I don\'t work from home regularly» is kept out of the share.',
      },
      { title: 'Simplified and extended', text: 'The core statements are part of both. In extended, the eight simplified factors are calculated too, as a comparable index.' },
      { title: 'The same index', text: 'Every statement is converted to 0–100, and the factor is the average of its statements. A factor is only shown when all its statements have been asked.' },
      { title: 'Provisional thresholds', text: '65 or more is low risk, 50–64 medium and below 50 high – the same as in the main survey, but marked provisional until the module is validated.' },
      { title: 'The pulse', text: 'When a factor has open measures, the statement that tracks the measure is included in the next pulse.' },
    ],
    coreNote: 'The office module does not repeat these.',
    cta: { title: 'Add the office module to the next survey', text: 'Enter the organisation number. You are up and running in 3 minutes, with no card details.' },
  },
}
