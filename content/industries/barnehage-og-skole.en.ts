import type { IndustryPage } from './types'

/**
 * en.orgpuls.com/barnehage-og-skole beyond its landing page (D-211, D-214): the menu name, whether
 * it is live, the module, and the question page's own words (/barnehage-og-skole/sporsmal,
 * statements from modules/barnehage-og-skole/v1.json, its `translations.en` in all three wordings).
 * The Norwegian file's words, in the English the construction and health pages use.
 */
export const barnehageOgSkoleEn: IndustryPage = {
  slug: 'barnehage-og-skole',
  navLabel: 'Kindergartens and schools',
  launched: true,
  module: { key: 'barnehage-og-skole' },
  moduleName: 'The kindergarten and school module',
  questionPage: {
    crumb: 'The question set',
    metaTitle: 'Work environment survey questions for kindergartens and schools | Orgpuls',
    metaDescription: 'See all 24 statements the kindergarten and school module adds to the work environment survey – 8 factors with a rationale, legal basis and measures.',
    h1: 'The question set for kindergartens and schools',
    lead: 'See all 24 statements the module adds to the main survey – 8 factors with 3 statements each. Every factor has a rationale from research, inspection or the regulations, a legal basis and 3 suggested measures you can measure again in the pulse.',
    scaleNote: 'Each person gets the statements in random order. The wording is fixed, so you can compare the figures from one survey to the next.',
    countTitle: 'Two questions that are only counted',
    countIntro: 'Some questions do not fit in an index, but say a lot about what the deviation system misses. They are only shown as counts for the whole organisation.',
    segmentsTitle: 'Background questions',
    segmentsIntro:
      'Optional, to see the difference between roles and position sizes. The main survey already asks about violence and threats in the last 12 months and about offensive behaviour, so those questions are not repeated here.',
    rulesTitle: 'How the answers are reported',
    rules: [
      { title: 'At least 5 answers by default', text: 'No group or segment is shown until at least 5 have answered. The threshold can be raised to 10. Small teams can lower it to 3; a round keeps the threshold it started with.' },
      { title: 'No working backwards', text: 'If a group could be worked out from the total and the other groups, one more group is held back.' },
      { title: 'The yes/no questions', text: 'BS-T-1 and BS-T-2 are only shown as counts for the whole organisation, never per year group, department or segment.' },
      {
        title: 'Segments',
        text: 'Role and position size are only shown where the threshold is reached. «Management or administration» is merged with the nearest group when it has fewer answers than the threshold.',
        featureFlag: 'module_segments',
      },
      { title: 'The same index', text: 'Every statement is converted to 0–100, and the factor is the average of its three statements.' },
      { title: 'Risk level', text: '65 or more is low risk, 50–64 medium and below 50 high – the same as in the main survey.' },
      // the brief § 5.1: the pilot tests that the three work alike; until then the page claims no more
      { title: 'Wording', text: 'The statements say «the children» in a kindergarten and «the pupils» in a school. The codes and the scoring are the same, and the pilot tests that the three versions work alike.' },
      { title: 'Difficult cases', text: 'The factor is about duties, not about individual cases. Do not write about individual children or pupils in the comment field.' },
      { title: 'The pulse', text: 'When a factor has open measures, the statement that tracks the measure is included in the next pulse.' },
    ],
    coreNote: 'The kindergarten and school module does not repeat these.',
    cta: { title: 'Add the kindergarten and school module to the next survey', text: 'Enter the organisation number. You are up and running in 3 minutes, with no card details.' },
  },
}
