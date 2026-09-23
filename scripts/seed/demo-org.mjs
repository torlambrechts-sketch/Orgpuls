/**
 * Generates the demo organisation: a second, larger undertaking an evaluator can sign in to.
 *
 * The design fixture (design-fixture.mjs) is built backwards from the design's own numbers
 * and is what the pixel gate and CI's figures check read. It is small on purpose — 34
 * people, two grunnlinjer, one puls — and it must stay exactly as it is. This file is its
 * counterpart for the other use: showing the product to someone deciding whether to use
 * it. Three years of measurements, quarterly pulses, 64 people in six departments, a
 * department under the anonymity threshold, measures at every step, conversations in every
 * state, risk assessments, and the § 8 record.
 *
 * **Nothing here is real.** "Demobedriften AS" has no entry in Enhetsregisteret (checked
 * against data.brreg.no on 2026-09-23), and its number 990000001 fails the mod-11 check
 * digit, so no real undertaking can ever hold it — the registration flow would reject it
 * before asking Brønnøysund (lib/brreg/lookup.ts). People are invented; addresses are on
 * `.example`, a reserved TLD. The respondent comments are written for this file.
 *
 * **The same rules as the fixture.** This file is the only source of these rows: a row not
 * emitted here does not survive a rerun, so nothing is created by hand against a database.
 * It is idempotent and works against an empty database. Responses carry a group and an
 * hour and nothing else; they are inserted by count and never joined to an invitation.
 *
 * **Who can sign in.** The demo login is an ordinary Supabase Auth user created through the
 * public sign-up endpoint, never by writing `auth.users`. This file only gives it a profile
 * and a daglig leder membership in this organisation, looked up by e-mail — so on a
 * database where that user does not exist (CI, a fresh local stack) those two statements
 * match nothing and the organisation is seeded without a login. The password is never in
 * this repository.
 *
 *   node scripts/seed/demo-org.mjs > /tmp/demo.sql && psql "$DATABASE_URL" -f /tmp/demo.sql
 */

import { createHash } from 'node:crypto'

export const DEMO_ORG = 'de000000-0000-4000-8000-000000000001'
const LOGIN_EMAIL = 'demo@orgpuls.com'

