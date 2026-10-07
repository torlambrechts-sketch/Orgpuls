import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { granted, grantFor, MIME, TEMPLATE_COOKIE, TEMPLATES } from '@/lib/marketing/templates'

/**
 * A template's file (D-241), to a browser that has asked for the template: its cookie names a
 * template that holds the file. Anyone else goes to the template's page, where the form is. Only
 * names in the registry are read, so the path cannot leave private/maler.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ fil: string }> }) {
  const { fil } = await params
  const owner = TEMPLATES.find((t) => t.files.some((f) => f.name === fil))
  if (!owner) return new NextResponse(null, { status: 404 })
  const grant = grantFor(fil, granted((await cookies()).get(TEMPLATE_COOKIE)?.value))
  if (!grant) return NextResponse.redirect(new URL(`/maler/${owner.slug}#last-ned`, req.url), 303)
  const file = grant.files.find((f) => f.name === fil)!
  const body = await readFile(join(process.cwd(), 'private', 'maler', file.name))
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': MIME[file.format],
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
