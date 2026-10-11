import type { IndustryPage } from './types'

/**
 * The English /handel (on www.orgpuls.com since D-275) beyond its landing page (D-207, D-214): the menu name, whether it is live,
 * the module, and the question page's own words (/handel/sporsmal, statements from
 * modules/handel/v1.json, its `translations.en`). The Norwegian file's words, in the English the
 * construction and health pages use.
 */
export const handelEn: IndustryPage = {
  slug: 'handel',
  navLabel: 'Retail',
  launched: true,
  card: { newUntil: '2027-01-01' },
  module: { key: 'handel' },
  moduleName: 'The retail module',
  questionPage: {
    crumb: 'The question set',
    metaTitle: 'Work environment survey questions for retail | Orgpuls',
    metaDescription: 'See all 24 statements the retail module adds to the work environment survey – 8 factors, each with a rationale, legal basis and suggested measures.',
    h1: 'The question set for retail',
    lead: 'See all 24 statements the retail module adds to the main survey – 8 factors with 3 statements each. Every factor has a rationale from research and inspection, a legal basis and 3 suggested measures you can measure again in the pulse.',
    scaleNote: 'Each person gets the statements in random order. The wording is fixed, so you can compare the figures from one survey to the next.',
    countTitle: 'Two questions that are only counted',
    countIntro: 'Some questions do not fit in an index, but say a lot about what the deviation system misses and about lone shifts. They are only shown as counts for the whole organisation.',
    segmentsTitle: 'Background questions',
    segmentsIntro: 'Optional, to see the difference between shop and warehouse, and between full-time and part-time. The survey does not ask about age, because many in retail are young and the groups would then be too small.',
    rulesTitle: 'How the answers are reported',
    rules: [
      { title: 'At least 5 answers by default', text: 'No group is shown until at least 5 have answered. The threshold can be raised to 10. Small teams can lower it to 3; a round keeps the threshold it started with.' },
      { title: 'No working backwards', text: 'If a group could be worked out from the total and the other groups, one more group is held back.' },
      {
        title: 'The yes/no questions',
        text: 'HA-T-1 and HA-T-2 are only shown as counts for the whole organisation, never per shop or shift. «I never work alone» is kept out of the share.',
      },
      {
        title: 'Segments',
        text: 'Place of work and position size are only shown where the threshold is reached, and never combined with a group if that gives fewer answers than the threshold.',
        featureFlag: 'module_segments',
      },
      { title: 'The same index', text: 'Every statement is converted to 0–100, and the factor is the average of its three statements.' },
      {
        title: 'Provisional thresholds',
        text: '65 or more is low risk, 50–64 medium and below 50 high – the same as in the main survey, but marked provisional until the module is validated.',
      },
      { title: 'The pulse', text: 'When a factor has open measures, the statement that tracks the measure is included in the next pulse.' },
      {
        title: 'Choose what applies',
        text: 'Alone on shift can be switched off where nobody works alone, and Boundaries with customers where nobody has customer contact. The question about working alone and feeling unsafe is then not asked either.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'The retail module does not repeat these.',
    cta: { title: 'Add the retail module to the next survey', text: 'Enter the organisation number. You are up and running in 3 minutes, with no card details.' },
  },
}
