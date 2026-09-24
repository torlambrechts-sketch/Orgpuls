/**
 * Generates the seed that reproduces the design's own scenario as real rows.
 *
 * The Innsikt screen prints ARBEIDSMILJØINDEKS 61, "−3 siden i fjor", and
 * "5 forsvarlig · 4 følges opp · 2 høy risiko". The Målinger screen prints
 * "28 av 34 svarte · 82 %" for 2026 and "24 av 31 svarte · 77 %" for 2025. Those
 * numbers must come out of the database, not out of a component — the rule is that a
 * value which does not exist in the schema is never rendered as though it does. So the
 * fixture is built backwards from the design: choose answer distributions whose computed
 * indices are exactly the eleven the statutory report prints, and let the RPCs derive
 * the rest.
 *
 * Index = (v-1)*25 over `slots` answer slots per factor, so a target T needs
 * sum(v-1) = round(T*slots/25); splitting that sum across two adjacent scale points hits
 * every target exactly. `slots` differs per year because the cohorts differ, so the split
 * is computed per year rather than shared — see COHORTS.
 *
 * This file is the whole fixture. If a row is not emitted here it does not survive a
 * reset, so nothing may be created "just this once" against the live database.
 */

/** [key, index in 2026, index in 2025] — the eleven the statutory report prints. */
const FACTORS = [
  ['ytring', 41, 48], ['mengde', 44, 53], ['motstrid', 52, 58], ['kontakt', 57, 57],
  ['emosjon', 58, 59], ['leder', 64, 69], ['medvirk', 66, 63], ['integritet', 69, 70],
  ['rolle', 71, 73], ['kollega', 76, 75], ['mening', 78, 74],
]

/**
 * [group, headcount, respondents] per year.
 *
 * 2026 is read from the bundle's partData() (line 2738): 12+9+8+5 = 34 employees and
 * 8+9+8+3 = 28 respondents, the "28 av 34 — 82 %" the report states. Administrasjon has
 * 5 employees of whom 3 answered; both numbers matter and they are different things. The
 * Deltakelse card marks a group whose HEADCOUNT is below threshold with "under terskel —
 * vises bare som deltakelse, aldri som resultat", while results are withheld on
 * RESPONDENT count. Conflating them would mask the wrong groups.
 *
 * 2025 is constrained by the rounds list, which prints "24 av 31 svarte · 77 %". The
 * design states the two totals and not the split, so the split below is the fixture's
 * own: the organisation grew by three over the year, taken off Drift, Prosjekt and
 * Verksted. Nothing in the product reads it except the 2025 Deltakelse breakdown, which
 * the design does not show.
 *
 * The employee roster is the CURRENT one (2026 headcounts). 2025 invited the first
 * `headcount` employees of each group, because the other three had not been hired.
 */
const COHORTS = {
  2026: [['Drift', 12, 8], ['Prosjekt', 9, 9], ['Verksted', 8, 8], ['Administrasjon', 5, 3]],
  2025: [['Drift', 11, 8], ['Prosjekt', 8, 7], ['Verksted', 7, 6], ['Administrasjon', 5, 3]],
}

/**
 * Fixed timestamps, not now()-interval.
 *
 * The rounds list prints the closing date — "lukket 14. september" — so a fixture
 * anchored to the clock renders a different string tomorrow and the pixel baseline
 * rots overnight. The dates are the design's own (bundle line 4249 and 4263): the
 * 2026 grunnlinje closed 14 September and the 2025 one 11 September 2025.
 *
 * Europe/Oslo is UTC+2 in September, so 21:00Z is 23:00 local on the stated day and
 * the date is the same whichever zone renders it.
 */
const DATES = {
  2025: { opens: '2025-08-21 07:00:00+02', closes: '2025-09-11 21:00:00+02' },
  2026: { opens: '2026-09-07 07:00:00+02', closes: '2026-09-14 21:00:00+02' },
}

const ORG = '00000000-0000-4000-8000-000000000001'
const ROUND = { 2025: '00000000-0000-4000-8000-000000000012', 2026: '00000000-0000-4000-8000-000000000002' }
const MEAS = { 2025: '00000000-0000-4000-8000-000000000013', 2026: '00000000-0000-4000-8000-000000000003' }
const RISK_ID = '00000000-0000-4000-8000-000000000004'

/**
 * The running puls.
 *
 * Nothing could exercise the respondent flow without it: rpc.submit_response refuses
 * any round whose status is not 'apen', so with only the two closed grunnlinjer the
 * one write path in the product was unreachable outside a hand-made row.
 *
 * Its dates are the one thing in this fixture that cannot be pinned. A round is open
 * because now() falls inside it, so the window is anchored to the current day: opened
 * two days ago, closes in five, which keeps the design's "Dag 3 av 7" framing true on
 * any day the fixture is regenerated. The consequence is that this round's row in the
 * Målinger list carries a date that moves, so that row alone is excluded from the pixel
 * claims -- see docs/DEVIATIONS.md D-08.
 *
 * It asks about the two factors the design's first puls names, "ytringsklima og
 * arbeidsmengde", and carries no extra questions: a puls is the short one.
 */
