import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { LOGO_KEY } from '@/lib/org/logo'

/**
 * An organisation's logo by its address (0104, D-154). Public: the survey, the round page and
 * the mails show it to people who cannot sign in, and the address is the SHA-256 of the
 * organisation and the bytes, so it cannot be guessed. Immutable for a year: a new logo is a new
 * address.
 *
 * The bytes were checked to be PNG, JPEG or WebP when they were stored; they are sent with
 * nosniff and a CSP that lets them be nothing but an image.
 */
const Logo = z.object({ mime: z.enum(['image/png', 'image/jpeg', 'image/webp']), data: z.string() })

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!LOGO_KEY.test(key)) return new Response(null, { status: 404 })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('org_logo', { p_key: key })
  const logo = Logo.safeParse(data)
  if (error || !logo.success) return new Response(null, { status: 404 })

  return new Response(Buffer.from(logo.data.data, 'base64'), {
    headers: {
      'content-type': logo.data.mime,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  })
}
