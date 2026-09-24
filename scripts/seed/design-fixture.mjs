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
  // The history the design of 24 September adds (RES2.YRS and PULS, Målinger › Historikk):
  // "19 av 27", "22 av 29", and the pulses "29 av 32", "27 av 32", "26 av 33". The
  // totals are the design's; the splits are the fixture's own, like 2025's.
  //
  // Administrasjon answers in full in every puls. That is a constraint, not a flourish:
  // three or four respondents there would leave a remainder under k, and complementary
  // suppression (0034) would then withhold Verksted too — the group whose puls values
  // the design's whole story is about. In the grunnlinjer it answers three, as in 2025
  // and 2026, and the release rule protects one more group, which the design does not
  // print for those years.
  //
  // Group sizes are not free either. With n answers a group's index moves in steps of
  // 25/3n, so a printed figure is reachable only for some n: Verksted's 52 on mengde in
  // May 2025 is not reachable with six answers. The splits below are ones where every
  // printed puls figure is reachable, and `plan` refuses any that is not.
  2024: [['Drift', 10, 7], ['Prosjekt', 8, 6], ['Verksted', 6, 6], ['Administrasjon', 5, 3]],
  2023: [['Drift', 9, 6], ['Prosjekt', 7, 5], ['Verksted', 6, 5], ['Administrasjon', 5, 3]],
  p2505: [['Drift', 11, 9], ['Prosjekt', 9, 8], ['Verksted', 7, 7], ['Administrasjon', 5, 5]],
  p2508: [['Drift', 11, 8], ['Prosjekt', 9, 8], ['Verksted', 7, 6], ['Administrasjon', 5, 5]],
  p2603: [['Drift', 12, 8], ['Prosjekt', 9, 7], ['Verksted', 7, 6], ['Administrasjon', 5, 5]],
}

/**
 * The design's nine-factor order (RES2.F): the eleven without kontakt and integritet.
 * The history screens print these nine per round; the database holds eleven, so the two
 * the design leaves out get values of the fixture's own, chosen so the eleven-factor
 * index lands on the design's published one (60 and 63).
 */
const NINE = ['ytring', 'mengde', 'motstrid', 'emosjon', 'leder', 'medvirk', 'rolle', 'kollega', 'mening']
const nine = (values, extra = {}) => ({ ...Object.fromEntries(NINE.map((k, i) => [k, values[i]])), ...extra })

/**
 * Company-wide targets per round and factor. 2025 and 2026 are FACTORS above; the rest are
 * the design's RES2.YRS (2023, 2024) and RES2.PULS (the three pulses, which ask about two
 * or three factors each). The puls index is the mean of what it measured: 47, 49.5 → 50,
 * and 53.3 → 53, which is what Historikk prints.
 */
const TARGETS = {
  2026: Object.fromEntries(FACTORS.map(([k, y26]) => [k, y26])),
  2025: Object.fromEntries(FACTORS.map(([k, , y25]) => [k, y25])),
  2024: nine([53, 56, 59, 58, 67, 61, 72, 74, 71], { kontakt: 57, integritet: 65 }),
  2023: nine([50, 55, 56, 57, 63, 57, 68, 71, 67], { kontakt: 55, integritet: 60 }),
  p2505: { ytring: 44, mengde: 50 },
  p2508: { ytring: 47, mengde: 52 },
  p2603: { ytring: 45, mengde: 49, leder: 66 },
}

/**
 * Per-group targets where the design prints them: the Varmekart's TEAMS for 2026 and each
 * puls's `teams`. A group or factor with no target takes what is left of the company-wide
 * sum (Administrasjon, and kontakt and integritet everywhere), spread evenly over the
 * groups that have none, so every published figure is exact and nothing else is steered.
 */
