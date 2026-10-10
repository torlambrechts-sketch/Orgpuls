/**
 * The design fixture in the United Kingdom (UK-E3, D-272): the same scenario, the same answers and so
 * the same figures (index 61, 64 the year before, 28 of 34), told by a British firm in English, for
 * Empvibe's product pictures. `node scripts/seed/design-fixture.mjs --market gb` emits it.
 *
 * Nothing about the numbers is here: design-fixture.mjs solves them once, for both. This file holds
 * what a British reader reads instead of the Norwegian — the firm, its people and departments, the
 * comments, the measures, the risk assessment — keyed by the exact Norwegian text it replaces, so a
 * Norwegian text that changes without its English one stops the generator rather than leaking into
 * a picture. And the organisation's own facts in the United Kingdom: the market, its language and
 * clock, a company number, and no Norwegian register or occupational health service.
 *
 * **Nothing here is real.** Northfield Civils Ltd is invented. Its company number, 99999999, is
 * eight digits as Companies House writes a company in England and Wales, and lies far beyond the
 * numbers Companies House has issued (about 16 million in 2026), so no real company holds it. People
 * are invented; addresses are on `.example`.
 */

/** The organisation's own id space: the fixture's ids with 8044 in the fourth group */
export const ID_FROM = '00000000-0000-4000-8000-'
export const ID_TO = '00000000-0000-4000-8044-'

export const ORG = {
  market: 'gb',
  lang: 'en',
  timezone: 'Europe/London',
  name: 'Northfield Civils Ltd',
  number: '99999999',
}

