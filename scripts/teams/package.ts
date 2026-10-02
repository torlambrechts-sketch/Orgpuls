/**
 * The Teams app package for a customer's Teams administrator (0176, D-203).
 *
 *   TEAMS_BOT_APP_ID=<guid> [TEAMS_APP_ID=<guid>] [ENTRA_CLIENT_ID=<guid>] npm run teams:package
 *
 * Writes teams-app/dist/orgpuls-teams.zip (not committed): manifest.json with this deployment's
 * ids, the Norwegian strings and the two icons. The same builder serves Oppsett › Integrasjoner ›
 * Teams › «Last ned app-pakken», so the file here and the file there are the same.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import en from '../../messages/en.json'
import no from '../../messages/no.json'
import { teamsAppIds, teamsPackage, type TeamsAppTexts } from '../../lib/teams/package'

const ids = teamsAppIds(process.env, process.env.APP_HOST ?? 'www.orgpuls.com')
if (!ids) {
  console.error('TEAMS_BOT_APP_ID is not set (the Azure Bot resource\'s Microsoft App ID); nothing written')
  process.exit(2)
}
const texts = (m: typeof no): TeamsAppTexts => m.teamsSetup.app
const zip = teamsPackage(ids, { no: texts(no), en: texts(en) }, {
  color: new Uint8Array(readFileSync('teams-app/color.png')),
  outline: new Uint8Array(readFileSync('teams-app/outline.png')),
})
mkdirSync('teams-app/dist', { recursive: true })
writeFileSync('teams-app/dist/orgpuls-teams.zip', zip)
console.log(`teams-app/dist/orgpuls-teams.zip (${zip.length} bytes): bot ${ids.botAppId}, app ${ids.appId ?? ids.botAppId}${ids.entraClientId ? `, Entra ${ids.entraClientId}` : ''}`)
