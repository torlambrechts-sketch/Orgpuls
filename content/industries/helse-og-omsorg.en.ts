import type { IndustryPage } from './types'

/**
 * en.orgpuls.com/helse-og-omsorg beyond its landing page (D-210): the menu name, whether it is live, the module, and the
 * question page's own words (/helse-og-omsorg/sporsmal, statements from modules/helse-og-omsorg/v1.json, its `translations.en`).
 * The page itself is the landing template and its messages; the words only the older template
 * drew are gone, and `law` stays as the legal review's record (D-213).
 */
export const helseOgOmsorgEn: IndustryPage = {
  slug: 'helse-og-omsorg',
  navLabel: 'Health and care',
  launched: true,
  module: { key: 'helse-og-omsorg' },
  moduleName: 'The health and care module',
  law: {
    title: 'What the law points to in work with people',
    intro:
      'The health and care module documents the survey where care work has requirements of its own. The report shows the legal basis for every factor. The references are to Norwegian law; the English wording is ours, not an official translation.',
    items: [
      {
        ref: 'Working Environment Act § 4-3 (2) b',
        text: 'Psychosocial working environment factors include, among other things, emotional demands and strain in work with people.',
        reviewed: true,
      },
      {
        ref: 'Working Environment Act § 4-3 (6)',
        text: 'Employees shall, as far as possible, be protected against violence, threats and adverse strain resulting from contact with others.',
        reviewed: true,
      },
      {
        // chapter 23A was repealed on 1 January 2026; chapter 3A replaces it (D-131)
        ref: 'The regulations, chapter 3A',
        text: 'Where employees may be exposed to violence or threats, the risk must be assessed, and there must be measures, training and follow-up.',
        reviewed: true,
      },
      {
        ref: 'The regulations, § 1A-2',
        text: 'The factors must be surveyed and risk-assessed individually and together, in cooperation with the employees, and repeated regularly.',
        reviewed: true,
      },
      {
        ref: 'Working Environment Act chapter 10',
        text: 'The work schedule must not cause adverse strain, and the rest-period requirements apply on rotas too.',
        reviewed: true,
      },
      {
        ref: 'Working Environment Act § 14-3',
        text: 'Part-time employees have a preferential right to an extended position before the employer hires new people.',
        reviewed: true,
      },
      {
        ref: 'Equality and Anti-Discrimination Act § 13',
        text: 'The employer shall prevent and seek to hinder sexual harassment, including from service users and relatives.',
        reviewed: true,
      },
    ],
  },
  questionPage: {
    crumb: 'The question set',
    h1: 'The question set for health and care',
    lead: 'See all 24 statements the health and care module adds to the main survey – 8 factors with 3 statements each. Every factor has a rationale from research and inspection, a legal basis and 3 suggested measures you can measure again in the pulse.',
    scaleNote: 'Each person gets the statements in random order. The wording is fixed, so you can compare the figures from one survey to the next.',
    countTitle: 'Two questions that are only counted',
    countIntro: 'Some questions do not fit in an index, but say a lot about what the deviation system misses. They are only shown as counts for the whole organisation.',
    segmentsTitle: 'Background questions',
    segmentsIntro:
      'Optional, to see the difference between day, evening and night, and between full-time and part-time. The main survey already asks about violence and threats in the last 12 months and about offensive behaviour, so those questions are not repeated here.',
    rulesTitle: 'How the answers are reported',
    rules: [
      { title: 'At least 5 answers by default', text: 'No group or segment is shown until at least 5 have answered. The threshold can be raised to 10. Small teams can lower it to 3; a round keeps the threshold it started with.' },
      { title: 'No working backwards', text: 'If a group could be worked out from the total and the other groups, one more group is held back.' },
      { title: 'The yes/no questions', text: 'HO-T-1 and HO-T-2 are only shown as counts for the whole organisation, never per department or segment.' },
      {
        title: 'Segments',
        text: 'Shift pattern and position size are only shown where the threshold is reached, and never combined with a group if that gives fewer answers than the threshold.',
        featureFlag: 'module_segments',
      },
      { title: 'The same index', text: 'Every statement is converted to 0–100, and the factor is the average of its three statements.' },
      { title: 'Risk level', text: '65 or more is low risk, 50–64 medium and below 50 high – the same as in the main survey.' },
      { title: 'The pulse', text: 'When a factor has open measures, the statement that tracks the measure is included in the next pulse.' },
      {
        title: 'Choose what applies',
        text: 'Factors that do not fit can be switched off. Patient handling, for example, makes little sense at a GP surgery.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'The health and care module does not repeat these.',
    cta: { title: 'Add the health and care module to the next survey', text: 'Enter the organisation number. You are up and running in 3 minutes, with no card details.' },
  },
}
