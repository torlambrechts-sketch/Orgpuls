/**
 * The QA tenant (docs/implementation/engagement-phases.md § 2.4): Lumio AS, the organisation
 * every engagement screen is captured on. Emits SQL; `npm run qa:seed` applies it to the
 * local stack and nowhere else.
 *
 * LOCAL ONLY. Like supabase/tests/local_account.sql it writes auth.users with known
 * passwords, which on a hosted project would be a back door. `run()` below refuses any
 * database that is not on this machine, and any Supabase URL that is not.
 *
 * The same rules as the design fixture and the demo organisation:
 *   - this file is the only source of these rows; a rerun deletes the organisation's rows
 *     and writes them again, so nothing survives that is not emitted here;
 *   - responses carry a group and an hour and nothing else, inserted by count, never
 *     joined to an invitation;
 *   - answers are drawn from a hash of the response, so every run writes the same values.
 *
 * The scenario, as § 2.4 specifies it, with one change: the organisation number is 999999981,
 * not 999 999 999. That one, and 999999997–8, are taken by the SQL suites' probe organisations;
 * 999999981 fails the mod-11 check digit, so no real undertaking can hold it either.
 *
 *   - five people who sign in. The document's «HR» is a daglig_leder and its «tillitsvalgt»
 *     a verneombud: CLAUDE.md's three roles stand (DECISION_LOG, 2026-09-26);
 *   - Drift 12, Salg 7, Økonomi 3. Økonomi is under k and must never show a value;
 *   - hovedmåling 1, closed in March 2026; three measures, one closed, one in progress and
 *     one overdue; a puls in June re-measuring the one in progress; four comments, one
 *     answered;
 *   - hovedmåling 2, open, sent three days ago. § 2.2 freezes the clock at 15 October 2026,
 *     but only the browser's clock can be frozen; the server and the database run on theirs,
 *     and respond_form refuses a round that has not opened. So the open round, and the two
 *     live measures' deadlines, are built around the day the seed runs (ANCHOR), and the
 *     captures freeze the browser at 10:00 that day (qa/e2e/fixtures.ts).
 *
 * Respondent links for the captures are fixed plaintexts, `qa-lumio-<group>-<n>` (respond_form wants 16 characters or more), stored as their
 * SHA-256 like any other; they exist only here.
 *
 *   node scripts/qa/seed.mjs            # prints the SQL
 *   npm run qa:seed                     # applies it to the local stack
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const QA_ORG = 'a1000000-0000-4000-8000-000000000001'
export const QA_PASSWORD = 'qa-local-only'
export const QA_USERS = [
  { key: 'kari', name: 'Kari Nordmann', email: 'kari@lumio.example', role: 'daglig_leder', group: null, doc: 'daglig leder' },
  { key: 'hanne', name: 'Hanne Berg', email: 'hanne@lumio.example', role: 'daglig_leder', group: null, doc: 'HR' },
  { key: 'per', name: 'Per Lie', email: 'per@lumio.example', role: 'avdelingsleder', group: 'Drift', doc: 'avdelingsleder for Drift' },
  { key: 'siri', name: 'Siri Dahl', email: 'siri@lumio.example', role: 'verneombud', group: null, doc: 'verneombud' },
  { key: 'jonas', name: 'Jonas Moe', email: 'jonas@lumio.example', role: 'verneombud', group: null, doc: 'tillitsvalgt' },
]

/** [name, people, answered in hovedmåling 1, in the puls, so far in hovedmåling 2] */
export const QA_GROUPS = [
  ['Drift', 12, 10, 9, 6],
  ['Salg', 7, 6, 5, 4],
  ['Økonomi', 3, 3, 2, 1],
]

const PEOPLE = {
  Drift: ['Per Lie', 'Ola Hansen', 'Ingrid Moen', 'Ali Rahimi', 'Tone Aas', 'Erik Strand', 'Marte Vik', 'Jonas Moe', 'Lars Holm', 'Nina Berg', 'Piotr Nowak', 'Eva Lunde'],
  Salg: ['Siri Dahl', 'Mona Eide', 'Anders Lie', 'Sara Haug', 'Tore Bakke', 'Linn Myhre', 'Karl Solberg'],
  Økonomi: ['Hanne Berg', 'Rune Knutsen', 'Vera Nilsen'],
}

