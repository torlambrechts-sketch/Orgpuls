import 'server-only'
import { z } from 'zod'
import { anonClient } from '@/lib/supabase/anon'
import { MEDIA_KEY, MEDIA_TYPES } from './media'

/**
 * An image from Content › Media by its exact address (0124, D-169), as the logo is served (0104):
 * anonymous, immutable for a year — a new file is a new address — and sent with nosniff and a CSP
 * that lets it be nothing but an image. Its type was read from its bytes when it was stored.
 */
const File = z.object({ mime: z.enum(MEDIA_TYPES), data: z.string() })

export async function mediaResponse(key: string): Promise<Response> {
  if (!MEDIA_KEY.test(key)) return new Response(null, { status: 404 })
  const supabase = anonClient()
  if (!supabase) return new Response(null, { status: 404 })
  const { data, error } = await supabase.rpc('cms_media_file', { p_key: key })
  const file = File.safeParse(data)
  if (error || !file.success) return new Response(null, { status: 404 })
  return new Response(Buffer.from(file.data.data, 'base64'), {
    headers: {
      'content-type': file.data.mime,
      'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  })
}
