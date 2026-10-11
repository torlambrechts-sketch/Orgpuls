/**
 * IndexNow (D-234): tells Bing – and the other engines that share IndexNow (Yandex, Seznam, Naver) –
 * that the public site's pages exist or have changed, so a new article is crawled within hours instead
 * of whenever the crawler next comes by. Google does not take part; it reads the sitemap.
 *
 * It reads each host's own sitemap (www.orgpuls.com, Norway's; www.empvibe.com, Empvibe's: app/sitemap.ts;
 * en.orgpuls.com moved at UK-G, D-275) and submits its
 * URLs under that host, with the key the site serves at /<key>.txt (public/, a public value by design:
 * the engines fetch it to check that the submission came from the site's owner).
 *
 *   node scripts/seo/indexnow.mjs           submit every URL in both sitemaps
 *   node scripts/seo/indexnow.mjs --dry     list what would be submitted, send nothing
 *
 * Run it after a deploy that adds or changes public pages.
 */
import { readdirSync } from 'node:fs'

const HOSTS = ['www.orgpuls.com', 'www.empvibe.com']
const ENDPOINT = 'https://api.indexnow.org/indexnow'
const dry = process.argv.includes('--dry')

const keyFile = readdirSync('public').find((f) => /^[0-9a-f]{32}\.txt$/.test(f))
if (!keyFile) throw new Error('No IndexNow key in public/ (a file named <32 hex>.txt)')
const key = keyFile.slice(0, -4)

let failed = false
for (const host of HOSTS) {
  const res = await fetch(`https://${host}/sitemap.xml`)
  if (!res.ok) throw new Error(`${host}/sitemap.xml: ${res.status}`)
  const urls = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => new URL(u).host === host)
  console.log(`${host}: ${urls.length} URLs`)
  if (dry || urls.length === 0) continue

  const check = await fetch(`https://${host}/${keyFile}`)
  if (!check.ok || (await check.text()).trim() !== key) {
    console.error(`  the key is not served at https://${host}/${keyFile} yet – deploy first`)
    failed = true
    continue
  }
  const post = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `https://${host}/${keyFile}`, urlList: urls }),
  })
  // 200 accepted, 202 accepted and the key is still being checked; anything else is a refusal
  console.log(`  IndexNow: ${post.status} ${post.status === 200 || post.status === 202 ? 'accepted' : await post.text()}`)
  if (post.status !== 200 && post.status !== 202) failed = true
}
process.exit(failed ? 1 : 0)
