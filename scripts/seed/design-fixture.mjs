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
    null, '2026-02-03', 'lukket', 'kollektivt', 'aml. kap. 2A', []],
  ['mengde', 2025, 'Tomas Vik', 'To innleide ekstra i høysesongen',
    'Arbeidsmengde steg fire poeng, men falt tilbake i 2026. Vurder om tiltaket må gjentas.',
    null, '2026-01-20', 'lukket', 'kollektivt', 'forskrift kap. 1A', []],
  ['kollega', 2025, 'Anne Rygg', 'Faste fredagsgjennomganger på Verksted',
    'Kollegastøtte er den høyeste faktoren i 2026. Tiltaket regnes som virksomt og videreføres som rutine.',
    null, '2026-05-12', 'lukket', 'kollektivt', 'aml. § 4-3', ['Verksted']],
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

const measuresSql = () => `
insert into app.measures (org_id, factor_key, round_id, owner_employee_id, title, goal,
                          due_date, completed_on, step, kind, law_ref, created_at)
values
${MEASURES.map(([factor, year, owner, title, goal, due, done, step, kind, law], i) =>
  `  ('${ORG}', '${factor}', '${ROUND[year]}',
   (select e.id from app.employees e where e.org_id = '${ORG}' and e.full_name = '${owner}'),
   '${title.replace(/'/g, "''")}', '${goal.replace(/'/g, "''")}',
   ${sqlDate(due)}, ${sqlDate(done)}, '${step}', '${kind}', ${law ? `'${law}'` : 'null'},
   timestamptz '2026-09-15 09:00+02' + ${i} * interval '1 hour')`).join(',\n')};

${MEASURES.flatMap(([, , , title, , , , , , , groups]) =>
  groups.map((g) => `insert into app.measure_groups (measure_id, group_id)
select m.id, grp.id from app.measures m
join app.groups grp on grp.org_id = m.org_id and grp.name = '${g}'
where m.org_id = '${ORG}' and m.title = '${title.replace(/'/g, "''")}';`)).join('\n')}`

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
delete from app.measures      where org_id = '${ORG}';
delete from app.measurements where org_id = '${ORG}';
delete from app.employees   where org_id = '${ORG}';
delete from app.groups      where org_id = '${ORG}';

-- inserted, not updated. No migration seeds an organisation, so on a database built
-- from scratch an UPDATE here matched nothing and every later insert failed on the
-- foreign key. The conflict clause keeps it idempotent against a database that already
-- has it, which is how it behaves on the live project.
insert into app.organizations (id, name, org_number, employee_count, threshold)
values ('${ORG}', 'Nordvik Anlegg AS', '924118742', ${EMPLOYEES}, 5)
on conflict (id) do update set
  name = excluded.name, org_number = excluded.org_number,
  employee_count = excluded.employee_count, threshold = excluded.threshold;

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

insert into app.measurements (id, org_id, kind, year, label) values
  ('${MEAS[2025]}','${ORG}','grunnlinje',2025,'Grunnlinje 2025'),
  ('${MEAS[2026]}','${ORG}','grunnlinje',2026,'Grunnlinje 2026'),
  ('${PULS.meas}','${ORG}','puls',2026,'Puls 2026');

insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at, frozen_at) values
  ('${ROUND[2025]}','${ORG}','${MEAS[2025]}','lukket','${DATES[2025].opens}','${DATES[2025].closes}','${DATES[2025].closes}'),
  ('${ROUND[2026]}','${ORG}','${MEAS[2026]}','lukket','${DATES[2026].opens}','${DATES[2026].closes}','${DATES[2026].closes}'),
  ('${PULS.round}','${ORG}','${PULS.meas}','apen',
   date_trunc('day', now()) - interval '2 days', date_trunc('day', now()) + interval '5 days', null);

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
select m.year,
  (select count(*) from app.invitations i where i.round_id = r.id) as invited,
  (select count(*) from app.invitations i where i.round_id = r.id and i.responded_at is not null) as answered,
  (select count(*) from app.responses re where re.round_id = r.id) as responses,
  (select count(*) from app.answers a join app.responses re on re.id = a.response_id
    where re.round_id = r.id) as answers
from app.rounds r join app.measurements m on m.id = r.measurement_id
where r.org_id = '${ORG}' order by m.year;`)
