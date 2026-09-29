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
 * Reads the approved texts from the live site's /api/i18n/overrides (the same public data as
 * public.message_overrides, which the site serves with its own key), so the job needs no key in
 * GitHub; with SUPABASE_ANON_KEY set it reads the database directly instead. Writes nothing but
 * messages/. Prints the folded keys as the pull request's body (keys, not texts: the diff shows those).
 *
 *   node scripts/i18n/fold-overrides.mjs              fold, and print a summary
 *   … --dry-run                                        print what would be folded
 *
 * ORGPULS_SITE_URL defaults to https://www.orgpuls.com; SUPABASE_URL to the hosted project.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'jmhhszsnjfqgclxzhciq'
const url = process.env.SUPABASE_URL ?? `https://${REF}.supabase.co`
const key = process.env.SUPABASE_ANON_KEY || null
const site = (process.env.ORGPULS_SITE_URL ?? 'https://www.orgpuls.com').replace(/\/+$/, '')
const dry = process.argv.includes('--dry-run')

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

const rows = (data, where) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${where} returned no object`)
  return Object.entries(data).flatMap(([k, v]) =>
    typeof v === 'string' ? [{ key: k, text: v, file: null }]
    : v && typeof v === 'object' && typeof v.text === 'string' ? [{ key: k, text: v.text, file: typeof v.file === 'string' ? v.file : null }]
    : [],
  )
}

/** The approved overrides of both languages: from the site, or with a key from the database */
async function approvedAll() {
  if (!key) {
    // a push to main starts this before the deploy carrying the route is live: wait up to 15 minutes
    const until = Date.now() + Number(process.env.FOLD_WAIT_MS ?? 15 * 60_000)
    for (;;) {
      const res = await fetch(`${site}/api/i18n/overrides`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
        .catch(() => null)
      const json = res?.ok && (res.headers.get('content-type') ?? '').includes('application/json')
      if (json) {
        const data = await res.json()
        return { no: rows(data.no, 'the site (no)'), en: rows(data.en, 'the site (en)') }
      }
      if (Date.now() > until) throw new Error(`${site}/api/i18n/overrides gave no approved texts (${res ? res.status : 'unreachable'})`)
      console.error(`${site}/api/i18n/overrides: ${res ? res.status : 'unreachable'}, waiting for the deploy…`)
      await new Promise((r) => setTimeout(r, 30_000))
    }
  }
  const one = async (locale) => {
    const res = await fetch(`${url}/rest/v1/rpc/message_overrides`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_locale: locale }),
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status === 401 || res.status === 403)
      throw new Error(`the key was refused (${res.status}): it is not the hosted project's anon key — perhaps the local stack's`)
    if (!res.ok) throw new Error(`message_overrides(${locale}) answered ${res.status}`)
    return rows(await res.json(), `message_overrides(${locale})`)
  }
  return { no: await one('no'), en: await one('en') }
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
const approved = await approvedAll()
for (const locale of ['no', 'en']) {
  const file = `messages/${locale}.json`
  const raw = readFileSync(file, 'utf8')
  const tree = JSON.parse(raw)
  const folded = []
  const skipped = { gone: 0, superseded: 0, same: 0 }
  for (const o of approved[locale]) {
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