/** A stable UUID from a name, so every rerun writes the same ids. */
const uid = (name) => {
  const h = createHash('md5').update(`orgpuls-demo:${name}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)

/**
 * Six departments. Økonomi og HR has four people — under k = 5 by headcount, so its
 * participation is shown and its results never are. That is a state the product has to
 * handle and an evaluator should see handled.
 *
 * [name, headcount 2024, 2025, 2026]
 */
const GROUPS = [
  ['Drift og vedlikehold', 16, 17, 18],
  ['Renhold', 13, 14, 15],
  ['Kundeservice', 9, 10, 10],
  ['Prosjekt og teknikk', 8, 9, 10],
  ['Salg og marked', 6, 6, 7],
  ['Økonomi og HR', 4, 4, 4],
]

/**
 * The roster, in hiring order within each department: the first `headcount` people of a
 * department are the ones who worked there in a given year. The first person in each
 * department leads it.
 */
const PEOPLE = {
  'Drift og vedlikehold': [
    'Øyvind Hansen', 'Kristian Moe', 'Silje Berntsen', 'Jonas Aas', 'Mohammed Rahimi',
    'Per Kristian Lie', 'Anders Dahl', 'Ida Sørensen', 'Tor Helge Bakke', 'Lars Myhre',
    'Espen Nilsen', 'Piotr Nowak', 'Vegard Holm', 'Stian Eide', 'Magnus Strand',
    'Rune Solberg', 'Emil Haugen', 'Helge Vik',
  ],
  Renhold: [
    'Hanne Lunde', 'Agnieszka Kowalska', 'Fatima Hassan', 'Marianne Berg', 'Lina Johansen',
    'Sara Tesfaye', 'Gunn Karlsen', 'Tone Pedersen', 'Maria Santos', 'Ingrid Aune',
    'Hilde Nygård', 'Amina Yusuf', 'Kari Østby', 'Elin Tangen', 'Rita Fossum',
  ],
  Kundeservice: [
    'Camilla Brekke', 'Sondre Knutsen', 'Nora Lien', 'Henrik Wold', 'Thea Andersen',
    'Mathias Rønning', 'Julie Hovland', 'Kasper Iversen', 'Maja Evensen', 'Adrian Lund',
  ],
  'Prosjekt og teknikk': [
    'Bjørn Vidar Haug', 'Linn Skaar', 'Erik Sæther', 'Kjetil Ruud', 'Hanna Fjeld',
    'Ole Martin Bøe', 'Sigrid Tveit', 'Daniel Ask', 'Ahmed Farah', 'Eirik Lindahl',
  ],
  'Salg og marked': [
    'Therese Hagen', 'Morten Kvam', 'Ingvild Sand', 'Håkon Berge', 'Vilde Jacobsen',
    'Fredrik Moen', 'Tiril Strøm',
  ],
  'Økonomi og HR': ['Marte Solheim', 'Anette Grønli', 'Jan Erik Voll', 'Ragnhild Fosse'],
}

const DAGLIG_LEDER = 'Marte Solheim'
const DUTIES = {
  'Marte Solheim': 'daglig_leder',
  'Øyvind Hansen': 'avdelingsleder',
  'Hanne Lunde': 'avdelingsleder',
  'Camilla Brekke': 'avdelingsleder',
  'Bjørn Vidar Haug': 'avdelingsleder',
  'Therese Hagen': 'avdelingsleder',
  'Kristian Moe': 'verneombud',
  'Agnieszka Kowalska': 'tillitsvalgt',
}

const fold = (s) =>
  s.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z]+/g, '.')
const emailOf = (name) => `${fold(name)}@demobedriften.example`

const EMPLOYEES = GROUPS.flatMap(([group]) =>
  PEOPLE[group].map((name, i) => ({ id: uid(`employee:${name}`), name, group, rank: i })),
)
const byName = Object.fromEntries(EMPLOYEES.map((e) => [e.name, e]))
const HEADCOUNT_2026 = GROUPS.reduce((n, g) => n + g[3], 0)

for (const [group, , , h26] of GROUPS) {
  if (PEOPLE[group].length !== h26) throw new Error(`${group}: roster ${PEOPLE[group].length} ≠ ${h26}`)
}

/**
 * The measurements. Grunnlinje each September, pulses in March and June, and a follow-up
 * puls open now on the factors the 2026 grunnlinje put in the red.
 *
 * `answered` is per department, in GROUPS order. `year` picks which headcount column the
 * round invited. The open puls is the one row whose dates cannot be pinned — it is open
 * because now() falls inside it — so, as in the fixture (D-08), it is anchored to the day
 * the file runs: opened two days ago, closes in five.
 */
const ROUNDS = [
  { key: 'g24', kind: 'grunnlinje', year: 2024, label: 'Grunnlinje 2024', col: 1,
    opens: '2024-09-03 07:00:00+02', closes: '2024-09-13 21:00:00+02',
    answered: [11, 9, 7, 6, 5, 3], factors: null },
  { key: 'p25a', kind: 'puls', year: 2025, label: 'Puls 1 · 2025', col: 2,
    opens: '2025-03-04 07:00:00+01', closes: '2025-03-11 21:00:00+01',
    answered: [12, 10, 8, 7, 5, 3], factors: ['ytring', 'mengde'] },
  { key: 'p25b', kind: 'puls', year: 2025, label: 'Puls 2 · 2025', col: 2,
    opens: '2025-06-03 07:00:00+02', closes: '2025-06-10 21:00:00+02',
    answered: [13, 10, 8, 8, 4, 2], factors: ['ytring', 'mengde', 'leder'] },
  { key: 'g25', kind: 'grunnlinje', year: 2025, label: 'Grunnlinje 2025', col: 2,
    opens: '2025-09-02 07:00:00+02', closes: '2025-09-12 21:00:00+02',
    answered: [13, 11, 9, 8, 5, 3], factors: null },
  { key: 'p26a', kind: 'puls', year: 2026, label: 'Puls 1 · 2026', col: 3,
    opens: '2026-03-03 07:00:00+01', closes: '2026-03-10 21:00:00+01',
    answered: [14, 11, 9, 8, 5, 3], factors: ['mengde', 'leder', 'rolle'] },
  { key: 'p26b', kind: 'puls', year: 2026, label: 'Puls 2 · 2026', col: 3,
    opens: '2026-06-02 07:00:00+02', closes: '2026-06-09 21:00:00+02',
    answered: [13, 10, 8, 9, 6, 2], factors: ['mengde', 'kontakt'] },
  { key: 'g26', kind: 'grunnlinje', year: 2026, label: 'Grunnlinje 2026', col: 3,
    opens: '2026-09-01 07:00:00+02', closes: '2026-09-11 21:00:00+02',
    answered: [15, 13, 9, 9, 6, 3], factors: null },
  { key: 'p26c', kind: 'puls', year: 2026, label: 'Puls 3 · 2026', col: 3, open: true,
    answered: [7, 6, 5, 4, 2, 1], factors: ['ytring', 'mengde', 'kontakt', 'emosjon'] },
]
/**
 * The organisation's story, as index targets per factor at each grunnlinje. Workload was
 * the problem in 2024 and has been worked on since; speaking up improved once reports got
 * answers; leader support dipped in 2025 when two departments changed leader, then came
 * back; emotional demands in customer service are the thing that has not moved.
 *
 * Pulses sit between the grunnlinjer on the same line. The computed indices are not
 * exactly these — answers are drawn around them — which is what real data looks like.
 */
const STORY = {
  ytring: [48, 55, 60], mengde: [41, 46, 50], motstrid: [50, 52, 54], kontakt: [57, 60, 56],
  emosjon: [54, 55, 53], leder: [63, 57, 64], medvirk: [56, 61, 65], integritet: [69, 71, 72],
  rolle: [66, 68, 71], kollega: [74, 75, 77], mening: [72, 73, 75],
}
const WHEN = { g24: 0, p25a: 0.35, p25b: 0.65, g25: 1, p26a: 1.35, p26b: 1.65, g26: 2, p26c: 2.1 }
const target = (factor, key) => {
  const t = WHEN[key], [a, b, c] = STORY[factor]
  return t <= 1 ? a + (b - a) * t : t <= 2 ? b + (c - b) * (t - 1) : c + (c - b) * (t - 2)
}

/** What differs between departments, in index points against the organisation's line. */
const OFFSET = {
  'Drift og vedlikehold': { mengde: -5, kontakt: -9, ytring: -3 },
  Renhold: { emosjon: -4, integritet: -7, medvirk: -7, mengde: -3 },
  Kundeservice: { emosjon: -12, motstrid: -7, leder: 4, kollega: 3 },
  'Prosjekt og teknikk': { mengde: -9, motstrid: -5, mening: 5, medvirk: 4 },
  'Salg og marked': { leder: -6, rolle: -5, mening: 3 },
  'Økonomi og HR': { rolle: 3, kontakt: 4 },
}

const FACTORS = Object.keys(STORY)
const factorsOf = (r) => r.factors ?? FACTORS

/** Screening answers per grunnlinje, [nei, ja selv, ja sett andre, vil ikke svare]. */
const SCREENING = {
  g24: { krenkende: [35, 3, 2, 1], vold: [40, 1, 0, 0] },
  g25: { krenkende: [44, 2, 2, 1], vold: [48, 0, 0, 1] },
  g26: { krenkende: [51, 1, 2, 1], vold: [54, 0, 0, 1] },
}

/**
 * Measures: eighteen, across three years, at every step. Owners are the department leads
 * and the daglig leder. The ones raised from 2024 and 2025 are closed or measured; the 2026
 * ones are proposed, decided, running — two of them past their deadline — or carried out
 * and waiting for the next measurement. `due` may be 'today-N' for a deadline that must
 * stay in the past whenever the file runs.
 *
 * [key, factor, from, owner, title, goal, due, completed, step, kind, groups, effectRound, effectNote]
 */
const MEASURES = [
  ['m01', 'mengde', 'g24', 'Øyvind Hansen', 'Fast bemanningsplan for vintersesongen',
    'Brøyting og vakter la seg oppå ordinær drift uten ekstra folk. Planen skal være klar før 1. november hvert år.',
    '2024-11-01', '2024-10-28', 'lukket', 'kollektivt', ['Drift og vedlikehold'], 'g25',
    'Arbeidsmengde i Drift steg fra 34 til 44. Planen videreføres som fast rutine.'],
  ['m02', 'ytring', 'g24', DAGLIG_LEDER, 'Svar på alle avviksmeldinger innen en uke',
    'Ansatte meldte avvik uten å høre noe tilbake. Hver melding skal få et navngitt svar innen sju dager.',
    '2024-12-01', '2024-11-20', 'lukket', 'kollektivt', [], 'p25a',
    'Ytringsklima steg fra 46 til 48 i første puls og videre til 52 i grunnlinjen 2025.'],
  ['m03', 'kontakt', 'g24', 'Øyvind Hansen', 'Fast innsjekk og alarm ved alenearbeid',
    'Vaktmestere er alene på objekt store deler av dagen. Alle får mobil alarm og fast innsjekk kl. 10 og 14.',
    '2025-02-01', '2025-02-10', 'lukket', 'kollektivt', ['Drift og vedlikehold'], 'g25',
    'Kontakt og tilhørighet i Drift steg fra 47 til 58. Innsjekken videreføres som fast rutine.'],
  ['m04', 'integritet', 'g24', 'Hanne Lunde', 'Felles forventninger til hvordan vi snakker til hverandre',
    'Utarbeidet sammen med teamlederne i Renhold og gjennomgått på alle skift.',
    '2025-03-01', '2025-03-01', 'lukket', 'kollektivt', ['Renhold'], 'g25',
    'Integritet i Renhold falt fra 74 til 66 til tross for tiltaket. Ikke nok alene — følges opp med kurs for teamlederne.'],
  ['m05', 'leder', 'g25', 'Anette Grønli', 'Lederutvikling for alle med personalansvar',
    'Lederstøtte falt seks poeng etter to lederskifter. Seks samlinger over vinteren, med oppfølging i egen gruppe.',
    '2026-04-30', '2026-04-30', 'effekt_malt', 'kollektivt', [], 'g26',
    'Lederstøtte tilbake på 63, fra 56 året før. Tiltaket kan lukkes når ledergruppen har evaluert det.'],
  ['m06', 'mengde', 'g25', 'Bjørn Vidar Haug', 'Prioriteringsmøte hver mandag',
    'For mange parallelle prosjekter uten uttalt rekkefølge. Møtet ender med én skriftlig prioritert liste.',
    '2025-10-15', '2025-10-20', 'effekt_malt', 'kollektivt', ['Prosjekt og teknikk'], 'p26a',
    'Liten bedring i Prosjekt og teknikk, fra 35 til 39 i pulsen i mars. Ikke nok alene — se tiltaket om maks to prosjekter.'],
  ['m07', 'emosjon', 'g25', 'Camilla Brekke', 'Kort gjennomgang etter krevende kundesamtaler',
    'Emosjonelle krav er høyest i Kundeservice. Alle kan be om ti minutter med teamleder etter en vanskelig samtale.',
    '2026-01-15', '2026-02-01', 'gjennomfort', 'kollektivt', ['Kundeservice'], null, null],
  ['m08', 'medvirk', 'g25', 'Hanne Lunde', 'Renholderne med i planleggingen av nye kontrakter',
    'To fra hvert team deltar når nye renholdsavtaler planlegges.',
    '2026-01-15', '2026-01-15', 'lukket', 'kollektivt', ['Renhold'], 'g26',
    'Medvirkning i Renhold har steget hvert år, fra 49 i 2024 til 53. Videreføres.'],
  ['m09', 'motstrid', 'g25', 'Camilla Brekke', 'Én kø og faste prioriteringsregler i kundeservice',
    'Telefon, chat og e-post konkurrerer om de samme folkene. Én kø og skriftlige regler for hva som går først.',
    '2026-08-31', null, 'pagar', 'kollektivt', ['Kundeservice'], null, null],
  ['m10', 'mengde', 'g26', 'Øyvind Hansen', 'Vikarpool i høysesong',
    'Avtale med to faste vikarer som kan kalles inn på kort varsel fra november til mars.',
    '2026-11-30', null, 'besluttet', 'kollektivt', ['Drift og vedlikehold'], null, null],
  ['m11', 'ytring', 'g26', DAGLIG_LEDER, 'Forslag besvares på allmøtet hver måned',
    'Forslag kan leveres anonymt. Alle forslag får et svar på neste allmøte, også de som ikke blir gjennomført.',
    null, null, 'foreslatt', 'kollektivt', [], null, null],
  ['m12', 'kontakt', 'g26', 'Øyvind Hansen', 'Fadder for nyansatte på driftsbasen',
    'Nyansatte i Drift får en fast fadder de første åtte ukene. Fadderen er kollega, ikke leder.',
    '2026-10-15', null, 'pagar', 'kollektivt', ['Drift og vedlikehold'], null, null],
  ['m13', 'emosjon', 'g26', 'Camilla Brekke', 'Rotasjon mellom telefon og skriftlige henvendelser',
    'Ingen sitter på telefon mer enn en halv dag om gangen.',
    'today-3', null, 'pagar', 'kollektivt', ['Kundeservice'], null, null],
  ['m14', 'rolle', 'g26', 'Therese Hagen', 'Rollebeskrivelser for alle i Salg og marked',
    'Uklart hvem som eier kunden etter salget. Hver rolle beskrives på én side og gjennomgås med den som har den.',
    '2026-12-15', null, 'besluttet', 'kollektivt', ['Salg og marked'], null, null],
  ['m15', 'integritet', 'g26', 'Hanne Lunde', 'Kurs i konflikthåndtering for teamledere',
    null, null, null, 'foreslatt', 'kollektivt', ['Renhold'], null, null],
  ['m16', 'mengde', 'p26b', 'Bjørn Vidar Haug', 'Maks to parallelle prosjekter per prosjektleder',
    'Arbeidsmengde er fortsatt den laveste faktoren i Prosjekt og teknikk. Nye prosjekter settes i kø til en plass blir ledig.',
    'today-12', null, 'pagar', 'kollektivt', ['Prosjekt og teknikk'], null, null],
  ['m17', 'leder', 'g26', DAGLIG_LEDER, 'Medarbeidersamtaler to ganger i året',
    'Samtalene flyttes fra én gang i året til mars og september, med en fast mal.',
    '2026-09-30', '2026-09-18', 'gjennomfort', 'kollektivt', [], null, null],
  ['m18', 'motstrid', 'g26', 'Anette Grønli', 'Individuell oppfølging sammen med bedriftshelsetjenesten',
    'Tilbud om samtale med BHT for dem som ønsker det. Kollektive tiltak for Kundeservice står over.',
    '2026-11-01', null, 'besluttet', 'individuelt', [], null, null],
]

/**
 * Risk assessments for the two latest grunnlinjer: the factors assessed, the judgement,
 * and who made it. Stored, not computed from the index (D-18).
 */
const RISK = [
  { key: 'g25', on: '2025-09-24', by: DAGLIG_LEDER,
    summary: 'Vurdert i AMU 24. september med verneombud og BHT til stede. Lederstøtte er vurdert særskilt etter to lederskifter.',
    factors: [
      ['mengde', 'hoy', 'alvorlig', 'krever_tiltak', 'Vedvarende høy arbeidsmengde i Drift og Prosjekt. Risiko for belastningsskader og sykefravær over tid.'],
      ['leder', 'middels', 'moderat', 'krever_tiltak', 'Fall etter lederskifter i to avdelinger. Forventes å bedre seg, men følges med lederutvikling.'],
      ['emosjon', 'hoy', 'alvorlig', 'krever_tiltak', 'Kundeservice håndterer sinte og fortvilte kunder daglig. Belastningen er størst der: 36 i Kundeservice mot 49 for virksomheten.'],
    ] },
  { key: 'g26', on: '2026-09-17', by: DAGLIG_LEDER,
    summary: 'Sannsynlighet for uønsket tilstand vurdert mot konsekvens for helse, sikkerhet og velferd. Emosjonelle krav og arbeidsmengde vurdert samlet, siden de virker sammen i Kundeservice og Prosjekt.',
    factors: [
      ['emosjon', 'hoy', 'alvorlig', 'uforsvarlig_uten_tiltak', 'Kundeservice ligger langt under resten av virksomheten og har ikke beveget seg på tre år. Uten nye tiltak er belastningen ikke forsvarlig.'],
      ['mengde', 'middels', 'alvorlig', 'krever_tiltak', 'Klar bedring siden 2024, men Prosjekt og teknikk ligger fortsatt i rødt. Tiltakene virker og må videreføres.'],
      ['kontakt', 'middels', 'moderat', 'krever_tiltak', 'Falt tilbake i Drift etter at to nye objekter kom til. Alenearbeid må følges opp igjen.'],
      ['motstrid', 'middels', 'moderat', 'krever_tiltak', 'Motstridende krav i kundeservice forsterker de emosjonelle kravene. Vurderes samlet med disse.'],
    ] },
]

/**
 * Conversations: anonymous comments and the dialogue on them, in every state.
 *
 * Each attaches to a response in a department whose respondent count in that round clears
 * k — never Økonomi og HR, whose comments `conversations()` is built never to show. The
 * response picked is the one with the lowest answer on that statement, because the screen
 * prints the answer next to the comment and a complaint beside a 5 reads as an error.
 *
 * `age` is days before now for threads on the latest rounds, so "venter 6 dager" stays true
 * whenever the file runs (D-08); older rounds' threads are dated from their own round.
 * Messages are [author, hours after opening, body].
 *
 * [round, department, factor, ordinal, state, flagged, age | null, opening, messages, pick?]
 *
 * `pick` is 'high' for a comment that praises: it takes one of the highest answers to the
 * statement instead of the lowest. Several comments on the same statement in the same
 * department take successive responses, so no response carries two of them.
 */
const CONVERSATIONS = [
  ['g26', 'Kundeservice', 'emosjon', 1, 'venter', false, 3,
    'Etter en dag med sinte kunder på telefon går jeg rett hjem og legger meg. Det er ingen som spør hvordan det går.', []],
  ['g26', 'Drift og vedlikehold', 'kontakt', 2, 'venter', false, 6,
    'Siden vi fikk de to nye byggene er jeg alene hele dagen. Innsjekken ble borte da vaktlederen sluttet.', []],
  ['g26', 'Prosjekt og teknikk', 'mengde', 1, 'venter', false, 8,
    'Vi sier ja til alt og så er det vi som må få det til. Ingen tør si at noe må vente.', []],
  ['g26', 'Renhold', 'integritet', 3, 'venter', true, 9,
    'En av teamlederne snakker nedsettende om de som ikke er norske. Jeg vet ikke om dette er et varsel eller hvem jeg skal si det til.', []],
  ['g26', 'Kundeservice', 'motstrid', 2, 'dialog', false, 10,
    'Vi får beskjed om å korte ned samtalene og samtidig om å løse alt i første samtale. Begge deler går ikke.',
    [['leder', 20, 'Takk for at du sier dette. Du har rett i at de to målene trekker hver sin vei. Vi tar det opp på teammøtet torsdag — hva ville du ha prioritert?'],
     ['ansatt', 46, 'Løse saken. Det tar lengre tid nå, men da ringer de ikke tilbake tre ganger.'],
     ['leder', 70, 'Da endrer vi målet for samtaletid fra neste måned, og måler på løst i første kontakt i stedet.']]],
  ['g26', 'Salg og marked', 'rolle', 1, 'dialog', false, 11,
    'Etter at kunden har signert vet ingen hvem som eier den. Da ringer de meg, og jeg har ikke svaret.',
    [['leder', 26, 'Det er et godt poeng. Vi lager rollebeskrivelser før jul — kan jeg ta med akkurat dette tilfellet som eksempel?'],
     ['ansatt', 50, 'Ja, gjerne.']]],
  ['p26b', 'Drift og vedlikehold', 'mengde', 1, 'lukket', false, null,
    'Sommerferien er lagt slik at vi er to på jobb i juli. Det går ikke med tre nye bygg.',
    [['leder', 18, 'Vi har fått på plass en sommervikar fra 1. juli. Takk for at du sa ifra tidlig.'],
     ['ansatt', 40, 'Supert, det hjelper mye.']]],
  ['p26b', 'Prosjekt og teknikk', 'mengde', 2, 'lukket', false, null,
    'Prioriteringsmøtet er bra, men vi får nye prosjekter midt i uka likevel.',
    [['leder', 22, 'Det har du rett i. Fra høsten tar vi ikke inn nye prosjekter før en plass er ledig — maks to per prosjektleder.']]],
  ['p26a', 'Kundeservice', 'leder', 1, 'lukket', false, null,
    'Ny leder er flink, men vi ser henne nesten aldri på gulvet.',
    [['leder', 30, 'Takk. Jeg setter av tirsdag og torsdag formiddag til å sitte sammen med dere fra nå av.']]],
  ['g25', 'Renhold', 'medvirk', 1, 'lukket', false, null,
    'Vi får vite om nye kontrakter samme dag som vi skal begynne. Da er alt allerede bestemt.',
    [['leder', 24, 'Det skal vi endre. Fra neste kontrakt er to fra teamet med i planleggingen.'],
     ['ansatt', 72, 'Det hadde vært bra.'],
     ['leder', 900, 'Nå har vi gjort det på to kontrakter. Si gjerne fra om det fungerer.']]],
  ['g25', 'Drift og vedlikehold', 'ytring', 2, 'lukket', false, null,
    'Jeg meldte feil på heisen i mars og har ikke hørt noe siden.',
    [['leder', 20, 'Beklager. Den meldingen ble liggende. Heisen er nå meldt til leverandøren, og alle meldinger får svar innen en uke.']]],
  ['g25', 'Salg og marked', 'leder', 2, 'lukket', false, null,
    'Etter lederskiftet er det ingen som følger opp målene våre.',
    [['leder', 28, 'Det er riktig at vi har vært uten fast leder i to måneder. Therese starter 1. oktober og tar oppfølgingen fra første uke.']]],
  ['g24', 'Drift og vedlikehold', 'mengde', 1, 'lukket', false, null,
    'Om vinteren brøyter vi fra fem om morgenen og skal likevel rekke alt det vanlige.',
    [['leder', 30, 'Vi lager en egen bemanningsplan for vinteren. Den er klar før november.']]],
  ['g24', 'Renhold', 'integritet', 1, 'lukket', false, null,
    'Tonen på skiftet er hard, og det går mest ut over de nye.',
    [['leder', 36, 'Takk for at du sier det. Vi lager felles forventninger sammen med teamlederne og går gjennom dem på alle skift.']]],

  /*
   * Enough on two factors of the 2026 grunnlinje for Resultat's "Hva de skrev" to show
   * them as themes — five or more different people each (0030, D-56). Arbeidsmengde is
   * six complaints across five departments; Kollegastøtte is five people saying what works,
   * each on one of the highest answers to that statement ('high'), so the counted tone
   * comes out as the words read.
   */
  ['g26', 'Drift og vedlikehold', 'mengde', 1, 'lukket', false, null,
    'Vi har fått flere bygg å ta vare på, men ikke flere folk. Det meste blir gjort i en fart.',
    [['leder', 30, 'Du har rett i at bemanningen ikke har fulgt byggene. Vi ser på det i budsjettet for neste år.']]],
  ['g26', 'Renhold', 'mengde', 2, 'venter', false, 2,
    'Rutene er lagt for lange. Vi rekker det bare hvis ingenting går galt, og noe går alltid galt.', []],
  ['g26', 'Kundeservice', 'mengde', 1, 'lukket', false, null,
    'Køen blir aldri tom. Du avslutter en samtale, og den neste venter allerede.',
    [['leder', 26, 'Takk. Vi prøver ut faste pauser mellom samtalene fra oktober.']]],
  ['g26', 'Salg og marked', 'mengde', 3, 'dialog', false, 5,
    'Tilbudene skal ut samme dag som forespørselen kommer. Det holder ikke når vi er to.',
    [['leder', 22, 'Hva ville vært realistisk for deg — to dager?']]],
  ['g26', 'Prosjekt og teknikk', 'mengde', 2, 'lukket', false, null,
    'Fristene settes før noen av oss har sett på jobben.',
    [['leder', 34, 'Fra neste prosjekt er en fra teamet med når fristen settes.']]],
  ['g26', 'Drift og vedlikehold', 'kollega', 1, 'lukket', false, null,
    'Når noe skjærer seg, er det alltid noen på laget som stiller opp. Det er grunnen til at jeg blir.',
    [['leder', 20, 'Takk — det er godt å høre.']], 'high'],
  ['g26', 'Renhold', 'kollega', 2, 'lukket', false, null,
    'Vi hjelper hverandre med å bli ferdige. Den som er først ferdig, tar en del av neste rute.',
    [['leder', 24, 'Det er akkurat slik det skal være. Takk for at du sier det.']], 'high'],
  ['g26', 'Kundeservice', 'kollega', 1, 'lukket', false, null,
    'Kollegaene mine er det beste med jobben. Vi snakker ut om de tunge samtalene i pausen.',
    [['leder', 28, 'Takk. Det tar vi vare på.']], 'high'],
  ['g26', 'Prosjekt og teknikk', 'kollega', 3, 'lukket', false, null,
    'Vi deler på det vi kan. Ingen holder på noe for seg selv.',
    [['leder', 30, 'Godt å høre.']], 'high'],
  ['g26', 'Salg og marked', 'kollega', 1, 'lukket', false, null,
    'Godt samhold i teamet, også når tallene går dårlig.',
    [['leder', 18, 'Takk — det merkes.']], 'high'],
]

const INFORMATION = [
  ['g25', 'alle_ansatte', 'allmote', '2025-10-02', 'Resultatene lagt fram på allmøtet, med tiltakene som ble besluttet i AMU.'],
  ['g25', 'amu', 'mote', '2025-09-24', 'Behandlet i AMU sammen med risikovurderingen.'],
  ['g25', 'ledere', 'epost', '2025-09-19', 'Hver leder fikk sine egne tall før allmøtet.'],
  ['g26', 'verneombud', 'mote', '2026-09-15', 'Resultatene gjennomgått med verneombudet før AMU.'],
  ['g26', 'tillitsvalgte', 'mote', '2026-09-15', 'Resultatene gjennomgått med tillitsvalgt.'],
  ['g26', 'amu', 'mote', '2026-09-17', 'Behandlet i AMU sammen med risikovurderingen.'],
  ['g26', 'ledere', 'epost', '2026-09-16', 'Hver leder fikk sine egne tall samme uke som resultatet ble frigitt.'],
]

const TRAININGS = [
  ['Arbeidsmiljøopplæring for ledere (40 timer)', 'ledere', '2025-11-12', '2027-11-01', 'Gjennomført av alle med personalansvar.'],
  ['Grunnopplæring for verneombud', 'verneombud', '2025-02-20', '2027-02-01', 'Kristian Moe, 40 timer.'],
  ['Gjennomgang av varslingsrutinen', 'alle_ansatte', '2026-04-14', '2027-04-01', 'Gjennomgått i alle team, også på kveldsskift.'],
  ['Håndtering av vanskelige kundesamtaler', 'alle_ansatte', '2026-05-06', '2027-05-01', 'Kundeservice, med BHT.'],
]

const ORG_QUESTIONS = [
  'Har du det utstyret du trenger for å gjøre jobben din på en trygg måte?',
  'Vet du hvem du skal kontakte hvis du blir skadet eller føler deg utrygg på jobb?',
]

/**
 * Every figure a note above quotes, and what it must be. The answers are drawn around a
 * target rather than set, so a note written against one version of this file can be made
 * false by an edit to STORY or OFFSET — and a measure that says "steg fra 54 til 58" over a
 * result that says 53 is exactly the invented-value fault the product exists to avoid.
 * The seed checks each claim against the answers it just wrote and refuses to commit if one
 * is off. [round, department or null for the whole undertaking, factor, index]
 */
const CLAIMS = [
  ['g24', 'Drift og vedlikehold', 'mengde', 34], ['g25', 'Drift og vedlikehold', 'mengde', 44],
  ['g24', null, 'ytring', 46], ['p25a', null, 'ytring', 48], ['g25', null, 'ytring', 52],
  ['g24', 'Drift og vedlikehold', 'kontakt', 47], ['g25', 'Drift og vedlikehold', 'kontakt', 58],
  ['g26', 'Drift og vedlikehold', 'kontakt', 52],
  ['g24', 'Renhold', 'integritet', 74], ['g25', 'Renhold', 'integritet', 66],
  ['g25', null, 'leder', 56], ['g26', null, 'leder', 63],
  ['g25', 'Prosjekt og teknikk', 'mengde', 35], ['p26a', 'Prosjekt og teknikk', 'mengde', 39],
  ['g24', 'Renhold', 'medvirk', 49], ['g26', 'Renhold', 'medvirk', 53],
  ['g25', 'Kundeservice', 'emosjon', 36], ['g25', null, 'emosjon', 49],
]

const LADDER = [['verneombud', 14], ['tillitsvalgte', 14], ['daglig_leder', 14], ['avdelingsledere', 7], ['alle_ansatte', 1]]

/*
 * ---------------------------------------------------------------------------------------
 * The SQL. Everything above is data; everything below turns it into set-based statements,
 * so the script stays small enough to hand to any SQL runner — the hosted project is seeded
 * through the Supabase MCP, which takes the script as text.
 *
 * Ids are named, not pasted. `pg_temp.did(key)` is the SQL twin of `uid()` above — the
 * same md5, the same version and variant nibbles, so both sides agree on every id — and it
 * lives for the session only. Response ids are the one exception: they are
 * md5('demo.response.<round>.<department>.<n>'), never read by any client, and the answer
 * draw is keyed on them, which is what keeps CLAIMS true run after run.
 * ---------------------------------------------------------------------------------------
 */
const did = (key) => `pg_temp.did(${q(key)})`
const org = `'${DEMO_ORG}'::uuid`

const ROUND_VALUES = ROUNDS.map((r) =>
  `(${q(r.key)}, '${r.kind}', ${r.year}, ${q(r.label)}, ${r.open ? 'true' : 'false'}, ${
    r.open ? "date_trunc('day', now()) - interval '2 days'" : `timestamptz '${r.opens}'`}, ${
    r.open ? "date_trunc('day', now()) + interval '5 days'" : `timestamptz '${r.closes}'`})`).join(',\n  ')

/** [round, department index, invited, answered] — who was asked and how many answered. */
const COHORT_VALUES = ROUNDS.flatMap((r) =>
  GROUPS.map((g, gi) => `(${q(r.key)},${gi},${g[r.col]},${r.answered[gi]})`)).join(',')

/** Each department's target per factor per round; computed here so the draw is fixed. */
const TARGET_VALUES = ROUNDS.flatMap((r) =>
  GROUPS.flatMap(([group], gi) =>
    factorsOf(r).map((f) => {
      const t = Math.max(8, Math.min(95, target(f, r.key) + (OFFSET[group][f] ?? 0)))
      return `(${q(r.key)},${gi},'${f}',${t.toFixed(1)})`
    }))).join(',')

const dateSql = (v) =>
  v === null ? 'null' : v.startsWith('today-') ? `current_date - ${Number(v.slice(6))}` : `date '${v}'`

const u = (salt) =>
  `(('x' || substr(md5(re.id::text || t.factor_key || o.ordinal::text || '${salt}'), 1, 8))::bit(32)::bigint / 4294967296.0)`

const sql = `-- generated by scripts/seed/demo-org.mjs — do not edit by hand
begin;

create function pg_temp.did(text) returns uuid language sql immutable as
$f$ select overlay(overlay(md5('orgpuls-demo:' || $1) placing '4' from 13) placing '8' from 17)::uuid $f$;

create temp table demo_round (key text primary key, kind app.measurement_kind, year int, label text,
  open boolean, opens timestamptz, closes timestamptz) on commit drop;
insert into demo_round values
  ${ROUND_VALUES};
create temp table demo_group (gi int primary key, name text) on commit drop;
insert into demo_group values ${GROUPS.map(([g], gi) => `(${gi},${q(g)})`).join(',')};
create temp table demo_cohort (rk text, gi int, invited int, answered int) on commit drop;
insert into demo_cohort values ${COHORT_VALUES};

-- a rerun starts from nothing but the organisation row. The deletes are scoped to this one
-- organisation and cascade through its rounds, responses and answers, as the fixture's do;
-- the answer tables' triggers permit a delete once the parent is gone.
delete from app.trainings        where org_id = ${org};
delete from app.locations        where org_id = ${org};
delete from app.comment_threads  where org_id = ${org};
delete from app.risk_assessments where org_id = ${org};
delete from app.measures         where org_id = ${org};
delete from app.org_questions    where org_id = ${org};
delete from app.measurements     where org_id = ${org};
delete from app.employees        where org_id = ${org};
delete from app.groups           where org_id = ${org};

insert into app.organizations (
  id, name, org_number, employee_count, threshold, law_mode, bht_name,
  registry_fetched_at, registry_form_code, registry_form_label,
  registry_nace_code, registry_nace_label, registry_registered_on,
  registry_address, registry_municipality, registry_municipality_no,
  registry_employees, registry_vat)
values (${org}, 'Demobedriften AS', '990000001', ${HEADCOUNT_2026}, 5, true, 'Demo Bedriftshelse AS',
  '2026-01-12 09:00:00+01', 'AS', 'Aksjeselskap',
  '81.100', 'Kombinerte tjenester tilknyttet eiendomsdrift', date '2009-05-04',
  'Demoveien 1, 5003 Bergen', 'Bergen', '4601', ${HEADCOUNT_2026}, true)
on conflict (id) do update set
  name = excluded.name, org_number = excluded.org_number,
  employee_count = excluded.employee_count, threshold = excluded.threshold,
  law_mode = excluded.law_mode, bht_name = excluded.bht_name,
  registry_fetched_at = excluded.registry_fetched_at,
  registry_form_code = excluded.registry_form_code, registry_form_label = excluded.registry_form_label,
  registry_nace_code = excluded.registry_nace_code, registry_nace_label = excluded.registry_nace_label,
  registry_registered_on = excluded.registry_registered_on, registry_address = excluded.registry_address,
  registry_municipality = excluded.registry_municipality,
  registry_municipality_no = excluded.registry_municipality_no,
  registry_employees = excluded.registry_employees, registry_vat = excluded.registry_vat;

-- the demo login, when it exists: a profile and a daglig leder membership, nothing else
insert into app.profiles (id, full_name)
select u.id, 'Demobruker' from auth.users u where u.email = '${LOGIN_EMAIL}'
on conflict (id) do nothing;
insert into app.memberships (org_id, user_id, role, active)
select ${org}, u.id, 'daglig_leder', true from auth.users u where u.email = '${LOGIN_EMAIL}'
on conflict (org_id, user_id) do update set role = excluded.role, active = true;

-- everybody with the demo credentials signs in as this one daglig leder: nobody may invite
-- a second one and use it to lock the others out (0029)
insert into app.member_locks (org_id) values (${org}) on conflict do nothing;
delete from app.member_invites where org_id = ${org};

insert into app.locations (org_id, name, address, headcount, sort_order) values
  (${org}, 'Hovedkontor Bergen', 'Demoveien 1, 5003 Bergen', 21, 1),
  (${org}, 'Driftsbase Åsane', 'Eksempelvegen 12, 5116 Ulset', 27, 2),
  (${org}, 'Avdeling Stavanger', 'Prøvegata 3, 4006 Stavanger', 16, 3);

insert into app.year_wheels (org_id, active, cadence, baseline_month, notify_lead_days,
                             skip_fellesferie, extend_if_low, notify_vo_on_overdue)
values (${org}, true, 'kvartalspuls', 9, 14, true, true, true)
on conflict (org_id) do update set
  active = excluded.active, cadence = excluded.cadence, baseline_month = excluded.baseline_month,
  notify_lead_days = excluded.notify_lead_days, skip_fellesferie = excluded.skip_fellesferie,
  extend_if_low = excluded.extend_if_low, notify_vo_on_overdue = excluded.notify_vo_on_overdue;
delete from app.wheel_notifications where wheel_id = (select id from app.year_wheels where org_id = ${org});
insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order)
select (select id from app.year_wheels where org_id = ${org}), l.a::app.notify_audience, l.d, l.o
from (values ${LADDER.map(([a, d], i) => `('${a}',${d},${i + 1})`).join(',')}) as l(a, d, o);

insert into app.groups (id, org_id, name, sort_order)
select pg_temp.did('group:' || name), ${org}, name, gi + 1 from demo_group;

-- created_at carries the hiring order within a department, which is what decides who was
-- employed, and so invited, in an earlier year
insert into app.employees (id, org_id, group_id, full_name, email, duty_role, created_at)
select pg_temp.did('employee:' || e.name), ${org}, pg_temp.did('group:' || g.name), e.name, e.email,
       e.duty::app.duty_role, timestamptz '2020-01-01' + e.rank * interval '1 day'
from (values
  ${EMPLOYEES.map((e) => `(${q(e.name)},${GROUPS.findIndex(([g]) => g === e.group)},${e.rank},${q(emailOf(e.name))},${q(DUTIES[e.name] ?? null)})`).join(',\n  ')}
) as e(name, gi, rank, email, duty)
join demo_group g on g.gi = e.gi;

insert into app.org_questions (id, org_id, body, created_at) values
${ORG_QUESTIONS.map((b, i) => `  (${did(`orgq:${i}`)}, ${org}, ${q(b)}, timestamptz '2026-08-20 10:00+02' + interval '${i} minutes')`).join(',\n')};

insert into app.measurements (id, org_id, kind, year, label)
select pg_temp.did('measurement:' || key), ${org}, kind, year, label from demo_round;

insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at, frozen_at,
                        reminder_day, close_after_days, comment_policy, allow_dialogue)