const PULS = {
  meas: '00000000-0000-4000-8000-000000000023',
  round: '00000000-0000-4000-8000-000000000022',
  factors: ['ytring', 'mengde'],
}

/**
 * The four people the design names, one per group.
 *
 * The roster is otherwise anonymous — "Drift 1" … "Drift 12" — because a headcount is
 * all the figures need. Tiltak needs more: a measure has an owner, the card prints their
 * name, and the statutory report's section 5 prints it again. So the first employee of
 * each group is the person the design's own roster puts there (bundle line 2723), and
 * the rest stay numbered. Headcount is unchanged, which is what every response rate
 * divides by.
 *
 * Addresses stay on `.example`, a reserved TLD: a fixture must not carry something that
 * could be mistaken for a real mailbox.
 */
const NAMED = {
  Drift: ['Kari Nordbø', 'kari@nordvik.example'],
  Prosjekt: ['Tomas Vik', 'tomas@nordvik.example'],
  Verksted: ['Anne Rygg', 'anne@nordvik.example'],
  Administrasjon: ['Tuva Berg', 'tuva@nordvik.example'],
}

/**
 * Who holds a statutory position.
 *
 * `duty_role` is not access — access is `app.memberships.role`, and writing a duty grants
 * nobody a single row (0021). It is what the act names: the verneombud § 6-2 requires be
 * involved before a kartlegging, and the tillitsvalgt § 9-2 requires the drøfting with.
 * The design's Selskap tab prints "Kari Nordbø er registrert som verneombud", and this is
 * the row that makes that sentence true rather than decorative.
 *
 * `tillitsvalgt` is deliberately on a person the roster already has. The § 9-2 record on
 * the 2026 grunnlinje names "Kari Sund, tillitsvalgt Fellesforbundet", who is a
 * counterpart from outside this organisation and therefore has no employee row — which is
 * exactly why `round_consultations.counterpart` is free text and not a foreign key.
 */
const DUTIES = {
  'Kari Nordbø': 'verneombud',
  'Anne Rygg': 'avdelingsleder',
  'Tomas Vik': 'avdelingsleder',
  'Tuva Berg': 'daglig_leder',
}

/**
 * Where the work happens. The design's own three sites (bundle 3338), and its own point:
 * "Arbeidsmiljøet er sjelden likt på kontoret og ute på anlegg."
 *
 * The headcounts sum to 34, which is what makes the screen's reconciliation line read
 * "Til sammen 34 ansatte — det stemmer med registeret" rather than its warning form. A
 * location's headcount is a number the organisation states about a place; it is not
 * derived from anybody's row and nothing joins a response to it.
 */
const LOCATIONS = [
  ['Hovedkontor', 'Industriveien 14, 3229 Sandefjord', 12],
  ['Anlegg Larvik', 'Elveveien 8, 3262 Larvik', 14],
  ['Verksted Stokke', 'Bekkeveien 2, 3160 Stokke', 8],
]

/**
 * The Enhetsregisteret snapshot, as the design prints it (bundle 3362).
 *
 * Stored rather than fetched on render: a page that called Brønnøysund on every load would
 * depend on somebody else's uptime and would send this organisation's number out on every
 * tab switch. `registry_fetched_at` is what the screen prints, so a stale row reads stale.
 * The date here is the design's own "Hentet fra Enhetsregisteret 14. februar".
 *
 * These are the facts a real lookup returns for a real company. Nordvik Anlegg AS is not
 * one — 924118742 is the design's number, and a fixture must not carry a real
 * organisation's registry record.
 */
const REGISTRY = {
  fetched: '2026-02-14 09:00:00+01',
  form: ['AS', 'Aksjeselskap'],
  nace: ['42.110', 'Bygging av veier og motorveier'],
  registeredOn: '2011-03-14',
  address: 'Industriveien 14, 3229 Sandefjord',
  municipality: ['Sandefjord', '3804'],
  vat: true,
}

const BHT = 'Vestfold Bedriftshelse AS'

/**
 * The screening answers, and the two sentences section 7 of the report prints.
 *
 * The design states the figures exactly: "Tre av 28 svarte ja på spørsmålet om krenkende
 * atferd" and "Ingen svarte ja på spørsmålet om vold og trusler". The split between
 * "opplevd selv" and "sett andre" is the fixture's own, because the design gives only the
 * total — and the total is the only thing the report prints, which is the point of the
 * question's own rule: counts for the whole undertaking, never per group.
 *
 * `vil ikke svare` is seeded deliberately. It is an option a respondent can choose, and a
 * fixture in which nobody ever chooses it would make "tre av 28" mean something slightly
 * different from what it says.
 */
const SCREENING = {
  2026: { krenkende: [24, 2, 1, 1], vold: [27, 0, 0, 1] },
  2025: { krenkende: [22, 1, 0, 1], vold: [24, 0, 0, 0] },
}