const TEAM_TARGETS = {
  // Drift's emosjon is left out: with eight answers a group moves in steps of 25/24, and
  // the design's 62 falls between two of them — no whole set of answers produces it. The
  // row is not shown in 2026 either way: Administrasjon's three responses leave a
  // remainder under k, and 0034 withholds the smallest released group with it, Drift.
  2026: {
    Drift: (({ emosjon, ...rest }) => rest)(nine([49, 51, 60, 62, 70, 68, 74, 78, 81])),
    Prosjekt: nine([46, 31, 44, 57, 58, 64, 59, 74, 75]),
    Verksted: nine([28, 47, 53, 55, 55, 66, 72, 77, 77]),
  },
  p2505: { Drift: { ytring: 50, mengde: 55 }, Prosjekt: { ytring: 45, mengde: 40 }, Verksted: { ytring: 36, mengde: 52 } },
  p2508: { Drift: { ytring: 52, mengde: 56 }, Prosjekt: { ytring: 47, mengde: 41 }, Verksted: { ytring: 40, mengde: 53 } },
  p2603: {
    Drift: { ytring: 50, mengde: 54, leder: 70 },
    Prosjekt: { ytring: 44, mengde: 38, leder: 63 },
    Verksted: { ytring: 33, mengde: 50, leder: 64 },
  },
}

/**
 * "Anbefaler oss" per grunnlinje, as answer counts for options 1..5 (0035's figure:
 * 100 × (fives − ones-to-threes) / answers). The design prints +8, +19, +27 and +22.
 * The question is optional, and the counts are chosen to land on those figures exactly,
 * which is only possible with some respondents skipping it: +22 over 28 answers is not a
 * whole number of people (6/28 is 21, 7/28 is 25), 6 over 27 is. 2023's +8 needs 13 of
 * 19 answering — the first year the question was asked.
 */
/**
 * Who answers what on the recommendation question. The counts above fix the figure; which
 * respondent gives which answer is ordered by their own answers, weighted by the design's
 * importance per factor (RES2 `imp`). So the people who score the workplace lowest are the
 * ones least likely to recommend it. Prioritet's "betydning" (0037) is the correlation
 * between the two. Assigned by id, as the screening answers are, it came out negative on
 * every factor: an artefact of the fixture, not a finding. Kontakt and integritet are not
 * in RES2 and take a middling weight.
 */
const IMPORTANCE = {
  ytring: 0.84, mengde: 0.76, motstrid: 0.44, emosjon: 0.3, leder: 0.7, medvirk: 0.52,
  rolle: 0.36, kollega: 0.46, mening: 0.62, kontakt: 0.4, integritet: 0.4,
}

const RECOMMEND = {
  2026: [1, 1, 3, 11, 11],
  2025: [0, 1, 3, 8, 10],
  2024: [1, 1, 3, 7, 9],
  2023: [1, 1, 2, 4, 5],
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
  // Historikk's own dates: "lukket 15. september 2023", "13. september 2024", and the
  // pulses' "22. mai 2025", "14. august 2025", "3. mars 2026". Each ran a week.
  2023: { opens: '2023-09-08 07:00:00+02', closes: '2023-09-15 21:00:00+02' },
  2024: { opens: '2024-09-06 07:00:00+02', closes: '2024-09-13 21:00:00+02' },
  p2505: { opens: '2025-05-15 07:00:00+02', closes: '2025-05-22 21:00:00+02' },
  p2508: { opens: '2025-08-07 07:00:00+02', closes: '2025-08-14 21:00:00+02' },
  p2603: { opens: '2026-02-24 07:00:00+01', closes: '2026-03-03 21:00:00+01' },
}

const ORG = '00000000-0000-4000-8000-000000000001'
const ROUND = {
  2025: '00000000-0000-4000-8000-000000000012', 2026: '00000000-0000-4000-8000-000000000002',
  2024: '00000000-0000-4000-8000-000000000032', 2023: '00000000-0000-4000-8000-000000000042',
  p2505: '00000000-0000-4000-8000-000000000052', p2508: '00000000-0000-4000-8000-000000000062',
  p2603: '00000000-0000-4000-8000-000000000072',
}
const MEAS = {
  2025: '00000000-0000-4000-8000-000000000013', 2026: '00000000-0000-4000-8000-000000000003',
  2024: '00000000-0000-4000-8000-000000000033', 2023: '00000000-0000-4000-8000-000000000043',
  p2505: '00000000-0000-4000-8000-000000000053', p2508: '00000000-0000-4000-8000-000000000063',
  p2603: '00000000-0000-4000-8000-000000000073',
}

