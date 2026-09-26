import type { IndustryPage } from './types'

/**
 * en.orgpuls.com/helse-og-omsorg — the English twin of helse-og-omsorg.ts (D-120, D-122).
 * Same structure, codes and sources; the statements come from the module file's
 * `translations.en`. The law items paraphrase Norwegian statute and stay unreviewed until
 * checked, which holds the page at preview.
 */
export const helseOgOmsorgEn: IndustryPage = {
  slug: 'helse-og-omsorg',
  navLabel: 'Health and care',
  launched: false,
  module: { key: 'helse-og-omsorg', version: '1.0.0' },
  moduleName: { title: 'The health and care module', inline: 'the health and care module' },
  seo: {
    title: 'Work environment survey for health and care | Orgpuls',
    description:
      'An employee survey for health and care with its own health and care module: violence and threats, staffing and responsible care, rotas, part-time work, boundaries with service users and relatives, documentation and patient handling. Anonymous, across every shift.',
  },
  hero: {
    pill: 'Health, care and work with people',
    h1: 'Work environment survey for health and care',
    lead:
      'The main survey measures the emotional demands and whether anyone is left alone with them. The health and care module adds what makes care work different: violence and threats, staffing and conscience, rotas and part-time work, boundaries with service users and relatives, documentation and heavy transfers. All anonymous, on the phone, across every shift.',
    thresholdNote: 'No group is shown until at least five have answered.',
    preview: {
      company: 'Lindely Omsorg AS',
      caption: 'Main survey September · index 0–100',
      columns: ['Nursing home, 1st floor · 16', 'Home care · 12', 'Nights · 7'],
      rows: [
        { factorKey: 'vold_og_trusler', values: [57, 46, 62] },
        { factorKey: 'bemanning_og_forsvarlig_omsorg', values: [44, 52, 41] },
        { factorKey: 'turnus_og_hvile', values: [61, 68, 49] },
        { factorKey: 'grenser_mot_brukere_og_parorende', values: [66, 55, 70] },
        { factorKey: 'tid_til_kjerneoppgavene', values: [48, 59, 63] },
        { factorKey: 'forflytning_og_tunge_loft', values: [53, 42, null], featureFlag: 'module_factor_toggles' },
      ],
      footnoteFlagged: {
        text: 'The night shift has left out patient handling, because the heaviest transfers happen in the daytime.',
        featureFlag: 'module_factor_toggles',
      },
      footnote: 'The kitchen has three answers and is not shown as a column of its own. The example is an imaginary company.',
    },
  },
  challengesIntro: {
    title: 'Nine challenges that keep coming back in health and care',
    text: 'Health and social services have the highest sickness absence of all industries, 9 per cent in the first quarter of 2026.{{cite:nav_q1}} The challenges below are drawn from Norwegian, Swedish and Danish inspectorates and research. All can be measured anonymously and followed up with measures – in the same way as the rest of the work environment.',
  },
  challenges: [
    {
      title: 'Violence and threats are part of everyday work',
      body: 'Around one in four employees in municipal health and care services have been exposed to violence or threats.{{cite:ks_vold}} In Sweden, violence and threats lie behind one in four reported occupational accidents with sickness absence in residential care, against six per cent in working life as a whole.{{cite:av_vold24}} In Denmark the Working Environment Authority found that more than one in ten care homes it visited in 2022 did not protect its staff well enough.{{cite:foa_dk}} The main survey already counts how many have experienced it. The health and care module asks about what can be acted on: whether the risk is known, whether incidents are reported, and whether the person involved is followed up.',
      measuredBy: { kind: 'module', itemCode: 'HO-VT-2' },
    },
    {
      title: 'Too few on shift to do the job responsibly',
      body: 'One in four nurses say they rarely or never manage to give responsible care to all their patients during a shift.{{cite:nsf_forsvarlig}} Danish research calls it moral stress: you know what is right, but you cannot get it done.{{cite:ae_dk}} Questions about workload alone do not measure it.',
      measuredBy: { kind: 'module', itemCode: 'HO-BF-2' },
    },
    {
      title: 'Rotas that give no rest',
      body: 'A SINTEF survey of more than 18,000 nurses describes vacant posts, tight staffing and rotas with little room for rest between shifts.{{cite:sintef_nsf}} Whether the rota works is felt first by the people who work it.',
      measuredBy: { kind: 'module', itemCode: 'HO-TH-1' },
    },
    {
      title: 'Part-time that nobody chose',
      body: '43,000 municipal employees work part-time involuntarily, and seven in ten part-time employees in the municipalities work in health and care.{{cite:fafo_deltid}} Part-time employees often feel a weaker sense of belonging to the workplace, and that affects both the professional community and continuity.{{cite:hdir_heltid}}',
      measuredBy: { kind: 'module', itemCode: 'HO-HF-1' },
    },
    {
      title: 'When service users and relatives cross the line',
      body: '20 per cent of nurses and 16.5 per cent of healthcare workers have experienced sexual harassment in the past year, among the highest shares in working life.{{cite:ssb_trakassering}} It often happens with service users, where it is easy to explain away – and where the duty to prevent it still lies with the employer.',
      measuredBy: { kind: 'module', itemCode: 'HO-GP-2' },
    },
    {
      title: 'The keyboard takes time from the service user',
      body: 'Nurses estimate that they spend around two hours per working day in the electronic record, and around three in four believe that time comes at the expense of patient-facing tasks.{{cite:tidstyver}} The time thieves are often local, and the people who see them best are those who work the shifts.',
      measuredBy: { kind: 'module', itemCode: 'HO-TK-1' },
    },
    {
      title: 'New staff and temps alone on shift',
      body: 'Ten years after qualifying, one in five nurses no longer works in the health service, and the wish to leave is strongest among the young and those who have worked the shortest.{{cite:ssb_sykepleiere}} Whether new staff and temps are trained before they are alone, and whether the handover between shifts holds, decides much of the first year.',
      measuredBy: { kind: 'module', itemCode: 'HO-FT-1' },
    },
    {
      title: 'Heavy lifting without equipment',
      body: 'STAMI research in home care shows that more than six in ten do heavy physical lifts without equipment – and half do so even when the equipment is there.{{cite:stami_forflytning}} The problem is rarely the equipment alone, but the time and staffing to use it.',
      measuredBy: { kind: 'module', itemCode: 'HO-FL-2' },
    },
    {
      title: 'The emotional work',
      body: 'Work with people brings strain that is not about quantity: grief, anger, unrest and responsibility for other people’s lives. It is at the core of the main survey for health and care, and is therefore not repeated in the module.',
      measuredBy: { kind: 'core', factorKey: 'emosjon', ordinal: 1, alongside: [2, 3] },
    },
  ],
  moduleOverview: {
    title: 'The health and care module',
    intro:
      'An addition to the main survey, built the same way: statements on a five-point scale, converted to an index from 0 to 100, with three suggested measures per factor.',
    coreAlso: 'counts how many have experienced violence or threats',
    coreNote: 'The health and care module does not repeat these, but goes one layer deeper where care work is different.',
  },
  loop: {
    title: 'From answers to measures at the next staff meeting',
    steps: [
      { title: 'Measure', text: 'Main survey with the health and care module, by SMS or a QR code in the staff room.' },
      { title: 'See per department', text: 'Results per department and ward, for groups with at least five answers.' },
      { title: 'Choose measures', text: 'Three suggestions per factor. Every measure gets an owner and a deadline.' },
      { title: 'Measure again', text: 'The pulse asks only about the factors you are working on, until the measure has worked.' },
    ],
    example: {
      factorKey: 'vold_og_trusler',
      actionType: 'rutine',
      groupLabel: 'Home care',
      chips: ['Suggested', 'Decided with the safety representative', 'In progress', 'Effect measured in the pulse', 'Closed above 60'],
      on: 2,
    },
  },
  law: {
    title: 'What the law points to in work with people',
    intro:
      'The health and care module documents the survey where care work has requirements of its own. Every factor shows its legal basis in the report. The references are to Norwegian law; the English wording is ours, not an official translation.',
    items: [
      {
        ref: 'Working Environment Act § 4-3 (2) b',
        text: 'Psychosocial working environment factors include, among other things, emotional demands and strain in work with people.',
        reviewed: false,
      },
      {
        ref: 'Working Environment Act § 4-3 (6)',
        text: 'Employees shall, as far as possible, be protected against violence, threats and adverse strain resulting from contact with others.',
        reviewed: false,
      },
      {
        ref: 'The regulations, chapter 23A',
        text: 'Where employees may be exposed to violence or threats, the risk must be assessed, and there must be measures, training and follow-up.',
        reviewed: false,
      },
      {
        ref: 'The regulations, § 1A-2',
        text: 'The factors must be surveyed and risk-assessed individually and together, in cooperation with the employees, and repeated regularly.',
        reviewed: false,
      },
      {
        ref: 'Working Environment Act chapter 10',
        text: 'The work schedule must not cause adverse strain, and the rest-period requirements apply on rotas too.',
        reviewed: false,
      },
      {
        ref: 'Working Environment Act § 14-3',
        text: 'Part-time employees have a preferential right to an extended position before the employer hires new people.',
        reviewed: false,
      },
      {
        ref: 'Equality and Anti-Discrimination Act § 13',
        text: 'The employer shall prevent and seek to hinder sexual harassment, including from service users and relatives.',
        reviewed: false,
      },
    ],
  },
  faq: [
    {
      q: 'How much longer does the survey get?',
      a: 'The health and care module is 24 statements and two short yes/no questions, about three minutes extra. The main survey takes about four minutes.',
      more: {
        text: 'You can also choose only the factors that apply to you, for example leaving out patient handling at a GP surgery.',
        featureFlag: 'module_factor_toggles',
      },
    },
    {
      q: 'Can we ask about violence and threats?',
      a: 'Yes, and assessing the risk is a requirement, cf. the Working Environment Act § 4-3 sixth paragraph. The main survey counts how many have experienced violence or threats. The health and care module also asks about prevention, reporting and follow-up, and about incidents that were not reported. The count questions are only shown as counts for the whole organisation.',
    },
    {
      q: 'Does the manager see who answered that staffing was not responsible?',
      a: 'No. The question is only shown as a count for the whole organisation, never per department or shift. No group is shown until at least five have answered, and the threshold cannot be lowered.',
    },
    {
      q: 'What about people on rotas and nights?',
      a: 'The survey is sent by e-mail or SMS, or shared as a link and QR code in the staff room. It stays open for several days, so every shift has time to answer.',
    },
    {
      q: 'Can we see results per department or ward?',
      a: 'Yes, on the Usual plan, for departments with at least five answers. If a department has too few answers, they count towards the organisation’s figures.',
    },
    {
      q: 'What does it cost?',
      a: 'Small costs NOK 265 a month for up to 25 employees, Usual NOK 565 for 26–100 employees. Prices exclude VAT, with no lock-in and 15 days free.',
    },
  ],
  cta: {
    title: 'Try it on your own organisation',
    text: 'Enter the organisation number, add the employee list and send by SMS. You are up and running in three minutes, with no card details.',
  },
  questionPage: {
    crumb: 'The question set',
    h1: 'The question set for health and care',
    lead: 'Eight factors with three statements each, in addition to the main survey. Every factor has a rationale from research and inspection, a legal basis and three suggested measures that can be measured again in the pulse.',
    scaleNote: 'The statements appear in random order for each person. The wording is fixed, so the figures can be compared from one survey to the next.',
    countTitle: 'Two questions that are only counted',
    countIntro: 'Some questions do not fit in an index, but say a lot about what the deviation system misses. They are only shown as counts for the whole organisation.',
    segmentsTitle: 'Background questions',
    segmentsIntro:
      'Optional, to see the difference between day, evening and night, and between full-time and part-time. The main survey’s questions on violence and threats in the last twelve months and on offensive behaviour are reused and not repeated here.',
    rulesTitle: 'How the answers are reported',
    rules: [
      { title: 'At least five answers', text: 'No group or segment is shown until at least five have answered. The threshold can be raised, but never lowered.' },
      { title: 'No working backwards', text: 'If a group could be worked out from the total and the other groups, one more group is held back.' },
      { title: 'The yes/no questions', text: 'HO-T-1 and HO-T-2 are only shown as counts for the whole organisation, never per department or segment.' },
      {
        title: 'Segments',
        text: 'Shift pattern and position size are only shown where there are at least five answers, and never combined with a group if that gives fewer than five.',
        featureFlag: 'module_segments',
      },
      { title: 'The same index', text: 'Every statement is converted to 0–100, and the factor is the average of its three statements.' },
      { title: 'Risk level', text: '65 or more is low risk, 50–64 medium and below 50 high – the same as in the main survey.' },
      { title: 'The pulse', text: 'When a factor has open measures, the statement the measure is to be measured on is included in the next pulse.' },
      {
        title: 'Choose what applies',
        text: 'Factors that do not fit can be switched off. Patient handling, for example, makes little sense at a GP surgery.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'The health and care module does not repeat these.',
    cta: { title: 'Add the health and care module to the next survey', text: 'Enter the organisation number. You are up and running in three minutes, with no card details.' },
  },
  related: ['bygg-og-anlegg'],
  sourcesFromFactors: false,
}
