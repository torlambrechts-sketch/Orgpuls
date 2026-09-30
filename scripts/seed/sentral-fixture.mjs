/**
 * The Sentral QA fixture (docs/implementation/growth-admin.md § 4, D-181): design revision 3's
 * sample data for the admin's new views, written into the LOCAL database so that the data-driven
 * views can be diffed against the design (scripts/verify/sentral-run.mjs), not only their chrome.
 *
 * LOCAL ONLY — it never runs against a hosted project. Two guards, both must pass:
 *   1. the database URL's host is 127.0.0.1 or localhost, and its only query parameters are
 *      `sslmode` and `connect_timeout` (`assertLocalDb`) — no `host`, `hostaddr` or `service` that
 *      could send the connection elsewhere, and no `options`, which sets any setting at session
 *      start. psql is never handed the URL itself: WHATWG and libpq read a URL differently (the
 *      last '@' against the first, '#' as a fragment, ',' as a host list), so a URL can look local
 *      to one and remote to the other. `psqlConnection` builds psql's -h/-p/-U/-d from the parts
 *      that were checked, with the password in PGPASSWORD, no ~/.pgpass (PGPASSFILE=/dev/null)
 *      and no other PG* variable from the environment, so the host libpq dials is the host the
 *      guard read. A URL with '#', ',', '%', whitespace or a second '@' is refused before parsing;
 *   2. the SQL itself refuses a database that is not the QA stack: `app.environment` must be 'qa'
 *      AND the database itself must carry that setting in its catalog (pg_db_role_setting), which
 *      is what scripts/qa/up.sh's `alter database … set app.environment = 'qa'` writes. A session
 *      can set the first from the connection string; only an owner of the database the second.
 *      So the guards are independent: a URL that got past the first to a tunnelled hosted
 *      database would still meet a catalog without the QA mark.
 * It writes a super-admin with a known password (below): on a hosted project that would be a
 * back door, which is why both guards exist.
 *
 * What it writes, from the design's `loadGrowth()` and `loadData()` (Sentral_Admin.dc.html), and
 * only into tables that exist today; each later phase extends it for the tables it adds
 * (consent records, triggers, partners, magnets, registries):
 *   - the local admin, admin.local@orgpuls.test, super_admin, with its TOTP factors cleared so
 *     every sign-in enrols afresh (sentral-run.mjs reads the secret the enrolment shows);
 *   - eight companies: the Brønnøysund outreach queue's six, Bygg & Betong Sør and Vestland
 *     fylkeskommune, with the queue's organisation numbers (each fails the mod-11 check digit,
 *     so no real undertaking holds one) and the lead-scoring signals' industry and headcount;
 *   - eight contacts: the two new leads (Silje Moen, Kristian Dale) and the consent ledger's
 *     people with an e-mail address, with the lawful basis and status the ledger gives them;
 *   - the four new tasks (two callbacks with the 1-hour SLA, a phone task, a letter);
 *   - the suppression list's five hashes, one of them Anne Lied's own withdrawal.
 * Addresses keep the design's local part and name, on `.example` instead of `.no`: some of the
 * design's domains are real organisations', and a local send must never reach one.
 *
 * Idempotent: every row has an id derived from its name, and a run deletes those ids (and the
 * fixture's addresses) before writing them again, in one transaction. It is the only source of
 * these rows; nothing else writes them. It does not touch scripts/seed/design-fixture.mjs's rows.
 *
 *   node scripts/seed/sentral-fixture.mjs                      # apply to the default local DB
 *   node scripts/seed/sentral-fixture.mjs --db postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *   node scripts/seed/sentral-fixture.mjs --print              # print the SQL, apply nothing
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const DEFAULT_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export const LOCAL_HOSTS = ['127.0.0.1', 'localhost']
/** the URL parameters a local run may need; anything else could redirect or reconfigure libpq */
export const ALLOWED_PARAMS = ['sslmode', 'connect_timeout']

/**
 * The local admin sentral-run.mjs signs in as. Local and QA only (see the guards above). The
 * password is SENTRAL_ADMIN_PASSWORD when that is set (untracked), else a local default; MFA is
 * enforced either way, since every run clears the factor and enrols afresh.
 */
export const LOCAL_ADMIN = {
  id: '00000000-0000-4000-8000-00000005e0a1',
  email: 'admin.local@orgpuls.test',
  password: process.env.SENTRAL_ADMIN_PASSWORD || 'admin-local-only',
}