/** Every closed round, oldest first, with what the measurements row records. */
const CLOSED = [
  ['2023', 'grunnlinje', 2023, 'Grunnlinje 2023'],
  ['2024', 'grunnlinje', 2024, 'Grunnlinje 2024'],
  ['p2505', 'puls', 2025, 'Puls mai 2025'],
  ['p2508', 'puls', 2025, 'Puls august 2025'],
  ['2025', 'grunnlinje', 2025, 'Grunnlinje 2025'],
  ['p2603', 'puls', 2026, 'Puls mars 2026'],
  ['2026', 'grunnlinje', 2026, 'Grunnlinje 2026'],
]
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
  // the fixture's own: the design prints section 7 for the latest year only
  2024: { krenkende: [19, 1, 1, 1], vold: [21, 0, 0, 1] },
  2023: { krenkende: [16, 2, 0, 1], vold: [18, 0, 0, 1] },
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

/**
 * The index the database computes for a sum of (v − 1) over `slots` answers:
 * round(avg((v − 1) × 25)), with Postgres's half-away-from-zero rounding, done in integers
 * so no float can land on the wrong side of a .5.
 */
const indexOf = (S, slots) => Math.floor((50 * S + slots) / (2 * slots))

/** Every sum over `slots` answers that the database rounds to `target`. */
const sumsFor = (target, slots) => {
  const out = []
  for (let S = 0; S <= 4 * slots; S++) if (indexOf(S, slots) === target) out.push(S)
  return out
}

/**
 * The answer sum for each (round, group, factor), solved backwards from the targets.
 *
 * A group with a design target gets the sum nearest its exact value that rounds to it.
 * The company-wide sum is then chosen among those that round to the company target, so
 * that what is left for the groups without a target is as close as possible to the same
 * average — nothing unprinted is steered anywhere unusual. What is left is spread over
 * those groups in proportion to their answers. If any printed figure cannot be reached
 * with whole answers, the generator stops rather than seeding a number that is off by one.
 */
const plan = (() => {
  const out = []
  for (const [key] of CLOSED) {
    const cohorts = COHORTS[key].filter(([, , a]) => a > 0)
    const teams = TEAM_TARGETS[key] ?? {}
    for (const [factor, target] of Object.entries(TARGETS[key])) {
      const slots = Object.fromEntries(cohorts.map(([g, , a]) => [g, 3 * a]))
      const total = Object.values(slots).reduce((a, b) => a + b, 0)
      const fixed = {}
      for (const [g, t] of Object.entries(teams)) {
        if (t[factor] === undefined) continue
        const options = sumsFor(t[factor], slots[g])
        if (!options.length) throw new Error(`${key} ${g} ${factor}: ${t[factor]} is unreachable with ${slots[g] / 3} answers`)
        const exact = (t[factor] * slots[g]) / 25
        fixed[g] = options.reduce((a, b) => (Math.abs(b - exact) < Math.abs(a - exact) ? b : a))
      }
      const free = cohorts.map(([g]) => g).filter((g) => !(g in fixed))
      const freeSlots = free.reduce((a, g) => a + slots[g], 0)
      const fixedSum = Object.values(fixed).reduce((a, b) => a + b, 0)
      const candidates = sumsFor(target, total).filter((S) => {
        const rest = S - fixedSum
        return free.length ? rest >= 0 && rest <= 4 * freeSlots : rest === 0
      })
      if (!candidates.length) throw new Error(`${key} ${factor}: no company sum reaches ${target} with the group targets`)
      const want = fixedSum + (target * freeSlots) / 25
      const S = candidates.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a))
      // spread the rest over the free groups by largest remainder
      let rest = S - fixedSum
      const share = free.map((g) => ({ g, raw: freeSlots ? (rest * slots[g]) / freeSlots : 0 }))
      share.forEach((x) => (x.S = Math.floor(x.raw)))
      let left = rest - share.reduce((a, x) => a + x.S, 0)
      for (const x of [...share].sort((a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)))) {
        if (left <= 0) break
        x.S += 1
        left -= 1
      }
      const sums = { ...fixed, ...Object.fromEntries(share.map((x) => [x.g, x.S])) }
      for (const [g, gs] of Object.entries(sums)) {
        if (gs < 0 || gs > 4 * slots[g]) throw new Error(`${key} ${g} ${factor}: sum ${gs} outside 0..${4 * slots[g]}`)
        out.push({ key, group: g, factor, slots: slots[g], S: gs })
      }
      if (indexOf(Object.values(sums).reduce((a, b) => a + b, 0), total) !== target) {
        throw new Error(`${key} ${factor}: the company index does not land on ${target}`)
      }
    }
  }
  return out
})()

