#!/usr/bin/env node
/**
 * The machine half of /audit (.claude/skills/audit/SKILL.md): what the database and the code say
 * about each other. Every finding here is a question a person or an agent must answer with
 * evidence; the script only makes sure the question is asked.
 *
 *   S*  the security posture from the catalog (sql/security.sql). S4 (anon may execute) and S5
 *       (a client may write a table directly, under RLS) are inventories: an entry not in
 *       allowlist.json is new and must be reviewed, then added with a reason.
 *   W1  a column no function or view reads and no application file names — stored for no one,
 *       or a setting that does nothing (how P0-1, P0-3 and P0-4 of the Soundings gap analysis
 *       went unnoticed).
 *   W2  a column of a settings table no database function reads: the setting's effect, if any,
 *       lives in the application alone. Confirm the application acts on it — a screen that shows
 *       the value back is not an effect (year_wheels.notify_lead_days, found by this check).
 *   R1  a public function a client may call that no application file calls: a feature without
 *       a screen, or a leftover.
 *   M   the settings matrix: every column of the settings tables, with the functions and files
 *       that read it. Not a finding: the table the promise audit walks.
 *
 *   node scripts/audit/wiring.mjs [--db postgresql://…] [--matrix] [--security-only]
 *   --security-only runs S alone: CI's gate, where a new public entry point or a table without
 *   RLS fails the build.
 *   exits 1 when there is a finding, so it can gate a scheduled run.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const DB = args.includes('--db') ? args[args.indexOf('--db') + 1] : process.env.AUDIT_DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SKILL = '.claude/skills/audit'
const allow = JSON.parse(readFileSync(join(SKILL, 'allowlist.json'), 'utf8'))

const psql = (file) =>
  execFileSync('psql', [DB, '-X', '-A', '-t', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
const query = (sql) =>
  execFileSync('psql', [DB, '-X', '-A', '-t', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))

// ---------------------------------------------------------------- the application's code, once
const ROOTS = ['app', 'lib', 'components', 'supabase/functions', 'scripts/seed']
const files = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) {
      if (!['node_modules', '.next'].includes(f)) walk(p)
    } else if (/\.(ts|tsx|mjs|js)$/.test(f) && !f.endsWith('.gen.ts')) files.push(p)
  }
}
ROOTS.forEach((r) => {
  try {
    walk(r)
  } catch {}
})
const code = files.map((f) => ({ f, src: readFileSync(f, 'utf8') }))
const inCode = (word) => code.filter((c) => new RegExp(`\\b${word}\\b`).test(c.src)).map((c) => c.f)

const findings = []
const info = []

// ---------------------------------------------------------------- S: security
for (const [check, object, detail] of psql(join(SKILL, 'sql/security.sql'))) {
  if (check.startsWith('S4')) {
    if (!allow.anon_executes[object]) findings.push(`${check}: ${object} (${detail}) — a new public entry point: review it, then add it to allowlist.json with the reason`)
  } else if (check.startsWith('S5')) {
    if (!allow.client_writes[object]) findings.push(`${check}: ${object} ${detail} — a new direct client write: review its RLS policies, then add it to allowlist.json`)
  } else findings.push(`${check}: ${object} ${detail}`.trim())
}
const nowAnon = new Set(psql(join(SKILL, 'sql/security.sql')).filter(([c]) => c.startsWith('S4')).map(([, o]) => o))
for (const o of Object.keys(allow.anon_executes)) if (!nowAnon.has(o)) info.push(`S4 allowlisted but gone: ${o} — remove it from allowlist.json`)

if (args.includes('--security-only')) {
  console.log(findings.length ? findings.map((f) => `- ${f}`).join('\n') : 'security audit: no findings')
  info.forEach((f) => console.log(`  (${f})`))
  process.exit(findings.length ? 1 : 0)
}

// ---------------------------------------------------------------- W1: stored for no one
for (const [, object, type] of psql(join(SKILL, 'sql/wiring.sql'))) {
  const column = object.split('.')[1]
  const where = inCode(column)
  if (allow.unread_columns[object]) continue
  if (!where.length) findings.push(`W1 ${object} (${type}) — no function, view or application file reads it: a setting that does nothing, or data kept for no one`)
  else info.push(`W1 ${object} read only by the application: ${where.slice(0, 4).join(', ')}${where.length > 4 ? ' …' : ''}`)
}

// ---------------------------------------------------------------- W2: a setting with no database consumer
const fnSrc = query(`select lower(translate(string_agg(p.prosrc, ' '), E'\\n\\t\\r', '   ')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('app','public')`)[0][0]
for (const [table, column] of query(
  `select table_name, column_name from information_schema.columns where table_schema = 'app' and table_name = any('{${allow.settings_tables.join(',')}}') and column_name not in ('id','org_id','created_at','updated_at') order by 1, ordinal_position`,
)) {
  const object = `${table}.${column}`
  if (allow.app_only_settings[object] || allow.unread_columns[object]) continue
  if (!new RegExp(`\\b${column}\\b`).test(fnSrc)) {
    const where = inCode(column)
    findings.push(`W2 ${object} — no database function reads this setting; it is read by ${where.length ? where.slice(0, 3).join(', ') : 'nothing'}. Show the effect it has, or it is a setting that does nothing`)
  }
}

// ---------------------------------------------------------------- R1: callable, never called
const callable = query(`
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
    and p.proname !~ '^(pg_|graphql|_)'
  group by p.proname order by 1`).map(([n]) => n)
for (const fn of callable) {
  if (allow.uncalled_rpcs[fn]) continue
  if (!code.some((c) => c.src.includes(`'${fn}'`) || c.src.includes(`"${fn}"`) || c.src.includes(`/rpc/${fn}`)))
    findings.push(`R1 public.${fn} — a client may call it and no application file does: a feature without a screen, or a leftover`)
}

// ---------------------------------------------------------------- M: the settings matrix
const SETTINGS = allow.settings_tables
const matrix = []
if (args.includes('--matrix')) {
  // one row per function: a body's newlines and tabs would split it across rows (audit AUD-24)
  const fns = query(`select p.proname, lower(translate(p.prosrc, E'\\n\\t\\r', '   ')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('app','public')`)
  for (const [table, column] of query(
    `select table_name, column_name from information_schema.columns where table_schema = 'app' and table_name = any('{${SETTINGS.join(',')}}') and column_name not in ('id','org_id','created_at','updated_at') order by 1, ordinal_position`,
  )) {
    const readers = fns.filter(([, src]) => new RegExp(`\\b${column}\\b`).test(src)).map(([n]) => n)
    matrix.push(`| ${table}.${column} | ${[...new Set(readers)].slice(0, 6).join(', ') || '—'} | ${inCode(column).slice(0, 3).join(', ') || '—'} |`)
  }
}

// ---------------------------------------------------------------- report
console.log(`# Wiring audit — ${new Date().toISOString()}\n`)
console.log(`Database: ${DB.replace(/:[^:@/]+@/, ':***@')}\n`)
console.log(`## Findings (${findings.length})\n`)
console.log(findings.length ? findings.map((f) => `- ${f}`).join('\n') : '_none_')
console.log(`\n## For the record (${info.length})\n`)
console.log(info.length ? info.map((f) => `- ${f}`).join('\n') : '_none_')
if (matrix.length) {
  console.log('\n## Settings matrix: who reads each setting\n')
  console.log('| setting | database functions | application files |\n|---|---|---|')
  console.log(matrix.join('\n'))
}
process.exit(findings.length ? 1 : 0)