/**
 * The URL, parsed, when it names this machine; otherwise it throws. A URL that does not parse, a
 * scheme that is not postgres, a remote host, or a parameter that would redirect libpq is refused.
 */
export function assertLocalDb(url) {
  const raw = String(url)
  // the characters on which WHATWG and libpq disagree about where the host is
  if (/[#,%\s\\]/.test(raw) || (raw.match(/@/g) ?? []).length > 1) throw new Error('sentral-fixture: the database URL has a character libpq reads differently; refusing')
  let u
  try {
    u = new URL(raw)
  } catch {
    throw new Error('sentral-fixture: the database URL does not parse; refusing')
  }
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) throw new Error(`sentral-fixture: ${u.protocol} is not a postgres URL; refusing`)
  // a bracketed IPv6 literal or a host list is not on the allow-list either
  if (!LOCAL_HOSTS.includes(u.hostname)) throw new Error(`sentral-fixture: host «${u.hostname}» is not local; refusing`)
  for (const p of u.searchParams.keys()) {
    if (!ALLOWED_PARAMS.includes(p)) throw new Error(`sentral-fixture: the URL sets «${p}», which could connect elsewhere or reconfigure the session; refusing`)
  }
  return u
}

/** psql's environment: this process's, without a PG* variable that could override the connection */
export const psqlEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('PG')))

/** a user or database name psql takes as a name: anything with '=' or a scheme would be a conninfo */
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/

/**
 * psql's arguments and environment for a local URL, built from the parts assertLocalDb checked —
 * never the URL string, so libpq cannot read a different host out of it. The password goes in
 * PGPASSWORD and ~/.pgpass is not read.
 */