/**
 * Informasjon og opplæring — section 8, as the design describes it in prose.
 *
 * Both tables exist so the section can print a record rather than a paragraph somebody
 * wrote. `held_on` on the information rows is the design's own 20 September; the AMU
 * briefing a week earlier is its "en uke før AMU".
 */
const INFORMATION = [
  ['alle_ansatte', 'allmote', '2026-09-20', 'Oppsummering av funnene lagt fram på allmøte.'],
  ['alle_ansatte', 'skriftlig', '2026-09-20', 'Samme oppsummering skriftlig i personalhåndboka.'],
  ['verneombud', 'mote', '2026-09-13', 'Saksframlegget delt en uke før AMU.'],
  ['tillitsvalgte', 'mote', '2026-09-13', 'Saksframlegget delt en uke før AMU.'],
  ['ledere', 'epost', '2026-09-15', 'Hver leder fikk sine egne tall samme uke som resultatet ble frigitt.'],
]

/**
 * Årshjulet's own row, and the notification ladder under it.
 *
 * This was the one part of the scenario that had never been emitted here. The wheel was
 * switched on by hand against the hosted project while the screen was being built, which
 * is exactly the thing this file exists to stop: a row created ad hoc does not survive a
 * reset, and CI rebuilds from migrations every run. `app.wheel_tick()` iterates
 * `app.year_wheels where active`, so a database without this row has a scheduler that
 * finds nothing to do — and `wheel_invariants.sql` failed four assertions saying so the
 * first time CI got far enough to run it.
 *
 * The settings are the ones the Årshjulet screen shows: baseline in September, a pulse
 * each quarter, fourteen days' notice, the fellesferie skipped, and a round extended
 * rather than closed when too few have answered.
 *
 * **The ladder's order is the law, not a preference.** § 6-2 requires the verneombud to
 * be involved before the kartlegging starts, so they and the tillitsvalgte are told
 * first, at fourteen days; the sort order and the lead times are what make that true of
 * the rows rather than of a rule written in the scheduler.
 */
const WHEEL = {
  cadence: 'kvartalspuls',
  baselineMonth: 9,
  leadDays: 14,
  skipFellesferie: true,
  extendIfLow: true,
  notifyVoOnOverdue: true,
}

const LADDER = [
  ['verneombud', 14],
  ['tillitsvalgte', 14],
  ['daglig_leder', 14],
  ['avdelingsledere', 7],
  ['alle_ansatte', 1],
]

const TRAININGS = [
  ['Oppfølging av psykososiale forhold', 'ledere', '2026-03-10', '2027-02-01',
   'Kurs for ledere med personalansvar.'],
  ['Gjennomgang av varslingsrutinen', 'alle_ansatte', '2026-04-14', '2027-02-01',
   'Gjennomgått i alle team.'],
]

const sum = (rows, i) => rows.reduce((a, r) => a + r[i], 0)
const ROSTER = COHORTS[2026]
const EMPLOYEES = sum(ROSTER, 1)

/**
 * Employees are named "Drift 1" … "Drift 12", so lexical order puts 10 before 2.
 * Ordering by length first restores the numeric order, which is what makes "the first
 * eleven of Drift" mean the same thing on every run.
 */
const SENIORITY = 'order by length(e.full_name), e.full_name'

/** The two-adjacent-points split that lands a factor exactly on its target index. */
const cfg = (year) => {
  const slots = sum(COHORTS[year], 2) * 3
  return FACTORS.map(([key, y26, y25]) => {
    const S = Math.round(((year === 2026 ? y26 : y25) * slots) / 25)
    const q = Math.floor(S / slots), r = S % slots
    return `('${key}',${r},${q + 2},${q + 1})`
  }).join(',')
}

/**
 * Invitations exist so the Deltakelse card can count who was asked and who answered.
 * They carry no plaintext token: the hash is derived from the round and employee ids, so
 * a test that needs a redeemable token computes it the same way —
 *   token = 'fixture.' || round_id || '.' || employee_id
 * — rather than a secret being stored here. Nothing in the fixture is a real credential.
 */

/**
 * The measures, from the design's own TASKS list (bundle line 2596).
 *
 * Seven of them, and the numbers on the Tiltak screen fall out of them rather than being
 * stated anywhere: "Åpne · 4" is the four not yet closed, "Over frist · 1" is the one
 * whose deadline has passed while it is still running, "Venter effekt · 1" is the one
 * carried out but not yet re-measured, "Lukket · 3" the rest.
 *
 * Two fields are not the factor's: `law_ref`, because a measure that exists because
 * somebody blew the whistle is documented under aml. kap. 2A even when its factor cites
 * § 4-3; and `completed_on`, because "Gjennomført 5. september" is a different fact from
 * the deadline it was measured against.
 *
 * Every measure carries its own citation, including the ones that happen to match their
 * factor's. The design states a law per task, and a measure documented under a narrower
 * provision than its factor is the normal case rather than the exception — leaving it
 * null where it agrees today would make the row change meaning if the factor's citation
 * were ever widened.
 *
 * The first measure's deadline is `current_date - 1`, not a fixed date. It is the one
 * the design shows as overdue — "Frist gikk ut i går" — and a fixed date would make that
 * sentence false tomorrow. Same reasoning as the open puls, docs/DEVIATIONS.md D-08.
 */
