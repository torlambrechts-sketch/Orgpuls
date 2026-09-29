/**
 * The weekly fold-back (X-090): every approved bokmål or English override that still stands is
 * written into messages/no.json or messages/en.json, so the files stay the source of the texts and
 * a developer sees in the repository what the site says. .github/workflows/i18n-fold.yml runs this
 * and opens a pull request with the result.
 *
 * Nothing in the database changes. Each override records the file text it replaced (0109); once the
 * pull request is merged and deployed, the file no longer says that, and every reader shows the
 * file instead (lib/i18n/override-tree.ts, supabase/functions/_shared/mail.ts). The admin marks the
 * override as «in the files».
 *
 * Reads public.message_overrides, which returns approved texts only, with the project's public anon
 * key; writes nothing but messages/. Prints the folded keys as the pull request's body (keys, not
 * texts: the diff shows those).
 *
 *   SUPABASE_ANON_KEY=… node scripts/i18n/fold-overrides.mjs            fold, and print a summary
 *   … --dry-run                                                          print what would be folded
 *
 * SUPABASE_URL defaults to the hosted project (scripts/functions/deploy.mjs names the same ref).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'jmhhszsnjfqgclxzhciq'
const url = process.env.SUPABASE_URL ?? `https://${REF}.supabase.co`
const key = process.env.SUPABASE_ANON_KEY
const dry = process.argv.includes('--dry-run')
if (!key) {
  console.error('fold: no anon key reached this job (looked for SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY and CI_SUPABASE_ANON_KEY, as secrets and variables).')
  process.exit(2)
}

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

async function approved(locale) {
  const res = await fetch(`${url}/rest/v1/rpc/message_overrides`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_locale: locale }),
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 401 || res.status === 403)
    throw new Error(`the key was refused (${res.status}): it is not the hosted project's anon key — perhaps the local stack's`)
  if (!res.ok) throw new Error(`message_overrides(${locale}) answered ${res.status}`)
  const data = await res.json()
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`message_overrides(${locale}) returned no object`)
  return Object.entries(data).flatMap(([k, v]) =>
    typeof v === 'string' ? [{ key: k, text: v, file: null }]
    : v && typeof v === 'object' && typeof v.text === 'string' ? [{ key: k, text: v.text, file: typeof v.file === 'string' ? v.file : null }]
    : [],
  )
}

/** The string at a dotted path's parent, or null where the file has no string there */
function slot(tree, path) {
  const parts = path.split('.')
  let node = tree
  for (const p of parts.slice(0, -1)) node = node && typeof node === 'object' ? node[p] : undefined
  const last = parts.at(-1)
  return node && typeof node === 'object' && typeof node[last] === 'string' ? { node, last } : null
}

const report = []
let total = 0
for (const locale of ['no', 'en']) {
  const file = `messages/${locale}.json`
  const raw = readFileSync(file, 'utf8')
  const tree = JSON.parse(raw)
  const folded = []
  const skipped = { gone: 0, superseded: 0, same: 0 }
  for (const o of await approved(locale)) {
    const s = slot(tree, o.key)
    if (!s) {
      skipped.gone++
      continue
    }
    const current = s.node[s.last]
    // the files have changed here since the override was written: they win, nothing to fold
    if (o.file && o.file !== sha(current)) {
      skipped.superseded++
      continue
    }
    if (o.text === current) {
      skipped.same++
      continue
    }
    s.node[s.last] = o.text
    folded.push(o.key)
  }
  folded.sort()
  total += folded.length
  if (!dry && folded.length) writeFileSync(file, `${JSON.stringify(tree, null, 2)}\n`)
  report.push(
    `### ${locale === 'no' ? 'Bokmål' : 'English'} (messages/${locale}.json): ${folded.length} folded`,
    ...folded.map((k) => `- \`${k}\``),
    skipped.superseded || skipped.gone ? `\n_${skipped.superseded} superseded by a later change to the file, ${skipped.gone} no longer in the file: left alone._` : '',
    '',
  )
}

console.log(
  [
    `Approved text changes from admin › Translations, folded back into messages/ (X-090). ${total} text(s).`,
    '',
    'Each override records the file text it replaced (0109). Once this is merged and deployed, the files say what the override said and every reader shows the files; the admin marks the override «In the files». Nothing in the database changes.',
    '',
    ...report,
  ].join('\n'),
)