export function psqlConnection(url, env = process.env) {
  const u = assertLocalDb(url)
  const user = u.username || 'postgres'
  const db = u.pathname.replace(/^\//, '') || 'postgres'
  if (!NAME.test(user) || !NAME.test(db)) throw new Error('sentral-fixture: the user or database name is not a plain name; refusing')
  const port = u.port || '5432'
  const extra = { PGPASSFILE: '/dev/null' }
  if (u.password) extra.PGPASSWORD = u.password
  if (u.searchParams.has('sslmode')) extra.PGSSLMODE = u.searchParams.get('sslmode')
  if (u.searchParams.has('connect_timeout')) extra.PGCONNECT_TIMEOUT = u.searchParams.get('connect_timeout')
  return {
    args: ['-h', u.hostname, '-p', port, '-U', user, '-d', db, '-X', '-q', '-v', 'ON_ERROR_STOP=1'],
    env: { ...psqlEnv(env), ...extra },
  }
}

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const id = (name) => {
  const h = createHash('md5').update(`orgpuls-sentral:${name}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}
/** today in Oslo at a time, as a timestamptz: the design's «today 08:44» */
const today = (hhmm, days = 0) => `((date_trunc('day', now() at time zone 'Europe/Oslo') + interval '${days} days' + time '${hhmm}') at time zone 'Europe/Oslo')`
const osloDay = (days) => `((now() at time zone 'Europe/Oslo')::date + ${days})`

/** [key, name, org number, NACE, employees, source, stage] — the queue's six from D.brreg, the rest from D.leadSig */
export const COMPANIES = [
  ['fjellstua', 'Fjellstua Drift AS', '931204118', '56.101', 6, 'brreg', 'new'],
  ['nordfjord', 'Nordfjord Bygg AS', '925118330', '41.200', 31, 'brreg', 'new'],
  ['barnehagene', 'Barnehagene Vest AS', '919440217', '88.911', 62, 'brreg', 'engaged'],
  ['lillesand', 'Lillesand Dagligvare AS', '933018442', '47.111', 7, 'brreg', 'new'],
  ['klinikk', 'Klinikk Sør AS', '928776104', '86.230', 18, 'brreg', 'new'],
  ['tromso', 'Tromsø Elektro AS', '921555908', '43.210', 5, 'brreg', 'not_relevant'],
  ['byggbetong', 'Bygg & Betong Sør AS', null, '41.200', 34, 'manual', 'new'],
  ['vestland', 'Vestland fylkeskommune', null, '84.110', 1000, 'signup', 'trial'],
]

/**
 * The contacts, as the design's consent ledger and D.contacts describe them. `basis` and
 * `status` are what the ledger's status means today: Granted → consent (or customer under
 * § 15(3)), Withdrawn → unsubscribed, Lapsed → consent without a click in 180 days, Not given → none.
 */
export const CONTACTS = [
  { key: 'silje', name: 'Silje Moen', email: 'silje@barnehagenevest.example', company: 'barnehagene', role: 'daglig_leder', source: 'event', basis: 'consent', status: 'active', consentAt: today('08:44'), optinSentAt: today('08:41'), consentSource: 'Krav-sjekk form + double opt-in, wording v3', engaged: today('08:44') },
  { key: 'kristian', name: 'Kristian Dale', email: 'post@byggbetongsor.example', company: 'byggbetong', role: 'daglig_leder', source: 'event', basis: 'none', status: 'active', engaged: today('12:00', -1) },
  { key: 'kari', name: 'Kari Nordvik', email: 'kari.nordvik@bergen.kommune.example', source: 'newsletter', basis: 'consent', status: 'active', consentAt: "'2026-09-12 09:05+02'", optinSentAt: "'2026-09-12 09:02+02'", consentSource: 'Newsletter form + double opt-in, wording v3' },
  { key: 'per', name: 'Per Haugen', email: 'per@nordlysenergi.example', source: 'manual', basis: 'customer', status: 'active' },
  { key: 'hege', name: 'Hege Sand', email: 'hege.sand@fixture.example', source: 'event', basis: 'consent', status: 'active', consentAt: "'2026-09-22 10:00+02'", optinSentAt: "'2026-09-22 09:55+02'", consentSource: 'Template form + double opt-in, wording v3' },
  { key: 'anne', name: 'Anne Lied', email: 'anne.lied@fjordkrafthelse.example', source: 'newsletter', basis: 'consent', status: 'unsubscribed', consentAt: "'2024-03-03 10:00+01'", consentSource: 'Newsletter form + double opt-in, wording v2', updated: "'2026-09-03 10:00+02'" },
  { key: 'lise', name: 'Lise Kopperud', email: 'lise.kopperud@fixture.example', source: 'newsletter', basis: 'consent', status: 'active', consentAt: "'2024-02-02 10:00+01'", consentSource: 'Newsletter form + double opt-in, wording v1', engaged: "(now() - interval '181 days')" },
  { key: 'tomas', name: 'Tomas Rui', email: 'tomas.rui@vlfk.example', company: 'vestland', source: 'contact_form', basis: 'none', status: 'active', engaged: today('09:58') },
]

/** [key, kind, title, company, contact, due in days from today] — D.tasks 14–17 */
export const TASKS = [
  ['t14', 'call', 'Call Silje Moen — lead score 75', 'barnehagene', 'silje', 0],
  ['t15', 'call', 'Call back hand-raiser from the contact form', 'vestland', 'tomas', 0],
  ['t16', 'call', 'Phone: crossed 5 employees — verneombud duty', 'fjellstua', null, 1],
  ['t17', 'task', 'Letter with Krav-sjekk QR code', 'nordfjord', null, 2],
]

/** [address, reason, when] — D.consent.suppress for the product: reasons in the table's own words */
export const SUPPRESSIONS = [
  ['anne.lied@fjordkrafthelse.example', 'unsubscribed', "'2026-09-03 10:00+02'"],
  ['bounced@fixture.example', 'hard_bounce', "'2026-09-18 10:00+02'"],
  ['complaint@fixture.example', 'spam', "'2026-09-20 10:00+02'"],
  // «Legal 410 — removed from Brønnøysund»: the entity is gone, so its data is erased
  ['removed@fixture.example', 'erased', "'2026-09-24 10:00+02'"],
  ['request@fixture.example', 'manual', `(now() - interval '1 day')`],
]

/**
 * The SQL guard, as a PL/pgSQL condition that is true on the QA stack only: the session's setting
 * and the database's own catalog entry, which the connection string cannot write.
 */
export const QA_GUARD = `coalesce(current_setting('app.environment', true), '') = 'qa'
    and exists (select 1 from pg_catalog.pg_db_role_setting s join pg_catalog.pg_database d on d.oid = s.setdatabase
                 where d.datname = current_database() and s.setrole = 0 and 'app.environment=qa' = any(s.setconfig))`

export function fixtureSql() {
  const c = (key) => `'${id(`company:${key}`)}'::uuid`
  const p = (key) => `'${id(`contact:${key}`)}'::uuid`
  const companies = COMPANIES.map(([key, name, orgnr, nace, emp, source, stage]) =>
    `(${c(key)}, ${q(name)}, ${q(orgnr)}, ${q(nace)}, ${emp}, ${q(source)}, ${q(stage)})`).join(',\n  ')
  const contacts = CONTACTS.map((x) =>
    `(${p(x.key)}, ${q(x.email)}, ${q(x.name)}, ${x.company ? q(COMPANIES.find((k) => k[0] === x.company)[1]) : 'null'}, ${x.company ? c(x.company) : 'null'}, ${q(x.role ?? null)}, ${q(x.source)}, ${q(x.basis)}, ${q(x.status)}, ${x.consentAt ?? 'null'}, ${q(x.consentSource ?? null)}, ${x.optinSentAt ?? 'null'}, ${x.engaged ?? 'null'}, ${x.updated ?? 'now()'})`).join(',\n  ')
  const tasks = TASKS.map(([key, kind, body, company, contact, days]) =>
    `('${id(`task:${key}`)}'::uuid, ${c(company)}, ${contact ? p(contact) : 'null'}, ${q(kind)}, ${q(body)}, ${osloDay(days)})`).join(',\n  ')
  const sups = SUPPRESSIONS.map(([email, reason, at]) => `(app.crm_hash(${q(email)}), ${q(reason)}, ${at})`).join(',\n  ')
  const companyIds = COMPANIES.map(([key]) => c(key)).join(', ')
  const contactIds = CONTACTS.map((x) => p(x.key)).join(', ')
  const emails = CONTACTS.map((x) => q(x.email)).join(', ')
  const supEmails = SUPPRESSIONS.map(([email]) => `app.crm_hash(${q(email)})`).join(', ')
  const a = LOCAL_ADMIN

  return `-- scripts/seed/sentral-fixture.mjs — LOCAL QA ONLY (D-181)
\\set ON_ERROR_STOP on
begin;
do $$ begin
  if not (${QA_GUARD}) then
    raise exception 'sentral-fixture: this database is not marked as the local QA stack (npm run qa:up); refusing';
  end if;
end $$;

-- the local admin, enrolling a fresh TOTP factor at every sign-in
do $$
declare v_uid uuid := '${a.id}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(a.email)},
    crypt(${q(a.password)}, gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', '')
  on conflict (id) do update set encrypted_password = excluded.encrypted_password, email = excluded.email;
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
  values (v_uid, v_uid, v_uid::text, 'email', jsonb_build_object('sub', v_uid::text, 'email', ${q(a.email)}, 'email_verified', true), now(), now(), now())
  on conflict do nothing;
  insert into app.platform_admins (user_id, role) values (v_uid, 'super_admin')
  on conflict (user_id) do update set role = excluded.role, active = true;
  delete from auth.mfa_factors where user_id = v_uid;
end $$;

-- the fixture's own rows, removed and written again
delete from app.crm_activities where id in (${TASKS.map(([key]) => `'${id(`task:${key}`)}'::uuid`).join(', ')});
delete from app.crm_contacts where id in (${contactIds}) or (product_id = 'orgpuls' and email in (${emails}));
delete from app.crm_companies where id in (${companyIds});
delete from app.crm_suppression where email_hash in (${supEmails});

insert into app.crm_companies (id, name, org_number, nace_code, employees, source, stage) values
  ${companies};

insert into app.crm_contacts (id, email, name, company, company_id, role, source, basis, status, consent_at, consent_source, optin_sent_at, last_engaged_at, updated_at) values
  ${contacts};

insert into app.crm_activities (id, company_id, contact_id, kind, body, due_at) values
  ${tasks};

insert into app.crm_suppression (email_hash, reason, at) values
  ${sups};

commit;
`
}

/** Clears the local admin's TOTP factors, so the next sign-in enrols (sentral-run.mjs). */
export function resetAdminMfa(url) {
  const conn = psqlConnection(url)
  const sql = `do $$ begin
  if not (${QA_GUARD}) then raise exception 'not the local QA stack; refusing'; end if;
  delete from auth.mfa_factors where user_id = '${LOCAL_ADMIN.id}';
end $$;`
  execFileSync('psql', [...conn.args, '-c', sql], { env: conn.env, stdio: ['ignore', 'ignore', 'inherit'] })
}

function main(argv) {
  if (argv.includes('--print')) {
    process.stdout.write(fixtureSql())
    return
  }
  const url = argv.includes('--db') ? argv[argv.indexOf('--db') + 1] : DEFAULT_DB
  let conn
  try {
    conn = psqlConnection(url)
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  execFileSync('psql', conn.args, { input: fixtureSql(), env: conn.env, stdio: ['pipe', 'ignore', 'inherit'] })
  console.log(`sentral fixture: ${COMPANIES.length} companies, ${CONTACTS.length} contacts, ${TASKS.length} tasks, ${SUPPRESSIONS.length} suppressions, the local admin`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