const MEASURES = [
  ['ytring', 2026, 'Anne Rygg', 'Fast svar på avviksmeldinger innen fem dager',
    'Verksted meldte fire avvik i vår uten å få svar. Tiltaket er å gi hver melding et navngitt svar innen fem virkedager.',
    'yesterday', null, 'pagar', 'kollektivt', 'aml. § 4-3', ['Verksted']],
  ['mengde', 2026, 'Tomas Vik', 'Prioriteringsmøte hver mandag på Prosjekt',
    'Tre parallelle prosjekter uten uttalt rekkefølge. Møtet skal ende med én skriftlig prioritert liste.',
    '2026-10-15', null, 'pagar', 'kollektivt', 'forskrift kap. 1A', ['Prosjekt']],
  ['ytring', 2026, 'Tuva Berg', 'Varslingsrutinen gjennomgått i alle team',
    'Effekten måles i pulsen 12. oktober. Tiltaket kan lukkes når ytringsklima er målt på nytt.',
    null, '2026-09-05', 'effekt_malt', 'kollektivt', 'aml. kap. 2A', []],
  ['leder', 2026, 'Anne Rygg', 'Fadderordning for nyansatte første åtte uker',
    'Lederstøtte falt mest blant de som har vært her under et år. Fadderen er kollega, ikke leder.',
    '2026-11-01', null, 'besluttet', 'kollektivt', 'forskrift kap. 1A', []],
  ['ytring', 2025, 'Tuva Berg', 'Varslingsrutinen trykket og hengt opp på alle rigger',
    'Ytringsklima gikk fra 39 til 48 i grunnlinjen etterpå. Effekten er dokumentert og tiltaket lukket.',
    null, '2026-02-03', 'lukket', 'kollektivt', 'aml. kap. 2A', [], 2026,
    'Tiltaket vurderes som ikke tilstrekkelig alene, og følges opp med fast svarfrist på avviksmeldinger.'],
  ['mengde', 2025, 'Tomas Vik', 'To innleide ekstra i høysesongen',
    'Arbeidsmengde steg fire poeng, men falt tilbake i 2026. Vurder om tiltaket må gjentas.',
    null, '2026-01-20', 'lukket', 'kollektivt', 'forskrift kap. 1A', [], 2026,
    'Effekten er borte året etter. Det vurderes om tiltaket må gjentas fast hver høysesong.'],
  ['kollega', 2025, 'Anne Rygg', 'Faste fredagsgjennomganger på Verksted',
    'Kollegastøtte er den høyeste faktoren i 2026. Tiltaket regnes som virksomt og videreføres som rutine.',
    null, '2026-05-12', 'lukket', 'kollektivt', 'aml. § 4-3', ['Verksted'], 2026,
    'Tiltaket regnes som virksomt og videreføres som fast rutine.'],
]

/**
 * The design attributes the last one to "Puls 2 · 2025", a round this fixture does not
 * have — it seeds two grunnlinjer and one open puls. It is attached to Grunnlinje 2025
 * instead, so it still hangs off a real measurement rather than a dangling id.
 *
 * `created_at` is set explicitly, an hour apart, because the screen lists measures in
 * the order they were decided and every row of one insert otherwise shares a timestamp
 * to the microsecond — now() is the transaction's clock, so the list would fall back to
 * an arbitrary tiebreak and reorder itself between reseeds.
 *
 * The last field is who the measure affects — the handlingsplan's "Hvem berøres", and
 * what § 3-1 documentation needs to tell a measure aimed at one department from one
 * aimed at the whole undertaking. It is read out of the design's own goal text rather
 * than assigned: "Verksted meldte fire avvik", "hver mandag på Prosjekt", "på Verksted".
 * The four that name no department get no rows, because an empty audience is how the
 * schema says "everyone" — a default of Verksted, which the prototype carries, would be
 * an invented fact about four real-looking measures.
 */
const sqlDate = (v) => (v === 'yesterday' ? "current_date - 1" : v === null ? 'null' : `date '${v}'`)

/**
 * One `extra_answers` row per response, assigned by count.
 *
 * Responses carry a group and an hour and nothing else, so which response gets which
 * screening answer is arbitrary by construction — the rows are numbered and cut at the
 * counts above. That is the same technique `answersFor` uses, and for the same reason:
 * there is no person to assign anything to.
 */
const screeningSql = () => Object.entries(SCREENING).map(([year, qs]) =>
  Object.entries(qs).map(([key, counts]) => `
with numbered as (
  select r.id, row_number() over (order by r.id) as n
  from app.responses r where r.round_id = '${ROUND[year]}')
insert into app.extra_answers (response_id, extra_key, option_ordinal)
select id, '${key}',
  case ${counts.map((c, i) =>
    `when n <= ${counts.slice(0, i + 1).reduce((a, b) => a + b, 0)} then ${i + 1}`).join('\n       ')}
  end
from numbered
where n <= ${counts.reduce((a, b) => a + b, 0)};`).join('\n')).join('\n')