/**
 * How far each statement sits from its factor in the design (v3 `FACTORS[].items` minus
 * `idx`: Ytringsklima's 38, 36 and 49 around 41). Resultater's drill-down prints the three
 * statements of a factor, and three equal numbers under every factor would be a fixture
 * artefact, not the design. The offsets sum to zero, so a factor's index does not move.
 */
const ITEM_OFFSET = {
  ytring: [-3, -5, 8], mengde: [-3, -5, 8], motstrid: [-5, -2, 7], kontakt: [5, -8, 3],
  emosjon: [-3, -4, 7], leder: [-3, -1, 4], medvirk: [4, -6, 2], integritet: [7, -6, -1],
  rolle: [3, -4, 1], kollega: [4, -5, 1], mening: [6, -8, 2],
}

/**
 * One (round, group, factor) sum split over its three statements: a third each, moved by
 * the design's offset (one answer a step up is 25/n index points on its statement), by
 * largest remainder so the three add back to exactly the sum, and kept inside 0..4n.
 */
const statementSums = ({ factor, slots, S }) => {
  const n = slots / 3
  const off = ITEM_OFFSET[factor] ?? [0, 0, 0]
  const raw = off.map((d) => S / 3 + (d * n) / 25)
  const out = raw.map((x) => Math.max(0, Math.min(4 * n, Math.floor(x))))
  let left = S - out.reduce((a, b) => a + b, 0)
  const order = [0, 1, 2].sort((a, b) => raw[b] - Math.floor(raw[b]) - (raw[a] - Math.floor(raw[a])))
  for (let guard = 0; left !== 0 && guard < 12 * n; guard++) {
    for (const o of left > 0 ? order : [...order].reverse()) {
      if (left > 0 && out[o] < 4 * n) { out[o] += 1; left -= 1 }
      else if (left < 0 && out[o] > 0) { out[o] -= 1; left += 1 }
      if (left === 0) break
    }
  }
  if (left !== 0) throw new Error(`${factor}: ${S} does not split over three statements of ${n}`)
  return out
}
for (const row of plan) row.split = statementSums(row)

/**
 * Which of a group's respondents carry the higher of the two points, per factor. Without
 * it the same few respondents would be high on every factor, every factor would move with
 * every other, and Prioritet's correlations (D4) would say nothing about any one factor.
 * Each factor starts its run of higher answers at its own place in the group — a rotation,
 * so it can be written the same way here and in SQL.
 */
const FACTOR_POS = Object.fromEntries(Object.keys(ITEM_OFFSET).map((k, i) => [k, i]))
const shiftOf = (factor, n) => Math.floor((n * (FACTOR_POS[factor] ?? 0)) / Object.keys(FACTOR_POS).length)