select pg_temp.did('round:' || key), ${org}, pg_temp.did('measurement:' || key),
       (case when open then 'apen' else 'lukket' end)::app.round_status, opens, closes,
       case when open then null else closes end, 3,
       case when kind = 'grunnlinje' then 10 else 7 end, 'lave', true
from demo_round;

insert into app.round_factors (org_id, round_id, factor_key)
select ${org}, pg_temp.did('round:' || d.key), f.key
from demo_round d cross join app.factors f where d.kind = 'grunnlinje';
insert into app.round_factors (org_id, round_id, factor_key)
select ${org}, pg_temp.did('round:' || rk), fk from (values
  ${ROUNDS.filter((r) => r.factors).flatMap((r) => r.factors.map((f) => `(${q(r.key)},'${f}')`)).join(',')}
) as x(rk, fk);

insert into app.round_extra_questions (org_id, round_id, extra_key)
select ${org}, pg_temp.did('round:' || d.key), x.key
from demo_round d cross join app.extra_questions x where d.kind = 'grunnlinje';

insert into app.round_org_questions (round_id, question_id)
select pg_temp.did('round:g26'), pg_temp.did('orgq:' || i) from generate_series(0, ${ORG_QUESTIONS.length - 1}) i;

insert into app.round_consultations (round_id, kind, confirmed, held_on, counterpart)
select pg_temp.did('round:' || rk), k::app.consultation_kind, true, held, who from (values
  ('g24', 'verneombud_raad', null::date, null), ('g24', 'droftet_tillitsvalgte', date '2024-08-15', 'Agnieszka Kowalska, tillitsvalgt NTL'),
  ('g25', 'verneombud_raad', null, null), ('g25', 'droftet_tillitsvalgte', date '2025-08-14', 'Agnieszka Kowalska, tillitsvalgt NTL'),
  ('g26', 'verneombud_raad', null, null), ('g26', 'droftet_tillitsvalgte', date '2026-08-13', 'Agnieszka Kowalska, tillitsvalgt NTL')
) as x(rk, k, held, who);

