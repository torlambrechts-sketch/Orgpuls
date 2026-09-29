import { mediaResponse } from '@/lib/cms/mediaFile'

/** The same image on the admin's own host, where every address is under /admin (lib/cms/media.ts) */
export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  return mediaResponse((await params).key)
}