/** Each statement's sum as two adjacent scale points over the group's answers, as cfg rows. */
const cfgRows = () => plan.flatMap(({ key, group, factor, slots, split }) => split.map((So, i) => {
  const n = slots / 3, q = Math.floor(So / n), r = So % n
  return `('${ROUND[key]}'::uuid,'${group}','${factor}',${i + 1},${r},${q + 2},${q + 1},${shiftOf(factor, n)},${n})`
})).join(',\n  ')

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
 * The design's comments (design 3's V2KOM): eighteen across five rounds, ten waiting for
 * an answer, which is the "10" on the nav's Kommentarer badge. Every text and reply is the
 * design's own.
 *
 * Each is [round, group, factor, tone, text, reply, opened]:
 *   group   the design's `seg`; `null` for its "Hele virksomheten", which is a comment the
 *           design does not place — it goes to the first released group that has an
 *           answer of the right tone, since every response carries a group
 *   tone    the design's chip. The product derives it from the writer's own answer on the
 *           statement the comment hangs on (1–2 negativ, 3 blandet, 4–5 positiv), so the
 *           comment is attached to a response whose answer is in that band — see `tone`.
 *   opened  days ago for the current round, as the design's "Venter · 6 dager" is relative
 *           to the day it is read (D-08); a fixed date for the older rounds
 *
 * Two of the design's comments cannot exist as drawn: it files "omleggingen av
 * morgenmøtet" (mening) under Puls august 2025 and "Ny leder er engasjert" (leder) under
 * Puls mai 2025, but those pulses asked about ytringsklima and arbeidsmengde only, and a
 * comment hangs on a statement the round asked. Both go to Grunnlinje 2025, the nearest
 * round that asked their factor (D-70).
 *
 * Nothing goes to Administrasjon: three responses against a threshold of five, and
 * `conversations()` withholds a comment from a group that small.
 */
const COMMENTS = [
  ['2025', 'Prosjekt', 'mengde', 'neg', 'Høysesongen er umulig med dagens bemanning.',
    'Vi leier inn to ekstra fra januar. Si fra om det monner.', '2025-09-11'],
  ['2025', 'Verksted', 'ytring', 'neg', 'Vi har meldt om den samme feilen på løfteutstyret tre ganger.',
    'Utstyret er byttet 3. oktober. Takk for at du sto på.', '2025-09-11'],
  ['2025', 'Drift', 'mening', 'pos', 'Vil bare si at omleggingen av morgenmøtet var et godt grep.',
    'Godt å høre — vi beholder det.', '2025-09-11'],
  ['2025', null, 'leder', 'blandet', 'Ny leder er engasjert, men vi ser henne for lite ute.',
    'Jeg setter opp faste besøk på anleggene hver tirsdag fra juni.', '2025-09-11'],
  ['2024', 'Verksted', 'kollega', 'pos', 'Fredagsgjennomgangene har gjort at vi faktisk snakker sammen.',
    'Da fortsetter vi med dem.', '2024-09-13'],
  ['2024', 'Prosjekt', 'mengde', 'neg', 'Alle prosjektene har frist samme uke i november. Hvert år.',
    'Vi tar det opp med kundene før neste kontraktsrunde.', '2024-09-13'],
  ['2026', 'Verksted', 'ytring', 'neg', 'Det hjelper ikke å si fra. Vi meldte avvik på riggingen i vår og hørte aldri noe.', null, 6],
  ['2026', 'Verksted', 'ytring', 'neg', 'Man blir fort stemplet som vanskelig hvis man tar opp ting på morgenmøtet.', null, 6],
  ['2026', 'Drift', 'ytring', 'neg', 'Avviksskjemaet er så tungvint at folk heller lar være.', null, 5],
  ['2026', null, 'ytring', 'pos', 'Lederen min tar det på alvor når jeg sier fra. Det burde gjelde alle.',
    'Takk — vi tar det med inn i arbeidet med ytringsklima.', 4],
  ['2026', 'Prosjekt', 'mengde', 'neg', 'Tre prosjekter samtidig og ingen som sier hva som skal vike.', null, 2],
  ['2026', 'Prosjekt', 'mengde', 'neg', 'Jeg jobber kveld nesten hver uke i høysesong.', null, 3],
  ['2026', 'Prosjekt', 'motstrid', 'neg', 'To prosjektledere ber om det samme mannskapet samme uke.', null, 3],
  ['2026', null, 'emosjon', 'neg', 'Etter ulykken i mai snakket vi aldri om det.', null, 5],
  ['2026', null, 'leder', 'blandet', 'Lederen er flink, men sitter aldri ute hos oss.', null, 4],
  ['2026', 'Verksted', 'kollega', 'pos', 'Samholdet på laget er det beste med jobben.', null, 6],
  ['2026', 'Drift', 'mening', 'pos', 'Omleggingen av morgenmøtet var et godt grep.',
    'Så fint å høre — vi fortsetter med det.', 5],
  ['2026', null, 'medvirk', 'pos', 'Fint at vi fikk være med å velge nytt verktøy.', null, 4],
]

