import type { IndustryPage } from './types'

/**
 * The English /bygg-og-anlegg (on www.orgpuls.com since D-275) beyond its landing page (D-208): the menu name, whether it is live, the module, and the
 * question page's own words (/bygg-og-anlegg/sporsmal, statements from modules/bygg-og-anlegg/v1.json, its `translations.en`).
 * The page itself is the landing template and its messages; the words only the older template
 * drew are gone, and `law` stays as the legal review's record (D-213).
 */
export const byggOgAnleggEn: IndustryPage = {
  slug: 'bygg-og-anlegg',
  navLabel: 'Construction',
  launched: true,
  module: { key: 'bygg-og-anlegg' },
  moduleName: 'The construction module',
  law: {
    title: 'What the law points to',
    intro:
      'The construction module documents the survey where the building site has requirements of its own. The report shows the legal basis for every factor. The references are to Norwegian law; the English wording is ours, not an official translation.',
    items: [
      {
        ref: 'Working Environment Act § 4-3 and the regulation, chapter 1A',
        text: 'From 1 January 2026 the law sets clearer requirements for the psychosocial work environment. The factors must be surveyed and risk-assessed systematically, together with the employees.',
        reviewed: true,
      },
      {
        ref: 'Working Environment Act § 2-2',
        text: 'When several employers share a workplace, the principal enterprise must coordinate the health, safety and environment work.',
        reviewed: true,
      },
      {
        ref: 'Working Environment Act § 2-3',
        text: 'An employee must stop work where there is danger to life or health, and report faults and deficiencies.',
        reviewed: true,
      },
      { ref: 'Working Environment Act § 3-2', text: 'The employer must provide the necessary training, practice and instruction.', reviewed: true },
      {
        ref: 'The language requirement',
        text: 'At least one person in every work team on a building or construction site must be able to communicate with the others and in Norwegian or English, where safety requires it.',
        reviewed: true,
      },
      {
        ref: 'Working Environment Act chapter 10',
        text: 'Working hours arrangements must not cause adverse strain, and the rest-period requirements apply on projects too.',
        reviewed: true,
      },
    ],
  },
  questionPage: {
    crumb: 'The question set',
    metaTitle: 'Work environment survey questions for construction | Orgpuls',
    metaDescription: 'See all 24 statements the construction module adds to the work environment survey – 8 factors, each with a rationale, legal basis and suggested measures.',
    h1: 'The question set for construction',
    lead: 'See all 24 statements the construction module adds to the main survey – 8 factors with 3 statements each. Every factor has a rationale from research and inspection, a legal basis and 3 suggested measures you can measure again in the pulse.',
    scaleNote: 'Each person gets the statements in random order. The wording is fixed, so you can compare the figures from one survey to the next.',
    countTitle: 'Two questions that are only counted',
    countIntro: 'Some questions do not fit in an index, but say a lot about what the deviation system misses. They are only shown as counts for the whole organisation.',
    segmentsTitle: 'Background questions',
    segmentsIntro: 'Optional, to see the difference between site and workshop, and between new and experienced. The main survey already asks about offensive behaviour, so that question is not repeated here.',
    rulesTitle: 'How the answers are reported',
    rules: [
      { title: 'At least 5 answers by default', text: 'No group is shown until at least 5 have answered. The threshold can be raised to 10. Small teams can lower it to 3; a round keeps the threshold it started with.' },
      { title: 'No working backwards', text: 'If a group could be worked out from the total and the other groups, one more group is held back.' },
      { title: 'The yes/no questions', text: 'BA-T-1 and BA-T-2 are only shown as counts for the whole organisation, never per project.' },
      {
        title: 'Segments',
        text: 'Place of work and length of service are only shown where the threshold is reached, and never combined with a group if that gives fewer answers than the threshold.',
        featureFlag: 'module_segments',
      },
      { title: 'The same index', text: 'Every statement is converted to 0–100, and the factor is the average of its three statements.' },
      { title: 'Risk level', text: '65 or more is low risk, 50–64 medium and below 50 high – the same as in the main survey.' },
      { title: 'The pulse', text: 'When a factor has open measures, the statement that tracks the measure is included in the next pulse.' },
      {
        title: 'Choose what applies',
        text: 'Factors that do not fit can be switched off. Coordination on site, for example, makes little sense in a workshop without subcontractors.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'The construction module does not repeat these.',
    cta: { title: 'Add the construction module to the next survey', text: 'Enter the organisation number. You are up and running in 3 minutes, with no card details.' },
  },
}