-- the first \`invited\` of each department in hiring order were asked, and the first
-- \`answered\` of those are marked as having answered: a count, never a link to a response
insert into app.invitations (org_id, round_id, employee_id, token_hash, sent_at, expires_at, responded_at)
select ${org}, pg_temp.did('round:' || d.key), e.id,
       sha256(convert_to('demo.' || pg_temp.did('round:' || d.key) || '.' || e.id, 'utf8')),
       d.opens, d.closes,
       case when e.rank <= c.answered then
         case when d.open then date_trunc('hour', now()) - (1 + (e.rank - 1) % 30) * interval '1 hour'
              else d.closes - (1 + (e.rank - 1) % 6) * interval '1 day' end end
from demo_cohort c
join demo_round d on d.key = c.rk
join demo_group g on g.gi = c.gi
join lateral (
  select em.id, row_number() over (order by em.created_at) as rank
  from app.employees em where em.group_id = pg_temp.did('group:' || g.name)
) e on e.rank <= c.invited;

-- responses carry a department and an hour and nothing else; inserted by count
insert into app.responses (id, org_id, round_id, group_id, submitted_hour)
select md5('demo.response.' || d.key || '.' || c.gi || '.' || i)::uuid, ${org},
       pg_temp.did('round:' || d.key), pg_temp.did('group:' || g.name),
       case when d.open then date_trunc('hour', now()) - (1 + (i * 7) % 40) * interval '1 hour'
            else date_trunc('hour', d.closes - (1 + (i * 13) % 200) * interval '1 hour') end
from demo_cohort c
join demo_round d on d.key = c.rk
join demo_group g on g.gi = c.gi
cross join lateral generate_series(0, c.answered - 1) as i;

-- answers, drawn around each department's target: a hash of the response, the factor and
-- the statement gives three uniforms, summed into a bell with sd ≈ 0.85 on the 1–5 scale,
-- and a statement-level offset keeps a factor's three statements from reading as copies
insert into app.answers (response_id, factor_key, ordinal, value)
select re.id, t.factor_key, o.ordinal,
       greatest(1, least(5, round(
         1 + (t.target + case o.ordinal when 2 then -3 when 3 then 3 else 0 end) / 25.0
           + 1.7 * (${u('a')} + ${u('b')} + ${u('c')} - 1.5))))::int
from (values ${TARGET_VALUES}) as t(rk, gi, factor_key, target)
join demo_group g on g.gi = t.gi
join app.responses re on re.round_id = pg_temp.did('round:' || t.rk)
                     and re.group_id = pg_temp.did('group:' || g.name)
cross join (values (1), (2), (3)) as o(ordinal);

-- screening: counts per option, assigned by count to responses in id order — responses
-- carry no person, so which response holds which answer is arbitrary by construction
with s(rk, extra, counts) as (values
  ${Object.entries(SCREENING).flatMap(([k, qs]) => Object.entries(qs).map(([x, c]) => `(${q(k)}, ${q(x)}, array[${c.join(',')}])`)).join(',\n  ')}),
numbered as (
  select s.extra, s.counts, re.id, row_number() over (partition by s.rk, s.extra order by re.id) as n
  from s join app.responses re on re.round_id = pg_temp.did('round:' || s.rk))
insert into app.extra_answers (response_id, extra_key, option_ordinal)
select id, extra,
       (select min(k) from generate_subscripts(counts, 1) k
         where n <= (select sum(v) from unnest(counts[1:k]) v))
from numbered
where n <= (select sum(v) from unnest(counts) v);

insert into app.measures (id, org_id, factor_key, round_id, owner_employee_id, title, goal, due_date,
                          completed_on, step, kind, created_at, effect_round_id, effect_note)
select pg_temp.did('measure:' || m.key), ${org}, m.factor, pg_temp.did('round:' || m.rk),
       pg_temp.did('employee:' || m.owner), m.title, m.goal, m.due, m.done,
       m.step::app.measure_step, m.kind::app.measure_kind,
       d.closes + (4 + m.n) * interval '1 day',
       case when m.eff is not null then pg_temp.did('round:' || m.eff) end, m.note
from (values
${MEASURES.map(([key, factor, from, owner, title, goal, due, done, step, kind, , eff, effNote], i) =>
  `  (${q(key)}, ${i}, '${factor}', '${from}', ${q(owner)}, ${q(title)}, ${q(goal)}, ${dateSql(due)}, ${dateSql(done)}, '${step}', '${kind}', ${q(eff)}, ${q(effNote)})`).join(',\n')}
) as m(key, n, factor, rk, owner, title, goal, due, done, step, kind, eff, note)
join demo_round d on d.key = m.rk;

insert into app.measure_groups (measure_id, group_id)
select pg_temp.did('measure:' || mk), pg_temp.did('group:' || gn) from (values
  ${MEASURES.flatMap(([key, , , , , , , , , , groups]) => groups.map((g) => `(${q(key)}, ${q(g)})`)).join(',\n  ')}
) as x(mk, gn);

insert into app.risk_assessments (id, org_id, round_id, assessed_on, assessed_by_employee_id, summary) values
${RISK.map((r) => `  (${did(`risk:${r.key}`)}, ${org}, ${did(`round:${r.key}`)}, date '${r.on}', ${did(`employee:${r.by}`)}, ${q(r.summary)})`).join(',\n')};
insert into app.risk_factor_assessments (assessment_id, factor_key, probability, consequence, conclusion, assessment)
select pg_temp.did('risk:' || rk), f, p::app.risk_probability, c::app.risk_consequence, concl::app.risk_conclusion, txt
from (values
${RISK.flatMap((r) => r.factors.map(([f, p, c, concl, text]) => `  (${q(r.key)}, '${f}', '${p}', '${c}', '${concl}', ${q(text)})`)).join(',\n')}
) as x(rk, f, p, c, concl, txt);

-- conversations: each on the response in that department and round with the lowest answer
-- on the statement, because the screen prints the answer beside the comment
create temp table demo_thread on commit drop as
select t.*, pick.response_id
from (values
${CONVERSATIONS.map(([key, group, factor, ordinal, state, flagged, age, opening, , pick], i) => {
  // the how-many-th comment on this statement in this department: each takes the next response
  const nth = CONVERSATIONS.slice(0, i).filter(([k, g, f, o]) => k === key && g === group && f === factor && o === ordinal).length
  return `  (${i}, ${q(key)}, ${q(group)}, '${factor}', ${ordinal}, '${state}', ${flagged}, ${age ?? 'null'}::int, ${q(opening)}, ${pick === 'high'}, ${nth})`
}).join(',\n')}
) as t(i, rk, grp, factor, ordinal, state, flagged, age, opening, high, nth)
cross join lateral (
  select re.id as response_id from app.responses re
  join app.answers a on a.response_id = re.id and a.factor_key = t.factor and a.ordinal = t.ordinal
  where re.round_id = pg_temp.did('round:' || t.rk) and re.group_id = pg_temp.did('group:' || t.grp)
  order by case when t.high then -a.value else a.value end, re.id
  offset t.nth limit 1) pick;

-- a comment whose department has no response to hang it on would vanish from the lateral
-- join without a word; say so instead
do $$
begin
  if (select count(*) from demo_thread) <> ${CONVERSATIONS.length} then
    raise exception 'demo: % of ${CONVERSATIONS.length} conversations found a response', (select count(*) from demo_thread);
  end if;
end $$;

insert into app.response_comments (response_id, factor_key, ordinal, body)
select response_id, factor, ordinal, opening from demo_thread;

insert into app.comment_threads (id, org_id, response_id, factor_key, ordinal, key_hash, state, flagged_varsel, opened_hour)
select pg_temp.did('thread:' || t.i), ${org}, t.response_id, t.factor, t.ordinal,
       extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'),
       t.state::app.thread_state, t.flagged,
       case when t.age is null then date_trunc('hour', d.closes - (2 + t.i % 4) * interval '1 day')
            else date_trunc('hour', now() - t.age * interval '1 day') end
from demo_thread t join demo_round d on d.key = t.rk;

insert into app.thread_messages (thread_id, author, body, sent_hour)
select ct.id, m.author::app.message_author, m.body, ct.opened_hour + m.hours * interval '1 hour'
from (values
${CONVERSATIONS.flatMap(([, , , , , , , , messages], i) => messages.map(([a, h, b]) => `  (${i}, '${a}', ${h}, ${q(b)})`)).join(',\n')}
) as m(i, author, hours, body)
join app.comment_threads ct on ct.id = pg_temp.did('thread:' || m.i);

insert into app.round_information (org_id, round_id, audience, channel, held_on, note)
select ${org}, pg_temp.did('round:' || rk), a::app.information_audience, c::app.information_channel, d::date, n
from (values
${INFORMATION.map(([key, aud, chan, on, note]) => `  (${q(key)}, '${aud}', '${chan}', '${on}', ${q(note)})`).join(',\n')}
) as x(rk, a, c, d, n);

insert into app.trainings (org_id, title, audience, held_on, next_due, note)
select ${org}, t, a::app.information_audience, h::date, d::date, n from (values
${TRAININGS.map(([title, aud, on, due, note]) => `  (${q(title)}, '${aud}', '${on}', '${due}', ${q(note)})`).join(',\n')}
) as x(t, a, h, d, n);

-- every figure a note quotes, checked against the answers just written
do $$
declare v_bad text;
begin
  select string_agg(format('%s %s %s: stated %s, computed %s', c.rk, coalesce(c.grp, 'alle'),
                           c.factor, c.stated, x.idx), '; ')
  into v_bad
  from (values
    ${CLAIMS.map(([k, g, f, v]) => `(${q(k)}, ${q(g)}, '${f}', ${v})`).join(',\n    ')}
  ) as c(rk, grp, factor, stated)
  cross join lateral (
    select round(avg((a.value - 1) * 25))::int as idx
    from app.answers a
    join app.responses re on re.id = a.response_id
    join app.groups g on g.id = re.group_id
    where re.round_id = pg_temp.did('round:' || c.rk) and a.factor_key = c.factor
      and (c.grp is null or g.name = c.grp)) x
  where x.idx is distinct from c.stated;
  if v_bad is not null then
    raise exception 'a note in demo-org.mjs quotes a figure the data does not have: %', v_bad;
  end if;
end $$;

commit;

select m.label,
  (select count(*) from app.invitations i where i.round_id = r.id) as invited,
  (select count(*) from app.responses re where re.round_id = r.id) as responses,
  (select count(*) from app.answers a join app.responses re on re.id = a.response_id where re.round_id = r.id) as answers
from app.rounds r join app.measurements m on m.id = r.measurement_id
where r.org_id = '${DEMO_ORG}' order by r.opens_at;`

console.log(sql)