/** Respondent links the captures open. Each is unanswered after every seed. */
export const QA_TOKENS = {
  drift: 'qa-lumio-drift-000001', // the intro, the first question, the submit
  driftSwitch: 'qa-lumio-drift-000002', // switching language midway (P1)
  salg: 'qa-lumio-salg-000001',
  okonomi: 'qa-lumio-okonomi-00001', // the group under k
}
const TOKEN_OWNER = { 'qa-lumio-drift-000001': ['Drift', 11], 'qa-lumio-drift-000002': ['Drift', 12], 'qa-lumio-salg-000001': ['Salg', 7], 'qa-lumio-okonomi-00001': ['Økonomi', 3] }

const ROUNDS = [
  { key: 'h1', kind: 'grunnlinje', year: 2026, label: 'Hovedmåling 1 · 2026', status: 'lukket', opens: '2026-03-02 07:00+01', closes: '2026-03-13 21:00+01', col: 2 },
  { key: 'p1', kind: 'puls', year: 2026, label: 'Puls · juni 2026', status: 'lukket', opens: '2026-06-02 07:00+02', closes: '2026-06-09 21:00+02', col: 3, factors: ['mengde'] },
  // open now, whatever day the seed runs: the server's clock cannot be frozen, and a link to a
  // round that has not opened yet is refused (respond_form). ANCHOR is today in Oslo.
  { key: 'h2', kind: 'grunnlinje', year: 2027, label: 'Hovedmåling 2', status: 'apen', opensSql: "ANCHOR - interval '3 days' + interval '7 hours'", closesSql: "ANCHOR + interval '8 days' + interval '21 hours'", col: 4 },
]

/** Where each group sits per factor, as an index target; the draw scatters around it. */
const BASE = { ytring: 66, mengde: 48, motstrid: 58, kontakt: 70, emosjon: 61, leder: 64, medvirk: 57, integritet: 72, rolle: 68, kollega: 75, mening: 55 }
const OFFSET = { Drift: { mengde: -8, leder: -4 }, Salg: { mengde: 6, mening: 8 }, Økonomi: {} }
const AFTER = { p1: { mengde: 8 }, h2: { mengde: 10, mening: 3 } }

const MEASURES = [
  // [key, factor, owner, title, goal, due, completed_on, step]
  ['closed', 'mening', 'Hanne Berg', 'Fast tilbakemelding i avdelingsmøtet', 'Alle får en konkret tilbakemelding hver måned', '2026-05-15', '2026-05-12', 'lukket'],
  // due dates around the anchor, so one stays ahead and one overdue whatever day it is
  ['progress', 'mengde', 'Per Lie', 'Ukentlig prioriteringsmøte i Drift', 'Ingen skal ha mer enn to hastesaker samtidig', "ANCHOR + interval '45 days'", null, 'pagar'],
  ['overdue', 'medvirk', 'Hanne Berg', 'Medvirkning i planleggingen av høstens turnus', 'Turnusen legges fram for de ansatte før den låses', "ANCHOR - interval '25 days'", null, 'besluttet'],
]

const COMMENTS = [
  // [group, factor, ordinal, body, answered]
  ['Drift', 'mengde', 1, 'Det kommer nye hastesaker hver dag, og ingen sier hva som kan vente.', true],
  ['Drift', 'medvirk', 2, 'Vi får høre om endringer etter at de er bestemt.', false],
  ['Salg', 'mening', 1, 'Det er stille når det går bra, og mye prat når noe går galt.', false],
  ['Salg', 'mengde', 3, 'Kvartalsslutt er tøft, men det går over.', false],
]