const TONE_BAND = { neg: [1, 2], blandet: [3, 3], pos: [4, 5] }

/**
 * Where every comment hangs, and the answers that had to move for it to hang there.
 *
 * The answers are two adjacent scale points per group and factor (`plan`), so a group whose
 * emosjon is 58 has only 3s and 4s — no answer a negative comment could sit on. Where the
 * design's tone has no answer in its band, one answer moves into the band and another on
 * the same statement in the same group moves the opposite way by the same step (3→2 with
 * 3→4, say). Group sums, statement sums and so every index stay exactly where `plan` put
 * them; the only thing that changes is that one person's answer now matches what they
 * wrote. The overrides are emitted with the answers.
 */
const slotValue = (row, seq, ordinal) => {
  const n = row.slots / 3, So = row.split[ordinal - 1]
  const q = Math.floor(So / n), r = So % n
  return ((seq - 1 + shiftOf(row.factor, n)) % n) + 1 <= r ? q + 2 : q + 1
}
const { attachments, overrides } = (() => {
  const overrides = new Map() // `${key}|${group}|${seq}|${factor}|${ordinal}` -> value
  const used = new Set() // one comment per response and statement
  const attachments = []
  const valueAt = (row, seq, o) => overrides.get(`${row.key}|${row.group}|${seq}|${row.factor}|${o}`) ?? slotValue(row, seq, o)
  const released = (key) => COHORTS[key].filter(([, , a]) => a >= 5).map(([g]) => g)
  for (const [key, group, factor, tone, , , ] of COMMENTS) {
    const [lo, hi] = TONE_BAND[tone]
    const groups = group ? [group] : released(key)
    let found = null
    // first choice: an answer already in the band
    for (const g of groups) {
      const row = plan.find((p) => p.key === key && p.group === g && p.factor === factor)
      if (!row) continue
      for (let seq = 1; seq <= row.slots / 3 && !found; seq++) {
        for (let o = 1; o <= 3 && !found; o++) {
          const v = valueAt(row, seq, o)
          if (v >= lo && v <= hi && !used.has(`${key}|${g}|${seq}|${factor}|${o}`)) found = { row, seq, o }
        }
      }
      if (found) break
    }
    // otherwise: move one answer into the band and a partner on the same statement back
    for (const g of found ? [] : groups) {
      const row = plan.find((p) => p.key === key && p.group === g && p.factor === factor)
      if (!row) continue
      const n = row.slots / 3
      for (let o = 1; o <= 3 && !found; o++) {
        for (let seq = 1; seq <= n && !found; seq++) {
          const v = valueAt(row, seq, o)
          const d = v < lo ? lo - v : v > hi ? hi - v : 0
          if (Math.abs(d) !== 1 || used.has(`${key}|${g}|${seq}|${factor}|${o}`)) continue
          for (let p = 1; p <= n && !found; p++) {
            const w = valueAt(row, p, o)
            if (p === seq || w - d < 1 || w - d > 5) continue
            overrides.set(`${key}|${g}|${seq}|${factor}|${o}`, v + d)
            overrides.set(`${key}|${g}|${p}|${factor}|${o}`, w - d)
            found = { row, seq, o }
          }
        }
      }
      if (found) break
    }
    if (!found) throw new Error(`${key} ${group ?? 'hele'} ${factor}: no answer can carry a ${tone} comment`)
    used.add(`${key}|${found.row.group}|${found.seq}|${factor}|${found.o}`)
    attachments.push({ group: found.row.group, seq: found.seq, ordinal: found.o })
  }
  return { attachments, overrides }
})()

