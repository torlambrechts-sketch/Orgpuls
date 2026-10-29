/**
 * Applies committed migrations to the hosted project through the Management API — the API the Supabase
 * MCP's apply_migration wraps — each file verbatim and named after it (CLAUDE.md, deployment playbook).
 * Run by .github/workflows/migrate.yml with the repository's SUPABASE_ACCESS_TOKEN, when a session has
 * no working token of its own.
 *
 *   node scripts/db/apply-hosted.mjs 0235_german_platform_language 0236_market_de   apply, in this order
 *   node scripts/db/apply-hosted.mjs --list                                          what the project has
 *   CHECK_SQL='select …' node scripts/db/apply-hosted.mjs --check                   one SELECT, printed
 *   node scripts/db/apply-hosted.mjs --data registry.sql                             data rows, no DDL
 *
 * Refuses a name that is not a file in supabase/migrations, or one the project already lists; stops at
 * the first failure and prints the API's answer; runs only a SELECT for --check; for --data (a module's
 * registry rows from scripts/modules/registry.ts, a translation package through
 * app.op_translations_import) refuses a file that defines or drops anything; prints no secret.
 */
import { existsSync, readFileSync } from 'node:fs'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'jmhhszsnjfqgclxzhciq'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SB_MCP_PAT
const API = `https://api.supabase.com/v1/projects/${REF}`
const NAME = /^\d{4}_[a-z0-9_]+$/

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN (or SB_MCP_PAT) is not set; nothing done')
  process.exit(2)
}

async function call(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body)
    throw new Error(`${init.method ?? 'GET'} ${path}: HTTP ${res.status} ${detail.slice(0, 1000)}`)
  }
  return body
}

/** the project's migrations, as [{version, name}], oldest first */
async function list() {
  const body = await call('/database/migrations')
  const rows = Array.isArray(body) ? body : (body.migrations ?? [])
  return rows.map((m) => ({ version: String(m.version ?? ''), name: m.name ?? '' }))
}

const printList = (rows, tail = 8) => {
  console.log(`hosted migrations: ${rows.length}`)
  for (const m of rows.slice(-tail)) console.log(`  ${m.version} ${m.name}`)
}

const args = process.argv.slice(2)

if (args.includes('--list')) {
  printList(await list(), 12)
  process.exit(0)
}

if (args.includes('--check')) {
  const sql = (process.env.CHECK_SQL ?? '').trim()
  if (!/^(select|with)\b/i.test(sql) || /;\s*\S/.test(sql)) {
    console.error('--check runs one SELECT (or WITH … SELECT) and nothing else')
    process.exit(2)
  }
  const body = await call('/database/query', { method: 'POST', body: JSON.stringify({ query: sql }) })
  const rows = Array.isArray(body) ? body : (body.rows ?? body)
  console.log('check:')
  for (const r of Array.isArray(rows) ? rows : [rows]) console.log(`  ${typeof r === 'object' ? Object.values(r).join(' | ') : String(r)}`)
  process.exit(0)
}

if (args.includes('--data')) {
  const file = args[args.indexOf('--data') + 1]
  if (!file || !existsSync(file)) {
    console.error('--data needs a file of SQL')
    process.exit(2)
  }
  const sql = readFileSync(file, 'utf8')
  // data only: no definition or removal of anything, judged with the string literals blanked out
  const bare = sql.replace(/\$([a-z]*)\$[\s\S]*?\$\1\$/g, "''").replace(/'(?:[^']|'')*'/g, "''")
  if (/\b(create|alter|drop|grant|revoke|truncate|comment)\b/i.test(bare)) {
    console.error(`${file}: defines, alters or drops something; --data is for rows only`)
    process.exit(2)
  }
  const body = await call('/database/query', { method: 'POST', body: JSON.stringify({ query: sql }) })
  const rows = Array.isArray(body) ? body : (body.rows ?? body)
  console.log(`data: ${file} (${sql.length} characters) ran; the API answered:`)
  for (const r of (Array.isArray(rows) ? rows : [rows]).slice(0, 20)) console.log(`  ${typeof r === 'object' ? JSON.stringify(r).slice(0, 600) : String(r)}`)
  process.exit(0)
}

const names = args.filter((a) => !a.startsWith('--'))
if (!names.length) {
  console.error('nothing to apply: name the migrations, in order')
  process.exit(2)
}
for (const name of names) {
  if (!NAME.test(name)) throw new Error(`${name}: not a migration name (NNNN_snake_case)`)
  if (!existsSync(`supabase/migrations/${name}.sql`)) throw new Error(`${name}: no such file in supabase/migrations`)
}

const before = await list()
printList(before)
const applied = (name) => before.some((m) => m.name === name || (m.version === name.slice(0, 4) && !/^\d{14}$/.test(m.version)))
for (const name of names) {
  if (applied(name)) throw new Error(`${name}: the project already lists it; nothing applied from here on`)
}

for (const name of names) {
  const query = readFileSync(`supabase/migrations/${name}.sql`, 'utf8')
  process.stdout.write(`applying ${name} (${query.length} characters) … `)
  await call('/database/migrations', { method: 'POST', body: JSON.stringify({ name, query }) })
  console.log('ok')
}

const after = await list()
printList(after)
const missing = names.filter((n) => !after.some((m) => m.name === n))
if (missing.length) {
  console.error(`applied, but the project's list does not name: ${missing.join(', ')}`)
  process.exit(1)
}
console.log(`applied ${names.length} migration(s): ${names.join(', ')}`)
