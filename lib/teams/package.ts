/**
 * The Orgpuls Teams app package (0176, D-203): manifest, icons, and the zip a customer's Teams
 * administrator uploads to their organisation's app catalogue (or pushes with a setup policy).
 *
 * The manifest is teams-app/manifest.json with this deployment's ids filled in: the bot's app id
 * (TEAMS_BOT_APP_ID), the Teams app's own id (TEAMS_APP_ID, else the bot's), and the Entra app id
 * of the sign-in (ENTRA_CLIENT_ID) as webApplicationInfo where one is set. Its texts come from the
 * messages (`teamsSetup.app.*`): English is the manifest's default, Norwegian a localisation file.
 *
 * One builder for the screen's download (app/(app)/integrasjoner/teams/pakke) and for
 * `npm run teams:package`, so the two can never differ. No dependency: a zip of three small files
 * is stored, not deflated, which every unzip and Teams accept.
 */
import manifestTemplate from '@/teams-app/manifest.json'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface TeamsAppTexts {
  nameShort: string
  nameFull: string
  descriptionShort: string
  descriptionFull: string
}

export interface TeamsAppIds {
  botAppId: string
  appId?: string | null
  entraClientId?: string | null
  /** the product's host, which the card's button opens */
  host: string
}

/** The ids from the environment, or null when the bot is not set up for this deployment */
export function teamsAppIds(env: Record<string, string | undefined>, host: string): TeamsAppIds | null {
  const bot = (env.TEAMS_BOT_APP_ID ?? '').trim().toLowerCase()
  if (!GUID.test(bot)) return null
  const app = (env.TEAMS_APP_ID ?? '').trim().toLowerCase()
  const entra = (env.ENTRA_CLIENT_ID ?? '').trim().toLowerCase()
  return { botAppId: bot, appId: GUID.test(app) ? app : null, entraClientId: GUID.test(entra) ? entra : null, host }
}

const fill = (v: unknown, ids: TeamsAppIds, t: TeamsAppTexts): unknown => {
  if (typeof v === 'string') {
    return v
      .replaceAll('{{TEAMS_APP_ID}}', ids.appId ?? ids.botAppId)
      .replaceAll('{{TEAMS_BOT_APP_ID}}', ids.botAppId)
      .replaceAll('{{APP_HOST}}', ids.host)
      .replaceAll('{{NAME_SHORT}}', t.nameShort)
      .replaceAll('{{NAME_FULL}}', t.nameFull)
      .replaceAll('{{DESCRIPTION_SHORT}}', t.descriptionShort)
      .replaceAll('{{DESCRIPTION_FULL}}', t.descriptionFull)
  }
  if (Array.isArray(v)) return v.map((x) => fill(x, ids, t))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, ids, t)]))
  return v
}

/** The manifest for this deployment, in English, the default language */
export function teamsManifest(ids: TeamsAppIds, en: TeamsAppTexts): Record<string, unknown> {
  const m = fill(manifestTemplate, ids, en) as Record<string, unknown>
  if (ids.entraClientId) m.webApplicationInfo = { id: ids.entraClientId }
  return m
}

/** The Norwegian strings, as a Teams localisation file */
export function teamsLocalisation(no: TeamsAppTexts): Record<string, unknown> {
  return {
    $schema: 'https://developer.microsoft.com/json-schemas/teams/v1.30/MicrosoftTeams.Localization.schema.json',
    'name.short': no.nameShort,
    'name.full': no.nameFull,
    'description.short': no.descriptionShort,
    'description.full': no.descriptionFull,
  }
}

// ---------------------------------------------------------------- the zip

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = (CRC[(c ^ b) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A zip of the given files, stored (method 0), at the root of the archive */
export function zipStored(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  // 1 January 2026, 00:00: a fixed time, so the same files make the same package
  const dosTime = 0
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // names in UTF-8
    local.setUint16(8, 0, true)
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, f.data)
    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint16(8, 0x0800, true)
    dir.setUint16(10, 0, true)
    dir.setUint16(12, dosTime, true)
    dir.setUint16(14, dosDate, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, f.data.length, true)
    dir.setUint32(24, f.data.length, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const size = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** The package: manifest.json, the Norwegian strings and the two icons */
export function teamsPackage(
  ids: TeamsAppIds,
  texts: { no: TeamsAppTexts; en: TeamsAppTexts },
  icons: { color: Uint8Array; outline: Uint8Array },
): Uint8Array {
  const json = (o: unknown) => new TextEncoder().encode(`${JSON.stringify(o, null, 2)}\n`)
  return zipStored([
    { name: 'manifest.json', data: json(teamsManifest(ids, texts.en)) },
    { name: 'nb-no.json', data: json(teamsLocalisation(texts.no)) },
    { name: 'color.png', data: icons.color },
    { name: 'outline.png', data: icons.outline },
  ])
}