/*
 * The capability key is minted here exactly as `submit_response` mints it — 32 random
 * bytes, stored only as a digest. The fixture never learns the plaintext either, which
 * is the point: a seeded conversation is one nobody can open from the outside, and the
 * respondent side is exercised by the invariant suite rather than by a key written into
 * a file.
 */
const conversationsSql = () => `
with c(n, round_id, grp, seq, factor_key, ordinal, body, reply, opened) as (values
${COMMENTS.map(([key, , factor, , text, reply, opened], i) => {
  const a = attachments[i]
  // comments of the same age are an hour apart in the design's own order, so "the oldest
  // two" on Oversikt are the design's two rather than whichever id sorts first
  const sameAgeBefore = COMMENTS.slice(0, i).filter((c) => c[6] === opened).length
  const at = typeof opened === 'number'
    ? `date_trunc('hour', now() - interval '${opened} days') - interval '${COMMENTS.filter((c) => c[6] === opened).length - sameAgeBefore} hours'`
    : `timestamptz '${opened} 12:00:00+02'`
  return `  (${i + 1}, '${ROUND[key]}'::uuid, '${a.group}', ${a.seq}, '${factor}', ${a.ordinal}, ${q(text)}, ${reply ? q(reply) : 'null'}, ${at})`
}).join(',\n')}),
picked as (
  select c.*, re.id as response_id
  from c join (
    select re.id, re.round_id, g.name as grp,
           row_number() over (partition by re.round_id, re.group_id order by re.id) as seq
    from app.responses re join app.groups g on g.id = re.group_id
    where re.org_id = '${ORG}'
  ) re on re.round_id = c.round_id and re.grp = c.grp and re.seq = c.seq
),
comments as (
  insert into app.response_comments (response_id, factor_key, ordinal, body)
  select response_id, factor_key, ordinal, body from picked
  returning response_id
),
threads as (
  insert into app.comment_threads
    (org_id, response_id, factor_key, ordinal, key_hash, state, flagged_varsel, opened_hour)
  select '${ORG}', p.response_id, p.factor_key, p.ordinal,
         extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'),
         case when p.reply is null then 'venter' else 'dialog' end::app.thread_state, false, p.opened
  from picked p
  where exists (select 1 from comments x where x.response_id = p.response_id)
  returning id, response_id, factor_key, ordinal
)
insert into app.thread_messages (thread_id, author, body, sent_hour)
select t.id, 'leder', p.reply, p.opened + interval '1 day'
from threads t
join picked p on p.response_id = t.response_id and p.factor_key = t.factor_key and p.ordinal = t.ordinal
where p.reply is not null;`

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

/**
 * Every answer of every closed round, from the solved plan: each (round, group, factor)
 * sum is split over its statements (`statementSums`), and each statement's share is two
 * adjacent scale points over that group's answers, so the group's figure and the
 * company's both land where the design prints them.
 */
const overrideRows = () => [...overrides].map(([k, v]) => {
  const [key, group, seq, factor, ordinal] = k.split('|')
  return `('${ROUND[key]}'::uuid,'${group}',${seq},'${factor}',${ordinal},${v})`
})

const answersSql = () => `
with cfg(round_id, grp, factor_key, ordinal, hi_count, hi_value, lo_value, shift, n) as (values
  ${cfgRows()}),
ovr(round_id, grp, seq, factor_key, ordinal, value) as (values
  ${overrideRows().join(',\n  ') || "(null::uuid, null, null::int, null, null::int, null::int)"}),
resp as (
  select re.id, re.round_id, g.name as grp,
         row_number() over (partition by re.round_id, re.group_id order by re.id) as seq
  from app.responses re join app.groups g on g.id = re.group_id
  where re.org_id = '${ORG}'),
slots as (select r.id, r.round_id, r.grp, r.seq, o.ordinal from resp r cross join (values (1),(2),(3)) as o(ordinal)),
numbered as (
  select c.round_id, c.grp, s.seq, c.factor_key, s.id, s.ordinal, c.hi_count, c.hi_value, c.lo_value,
         (s.seq - 1 + c.shift) % c.n + 1 as n
  from cfg c join slots s on s.round_id = c.round_id and s.grp = c.grp and s.ordinal = c.ordinal)
insert into app.answers (response_id, factor_key, ordinal, value)
select nb.id, nb.factor_key, nb.ordinal,
       coalesce(o.value, case when nb.n <= nb.hi_count then nb.hi_value else nb.lo_value end)
from numbered nb
left join ovr o on o.round_id = nb.round_id and o.grp = nb.grp and o.seq = nb.seq
               and o.factor_key = nb.factor_key and o.ordinal = nb.ordinal;`

