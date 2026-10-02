import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { TEAMS_ICON_COLOR, TEAMS_ICON_OUTLINE } from '@/lib/teams/icons'
import { crc32, teamsAppIds, teamsLocalisation, teamsManifest, teamsPackage } from '@/lib/teams/package'

/**
 * The Teams app package (0176, D-203): a notification-only bot in personal scope, nothing else
 * asked for, the limits of manifest schema 1.30 kept, and a zip any unzip reads.
 */
const BOT = '11111111-2222-4333-8444-555555555555'
const ids = teamsAppIds({ TEAMS_BOT_APP_ID: BOT.toUpperCase() }, 'www.orgpuls.com')!

describe('the manifest', () => {
  it('is a notification-only bot in personal scope, with no calling, video, files, tabs or permissions', () => {
    const m = teamsManifest(ids, en.teamsSetup.app) as Record<string, any>
    expect(m.manifestVersion).toBe('1.30')
    expect(m.$schema).toBe('https://developer.microsoft.com/json-schemas/teams/v1.30/MicrosoftTeams.schema.json')
    expect(m.id).toBe(BOT)
    expect(m.bots).toEqual([
      { botId: BOT, scopes: ['personal'], isNotificationOnly: true, supportsFiles: false, supportsCalling: false, supportsVideo: false },
    ])
    for (const k of ['staticTabs', 'configurableTabs', 'composeExtensions', 'permissions', 'devicePermissions', 'authorization', 'webApplicationInfo']) {
      expect(m[k]).toBeUndefined()
    }
    expect(JSON.stringify(m)).not.toContain('{{')
  })

  it('keeps the schema\'s limits in both languages', () => {
    for (const t of [no.teamsSetup.app, en.teamsSetup.app]) {
      expect(t.nameShort.length).toBeLessThanOrEqual(30)
      expect(t.nameFull.length).toBeLessThanOrEqual(100)
      expect(t.descriptionShort.length).toBeLessThanOrEqual(80)
      expect(t.descriptionFull.length).toBeLessThanOrEqual(4000)
    }
    const m = teamsManifest(ids, en.teamsSetup.app) as Record<string, any>
    expect(m.developer.name.length).toBeLessThanOrEqual(32)
    expect(teamsLocalisation(no.teamsSetup.app)['name.short']).toBe('Orgpuls')
  })

  it('names the Entra app for later only when one is set, and the Teams app id apart from the bot\'s when given', () => {
    const entra = '99999999-8888-4777-8666-555555555555'
    const app = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const m = teamsManifest(teamsAppIds({ TEAMS_BOT_APP_ID: BOT, ENTRA_CLIENT_ID: entra, TEAMS_APP_ID: app }, 'www.orgpuls.com')!, en.teamsSetup.app) as Record<string, any>
    expect(m.webApplicationInfo).toEqual({ id: entra })
    expect(m.id).toBe(app)
    expect(m.bots[0].botId).toBe(BOT)
  })

  it('is not built without a bot', () => {
    expect(teamsAppIds({}, 'www.orgpuls.com')).toBeNull()
    expect(teamsAppIds({ TEAMS_BOT_APP_ID: 'not-a-guid' }, 'www.orgpuls.com')).toBeNull()
  })
})

describe('the package', () => {
  it('is a zip of the manifest, the Norwegian strings and the two icons', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const zip = teamsPackage(ids, { no: no.teamsSetup.app, en: en.teamsSetup.app }, {
      color: new Uint8Array(Buffer.from(TEAMS_ICON_COLOR, 'base64')),
      outline: new Uint8Array(Buffer.from(TEAMS_ICON_OUTLINE, 'base64')),
    })
    const buf = Buffer.from(zip)
    expect(buf.readUInt32LE(0)).toBe(0x04034b50)
    // the end of central directory: four entries
    const end = buf.length - 22
    expect(buf.readUInt32LE(end)).toBe(0x06054b50)
    expect(buf.readUInt16LE(end + 10)).toBe(4)
    // the entries, by walking the local headers
    const names: string[] = []
    let at = 0
    while (buf.readUInt32LE(at) === 0x04034b50) {
      const size = buf.readUInt32LE(at + 18)
      const nameLen = buf.readUInt16LE(at + 26)
      const name = buf.subarray(at + 30, at + 30 + nameLen).toString()
      const data = buf.subarray(at + 30 + nameLen, at + 30 + nameLen + size)
      expect(crc32(new Uint8Array(data))).toBe(buf.readUInt32LE(at + 14))
      if (name === 'manifest.json') expect(JSON.parse(data.toString()).bots[0].isNotificationOnly).toBe(true)
      if (name.endsWith('.png')) expect(data.subarray(1, 4).toString()).toBe('PNG')
      names.push(name)
      at += 30 + nameLen + size
    }
    expect(names).toEqual(['manifest.json', 'nb-no.json', 'color.png', 'outline.png'])
  })
})