const informationSql = () => `
insert into app.round_information (org_id, round_id, audience, channel, held_on, note) values
${INFORMATION.map(([aud, chan, on, note]) =>
  `  ('${ORG}', '${ROUND[2026]}', '${aud}', '${chan}', date '${on}', ${q(note)})`).join(',\n')};

insert into app.trainings (org_id, title, audience, held_on, next_due, note) values
${TRAININGS.map(([title, aud, on, due, note]) =>
  `  ('${ORG}', ${q(title)}, '${aud}', date '${on}', date '${due}', ${q(note)})`).join(',\n')};`

const measuresSql = () => `
insert into app.measures (org_id, factor_key, round_id, owner_employee_id, title, goal,
                          due_date, completed_on, step, kind, law_ref, created_at,
                          effect_round_id, effect_note)
values
${MEASURES.map(([factor, year, owner, title, goal, due, done, step, kind, law, , effYear, effNote], i) =>
  `  ('${ORG}', '${factor}', '${ROUND[year]}',
   (select e.id from app.employees e where e.org_id = '${ORG}' and e.full_name = '${owner}'),
   '${title.replace(/'/g, "''")}', '${goal.replace(/'/g, "''")}',
   ${sqlDate(due)}, ${sqlDate(done)}, '${step}', '${kind}', ${law ? `'${law}'` : 'null'},
   timestamptz '2026-09-15 09:00+02' + ${i} * interval '1 hour',
   ${effYear ? `'${ROUND[effYear]}'` : 'null'}, ${effNote ? q(effNote) : 'null'})`).join(',\n')};

${MEASURES.flatMap(([, , , title, , , , , , , groups = []]) =>
  groups.map((g) => `insert into app.measure_groups (measure_id, group_id)
select m.id, grp.id from app.measures m
join app.groups grp on grp.org_id = m.org_id and grp.name = '${g}'
where m.org_id = '${ORG}' and m.title = '${title.replace(/'/g, "''")}';`)).join('\n')}`

/**
 * The risk assessment the design says was made on 19 September.
 *
 * Every field is the bundle's own (line 3294): which factors were assessed — the two
 * high-risk ones plus the first of the middles, because the design's section 4 prints
 * three — their probability and consequence, the sentence under each, and the conclusion
 * it ends on. Nothing here is derived from the index. That is the point: the prototype
 * computes all of it from `f.idx` with a hand-written sentence per key, and a computed
 * risk assessment is exactly what D-18 refused to print on a document an inspector
 * reads. Stored, it is a judgement somebody made on a date, which is what § 3-1 bokstav
 * c asks for.
 *
 * The assessor is Tuva Berg, who the design's report front matter names as "Ansvarlig —
 * daglig leder".
 */
const RISK = {
  on: '2026-09-19',
  by: 'Tuva Berg',
  summary:
    'Sannsynlighet for uønsket tilstand vurdert mot konsekvens for helse, sikkerhet og velferd. Faktorene er også vurdert samlet, siden arbeidsmengde og motstridende krav virker sammen.',
  factors: [
    ['ytring', 'hoy', 'alvorlig', 'uforsvarlig_uten_tiltak',
      'Ansatte melder at avvik ikke følges opp. Over tid svekker det både sikkerhetsarbeidet og tilliten, og øker risikoen for at alvorlige forhold ikke kommer fram.'],
    ['mengde', 'hoy', 'alvorlig', 'krever_tiltak',
      'Vedvarende ubalanse mellom oppgaver og tid på Prosjekt. Kombinert med uklare prioriteringer gir det risiko for helseskadelig belastning over tid.'],
    ['motstrid', 'middels', 'moderat', 'krever_tiltak',
      'Motstridende krav forsterker belastningen fra arbeidsmengde. Vurderes samlet med faktoren over.'],
  ],
}

const q = (v) => `'${v.replace(/'/g, "''")}'`

const riskSql = () => `
insert into app.risk_assessments (id, org_id, round_id, assessed_on, assessed_by_employee_id, summary)
values ('${RISK_ID}', '${ORG}', '${ROUND[2026]}', date '${RISK.on}',
        (select e.id from app.employees e where e.org_id = '${ORG}' and e.full_name = ${q(RISK.by)}),
        ${q(RISK.summary)});

insert into app.risk_factor_assessments (assessment_id, factor_key, probability, consequence, conclusion, assessment)
values
${RISK.factors.map(([key, prob, cons, concl, text]) =>
  `  ('${RISK_ID}', '${key}', '${prob}', '${cons}', '${concl}', ${q(text)})`).join(',\n')};`

