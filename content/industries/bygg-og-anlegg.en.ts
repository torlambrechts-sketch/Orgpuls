import type { IndustryPage } from './types'

/**
 * en.orgpuls.com/bygg-og-anlegg — the English twin of bygg-og-anlegg.ts (D-120). Same
 * structure, same statement codes and sources; the statements themselves are read from the
 * module file's `translations.en`, so the page and the English survey cannot word them
 * differently. The law items describe Norwegian statute in English and are not an official
 * translation: they stay `reviewed: false` until they have been checked, which keeps the
 * page from launching before then (validate.ts).
 */
export const byggOgAnleggEn: IndustryPage = {
  slug: 'bygg-og-anlegg',
  navLabel: 'Construction',
  launched: false,
  module: { key: 'bygg-og-anlegg', version: '1.0.0' },
  moduleName: { title: 'The construction module', inline: 'the construction module' },
  seo: {
    title: 'Work environment survey for construction | Orgpuls',
    description:
      'An employee survey for construction with its own construction module: safety under time pressure, coordination, language, new and young workers, mental health and working hours. Anonymous, by SMS, with measures.',
  },
  hero: {
    pill: 'Construction, civil works and workshops',
    h1: 'Work environment survey for construction',
    lead:
      'The main survey covers what applies to every workplace. The construction module adds what happens on a building site: safety under time pressure, many companies in one place, language in the team, new and young workers, and whether there is room to say you are not doing well. All anonymous, on the phone, with measures that follow up.',
    thresholdNote: 'No group is shown until at least five have answered.',
    preview: {
      company: 'Nordvik Anlegg AS',
      caption: 'Main survey September · index 0–100',
      columns: ['Project North · 14', 'Workshop · 9', 'Project South · 11'],
      rows: [
        { factorKey: 'sikkerhet_foran_fremdrift', values: [58, 71, 48] },
        { factorKey: 'planlegging_og_fremdrift', values: [44, 66, 39] },
        { factorKey: 'samordning_pa_byggeplassen', values: [51, 57, 47] },
        { factorKey: 'sprak_og_beskjeder', values: [63, 78, 55] },
        { factorKey: 'nye_og_unge', values: [69, 74, 61] },
        { factorKey: 'a_si_at_man_ikke_har_det_bra', values: [55, 62, 52] },
      ],
      footnote: 'The office has three answers and is not shown as a column of its own. The example is an imaginary company.',
    },
  },
  challengesIntro: {
    title: 'Eight challenges that keep coming back on site',
    text: 'Drawn from Norwegian, Swedish and Danish inspectorates and research, and from international findings where the Nordic figures are missing. All eight can be measured anonymously and followed up with measures – in the same way as the rest of the work environment.',
  },
  challenges: [
    {
      title: 'Progress comes before safety',
      body: 'Deaths in construction are the lowest in ten years, but the industry still had 3,902 registered occupational injuries in 2024.{{cite:at_kompass}} In 2026 the Swedish Work Environment Authority found that time pressure, price pressure and a culture of silence are what most often stand in the way of a good safety culture on site.{{cite:av_kultur}} The figures in the deviation system say little about this. The answers to whether people dare to stop a job do.',
      measuredBy: { kind: 'module', itemCode: 'BA-SF-2' },
    },
    {
      title: 'The schedule was made without the people doing the work',
      body: 'In a European survey, 74 per cent in Swedish construction said they worked under time pressure, against 47 per cent in the EU.{{cite:ki_osa}} The Danish Working Environment Authority points to unrealistic schedules and poor planning as the cause, and to time pressure causing accidents because less is cleared up and equipment is left standing.{{cite:at_dk}} The main survey measures the workload. The construction module measures where it comes from.',
      measuredBy: { kind: 'module', itemCode: 'BA-PF-1' },
    },
    {
      title: 'Many companies, unclear responsibility',
      body: 'On a building site the main contractor, subcontractors and hired workers work side by side. When responsibility for safety lies with someone without the time, resources or mandate, the work weakens – and it happens most often in projects with many parties.{{cite:av_kultur}} The people in the team notice it before anyone else.',
      measuredBy: { kind: 'module', itemCode: 'BA-SB-1' },
    },
    {
      title: 'The instruction that was not understood',
      body: 'A lack of common language, cultural differences and inadequate training still pull down the HSE standard on Norwegian building sites, Fafo finds.{{cite:fafo}} Since 2024 at least one person in every work team must be able to communicate both with the team and in Norwegian or English, where safety requires it.{{cite:at_sprak_krav}} Whether that works in practice, only the people in the team know.',
      measuredBy: { kind: 'module', itemCode: 'BA-SP-3' },
    },
    {
      title: 'The new and the young',
      body: 'Workers under 25 are the ones most often injured in construction.{{cite:at_kompass}} Around one in five apprentices leaves within the first ten months.{{cite:nho_laerling}} Both come down to the same thing: whether new people get training, a fixed person to ask and time to learn before the pace is raised.',
      measuredBy: { kind: 'module', itemCode: 'BA-NU-1' },
    },
    {
      title: 'The mental side behind the helmet',
      body: 'From 2019 to 2023 sickness absence in construction rose by 22 per cent – the most of the large industries.{{cite:nav}} In the United Kingdom, male construction workers are about three times as likely to die by suicide as men in other industries, and the industry is described as one where you carry it alone.{{cite:ciob}} An anonymous survey can show whether there is room to speak up, without anyone having to come forward.',
      measuredBy: { kind: 'module', itemCode: 'BA-PH-1' },
      helpline: true,
    },
    {
      title: 'Long days and a long way home',
      body: '12 per cent in civil works work more than 48 hours a week, against 8 per cent in working life as a whole, and half work in the cold.{{cite:noa}} Long weeks increase the risk of errors and accidents. Commuting and periods away come on top, and drain more than shows in the timesheets.',
      measuredBy: { kind: 'module', itemCode: 'BA-AR-1' },
    },
    {
      title: 'The tone on the rig',
      body: 'Construction has the lowest share of women and a markedly male-dominated culture. Female apprentices tell of work clothes and site facilities that do not fit, and of attention they would rather have been without.{{cite:samforsk}} This is measured in the main survey with the factor Integrity and dignity, and with the question on offensive behaviour – which is only shown as a count for the whole organisation.',
      measuredBy: { kind: 'core', factorKey: 'integritet', ordinal: 1 },
    },
  ],
  moduleOverview: {
    title: 'The construction module',
    intro:
      'An addition to the main survey, built the same way: statements on a five-point scale, converted to an index from 0 to 100, with three suggested measures per factor. The safety factors build on the dimensions of the Nordic safety climate questionnaire NOSACQ-50, which was developed on building sites in the five Nordic countries.{{cite:nosacq}}',
    coreNote: 'The construction module does not repeat these, but goes one layer deeper where the building site is different.',
  },
  loop: {
    title: 'From answers to measures at the next project meeting',
    steps: [
      { title: 'Measure', text: 'Main survey with the construction module, by SMS or a QR code in the site hut.' },
      { title: 'See per project', text: 'Results per project and workshop, for groups with at least five answers.' },
      { title: 'Choose measures', text: 'Three suggestions per factor. Every measure gets an owner and a deadline.' },
      { title: 'Measure again', text: 'The pulse asks only about the factors you are working on, until the measure has worked.' },
    ],
    example: {
      factorKey: 'sikkerhet_foran_fremdrift',
      actionType: 'rutine',
      groupLabel: 'Project South',
      chips: ['Suggested', 'Decided with the safety representative', 'In progress', 'Effect measured in the pulse', 'Closed above 60'],
      on: 2,
    },
  },
  law: {
    title: 'What the law points to',
    intro:
      'The construction module documents the survey where the building site has requirements of its own. Every factor shows its legal basis in the report. The references are to Norwegian law; the English wording is ours, not an official translation.',
    items: [
      {
        ref: 'Working Environment Act § 4-3 and the regulation, chapter 1A',
        text: 'From 1 January 2026 the law sets clearer requirements for the psychosocial work environment. The factors must be surveyed and risk-assessed systematically, together with the employees.',
        reviewed: false,
      },
      {
        ref: 'Working Environment Act § 2-2',
        text: 'When several employers share a workplace, the principal enterprise must coordinate the health, safety and environment work.',
        reviewed: false,
      },
      {
        ref: 'Working Environment Act § 2-3',
        text: 'An employee must stop work where there is danger to life or health, and report faults and deficiencies.',
        reviewed: false,
      },
      { ref: 'Working Environment Act § 3-2', text: 'The employer must provide the necessary training, practice and instruction.', reviewed: false },
      {
        ref: 'The language requirement',
        text: 'At least one person in every work team on a building or construction site must be able to communicate with the others and in Norwegian or English, where safety requires it.',
        reviewed: false,
      },
      {
        ref: 'Working Environment Act chapter 10',
        text: 'Working hours arrangements must not cause adverse strain, and the rest-period requirements apply on projects too.',
        reviewed: false,
      },
    ],
  },
  faq: [
    {
      q: 'How much longer does the survey get?',
      a: 'The construction module is 24 statements and two short yes/no questions, about three minutes extra. The main survey takes about four minutes.',
    },
    {
      q: 'Can we choose only the factors that apply to us?',
      a: 'Yes. You can choose only the factors that apply to you, for example leaving out coordination in a workshop without subcontractors.',
      featureFlag: 'module_factor_toggles',
    },
    {
      q: 'Can we send it to subcontractors and hired workers?',
      a: 'The survey goes to your own employees. How the cooperation with other companies is experienced is captured by the factor Coordination on site. Hired workers who are part of the team can be added to the employee list in the usual way.',
    },
    {
      q: 'What about employees without e-mail?',
      a: 'The survey can be sent by SMS, or shared as a link and QR code in the site hut. An e-mail address is optional.',
    },
    {
      q: 'Does the manager see who answered no to the safety questions?',
      a: 'No. No group is shown until at least five have answered, and the threshold cannot be lowered. The two yes/no questions on near misses and unsafe jobs are only shown as counts for the whole organisation, never per project.',
    },
    {
      q: 'Can we see results per project?',
      a: 'Yes, on the Usual plan, for groups with at least five answers. If a project has too few answers, they count towards the organisation’s figures.',
    },
    {
      q: 'What does it cost?',
      a: 'Small costs NOK 265 a month for up to 25 employees, Usual NOK 565 for 26–100 employees. Prices exclude VAT, with no lock-in and 15 days free.',
    },
  ],
  cta: {
    title: 'Try it on the next project',
    text: 'Enter the organisation number, add the crew and send by SMS. You are up and running in three minutes, with no card details.',
  },
  questionPage: {
    crumb: 'The question set',
    h1: 'The question set for construction',
    lead: 'Eight factors with three statements each, in addition to the main survey. Every factor has a rationale from research and inspection, a legal basis and three suggested measures that can be measured again in the pulse.',
    scaleNote: 'The statements appear in random order for each person. The wording is fixed, so the figures can be compared from one survey to the next.',
    countTitle: 'Two questions that are only counted',
    countIntro: 'Some questions do not fit in an index, but say a lot about what the deviation system misses. They are only shown as counts for the whole organisation.',
    segmentsTitle: 'Background questions',
    segmentsIntro: 'Optional, to see the difference between site and workshop, and between new and experienced. The main survey’s question on offensive behaviour is reused and not repeated here.',
    rulesTitle: 'How the answers are reported',
    rules: [
      { title: 'At least five answers', text: 'No group is shown until at least five have answered. The threshold can be raised, but never lowered.' },
      { title: 'No working backwards', text: 'If a group could be worked out from the total and the other groups, one more group is held back.' },
      { title: 'The yes/no questions', text: 'BA-T-1 and BA-T-2 are only shown as counts for the whole organisation, never per project.' },
      {
        title: 'Segments',
        text: 'Place of work and length of service are only shown where there are at least five answers, and never combined with a group if that gives fewer than five.',
        featureFlag: 'module_segments',
      },
      { title: 'The same index', text: 'Every statement is converted to 0–100, and the factor is the average of its three statements.' },
      { title: 'Risk level', text: '65 or more is low risk, 50–64 medium and below 50 high – the same as in the main survey.' },
      { title: 'The pulse', text: 'When a factor has open measures, the statement the measure is to be measured on is included in the next pulse.' },
      {
        title: 'Choose what applies',
        text: 'Factors that do not fit can be switched off. Coordination on site, for example, makes little sense in a workshop without subcontractors.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'The construction module does not repeat these.',
    cta: { title: 'Add the construction module to the next survey', text: 'Enter the organisation number. You are up and running in three minutes, with no card details.' },
  },
  related: ['helse-og-omsorg'],
}