/**
 * "Anbefaler oss", assigned by count exactly as the screening answers are: responses are
 * numbered and cut at the counts, and the ones past the total skip the question.
 */
const recommendSql = () => Object.entries(RECOMMEND).map(([year, counts]) => `
with weight(factor_key, w) as (values ${Object.entries(IMPORTANCE).map(([k, w]) => `('${k}', ${w})`).join(', ')}),
means as (
  select a.response_id, a.factor_key, avg(a.value)::float8 as m
  from app.answers a join app.responses r on r.id = a.response_id
  where r.round_id = '${ROUND[year]}' group by 1, 2),
z as (
  select response_id, factor_key,
         coalesce((m - avg(m) over (partition by factor_key)) / nullif(stddev_pop(m) over (partition by factor_key), 0), 0) as z
  from means),
numbered as (
  select r.id, row_number() over (order by (
    select coalesce(sum(power(w.w, 4) * z.z), 0) from z join weight w on w.factor_key = z.factor_key
    where z.response_id = r.id), r.id) as n
  from app.responses r where r.round_id = '${ROUND[year]}')
insert into app.extra_answers (response_id, extra_key, option_ordinal)
select id, 'anbefaling',
  case ${counts.map((c, i) =>
    `when n <= ${counts.slice(0, i + 1).reduce((a, b) => a + b, 0)} then ${i + 1}`).join('\n       ')}
  end
from numbered
where n <= ${counts.reduce((a, b) => a + b, 0)};`).join('\n')

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
${CLOSED.map(([key, kind, year, label]) => `  ('${MEAS[key]}','${ORG}','${kind}',${year},${q(label)}),`).join('\n')}
  ('${PULS.meas}','${ORG}','puls',2026,'Puls 2026');

insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at, frozen_at,
                        reminder_day, close_after_days, comment_policy, allow_dialogue) values
${CLOSED.map(([key]) =>
  `  ('${ROUND[key]}','${ORG}','${MEAS[key]}','lukket','${DATES[key].opens}','${DATES[key].closes}','${DATES[key].closes}',2,7,'lave',true),`).join('\n')}
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
where r.id in (${CLOSED.filter(([, kind]) => kind === 'grunnlinje').map(([key]) => `'${ROUND[key]}'`).join(',')});

-- every grunnlinje carries the full set, which is what makes the rounds list print
-- "37 spørsmål": 11 factors x 3 statements, plus the four outside the index
insert into app.round_extra_questions (org_id, round_id, extra_key)
select '${ORG}', r.id, x.key from app.rounds r cross join app.extra_questions x
where r.id in (${CLOSED.filter(([, kind]) => kind === 'grunnlinje').map(([key]) => `'${ROUND[key]}'`).join(',')});

-- a closed puls asks what Historikk says it asked, and nothing outside the index
insert into app.round_factors (org_id, round_id, factor_key)
select '${ORG}', v.round_id::uuid, v.factor_key
from (values ${CLOSED.filter(([, kind]) => kind === 'puls').flatMap(([key]) =>
  Object.keys(TARGETS[key]).map((f) => `('${ROUND[key]}','${f}')`)).join(',')}) as v(round_id, factor_key);

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
${CLOSED.map(([key]) => invitationsFor(key)).join('\n')}

-- responses carry the group and nothing else that could identify anyone, so they are
-- inserted by count per group and never joined back to an invitation
${CLOSED.map(([key]) => responsesFor(key)).join('\n')}
${answersSql()}
${recommendSql()}
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
where r.org_id = '${ORG}' order by r.closes_at nulls last;`)