/**
 * The design's four open conversations and three closed ones (baseline 03).
 *
 * Every comment is the bundle's own text. What is NOT the bundle's is how old each one
 * is: the design prints "Venter 6 dager", "Venter 9 dager", and those are relative to
 * the day it was captured. Pinned dates would make the screen say something false
 * tomorrow, so `opened_hour` is `now()` minus the design's own figure, truncated to the
 * hour like every other timestamp a respondent touches. Same reasoning as the open puls,
 * docs/DEVIATIONS.md D-08.
 *
 * The comments attach to responses in Drift, Prosjekt and Verksted — never
 * Administrasjon, which has three responses against a threshold of five. A comment from
 * a group that small is withheld by `public.conversations()`, and seeding one there would
 * be seeding a row the product is built never to show.
 */
const CONVERSATIONS = [
  ['Drift', 'ytring', 1, 6, 'venter', false,
    'Det hjelper ikke å si fra. Vi meldte avvik på riggingen i vår og hørte aldri noe.'],
  ['Verksted', 'integritet', 1, 9, 'venter', true,
    'Det blir sagt ting i pausen som jeg ikke synes hører hjemme på en arbeidsplass. Jeg vet ikke om jeg skal melde det som varsel eller bare la det ligge.'],
  ['Drift', 'kontakt', 1, 4, 'venter', false,
    'Jeg er alene på lageret store deler av dagen. Hvis noe skjer, vet jeg ærlig talt ikke hvem jeg skal ringe.'],
  ['Prosjekt', 'mengde', 1, 2, 'venter', false,
    'Tre prosjekter samtidig og ingen som sier hva som skal vike.'],
  ['Verksted', 'ytring', 2, 21, 'lukket', false,
    'Vi rakk ikke gjennomgangen før skiftet begynte. Det gjentar seg.'],
  ['Prosjekt', 'leder', 1, 25, 'lukket', false,
    'Jeg fikk aldri svar da jeg spurte om hvem som bestemmer rekkefølgen.'],
  ['Drift', 'rolle', 1, 30, 'lukket', false,
    'Det er uklart hvem som eier oppfølgingen når en sak går på tvers.'],
]

/*
 * The capability key is minted here exactly as `submit_response` mints it — 32 random
 * bytes, stored only as a digest. The fixture never learns the plaintext either, which
 * is the point: a seeded conversation is one nobody can open from the outside, and the
 * respondent side is exercised by the invariant suite rather than by a key written into
 * a file.
 */
const conversationsSql = () => `
${CONVERSATIONS.map(([group, factor, ordinal, days, state, flagged, body], i) => `
with picked as (
  select re.id from app.responses re
  join app.groups g on g.id = re.group_id
  where re.round_id = '${ROUND[2026]}' and g.name = '${group}'
  order by re.id offset ${i} limit 1
)
insert into app.response_comments (response_id, factor_key, ordinal, body)
select id, '${factor}', ${ordinal}, ${q(body)} from picked;

with picked as (
  select re.id from app.responses re
  join app.groups g on g.id = re.group_id
  where re.round_id = '${ROUND[2026]}' and g.name = '${group}'
  order by re.id offset ${i} limit 1
)
insert into app.comment_threads
  (org_id, response_id, factor_key, ordinal, key_hash, state, flagged_varsel, opened_hour)
select '${ORG}', id, '${factor}', ${ordinal},
       extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'),
       '${state}', ${flagged}, date_trunc('hour', now() - interval '${days} days')
from picked;`).join('\n')}`

const invitationsFor = (year) => `
insert into app.invitations (org_id, round_id, employee_id, token_hash, sent_at, expires_at, responded_at)
select '${ORG}', r.id, e.id,
       sha256(convert_to('fixture.' || r.id::text || '.' || e.id::text, 'utf8')),
       r.opens_at, r.closes_at,
       case when e.rn <= c.answered then r.closes_at - interval '1 day' end
from app.rounds r
cross join (values ${COHORTS[year].map(([n, h, a]) => `('${n}',${h},${a})`).join(',')})
  as c(name, invited, answered)
join app.groups grp on grp.org_id = '${ORG}' and grp.name = c.name
join lateral (
  select e.id, row_number() over (${SENIORITY}) as rn
  from app.employees e where e.group_id = grp.id
) e on e.rn <= c.invited
where r.id = '${ROUND[year]}';`

const responsesFor = (year) => `
insert into app.responses (org_id, round_id, group_id, submitted_hour)
select '${ORG}', '${ROUND[year]}', grp.id, date_trunc('hour', r.closes_at - interval '1 day')
from app.rounds r
cross join (values ${COHORTS[year].map(([n, , a]) => `('${n}',${a})`).join(',')}) as c(name, answered)
join app.groups grp on grp.org_id = '${ORG}' and grp.name = c.name
cross join lateral generate_series(1, c.answered)
where r.id = '${ROUND[year]}';`