/** Every Norwegian text the fixture writes, and the British English that replaces it */
export const TEXT = {
  // the organisation, its departments and the people the design names
  'Nordvik Anlegg AS': 'Northfield Civils Ltd',
  '924118742': ORG.number,
  Drift: 'Operations',
  Prosjekt: 'Projects',
  Verksted: 'Workshop',
  Administrasjon: 'Administration',
  'Kari Nordbø': 'Karen Hollis',
  'Tomas Vik': 'Tom Walsh',
  'Anne Rygg': 'Anna Reid',
  'Tuva Berg': 'Tess Barker',
  'kari@nordvik.example': 'karen@northfield.example',
  'tomas@nordvik.example': 'tom@northfield.example',
  'anne@nordvik.example': 'anna@northfield.example',
  'tuva@nordvik.example': 'tess@northfield.example',
  '@nordvik.example': '@northfield.example',
  'Kari Sund, tillitsvalgt Fellesforbundet': 'Karen Sutton, union safety representative',

  // where the work happens
  Hovedkontor: 'Head office',
  'Industriveien 14, 3229 Sandefjord': 'Unit 14, Mill Lane, Wakefield',
  'Anlegg Larvik': 'Doncaster site',
  'Elveveien 8, 3262 Larvik': 'Riverside Road, Doncaster',
  'Verksted Stokke': 'Ossett workshop',
  'Bekkeveien 2, 3160 Stokke': 'Brook Street, Ossett',

  // the rounds' own names (the screens name a round from its kind and dates)
  'Grunnlinje 2023': 'Baseline 2023',
  'Grunnlinje 2024': 'Baseline 2024',
  'Grunnlinje 2025': 'Baseline 2025',
  'Grunnlinje 2026': 'Baseline 2026',
  'Puls mai 2025': 'Pulse May 2025',
  'Puls august 2025': 'Pulse August 2025',
  'Puls mars 2026': 'Pulse March 2026',
  'Puls 2026': 'Pulse 2026',

  // the measures
  'Fast svar på avviksmeldinger innen fem dager': 'A named reply to every incident report within five days',
  'Verksted meldte fire avvik i vår uten å få svar. Tiltaket er å gi hver melding et navngitt svar innen fem virkedager.':
    'The Workshop reported four incidents this spring and heard nothing back. The measure is a named reply to every report within five working days.',
  'Prioriteringsmøte hver mandag på Prosjekt': 'Priorities meeting every Monday in Projects',
  'Tre parallelle prosjekter uten uttalt rekkefølge. Møtet skal ende med én skriftlig prioritert liste.':
    'Three projects running side by side with no stated order. The meeting ends with one written list of priorities.',
  'Varslingsrutinen gjennomgått i alle team': 'Whistleblowing procedure reviewed in every team',
  'Effekten måles i pulsen 12. oktober. Tiltaket kan lukkes når ytringsklima er målt på nytt.':
    'The effect is measured in the pulse on 12 October. The measure can be closed once freedom to speak up has been measured again.',
  'Fadderordning for nyansatte første åtte uker': 'A buddy for new starters in their first eight weeks',
  'Lederstøtte falt mest blant de som har vært her under et år. Fadderen er kollega, ikke leder.':
    'Support from managers fell most among people who have been here less than a year. The buddy is a colleague, not a manager.',
  'Varslingsrutinen trykket og hengt opp på alle rigger': 'Whistleblowing procedure printed and put up on every site',
  'Ytringsklima gikk fra 39 til 48 i grunnlinjen etterpå. Effekten er dokumentert og tiltaket lukket.':
    'Freedom to speak up went from 39 to 48 in the next baseline. The effect is recorded and the measure closed.',
  'Tiltaket vurderes som ikke tilstrekkelig alene, og følges opp med fast svarfrist på avviksmeldinger.':
    'Not enough on its own: followed up with a fixed deadline for replying to incident reports.',
  'To innleide ekstra i høysesongen': 'Two extra agency staff in the peak season',
  'Arbeidsmengde steg fire poeng, men falt tilbake i 2026. Vurder om tiltaket må gjentas.':
    'Workload rose four points but fell back in 2026. Consider whether the measure needs repeating.',
  'Effekten er borte året etter. Det vurderes om tiltaket må gjentas fast hver høysesong.':
    'The effect was gone a year later. We are considering repeating it every peak season.',
  'Faste fredagsgjennomganger på Verksted': 'Regular Friday reviews in the Workshop',
  'Kollegastøtte er den høyeste faktoren i 2026. Tiltaket regnes som virksomt og videreføres som rutine.':
    'Support from colleagues is the highest factor in 2026. The measure is judged to work and carries on as routine.',
  'Tiltaket regnes som virksomt og videreføres som fast rutine.': 'Judged to work; it carries on as a standing routine.',

  // the risk assessment
  'Sannsynlighet for uønsket tilstand vurdert mot konsekvens for helse, sikkerhet og velferd. Faktorene er også vurdert samlet, siden arbeidsmengde og motstridende krav virker sammen.':
    'The likelihood of harm weighed against its consequence for health, safety and welfare. The factors were also assessed together, since workload and conflicting demands act on each other.',
  'Ansatte melder at avvik ikke følges opp. Over tid svekker det både sikkerhetsarbeidet og tilliten, og øker risikoen for at alvorlige forhold ikke kommer fram.':
    'Employees report that incidents are not followed up. Over time this weakens both safety work and trust, and makes it more likely that serious problems go unreported.',
  'Vedvarende ubalanse mellom oppgaver og tid på Prosjekt. Kombinert med uklare prioriteringer gir det risiko for helseskadelig belastning over tid.':
    'A lasting imbalance between tasks and time in Projects. With unclear priorities, it risks harmful strain over time.',
  'Motstridende krav forsterker belastningen fra arbeidsmengde. Vurderes samlet med faktoren over.':
    'Conflicting demands add to the strain of the workload. Assessed together with the factor above.',

  // information and training
  'Oppsummering av funnene lagt fram på allmøte.': 'A summary of the findings presented at an all-staff meeting.',
  'Samme oppsummering skriftlig i personalhåndboka.': 'The same summary in writing in the staff handbook.',
  'Saksframlegget delt en uke før AMU.': 'Papers shared a week before the safety committee.',
  'Hver leder fikk sine egne tall samme uke som resultatet ble frigitt.':
    'Each manager received their own figures in the week the results were released.',
  'Oppfølging av psykososiale forhold': 'Managing work-related stress',
  'Kurs for ledere med personalansvar.': 'A course for managers who line-manage staff.',
  'Gjennomgang av varslingsrutinen': 'Whistleblowing procedure review',
  'Gjennomgått i alle team.': 'Reviewed in every team.',

  // the comments and the replies to them
  'Høysesongen er umulig med dagens bemanning.': 'Peak season is impossible with the staff we have now.',
  'Vi leier inn to ekstra fra januar. Si fra om det monner.': 'We are bringing in two extra people from January. Tell us if it makes a difference.',
  'Vi har meldt om den samme feilen på løfteutstyret tre ganger.': 'We have reported the same fault on the lifting gear three times.',
  'Utstyret er byttet 3. oktober. Takk for at du sto på.': 'The equipment was replaced on 3 October. Thank you for keeping at it.',
  'Vil bare si at omleggingen av morgenmøtet var et godt grep.': 'Just want to say that changing the morning meeting was a good move.',
  'Godt å høre — vi beholder det.': 'Good to hear — we will keep it.',
  'Ny leder er engasjert, men vi ser henne for lite ute.': 'The new manager is committed, but we hardly see her out on site.',
  'Jeg setter opp faste besøk på anleggene hver tirsdag fra juni.': 'I am setting up regular visits to the sites every Tuesday from June.',
  'Fredagsgjennomgangene har gjort at vi faktisk snakker sammen.': 'The Friday reviews mean we actually talk to each other.',
  'Da fortsetter vi med dem.': 'Then we will keep them going.',
  'Alle prosjektene har frist samme uke i november. Hvert år.': 'Every project has its deadline in the same week in November. Every year.',
  'Vi tar det opp med kundene før neste kontraktsrunde.': 'We will raise it with our clients before the next round of contracts.',
  'Det hjelper ikke å si fra. Vi meldte avvik på riggingen i vår og hørte aldri noe.':
    'There is no point speaking up. We reported a problem with the rigging this spring and never heard anything.',
  'Man blir fort stemplet som vanskelig hvis man tar opp ting på morgenmøtet.':
    'You soon get labelled as difficult if you raise things at the morning meeting.',
  'Avviksskjemaet er så tungvint at folk heller lar være.': 'The incident form is so clunky that people would rather not bother.',
  'Lederen min tar det på alvor når jeg sier fra. Det burde gjelde alle.':
    'My manager takes it seriously when I speak up. That should be true for everyone.',
  'Takk — vi tar det med inn i arbeidet med ytringsklima.': 'Thank you — we are taking that into our work on freedom to speak up.',
  'Tre prosjekter samtidig og ingen som sier hva som skal vike.': 'Three projects at once and nobody saying what should give.',
  'Jeg jobber kveld nesten hver uke i høysesong.': 'I work evenings almost every week in peak season.',
  'To prosjektledere ber om det samme mannskapet samme uke.': 'Two project managers ask for the same crew in the same week.',
  'Etter ulykken i mai snakket vi aldri om det.': 'After the accident in May we never talked about it.',
  'Lederen er flink, men sitter aldri ute hos oss.': 'The manager is good, but never spends time out with us.',
  'Samholdet på laget er det beste med jobben.': 'The team spirit is the best thing about the job.',
  'Omleggingen av morgenmøtet var et godt grep.': 'Changing the morning meeting was a good move.',
  'Så fint å høre — vi fortsetter med det.': 'Lovely to hear — we will carry on with it.',
  'Fint at vi fikk være med å velge nytt verktøy.': 'Good that we had a say in choosing the new tools.',
}

/**
 * What the organisation is in the United Kingdom, after the rows are written: no Norwegian register
 * snapshot and no occupational health service (neither has a UK counterpart in the product), no
 * fellesferie to skip, and each measure citing its factor's duty in the UK pack (lib/legal/pack.ts
 * factorLawRefs: MHSWR reg 3 and the Management Standards area) rather than a Norwegian provision.
 */
export const AFTER = (org) => `
update app.organizations set
  bht_name = null, registry_fetched_at = null, registry_form_code = null, registry_form_label = null,
  registry_nace_code = null, registry_nace_label = null, registry_registered_on = null,
  registry_address = null, registry_municipality = null, registry_municipality_no = null,
  registry_employees = null, registry_vat = null
where id = '${org}';
update app.year_wheels set skip_fellesferie = false where org_id = '${org}';
update app.measures set law_ref = null where org_id = '${org}';`