/** today at midnight in Oslo, as a timestamptz: the day the open round is built around */
const ANCHOR = "(date_trunc('day', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo')"
const anchor = (expr) => expr.replaceAll('ANCHOR', ANCHOR)

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const id = (name) => {
  const h = createHash('md5').update(`orgpuls-qa:${name}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const org = `'${QA_ORG}'::uuid`
const u = (salt) => `(('x' || substr(md5(re.id::text || t.factor || o.ordinal::text || '${salt}'), 1, 8))::bit(32)::bigint / 4294967296.0)`

export function seedSql() {
  const employees = Object.entries(PEOPLE).flatMap(([g, names]) => names.map((n, i) => ({ g, n, rank: i + 1 })))
  const duty = { 'Per Lie': 'avdelingsleder', 'Siri Dahl': 'verneombud', 'Jonas Moe': 'tillitsvalgt' }
  const targets = ROUNDS.flatMap((r) =>
    QA_GROUPS.flatMap(([g]) =>
      (r.factors ?? Object.keys(BASE)).map((f) => {
        const t = Math.max(10, Math.min(92, BASE[f] + (OFFSET[g][f] ?? 0) + (AFTER[r.key]?.[f] ?? 0)))
        return `('${r.key}', ${q(g)}, '${f}', ${t})`
      }),
    ),
  )

  return `-- generated by scripts/qa/seed.mjs — LOCAL QA STACK ONLY, do not edit by hand
begin;

do $$ begin
  if exists (select 1 from app.organizations where org_number = '999999981' and id <> ${org}) then
    raise exception 'another organisation holds 999999981; this is not a QA database';
  end if;
end $$;

-- a rerun starts from the organisation row; cascades take rounds, responses and answers
delete from app.comment_threads where org_id = ${org};
delete from app.measures        where org_id = ${org};
delete from app.measurements    where org_id = ${org};
delete from app.employees       where org_id = ${org};
delete from app.memberships     where org_id = ${org};
delete from app.groups          where org_id = ${org};

insert into app.organizations (id, name, org_number, employee_count, threshold, law_mode, registry_nace_code, registry_nace_label, registry_employees)
values (${org}, 'Lumio AS', '999999981', ${employees.length}, 5, true, '62.010', 'Programmeringstjenester', ${employees.length})
on conflict (id) do update set name = excluded.name, org_number = excluded.org_number,
  employee_count = excluded.employee_count, threshold = excluded.threshold, law_mode = excluded.law_mode;
-- nothing leaves the QA stack: the test transport reads the outbox (§ 2.3)
update app.organizations set mail_enabled = false, sms_enabled = false where id = ${org};

insert into app.groups (id, org_id, name, sort_order) values
${QA_GROUPS.map(([g], i) => `  ('${id(`group:${g}`)}', ${org}, ${q(g)}, ${i + 1})`).join(',\n')};

insert into app.employees (id, org_id, group_id, full_name, email, phone, duty_role, created_at) values
${employees.map((e) => `  ('${id(`employee:${e.n}`)}', ${org}, '${id(`group:${e.g}`)}', ${q(e.n)}, ${q(`${e.n.toLowerCase().replace(/[^a-z]+/g, '.')}@lumio.example`)}, ${q(`+474000${String(1000 + employees.indexOf(e)).slice(-4)}`)}, ${duty[e.n] ? `'${duty[e.n]}'` : 'null'}, timestamptz '2024-01-01' + interval '${e.rank} day')`).join(',\n')};

-- five logins, with a password anyone reading this file knows: local only
${QA_USERS.map((p) => {
    const uid = id(`user:${p.key}`)
    return `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('${uid}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(p.email)},
  extensions.crypt('${QA_PASSWORD}', extensions.gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values ('${id(`identity:${p.key}`)}', '${uid}', '${uid}', 'email',
  jsonb_build_object('sub', '${uid}', 'email', ${q(p.email)}, 'email_verified', true), now(), now(), now())
on conflict do nothing;
insert into app.profiles (id, full_name, lang) values ('${uid}', ${q(p.name)}, 'no') on conflict (id) do update set full_name = excluded.full_name;
insert into app.memberships (org_id, user_id, role, active, group_id)
values (${org}, '${uid}', '${p.role}', true, ${p.group ? `'${id(`group:${p.group}`)}'` : 'null'});`
  }).join('\n')}

insert into app.measurements (id, org_id, kind, year, label) values
${ROUNDS.map((r) => `  ('${id(`measurement:${r.key}`)}', ${org}, '${r.kind}', ${r.year}, ${q(r.label)})`).join(',\n')};

insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at, frozen_at, reminder_day, close_after_days, comment_policy, allow_dialogue) values
${ROUNDS.map((r) => `  ('${id(`round:${r.key}`)}', ${org}, '${id(`measurement:${r.key}`)}', '${r.status}', ${r.opensSql ? anchor(r.opensSql) : `'${r.opens}'`}, ${r.closesSql ? anchor(r.closesSql) : `'${r.closes}'`}, ${r.status === 'lukket' ? `'${r.closes}'` : 'null'}, 3, ${r.kind === 'grunnlinje' ? 10 : 7}, 'lave', true)`).join(',\n')};

insert into app.round_factors (org_id, round_id, factor_key)
select ${org}, r.id, f.key from (values ${ROUNDS.map((r) => `('${id(`round:${r.key}`)}'::uuid, '${r.kind}', ${r.factors ? `array[${r.factors.map(q).join(',')}]` : 'null::text[]'})`).join(', ')}) as r(id, kind, keys)
join app.factors f on r.keys is null or f.key = any (r.keys);

-- invitations: everybody in the group, the first \`answered\` of them marked; a count, not a link
insert into app.invitations (org_id, round_id, employee_id, token_hash, sent_at, expires_at, responded_at)
select ${org}, r.id, e.id,
       coalesce(tk.hash, sha256(convert_to('qa.' || r.id || '.' || e.id, 'utf8'))),
       r.opens_at, r.closes_at + interval '1 day',
       case when e.rank <= c.answered then least(r.closes_at, r.opens_at + e.rank * interval '5 hours') end
from (values ${ROUNDS.flatMap((r) => QA_GROUPS.map((g) => `('${id(`round:${r.key}`)}'::uuid, '${id(`group:${g[0]}`)}'::uuid, ${g[r.col]})`)).join(', ')}) as c(round_id, group_id, answered)
join app.rounds r on r.id = c.round_id
join lateral (select em.id, row_number() over (order by em.created_at) rank from app.employees em where em.group_id = c.group_id) e on true
left join (values ${Object.entries(TOKEN_OWNER).map(([t, [g, rank]]) => `('${id(`group:${g}`)}'::uuid, ${rank}, sha256(convert_to(${q(t)}, 'utf8')))`).join(', ')}) as tk(group_id, rank, hash)
  on r.status = 'apen' and tk.group_id = c.group_id and tk.rank = e.rank;

insert into app.responses (id, org_id, round_id, group_id, submitted_hour)
select md5('qa.response.' || c.rid || '.' || c.g || '.' || i)::uuid, ${org}, c.rid, c.gid,
       date_trunc('hour', r.opens_at + (i * 7 + 2) * interval '1 hour')
from (values ${ROUNDS.flatMap((r) => QA_GROUPS.map((g) => `('${id(`round:${r.key}`)}'::uuid, ${q(g[0])}, '${id(`group:${g[0]}`)}'::uuid, ${g[r.col]})`)).join(', ')}) as c(rid, g, gid, n)
join app.rounds r on r.id = c.rid
cross join lateral generate_series(0, c.n - 1) i;

insert into app.answers (response_id, factor_key, ordinal, value)
select re.id, t.factor, o.ordinal,
       greatest(1, least(5, round(1 + (t.target + case o.ordinal when 2 then -3 when 3 then 3 else 0 end) / 25.0
         + 1.7 * (${u('a')} + ${u('b')} + ${u('c')} - 1.5))))::int
from (values ${targets.join(', ')}) as t(rk, grp, factor, target)
join app.responses re on re.round_id = (case t.rk ${ROUNDS.map((r) => `when '${r.key}' then '${id(`round:${r.key}`)}'::uuid`).join(' ')} end)
                     and re.group_id = (case t.grp ${QA_GROUPS.map(([g]) => `when ${q(g)} then '${id(`group:${g}`)}'::uuid`).join(' ')} end)
cross join (values (1), (2), (3)) o(ordinal);

insert into app.measures (id, org_id, factor_key, round_id, owner_employee_id, title, goal, due_date, completed_on, step, kind, created_at, effect_round_id)
values
${MEASURES.map(([key, f, owner, title, goal, due, done, step]) => `  ('${id(`measure:${key}`)}', ${org}, '${f}', '${id('round:h1')}', '${id(`employee:${owner}`)}', ${q(title)}, ${q(goal)}, ${due.includes('ANCHOR') ? `(${anchor(due)})::date` : `'${due}'`}, ${done ? `'${done}'` : 'null'}, '${step}', 'kollektivt', '2026-03-20 09:00+01', ${key === 'progress' ? `'${id('round:p1')}'` : 'null'})`).join(',\n')};
insert into app.measure_groups (measure_id, group_id) values ('${id('measure:progress')}', '${id('group:Drift')}');

-- four comments from hovedmåling 1, each on the lowest answer to its statement in its group
create temp table qa_thread on commit drop as
select t.*, pick.response_id from (values
${COMMENTS.map(([g, f, o, body, answered], i) => `  (${i}, ${q(g)}, '${f}', ${o}, ${q(body)}, ${answered})`).join(',\n')}
) as t(i, grp, factor, ordinal, body, answered)
cross join lateral (
  select re.id as response_id from app.responses re
  join app.answers a on a.response_id = re.id and a.factor_key = t.factor and a.ordinal = t.ordinal
  where re.round_id = '${id('round:h1')}' and re.group_id = (case t.grp ${QA_GROUPS.map(([g]) => `when ${q(g)} then '${id(`group:${g}`)}'::uuid`).join(' ')} end)
  order by a.value, re.id offset (select count(*) from (values ${COMMENTS.map(([g, f, o], i) => `(${i}, ${q(g)}, '${f}', ${o})`).join(', ')}) p(i, g, f, o) where p.i < t.i and p.g = t.grp and p.f = t.factor and p.o = t.ordinal) limit 1) pick;
insert into app.response_comments (response_id, factor_key, ordinal, body) select response_id, factor, ordinal, body from qa_thread;
insert into app.comment_threads (id, org_id, response_id, factor_key, ordinal, key_hash, state, flagged_varsel, opened_hour)
select md5('qa.thread.' || i)::uuid, ${org}, response_id, factor, ordinal,
       extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'),
       (case when answered then 'dialog' else 'venter' end)::app.thread_state, false,
       timestamptz '2026-03-10 12:00+01' + i * interval '1 hour'
from qa_thread;
insert into app.thread_messages (thread_id, author, body, sent_hour)
select md5('qa.thread.' || i)::uuid, 'leder', 'Takk for at du sa fra. Vi har startet et ukentlig prioriteringsmøte i Drift.', timestamptz '2026-03-24 10:00+01'
from qa_thread where answered;

do $$ begin
  if (select count(*) from app.comment_threads where org_id = ${org}) <> ${COMMENTS.length} then
    raise exception 'qa: a comment found no response to hang on';
  end if;
end $$;

commit;

select g.name, count(distinct e.id) employees,
  (select count(*) from app.responses re join app.rounds r on r.id = re.round_id where re.group_id = g.id and r.status = 'lukket') closed_responses
from app.groups g join app.employees e on e.group_id = g.id where g.org_id = ${org} group by g.id, g.name, g.sort_order order by g.sort_order;`
}

/**
 * Applies the seed, after proving the target is this machine: the database URL must be a
 * loopback address, and so must NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL when set.
 */
export function run() {
  const db = process.env.QA_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  const local = (s) => /^(postgres(ql)?|https?):\/\/([^@/]*@)?(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(s)
  const urls = [db, process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean)
  const bad = urls.filter((s) => !local(s))
  if (bad.length) {
    console.error('qa:seed refuses to run: not a local stack (%d non-local URL%s)', bad.length, bad.length > 1 ? 's' : '')
    process.exit(2)
  }
  const out = execFileSync('psql', [db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], { input: seedSql(), encoding: 'utf8' })
  process.stdout.write(out)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--apply')) run()
  else console.log(seedSql())
}