const answersFor = (year) => `
with cfg(factor_key, hi_count, hi_value, lo_value) as (values ${cfg(year)}),
resp as (select id, row_number() over (order by id) as seq from app.responses where round_id = '${ROUND[year]}'),
slots as (select r.id, r.seq, o.ordinal from resp r cross join (values (1),(2),(3)) as o(ordinal)),
numbered as (
  select c.factor_key, s.id, s.ordinal, c.hi_count, c.hi_value, c.lo_value,
         row_number() over (partition by c.factor_key order by s.seq, s.ordinal) as n
  from cfg c cross join slots s)
insert into app.answers (response_id, factor_key, ordinal, value)
select id, factor_key, ordinal, case when n <= hi_count then hi_value else lo_value end
from numbered;`

console.log(`-- generated by scripts/seed/design-fixture.mjs — do not edit by hand
delete from app.trainings       where org_id = '${ORG}';
delete from app.locations       where org_id = '${ORG}';
delete from app.comment_threads where org_id = '${ORG}';
delete from app.risk_assessments where org_id = '${ORG}';
delete from app.measures      where org_id = '${ORG}';
delete from app.measurements where org_id = '${ORG}';
delete from app.employees   where org_id = '${ORG}';
delete from app.groups      where org_id = '${ORG}';

-- inserted, not updated. No migration seeds an organisation, so on a database built
-- from scratch an UPDATE here matched nothing and every later insert failed on the
-- foreign key. The conflict clause keeps it idempotent against a database that already
-- has it, which is how it behaves on the live project.
insert into app.organizations (
  id, name, org_number, employee_count, threshold, law_mode, bht_name,
  registry_fetched_at, registry_form_code, registry_form_label,
  registry_nace_code, registry_nace_label, registry_registered_on,
  registry_address, registry_municipality, registry_municipality_no,
  registry_employees, registry_vat)
values ('${ORG}', 'Nordvik Anlegg AS', '924118742', ${EMPLOYEES}, 5, true, ${q(BHT)},
  '${REGISTRY.fetched}', ${q(REGISTRY.form[0])}, ${q(REGISTRY.form[1])},
  ${q(REGISTRY.nace[0])}, ${q(REGISTRY.nace[1])}, date '${REGISTRY.registeredOn}',
  ${q(REGISTRY.address)}, ${q(REGISTRY.municipality[0])}, ${q(REGISTRY.municipality[1])},
  ${EMPLOYEES}, ${REGISTRY.vat})
on conflict (id) do update set
  name = excluded.name, org_number = excluded.org_number,
  employee_count = excluded.employee_count, threshold = excluded.threshold,
  law_mode = excluded.law_mode, bht_name = excluded.bht_name,
  registry_fetched_at = excluded.registry_fetched_at,
  registry_form_code = excluded.registry_form_code,
  registry_form_label = excluded.registry_form_label,
  registry_nace_code = excluded.registry_nace_code,
  registry_nace_label = excluded.registry_nace_label,
  registry_registered_on = excluded.registry_registered_on,
  registry_address = excluded.registry_address,
  registry_municipality = excluded.registry_municipality,
  registry_municipality_no = excluded.registry_municipality_no,
  registry_employees = excluded.registry_employees,
  registry_vat = excluded.registry_vat;

-- a demo organisation's addresses are fictional; the dispatcher must never try them (0032)
update app.organizations set mail_enabled = false where id = '${ORG}';

insert into app.locations (org_id, name, address, headcount, sort_order)
values ${LOCATIONS.map(([n, a, h], i) => `('${ORG}', ${q(n)}, ${q(a)}, ${h}, ${i + 1})`).join(',\n       ')};

-- Keyed on org_id, not on an id this file invents: app.year_wheels carries UNIQUE (org_id),
-- one wheel per undertaking, and the hosted project already has a row with an id of its
-- own. Upserting on the organisation reconciles both without leaving two wheels turning.
insert into app.year_wheels (org_id, active, cadence, baseline_month, notify_lead_days,
                             skip_fellesferie, extend_if_low, notify_vo_on_overdue)
values ('${ORG}', true, '${WHEEL.cadence}', ${WHEEL.baselineMonth}, ${WHEEL.leadDays},
        ${WHEEL.skipFellesferie}, ${WHEEL.extendIfLow}, ${WHEEL.notifyVoOnOverdue})
on conflict (org_id) do update set
  active = excluded.active,
  cadence = excluded.cadence,
  baseline_month = excluded.baseline_month,
  notify_lead_days = excluded.notify_lead_days,
  skip_fellesferie = excluded.skip_fellesferie,
  extend_if_low = excluded.extend_if_low,
  notify_vo_on_overdue = excluded.notify_vo_on_overdue;

delete from app.wheel_notifications
where wheel_id = (select id from app.year_wheels where org_id = '${ORG}');

insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order)
select (select id from app.year_wheels where org_id = '${ORG}'),
       l.audience::app.notify_audience, l.lead_days, l.sort_order
from (values ${LADDER.map(([a, d], i) => `('${a}', ${d}, ${i + 1})`).join(', ')})
  as l(audience, lead_days, sort_order);

insert into app.groups (org_id, name, sort_order)
select '${ORG}', g.name, g.ord
from (values ${ROSTER.map(([n], i) => `('${n}',${i + 1})`).join(',')}) as g(name, ord);

insert into app.employees (org_id, group_id, full_name, email)
select '${ORG}', grp.id,
       case when i = 1 then named.full_name else grp.name || ' ' || i end,
       case when i = 1 then named.email else lower(grp.name) || i || '@nordvik.example' end
from (values ${ROSTER.map(([n, h]) => `('${n}',${h})`).join(',')}) as h(name, head)
join app.groups grp on grp.org_id='${ORG}' and grp.name = h.name
join (values ${Object.entries(NAMED).map(([g, [n, e]]) => `('${g}','${n}','${e}')`).join(',')})
  as named(grp_name, full_name, email) on named.grp_name = grp.name
cross join lateral generate_series(1, h.head) i;

update app.employees e set duty_role = d.role::app.duty_role
from (values ${Object.entries(DUTIES).map(([n, r]) => `(${q(n)},'${r}')`).join(',')}) as d(name, role)
where e.org_id = '${ORG}' and e.full_name = d.name;

insert into app.measurements (id, org_id, kind, year, label) values
  ('${MEAS[2025]}','${ORG}','grunnlinje',2025,'Grunnlinje 2025'),
  ('${MEAS[2026]}','${ORG}','grunnlinje',2026,'Grunnlinje 2026'),
  ('${PULS.meas}','${ORG}','puls',2026,'Puls 2026');

insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at, frozen_at,
                        reminder_day, close_after_days, comment_policy, allow_dialogue) values
  ('${ROUND[2025]}','${ORG}','${MEAS[2025]}','lukket','${DATES[2025].opens}','${DATES[2025].closes}','${DATES[2025].closes}',2,7,'lave',true),
  ('${ROUND[2026]}','${ORG}','${MEAS[2026]}','lukket','${DATES[2026].opens}','${DATES[2026].closes}','${DATES[2026].closes}',2,7,'lave',true),
  ('${PULS.round}','${ORG}','${PULS.meas}','apen',
   date_trunc('day', now()) - interval '2 days', date_trunc('day', now()) + interval '5 days', null,2,7,'lave',true);

/*
 * § 9-2 and § 6-2, as the design's Måleoppsett states them: the verneombud was consulted
 * on the setup, and need and design were drøftet on 3 February with a named tillitsvalgt.
 * Only the grunnlinje carries them, because that is the round the design shows the setup
 * for — the pulses inherit the ordning rather than being separately drøftet.
 */
insert into app.round_consultations (round_id, kind, confirmed, held_on, counterpart) values
  ('${ROUND[2026]}','verneombud_raad',true,null,null),
  ('${ROUND[2026]}','droftet_tillitsvalgte',true,date '2026-02-03','Kari Sund, tillitsvalgt Fellesforbundet');

insert into app.round_factors (org_id, round_id, factor_key)
select '${ORG}', r.id, f.key from app.rounds r cross join app.factors f
where r.id in ('${ROUND[2025]}','${ROUND[2026]}');

-- both grunnlinjer carry the full set, which is what makes the rounds list print
-- "37 spørsmål": 11 factors x 3 statements, plus the four outside the index
insert into app.round_extra_questions (org_id, round_id, extra_key)
select '${ORG}', r.id, x.key from app.rounds r cross join app.extra_questions x
where r.id in ('${ROUND[2025]}','${ROUND[2026]}');

-- the puls asks about two factors and nothing outside the index
insert into app.round_factors (org_id, round_id, factor_key)
select '${ORG}', '${PULS.round}', k
from unnest(array[${PULS.factors.map((f) => `'${f}'`).join(',')}]) as k;

-- every active employee is invited, and nobody has answered yet: this is the round the
-- respondent surface is tested against, so its tokens must all still be redeemable
insert into app.invitations (org_id, round_id, employee_id, token_hash, sent_at, expires_at)
select '${ORG}', r.id, e.id,
       sha256(convert_to('fixture.' || r.id::text || '.' || e.id::text, 'utf8')),
       r.opens_at, r.closes_at
from app.rounds r
join app.employees e on e.org_id = '${ORG}' and e.active
where r.id = '${PULS.round}';
${invitationsFor(2025)}
${invitationsFor(2026)}

-- responses carry the group and nothing else that could identify anyone, so they are
-- inserted by count per group and never joined back to an invitation
${responsesFor(2025)}
${responsesFor(2026)}
${answersFor(2025)}
${answersFor(2026)}
${measuresSql()}
${screeningSql()}
${informationSql()}
${riskSql()}
${conversationsSql()}
select m.year,
  (select count(*) from app.invitations i where i.round_id = r.id) as invited,
  (select count(*) from app.invitations i where i.round_id = r.id and i.responded_at is not null) as answered,
  (select count(*) from app.responses re where re.round_id = r.id) as responses,
  (select count(*) from app.answers a join app.responses re on re.id = a.response_id
    where re.round_id = r.id) as answers
from app.rounds r join app.measurements m on m.id = r.measurement_id
where r.org_id = '${ORG}' order by m.year;`)
