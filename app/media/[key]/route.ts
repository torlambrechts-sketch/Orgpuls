import { mediaResponse } from '@/lib/cms/mediaFile'

/** An image a public page shows, by its address (0124, D-169) */
export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  return mediaResponse((await params).key)
}
