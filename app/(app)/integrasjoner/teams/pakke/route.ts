import { NextResponse } from 'next/server'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { getViewerRole } from '@/lib/org/read'
import { MAIN_HOST } from '@/lib/hosts'
import { TEAMS_ICON_COLOR, TEAMS_ICON_OUTLINE } from '@/lib/teams/icons'
import { teamsAppIds, teamsPackage } from '@/lib/teams/package'

/**
 * Oppsett › Integrasjoner › Teams › «Last ned app-pakken» (0176, D-203): the Teams app package
 * for this deployment, for the customer's Teams administrator to upload. Behind a sign-in (not a
 * public path), for a member of an organisation; the package holds no secret — the bot's app id is
 * in every manifest — and nothing about the organisation.
 */
export const dynamic = 'force-dynamic'

const bytes = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'))

export async function GET() {
  const role = await getViewerRole()
  if (!role) return new NextResponse(null, { status: 403 })
  const ids = teamsAppIds(process.env, MAIN_HOST)
  if (!ids) return new NextResponse(null, { status: 404 })
  const zip = teamsPackage(ids, { no: no.teamsSetup.app, en: en.teamsSetup.app }, {
    color: bytes(TEAMS_ICON_COLOR),
    outline: bytes(TEAMS_ICON_OUTLINE),
  })
  return new NextResponse(Buffer.from(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="orgpuls-teams.zip"',
      'cache-control': 'no-store',
    },
  })
}
