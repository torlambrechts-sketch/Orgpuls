/**
 * npm run -s modules:publish <key> <version> [--retire] > publish.sql
 *
 * Publishes a seeded draft (or retires a published version) through app.module_set_status,
 * which only moves a module forward: draft → published → retired. Published content can
 * never change afterwards (0067). Run it by hand, after sign-off, against the database it is
 * meant for; the admin app's Moduler page does the same with an audited reason.
 */
const [key, version, flag] = process.argv.slice(2)
if (!key || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key) || !version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: modules:publish <key> <version> [--retire]')
  process.exit(1)
}
const target = flag === '--retire' ? 'retired' : 'published'
console.log(`\\set ON_ERROR_STOP on\nselect app.module_set_status('${key}', '${version}', '${target}') as result;`)

export {}
